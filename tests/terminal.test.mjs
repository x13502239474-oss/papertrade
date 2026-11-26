import test from 'node:test';
import assert from 'node:assert/strict';

import { APP_CONFIG } from '../js/config.js';
import { getUSMarketCalendar, getUSMarketStatus } from '../js/marketHours.js';
import {
  getAllInstruments,
  findNonTradableMatches,
  isNonTradableSymbol,
  registerInstrument,
  searchLocalInstruments
} from '../js/catalog.js';
import { MarketDataService } from '../js/marketData.js';
import {
  createInitialAccount,
  loadAccountState,
  saveAccountState,
  validateQuantity,
  computePortfolioSummary
} from '../js/account.js';
import {
  previewOrder,
  submitOrder,
  evaluatePendingLimitOrders,
  cancelPendingOrder,
  filterOrders
} from '../js/orders.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

test('Market Hours & US Holiday Calendar: accurately detects Thanksgiving, Black Friday early close, Good Friday, pre/regular/after-hours', () => {
  const cal2026 = getUSMarketCalendar(2026);
  assert.equal(cal2026.holidays.has('2026-11-26'), true, '2026-11-26 is Thanksgiving');
  assert.equal(cal2026.holidays.has('2026-04-03'), true, '2026-04-03 is Good Friday');
  assert.equal(cal2026.holidays.has('2026-07-03'), true, '2026-07-04 Sat observed on Friday 2026-07-03');
  assert.equal(cal2026.earlyCloses.has('2026-11-27'), true, '2026-11-27 is Black Friday 13:00 ET early close');

  // 2026-11-26 10:30 ET (15:30 UTC) -> Thursday, must be Holiday NOT regular open!
  const thanksgivingMidday = getUSMarketStatus(new Date('2026-11-26T15:30:00Z'));
  assert.equal(thanksgivingMidday.session, 'holiday');
  assert.equal(thanksgivingMidday.isRegularOpen, false);
  assert.match(thanksgivingMidday.labelZh, /感恩节/);

  // 2026-11-27 14:00 ET (19:00 UTC) -> Black Friday after 13:00 ET early close -> After-Hours!
  const blackFriday2pm = getUSMarketStatus(new Date('2026-11-27T19:00:00Z'));
  assert.equal(blackFriday2pm.session, 'after-hours');
  assert.equal(blackFriday2pm.isRegularOpen, false);

  // Regular Wednesday 2026-11-25: Pre-market (08:00 ET = 13:00 UTC), Regular (10:00 ET = 15:00 UTC), After-hours (17:00 ET = 22:00 UTC)
  assert.equal(getUSMarketStatus(new Date('2026-11-25T13:00:00Z')).session, 'pre-market');
  assert.equal(getUSMarketStatus(new Date('2026-11-25T15:00:00Z')).session, 'regular');
  assert.equal(getUSMarketStatus(new Date('2026-11-25T22:00:00Z')).session, 'after-hours');
  assert.equal(getUSMarketStatus(new Date('2026-11-28T15:00:00Z')).session, 'weekend');

  // Live API override: unexpected closure during regular hours
  const halted = getUSMarketStatus(new Date('2026-11-25T15:00:00Z'), { is_market_open: false });
  assert.equal(halted.session, 'closed');
  assert.equal(halted.isRegularOpen, false);
});

test('Anthropic & Non-Tradable Guard: never tradable, never registered as stock, shows official company link', () => {
  assert.equal(getAllInstruments().length >= 75, true, 'Has rich US stock/ETF/ADR universe');
  assert.equal(isNonTradableSymbol('Anthropic'), true);
  assert.equal(isNonTradableSymbol('claude'), true);
  assert.equal(isNonTradableSymbol('TWTR'), true);

  const matches = findNonTradableMatches('Anthropic');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, 'private');
  assert.match(matches[0].badge, /非上市公司/);
  assert.equal(matches[0].officialUrl, 'https://www.anthropic.com/company');

  // Cannot appear in tradable local search or be registered dynamically
  assert.equal(searchLocalInstruments('Anthropic').length, 0);
  assert.equal(registerInstrument({ symbol: 'ANTHROPIC', name: 'Fake' }), null);

  // Order submission strictly blocks Anthropic
  const state = createInitialAccount();
  const res = submitOrder(state, {
    symbol: 'ANTHROPIC',
    side: 'buy',
    type: 'market',
    qty: 1,
    quote: { price: 100 },
    isQuoteFresh: true
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /非上市公司/);
});

test('MarketDataService: handles no key, Authorization header (not URL), invalid key, rate limit, caching, and staleness', async () => {
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  const seenRequests = [];

  const mockFetch = async (url, opts) => {
    seenRequests.push({ url, headers: opts.headers });
    if (opts.headers.Authorization === 'apikey BAD_KEY') {
      return {
        ok: false,
        status: 401,
        json: async () => ({ status: 'error', code: 401, message: 'apikey is incorrect or not specified' })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchange: 'NASDAQ',
        currency: 'USD',
        open: '228.10',
        high: '231.50',
        low: '227.80',
        close: '230.00',
        previous_close: '227.00',
        change: '3.00',
        percent_change: '1.32158',
        volume: '41234500',
        datetime: '2026-11-25',
        is_market_open: false
      })
    };
  };

  const svc = new MarketDataService({ fetchImpl: mockFetch, session, local });
  assert.equal(svc.isConfigured(), false);
  await assert.rejects(() => svc.fetchQuote('AAPL'), (err) => err.code === 'NO_CONNECTION');

  // Invalid key
  svc.configure({ mode: 'byok', apiKey: 'BAD_KEY', planTier: 'free' });
  await assert.rejects(() => svc.fetchQuote('AAPL'), (err) => err.code === 'INVALID_KEY');
  assert.equal(seenRequests[0].url.includes('BAD_KEY'), false, 'API key must NEVER be in URL');

  // Valid key + caching
  svc.configure({ mode: 'byok', apiKey: 'TEST_SESSION_KEY_DO_NOT_LOG', planTier: 'free' });
  const q1 = await svc.fetchQuote('AAPL');
  assert.equal(q1.price, 230);
  assert.equal(q1.exchange, 'NASDAQ');
  assert.equal(svc.isQuoteFresh('AAPL'), true);

  const reqCountBeforeCache = seenRequests.length;
  const q2 = await svc.fetchQuote('AAPL'); // Must hit 60s cache
  assert.equal(q2.price, 230);
  assert.equal(seenRequests.length, reqCountBeforeCache);

  // Stale check after 16 minutes
  const sixteenMinLater = q1._received + 16 * 60 * 1000;
  assert.equal(svc.isQuoteFresh('AAPL', sixteenMinLater), false);
});

test('Trading Engine: market buy/sell with 0.05% slippage, fractional validation, insufficient cash/shares, limit freeze/fill/cancel, stale guard, and key-clear safety', () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  let state = createInitialAccount();
  const now = 1_700_000_000_000;
  const freshQuote = { symbol: 'NVDA', price: 100, datetime: '2026-11-25', _received: now };

  // 1. Invalid fractional precision rejected
  assert.equal(validateQuantity('1.12345').valid, false);
  assert.equal(validateQuantity('0').valid, false);
  assert.equal(validateQuantity('-2').valid, false);
  assert.equal(validateQuantity('0.25').valid, true);

  // 2. Stale quote blocks market buy
  const staleRes = submitOrder(state, {
    symbol: 'NVDA',
    side: 'buy',
    type: 'market',
    qty: 10,
    quote: freshQuote,
    isQuoteFresh: false,
    now
  });
  assert.equal(staleRes.ok, false);
  assert.match(staleRes.error, /已过期/);

  // 3. Market buy 100 shares @ $100 -> fillPrice = $100.05 (0.05% slippage), cost = $10,005.00
  const buyRes = submitOrder(state, {
    symbol: 'NVDA',
    side: 'buy',
    type: 'market',
    qty: 100,
    quote: freshQuote,
    isQuoteFresh: true,
    now
  });
  assert.equal(buyRes.ok, true);
  assert.equal(buyRes.status, 'filled');
  assert.equal(buyRes.fillPrice, 100.05);
  assert.equal(state.cash, 89995);
  assert.equal(state.positions.NVDA.qty, 100);
  assert.equal(state.positions.NVDA.avgCost, 100.05);

  // 4. Insufficient cash market buy -> recorded as rejected order
  const overBuy = submitOrder(state, {
    symbol: 'NVDA',
    side: 'buy',
    type: 'market',
    qty: 5000,
    quote: freshQuote,
    isQuoteFresh: true,
    now
  });
  assert.equal(overBuy.ok, false);
  assert.equal(overBuy.status, 'rejected');
  assert.equal( filterOrders(state.orders, { status: 'rejected' }).length, 1);

  // 5. Pending limit buy freezes cash; pending limit sell freezes shares
  const limBuy = submitOrder(state, {
    symbol: 'AAPL',
    side: 'buy',
    type: 'limit',
    qty: 50,
    limitPrice: 200, // freezes $10,000
    quote: { symbol: 'AAPL', price: 210, datetime: '2026-11-25' },
    isQuoteFresh: true,
    now
  });
  assert.equal(limBuy.ok, true);
  assert.equal(limBuy.status, 'pending');

  const limSell = submitOrder(state, {
    symbol: 'NVDA',
    side: 'sell',
    type: 'limit',
    qty: 40,
    limitPrice: 120, // freezes 40 shares of NVDA
    quote: freshQuote,
    isQuoteFresh: true,
    now
  });
  assert.equal(limSell.ok, true);
  assert.equal(limSell.status, 'pending');

  const summaryPending = computePortfolioSummary(state, {
    NVDA: { price: 110 },
    AAPL: { price: 210 }
  });
  assert.equal(summaryPending.frozenCash, 10000);
  assert.equal(summaryPending.availableCash, 79995);
  assert.equal(summaryPending.holdings[0].frozenQty, 40);
  assert.equal(summaryPending.holdings[0].sellableQty, 60);

  // Trying to sell 70 shares when only 60 are sellable -> rejected
  const overSell = submitOrder(state, {
    symbol: 'NVDA',
    side: 'sell',
    type: 'market',
    qty: 70,
    quote: { symbol: 'NVDA', price: 110, datetime: '2026-11-25' },
    isQuoteFresh: true,
    now
  });
  assert.equal(overSell.ok, false);
  assert.equal(overSell.status, 'rejected');

  // 6. Stale quote MUST NOT trigger pending limit order!
  const staleTrigger = evaluatePendingLimitOrders(
    state,
    { AAPL: { price: 195, datetime: '2026-11-25' } },
    () => false, // stale!
    now + 1000
  );
  assert.equal(staleTrigger.length, 0);
  assert.equal(limBuy.order.status, 'pending');

  // 7. Fresh quote triggers pending limit buy at favorable price ($198 <= $200)
  const freshTrigger = evaluatePendingLimitOrders(
    state,
    { AAPL: { price: 198, datetime: '2026-11-25 15:59:00' } },
    () => true,
    now + 2000
  );
  assert.equal(freshTrigger.length, 1);
  assert.equal(limBuy.order.status, 'filled');
  assert.equal(limBuy.order.fillPrice, 198);
  assert.equal(state.positions.AAPL.qty, 50);

  // 8. Cancel pending limit sell -> releases frozen shares back to 100 sellable
  const cancelRes = cancelPendingOrder(state, limSell.order.id, now + 3000);
  assert.equal(cancelRes.ok, true);
  assert.equal(limSell.order.status, 'cancelled');

  // 9. Market sell 50 NVDA @ $110 -> fillPrice = 110 * 0.9995 = $109.945, realized PnL > 0
  const sellRes = submitOrder(state, {
    symbol: 'NVDA',
    side: 'sell',
    type: 'market',
    qty: 50,
    quote: { symbol: 'NVDA', price: 110, datetime: '2026-11-25' },
    isQuoteFresh: true,
    now: now + 4000
  });
  assert.equal(sellRes.ok, true);
  assert.equal(state.positions.NVDA.qty, 50);
  assert.equal(state.realizedPnl > 490, true);

  // 10. Persist to localStorage, clear market connection, reload account -> account state 100% preserved
  saveAccountState(state, local);
  const svc = new MarketDataService({ fetchImpl: async () => ({}), session, local });
  svc.configure({ mode: 'byok', apiKey: 'TEMP_KEY' });
  svc.clearConnection();

  const reloaded = loadAccountState(local);
  assert.equal(reloaded.cash, state.cash);
  assert.equal(reloaded.positions.NVDA.qty, 50);
  assert.equal(reloaded.positions.AAPL.qty, 50);
  assert.equal(reloaded.orders.length, state.orders.length);
  assert.equal(reloaded.trades.length, state.trades.length);
});

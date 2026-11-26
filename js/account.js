import { APP_CONFIG } from './config.js';

export function roundQty(n) {
  const factor = 10 ** APP_CONFIG.maxQtyDecimals;
  return Math.round(Number(n) * factor) / factor;
}

export function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function createInitialAccount(preserveWatchlist = null) {
  return {
    version: 2,
    initialCash: APP_CONFIG.initialCash,
    cash: APP_CONFIG.initialCash,
    realizedPnl: 0,
    positions: {}, // { [symbol]: { qty, avgCost } }
    watchlist: Array.isArray(preserveWatchlist) && preserveWatchlist.length > 0
      ? [...new Set(preserveWatchlist)]
      : ['AAPL', 'NVDA', 'MSFT', 'SPY', 'QQQ', 'TSLA'],
    orders: [], // 全部委托记录（含市价单、限价单及其完整状态流转）
    trades: [] // 全部已成交记录
  };
}

export function migrateAccountState(raw) {
  const base = createInitialAccount();
  if (!raw || typeof raw !== 'object' || typeof raw.cash !== 'number' || !Number.isFinite(raw.cash)) {
    return base;
  }

  const positions = {};
  if (raw.positions && typeof raw.positions === 'object') {
    for (const [sym, pos] of Object.entries(raw.positions)) {
      const cleanSym = String(sym || '').toUpperCase().trim();
      if (cleanSym && pos && Number.isFinite(Number(pos.qty)) && Number(pos.qty) >= APP_CONFIG.minQty / 2) {
        positions[cleanSym] = {
          qty: roundQty(Number(pos.qty)),
          avgCost: Number.isFinite(Number(pos.avgCost)) && Number(pos.avgCost) >= 0 ? Number(pos.avgCost) : 0
        };
      }
    }
  }

  const watchlist = Array.isArray(raw.watchlist)
    ? [...new Set(raw.watchlist.map((s) => String(s || '').toUpperCase().trim()).filter(Boolean))]
    : base.watchlist;

  const orders = Array.isArray(raw.orders)
    ? raw.orders.map((o, idx) => ({
        id: o.id || `ORD-LEGACY-${idx}-${o.time || Date.now()}`,
        symbol: String(o.symbol || '').toUpperCase().trim(),
        side: o.side === 'sell' ? 'sell' : 'buy',
        type: o.type === 'limit' ? 'limit' : 'market',
        qty: roundQty(Number(o.qty) || 0),
        limitPrice: o.limitPrice !== null && o.limitPrice !== undefined ? Number(o.limitPrice) : null,
        fillPrice: o.fillPrice !== null && o.fillPrice !== undefined ? Number(o.fillPrice) : null,
        slippage: Number(o.slippage) || 0,
        commission: Number(o.commission) || 0,
        realizedPnl: Number.isFinite(Number(o.realizedPnl)) ? Number(o.realizedPnl) : null,
        status: o.status || 'filled',
        rejectReason: o.rejectReason || o.note || null,
        quoteTimestamp: o.quoteTimestamp || null,
        time: Number(o.time) || Date.now(),
        updatedAt: Number(o.updatedAt || o.time) || Date.now(),
        filledAt: o.filledAt || (o.status === 'filled' ? Number(o.time) || Date.now() : null)
      }))
    : [];

  const trades = Array.isArray(raw.trades)
    ? raw.trades.map((t, idx) => ({
        id: t.id || `TRD-LEGACY-${idx}-${t.time || Date.now()}`,
        orderId: t.orderId || null,
        symbol: String(t.symbol || '').toUpperCase().trim(),
        side: t.side === 'sell' ? 'sell' : 'buy',
        type: t.type === 'limit' ? 'limit' : 'market',
        qty: roundQty(Number(t.qty) || 0),
        price: Number(t.price) || 0,
        gross: Number(t.gross) || (Number(t.qty) || 0) * (Number(t.price) || 0),
        slippage: Number(t.slippage) || 0,
        commission: Number(t.commission) || 0,
        realizedPnl: Number.isFinite(Number(t.realizedPnl)) ? Number(t.realizedPnl) : null,
        quoteTimestamp: t.quoteTimestamp || null,
        time: Number(t.time) || Date.now()
      }))
    : [];

  return {
    version: 2,
    initialCash: Number.isFinite(Number(raw.initialCash)) && Number(raw.initialCash) > 0 ? Number(raw.initialCash) : APP_CONFIG.initialCash,
    cash: roundMoney(Number(raw.cash)),
    realizedPnl: Number.isFinite(Number(raw.realizedPnl)) ? roundMoney(Number(raw.realizedPnl)) : 0,
    positions,
    watchlist,
    orders,
    trades
  };
}

export function loadAccountState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(APP_CONFIG.storageKeys.account);
    if (!raw) return createInitialAccount();
    return migrateAccountState(JSON.parse(raw));
  } catch {
    return createInitialAccount();
  }
}

export function saveAccountState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(APP_CONFIG.storageKeys.account, JSON.stringify(state));
  } catch {
    // ignore storage quota exceeded
  }
}

export function validateQuantity(rawInput) {
  if (rawInput === '' || rawInput === null || rawInput === undefined) {
    return { valid: false, error: '请输入委托数量' };
  }
  const str = String(rawInput).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return { valid: false, error: '数量格式无效，请输入大于 0 的数字（最多 4 位小数）' };
  }
  const parts = str.split('.');
  if (parts[1] && parts[1].length > APP_CONFIG.maxQtyDecimals) {
    return { valid: false, error: `小数股精度超限：最多支持 ${APP_CONFIG.maxQtyDecimals} 位小数（最小 ${APP_CONFIG.minQty} 股）` };
  }
  const qty = Number(str);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { valid: false, error: '委托数量必须大于 0' };
  }
  if (qty < APP_CONFIG.minQty) {
    return { valid: false, error: `最小委托数量为 ${APP_CONFIG.minQty} 股` };
  }
  return { valid: true, qty: roundQty(qty) };
}

export function validateLimitPrice(rawInput) {
  if (rawInput === '' || rawInput === null || rawInput === undefined) {
    return { valid: false, error: '请输入限价价格' };
  }
  const str = String(rawInput).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return { valid: false, error: '限价格式无效，请输入大于 0 的美元价格' };
  }
  const parts = str.split('.');
  if (parts[1] && parts[1].length > APP_CONFIG.maxPriceDecimals) {
    return { valid: false, error: `限价最多支持 ${APP_CONFIG.maxPriceDecimals} 位小数` };
  }
  const price = Number(str);
  if (!Number.isFinite(price) || price <= 0) {
    return { valid: false, error: '限价必须大于 $0.00' };
  }
  return { valid: true, price };
}

export function getFrozenCash(state, exceptOrderId = null) {
  const total = state.orders
    .filter((o) => o.status === 'pending' && o.side === 'buy' && o.id !== exceptOrderId)
    .reduce((sum, o) => sum + o.qty * o.limitPrice + (o.commission || APP_CONFIG.commissionPerOrder), 0);
  return roundMoney(total);
}

export function getPendingBuyCount(state) {
  return state.orders.filter((o) => o.status === 'pending' && o.side === 'buy').length;
}

export function getAvailableCash(state, exceptOrderId = null) {
  return Math.max(0, roundMoney(state.cash - getFrozenCash(state, exceptOrderId)));
}

export function getFrozenShares(state, symbol, exceptOrderId = null) {
  const sym = String(symbol || '').toUpperCase().trim();
  const total = state.orders
    .filter((o) => o.status === 'pending' && o.side === 'sell' && o.symbol === sym && o.id !== exceptOrderId)
    .reduce((sum, o) => sum + o.qty, 0);
  return roundQty(total);
}

export function getSellableShares(state, symbol, exceptOrderId = null) {
  const sym = String(symbol || '').toUpperCase().trim();
  const held = state.positions[sym]?.qty || 0;
  return Math.max(0, roundQty(held - getFrozenShares(state, sym, exceptOrderId)));
}

export function computePortfolioSummary(state, quotesMap = {}) {
  const entries = Object.entries(state.positions).filter(([, p]) => p && p.qty >= APP_CONFIG.minQty / 2);
  let marketValue = 0;
  let totalCostBasis = 0;
  let missingQuotes = false;

  const holdings = entries.map(([symbol, pos]) => {
    const quote = quotesMap[symbol] || null;
    const price = quote && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
    const costBasis = pos.qty * pos.avgCost;
    totalCostBasis += costBasis;
    const frozenQty = getFrozenShares(state, symbol);
    const sellableQty = getSellableShares(state, symbol);

    if (price === null) {
      missingQuotes = true;
      return {
        symbol,
        qty: pos.qty,
        frozenQty,
        sellableQty,
        avgCost: pos.avgCost,
        costBasis,
        price: null,
        marketValue: null,
        unrealizedPnl: null,
        unrealizedPnlPct: null
      };
    }

    const mv = pos.qty * price;
    marketValue += mv;
    const unrealizedPnl = mv - costBasis;
    const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

    return {
      symbol,
      qty: pos.qty,
      frozenQty,
      sellableQty,
      avgCost: pos.avgCost,
      costBasis,
      price,
      marketValue: mv,
      unrealizedPnl,
      unrealizedPnlPct
    };
  });

  const frozenCash = getFrozenCash(state);
  const availableCash = getAvailableCash(state);
  const pendingBuyOrders = getPendingBuyCount(state);

  // 当存在持仓但缺少该股票实时/缓存报价时，绝不用 0 或成本价冒充市值
  const resolvedMarketValue = entries.length === 0 ? 0 : missingQuotes ? null : marketValue;
  const totalEquity = resolvedMarketValue === null ? null : state.cash + resolvedMarketValue;
  const unrealizedPnl = entries.length === 0 ? 0 : missingQuotes ? null : marketValue - totalCostBasis;
  const unrealizedPnlPct =
    entries.length === 0 ? 0 : missingQuotes || totalCostBasis <= 0 ? null : ((marketValue - totalCostBasis) / totalCostBasis) * 100;
  const totalPnl = totalEquity === null ? null : totalEquity - state.initialCash;
  const totalReturnPct = totalPnl === null ? null : (totalPnl / state.initialCash) * 100;

  return {
    initialCash: state.initialCash,
    cash: state.cash,
    frozenCash,
    pendingBuyOrders,
    availableCash,
    marketValue: resolvedMarketValue,
    totalCostBasis,
    totalEquity,
    unrealizedPnl,
    unrealizedPnlPct,
    realizedPnl: state.realizedPnl,
    totalPnl,
    totalReturnPct,
    missingQuotes,
    holdings
  };
}

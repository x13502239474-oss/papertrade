import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccount, placeOrder, cancelOrder, processQuotes, rollover,
  portfolioSummary, sellableQty, reviewStats, recordEquity,
  addToWatch, removeFromWatch, createGroup, moveInWatch,
} from '../ashare/js/core/account.js';
import { fromShanghai } from '../ashare/js/core/time.js';

function mkQuote(overrides = {}) {
  const t = overrides.time ?? fromShanghai('2026-11-26', 10, 0, 0);
  return {
    symbol: 'sz000001', code: '000001', exchange: 'SZ', name: '平安银行',
    price: 12.00, prevClose: 12.00, open: 12.00, high: 12.20, low: 11.90,
    limitUp: 13.20, limitDown: 10.80,
    bids: [{ price: 11.99, vol: 50 }],
    asks: [{ price: 12.00, vol: 60 }],
    time: t, dataDate: '2026-11-26', source: '测试源', demo: false,
    ...overrides,
  };
}

test('完整闭环：买入 → T+1 当日禁卖 → 下一交易日可卖 → 盈亏与复盘一致', () => {
  const t1 = fromShanghai('2026-11-26', 10, 0, 0);
  let acc = createAccount({ initialCash: 100_000, now: t1 });
  const q1 = mkQuote({ time: t1 });

  // 1. 限价买入 1000 股 @ 12.00（卖一 12.00，立即成交）
  const buyRes = placeOrder(acc, { symbol: 'sz000001', side: 'buy', type: 'limit', price: 12.00, qty: 1000 }, { quote: q1, now: t1 });
  assert.equal(buyRes.ok, true);
  assert.ok(buyRes.fill);
  acc = buyRes.state;
  assert.equal(acc.positions['sz000001'].qty, 1000);
  assert.equal(sellableQty(acc.positions['sz000001'], '2026-11-26'), 0);
  // 资金扣除 = 12000 + 佣金 5 + 过户费 0.12 = 12005.12
  assert.equal(acc.cash, 100_000 - 12005.12);

  // 2. 同日尝试卖出 → 被 T+1 拒绝
  const sameDaySell = placeOrder(acc, { symbol: 'sz000001', side: 'sell', type: 'limit', price: 12.00, qty: 1000 }, { quote: q1, now: t1 + 60_000 });
  assert.equal(sameDaySell.ok, false);
  assert.match(sameDaySell.error, /T\+1|可卖数量不足/);

  // 3. 跨到下一个交易日（2026-11-27 10:00）→ 可卖数量变为 1000，以 13.00 卖出
  const t2 = fromShanghai('2026-11-27', 10, 0, 0);
  const q2 = mkQuote({
    price: 13.00, prevClose: 12.00, limitUp: 13.20, limitDown: 10.80,
    bids: [{ price: 13.00, vol: 80 }], asks: [{ price: 13.01, vol: 40 }],
    time: t2, dataDate: '2026-11-27',
  });
  acc = rollover(acc, t2).state;
  assert.equal(sellableQty(acc.positions['sz000001'], '2026-11-27'), 1000);

  const sellRes = placeOrder(acc, { symbol: 'sz000001', side: 'sell', type: 'limit', price: 12.90, qty: 1000 }, { quote: q2, now: t2 });
  assert.equal(sellRes.ok, true);
  assert.equal(sellRes.fill.price, 13.00); // 买一 13.00 >= 限价 12.90，按买一价成交
  acc = sellRes.state;
  assert.equal(acc.positions['sz000001'], undefined);

  // 卖出手续费：金额 13000，佣金 5 + 印花税 6.5 + 过户费 0.13 = 11.63
  // 净收益：13000 - 11.63 - 12005.12 = 983.25
  assert.equal(acc.realizedPnl, 983.25);
  assert.equal(acc.cash, 100_000 + 983.25);

  const stats = reviewStats(acc);
  assert.equal(stats.count, 2);
  assert.equal(stats.wins, 1);
  assert.equal(stats.winRate, 1);
  assert.equal(stats.realized, 983.25);
});

test('限价单挂单、后续行情触发成交、撤单与收盘过期', () => {
  const t1 = fromShanghai('2026-11-26', 10, 0, 0);
  let acc = createAccount({ initialCash: 100_000, now: t1 });
  const q1 = mkQuote({ time: t1, asks: [{ price: 12.00, vol: 10 }] });

  // 挂 11.50 买单（低于卖一 12.00）→ 进入 pending 并冻结资金
  const r1 = placeOrder(acc, { symbol: 'sz000001', side: 'buy', type: 'limit', price: 11.50, qty: 1000 }, { quote: q1, now: t1 });
  assert.equal(r1.ok, true);
  assert.equal(r1.fill, null);
  assert.equal(r1.order.status, 'pending');
  acc = r1.state;
  assert.equal(acc.frozenCash, 11505.12);

  // 撤单释放冻结资金
  const c1 = cancelOrder(acc, r1.order.id, t1 + 1000);
  assert.equal(c1.ok, true);
  acc = c1.state;
  assert.equal(acc.frozenCash, 0);
  assert.equal(acc.cash, 100_000);

  // 再挂一笔 11.80 买单，之后行情跌到 11.75 → processQuotes 触发成交并退回多冻结资金
  const r2 = placeOrder(acc, { symbol: 'sz000001', side: 'buy', type: 'limit', price: 11.80, qty: 1000 }, { quote: q1, now: t1 + 2000 });
  acc = r2.state;
  const qDrop = mkQuote({ time: t1 + 30_000, price: 11.75, asks: [{ price: 11.75, vol: 20 }] });
  const matched = processQuotes(acc, { sz000001: qDrop }, t1 + 30_000);
  assert.equal(matched.fills.length, 1);
  assert.equal(matched.fills[0].price, 11.75);
  acc = matched.state;
  assert.equal(acc.frozenCash, 0);
  assert.equal(acc.cash, 100_000 - (11750 + 5 + 0.12));

  // 再挂一笔 11.00 买单，跨至收盘后 rollover 自动失效并解冻
  const r3 = placeOrder(acc, { symbol: 'sz000001', side: 'buy', type: 'limit', price: 11.00, qty: 1000 }, { quote: qDrop, now: t1 + 40_000 });
  acc = r3.state;
  const afterClose = fromShanghai('2026-11-26', 15, 5, 0);
  const rolled = rollover(acc, afterClose);
  assert.equal(rolled.expired.length, 1);
  assert.equal(rolled.state.frozenCash, 0);
});

test('涨停无卖盘、非交易时段市价单与资金不足拦截', () => {
  const tOpen = fromShanghai('2026-11-26', 10, 0, 0);
  const tClosed = fromShanghai('2026-11-26', 15, 30, 0);
  const acc = createAccount({ initialCash: 5000, now: tOpen });

  // 涨停且无卖盘
  const qLimitUp = mkQuote({ price: 13.20, limitUp: 13.20, asks: [], bids: [{ price: 13.20, vol: 9999 }], time: tOpen });
  const rUp = placeOrder(acc, { symbol: 'sz000001', side: 'buy', type: 'market', qty: 100 }, { quote: qLimitUp, now: tOpen });
  assert.equal(rUp.ok, false);

  // 非交易时段禁止市价单
  const qClosed = mkQuote({ time: tClosed });
  const rOff = placeOrder(acc, { symbol: 'sz000001', side: 'buy', type: 'market', qty: 100 }, { quote: qClosed, now: tClosed });
  assert.equal(rOff.ok, false);

  // 资金不足
  const rCash = placeOrder(acc, { symbol: 'sz000001', side: 'buy', type: 'limit', price: 12.00, qty: 1000 }, { quote: mkQuote({ time: tOpen }), now: tOpen });
  assert.equal(rCash.ok, false);
});

test('资产汇总、净值曲线与多自选分组', () => {
  const t1 = fromShanghai('2026-11-26', 10, 0, 0);
  let acc = createAccount({ initialCash: 100_000, now: t1 });
  const q1 = mkQuote({ time: t1, price: 12.00, prevClose: 12.00 });
  acc = placeOrder(acc, { symbol: 'sz000001', side: 'buy', type: 'limit', price: 12.00, qty: 1000 }, { quote: q1, now: t1 }).state;

  const qUp = mkQuote({ time: t1 + 60_000, price: 12.50, prevClose: 12.00 });
  const sum = portfolioSummary(acc, { sz000001: qUp }, t1 + 60_000);
  assert.equal(sum.marketValue, 12500);
  assert.equal(Number(sum.floating.toFixed(2)), 494.88); // 12500 - 12005.12
  assert.equal(Number(sum.dayPnl.toFixed(2)), 494.88);
  acc = recordEquity(acc, sum, t1 + 60_000);
  assert.equal(acc.equity.length, 1);

  // 自选分组
  const g = createGroup(acc, '新能源');
  assert.equal(g.ok, true);
  acc = addToWatch(g.state, g.id, { symbol: 'sz300750', name: '宁德时代' });
  acc = addToWatch(acc, g.id, { symbol: 'sz002594', name: '比亚迪' });
  acc = moveInWatch(acc, g.id, 'sz002594', -1);
  assert.equal(acc.watch.groups.find((x) => x.id === g.id).items[0].symbol, 'sz002594');
  acc = removeFromWatch(acc, 'sz300750', g.id);
  assert.equal(acc.watch.groups.find((x) => x.id === g.id).items.length, 1);
});

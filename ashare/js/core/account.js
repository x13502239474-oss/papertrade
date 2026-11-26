// 模拟账户核心逻辑（纯函数风格：传入 state，返回新 state，不触碰 DOM / 网络 / localStorage）。
//
// 成交定价假设（界面与 README 同步说明）：
//   * 没有逐笔成交与完整订单簿，不是真实撮合；按“最新可得的一档盘口/最新价”模拟。
//   * 买入参考价 = 卖一价（有盘口时）否则最新价；卖出参考价 = 买一价（有盘口时）否则最新价。
//   * 市价委托：仅在连续竞价时段、行情新鲜时按参考价立即全部成交，否则拒绝（不排队）。
//   * 限价委托：买入在参考价 ≤ 委托价时、卖出在参考价 ≥ 委托价时，按参考价全部成交；当日有效，收盘未成交自动失效。
//   * 不模拟部分成交、排队顺序与成交量约束；涨停无卖盘时不能买入、跌停无买盘时不能卖出。
import { calcFees, DEFAULT_FEES, normalizeFees } from './fees.js';
import { validateQuantity, priceBand, isTickAligned, boardInfo, parseSymbol, round2 } from './rules.js';
import { marketPhase, orderTradeDate, latestDataDate } from './session.js';

export const SCHEMA_VERSION = 2;
export const DEFAULT_INITIAL_CASH = 100_000;

export const DEFAULT_SETTINGS = Object.freeze({
  fees: { ...DEFAULT_FEES },
  practiceOffHours: false,
  maxQuoteAgeSec: 120,
  provider: 'public',
  proxyBase: '',
  theme: 'auto',
});

let seq = 0;
export function uid(prefix = 'id') {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export function createAccount({ initialCash = DEFAULT_INITIAL_CASH, now = Date.now(), settings } = {}) {
  return {
    version: SCHEMA_VERSION,
    createdAt: now,
    initialCash,
    cash: initialCash,
    frozenCash: 0,
    realizedPnl: 0,
    positions: {},
    orders: [],
    fills: [],
    equity: [],
    watch: {
      activeGroupId: 'default',
      groups: [{ id: 'default', name: '默认自选', items: [] }],
    },
    settings: { ...clone(DEFAULT_SETTINGS), ...(settings || {}) },
    meta: { migratedFrom: null },
  };
}

// ---------------------------------------------------------------- 持仓 / T+1

/** 可卖数量：总持仓 − 已冻结（挂单中） − 委托交易日当天及之后买入的股份（T+1） */
export function sellableQty(pos, tradeDate) {
  if (!pos) return 0;
  const locked = (pos.lots || []).filter((l) => l.date >= tradeDate).reduce((s, l) => s + l.qty, 0);
  return Math.max(0, pos.qty - (pos.frozenQty || 0) - locked);
}

/** 当日买入、尚未解锁的数量 */
export function lockedQty(pos, tradeDate) {
  if (!pos) return 0;
  return (pos.lots || []).filter((l) => l.date >= tradeDate).reduce((s, l) => s + l.qty, 0);
}

// ---------------------------------------------------------------- 定价

function bestAsk(q) { const a = q.asks && q.asks[0]; return a && a.price > 0 ? a : null; }
function bestBid(q) { const b = q.bids && q.bids[0]; return b && b.price > 0 ? b : null; }

/** 模拟成交参考价；无法成交时返回 { price:null, reason } */
export function referencePrice(side, quote) {
  if (!quote || !(quote.price > 0)) return { price: null, reason: '暂无有效行情' };
  if (side === 'buy') {
    const ask = bestAsk(quote);
    if (quote.limitUp > 0 && quote.price >= quote.limitUp && !ask) {
      return { price: null, reason: '已涨停且无可见卖盘，无法模拟买入成交' };
    }
    return { price: ask ? ask.price : quote.price, basis: ask ? '卖一价' : '最新价' };
  }
  const bid = bestBid(quote);
  if (quote.limitDown > 0 && quote.price <= quote.limitDown && !bid) {
    return { price: null, reason: '已跌停且无可见买盘，无法模拟卖出成交' };
  }
  return { price: bid ? bid.price : quote.price, basis: bid ? '买一价' : '最新价' };
}

/** 行情是否可用于“此刻”模拟成交 */
export function quoteFillCheck(quote, { now, tradeDate, settings }) {
  if (!quote || !(quote.price > 0)) return { ok: false, reason: '暂无有效行情' };
  if (quote.noTrade) return { ok: false, reason: '该股今日无成交（可能停牌），不模拟成交' };
  if (settings.practiceOffHours) return { ok: true, practice: true };
  const phase = marketPhase(now);
  if (!phase.continuous) return { ok: false, reason: `当前为${phase.label}，仅连续竞价时段模拟成交` };
  if (tradeDate && phase.date !== tradeDate) return { ok: false, reason: `委托归属 ${tradeDate}，尚未到该交易日` };
  if (quote.demo) return { ok: true, demo: true };
  if (quote.dataDate && quote.dataDate !== phase.date) return { ok: false, reason: '行情不是今日数据，暂不模拟成交' };
  const age = now - quote.time;
  const maxAge = (settings.maxQuoteAgeSec || 120) * 1000;
  if (!(age <= maxAge)) return { ok: false, reason: `行情已 ${Math.round(age / 1000)} 秒未更新，暂不模拟成交` };
  return { ok: true };
}

// ---------------------------------------------------------------- 下单预检

/**
 * input: { symbol, name, side:'buy'|'sell', type:'limit'|'market', price, qty }
 * ctx:   { quote, now }
 */
export function previewOrder(state, input, { quote, now }) {
  const errors = [];
  const warnings = [];
  const settings = state.settings || DEFAULT_SETTINGS;
  const p = parseSymbol(input.symbol);
  const board = p && boardInfo(p.symbol);
  const side = input.side === 'sell' ? 'sell' : 'buy';
  const type = input.type === 'market' ? 'market' : 'limit';
  const qty = Number(input.qty);
  const phase = marketPhase(now);
  const tradeDate = orderTradeDate(now);
  const out = { ok: false, errors, warnings, side, type, qty, tradeDate, phase };
  if (!p || !board) { errors.push('暂不支持该证券的模拟交易（仅支持沪深京 A 股股票）'); return out; }
  out.symbol = p.symbol; out.code = p.code; out.exchange = p.exchange; out.board = board;
  out.name = input.name || quote?.name || p.code;
  if (!quote || !(quote.price > 0)) { errors.push('暂无该股票的有效行情，无法估算与校验委托'); return out; }

  const pos = state.positions[p.symbol];
  const sellable = sellableQty(pos, tradeDate);
  out.sellable = sellable;
  out.locked = lockedQty(pos, tradeDate);

  const qv = validateQuantity({ symbol: p.symbol, side, qty, sellable });
  if (!qv.ok) {
    if (side === 'sell' && out.locked > 0 && qty > sellable) {
      errors.push(`${qv.reason}；其中 ${out.locked} 股为 ${tradeDate} 当日买入，T+1 规则下次一交易日才可卖出`);
    } else errors.push(qv.reason);
  }

  const band = priceBand(quote, { tradeDate, name: out.name });
  out.band = band;
  if (band && band.source !== 'feed') warnings.push('涨跌停价为按板块规则估算，可能与交易所实际价格不同');

  let estPrice;
  if (type === 'limit') {
    const price = Number(input.price);
    if (!(price > 0)) errors.push('请输入有效的委托价格');
    else if (!isTickAligned(price)) errors.push('委托价格最小变动单位为 0.01 元');
    else if (band && (price > band.up + 1e-9 || price < band.down - 1e-9)) {
      errors.push(`委托价超出涨跌幅限制（${band.down.toFixed(2)} ~ ${band.up.toFixed(2)}）`);
    }
    estPrice = price;
    out.price = price;
  } else {
    if (!phase.continuous && !settings.practiceOffHours) {
      errors.push('市价委托仅在连续竞价时段（09:30-11:30、13:00-14:57）可用；当前请使用限价委托');
    }
    const ref = referencePrice(side, quote);
    if (!ref.price) errors.push(ref.reason);
    estPrice = ref.price || quote.price;
    out.priceBasis = ref.basis;
  }
  out.estPrice = estPrice;

  const amount = Number.isFinite(qty) && estPrice > 0 ? round2(estPrice * qty) : 0;
  const fees = calcFees({ side, amount, exchange: p.exchange }, settings.fees);
  out.amount = amount;
  out.fees = fees;
  if (side === 'buy') {
    out.total = round2(amount + fees.total);
    if (out.total > state.cash + 1e-9) {
      errors.push(`可用资金不足：需要 ¥${out.total.toFixed(2)}，可用 ¥${state.cash.toFixed(2)}`);
    }
  } else {
    out.total = round2(amount - fees.total);
  }

  if (quote.demo) warnings.push('当前为演示行情（静态快照），成交价格不代表真实市场');
  if (settings.practiceOffHours) warnings.push('已开启“非交易时段练习成交”，成交不受交易时段限制，仅供练习');
  else if (type === 'limit' && (!phase.continuous || phase.date !== tradeDate)) {
    warnings.push(`当前为${phase.label}，限价委托将在 ${tradeDate} 连续竞价时段按条件模拟成交（当日有效）`);
  }
  if (!phase.calendar.known) warnings.push(phase.calendar.note);

  out.ok = errors.length === 0;
  return out;
}

// ---------------------------------------------------------------- 下单 / 成交 / 撤单

export function placeOrder(stateIn, input, ctx) {
  const pv = previewOrder(stateIn, input, ctx);
  if (!pv.ok) return { state: stateIn, ok: false, error: pv.errors[0], preview: pv };
  const state = clone(stateIn);
  const { now, quote } = ctx;
  const order = {
    id: uid('o'),
    symbol: pv.symbol, code: pv.code, exchange: pv.exchange, name: pv.name,
    side: pv.side, type: pv.type, price: pv.type === 'limit' ? pv.price : null,
    qty: pv.qty, status: 'pending', createdAt: now, tradeDate: pv.tradeDate,
    frozenCash: 0, frozenQty: 0,
    quoteTimeAtOrder: quote.time || null, quotePriceAtOrder: quote.price, source: quote.source || '',
    reason: '',
  };
  if (order.side === 'buy') {
    order.frozenCash = pv.total;
    state.cash = round2(state.cash - pv.total);
    state.frozenCash = round2(state.frozenCash + pv.total);
  } else {
    order.frozenQty = order.qty;
    state.positions[order.symbol].frozenQty += order.qty;
  }
  state.orders.unshift(order);
  const res = tryFill(state, order, quote, now);
  if (!res.filled && order.type === 'market') {
    releaseOrder(state, order, 'rejected', res.reason || '市价委托未能立即成交');
    order.closedAt = now;
    return { state, ok: false, error: order.reason, order, preview: pv };
  }
  return { state, ok: true, order, fill: res.fill || null, waitingReason: res.filled ? '' : res.reason, preview: pv };
}

/** 在已克隆的 state 上尝试撮合一笔挂单；返回 { filled, fill?, reason? } */
function tryFill(state, order, quote, now) {
  if (order.status !== 'pending') return { filled: false, reason: '委托不在待成交状态' };
  const settings = state.settings || DEFAULT_SETTINGS;
  const chk = quoteFillCheck(quote, { now, tradeDate: order.tradeDate, settings });
  if (!chk.ok) return { filled: false, reason: chk.reason };
  const ref = referencePrice(order.side, quote);
  if (!ref.price) return { filled: false, reason: ref.reason };
  if (order.type === 'limit') {
    if (order.side === 'buy' && ref.price > order.price + 1e-9) return { filled: false, reason: `${ref.basis} ${ref.price.toFixed(2)} 高于委托价，等待成交` };
    if (order.side === 'sell' && ref.price < order.price - 1e-9) return { filled: false, reason: `${ref.basis} ${ref.price.toFixed(2)} 低于委托价，等待成交` };
  }
  const fill = applyFill(state, order, ref.price, quote, now, { basis: ref.basis, practice: !!chk.practice });
  return { filled: true, fill };
}

function applyFill(state, order, price, quote, now, { basis, practice }) {
  const settings = state.settings || DEFAULT_SETTINGS;
  const amount = round2(price * order.qty);
  const fees = calcFees({ side: order.side, amount, exchange: order.exchange }, settings.fees);
  let realized = null;
  let costBasis = null;
  if (order.side === 'buy') {
    state.frozenCash = round2(state.frozenCash - order.frozenCash);
    state.cash = round2(state.cash + order.frozenCash - amount - fees.total);
    const pos = state.positions[order.symbol] || (state.positions[order.symbol] = {
      symbol: order.symbol, code: order.code, exchange: order.exchange, name: order.name,
      qty: 0, frozenQty: 0, avgCost: 0, costTotal: 0, realizedPnl: 0, lots: [], openedAt: now,
    });
    pos.name = order.name || pos.name;
    pos.costTotal = round2(pos.costTotal + amount + fees.total);
    pos.qty += order.qty;
    pos.avgCost = pos.costTotal / pos.qty;
    pos.lots.push({ date: order.tradeDate, qty: order.qty });
  } else {
    const pos = state.positions[order.symbol];
    pos.frozenQty -= order.qty;
    costBasis = round2(pos.avgCost * order.qty);
    const proceeds = round2(amount - fees.total);
    realized = round2(proceeds - costBasis);
    pos.qty -= order.qty;
    pos.costTotal = pos.qty > 0 ? round2(pos.costTotal - costBasis) : 0;
    pos.realizedPnl = round2((pos.realizedPnl || 0) + realized);
    state.realizedPnl = round2((state.realizedPnl || 0) + realized);
    state.cash = round2(state.cash + proceeds);
    if (pos.qty <= 0) delete state.positions[order.symbol];
  }
  const fill = {
    id: uid('f'), orderId: order.id,
    symbol: order.symbol, code: order.code, exchange: order.exchange, name: order.name,
    side: order.side, type: order.type, price, qty: order.qty, amount,
    fees: { commission: fees.commission, stampDuty: fees.stampDuty, transferFee: fees.transferFee, total: fees.total },
    feeBasis: fees.basis,
    time: now, tradeDate: order.tradeDate,
    quoteTime: quote.time || null, quotePrice: quote.price, prevClose: quote.prevClose || null,
    priceBasis: basis, source: quote.source || '', demo: !!quote.demo, practice: !!practice,
    realizedPnl: realized, costBasis,
  };
  state.fills.unshift(fill);
  order.status = 'filled';
  order.filledAt = now;
  order.fillPrice = price;
  order.fillId = fill.id;
  order.frozenCash = 0;
  order.frozenQty = 0;
  return fill;
}

function releaseOrder(state, order, status, reason) {
  if (order.side === 'buy') {
    state.frozenCash = round2(state.frozenCash - order.frozenCash);
    state.cash = round2(state.cash + order.frozenCash);
  } else {
    const pos = state.positions[order.symbol];
    if (pos) pos.frozenQty = Math.max(0, pos.frozenQty - order.frozenQty);
  }
  order.frozenCash = 0;
  order.frozenQty = 0;
  order.status = status;
  order.reason = reason;
}

export function cancelOrder(stateIn, orderId, now = Date.now()) {
  const state = clone(stateIn);
  const order = state.orders.find((o) => o.id === orderId);
  if (!order || order.status !== 'pending') return { state: stateIn, ok: false, error: '该委托不可撤销' };
  releaseOrder(state, order, 'cancelled', '用户撤单（模拟）');
  order.closedAt = now;
  return { state, ok: true, order };
}

/** 用最新行情尝试撮合所有挂单；返回 { state, fills } */
export function processQuotes(stateIn, quotes, now) {
  const pending = stateIn.orders.filter((o) => o.status === 'pending' && quotes[o.symbol]);
  if (!pending.length) return { state: stateIn, fills: [] };
  const state = clone(stateIn);
  const fills = [];
  for (const o of state.orders) {
    if (o.status !== 'pending' || !quotes[o.symbol]) continue;
    const r = tryFill(state, o, quotes[o.symbol], now);
    if (r.filled) fills.push(r.fill);
  }
  return { state: fills.length ? state : stateIn, fills };
}

/** 跨时段维护：过期挂单失效、清理已解锁的 T+1 批次 */
export function rollover(stateIn, now) {
  const currentTD = orderTradeDate(now);
  const needExpire = stateIn.orders.some((o) => o.status === 'pending' && o.tradeDate < currentTD);
  const needPrune = Object.values(stateIn.positions).some((p) => (p.lots || []).some((l) => l.date < currentTD));
  if (!needExpire && !needPrune) return { state: stateIn, expired: [] };
  const state = clone(stateIn);
  const expired = [];
  for (const o of state.orders) {
    if (o.status === 'pending' && o.tradeDate < currentTD) {
      releaseOrder(state, o, 'expired', `${o.tradeDate} 收盘未成交，当日有效委托自动失效`);
      o.closedAt = now;
      expired.push(o);
    }
  }
  for (const p of Object.values(state.positions)) p.lots = (p.lots || []).filter((l) => l.date >= currentTD);
  return { state, expired };
}

// ---------------------------------------------------------------- 资产汇总

export function portfolioSummary(state, quotes = {}, now = Date.now()) {
  const td = orderTradeDate(now);
  let marketValue = 0;
  let floating = 0;
  let dayPnl = 0;
  let complete = true;
  const rows = [];
  const symbols = new Set(Object.keys(state.positions));
  for (const f of state.fills) {
    const q = quotes[f.symbol];
    if (q && q.dataDate && f.tradeDate === q.dataDate) symbols.add(f.symbol);
  }
  for (const symbol of symbols) {
    const pos = state.positions[symbol];
    const q = quotes[symbol];
    const live = q && q.price > 0;
    if (pos) {
      const price = live ? q.price : pos.avgCost;
      if (!live) complete = false;
      const mv = price * pos.qty;
      const pnl = (price - pos.avgCost) * pos.qty;
      marketValue += mv;
      floating += pnl;
      rows.push({
        ...pos, price, priceLive: !!live, quote: q || null,
        marketValue: mv, pnl, pnlPct: pos.avgCost > 0 ? price / pos.avgCost - 1 : 0,
        sellable: sellableQty(pos, td), locked: lockedQty(pos, td),
      });
    }
    // 当日盈亏：昨仓按（现价 − 昨收）计；今日买入按（现价 − 成交价）计；今日卖出按（成交价 − 昨收）计；扣除当日费用
    if (live && q.prevClose > 0 && q.dataDate) {
      const today = state.fills.filter((f) => f.symbol === symbol && f.tradeDate === q.dataDate);
      const bought = today.filter((f) => f.side === 'buy').reduce((s, f) => s + f.qty, 0);
      const held = pos ? pos.qty : 0;
      const overnightStill = held - bought;
      let d = (q.price - q.prevClose) * Math.max(0, overnightStill);
      for (const f of today) {
        if (f.side === 'buy') d += (q.price - f.price) * f.qty - f.fees.total;
        else d += (f.price - (f.prevClose || q.prevClose)) * f.qty - f.fees.total;
      }
      dayPnl += d;
    } else if (pos) complete = false;
  }
  const total = state.cash + state.frozenCash + marketValue;
  const totalPnl = total - state.initialCash;
  return {
    cash: state.cash,
    frozenCash: state.frozenCash,
    marketValue,
    total,
    floating,
    dayPnl,
    totalPnl,
    totalPnlPct: state.initialCash > 0 ? totalPnl / state.initialCash : 0,
    realizedPnl: state.realizedPnl || 0,
    positions: rows.sort((a, b) => b.marketValue - a.marketValue),
    complete,
  };
}

/** 记录资产曲线：每个行情交易日保留一条（同日覆盖），仅在所有持仓都有行情时记录 */
export function recordEquity(stateIn, summary, now) {
  if (!summary.complete) return stateIn;
  const date = latestDataDate(now);
  const point = { date, total: round2(summary.total), cash: round2(summary.cash + summary.frozenCash), mv: round2(summary.marketValue), at: now };
  const last = stateIn.equity[stateIn.equity.length - 1];
  if (last && last.date === date && Math.abs(last.total - point.total) < 0.005) return stateIn;
  const state = { ...stateIn, equity: [...stateIn.equity] };
  if (last && last.date === date) state.equity[state.equity.length - 1] = point;
  else state.equity.push(point);
  if (state.equity.length > 1500) state.equity = state.equity.slice(-1500);
  return state;
}

// ---------------------------------------------------------------- 复盘统计

export function filterByDate(list, { from, to } = {}, key = 'tradeDate') {
  return list.filter((x) => (!from || x[key] >= from) && (!to || x[key] <= to));
}

export function reviewStats(state, range = {}) {
  const fills = filterByDate(state.fills, range);
  const sells = fills.filter((f) => f.side === 'sell');
  const buys = fills.filter((f) => f.side === 'buy');
  const sum = (arr, fn) => round2(arr.reduce((s, x) => s + fn(x), 0));
  const wins = sells.filter((f) => f.realizedPnl > 0);
  const losses = sells.filter((f) => f.realizedPnl < 0);
  const bySymbol = {};
  for (const f of fills) {
    const r = bySymbol[f.symbol] || (bySymbol[f.symbol] = { symbol: f.symbol, name: f.name, fills: 0, realized: 0, fees: 0, buyAmount: 0, sellAmount: 0 });
    r.fills++;
    r.fees = round2(r.fees + f.fees.total);
    if (f.side === 'buy') r.buyAmount = round2(r.buyAmount + f.amount);
    else { r.sellAmount = round2(r.sellAmount + f.amount); r.realized = round2(r.realized + (f.realizedPnl || 0)); }
  }
  const sortedSells = [...sells].sort((a, b) => b.realizedPnl - a.realizedPnl);
  return {
    count: fills.length,
    buyCount: buys.length,
    sellCount: sells.length,
    buyAmount: sum(buys, (f) => f.amount),
    sellAmount: sum(sells, (f) => f.amount),
    fees: sum(fills, (f) => f.fees.total),
    realized: sum(sells, (f) => f.realizedPnl || 0),
    wins: wins.length,
    losses: losses.length,
    winRate: wins.length + losses.length ? wins.length / (wins.length + losses.length) : null,
    best: sortedSells[0] || null,
    worst: sortedSells.length ? sortedSells[sortedSells.length - 1] : null,
    bySymbol: Object.values(bySymbol).sort((a, b) => b.realized - a.realized),
  };
}

// ---------------------------------------------------------------- 自选

export function isWatched(state, symbol) {
  return state.watch.groups.some((g) => g.items.some((i) => i.symbol === symbol));
}

export function addToWatch(stateIn, groupId, { symbol, name }, now = Date.now()) {
  const state = clone(stateIn);
  const g = state.watch.groups.find((x) => x.id === groupId) || state.watch.groups[0];
  if (!g.items.some((i) => i.symbol === symbol)) g.items.push({ symbol, name: name || symbol, addedAt: now });
  return state;
}

export function removeFromWatch(stateIn, symbol, groupId = null) {
  const state = clone(stateIn);
  for (const g of state.watch.groups) {
    if (!groupId || g.id === groupId) g.items = g.items.filter((i) => i.symbol !== symbol);
  }
  return state;
}

export function moveInWatch(stateIn, groupId, symbol, delta) {
  const state = clone(stateIn);
  const g = state.watch.groups.find((x) => x.id === groupId);
  if (!g) return stateIn;
  const i = g.items.findIndex((x) => x.symbol === symbol);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= g.items.length) return stateIn;
  [g.items[i], g.items[j]] = [g.items[j], g.items[i]];
  return state;
}

export function createGroup(stateIn, name) {
  const clean = String(name || '').trim().slice(0, 12);
  if (!clean) return { state: stateIn, ok: false, error: '分组名称不能为空' };
  if (stateIn.watch.groups.some((g) => g.name === clean)) return { state: stateIn, ok: false, error: '已存在同名分组' };
  if (stateIn.watch.groups.length >= 20) return { state: stateIn, ok: false, error: '最多 20 个分组' };
  const state = clone(stateIn);
  const id = uid('g');
  state.watch.groups.push({ id, name: clean, items: [] });
  state.watch.activeGroupId = id;
  return { state, ok: true, id };
}

export function renameGroup(stateIn, id, name) {
  const clean = String(name || '').trim().slice(0, 12);
  if (!clean) return { state: stateIn, ok: false, error: '分组名称不能为空' };
  const state = clone(stateIn);
  const g = state.watch.groups.find((x) => x.id === id);
  if (!g) return { state: stateIn, ok: false, error: '分组不存在' };
  g.name = clean;
  return { state, ok: true };
}

export function deleteGroup(stateIn, id) {
  if (id === 'default') return { state: stateIn, ok: false, error: '默认分组不可删除' };
  const state = clone(stateIn);
  state.watch.groups = state.watch.groups.filter((g) => g.id !== id);
  if (state.watch.activeGroupId === id) state.watch.activeGroupId = 'default';
  return { state, ok: true };
}

export function updateSettings(stateIn, patch) {
  const state = clone(stateIn);
  state.settings = { ...state.settings, ...patch };
  if (patch.fees) state.settings.fees = normalizeFees({ ...stateIn.settings.fees, ...patch.fees });
  return state;
}

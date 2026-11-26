import { APP_CONFIG } from './config.js';
import { isNonTradableSymbol } from './catalog.js';
import {
  roundQty,
  roundMoney,
  validateQuantity,
  validateLimitPrice,
  getAvailableCash,
  getSellableShares
} from './account.js';

function generateId(prefix = 'ORD') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function previewOrder({ side, type, rawQty, rawLimitPrice, quote, isQuoteFresh, state, symbol }) {
  const sym = String(symbol || '').toUpperCase().trim();
  const buyingPower = getAvailableCash(state);
  const sellableQty = getSellableShares(state, sym);

  if (!sym || isNonTradableSymbol(sym)) {
    return { canSubmit: false, disableReason: '该标的为非上市公司或已退市，不可交易', estimate: null, buyingPower, sellableQty };
  }

  const isLimit = type === 'limit';
  const hasQuote = Boolean(quote && Number.isFinite(quote.price) && quote.price > 0);

  if (!hasQuote) {
    return {
      canSubmit: false,
      disableReason: '未获取真实报价，请先连接行情源并同步当前股票报价',
      estimate: null,
      buyingPower,
      sellableQty
    };
  }

  if (!isLimit && !isQuoteFresh) {
    return {
      canSubmit: false,
      disableReason: '当前报价已超过 15 分钟未更新，已禁用模拟市价单，请先刷新行情',
      estimate: null,
      buyingPower,
      sellableQty
    };
  }

  const qtyCheck = validateQuantity(rawQty);
  if (!qtyCheck.valid) {
    return { canSubmit: false, disableReason: qtyCheck.error, estimate: null, buyingPower, sellableQty };
  }
  const qty = qtyCheck.qty;

  let refPrice = quote.price;
  if (isLimit) {
    const limitCheck = validateLimitPrice(rawLimitPrice);
    if (!limitCheck.valid) {
      return { canSubmit: false, disableReason: limitCheck.error, estimate: null, buyingPower, sellableQty };
    }
    refPrice = limitCheck.price;
  }

  const slippageFactor = isLimit ? 0 : side === 'buy' ? APP_CONFIG.slippageRate : -APP_CONFIG.slippageRate;
  const execPrice = refPrice * (1 + slippageFactor);
  const gross = qty * refPrice;
  const slippageAmount = isLimit ? 0 : Math.abs(qty * refPrice * APP_CONFIG.slippageRate);
  const commission = APP_CONFIG.commissionPerOrder;
  const total = side === 'buy' ? qty * execPrice + commission : qty * execPrice - commission;

  const estimate = {
    qty,
    refPrice,
    execPrice,
    gross,
    slippageAmount,
    commission,
    total
  };

  if (side === 'buy' && total > buyingPower + 1e-6) {
    return {
      canSubmit: false,
      disableReason: `可用购买力不足（需 $${total.toFixed(2)}，当前可用 $${buyingPower.toFixed(2)}）`,
      estimate,
      buyingPower,
      sellableQty
    };
  }

  if (side === 'sell' && qty > sellableQty + 1e-8) {
    return {
      canSubmit: false,
      disableReason: `可卖股数不足（委托 ${qty} 股，当前可卖 ${sellableQty} 股）`,
      estimate,
      buyingPower,
      sellableQty
    };
  }

  return {
    canSubmit: true,
    disableReason: null,
    estimate,
    buyingPower,
    sellableQty
  };
}

export function executeOrderFill(state, order, marketPrice, quoteDatetime = null, now = Date.now()) {
  const pos = state.positions[order.symbol] || { qty: 0, avgCost: 0 };
  const isLimit = order.type === 'limit';

  // 模拟撮合规则：
  // - 市价单：买入加计 +0.05% 滑点，卖出扣除 -0.05% 滑点
  // - 限价单：当最新新鲜报价达到或优于限价时，按不劣于限价的价格成交（买单 min(limit, market)，卖单 max(limit, market)）
  const fillPrice = isLimit
    ? order.side === 'buy'
      ? Math.min(order.limitPrice, marketPrice)
      : Math.max(order.limitPrice, marketPrice)
    : marketPrice * (order.side === 'buy' ? 1 + APP_CONFIG.slippageRate : 1 - APP_CONFIG.slippageRate);

  const slippage = isLimit ? 0 : Math.abs(fillPrice - marketPrice) * order.qty;
  const commission = APP_CONFIG.commissionPerOrder;

  if (order.side === 'buy') {
    const totalCost = order.qty * fillPrice + commission;
    const available = getAvailableCash(state, order.status === 'pending' ? order.id : null);

    if (totalCost > available + 1e-6) {
      order.status = 'rejected';
      order.rejectReason = '可用购买力不足，无法完成买入成交';
      order.updatedAt = now;
      return { ok: false, reason: order.rejectReason };
    }

    const newQty = roundQty(pos.qty + order.qty);
    const newAvgCost = (pos.qty * pos.avgCost + totalCost) / newQty;
    state.positions[order.symbol] = { qty: newQty, avgCost: newAvgCost };
    state.cash = roundMoney(state.cash - totalCost);

    order.status = 'filled';
    order.fillPrice = fillPrice;
    order.slippage = slippage;
    order.commission = commission;
    order.quoteTimestamp = quoteDatetime;
    order.filledAt = now;
    order.updatedAt = now;

    const trade = {
      id: generateId('TRD'),
      orderId: order.id,
      symbol: order.symbol,
      side: 'buy',
      type: order.type,
      qty: order.qty,
      price: fillPrice,
      gross: order.qty * fillPrice,
      slippage,
      commission,
      realizedPnl: null,
      quoteTimestamp: quoteDatetime,
      time: now
    };
    state.trades.unshift(trade);
    return { ok: true, fillPrice, trade };
  } else {
    const sellable = getSellableShares(state, order.symbol, order.status === 'pending' ? order.id : null);
    if (order.qty > sellable + 1e-8) {
      order.status = 'rejected';
      order.rejectReason = '可卖持仓股数不足，无法完成卖出成交';
      order.updatedAt = now;
      return { ok: false, reason: order.rejectReason };
    }

    const proceeds = order.qty * fillPrice - commission;
    const realizedPnl = (fillPrice - pos.avgCost) * order.qty - commission;
    const remainingQty = roundQty(pos.qty - order.qty);

    if (remainingQty < APP_CONFIG.minQty / 2) {
      delete state.positions[order.symbol];
    } else {
      state.positions[order.symbol] = { qty: remainingQty, avgCost: pos.avgCost };
    }

    state.cash = roundMoney(state.cash + proceeds);
    state.realizedPnl = roundMoney(state.realizedPnl + realizedPnl);

    order.status = 'filled';
    order.fillPrice = fillPrice;
    order.slippage = slippage;
    order.commission = commission;
    order.realizedPnl = realizedPnl;
    order.quoteTimestamp = quoteDatetime;
    order.filledAt = now;
    order.updatedAt = now;

    const trade = {
      id: generateId('TRD'),
      orderId: order.id,
      symbol: order.symbol,
      side: 'sell',
      type: order.type,
      qty: order.qty,
      price: fillPrice,
      gross: order.qty * fillPrice,
      slippage,
      commission,
      realizedPnl,
      quoteTimestamp: quoteDatetime,
      time: now
    };
    state.trades.unshift(trade);
    return { ok: true, fillPrice, realizedPnl, trade };
  }
}

export function submitOrder(
  state,
  { symbol, side, type, qty: rawQty, limitPrice: rawLimitPrice, quote, isQuoteFresh, now = Date.now() }
) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym || isNonTradableSymbol(sym)) {
    return { ok: false, error: '该标的为非上市公司或已退市，禁止模拟下单' };
  }
  if (side !== 'buy' && side !== 'sell') {
    return { ok: false, error: '无效的买卖方向' };
  }
  if (type !== 'market' && type !== 'limit') {
    return { ok: false, error: '无效的订单类型' };
  }

  const qtyCheck = validateQuantity(rawQty);
  if (!qtyCheck.valid) return { ok: false, error: qtyCheck.error };
  const qty = qtyCheck.qty;

  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    return { ok: false, error: '当前没有可用的真实报价，请先连接并同步行情' };
  }

  if (type === 'market') {
    if (!isQuoteFresh) {
      return { ok: false, error: '当前报价已过期，系统已禁止使用旧报价执行模拟市价单' };
    }
    const order = {
      id: generateId('ORD'),
      symbol: sym,
      side,
      type: 'market',
      qty,
      limitPrice: null,
      fillPrice: null,
      slippage: 0,
      commission: APP_CONFIG.commissionPerOrder,
      realizedPnl: null,
      status: 'new',
      rejectReason: null,
      quoteTimestamp: quote.datetime || null,
      time: now,
      updatedAt: now,
      filledAt: null
    };
    const fillRes = executeOrderFill(state, order, quote.price, quote.datetime || null, now);
    state.orders.unshift(order);
    if (!fillRes.ok) {
      return { ok: false, status: 'rejected', error: fillRes.reason, order };
    }
    return { ok: true, status: 'filled', order, fillPrice: fillRes.fillPrice, trade: fillRes.trade };
  }

  // 限价单
  const limitCheck = validateLimitPrice(rawLimitPrice);
  if (!limitCheck.valid) return { ok: false, error: limitCheck.error };
  const limitPrice = limitCheck.price;

  if (side === 'buy') {
    const requiredCash = qty * limitPrice + APP_CONFIG.commissionPerOrder;
    if (requiredCash > getAvailableCash(state) + 1e-6) {
      const rejected = {
        id: generateId('ORD'),
        symbol: sym,
        side: 'buy',
        type: 'limit',
        qty,
        limitPrice,
        fillPrice: null,
        slippage: 0,
        commission: APP_CONFIG.commissionPerOrder,
        realizedPnl: null,
        status: 'rejected',
        rejectReason: '限价买单冻结金额超过可用购买力',
        quoteTimestamp: quote.datetime || null,
        time: now,
        updatedAt: now,
        filledAt: null
      };
      state.orders.unshift(rejected);
      return { ok: false, status: 'rejected', error: rejected.rejectReason, order: rejected };
    }
  } else {
    if (qty > getSellableShares(state, sym) + 1e-8) {
      const rejected = {
        id: generateId('ORD'),
        symbol: sym,
        side: 'sell',
        type: 'limit',
        qty,
        limitPrice,
        fillPrice: null,
        slippage: 0,
        commission: APP_CONFIG.commissionPerOrder,
        realizedPnl: null,
        status: 'rejected',
        rejectReason: '限价卖单委托数量超过可卖持仓',
        quoteTimestamp: quote.datetime || null,
        time: now,
        updatedAt: now,
        filledAt: null
      };
      state.orders.unshift(rejected);
      return { ok: false, status: 'rejected', error: rejected.rejectReason, order: rejected };
    }
  }

  const order = {
    id: generateId('ORD'),
    symbol: sym,
    side,
    type: 'limit',
    qty,
    limitPrice,
    fillPrice: null,
    slippage: 0,
    commission: APP_CONFIG.commissionPerOrder,
    realizedPnl: null,
    status: 'pending',
    rejectReason: null,
    quoteTimestamp: quote.datetime || null,
    time: now,
    updatedAt: now,
    filledAt: null
  };
  state.orders.unshift(order);

  // 严格规则：仅当存在新鲜有效报价 (isQuoteFresh === true) 且价格满足限价条件时才触发成交；严禁用陈旧报价触发限价单！
  const shouldTriggerNow =
    Boolean(isQuoteFresh) &&
    ((side === 'buy' && quote.price <= limitPrice) || (side === 'sell' && quote.price >= limitPrice));

  if (shouldTriggerNow) {
    const fillRes = executeOrderFill(state, order, quote.price, quote.datetime || null, now);
    if (!fillRes.ok) {
      return { ok: false, status: 'rejected', error: fillRes.reason, order };
    }
    return { ok: true, status: 'filled', order, fillPrice: fillRes.fillPrice, trade: fillRes.trade };
  }

  return { ok: true, status: 'pending', order };
}

export function evaluatePendingLimitOrders(state, quotesMap, isFreshFn, now = Date.now()) {
  const filledOrders = [];
  for (const order of state.orders) {
    if (order.status !== 'pending' || order.type !== 'limit') continue;
    const quote = quotesMap[order.symbol];
    if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) continue;
    // 绝不使用陈旧报价触发限价单
    if (!isFreshFn(order.symbol, now)) continue;

    const triggered =
      (order.side === 'buy' && quote.price <= order.limitPrice) ||
      (order.side === 'sell' && quote.price >= order.limitPrice);

    if (triggered) {
      const res = executeOrderFill(state, order, quote.price, quote.datetime || null, now);
      if (res.ok) filledOrders.push(order);
    }
  }
  return filledOrders;
}

export function cancelPendingOrder(state, orderId, now = Date.now()) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, error: '未找到对应订单' };
  if (order.status !== 'pending') return { ok: false, error: '只有等待中的限价单可以撤单' };
  order.status = 'cancelled';
  order.updatedAt = now;
  return { ok: true, order };
}

export function filterOrders(orders, { status = 'all', side = 'all', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return orders.filter((o) => {
    if (status !== 'all' && o.status !== status) return false;
    if (side !== 'all' && o.side !== side) return false;
    if (q && !o.symbol.toLowerCase().includes(q) && !String(o.id || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

export function filterTrades(trades, { side = 'all', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return trades.filter((t) => {
    if (side !== 'all' && t.side !== side) return false;
    if (q && !t.symbol.toLowerCase().includes(q) && !String(t.id || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

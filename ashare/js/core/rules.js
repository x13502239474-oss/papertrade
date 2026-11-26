// A 股板块与交易规则配置。规则依据沪深北交易所《交易规则》及相关板块特别规定，
// 截至 2026-07-06 起实施的新版交易规则。所有数值集中在此处，便于核对和修改。
//
// 申报数量（竞价交易，限价申报）：
//   主板（沪深）：买入 100 股或其整数倍；卖出余额不足 100 股部分须一次性申报。
//   创业板：同主板，买入 100 股或其整数倍。
//   科创板：买入不少于 200 股，超过 200 股部分可按 1 股递增；卖出余额不足 200 股部分须一次性申报。
//   北交所：买入不少于 100 股，超过部分可按 1 股递增；卖出余额不足 100 股部分须一次性申报。
// 涨跌幅限制：
//   主板 10%；主板风险警示（ST/*ST）自 2026-07-06 起由 5% 调整为 10%（此前 5%）。
//   创业板、科创板 20%（含风险警示股）；北交所 30%。
//   新股上市初期（科创板/创业板前 5 个交易日、北交所首日、主板首日等）规则不同：
//   本模拟优先使用数据源返回的涨跌停价，无法取得时才按上表估算，并在界面标注“估算”。
import { shDate } from './time.js';

export const ST_MAIN_10PCT_FROM = '2026-07-06';

export const BOARDS = {
  main: {
    id: 'main', label: '主板', buyMin: 100, buyStep: 100, sellOddLot: 100,
    limitPct: 0.10, maxLimitQty: 1_000_000,
    lotText: '买入 100 股或其整数倍',
  },
  chinext: {
    id: 'chinext', label: '创业板', buyMin: 100, buyStep: 100, sellOddLot: 100,
    limitPct: 0.20, maxLimitQty: 300_000,
    lotText: '买入 100 股或其整数倍',
  },
  star: {
    id: 'star', label: '科创板', buyMin: 200, buyStep: 1, sellOddLot: 200,
    limitPct: 0.20, maxLimitQty: 100_000,
    lotText: '买入不少于 200 股，超出部分 1 股递增',
  },
  bse: {
    id: 'bse', label: '北交所', buyMin: 100, buyStep: 1, sellOddLot: 100,
    limitPct: 0.30, maxLimitQty: 1_000_000,
    lotText: '买入不少于 100 股，超出部分 1 股递增',
  },
};

export const EXCHANGES = {
  SH: { id: 'SH', label: '上交所', short: '沪' },
  SZ: { id: 'SZ', label: '深交所', short: '深' },
  BJ: { id: 'BJ', label: '北交所', short: '京' },
};

/** 由 6 位股票代码推断交易所（仅适用于 A 股股票，指数需显式带前缀）。 */
export function inferExchange(code) {
  const c = String(code);
  if (!/^\d{6}$/.test(c)) return null;
  if (/^(60|68)/.test(c)) return 'SH';
  if (/^(00|30)/.test(c)) return 'SZ';
  if (/^(92|43|83|87|88)/.test(c)) return 'BJ';
  return null;
}

/**
 * 解析多种写法：'sh600519' / '600519' / '600519.SH' / 'SH600519'
 * 返回 { exchange, code, symbol:'sh600519' } 或 null
 */
export function parseSymbol(input) {
  if (!input) return null;
  const s = String(input).trim();
  let m = s.match(/^(sh|sz|bj)(\d{6})$/i);
  if (m) return mk(m[1].toUpperCase(), m[2]);
  m = s.match(/^(\d{6})\.(sh|sz|bj)$/i);
  if (m) return mk(m[2].toUpperCase(), m[1]);
  m = s.match(/^(\d{6})$/);
  if (m) {
    const ex = inferExchange(m[1]);
    return ex ? mk(ex, m[1]) : null;
  }
  return null;
}

function mk(exchange, code) {
  return { exchange, code, symbol: exchange.toLowerCase() + code };
}

export function toTsCode(symbol) {
  const p = parseSymbol(symbol);
  return p ? `${p.code}.${p.exchange}` : null;
}

/** 股票所属板块；非股票代码返回 null */
export function boardOf(symbol) {
  const p = parseSymbol(symbol);
  if (!p) return null;
  const { exchange, code } = p;
  if (exchange === 'BJ') return /^(92|43|83|87|88)/.test(code) ? 'bse' : null;
  if (exchange === 'SH') {
    if (/^68[89]/.test(code)) return 'star';
    if (/^60[0135]/.test(code)) return 'main';
    return null;
  }
  if (exchange === 'SZ') {
    if (/^30[012]/.test(code)) return 'chinext';
    if (/^00[0-3]/.test(code)) return 'main';
    return null;
  }
  return null;
}

export function boardInfo(symbol) {
  const b = boardOf(symbol);
  return b ? BOARDS[b] : null;
}

export const isST = (name = '') => /ST/i.test(String(name).replace(/\s/g, ''));
export const isDelisting = (name = '') => /退$|^退市/.test(String(name).trim());

/** 涨跌幅限制比例（不含新股上市初期等特殊情况） */
export function priceLimitPct(symbol, name = '', date = shDate(Date.now())) {
  const board = boardOf(symbol);
  if (!board) return null;
  if (board === 'main' && isST(name)) return date >= ST_MAIN_10PCT_FROM ? 0.10 : 0.05;
  return BOARDS[board].limitPct;
}

/** 四舍五入到分，避免二进制浮点误差（例如 1.005 → 1.01） */
export function round2(x) {
  if (!Number.isFinite(x)) return NaN;
  return Math.round((x + Math.sign(x) * 1e-9) * 100) / 100;
}

export function limitPrices(prevClose, pct) {
  if (!(prevClose > 0) || !(pct > 0)) return null;
  return { up: round2(prevClose * (1 + pct)), down: round2(prevClose * (1 - pct)) };
}

/**
 * 当日有效价格区间：优先使用数据源给出的涨跌停价；否则按规则估算。
 * 若委托归属的交易日不是行情所在交易日（例如收盘后预埋次日委托），
 * 以当前价作为次日“昨收”估算区间。
 */
export function priceBand(quote, { tradeDate, name } = {}) {
  if (!quote) return null;
  const symbol = quote.symbol;
  const pct = priceLimitPct(symbol, name || quote.name, tradeDate || quote.dataDate);
  if (pct == null) return null;
  const sameDay = !tradeDate || !quote.dataDate || quote.dataDate === tradeDate || quote.demo;
  if (sameDay && quote.limitUp > 0 && quote.limitDown > 0) {
    return { up: quote.limitUp, down: quote.limitDown, pct, source: 'feed' };
  }
  const base = sameDay ? quote.prevClose : quote.price;
  const band = limitPrices(base, pct);
  return band ? { ...band, pct, source: sameDay ? 'estimated' : 'next-day-estimated' } : null;
}

export function isTickAligned(price) {
  return Math.abs(Math.round(price * 100) - price * 100) < 1e-6;
}

/** 校验委托数量。sellable 为卖出时的可卖数量。返回 { ok, reason } */
export function validateQuantity({ symbol, side, qty, sellable = 0 }) {
  const board = boardInfo(symbol);
  if (!board) return { ok: false, reason: '暂不支持该证券类型的模拟交易' };
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: '委托数量必须为正整数' };
  if (qty > board.maxLimitQty) {
    return { ok: false, reason: `${board.label}单笔申报不得超过 ${board.maxLimitQty.toLocaleString('zh-CN')} 股` };
  }
  if (side === 'buy') {
    if (qty < board.buyMin) return { ok: false, reason: `${board.label}买入不少于 ${board.buyMin} 股` };
    if (board.buyStep > 1 && qty % board.buyStep !== 0) {
      return { ok: false, reason: `${board.label}买入数量须为 ${board.buyStep} 股的整数倍` };
    }
    return { ok: true };
  }
  // 卖出
  if (qty > sellable) return { ok: false, reason: `可卖数量不足（当前可卖 ${sellable} 股）` };
  if (qty === sellable) return { ok: true };
  if (board.buyStep > 1) {
    // 主板 / 创业板：整手卖出，零股必须一次性卖出
    const odd = sellable % 100;
    if (qty % 100 === 0 || (odd > 0 && qty % 100 === odd)) return { ok: true };
    return { ok: false, reason: '卖出须为 100 股整数倍；不足 100 股的零股须一次性卖出' };
  }
  // 科创板 / 北交所：不少于 sellOddLot，超出部分 1 股递增；余额不足部分须一次性卖出
  if (qty >= board.sellOddLot) return { ok: true };
  return { ok: false, reason: `${board.label}卖出不少于 ${board.sellOddLot} 股；不足部分须一次性全部卖出` };
}

/** 买入数量的“步进”与“最小值”，供界面 +/- 按钮使用 */
export function quantityStep(symbol, side) {
  const b = boardInfo(symbol);
  if (!b) return { min: 100, step: 100 };
  if (side === 'buy') return { min: b.buyMin, step: b.buyStep === 1 ? 1 : 100 };
  return { min: 1, step: b.buyStep === 1 ? 1 : 100 };
}

/** 在资金约束下可买的最大合法数量 */
export function maxBuyQty({ symbol, cash, price, feeFn }) {
  const b = boardInfo(symbol);
  if (!b || !(price > 0) || !(cash > 0)) return 0;
  const step = b.buyStep;
  let qty = Math.floor(cash / price);
  qty = Math.min(qty, b.maxLimitQty);
  if (step > 1) qty = Math.floor(qty / step) * step;
  while (qty >= b.buyMin) {
    const amount = qty * price;
    const fee = feeFn ? feeFn(amount) : 0;
    if (amount + fee <= cash + 1e-9) return qty;
    qty -= step;
  }
  return 0;
}

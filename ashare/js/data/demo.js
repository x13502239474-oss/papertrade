// 静态演示快照（仅在用户主动切换“演示快照”或离线无源查看时启用）。
// 严格遵守：不伪装为实时行情，不生成随机波动，明确标注 snapshot 采集时间与“演示行情（非实时）”。
import { fromShanghai } from '../core/time.js';

export const DEMO_SNAPSHOT_DATE = '2026-11-26';
export const DEMO_SNAPSHOT_TIME = fromShanghai('2026-11-26', 15, 0, 0);
export const DEMO_SOURCE = '静态演示快照（2026-11-26 收盘参考）';

export const DEMO_INDICES = [
  { symbol: 'sh000001', code: '000001', exchange: 'SH', name: '上证指数', price: 3476.88, prevClose: 3476.47, change: 0.41, changePct: 0.01, open: 3490.14, high: 3497.81, low: 3455.04, volume: 45406295900, amount: 613332810452, time: DEMO_SNAPSHOT_TIME, dataDate: DEMO_SNAPSHOT_DATE, source: DEMO_SOURCE, demo: true },
  { symbol: 'sz399001', code: '399001', exchange: 'SZ', name: '深证成指', price: 10084.04, prevClose: 10086.36, change: -2.32, changePct: -0.02, open: 10184.94, high: 10235.50, low: 9979.06, volume: 54473368600, amount: 704044360242, time: DEMO_SNAPSHOT_TIME, dataDate: DEMO_SNAPSHOT_DATE, source: DEMO_SOURCE, demo: true },
  { symbol: 'sz399006', code: '399006', exchange: 'SZ', name: '创业板指', price: 2189.82, prevClose: 2183.58, change: 6.24, changePct: 0.29, open: 2210.12, high: 2224.80, low: 2168.40, volume: 18940210000, amount: 312840000000, time: DEMO_SNAPSHOT_TIME, dataDate: DEMO_SNAPSHOT_DATE, source: DEMO_SOURCE, demo: true },
  { symbol: 'sh000688', code: '000688', exchange: 'SH', name: '科创50', price: 1169.99, prevClose: 1186.14, change: -16.15, changePct: -1.36, open: 1188.00, high: 1195.60, low: 1162.10, volume: 3920140000, amount: 98420000000, time: DEMO_SNAPSHOT_TIME, dataDate: DEMO_SNAPSHOT_DATE, source: DEMO_SOURCE, demo: true },
  { symbol: 'bj899050', code: '899050', exchange: 'BJ', name: '北证50', price: 1298.45, prevClose: 1289.20, change: 9.25, changePct: 0.72, open: 1291.00, high: 1310.20, low: 1284.50, volume: 982100000, amount: 21650000000, time: DEMO_SNAPSHOT_TIME, dataDate: DEMO_SNAPSHOT_DATE, source: DEMO_SOURCE, demo: true },
];

function mkQuote(s) {
  const change = +(s.price - s.prevClose).toFixed(2);
  const changePct = +((change / s.prevClose) * 100).toFixed(2);
  return {
    ...s,
    code: s.symbol.slice(2),
    exchange: s.symbol.slice(0, 2).toUpperCase(),
    change,
    changePct,
    amplitude: +(((s.high - s.low) / s.prevClose) * 100).toFixed(2),
    time: DEMO_SNAPSHOT_TIME,
    dataDate: DEMO_SNAPSHOT_DATE,
    source: DEMO_SOURCE,
    delayText: '演示快照（非实时）',
    demo: true,
    bids: [],
    asks: [],
  };
}

export const DEMO_STOCKS = [
  mkQuote({ symbol: 'sh600519', name: '贵州茅台', price: 1469.00, prevClose: 1474.84, open: 1470.00, high: 1473.00, low: 1456.00, volume: 3240800, amount: 4747727455, turnoverRate: 0.26, pe: 22.35, pb: 6.77, limitUp: 1622.32, limitDown: 1327.36 }),
  mkQuote({ symbol: 'sz300750', name: '宁德时代', price: 204.22, prevClose: 208.42, open: 208.42, high: 209.99, low: 202.35, volume: 64201800, amount: 13156075944, turnoverRate: 1.51, pe: 10.78, pb: 2.44, limitUp: 250.10, limitDown: 166.74 }),
  mkQuote({ symbol: 'sh688981', name: '中芯国际', price: 116.50, prevClose: 122.00, open: 121.10, high: 122.50, low: 115.20, volume: 50576220, amount: 5953150388, turnoverRate: 2.53, pe: 116.85, pb: 6.12, limitUp: 146.40, limitDown: 97.60 }),
  mkQuote({ symbol: 'sz000001', name: '平安银行', price: 12.45, prevClose: 12.40, open: 12.41, high: 12.56, low: 12.36, volume: 154393600, amount: 1922080595, turnoverRate: 0.80, pe: 5.56, pb: 0.54, limitUp: 13.64, limitDown: 11.16 }),
  mkQuote({ symbol: 'bj920002', name: '万达轴承', price: 41.80, prevClose: 42.65, open: 42.50, high: 43.10, low: 41.20, volume: 802300, amount: 33980063, turnoverRate: 1.80, pe: 37.66, pb: 4.92, limitUp: 55.44, limitDown: 29.86 }),
  mkQuote({ symbol: 'sz300308', name: '中际旭创', price: 430.18, prevClose: 409.00, open: 417.94, high: 440.00, low: 413.00, volume: 46271280, amount: 19706246304, turnoverRate: 4.17, pe: 43.90, pb: 5.37, limitUp: 490.80, limitDown: 327.20 }),
  mkQuote({ symbol: 'sh688256', name: '寒武纪', price: 942.85, prevClose: 907.90, open: 920.00, high: 956.58, low: 888.20, volume: 9642544, amount: 8961265925, turnoverRate: 1.53, pe: 191.25, pb: 39.20, limitUp: 1089.48, limitDown: 726.32 }),
  mkQuote({ symbol: 'sh601318', name: '中国平安', price: 54.20, prevClose: 53.85, open: 53.90, high: 54.68, low: 53.60, volume: 68420000, amount: 3704120000, turnoverRate: 0.63, pe: 8.15, pb: 1.05, limitUp: 59.24, limitDown: 48.47 }),
  mkQuote({ symbol: 'sh600036', name: '招商银行', price: 39.65, prevClose: 39.40, open: 39.48, high: 39.92, low: 39.25, volume: 59200000, amount: 2345800000, turnoverRate: 0.29, pe: 6.64, pb: 0.98, limitUp: 43.34, limitDown: 35.46 }),
  mkQuote({ symbol: 'sz002594', name: '比亚迪', price: 286.50, prevClose: 282.10, open: 283.00, high: 289.20, low: 281.40, volume: 18540000, amount: 5312400000, turnoverRate: 1.02, pe: 22.80, pb: 5.15, limitUp: 310.31, limitDown: 253.89 }),
  mkQuote({ symbol: 'sz000858', name: '五粮液', price: 138.40, prevClose: 139.80, open: 139.20, high: 140.10, low: 137.80, volume: 15210000, amount: 2110450000, turnoverRate: 0.39, pe: 17.10, pb: 3.92, limitUp: 153.78, limitDown: 125.82 }),
  mkQuote({ symbol: 'sz300059', name: '东方财富', price: 23.85, prevClose: 23.40, open: 23.55, high: 24.30, low: 23.32, volume: 325400000, amount: 7782000000, turnoverRate: 2.45, pe: 42.60, pb: 4.88, limitUp: 28.08, limitDown: 18.72 }),
  mkQuote({ symbol: 'sh600900', name: '长江电力', price: 28.45, prevClose: 28.32, open: 28.38, high: 28.60, low: 28.20, volume: 48200000, amount: 1371200000, turnoverRate: 0.20, pe: 21.40, pb: 3.31, limitUp: 31.15, limitDown: 25.49 }),
  mkQuote({ symbol: 'sz000333', name: '美的集团', price: 73.20, prevClose: 72.55, open: 72.70, high: 73.85, low: 72.30, volume: 22450000, amount: 1642100000, turnoverRate: 0.32, pe: 13.85, pb: 2.86, limitUp: 79.81, limitDown: 65.30 }),
  mkQuote({ symbol: 'sz300502', name: '新易盛', price: 189.03, prevClose: 181.30, open: 185.99, high: 189.70, low: 179.61, volume: 88319954, amount: 16315284157, turnoverRate: 7.04, pe: 19.67, pb: 9.43, limitUp: 217.56, limitDown: 145.04 }),
  mkQuote({ symbol: 'bj835185', name: '贝特瑞', price: 24.60, prevClose: 23.95, open: 24.10, high: 25.10, low: 23.80, volume: 12450000, amount: 306200000, turnoverRate: 1.12, pe: 18.40, pb: 2.25, limitUp: 31.14, limitDown: 16.77 }),
];

export const DEMO_MAP = new Map([...DEMO_INDICES, ...DEMO_STOCKS].map((x) => [x.symbol, x]));

export const demoProvider = {
  id: 'demo',
  label: '演示快照（离线）',
  delayText: '演示快照（非实时）',
  supportsOrderBook: false,
  supportedTimeframes: [],

  async getIndices() {
    return { items: DEMO_INDICES, time: DEMO_SNAPSHOT_TIME, source: DEMO_SOURCE, delayText: this.delayText, demo: true };
  },

  async getList({ board = 'all', sort = 'amount', asc = false, page = 1, pageSize = 30 } = {}) {
    let list = [...DEMO_STOCKS];
    if (board === 'sh_main') list = list.filter((x) => x.exchange === 'SH' && x.code.startsWith('60'));
    else if (board === 'sz_main') list = list.filter((x) => x.exchange === 'SZ' && x.code.startsWith('00'));
    else if (board === 'chinext') list = list.filter((x) => x.exchange === 'SZ' && x.code.startsWith('30'));
    else if (board === 'star') list = list.filter((x) => x.exchange === 'SH' && x.code.startsWith('68'));
    else if (board === 'bse') list = list.filter((x) => x.exchange === 'BJ');
    const keyMap = { changePct: 'changePct', amount: 'amount', turnoverRate: 'turnoverRate', price: 'price' };
    const k = keyMap[sort] || 'amount';
    list.sort((a, b) => (asc ? (a[k] ?? 0) - (b[k] ?? 0) : (b[k] ?? 0) - (a[k] ?? 0)));
    const start = (page - 1) * pageSize;
    return {
      items: list.slice(start, start + pageSize),
      total: list.length,
      time: DEMO_SNAPSHOT_TIME,
      source: DEMO_SOURCE,
      delayText: this.delayText,
      demo: true,
    };
  },

  async getQuotes(symbols) {
    const map = {};
    for (const s of symbols) {
      if (DEMO_MAP.has(s)) map[s] = DEMO_MAP.get(s);
    }
    return { quotes: map, time: DEMO_SNAPSHOT_TIME, source: DEMO_SOURCE, delayText: this.delayText, demo: true };
  },

  async getChart() {
    return {
      supported: false,
      reason: '演示模式为静态收盘快照，不含历史 K 线与分时数据（未用假数据补图）。请切换公开行情或自定义代理获取真实图表。',
      points: [],
      source: DEMO_SOURCE,
      demo: true,
    };
  },
};

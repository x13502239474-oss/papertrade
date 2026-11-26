// 新浪财经公开榜单接口解析器与请求封装：
//   * 板块排行：https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData
//   * 板块总数：https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount
// 响应头包含 Access-Control-Allow-Origin: *，可在 GitHub Pages 静态站点直接请求。
import { shDate, fromShanghai } from '../core/time.js';
import { latestDataDate } from '../core/session.js';
import { boardOf } from '../core/rules.js';

export const SINA_SOURCE = '新浪财经公开行情';
export const SINA_DELAY = '免费网页快照（延迟数秒至数十秒，缓存约 10 秒）';

const NODE_MAP = {
  all: 'hs_a',
  sh_main: 'sh_a',
  sz_main: 'sz_a',
  chinext: 'cyb',
  star: 'kcb',
  bse: 'hs_bjs',
};

const SORT_MAP = {
  changePct: 'changepercent',
  amount: 'amount',
  turnoverRate: 'turnoverratio',
  price: 'trade',
};

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 解析新浪 getHQNodeData 返回的 JSON 数组 */
export function parseSinaList(rows, { now = Date.now(), source = SINA_SOURCE, delayText = SINA_DELAY } = {}) {
  if (!Array.isArray(rows)) return [];
  const dataDate = latestDataDate(now);
  return rows.map((r) => {
    const symbol = String(r.symbol || '').toLowerCase();
    const exchange = symbol.slice(0, 2).toUpperCase();
    const code = String(r.code || symbol.slice(2));
    const price = num(r.trade);
    const prevClose = num(r.settlement);
    const open = num(r.open);
    const high = num(r.high);
    const low = num(r.low);
    const volume = num(r.volume);
    const amount = num(r.amount);
    let time = null;
    if (typeof r.ticktime === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(r.ticktime)) {
      const [hh, mm, ss] = r.ticktime.split(':').map(Number);
      time = fromShanghai(dataDate, hh, mm, ss);
    }
    return {
      symbol, code, exchange,
      name: String(r.name || code),
      isIndex: false,
      price: price ?? prevClose,
      prevClose, open, high, low,
      change: num(r.pricechange),
      changePct: num(r.changepercent),
      volume, amount,
      turnoverRate: num(r.turnoverratio),
      pe: num(r.per),
      pb: num(r.pb),
      amplitude: high != null && low != null && prevClose > 0 ? +(((high - low) / prevClose) * 100).toFixed(2) : null,
      totalCap: num(r.mktcap) != null ? num(r.mktcap) * 10000 : null,
      floatCap: num(r.nmc) != null ? num(r.nmc) * 10000 : null,
      limitUp: null, limitDown: null,
      bids: [], asks: [],
      noTrade: !(price > 0) || (open === 0 && volume === 0),
      time: time || now,
      dataDate: time ? shDate(time) : dataDate,
      source, delayText,
      demo: false,
    };
  }).filter((x) => /^(sh|sz|bj)\d{6}$/.test(x.symbol));
}

export async function fetchSinaList({ board = 'all', sort = 'amount', asc = false, page = 1, pageSize = 40, fetchImpl = fetch, signal, now = Date.now() } = {}) {
  const node = NODE_MAP[board] || 'hs_a';
  const sortField = SORT_MAP[sort] || 'amount';
  // 沪市主板/深市主板在 Sina 中分别用 sh_a / sz_a 拉取并过滤掉科创板/创业板
  const needFilterMain = board === 'sh_main' || board === 'sz_main';
  const reqSize = needFilterMain ? Math.min(80, pageSize * 2) : pageSize;
  const base = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center';
  const url = `${base}.getHQNodeData?page=${page}&num=${reqSize}&sort=${sortField}&asc=${asc ? 1 : 0}&node=${node}`;

  const listRes = await fetchImpl(url, { signal });
  if (listRes.status === 429 || listRes.status === 456) {
    throw Object.assign(new Error('新浪行情请求频率受限'), { code: 'RATE_LIMIT' });
  }
  if (!listRes.ok) throw new Error(`新浪榜单 HTTP ${listRes.status}`);
  const rows = await listRes.json();
  let items = parseSinaList(rows, { now });
  if (needFilterMain) items = items.filter((x) => boardOf(x.symbol) === 'main').slice(0, pageSize);

  const latestTime = items.reduce((m, x) => Math.max(m, x.time || 0), 0) || now;
  return { items, total: null, time: latestTime, source: SINA_SOURCE, delayText: SINA_DELAY, demo: false };
}

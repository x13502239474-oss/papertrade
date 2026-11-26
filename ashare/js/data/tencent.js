// 腾讯财经公开行情解析器与请求封装：
//   * 批量快照（含五档盘口）：https://qt.gtimg.cn/q=sh600519,sz300750  (CORS: *, GBK 编码)
//   * 前复权日/周/月 K 线：   https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,120,qfq (CORS: *, UTF-8)
//   * 当日分时：              https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=sh600519 (CORS: *, UTF-8)
//   * 五日分时：              https://web.ifzq.gtimg.cn/appstock/app/day/query?code=sh600519 (CORS: *, UTF-8)
// 注意：科创板股票（688/689）的成交量字段 f[6] 在腾讯接口中单位为“股”，而主板/创业板/北交所为“手”（100股），
// 本解析器已根据标的类型统一换算为“股”。
import { parseShanghaiStamp, expandDate } from '../core/time.js';
import { boardOf, parseSymbol } from '../core/rules.js';

export const TENCENT_SOURCE = '腾讯财经公开快照';
export const TENCENT_DELAY = '免费网页快照（延迟数秒至数十秒，非 Level-2）';

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 解析 qt.gtimg.cn 返回的单条或多条 v_sh600519="..."; 文本 */
export function parseTencentQuotes(text, { source = TENCENT_SOURCE, delayText = TENCENT_DELAY } = {}) {
  const quotes = {};
  const re = /v_([a-z]{2}\d{6})="([^"]*)"/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const symbol = m[1].toLowerCase();
    const raw = m[2];
    if (!raw) continue;
    const f = raw.split('~');
    if (f.length < 45) continue;
    const exchange = symbol.slice(0, 2).toUpperCase();
    const code = f[2] || symbol.slice(2);
    const name = (f[1] || '').trim();
    const price = num(f[3]);
    const prevClose = num(f[4]);
    const open = num(f[5]);
    const rawVol = num(f[6]);
    const change = num(f[31]);
    const changePct = num(f[32]);
    const high = num(f[33]);
    const low = num(f[34]);
    const triple = (f[35] || '').split('/');
    const amount = num(triple[2]) ?? (num(f[37]) != null ? num(f[37]) * 10000 : null);
    const turnoverRate = num(f[38]);
    const pe = num(f[39]);
    const amplitude = num(f[43]);
    const floatCap = num(f[44]) != null ? num(f[44]) * 1e8 : null;
    const totalCap = num(f[45]) != null ? num(f[45]) * 1e8 : null;
    const pb = num(f[46]);
    const rawUp = num(f[47]);
    const rawDown = num(f[48]);
    const limitUp = rawUp != null && rawUp > 0 ? rawUp : null;
    const limitDown = rawDown != null && rawDown > 0 ? rawDown : null;
    const stockType = (f[61] || '').trim();
    const isIndex = stockType === 'ZS' || (exchange === 'SH' && code.startsWith('000')) || (exchange === 'SZ' && code.startsWith('399')) || (exchange === 'BJ' && code.startsWith('899'));

    // 成交量统一为“股”：科创板 f[6] 为股，其余 A 股与指数通常为手（100 股），可通过 amount/(vol*price) 二次校准
    let volume = rawVol;
    if (rawVol != null && !isIndex) {
      const board = boardOf(symbol);
      if (board === 'star') {
        volume = rawVol;
      } else if (amount > 0 && price > 0 && rawVol > 0) {
        const ratio = amount / (rawVol * price);
        volume = ratio > 50 ? rawVol * 100 : rawVol;
      } else {
        volume = rawVol * 100;
      }
    }

    // 五档盘口（买卖一至五档；盘口量在腾讯接口中通常为手）
    const bids = [];
    const asks = [];
    if (!isIndex) {
      for (let i = 0; i < 5; i++) {
        const bp = num(f[9 + i * 2]);
        const bv = num(f[10 + i * 2]);
        if (bp > 0) bids.push({ price: bp, vol: bv || 0 });
        const ap = num(f[19 + i * 2]);
        const av = num(f[20 + i * 2]);
        if (ap > 0) asks.push({ price: ap, vol: av || 0 });
      }
    }

    const stamp = f[30] || '';
    const time = parseShanghaiStamp(stamp);
    const dataDate = /^\d{8}/.test(stamp) ? expandDate(stamp.slice(0, 8)) : null;
    const noTrade = !isIndex && ((open === 0 && rawVol === 0) || !(price > 0));

    quotes[symbol] = {
      symbol, code, exchange, name, isIndex,
      price: price ?? prevClose,
      prevClose, open, high, low,
      change: change ?? (price != null && prevClose != null ? +(price - prevClose).toFixed(2) : null),
      changePct,
      volume, amount, turnoverRate, pe, pb, amplitude,
      floatCap, totalCap, limitUp, limitDown,
      bids, asks,
      noTrade,
      time, dataDate,
      source, delayText,
      demo: false,
    };
  }
  return quotes;
}

/** 解析腾讯 K 线 JSON（day / week / month） */
export function parseTencentKline(json, symbol, period) {
  const rec = json?.data?.[symbol];
  if (!rec) return { supported: true, points: [], preClose: null };
  const key = `qfq${period}`;
  const rows = rec[key] || rec[period] || [];
  const points = rows.map((r) => ({
    date: String(r[0]),
    open: Number(r[1]),
    close: Number(r[2]),
    high: Number(r[3]),
    low: Number(r[4]),
    volume: Number(r[5]) || 0,
  })).filter((p) => Number.isFinite(p.close) && p.close > 0);
  const preClose = num(rec.prec);
  return { supported: true, points, preClose };
}

/** 解析腾讯当日分时 JSON */
export function parseTencentMinute(json, symbol) {
  const rec = json?.data?.[symbol];
  const rows = rec?.data?.data || [];
  const qt = rec?.qt?.[symbol];
  const prevClose = Array.isArray(qt) ? num(qt[4]) : null;
  const dateStr = rec?.data?.date ? expandDate(rec.data.date) : null;
  let prevCumVol = 0;
  let prevCumAmt = 0;
  const points = [];
  for (const row of rows) {
    const parts = String(row).trim().split(/\s+/);
    if (parts.length < 3) continue;
    const hhmm = parts[0];
    const price = Number(parts[1]);
    const cumVol = Number(parts[2]) || 0;
    const cumAmt = Number(parts[3]) || 0;
    if (!Number.isFinite(price) || !(price > 0)) continue;
    const vol = Math.max(0, cumVol - prevCumVol);
    const avg = cumAmt > 0 && cumVol > 0 ? cumAmt / (cumVol * (cumAmt / (cumVol * price) > 50 ? 100 : 1)) : price;
    prevCumVol = cumVol;
    prevCumAmt = cumAmt;
    points.push({
      time: `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`,
      price,
      avg: Number.isFinite(avg) && avg > 0 ? avg : price,
      volume: vol,
      cumAmt: prevCumAmt,
    });
  }
  return { supported: true, points, prevClose, date: dateStr };
}

/** 解析腾讯五日分时 JSON */
export function parseTencent5Day(json, symbol) {
  const rec = json?.data?.[symbol];
  const days = rec?.data || [];
  const qt = rec?.qt?.[symbol];
  const prevClose = Array.isArray(qt) ? num(qt[4]) : null;
  const points = [];
  // days 通常按日期倒序，转为时间正序
  const ordered = [...days].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const d of ordered) {
    const dLabel = d.date ? `${String(d.date).slice(4, 6)}-${String(d.date).slice(6, 8)}` : '';
    let prevCumVol = 0;
    const rows = d.data || [];
    // 每 5 分钟采样以保持清晰度（约 240 点）
    for (let i = 0; i < rows.length; i++) {
      const parts = String(rows[i]).trim().split(/\s+/);
      if (parts.length < 3) continue;
      const hhmm = parts[0];
      const price = Number(parts[1]);
      const cumVol = Number(parts[2]) || 0;
      const vol = Math.max(0, cumVol - prevCumVol);
      prevCumVol = cumVol;
      if (i % 5 !== 0 && i !== rows.length - 1) continue;
      if (!Number.isFinite(price) || !(price > 0)) continue;
      points.push({
        time: `${dLabel} ${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`,
        day: dLabel,
        price,
        volume: vol,
      });
    }
  }
  return { supported: true, points, prevClose };
}

export async function fetchTencentQuotes(symbols, { fetchImpl = fetch, signal } = {}) {
  const clean = [...new Set(symbols.map((s) => String(s).toLowerCase()).filter((s) => /^(sh|sz|bj)\d{6}$/.test(s)))];
  if (!clean.length) return {};
  // 分批每批最多 60 个，避免 URL 过长
  const out = {};
  for (let i = 0; i < clean.length; i += 60) {
    const batch = clean.slice(i, i + 60);
    const res = await fetchImpl(`https://qt.gtimg.cn/q=${batch.join(',')}`, { signal });
    if (res.status === 429) throw Object.assign(new Error('行情请求频率受限'), { code: 'RATE_LIMIT' });
    if (!res.ok) throw new Error(`腾讯行情 HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('gbk').decode(buf);
    Object.assign(out, parseTencentQuotes(text));
  }
  return out;
}

export async function fetchTencentChart(symbol, timeframe, { fetchImpl = fetch, signal } = {}) {
  const p = parseSymbol(symbol);
  if (!p) return { supported: false, reason: '无效股票代码', points: [] };
  const sym = p.symbol;
  if (timeframe === '1D') {
    const res = await fetchImpl(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${sym}`, { signal });
    if (!res.ok) throw new Error(`分时数据 HTTP ${res.status}`);
    return { ...parseTencentMinute(await res.json(), sym), source: TENCENT_SOURCE, delayText: TENCENT_DELAY };
  }
  if (timeframe === '5D') {
    const res = await fetchImpl(`https://web.ifzq.gtimg.cn/appstock/app/day/query?code=${sym}`, { signal });
    if (!res.ok) throw new Error(`五日分时 HTTP ${res.status}`);
    return { ...parseTencent5Day(await res.json(), sym), source: TENCENT_SOURCE, delayText: TENCENT_DELAY };
  }
  const map = { D: 'day', W: 'week', M: 'month' };
  const period = map[timeframe];
  if (!period) {
    return {
      supported: false,
      reason: `当前公开行情源不支持“${timeframe}”周期，未以假数据补图；如需分钟 K 线请配置支持该周期的代理数据源。`,
      points: [],
      source: TENCENT_SOURCE,
    };
  }
  const count = period === 'day' ? 120 : period === 'week' ? 80 : 60;
  const res = await fetchImpl(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},${period},,,${count},qfq`, { signal });
  if (!res.ok) throw new Error(`K 线数据 HTTP ${res.status}`);
  return { ...parseTencentKline(await res.json(), sym, period), source: TENCENT_SOURCE, delayText: TENCENT_DELAY };
}

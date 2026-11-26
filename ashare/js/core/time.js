// 时间工具：所有交易相关的日期/时段一律按北京时间（Asia/Shanghai，UTC+8，无夏令时）计算，
// 不依赖浏览器本地时区。
const OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function shParts(ms) {
  const d = new Date(ms + OFFSET_MS);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds(), wd: d.getUTCDay(),
  };
}

/** 'YYYY-MM-DD'（北京时间） */
export function shDate(ms) {
  const p = shParts(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** 'HH:MM:SS'（北京时间） */
export function shTime(ms, withSeconds = true) {
  const p = shParts(ms);
  return withSeconds ? `${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}` : `${pad(p.hh)}:${pad(p.mm)}`;
}

export function shDateTime(ms) {
  return `${shDate(ms)} ${shTime(ms)}`;
}

/** 当天 0 点起的分钟数（北京时间） */
export function shMinutes(ms) {
  const p = shParts(ms);
  return p.hh * 60 + p.mm;
}

/** 由北京时间的日期与时分秒构造毫秒时间戳 */
export function fromShanghai(dateStr, hh = 0, mm = 0, ss = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm, ss) - OFFSET_MS;
}

/** 解析 'YYYYMMDDHHMMSS' 或 'YYYY-MM-DD HH:MM[:SS]'（北京时间） */
export function parseShanghaiStamp(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
  if (!m) m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return fromShanghai(`${m[1]}-${m[2]}-${m[3]}`, +m[4], +m[5], +(m[6] || 0));
}

export function addDays(dateStr, n) {
  return shDate(fromShanghai(dateStr, 12) + n * DAY_MS);
}

/** 0=周日 … 6=周六 */
export function weekdayOf(dateStr) {
  return shParts(fromShanghai(dateStr, 12)).wd;
}

export function compactDate(dateStr) {
  return dateStr.replaceAll('-', '');
}

export function expandDate(yyyymmdd) {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ---- 可注入时钟：生产环境使用真实时间；调试 / 测试可设置偏移 ----
let clockOffset = 0;
export function now() { return Date.now() + clockOffset; }
export function setClockOffset(ms) { clockOffset = Number(ms) || 0; }
export function getClockOffset() { return clockOffset; }

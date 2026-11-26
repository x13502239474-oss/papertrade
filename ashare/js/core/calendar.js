// A 股交易日历。
// 数据来源：上海证券交易所每年发布的《关于上海证券交易所 XXXX 年部分节假日休市安排的通知》
// （深交所、北交所同步执行相同休市安排）。只列出落在周一至周五的休市日；周末本来就休市。
//   2025 年：上交所 2024 年 12 月发布的 2025 年休市安排（元旦、春节、清明、劳动节、端午、国庆中秋）
//   2026 年：上证公告〔2025〕45 号
// 未内置年份（例如 2027 年，交易所通常在前一年 12 月发布）将退化为“周一至周五均为交易日”的简化规则，
// 并通过 calendarCoverage() 明确告知界面。
import { addDays, weekdayOf } from './time.js';

export const HOLIDAYS = {
  2025: [
    '2025-01-01',
    '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03', '2025-02-04',
    '2025-04-04',
    '2025-05-01', '2025-05-02', '2025-05-05',
    '2025-06-02',
    '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08',
  ],
  2026: [
    '2026-01-01', '2026-01-02',
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23',
    '2026-04-06',
    '2026-05-01', '2026-05-04', '2026-05-05',
    '2026-06-19',
    '2026-09-25',
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
  ],
};

const HOLIDAY_SET = new Set(Object.values(HOLIDAYS).flat());

export function isKnownYear(year) {
  return Object.prototype.hasOwnProperty.call(HOLIDAYS, String(year));
}

export function calendarCoverage(dateStr) {
  const year = Number(dateStr.slice(0, 4));
  if (isKnownYear(year)) {
    return { known: true, year, note: `已内置 ${year} 年交易所休市安排` };
  }
  return {
    known: false,
    year,
    note: `未内置 ${year} 年休市安排：按“周一至周五为交易日”简化处理，法定节假日可能不准确`,
  };
}

export function isWeekend(dateStr) {
  const wd = weekdayOf(dateStr);
  return wd === 0 || wd === 6;
}

export function isTradingDay(dateStr) {
  if (isWeekend(dateStr)) return false;
  return !HOLIDAY_SET.has(dateStr);
}

export function nextTradingDay(dateStr) {
  let d = addDays(dateStr, 1);
  for (let i = 0; i < 30 && !isTradingDay(d); i++) d = addDays(d, 1);
  return d;
}

export function prevTradingDay(dateStr) {
  let d = addDays(dateStr, -1);
  for (let i = 0; i < 30 && !isTradingDay(d); i++) d = addDays(d, -1);
  return d;
}

/** 两个日期之间（不含 from，含 to）的交易日数量 */
export function tradingDaysBetween(from, to) {
  if (to <= from) return 0;
  let n = 0;
  let d = from;
  for (let i = 0; i < 4000 && d < to; i++) {
    d = addDays(d, 1);
    if (isTradingDay(d)) n++;
  }
  return n;
}

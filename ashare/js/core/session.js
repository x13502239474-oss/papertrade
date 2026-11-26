// 交易时段（沪深北股票竞价交易，北京时间）：
//   09:15-09:25 开盘集合竞价；09:25-09:30 静默（不撮合）
//   09:30-11:30 连续竞价；11:30-13:00 午间休市
//   13:00-14:57 连续竞价；14:57-15:00 收盘集合竞价
//   15:00 之后收盘（盘后固定价格交易不在本模拟范围内）
import { shDate, shMinutes } from './time.js';
import { isTradingDay, nextTradingDay, prevTradingDay, calendarCoverage } from './calendar.js';

const T = (h, m) => h * 60 + m;
export const SESSION = {
  auctionStart: T(9, 15), auctionEnd: T(9, 25), amOpen: T(9, 30), amClose: T(11, 30),
  pmOpen: T(13, 0), closeAuction: T(14, 57), close: T(15, 0),
};

const LABELS = {
  holiday: '休市日', pre: '盘前', auction: '集合竞价', preopen: '集合竞价结束',
  am: '连续竞价', lunch: '午间休市', pm: '连续竞价', 'close-auction': '收盘集合竞价', closed: '已收盘',
};

export function marketPhase(ms) {
  const date = shDate(ms);
  const min = shMinutes(ms);
  const tradingDay = isTradingDay(date);
  let phase;
  if (!tradingDay) phase = 'holiday';
  else if (min < SESSION.auctionStart) phase = 'pre';
  else if (min < SESSION.auctionEnd) phase = 'auction';
  else if (min < SESSION.amOpen) phase = 'preopen';
  else if (min < SESSION.amClose) phase = 'am';
  else if (min < SESSION.pmOpen) phase = 'lunch';
  else if (min < SESSION.closeAuction) phase = 'pm';
  else if (min < SESSION.close) phase = 'close-auction';
  else phase = 'closed';
  const continuous = phase === 'am' || phase === 'pm';
  const inSession = ['auction', 'preopen', 'am', 'lunch', 'pm', 'close-auction'].includes(phase);
  return {
    date,
    phase,
    label: LABELS[phase],
    tradingDay,
    continuous,
    inSession,
    calendar: calendarCoverage(date),
  };
}

/** 此刻下单所归属的交易日：交易日 15:00 前为当日；否则为下一交易日（类似券商“预埋单/夜市委托”）。 */
export function orderTradeDate(ms) {
  const date = shDate(ms);
  if (isTradingDay(date) && shMinutes(ms) < SESSION.close) return date;
  return nextTradingDay(date);
}

/** 此刻行情数据应归属的最近交易日：交易日 09:15 之后为当日，否则为上一个交易日。 */
export function latestDataDate(ms) {
  const date = shDate(ms);
  if (isTradingDay(date) && shMinutes(ms) >= SESSION.auctionStart) return date;
  return prevTradingDay(date);
}

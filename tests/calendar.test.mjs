import test from 'node:test';
import assert from 'node:assert/strict';
import { isTradingDay, nextTradingDay, prevTradingDay, calendarCoverage } from '../ashare/js/core/calendar.js';
import { marketPhase, orderTradeDate } from '../ashare/js/core/session.js';
import { fromShanghai } from '../ashare/js/core/time.js';

test('2026 年节假日与周末交易日历', () => {
  // 2026 春节 2/15-2/23 休市，2/24 开市
  assert.equal(isTradingDay('2026-02-13'), true);
  assert.equal(isTradingDay('2026-02-16'), false);
  assert.equal(isTradingDay('2026-02-23'), false);
  assert.equal(isTradingDay('2026-02-24'), true);
  assert.equal(nextTradingDay('2026-02-13'), '2026-02-24');
  assert.equal(prevTradingDay('2026-02-24'), '2026-02-13');

  // 国庆 10/1-10/7 休市，10/8 开市
  assert.equal(nextTradingDay('2026-09-30'), '2026-10-08');

  // 未内置年份（2027）明确标注简化规则
  assert.equal(calendarCoverage('2026-11-26').known, true);
  assert.equal(calendarCoverage('2027-02-10').known, false);
});

test('交易时段与委托归属交易日', () => {
  assert.equal(marketPhase(fromShanghai('2026-11-26', 9, 20)).phase, 'auction');
  assert.equal(marketPhase(fromShanghai('2026-11-26', 10, 0)).continuous, true);
  assert.equal(marketPhase(fromShanghai('2026-11-26', 12, 0)).phase, 'lunch');
  assert.equal(marketPhase(fromShanghai('2026-11-26', 14, 0)).continuous, true);
  assert.equal(marketPhase(fromShanghai('2026-11-26', 14, 58)).phase, 'close-auction');
  assert.equal(marketPhase(fromShanghai('2026-11-26', 15, 5)).phase, 'closed');
  assert.equal(marketPhase(fromShanghai('2026-11-28', 10, 0)).phase, 'holiday'); // 周六

  // 15:00 前归属当日，15:00 后归属下一交易日（周五收盘后归属下周一）
  assert.equal(orderTradeDate(fromShanghai('2026-11-27', 14, 30)), '2026-11-27');
  assert.equal(orderTradeDate(fromShanghai('2026-11-27', 15, 1)), '2026-11-30');
});

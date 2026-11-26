import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSymbol, boardOf, priceLimitPct, limitPrices, validateQuantity,
  isTickAligned, maxBuyQty, isST, isDelisting, toTsCode,
} from '../ashare/js/core/rules.js';

test('parseSymbol & boardOf 覆盖沪深主板、创业板、科创板、北交所', () => {
  assert.deepEqual(parseSymbol('600519'), { exchange: 'SH', code: '600519', symbol: 'sh600519' });
  assert.deepEqual(parseSymbol('300750.SZ'), { exchange: 'SZ', code: '300750', symbol: 'sz300750' });
  assert.deepEqual(parseSymbol('sh688981'), { exchange: 'SH', code: '688981', symbol: 'sh688981' });
  assert.deepEqual(parseSymbol('920002'), { exchange: 'BJ', code: '920002', symbol: 'bj920002' });
  assert.equal(toTsCode('sh600519'), '600519.SH');

  assert.equal(boardOf('sh600519'), 'main');
  assert.equal(boardOf('sz000001'), 'main');
  assert.equal(boardOf('sz300750'), 'chinext');
  assert.equal(boardOf('sh688981'), 'star');
  assert.equal(boardOf('bj920002'), 'bse');
  assert.equal(boardOf('sh000001'), null); // 指数不可交易
});

test('涨跌幅限制与 2026-07-06 主板 ST 新规', () => {
  assert.equal(priceLimitPct('sh600519', '贵州茅台', '2026-11-26'), 0.10);
  assert.equal(priceLimitPct('sz300750', '宁德时代', '2026-11-26'), 0.20);
  assert.equal(priceLimitPct('sh688981', '中芯国际', '2026-11-26'), 0.20);
  assert.equal(priceLimitPct('bj920002', '万达轴承', '2026-11-26'), 0.30);

  // 主板 ST 在 2026-07-06 前为 5%，实施后为 10%
  assert.equal(isST('*ST华铁'), true);
  assert.equal(isDelisting('退市海越'), true);
  assert.equal(priceLimitPct('sh600100', 'ST示例', '2026-07-05'), 0.05);
  assert.equal(priceLimitPct('sh600100', 'ST示例', '2026-07-06'), 0.10);

  assert.deepEqual(limitPrices(10.00, 0.10), { up: 11.00, down: 9.00 });
  assert.deepEqual(limitPrices(10.05, 0.10), { up: 11.06, down: 9.05 });
});

test('不同板块的买入与卖出数量校验', () => {
  // 主板 / 创业板：买入 100 股整数倍
  assert.equal(validateQuantity({ symbol: 'sh600519', side: 'buy', qty: 100 }).ok, true);
  assert.equal(validateQuantity({ symbol: 'sh600519', side: 'buy', qty: 150 }).ok, false);
  assert.equal(validateQuantity({ symbol: 'sz300750', side: 'buy', qty: 101 }).ok, false);

  // 科创板：买入 >= 200 且超出部分 1 股递增
  assert.equal(validateQuantity({ symbol: 'sh688981', side: 'buy', qty: 100 }).ok, false);
  assert.equal(validateQuantity({ symbol: 'sh688981', side: 'buy', qty: 200 }).ok, true);
  assert.equal(validateQuantity({ symbol: 'sh688981', side: 'buy', qty: 201 }).ok, true);

  // 北交所：买入 >= 100 且超出部分 1 股递增
  assert.equal(validateQuantity({ symbol: 'bj920002', side: 'buy', qty: 99 }).ok, false);
  assert.equal(validateQuantity({ symbol: 'bj920002', side: 'buy', qty: 100 }).ok, true);
  assert.equal(validateQuantity({ symbol: 'bj920002', side: 'buy', qty: 137 }).ok, true);

  // 卖出零股规则：主板持仓 150 股，可卖 100 / 150 / 50，不可卖 120
  assert.equal(validateQuantity({ symbol: 'sh600519', side: 'sell', qty: 100, sellable: 150 }).ok, true);
  assert.equal(validateQuantity({ symbol: 'sh600519', side: 'sell', qty: 150, sellable: 150 }).ok, true);
  assert.equal(validateQuantity({ symbol: 'sh600519', side: 'sell', qty: 50, sellable: 150 }).ok, true);
  assert.equal(validateQuantity({ symbol: 'sh600519', side: 'sell', qty: 120, sellable: 150 }).ok, false);

  // 科创板卖出：可卖 180 股（不足 200）时须一次性全部卖出
  assert.equal(validateQuantity({ symbol: 'sh688981', side: 'sell', qty: 100, sellable: 180 }).ok, false);
  assert.equal(validateQuantity({ symbol: 'sh688981', side: 'sell', qty: 180, sellable: 180 }).ok, true);
});

test('最小价格变动单位与最大可买数量', () => {
  assert.equal(isTickAligned(12.34), true);
  assert.equal(isTickAligned(12.345), false);
  // 主板 10000 元买 10 元股，含 5 元佣金：最多买 900 股（1000 股需要 10005）
  const qMain = maxBuyQty({ symbol: 'sz000001', cash: 10000, price: 10, feeFn: () => 5 });
  assert.equal(qMain, 900);
  // 科创板 10000 元买 10 元股，含 5 元佣金：可买 999 股（9990 + 5 <= 10000）
  const qStar = maxBuyQty({ symbol: 'sh688981', cash: 10000, price: 10, feeFn: () => 5 });
  assert.equal(qStar, 999);
});

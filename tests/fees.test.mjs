import test from 'node:test';
import assert from 'node:assert/strict';
import { calcFees, DEFAULT_FEES } from '../ashare/js/core/fees.js';

test('费用计算：最低佣金、卖出印花税、沪深与北交所过户费', () => {
  // 小额买入触发最低佣金 ¥5，买入无印花税，沪市有过户费
  const buySmall = calcFees({ side: 'buy', amount: 10000, exchange: 'SH' });
  assert.equal(buySmall.commission, 5);
  assert.equal(buySmall.stampDuty, 0);
  assert.equal(buySmall.transferFee, 0.1);
  assert.equal(buySmall.total, 5.1);

  // 大额卖出（100,000 元）：佣金 25，印花税 50，深市过户费 1
  const sellLarge = calcFees({ side: 'sell', amount: 100000, exchange: 'SZ' });
  assert.equal(sellLarge.commission, 25);
  assert.equal(sellLarge.stampDuty, 50);
  assert.equal(sellLarge.transferFee, 1);
  assert.equal(sellLarge.total, 76);

  // 北交所默认不收过户费
  const bjSell = calcFees({ side: 'sell', amount: 100000, exchange: 'BJ' });
  assert.equal(bjSell.transferFee, 0);
  assert.equal(bjSell.total, 75);

  // 用户自定义练习参数生效
  const custom = calcFees({ side: 'buy', amount: 10000, exchange: 'SH' }, { ...DEFAULT_FEES, commissionRate: 0.0001, commissionMin: 1 });
  assert.equal(custom.commission, 1);
});

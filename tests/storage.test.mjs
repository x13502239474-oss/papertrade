import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateV1, exportBackup, parseBackup, loadAccount, LEGACY_KEY } from '../ashare/js/core/storage.js';
import { createAccount, sellableQty } from '../ashare/js/core/account.js';

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('旧版 v1 本地数据自动迁移至 v2 并保留持仓与 T+1 锁仓', () => {
  const v1 = {
    cash: 66400,
    positions: { '600519': { qty: 20, available: 10, today: 10, avgCost: 1680 } },
    watchlist: ['600519', '300750'],
    trades: [{ symbol: '600519', qty: 10, side: 'buy', price: 1680, time: 1795650000000 }],
    day: '2026-11-26',
  };
  const migrated = migrateV1(v1);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.cash, 66400);
  assert.equal(migrated.positions['sh600519'].qty, 20);
  assert.equal(sellableQty(migrated.positions['sh600519'], '2026-11-26'), 10);
  assert.equal(sellableQty(migrated.positions['sh600519'], '2026-11-27'), 20);
  assert.equal(migrated.watch.groups[0].items.length, 2);
  assert.equal(migrated.fills.length, 1);

  const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify(v1) });
  const loaded = loadAccount(storage);
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.state.positions['sh600519'].qty, 20);
});

test('导出与导入备份往返一致，拒绝损坏或错误版本备份', () => {
  const acc = createAccount({ initialCash: 200_000 });
  acc.cash = 188_888.5;
  const json = exportBackup(acc);
  const restored = parseBackup(json);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.initialCash, 200_000);
  assert.equal(restored.state.cash, 188_888.5);

  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup(JSON.stringify({ version: 99, cash: 100 })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ version: 2, cash: -1, initialCash: 100, positions: {}, orders: [], fills: [] })).ok, false);
});

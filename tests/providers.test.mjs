import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseTencentQuotes, parseTencentKline, parseTencentMinute,
} from '../ashare/js/data/tencent.js';
import { parseSinaList } from '../ashare/js/data/sina.js';
import { MarketService } from '../ashare/js/data/provider.js';

const fix = (name) => new URL(`./fixtures/${name}`, import.meta.url);

test('解析真实腾讯行情快照（含主板/创业板/科创板/北交所及五档盘口）', () => {
  const buf = fs.readFileSync(fix('tencent-quote.txt'));
  const text = new TextDecoder('gbk').decode(buf);
  const quotes = parseTencentQuotes(text);

  assert.equal(quotes['sh600519'].name, '贵州茅台');
  assert.equal(quotes['sh600519'].price, 1469);
  assert.equal(quotes['sh600519'].bids.length, 5);
  assert.equal(quotes['sh600519'].asks.length, 5);
  assert.equal(quotes['sh600519'].volume, 3240800); // 手 → 股
  assert.equal(quotes['sh600519'].limitUp, 1622.32);

  // 科创板在腾讯快照中 f[6] 原单位已是“股”，不应再乘 100
  assert.equal(quotes['sh688981'].name, '中芯国际');
  assert.equal(quotes['sh688981'].volume, 50576220);

  // 北交所
  assert.equal(quotes['bj920002'].name, '万达轴承');
  assert.equal(quotes['bj920002'].exchange, 'BJ');
});

test('解析真实腾讯指数、分时与周 K 线快照', () => {
  const idxText = new TextDecoder('gbk').decode(fs.readFileSync(fix('tencent-index.txt')));
  const idx = parseTencentQuotes(idxText);
  assert.equal(idx['sh000001'].name, '上证指数');
  assert.equal(idx['sh000001'].isIndex, true);
  assert.equal(idx['sh000001'].bids.length, 0);

  const minJson = JSON.parse(fs.readFileSync(fix('tencent-minute.json'), 'utf8'));
  const min = parseTencentMinute(minJson, 'sh600519');
  assert.ok(min.points.length > 200);
  assert.equal(min.points[0].time, '09:30');
  assert.equal(min.points[0].price, 1470);

  const wkJson = JSON.parse(fs.readFileSync(fix('tencent-kline-week.json'), 'utf8'));
  const wk = parseTencentKline(wkJson, 'sz300750', 'week');
  assert.equal(wk.points.length, 3);
  assert.equal(wk.points[2].close, 204.22);
});

test('解析真实新浪榜单快照', () => {
  const rows = JSON.parse(fs.readFileSync(fix('sina-list.json'), 'utf8'));
  const list = parseSinaList(rows);
  assert.equal(list.length, 5);
  assert.equal(list[0].symbol, 'sz300308');
  assert.equal(list[0].name, '中际旭创');
  assert.equal(list[0].price, 430.18);
  assert.equal(list[0].amount, 19706246304);
});

test('MarketService 故障、429 限流与演示快照状态切换', async () => {
  const statuses = [];
  const svc = new MarketService({
    mode: 'public',
    fetchImpl: async () => ({ ok: false, status: 429 }),
    onStatus: (s) => statuses.push(s.status),
  });
  await assert.rejects(() => svc.getQuotes(['sh600519']));
  assert.equal(svc.getStatus().status, 'rate_limited');

  svc.configure({ mode: 'demo' });
  const res = await svc.getIndices();
  assert.equal(res.demo, true);
  assert.equal(svc.getStatus().status, 'demo');

  svc.configure({ simulateFault: true });
  await assert.rejects(() => svc.getIndices());
  assert.equal(svc.getStatus().status, 'error');
});

// 行情服务门面（Provider 抽象 + 缓存 + 限流退避 + 状态管理）。
// 行情状态枚举：
//   connecting | live | delayed | offhours | rate_limited | error | demo
import { INDICES } from './catalog.js';
import { demoProvider } from './demo.js';
import { fetchTencentQuotes, fetchTencentChart, TENCENT_SOURCE, TENCENT_DELAY } from './tencent.js';
import { fetchSinaList } from './sina.js';
import { createProxyProvider } from './proxy.js';
import { marketPhase } from '../core/session.js';
import { now as clockNow } from '../core/time.js';

export const STATUS_META = {
  connecting:   { label: '连接中',       tone: 'info' },
  live:         { label: '正常更新',     tone: 'ok' },
  delayed:      { label: '延迟行情',     tone: 'warn' },
  offhours:     { label: '非交易时段',   tone: 'muted' },
  rate_limited: { label: '请求频率受限', tone: 'warn' },
  error:        { label: '数据源故障',   tone: 'err' },
  demo:         { label: '演示行情',     tone: 'warn' },
};

export const publicProvider = {
  id: 'public',
  label: '公开免费行情（腾讯 + 新浪）',
  delayText: TENCENT_DELAY,
  supportsOrderBook: true,
  supportedTimeframes: ['1D', '5D', 'D', 'W', 'M'],

  async getIndices(opts) {
    const syms = INDICES.map((x) => x.symbol);
    const map = await fetchTencentQuotes(syms, opts);
    const items = syms.map((s) => map[s]).filter(Boolean);
    const time = items.reduce((m, x) => Math.max(m, x.time || 0), 0) || clockNow();
    return { items, time, source: TENCENT_SOURCE, delayText: TENCENT_DELAY, demo: false };
  },

  async getList(params, opts) {
    return fetchSinaList({ ...params, ...opts, now: clockNow() });
  },

  async getQuotes(symbols, opts) {
    const quotes = await fetchTencentQuotes(symbols, opts);
    const vals = Object.values(quotes);
    const time = vals.reduce((m, x) => Math.max(m, x.time || 0), 0) || clockNow();
    return { quotes, time, source: TENCENT_SOURCE, delayText: TENCENT_DELAY, demo: false };
  },

  async getChart(symbol, timeframe, opts) {
    return fetchTencentChart(symbol, timeframe, opts);
  },
};

export class MarketService {
  constructor({ mode = 'public', proxyBase = '', fetchImpl = globalThis.fetch, onStatus } = {}) {
    this.mode = mode;
    this.proxyBase = proxyBase;
    this.fetchImpl = fetchImpl;
    this.onStatus = onStatus || (() => {});
    this.simulateFault = false;
    this.status = 'connecting';
    this.error = '';
    this.lastUpdated = null;
    this.source = '';
    this.delayText = '';
    this.quoteCache = new Map();
    this.chartCache = new Map();
    this.backoffUntil = 0;
  }

  configure({ mode, proxyBase, simulateFault }) {
    if (mode) this.mode = mode;
    if (proxyBase !== undefined) this.proxyBase = proxyBase;
    if (simulateFault !== undefined) this.simulateFault = !!simulateFault;
    this.chartCache.clear();
    this.backoffUntil = 0;
    if (this.mode === 'demo' && !this.simulateFault) {
      this._setStatus('demo', { source: demoProvider.label, delayText: demoProvider.delayText });
    }
  }

  get provider() {
    if (this.mode === 'demo') return demoProvider;
    if (this.mode === 'proxy') return createProxyProvider(this.proxyBase);
    return publicProvider;
  }

  _setStatus(status, extra = {}) {
    this.status = status;
    if (extra.error !== undefined) this.error = extra.error;
    if (extra.time) this.lastUpdated = extra.time;
    if (extra.source) this.source = extra.source;
    if (extra.delayText) this.delayText = extra.delayText;
    this.onStatus(this.getStatus());
  }

  getStatus() {
    return {
      status: this.status,
      meta: STATUS_META[this.status] || STATUS_META.error,
      mode: this.mode,
      source: this.source || this.provider.label,
      delayText: this.delayText || this.provider.delayText,
      lastUpdated: this.lastUpdated,
      error: this.error,
      offline: typeof navigator !== 'undefined' && navigator.onLine === false,
    };
  }

  _guard() {
    if (this.simulateFault) {
      this._setStatus('error', { error: '已开启“模拟行情故障”，当前暂不返回行情数据' });
      throw new Error(this.error);
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false && this.mode !== 'demo') {
      this._setStatus('error', { error: '当前浏览器处于离线状态，无法获取最新行情' });
      throw new Error(this.error);
    }
    if (this.backoffUntil > clockNow()) {
      const sec = Math.ceil((this.backoffUntil - clockNow()) / 1000);
      this._setStatus('rate_limited', { error: `行情请求频率受限，${sec} 秒后重试` });
      throw Object.assign(new Error(this.error), { code: 'RATE_LIMIT' });
    }
  }

  _recordSuccess(res) {
    if (res.demo) {
      this._setStatus('demo', { time: res.time, source: res.source, delayText: res.delayText, error: '' });
      return;
    }
    const phase = marketPhase(clockNow());
    let st;
    if (!phase.inSession) st = 'offhours';
    else if (this.mode === 'public') st = 'delayed'; // 公开网页快照始终如实标注延迟
    else st = 'live';
    this._setStatus(st, { time: res.time || clockNow(), source: res.source, delayText: res.delayText, error: '' });
  }

  _recordError(err) {
    if (err?.code === 'RATE_LIMIT') {
      this.backoffUntil = clockNow() + 30_000;
      this._setStatus('rate_limited', { error: err.message || '请求频率受限，请稍后再试' });
    } else {
      this._setStatus('error', { error: err?.message || '行情数据获取失败' });
    }
  }

  async getIndices(signal) {
    this._guard();
    try {
      const res = await this.provider.getIndices({ fetchImpl: this.fetchImpl, signal });
      for (const x of res.items || []) this.quoteCache.set(x.symbol, x);
      this._recordSuccess(res);
      return res;
    } catch (e) {
      if (e?.name !== 'AbortError') this._recordError(e);
      throw e;
    }
  }

  async getList(params, signal) {
    this._guard();
    try {
      const res = await this.provider.getList(params, { fetchImpl: this.fetchImpl, signal });
      for (const x of res.items || []) {
        const prev = this.quoteCache.get(x.symbol);
        // 保留已获取到的五档盘口和涨跌停价，避免榜单刷新覆盖详情盘口
        this.quoteCache.set(x.symbol, prev && prev.bids?.length ? { ...x, bids: prev.bids, asks: prev.asks, limitUp: prev.limitUp, limitDown: prev.limitDown } : x);
      }
      this._recordSuccess(res);
      return res;
    } catch (e) {
      if (e?.name !== 'AbortError') this._recordError(e);
      throw e;
    }
  }

  async getQuotes(symbols, signal) {
    this._guard();
    try {
      const res = await this.provider.getQuotes(symbols, { fetchImpl: this.fetchImpl, signal });
      for (const [k, v] of Object.entries(res.quotes || {})) this.quoteCache.set(k, v);
      this._recordSuccess(res);
      return res;
    } catch (e) {
      if (e?.name !== 'AbortError') this._recordError(e);
      throw e;
    }
  }

  async getChart(symbol, timeframe, signal) {
    this._guard();
    const key = `${this.mode}:${symbol}:${timeframe}`;
    const hit = this.chartCache.get(key);
    const ttl = timeframe === '1D' ? 20_000 : 120_000;
    if (hit && clockNow() - hit.at < ttl) return hit.data;
    try {
      const data = await this.provider.getChart(symbol, timeframe, { fetchImpl: this.fetchImpl, signal });
      this.chartCache.set(key, { at: clockNow(), data });
      return data;
    } catch (e) {
      if (e?.name !== 'AbortError') this._recordError(e);
      throw e;
    }
  }

  getCachedQuote(symbol) {
    return this.quoteCache.get(symbol) || null;
  }

  getAllCachedQuotes() {
    return Object.fromEntries(this.quoteCache.entries());
  }
}

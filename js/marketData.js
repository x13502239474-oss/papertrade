import { APP_CONFIG } from './config.js';
import { registerInstrument, isNonTradableSymbol } from './catalog.js';

export class MarketDataError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'MarketDataError';
    this.code = code; // NO_CONNECTION | INVALID_KEY | RATE_LIMIT | PLAN_RESTRICTED | NOT_FOUND | NETWORK_ERROR | INVALID_DATA | API_ERROR
    this.detail = detail;
  }
}

const PRIMARY_US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'NYSE ARCA', 'AMEX', 'CBOE BZX', 'BATS']);

export class MarketDataService {
  constructor({
    fetchImpl = globalThis.fetch?.bind(globalThis),
    session = globalThis.sessionStorage,
    local = globalThis.localStorage
  } = {}) {
    this.fetch = fetchImpl;
    this.session = session;
    this.local = local;

    this.mode = this.session?.getItem(APP_CONFIG.storageKeys.connectionMode) || 'byok';
    this.apiKey = this.session?.getItem(APP_CONFIG.storageKeys.apiKey) || '';
    this.proxyUrl = this.session?.getItem(APP_CONFIG.storageKeys.proxyUrl) || '';
    this.planTier = this.session?.getItem(APP_CONFIG.storageKeys.planTier) || 'free';

    this.quotes = {};
    this.seriesCache = {};
    this.searchCache = new Map();
    this.liveExchangeState = null; // { is_market_open: boolean, at: number }

    this.syncing = false;
    this.lastSyncAt = 0;
    this.lastManualRefreshAt = 0;
    this.lastError = null;
    this.syncGeneration = 0;

    this.minuteTimestamps = [];
    this.dailyUsage = this._loadDailyUsage();

    this._loadSessionQuotes();
  }

  _loadSessionQuotes() {
    try {
      const raw = this.session?.getItem(APP_CONFIG.storageKeys.quotes);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.quotes = parsed;
        }
      }
    } catch {
      this.quotes = {};
    }
  }

  _saveSessionQuotes() {
    try {
      this.session?.setItem(APP_CONFIG.storageKeys.quotes, JSON.stringify(this.quotes));
    } catch {
      // sessionStorage 配额满时静默降级为内存缓存
    }
  }

  _utcDayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  _loadDailyUsage() {
    const today = this._utcDayKey();
    try {
      const raw = this.local?.getItem(APP_CONFIG.storageKeys.quotaUsage);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.day === today && Number.isFinite(parsed.used)) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return { day: today, used: 0 };
  }

  _pruneMinuteWindow(now = Date.now()) {
    this.minuteTimestamps = this.minuteTimestamps.filter((t) => now - t < 60000);
    const today = this._utcDayKey();
    if (this.dailyUsage.day !== today) {
      this.dailyUsage = { day: today, used: 0 };
    }
  }

  _recordCredits(count = 1, now = Date.now()) {
    this._pruneMinuteWindow(now);
    this.dailyUsage.used += count;
    for (let i = 0; i < count; i++) {
      this.minuteTimestamps.push(now);
    }
    try {
      this.local?.setItem(APP_CONFIG.storageKeys.quotaUsage, JSON.stringify(this.dailyUsage));
    } catch {
      // ignore
    }
  }

  getQuotaLimits() {
    const isPro = this.mode === 'proxy' || this.planTier === 'pro';
    return {
      minuteLimit: isPro ? APP_CONFIG.proCreditsPerMinute : APP_CONFIG.defaultCreditsPerMinute,
      dayLimit: isPro ? APP_CONFIG.proCreditsPerDay : APP_CONFIG.defaultCreditsPerDay
    };
  }

  getQuotaStats(now = Date.now()) {
    this._pruneMinuteWindow(now);
    const { minuteLimit, dayLimit } = this.getQuotaLimits();
    return {
      minuteUsed: this.minuteTimestamps.length,
      minuteLimit,
      minuteRemaining: Math.max(0, minuteLimit - this.minuteTimestamps.length),
      dayUsed: this.dailyUsage.used,
      dayLimit
    };
  }

  isConfigured() {
    if (this.mode === 'proxy') {
      return Boolean(this.proxyUrl && /^https?:\/\//i.test(this.proxyUrl));
    }
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getProviderLabel() {
    if (!this.isConfigured()) return '未连接行情源';
    return this.mode === 'proxy' ? '服务端代理 · Twelve Data' : 'Twelve Data (个人会话密钥)';
  }

  getDelayStatusLabel() {
    if (!this.isConfigured()) return '未连接';
    if (this.mode === 'proxy') return '由服务端代理与上游数据许可决定';
    return this.planTier === 'pro' ? '按个人付费套餐权限（实时/准实时）' : '个人免费/基础层（盘中可能有延迟，休市为最近收盘快照）';
  }

  configure({ mode = 'byok', apiKey = '', proxyUrl = '', planTier = 'free' }) {
    this.syncGeneration++;
    this.syncing = false;
    this.lastError = null;
    this.quotes = {};
    this.seriesCache = {};
    this.searchCache.clear();
    this.mode = mode === 'proxy' ? 'proxy' : 'byok';
    this.planTier = planTier === 'pro' ? 'pro' : 'free';
    this.apiKey = this.mode === 'byok' ? String(apiKey || '').trim() : '';
    this.proxyUrl = this.mode === 'proxy' ? String(proxyUrl || '').trim().replace(/\/+$/, '') : '';

    this.session?.setItem(APP_CONFIG.storageKeys.connectionMode, this.mode);
    this.session?.setItem(APP_CONFIG.storageKeys.planTier, this.planTier);
    this.session?.removeItem(APP_CONFIG.storageKeys.quotes);

    if (this.apiKey) this.session?.setItem(APP_CONFIG.storageKeys.apiKey, this.apiKey);
    else this.session?.removeItem(APP_CONFIG.storageKeys.apiKey);

    if (this.proxyUrl) this.session?.setItem(APP_CONFIG.storageKeys.proxyUrl, this.proxyUrl);
    else this.session?.removeItem(APP_CONFIG.storageKeys.proxyUrl);
  }

  clearConnection() {
    this.syncGeneration++;
    this.syncing = false;
    this.apiKey = '';
    this.proxyUrl = '';
    this.quotes = {};
    this.seriesCache = {};
    this.searchCache.clear();
    this.liveExchangeState = null;
    this.lastSyncAt = 0;
    this.lastError = null;

    this.session?.removeItem(APP_CONFIG.storageKeys.apiKey);
    this.session?.removeItem(APP_CONFIG.storageKeys.proxyUrl);
    this.session?.removeItem(APP_CONFIG.storageKeys.quotes);
    // 清理旧版本遗留报价缓存，但绝不触碰 localStorage 中的 papertrade-state 模拟账户数据
    this.local?.removeItem('papertrade-quotes');
  }

  getQuote(symbol) {
    if (!symbol) return null;
    return this.quotes[String(symbol).toUpperCase().trim()] || null;
  }

  isQuoteFresh(symbol, now = Date.now()) {
    const q = this.getQuote(symbol);
    if (!q || !Number.isFinite(q.price) || q.price <= 0) return false;
    return now - (q._received || 0) < APP_CONFIG.quoteFreshnessMs;
  }

  getQuoteFreshnessInfo(symbol, now = Date.now()) {
    const q = this.getQuote(symbol);
    if (!q || !q._received) {
      return { state: 'missing', label: '暂无报价', ageSec: null };
    }
    const ageMs = Math.max(0, now - q._received);
    const ageSec = Math.floor(ageMs / 1000);
    const fresh = ageMs < APP_CONFIG.quoteFreshnessMs;
    let ageText;
    if (ageSec < 60) ageText = `${ageSec}秒前同步`;
    else if (ageSec < 3600) ageText = `${Math.floor(ageSec / 60)}分钟前同步`;
    else ageText = `${Math.floor(ageSec / 3600)}小时前同步`;

    return {
      state: fresh ? 'fresh' : 'stale',
      label: fresh ? `有效 (${ageText})` : `已过期 (${ageText})`,
      ageSec
    };
  }

  getLiveExchangeState(now = Date.now()) {
    if (this.liveExchangeState && now - this.liveExchangeState.at < 10 * 60 * 1000) {
      return this.liveExchangeState;
    }
    return null;
  }

  _buildRequest(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const base = this.mode === 'proxy' ? this.proxyUrl : 'https://api.twelvedata.com';
    const url = `${base}${path}${qs.toString() ? '?' + qs.toString() : ''}`;
    const headers = { Accept: 'application/json' };
    if (this.mode === 'byok') {
      // 严禁将 API Key 放入 URL 查询参数；统一通过 Authorization 请求头发送
      headers.Authorization = `apikey ${this.apiKey}`;
    }
    return { url, headers };
  }

  async _requestJson(path, params = {}, creditCost = 1) {
    if (!this.isConfigured()) {
      const err = new MarketDataError('NO_CONNECTION', '尚未连接行情源，请点击右上角“行情设置”输入个人密钥或配置服务端代理');
      this.lastError = err;
      throw err;
    }

    const stats = this.getQuotaStats();
    if (stats.minuteUsed + creditCost > stats.minuteLimit) {
      const err = new MarketDataError(
        'RATE_LIMIT',
        `本地额度保护已触发：当前每分钟配额 (${stats.minuteUsed}/${stats.minuteLimit} credits) 已满，请等待约 30-60 秒后再试`
      );
      this.lastError = err;
      throw err;
    }

    const { url, headers } = this._buildRequest(path, params);
    let resp;
    try {
      resp = await this.fetch(url, { headers, cache: 'no-store' });
    } catch (networkErr) {
      const err = new MarketDataError(
        'NETWORK_ERROR',
        '行情网络请求失败（请检查网络连接、CORS 策略或服务端代理地址是否可用）',
        networkErr?.message || null
      );
      this.lastError = err;
      throw err;
    }

    let data;
    try {
      data = await resp.json();
    } catch {
      const err = new MarketDataError('INVALID_DATA', `数据源响应无法解析为 JSON (HTTP ${resp.status})`);
      this.lastError = err;
      throw err;
    }

    this._recordCredits(creditCost);

    const code = Number(data?.code || resp.status);
    const msg = String(data?.message || '');

    if (!resp.ok || data?.status === 'error') {
      let err;
      if (code === 401 || /apikey|api key|unauthorized|invalid.*key/i.test(msg)) {
        err = new MarketDataError('INVALID_KEY', 'API Key 无效或未获授权，请核对密钥是否正确', msg);
      } else if (code === 429 || /rate limit|credits|run out|minute/i.test(msg)) {
        err = new MarketDataError('RATE_LIMIT', 'API 请求额度已耗尽或触发分钟频率限制，请稍后重试', msg);
      } else if (code === 403 || /grow|pro|plan|upgrade|available starting/i.test(msg)) {
        err = new MarketDataError('PLAN_RESTRICTED', '当前数据源账户套餐不支持所请求的标的或周期', msg);
      } else if (code === 404 || /symbol.*invalid|not found|figi/i.test(msg)) {
        err = new MarketDataError('NOT_FOUND', '数据源未找到该美股代码或该证券不可交易', msg);
      } else {
        err = new MarketDataError('API_ERROR', msg || `行情服务返回错误 (HTTP ${resp.status})`, msg);
      }
      this.lastError = err;
      throw err;
    }

    this.lastError = null;
    return data;
  }

  _normalizeQuote(symbol, raw, now = Date.now()) {
    const price = Number(raw?.close ?? raw?.price ?? raw?.last);
    if (!Number.isFinite(price) || price <= 0) {
      throw new MarketDataError('INVALID_DATA', `${symbol} 未返回有效成交价`);
    }

    const open = Number(raw.open);
    const high = Number(raw.high);
    const low = Number(raw.low);
    const previousClose = Number(raw.previous_close);
    const volume = Number(raw.volume);
    let change = Number(raw.change);
    let percent = Number(raw.percent_change);

    if (!Number.isFinite(change) && Number.isFinite(previousClose) && previousClose > 0) {
      change = price - previousClose;
    }
    if (!Number.isFinite(percent) && Number.isFinite(change) && Number.isFinite(previousClose) && previousClose > 0) {
      percent = (change / previousClose) * 100;
    }

    const ts = Number(raw.timestamp);
    const isMarketOpen = typeof raw.is_market_open === 'boolean' ? raw.is_market_open : null;
    if (isMarketOpen !== null) {
      this.liveExchangeState = { is_market_open: isMarketOpen, at: now };
    }

    const normalized = {
      symbol: String(raw.symbol || symbol).toUpperCase().trim(),
      name: raw.name || symbol,
      exchange: raw.exchange || 'US',
      micCode: raw.mic_code || '',
      currency: raw.currency || 'USD',
      price,
      open: Number.isFinite(open) && open > 0 ? open : null,
      high: Number.isFinite(high) && high > 0 ? high : null,
      low: Number.isFinite(low) && low > 0 ? low : null,
      previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null,
      volume: Number.isFinite(volume) && volume >= 0 ? volume : null,
      change: Number.isFinite(change) ? change : null,
      percent: Number.isFinite(percent) ? percent : null,
      datetime: raw.datetime || '',
      timestamp: Number.isFinite(ts) && ts > 0 ? ts : null,
      isMarketOpen,
      provider: this.getProviderLabel(),
      delayStatus: this.getDelayStatusLabel(),
      _received: now
    };

    registerInstrument({
      symbol: normalized.symbol,
      name: normalized.name,
      exchange: normalized.exchange,
      currency: normalized.currency
    });

    return normalized;
  }

  async fetchQuote(symbol, { force = false } = {}) {
    const sym = String(symbol || '').toUpperCase().trim();
    if (!sym || isNonTradableSymbol(sym)) {
      throw new MarketDataError('NOT_FOUND', '非上市公司或退市标的，无公开市场行情');
    }

    const cached = this.getQuote(sym);
    if (!force && cached && Date.now() - cached._received < APP_CONFIG.quoteCacheTtlMs) {
      return cached;
    }

    const raw = await this._requestJson('/quote', { symbol: sym }, 1);
    const normalized = this._normalizeQuote(sym, raw);
    this.quotes[sym] = normalized;
    this._saveSessionQuotes();
    this.lastSyncAt = Date.now();
    return normalized;
  }

  /**
   * 批量按优先级同步报价，严格遵守每分钟可用配额，绝不盲目轰炸接口。
   */
  async fetchQuotesPriority(symbols, { force = false, onProgress = null } = {}) {
    const unique = [...new Set(symbols.map((s) => String(s || '').toUpperCase().trim()).filter((s) => s && !isNonTradableSymbol(s)))];
    const candidates = force
      ? unique
      : unique.filter((s) => {
          const q = this.getQuote(s);
          return !q || Date.now() - q._received >= APP_CONFIG.quoteCacheTtlMs;
        });

    if (candidates.length === 0) {
      return { ok: 0, fail: 0, deferred: 0, errors: [] };
    }

    const stats = this.getQuotaStats();
    const budget = Math.max(0, stats.minuteRemaining);
    if (budget === 0) {
      const err = new MarketDataError(
        'RATE_LIMIT',
        `当前每分钟配额 (${stats.minuteLimit} credits/min) 已用完，已暂缓批量请求以保护密钥额度`
      );
      this.lastError = err;
      throw err;
    }

    const toFetch = candidates.slice(0, budget);
    const deferred = Math.max(0, candidates.length - toFetch.length);

    const gen = this.syncGeneration;
    this.syncing = true;
    let ok = 0;
    let fail = 0;
    const errors = [];
    const chunkSize = 8;

    try {
      for (let i = 0; i < toFetch.length; i += chunkSize) {
        if (gen !== this.syncGeneration) break;
        const chunk = toFetch.slice(i, i + chunkSize);

        if (chunk.length === 1) {
          try {
            await this.fetchQuote(chunk[0], { force: true });
            ok++;
          } catch (e) {
            fail++;
            errors.push({ symbol: chunk[0], code: e.code, message: e.message });
            if (e.code === 'INVALID_KEY' || e.code === 'RATE_LIMIT' || e.code === 'NO_CONNECTION' || e.code === 'NETWORK_ERROR') {
              throw e;
            }
          }
        } else {
          const rawBatch = await this._requestJson('/quote', { symbol: chunk.join(',') }, chunk.length);
          const now = Date.now();
          for (const sym of chunk) {
            const item = rawBatch?.[sym];
            if (item && item.status !== 'error' && !item.code) {
              try {
                this.quotes[sym] = this._normalizeQuote(sym, item, now);
                ok++;
              } catch (e) {
                fail++;
                errors.push({ symbol: sym, code: e.code, message: e.message });
              }
            } else {
              fail++;
              errors.push({ symbol: sym, code: item?.code || 'ITEM_ERROR', message: item?.message || '未返回有效报价' });
            }
          }
          this._saveSessionQuotes();
        }
        onProgress?.({ ok, fail, done: Math.min(i + chunkSize, toFetch.length), total: toFetch.length, deferred });
      }
      if (ok > 0) {
        this.lastSyncAt = Date.now();
      }
    } finally {
      if (gen === this.syncGeneration) this.syncing = false;
    }

    return { ok, fail, deferred, errors };
  }

  async fetchSeries(symbol, range = '1D', { force = false } = {}) {
    const sym = String(symbol || '').toUpperCase().trim();
    if (!sym || isNonTradableSymbol(sym)) {
      throw new MarketDataError('NOT_FOUND', '非上市公司或不可交易标的，无历史 K 线');
    }

    const cacheKey = `${sym}:${range}`;
    const cached = this.seriesCache[cacheKey];
    if (!force && cached && Date.now() - cached.at < APP_CONFIG.seriesCacheTtlMs) {
      return cached;
    }

    const rangeSpec = {
      '1D': { interval: '5min', outputsize: 78 },
      '1W': { interval: '30min', outputsize: 65 },
      '1M': { interval: '1day', outputsize: 23 },
      '3M': { interval: '1day', outputsize: 66 },
      '1Y': { interval: '1day', outputsize: 252 }
    }[range] || { interval: '5min', outputsize: 78 };

    const raw = await this._requestJson(
      '/time_series',
      { symbol: sym, interval: rangeSpec.interval, outputsize: rangeSpec.outputsize, order: 'ASC' },
      1
    );

    if (!Array.isArray(raw?.values) || raw.values.length < 2) {
      throw new MarketDataError('INVALID_DATA', '数据源未返回足够的真实历史 K 线');
    }

    const values = raw.values
      .map((bar) => {
        const close = Number(bar.close);
        const open = Number(bar.open);
        const high = Number(bar.high);
        const low = Number(bar.low);
        const volume = Number(bar.volume);
        return {
          datetime: bar.datetime || '',
          open: Number.isFinite(open) && open > 0 ? open : close,
          high: Number.isFinite(high) && high > 0 ? high : close,
          low: Number.isFinite(low) && low > 0 ? low : close,
          close,
          volume: Number.isFinite(volume) && volume >= 0 ? volume : 0
        };
      })
      .filter((b) => Number.isFinite(b.close) && b.close > 0);

    if (values.length < 2) {
      throw new MarketDataError('INVALID_DATA', 'K 线数据校验未通过');
    }

    const entry = {
      symbol: sym,
      range,
      interval: rangeSpec.interval,
      exchange: raw.meta?.exchange || this.getQuote(sym)?.exchange || 'US',
      currency: raw.meta?.currency || 'USD',
      timezone: raw.meta?.exchange_timezone || 'America/New_York',
      values,
      at: Date.now()
    };

    this.seriesCache[cacheKey] = entry;
    return entry;
  }

  getCachedSeries(symbol, range = '1D') {
    if (!symbol) return null;
    return this.seriesCache[`${String(symbol).toUpperCase().trim()}:${range}`] || null;
  }

  async searchSymbolsRemote(query) {
    const q = String(query || '').trim();
    if (!q || !this.isConfigured()) return [];
    const key = q.toLowerCase();
    if (this.searchCache.has(key)) return this.searchCache.get(key);

    const raw = await this._requestJson('/symbol_search', { symbol: q, outputsize: 25 }, 1);
    const items = Array.isArray(raw?.data) ? raw.data : [];

    // 仅保留美国挂牌、USD 计价证券，并消除跨市场同名代码的歧义（优先保留 NASDAQ / NYSE / NYSE Arca）
    const bySymbol = new Map();
    for (const item of items) {
      const sym = String(item.symbol || '').toUpperCase().trim();
      if (!sym || isNonTradableSymbol(sym)) continue;
      if (item.country && item.country !== 'United States') continue;
      if (item.currency && item.currency !== 'USD') continue;

      const ex = String(item.exchange || 'US').trim();
      const isPrimary = PRIMARY_US_EXCHANGES.has(ex.toUpperCase());
      const existing = bySymbol.get(sym);
      if (!existing || (!existing._isPrimary && isPrimary)) {
        bySymbol.set(sym, {
          symbol: sym,
          name: item.instrument_name || sym,
          exchange: ex,
          instrument_type: item.instrument_type,
          currency: item.currency || 'USD',
          disambiguation: `${ex}${item.mic_code ? ' (' + item.mic_code + ')' : ''} · ${item.instrument_type || 'Equity'} · USD`,
          _isPrimary: isPrimary
        });
      }
    }

    const registered = [];
    for (const val of bySymbol.values()) {
      const inst = registerInstrument(val);
      if (inst) registered.push(inst);
    }

    this.searchCache.set(key, registered);
    return registered;
  }

  canManualRefresh(now = Date.now()) {
    return now - this.lastManualRefreshAt >= APP_CONFIG.manualRefreshCooldownMs;
  }

  markManualRefresh(now = Date.now()) {
    this.lastManualRefreshAt = now;
  }

  manualRefreshCooldownRemaining(now = Date.now()) {
    return Math.max(0, Math.ceil((APP_CONFIG.manualRefreshCooldownMs - (now - this.lastManualRefreshAt)) / 1000));
  }
}

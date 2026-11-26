// 自定义后端代理 Provider（对接本仓库 worker/ 中的 Cloudflare Worker 或兼容代理）。
// 前端不持有也不传递任何上游 API Key，所有密钥均在代理端通过环境变量安全注入。
export function createProxyProvider(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');

  async function req(path, { fetchImpl = fetch, signal } = {}) {
    if (!base) throw new Error('尚未配置自定义行情代理地址');
    const res = await fetchImpl(`${base}${path}`, { signal, headers: { Accept: 'application/json' } });
    if (res.status === 429) throw Object.assign(new Error('代理接口请求频率受限'), { code: 'RATE_LIMIT' });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`代理接口 HTTP ${res.status}${txt ? `：${txt.slice(0, 80)}` : ''}`);
    }
    return res.json();
  }

  return {
    id: 'proxy',
    label: '自定义行情代理',
    delayText: '由代理上游数据源决定',
    supportsOrderBook: true,
    supportedTimeframes: ['1D', '5D', 'D', 'W', 'M'],

    async getIndices(opts) {
      return req('/api/indices', opts);
    },

    async getList({ board = 'all', sort = 'amount', asc = false, page = 1, pageSize = 40 } = {}, opts) {
      const qs = new URLSearchParams({ board, sort, asc: asc ? '1' : '0', page: String(page), pageSize: String(pageSize) });
      return req(`/api/list?${qs}`, opts);
    },

    async getQuotes(symbols, opts) {
      if (!symbols.length) return { quotes: {}, time: Date.now(), source: '代理' };
      const qs = new URLSearchParams({ symbols: symbols.join(',') });
      return req(`/api/quotes?${qs}`, opts);
    },

    async getChart(symbol, timeframe, opts) {
      const qs = new URLSearchParams({ symbol, timeframe });
      return req(`/api/chart?${qs}`, opts);
    },

    async search(q, opts) {
      const qs = new URLSearchParams({ q });
      return req(`/api/search?${qs}`, opts);
    },

    async health(opts) {
      return req('/api/health', opts);
    },
  };
}

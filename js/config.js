export const APP_CONFIG = {
  initialCash: 100000,
  currency: 'USD',
  slippageRate: 0.0005, // 市价单双向模拟滑点 0.05% (5 bps)
  commissionPerOrder: 0, // 模拟佣金 $0.00 / 笔（界面公开披露）
  minQty: 0.0001, // 支持小数股，最小单位 0.0001 股
  maxQtyDecimals: 4, // 最多 4 位小数
  maxPriceDecimals: 4,
  quoteFreshnessMs: 15 * 60 * 1000, // 报价新鲜度上限：15 分钟，超时视为过期报价
  quoteCacheTtlMs: 60 * 1000, // 单标的报价节流缓存：60 秒
  seriesCacheTtlMs: 5 * 60 * 1000, // K 线数据缓存：5 分钟（刷新报价不清空 K 线缓存）
  manualRefreshCooldownMs: 10 * 1000, // 手动刷新冷却时间：10 秒
  autoRefreshIntervalMs: 5 * 60 * 1000, // 自动同步检查间隔：5 分钟（仅同步可见与关联标的）
  defaultCreditsPerMinute: 8, // Twelve Data 免费层默认每分钟 8 credits
  defaultCreditsPerDay: 800, // Twelve Data 免费层默认每日 800 credits
  proCreditsPerMinute: 55, // 付费层 / 服务端代理模式每分钟更高配额
  proCreditsPerDay: 50000,
  pageSizeOptions: [12, 20, 40],
  defaultPageSize: 12,
  storageKeys: {
    account: 'papertrade-state', // 保持与原仓库模拟账户存储键兼容
    quotes: 'papertrade-quotes-session-v2',
    apiKey: 'papertrade-market-key',
    connectionMode: 'papertrade-connection-mode',
    proxyUrl: 'papertrade-proxy-url',
    planTier: 'papertrade-plan-tier',
    quotaUsage: 'papertrade-quota-usage-v2'
  }
};

// 核心市场基准 ETF（与普通股/ETF 共用同一套可验证数据源接口，避免将 ETF 价格伪装成指数点位）
export const BENCHMARK_ITEMS = [
  { symbol: 'SPY', label: '标普 500 ETF', labelEn: 'S&P 500 ETF', exchange: 'NYSE Arca' },
  { symbol: 'QQQ', label: '纳指 100 ETF', labelEn: 'NASDAQ-100 ETF', exchange: 'NASDAQ' },
  { symbol: 'DIA', label: '道指 30 ETF', labelEn: 'Dow 30 ETF', exchange: 'NYSE Arca' },
  { symbol: 'IWM', label: '罗素 2000 ETF', labelEn: 'Russell 2000 ETF', exchange: 'NYSE Arca' }
];

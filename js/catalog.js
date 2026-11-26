// 美股证券目录（Stock / ETF / ADR）与非上市公司、已退市证券拦截注册表
// 严禁在此文件中存放任何硬编码股价、涨跌或成交量；所有行情数字必须来自可验证的数据源。

export const STOCK_UNIVERSE = [
  // 科技与半导体 (Technology & Semiconductors)
  { symbol: 'AAPL', name: 'Apple Inc.', nameZh: '苹果', exchange: 'NASDAQ', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'white' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', nameZh: '微软', exchange: 'NASDAQ', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'blue' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', nameZh: '英伟达', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'green' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)', nameZh: '谷歌 A (有投票权)', exchange: 'NASDAQ', assetType: 'Stock', sector: '通信服务', currency: 'USD', tone: 'blue', disambiguation: 'Class A 普通股 (GOOGL)，区别于无投票权 Class C (GOOG)' },
  { symbol: 'GOOG', name: 'Alphabet Inc. (Class C)', nameZh: '谷歌 C (无投票权)', exchange: 'NASDAQ', assetType: 'Stock', sector: '通信服务', currency: 'USD', tone: 'blue', disambiguation: 'Class C 资本股 (GOOG)，区别于 Class A (GOOGL)' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', nameZh: '亚马逊', exchange: 'NASDAQ', assetType: 'Stock', sector: '可选消费', currency: 'USD', tone: 'orange' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', nameZh: 'Meta (Facebook)', exchange: 'NASDAQ', assetType: 'Stock', sector: '通信服务', currency: 'USD', tone: 'blue' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', nameZh: '特斯拉', exchange: 'NASDAQ', assetType: 'Stock', sector: '汽车与能源', currency: 'USD', tone: 'red' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', nameZh: '博通', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'red' },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', nameZh: '超威半导体', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'red' },
  { symbol: 'INTC', name: 'Intel Corporation', nameZh: '英特尔', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'blue' },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated', nameZh: '高通', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'blue' },
  { symbol: 'MU', name: 'Micron Technology, Inc.', nameZh: '美光科技', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'blue' },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated', nameZh: '德州仪器', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'red' },
  { symbol: 'AMAT', name: 'Applied Materials, Inc.', nameZh: '应用材料', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'blue' },
  { symbol: 'LRCX', name: 'Lam Research Corporation', nameZh: '泛林集团', exchange: 'NASDAQ', assetType: 'Stock', sector: '半导体', currency: 'USD', tone: 'green' },
  { symbol: 'ORCL', name: 'Oracle Corporation', nameZh: '甲骨文', exchange: 'NYSE', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'red' },
  { symbol: 'CRM', name: 'Salesforce, Inc.', nameZh: '赛富时', exchange: 'NYSE', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'blue' },
  { symbol: 'ADBE', name: 'Adobe Inc.', nameZh: '奥多比', exchange: 'NASDAQ', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'red' },
  { symbol: 'NOW', name: 'ServiceNow, Inc.', nameZh: 'ServiceNow', exchange: 'NYSE', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'green' },
  { symbol: 'INTU', name: 'Intuit Inc.', nameZh: 'Intuit', exchange: 'NASDAQ', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'blue' },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', nameZh: 'Palantir', exchange: 'NASDAQ', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'white' },
  { symbol: 'PANW', name: 'Palo Alto Networks, Inc.', nameZh: '派拓网络', exchange: 'NASDAQ', assetType: 'Stock', sector: '网络安全', currency: 'USD', tone: 'orange' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings, Inc.', nameZh: 'CrowdStrike', exchange: 'NASDAQ', assetType: 'Stock', sector: '网络安全', currency: 'USD', tone: 'red' },
  { symbol: 'SNOW', name: 'Snowflake Inc.', nameZh: 'Snowflake', exchange: 'NYSE', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'blue' },
  { symbol: 'CSCO', name: 'Cisco Systems, Inc.', nameZh: '思科', exchange: 'NASDAQ', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'blue' },
  { symbol: 'IBM', name: 'International Business Machines', nameZh: 'IBM', exchange: 'NYSE', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'blue' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', nameZh: '奈飞', exchange: 'NASDAQ', assetType: 'Stock', sector: '通信服务', currency: 'USD', tone: 'red' },
  { symbol: 'UBER', name: 'Uber Technologies, Inc.', nameZh: '优步', exchange: 'NYSE', assetType: 'Stock', sector: '出行科技', currency: 'USD', tone: 'white' },
  { symbol: 'ABNB', name: 'Airbnb, Inc.', nameZh: '爱彼迎', exchange: 'NASDAQ', assetType: 'Stock', sector: '可选消费', currency: 'USD', tone: 'red' },
  { symbol: 'SHOP', name: 'Shopify Inc.', nameZh: 'Shopify', exchange: 'NYSE', assetType: 'Stock', sector: '科技', currency: 'USD', tone: 'green', disambiguation: 'NYSE 美元挂牌标的（非多伦多 TSX:SHOP）' },

  // 金融与支付 (Financials)
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. (Class B)', nameZh: '伯克希尔·哈撒韦 B', exchange: 'NYSE', assetType: 'Stock', sector: '金融', currency: 'USD', tone: 'purple', disambiguation: 'NYSE Class B 股 (BRK.B)' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', nameZh: '摩根大通', exchange: 'NYSE', assetType: 'Stock', sector: '金融', currency: 'USD', tone: 'blue' },
  { symbol: 'V', name: 'Visa Inc.', nameZh: '维萨', exchange: 'NYSE', assetType: 'Stock', sector: '金融支付', currency: 'USD', tone: 'blue' },
  { symbol: 'MA', name: 'Mastercard Incorporated', nameZh: '万事达卡', exchange: 'NYSE', assetType: 'Stock', sector: '金融支付', currency: 'USD', tone: 'orange' },
  { symbol: 'BAC', name: 'Bank of America Corporation', nameZh: '美国银行', exchange: 'NYSE', assetType: 'Stock', sector: '金融', currency: 'USD', tone: 'red' },
  { symbol: 'WFC', name: 'Wells Fargo & Company', nameZh: '富国银行', exchange: 'NYSE', assetType: 'Stock', sector: '金融', currency: 'USD', tone: 'red' },
  { symbol: 'GS', name: 'The Goldman Sachs Group, Inc.', nameZh: '高盛', exchange: 'NYSE', assetType: 'Stock', sector: '金融', currency: 'USD', tone: 'blue' },
  { symbol: 'MS', name: 'Morgan Stanley', nameZh: '摩根士丹利', exchange: 'NYSE', assetType: 'Stock', sector: '金融', currency: 'USD', tone: 'blue' },
  { symbol: 'BLK', name: 'BlackRock, Inc.', nameZh: '贝莱德', exchange: 'NYSE', assetType: 'Stock', sector: '资产管理', currency: 'USD', tone: 'white' },
  { symbol: 'AXP', name: 'American Express Company', nameZh: '美国运通', exchange: 'NYSE', assetType: 'Stock', sector: '金融支付', currency: 'USD', tone: 'blue' },
  { symbol: 'PYPL', name: 'PayPal Holdings, Inc.', nameZh: '贝宝', exchange: 'NASDAQ', assetType: 'Stock', sector: '金融支付', currency: 'USD', tone: 'blue' },
  { symbol: 'COIN', name: 'Coinbase Global, Inc.', nameZh: 'Coinbase', exchange: 'NASDAQ', assetType: 'Stock', sector: '金融科技', currency: 'USD', tone: 'blue' },

  // 医疗健康 (Healthcare)
  { symbol: 'LLY', name: 'Eli Lilly and Company', nameZh: '礼来', exchange: 'NYSE', assetType: 'Stock', sector: '医疗健康', currency: 'USD', tone: 'red' },
  { symbol: 'UNH', name: 'UnitedHealth Group Incorporated', nameZh: '联合健康', exchange: 'NYSE', assetType: 'Stock', sector: '医疗健康', currency: 'USD', tone: 'blue' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', nameZh: '强生', exchange: 'NYSE', assetType: 'Stock', sector: '医疗健康', currency: 'USD', tone: 'red' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', nameZh: '艾伯维', exchange: 'NYSE', assetType: 'Stock', sector: '医疗健康', currency: 'USD', tone: 'blue' },
  { symbol: 'MRK', name: 'Merck & Co., Inc.', nameZh: '默沙东', exchange: 'NYSE', assetType: 'Stock', sector: '医疗健康', currency: 'USD', tone: 'green' },
  { symbol: 'PFE', name: 'Pfizer Inc.', nameZh: '辉瑞', exchange: 'NYSE', assetType: 'Stock', sector: '医疗健康', currency: 'USD', tone: 'blue' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', nameZh: '赛默飞世尔', exchange: 'NYSE', assetType: 'Stock', sector: '医疗设备', currency: 'USD', tone: 'red' },
  { symbol: 'ISRG', name: 'Intuitive Surgical, Inc.', nameZh: '直觉外科', exchange: 'NASDAQ', assetType: 'Stock', sector: '医疗设备', currency: 'USD', tone: 'blue' },

  // 消费与媒体 (Consumer & Media)
  { symbol: 'WMT', name: 'Walmart Inc.', nameZh: '沃尔玛', exchange: 'NYSE', assetType: 'Stock', sector: '必选消费', currency: 'USD', tone: 'blue' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', nameZh: '开市客', exchange: 'NASDAQ', assetType: 'Stock', sector: '必选消费', currency: 'USD', tone: 'red' },
  { symbol: 'HD', name: 'The Home Depot, Inc.', nameZh: '家得宝', exchange: 'NYSE', assetType: 'Stock', sector: '可选消费', currency: 'USD', tone: 'orange' },
  { symbol: 'PG', name: 'The Procter & Gamble Company', nameZh: '宝洁', exchange: 'NYSE', assetType: 'Stock', sector: '必选消费', currency: 'USD', tone: 'blue' },
  { symbol: 'KO', name: 'The Coca-Cola Company', nameZh: '可口可乐', exchange: 'NYSE', assetType: 'Stock', sector: '必选消费', currency: 'USD', tone: 'red' },
  { symbol: 'PEP', name: 'PepsiCo, Inc.', nameZh: '百事可乐', exchange: 'NASDAQ', assetType: 'Stock', sector: '必选消费', currency: 'USD', tone: 'blue' },
  { symbol: 'MCD', name: "McDonald's Corporation", nameZh: '麦当劳', exchange: 'NYSE', assetType: 'Stock', sector: '可选消费', currency: 'USD', tone: 'orange' },
  { symbol: 'NKE', name: 'NIKE, Inc.', nameZh: '耐克', exchange: 'NYSE', assetType: 'Stock', sector: '可选消费', currency: 'USD', tone: 'white' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', nameZh: '星巴克', exchange: 'NASDAQ', assetType: 'Stock', sector: '可选消费', currency: 'USD', tone: 'green' },
  { symbol: 'DIS', name: 'The Walt Disney Company', nameZh: '迪士尼', exchange: 'NYSE', assetType: 'Stock', sector: '通信媒体', currency: 'USD', tone: 'blue' },

  // 能源与工业 (Energy & Industrials)
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', nameZh: '埃克森美孚', exchange: 'NYSE', assetType: 'Stock', sector: '能源', currency: 'USD', tone: 'red' },
  { symbol: 'CVX', name: 'Chevron Corporation', nameZh: '雪佛龙', exchange: 'NYSE', assetType: 'Stock', sector: '能源', currency: 'USD', tone: 'blue' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', nameZh: '卡特彼勒', exchange: 'NYSE', assetType: 'Stock', sector: '工业', currency: 'USD', tone: 'orange' },
  { symbol: 'BA', name: 'The Boeing Company', nameZh: '波音', exchange: 'NYSE', assetType: 'Stock', sector: '航空工业', currency: 'USD', tone: 'blue' },
  { symbol: 'GE', name: 'GE Aerospace', nameZh: '通用电气航空', exchange: 'NYSE', assetType: 'Stock', sector: '航空工业', currency: 'USD', tone: 'blue' },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation', nameZh: '洛克希德·马丁', exchange: 'NYSE', assetType: 'Stock', sector: '国防工业', currency: 'USD', tone: 'purple' },
  { symbol: 'UNP', name: 'Union Pacific Corporation', nameZh: '联合太平洋铁路', exchange: 'NYSE', assetType: 'Stock', sector: '工业运输', currency: 'USD', tone: 'orange' },

  // 核心美股 ETF (US-Listed ETFs)
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', nameZh: '标普 500 ETF (SPDR)', exchange: 'NYSE Arca', assetType: 'ETF', sector: '宽基 ETF', currency: 'USD', tone: 'green' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (NASDAQ-100)', nameZh: '纳斯达克 100 ETF', exchange: 'NASDAQ', assetType: 'ETF', sector: '宽基 ETF', currency: 'USD', tone: 'blue' },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', nameZh: '道琼斯工业指数 ETF', exchange: 'NYSE Arca', assetType: 'ETF', sector: '宽基 ETF', currency: 'USD', tone: 'blue' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', nameZh: '罗素 2000 小盘股 ETF', exchange: 'NYSE Arca', assetType: 'ETF', sector: '宽基 ETF', currency: 'USD', tone: 'purple' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', nameZh: '标普 500 ETF (先锋)', exchange: 'NYSE Arca', assetType: 'ETF', sector: '宽基 ETF', currency: 'USD', tone: 'red' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', nameZh: '全美股市 ETF', exchange: 'NYSE Arca', assetType: 'ETF', sector: '宽基 ETF', currency: 'USD', tone: 'red' },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', nameZh: '半导体行业 ETF', exchange: 'NASDAQ', assetType: 'ETF', sector: '行业 ETF', currency: 'USD', tone: 'green' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', nameZh: '科技精选行业 ETF', exchange: 'NYSE Arca', assetType: 'ETF', sector: '行业 ETF', currency: 'USD', tone: 'blue' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', nameZh: '金融精选行业 ETF', exchange: 'NYSE Arca', assetType: 'ETF', sector: '行业 ETF', currency: 'USD', tone: 'blue' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', nameZh: '黄金现货 ETF', exchange: 'NYSE Arca', assetType: 'ETF', sector: '商品 ETF', currency: 'USD', tone: 'orange' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', nameZh: '20年期以上美债 ETF', exchange: 'NASDAQ', assetType: 'ETF', sector: '债券 ETF', currency: 'USD', tone: 'purple' },

  // 美股挂牌 ADR (American Depositary Receipts)
  { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing (ADR)', nameZh: '台积电 (ADR)', exchange: 'NYSE', assetType: 'ADR', sector: '半导体', currency: 'USD', tone: 'red', disambiguation: '美股 NYSE 存托凭证 (TSM)，以 USD 计价' },
  { symbol: 'ASML', name: 'ASML Holding N.V. (ADR)', nameZh: '阿斯麦 (ADR)', exchange: 'NASDAQ', assetType: 'ADR', sector: '半导体', currency: 'USD', tone: 'blue', disambiguation: 'NASDAQ 纽约注册股 (ASML)，以 USD 计价' },
  { symbol: 'ARM', name: 'Arm Holdings plc (ADR)', nameZh: '安谋 Arm (ADR)', exchange: 'NASDAQ', assetType: 'ADR', sector: '半导体', currency: 'USD', tone: 'blue' },
  { symbol: 'NVO', name: 'Novo Nordisk A/S (ADR)', nameZh: '诺和诺德 (ADR)', exchange: 'NYSE', assetType: 'ADR', sector: '医疗健康', currency: 'USD', tone: 'blue' },
  { symbol: 'BABA', name: 'Alibaba Group Holding Ltd. (ADR)', nameZh: '阿里巴巴 (ADR)', exchange: 'NYSE', assetType: 'ADR', sector: '可选消费', currency: 'USD', tone: 'orange', disambiguation: 'NYSE 存托凭证 (BABA)，区别于港股 9988.HK' },
  { symbol: 'PDD', name: 'PDD Holdings Inc. (ADR)', nameZh: '拼多多 (ADR)', exchange: 'NASDAQ', assetType: 'ADR', sector: '可选消费', currency: 'USD', tone: 'red' },
  { symbol: 'JD', name: 'JD.com, Inc. (ADR)', nameZh: '京东 (ADR)', exchange: 'NASDAQ', assetType: 'ADR', sector: '可选消费', currency: 'USD', tone: 'red' },
  { symbol: 'BIDU', name: 'Baidu, Inc. (ADR)', nameZh: '百度 (ADR)', exchange: 'NASDAQ', assetType: 'ADR', sector: '通信服务', currency: 'USD', tone: 'blue' },
  { symbol: 'SONY', name: 'Sony Group Corporation (ADR)', nameZh: '索尼 (ADR)', exchange: 'NYSE', assetType: 'ADR', sector: '科技娱乐', currency: 'USD', tone: 'white' },
  { symbol: 'TM', name: 'Toyota Motor Corporation (ADR)', nameZh: '丰田汽车 (ADR)', exchange: 'NYSE', assetType: 'ADR', sector: '汽车', currency: 'USD', tone: 'red' }
];

// 非上市公司与退市证券登记表：绝不生成虚构代码、股价或交易入口
export const NON_TRADABLE_ENTITIES = [
  {
    id: 'private-anthropic',
    name: 'Anthropic PBC',
    aliases: ['anthropic', 'claude', 'anth', '安索匹克'],
    status: 'private',
    badge: '非上市公司 / 不可交易',
    description: 'Anthropic 当前是非上市人工智能公司（Private Benefit Corporation），没有公开交易的股票代码，不能在公开二级市场或本模拟终端中下单交易。',
    officialUrl: 'https://www.anthropic.com/company',
    officialLabel: '查看 Anthropic 官方公司信息 ↗'
  },
  {
    id: 'private-openai',
    name: 'OpenAI',
    aliases: ['openai', 'chatgpt'],
    status: 'private',
    badge: '非上市公司 / 不可交易',
    description: 'OpenAI 当前为非上市实体，没有公开交易的股票代码，不可交易。',
    officialUrl: 'https://openai.com/about/',
    officialLabel: '查看 OpenAI 官方信息 ↗'
  },
  {
    id: 'private-spacex',
    name: 'SpaceX',
    aliases: ['spacex', 'starlink'],
    status: 'private',
    badge: '非上市公司 / 不可交易',
    description: 'Space Exploration Technologies Corp. (SpaceX) 当前为非上市公司，没有公开交易股票代码，不可交易。',
    officialUrl: 'https://www.spacex.com/',
    officialLabel: '查看 SpaceX 官网 ↗'
  },
  {
    id: 'private-stripe',
    name: 'Stripe, Inc.',
    aliases: ['stripe'],
    status: 'private',
    badge: '非上市公司 / 不可交易',
    description: 'Stripe 当前为非上市公司，没有公开交易股票代码，不可交易。',
    officialUrl: 'https://stripe.com/about',
    officialLabel: '查看 Stripe 官方信息 ↗'
  },
  {
    id: 'private-bytedance',
    name: 'ByteDance (字节跳动)',
    aliases: ['bytedance', '字节跳动', 'tiktok'],
    status: 'private',
    badge: '非上市公司 / 不可交易',
    description: '字节跳动（ByteDance）当前为非上市公司，没有公开交易股票代码，不可交易。',
    officialUrl: 'https://www.bytedance.com/',
    officialLabel: '查看 ByteDance 官网 ↗'
  },
  {
    id: 'private-databricks',
    name: 'Databricks, Inc.',
    aliases: ['databricks'],
    status: 'private',
    badge: '非上市公司 / 不可交易',
    description: 'Databricks 当前为非上市公司，没有公开交易股票代码，不可交易。',
    officialUrl: 'https://www.databricks.com/company/about-us',
    officialLabel: '查看 Databricks 官方信息 ↗'
  },
  {
    id: 'delisted-twtr',
    name: 'Twitter, Inc. (原代码 TWTR)',
    aliases: ['twtr', 'twitter'],
    status: 'delisted',
    badge: '已退市 / 不可交易',
    description: '原纽交所代码 TWTR 已于 2022 年完成私有化并退市（现 X Corp.），不可公开交易。',
    officialUrl: null,
    officialLabel: null
  },
  {
    id: 'delisted-bbby',
    name: 'Bed Bath & Beyond (原代码 BBBY)',
    aliases: ['bbby', 'bbbyq'],
    status: 'delisted',
    badge: '已退市 / 不可交易',
    description: '原代码 BBBY 已破产退市并注销普通股，不可交易。',
    officialUrl: null,
    officialLabel: null
  },
  {
    id: 'delisted-sivb',
    name: 'SVB Financial Group (原代码 SIVB)',
    aliases: ['sivb'],
    status: 'delisted',
    badge: '已退市 / 不可交易',
    description: '原纳斯达克代码 SIVB 已退市，不可在本终端交易。',
    officialUrl: null,
    officialLabel: null
  },
  {
    id: 'delisted-frc',
    name: 'First Republic Bank (原代码 FRC)',
    aliases: ['frc'],
    status: 'delisted',
    badge: '已退市 / 不可交易',
    description: '原纽交所代码 FRC 已退市，不可在本终端交易。',
    officialUrl: null,
    officialLabel: null
  }
];

const dynamicUniverse = new Map(STOCK_UNIVERSE.map((item) => [item.symbol, item]));

export function getAllInstruments() {
  return [...dynamicUniverse.values()];
}

export function getInstrument(symbol) {
  if (!symbol) return null;
  return dynamicUniverse.get(String(symbol).toUpperCase().trim()) || null;
}

export function normalizeAssetType(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('etf') || s.includes('exchange traded fund')) return 'ETF';
  if (s.includes('depositary') || s.includes('adr')) return 'ADR';
  return 'Stock';
}

function pickTone(symbol) {
  const tones = ['blue', 'green', 'orange', 'purple', 'red', 'white'];
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  return tones[hash % tones.length];
}

export function isNonTradableSymbol(symbol) {
  const q = String(symbol || '').trim().toLowerCase();
  if (!q) return false;
  return NON_TRADABLE_ENTITIES.some((e) => e.aliases.includes(q));
}

export function findNonTradableMatches(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || q.length < 2) return [];
  return NON_TRADABLE_ENTITIES.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.aliases.some((alias) => alias.includes(q) || (q.length >= 3 && q.includes(alias)))
  );
}

export function registerInstrument(item) {
  if (!item || !item.symbol) return null;
  const sym = String(item.symbol).toUpperCase().trim();
  if (!sym || isNonTradableSymbol(sym)) return null;
  if (!dynamicUniverse.has(sym)) {
    const normalized = {
      symbol: sym,
      name: item.name || sym,
      nameZh: item.nameZh || '',
      exchange: item.exchange || 'US',
      assetType: normalizeAssetType(item.assetType || item.instrument_type),
      sector: item.sector || '美股检索标的',
      currency: item.currency || 'USD',
      tone: pickTone(sym),
      disambiguation: item.disambiguation || (item.exchange ? `${item.exchange} 挂牌 (${item.currency || 'USD'})` : ''),
      isDynamic: true
    };
    dynamicUniverse.set(sym, normalized);
  }
  return dynamicUniverse.get(sym);
}

export function searchLocalInstruments(query) {
  const q = String(query || '').trim().toLowerCase();
  const all = getAllInstruments();
  if (!q) return all;
  return all.filter(
    (item) =>
      item.symbol.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.nameZh && item.nameZh.toLowerCase().includes(q)) ||
      (item.sector && item.sector.toLowerCase().includes(q)) ||
      (item.assetType && item.assetType.toLowerCase() === q)
  );
}

export function isValidTickerFormat(symbol) {
  return /^[A-Z]{1,5}([.-][A-Z]{1,2})?$/.test(String(symbol || '').trim().toUpperCase());
}

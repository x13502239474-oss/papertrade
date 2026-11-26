// 本地常用 A 股代码字典（覆盖沪深主板、创业板、科创板、北交所代表性标的），
// 仅用于离线/跨源搜索联想与代码名称补全，不含任何行情价格。
// 行情价格一律由实时/延迟数据源或明确标注的“静态演示快照”提供。
export const INDICES = [
  { symbol: 'sh000001', code: '000001', exchange: 'SH', name: '上证指数' },
  { symbol: 'sz399001', code: '399001', exchange: 'SZ', name: '深证成指' },
  { symbol: 'sz399006', code: '399006', exchange: 'SZ', name: '创业板指' },
  { symbol: 'sh000688', code: '000688', exchange: 'SH', name: '科创50' },
  { symbol: 'bj899050', code: '899050', exchange: 'BJ', name: '北证50' },
];

// [symbol, name, pinyinInitials]
const RAW = [
  // 沪市主板
  ['sh600519', '贵州茅台', 'gzmt'], ['sh601318', '中国平安', 'zgpa'], ['sh600036', '招商银行', 'zsyh'],
  ['sh600900', '长江电力', 'cjdl'], ['sh601899', '紫金矿业', 'zjky'], ['sh600276', '恒瑞医药', 'hryy'],
  ['sh601166', '兴业银行', 'xyyh'], ['sh601398', '工商银行', 'gsyh'], ['sh601288', '农业银行', 'nyyh'],
  ['sh601988', '中国银行', 'zgyh'], ['sh601939', '建设银行', 'jsyh'], ['sh600030', '中信证券', 'zxzq'],
  ['sh601857', '中国石油', 'zgsy'], ['sh600028', '中国石化', 'zgsh'], ['sh601088', '中国神华', 'zgsh'],
  ['sh600309', '万华化学', 'whhx'], ['sh601012', '隆基绿能', 'ljln'], ['sh600887', '伊利股份', 'ylgf'],
  ['sh600809', '山西汾酒', 'sxfj'], ['sh603288', '海天味业', 'htwy'], ['sh601888', '中国中免', 'zgzm'],
  ['sh600690', '海尔智家', 'hezj'], ['sh601138', '工业富联', 'gyfl'], ['sh600050', '中国联通', 'zglt'],
  ['sh600941', '中国移动', 'zgyd'], ['sh601728', '中国电信', 'zgdx'], ['sh600104', '上汽集团', 'sqjt'],
  ['sh601633', '长城汽车', 'ccqc'], ['sh600031', '三一重工', 'syzg'], ['sh601766', '中国中车', 'zgzc'],
  ['sh601668', '中国建筑', 'zgjz'], ['sh600585', '海螺水泥', 'hlsn'], ['sh601601', '中国太保', 'zgtb'],
  ['sh601628', '中国人寿', 'zgrs'], ['sh600000', '浦发银行', 'pfyh'], ['sh600016', '民生银行', 'msyh'],
  ['sh600438', '通威股份', 'twgf'], ['sh603501', '韦尔股份', 'wegf'], ['sh603259', '药明康德', 'ymkd'],
  ['sh601919', '中远海控', 'zyhk'],
  // 深市主板
  ['sz000858', '五粮液', 'wly'], ['sz000333', '美的集团', 'mdjt'], ['sz002594', '比亚迪', 'byd'],
  ['sz000001', '平安银行', 'payh'], ['sz000651', '格力电器', 'gldq'], ['sz002415', '海康威视', 'hkws'],
  ['sz002475', '立讯精密', 'lxjm'], ['sz000568', '泸州老窖', 'lzlj'], ['sz002304', '洋河股份', 'yhgf'],
  ['sz000725', '京东方A', 'jdfa'], ['sz002352', '顺丰控股', 'sfkg'], ['sz002714', '牧原股份', 'mygf'],
  ['sz000002', '万科A', 'wka'], ['sz000063', '中兴通讯', 'zxtx'], ['sz002230', '科大讯飞', 'kdxf'],
  ['sz002371', '北方华创', 'bfhc'], ['sz000977', '浪潮信息', 'lcxx'], ['sz002049', '紫光国微', 'zggw'],
  ['sz002142', '宁波银行', 'nbyh'], ['sz000338', '潍柴动力', 'wcdl'], ['sz002241', '歌尔股份', 'gegf'],
  ['sz000100', 'TCL科技', 'tclkj'], ['sz002460', '赣锋锂业', 'gfly'], ['sz002466', '天齐锂业', 'tqly'],
  ['sz000792', '盐湖股份', 'yhgf'], ['sz002027', '分众传媒', 'fzcm'], ['sz000538', '云南白药', 'ynby'],
  ['sz002007', '华兰生物', 'hlsw'], ['sz000661', '长春高新', 'ccgx'], ['sz002271', '东方雨虹', 'dfyh'],
  // 创业板
  ['sz300750', '宁德时代', 'ndsd'], ['sz300059', '东方财富', 'dfcf'], ['sz300760', '迈瑞医疗', 'mryl'],
  ['sz300274', '阳光电源', 'ygdy'], ['sz300124', '汇川技术', 'hcjs'], ['sz300308', '中际旭创', 'zjxc'],
  ['sz300502', '新易盛', 'xys'], ['sz300394', '天孚通信', 'tftx'], ['sz300015', '爱尔眼科', 'aeyk'],
  ['sz300122', '智飞生物', 'zfsw'], ['sz300014', '亿纬锂能', 'ywln'], ['sz300418', '昆仑万维', 'klww'],
  ['sz300033', '同花顺', 'ths'], ['sz300496', '中科创达', 'zkcd'], ['sz300454', '深信服', 'sxf'],
  ['sz300408', '三环集团', 'shjt'], ['sz300628', '亿联网络', 'ylwl'], ['sz300782', '卓胜微', 'zsw'],
  ['sz300896', '爱美客', 'amk'], ['sz300999', '金龙鱼', 'jly'],
  // 科创板
  ['sh688981', '中芯国际', 'zxgj'], ['sh688256', '寒武纪', 'hwj'], ['sh688041', '海光信息', 'hgxx'],
  ['sh688111', '金山办公', 'jsbg'], ['sh688008', '澜起科技', 'lqkj'], ['sh688012', '中微公司', 'zwgs'],
  ['sh688036', '传音控股', 'cykg'], ['sh688223', '晶科能源', 'jkny'], ['sh688599', '天合光能', 'thgn'],
  ['sh688271', '联影医疗', 'lyyl'], ['sh688126', '沪硅产业', 'hgcy'], ['sh688396', '华润微', 'hrw'],
  ['sh688009', '中国通号', 'zgth'], ['sh688169', '石头科技', 'stkj'], ['sh688082', '盛美上海', 'smsh'],
  ['sh688303', '大全能源', 'dqny'], ['sh688521', '芯原股份', 'xygf'], ['sh688187', '时代电气', 'sddq'],
  // 北交所
  ['bj920002', '万达轴承', 'wdzc'], ['bj835185', '贝特瑞', 'btr'], ['bj832982', '锦波生物', 'jbsw'],
  ['bj835368', '连城数控', 'lcsk'], ['bj830799', '艾融软件', 'arrj'], ['bj831305', '海希通讯', 'hxtx'],
  ['bj836239', '长虹能源', 'chny'], ['bj834599', '同力股份', 'tlgf'], ['bj839729', '永顺生物', 'yssw'],
  ['bj872925', '锦好医疗', 'jhyl'],
];

export const CATALOG = RAW.map(([symbol, name, py]) => ({
  symbol,
  code: symbol.slice(2),
  exchange: symbol.slice(0, 2).toUpperCase(),
  name,
  py,
}));

export const CATALOG_MAP = new Map(CATALOG.map((x) => [x.symbol, x]));

export function searchCatalog(query, limit = 30) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const item of CATALOG) {
    let score = 0;
    if (item.code === q || item.symbol === q) score = 100;
    else if (item.code.startsWith(q)) score = 80;
    else if (item.name.toLowerCase().startsWith(q)) score = 75;
    else if (item.py.startsWith(q)) score = 70;
    else if (item.code.includes(q) || item.name.toLowerCase().includes(q) || item.py.includes(q)) score = 40;
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code));
  return scored.slice(0, limit).map((x) => x.item);
}

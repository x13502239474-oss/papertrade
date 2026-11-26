import { APP_CONFIG, BENCHMARK_ITEMS } from './config.js';
import { getUSMarketStatus } from './marketHours.js';
import {
  getAllInstruments,
  getInstrument,
  searchLocalInstruments,
  findNonTradableMatches,
  isNonTradableSymbol
} from './catalog.js';
import { MarketDataService } from './marketData.js';
import {
  createInitialAccount,
  loadAccountState,
  saveAccountState,
  computePortfolioSummary,
  roundQty
} from './account.js';
import {
  previewOrder,
  submitOrder,
  evaluatePendingLimitOrders,
  cancelPendingOrder,
  filterOrders,
  filterTrades
} from './orders.js';
import { renderPriceChart, renderChartPlaceholder } from './chart.js';
import {
  esc,
  fmtUsd,
  fmtSignedUsd,
  fmtPct,
  fmtQty,
  fmtVolume,
  fmtDateTime,
  renderBenchmarks,
  renderNonTradableCards,
  renderStockRows,
  renderHoldingsTable,
  renderOrdersTable,
  renderTradesTable
} from './ui.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const marketData = new MarketDataService();
let accountState = loadAccountState();

const uiState = {
  selectedSymbol: 'AAPL',
  category: 'all', // all | gainer | loser | etf | adr | watch
  searchQuery: '',
  sortBy: 'default', // default | symbol | price | percent | volume
  sortDir: 'desc',
  page: 1,
  pageSize: APP_CONFIG.defaultPageSize,
  chartRange: '1D',
  chartMode: 'area', // area | candle
  chartLoading: false,
  chartError: null,
  orderSide: 'buy',
  orderType: 'market',
  ledgerTab: 'orders', // orders | trades
  orderFilterStatus: 'all',
  orderFilterSide: 'all',
  orderFilterQuery: '',
  settingsMode: marketData.mode || 'byok'
};

function showToast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function getFilteredSortedInstruments() {
  const base = searchLocalInstruments(uiState.searchQuery);
  const filtered = base.filter((inst) => {
    if (uiState.category === 'watch') return accountState.watchlist.includes(inst.symbol);
    if (uiState.category === 'etf') return inst.assetType === 'ETF';
    if (uiState.category === 'adr') return inst.assetType === 'ADR';
    if (uiState.category === 'gainer') {
      const q = marketData.getQuote(inst.symbol);
      return q && Number.isFinite(q.percent) && q.percent > 0;
    }
    if (uiState.category === 'loser') {
      const q = marketData.getQuote(inst.symbol);
      return q && Number.isFinite(q.percent) && q.percent < 0;
    }
    return true;
  });

  const sorted = [...filtered];
  if (uiState.category === 'gainer' && uiState.sortBy === 'default') {
    sorted.sort((a, b) => (marketData.getQuote(b.symbol)?.percent ?? -Infinity) - (marketData.getQuote(a.symbol)?.percent ?? -Infinity));
  } else if (uiState.category === 'loser' && uiState.sortBy === 'default') {
    sorted.sort((a, b) => (marketData.getQuote(a.symbol)?.percent ?? Infinity) - (marketData.getQuote(b.symbol)?.percent ?? Infinity));
  } else if (uiState.sortBy !== 'default') {
    const dir = uiState.sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      if (uiState.sortBy === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      const qa = marketData.getQuote(a.symbol);
      const qb = marketData.getQuote(b.symbol);
      const va = qa?.[uiState.sortBy];
      const vb = qb?.[uiState.sortBy];
      const na = Number.isFinite(va) ? va : -Infinity;
      const nb = Number.isFinite(vb) ? vb : -Infinity;
      if (na === nb) return a.symbol.localeCompare(b.symbol);
      return (na - nb) * dir;
    });
  }
  return sorted;
}

function getCurrentPageItems() {
  const all = getFilteredSortedInstruments();
  const totalPages = Math.max(1, Math.ceil(all.length / uiState.pageSize));
  if (uiState.page > totalPages) uiState.page = totalPages;
  if (uiState.page < 1) uiState.page = 1;
  const start = (uiState.page - 1) * uiState.pageSize;
  return {
    allCount: all.length,
    totalPages,
    start,
    items: all.slice(start, start + uiState.pageSize)
  };
}

function collectPrioritySymbols(includeVisiblePage = false) {
  const priority = [];
  if (uiState.selectedSymbol) priority.push(uiState.selectedSymbol);
  for (const o of accountState.orders) {
    if (o.status === 'pending') priority.push(o.symbol);
  }
  for (const sym of Object.keys(accountState.positions)) {
    priority.push(sym);
  }
  for (const b of BENCHMARK_ITEMS) {
    priority.push(b.symbol);
  }
  if (includeVisiblePage) {
    const { items } = getCurrentPageItems();
    for (const item of items) priority.push(item.symbol);
  } else {
    for (const w of accountState.watchlist.slice(0, 4)) priority.push(w);
  }
  return [...new Set(priority)];
}

function checkAndFillPendingOrders() {
  const filled = evaluatePendingLimitOrders(
    accountState,
    marketData.quotes,
    (sym, now) => marketData.isQuoteFresh(sym, now),
    Date.now()
  );
  if (filled.length > 0) {
    saveAccountState(accountState);
    const desc = filled.map((o) => `${o.symbol} ${o.side === 'buy' ? '限价买单' : '限价卖单'} @ ${fmtUsd(o.fillPrice)}`).join('；');
    showToast(`限价挂单已触发成交：${desc}`);
  }
}

function renderMarketClockAndSession() {
  const status = getUSMarketStatus(new Date(), marketData.getLiveExchangeState());
  const clockEl = $('#et-clock');
  if (clockEl) clockEl.textContent = status.etTime;

  const sessionTextEl = $('#market-session-text');
  if (sessionTextEl) sessionTextEl.textContent = status.labelZh;

  const dotEl = $('#market-session-dot');
  if (dotEl) {
    dotEl.className = `session-dot ${status.isRegularOpen ? 'regular' : status.isExtendedHours ? 'extended' : 'closed'}`;
  }

  const calNoteEl = $('#market-calendar-note');
  if (calNoteEl) {
    calNoteEl.textContent = `${status.etDateZh} · ${status.detail}`;
  }

  // 下单区非盘中提示
  const noticeEl = $('#order-session-notice');
  if (noticeEl) {
    if (!status.isRegularOpen && marketData.isConfigured()) {
      noticeEl.hidden = false;
      noticeEl.textContent = `当前美股处于【${status.labelZh}】，数据源返回最近交易时段报价。本练习终端在报价新鲜时允许演练下单（真实券商市价单需待常规开盘撮合）。`;
    } else {
      noticeEl.hidden = true;
    }
  }
}

function renderConnectionBanner() {
  const banner = $('#data-status-banner');
  const badge = $('#banner-badge');
  const text = $('#banner-text');
  const btn = $('#banner-action-btn');
  const quotaChip = $('#quota-chip');
  const connInd = $('#conn-indicator');
  const settingsBtnText = $('#settings-btn-text');
  const sideStatus = $('#side-provider-status');
  const sideDot = $('#side-status-dot');
  const refreshBtn = $('#refresh-quotes-btn');
  const refreshText = $('#refresh-btn-text');

  const stats = marketData.getQuotaStats();
  if (quotaChip) {
    quotaChip.textContent = `配额 ${stats.minuteUsed}/${stats.minuteLimit} min · 今日 ${stats.dayUsed}`;
  }

  const cooldown = marketData.manualRefreshCooldownRemaining();
  if (refreshBtn && refreshText) {
    refreshBtn.disabled = !marketData.isConfigured() || marketData.syncing || cooldown > 0;
    refreshText.textContent = marketData.syncing ? '同步中…' : cooldown > 0 ? `冷却 ${cooldown}s` : '刷新行情';
  }

  if (!marketData.isConfigured()) {
    banner.className = 'data-status-banner';
    badge.textContent = '未连接行情';
    text.textContent =
      '当前未连接行情源，所有股价、涨跌与图表保持空状态（不回退任何虚构演示价格）。请配置个人会话密钥或服务端安全代理。';
    btn.textContent = '配置行情源';
    connInd.className = 'conn-indicator';
    settingsBtnText.textContent = '连接行情源';
    sideStatus.textContent = '未连接行情源';
    sideDot.className = 'status-dot disconnected';
    return;
  }

  settingsBtnText.textContent = marketData.mode === 'proxy' ? '代理已配置' : '行情设置';
  btn.textContent = '行情设置';

  const err = marketData.lastError;
  const selFresh = marketData.isQuoteFresh(uiState.selectedSymbol);
  const selQuote = marketData.getQuote(uiState.selectedSymbol);

  if (err && (err.code === 'INVALID_KEY' || err.code === 'NETWORK_ERROR')) {
    banner.className = 'data-status-banner state-error';
    badge.textContent = err.code === 'INVALID_KEY' ? '密钥无效' : '连接异常';
    text.textContent = `${err.message}（模拟市价单已禁用，不会使用任何假数据替代）。`;
    connInd.className = 'conn-indicator err';
    sideStatus.textContent = badge.textContent;
    sideDot.className = 'status-dot warning';
    return;
  }

  if (err && err.code === 'RATE_LIMIT') {
    banner.className = 'data-status-banner state-warning';
    badge.textContent = '配额保护中';
    text.textContent = `${err.message}。已缓存未过期的报价仍可查看。`;
    connInd.className = 'conn-indicator warn';
    sideStatus.textContent = '额度限流保护中';
    sideDot.className = 'status-dot warning';
    return;
  }

  if (selQuote && !selFresh) {
    banner.className = 'data-status-banner state-warning';
    badge.textContent = '报价已过期';
    text.textContent = `${uiState.selectedSymbol} 报价已超过 15 分钟未同步，模拟市价单与限价触发已自动暂停，请点击“刷新行情”。`;
    connInd.className = 'conn-indicator warn';
    sideStatus.textContent = '报价待刷新';
    sideDot.className = 'status-dot warning';
    return;
  }

  banner.className = 'data-status-banner state-connected';
  badge.textContent = marketData.syncing ? '正在同步' : '行情已连接';
  const syncLabel = marketData.lastSyncAt ? `最近同步 ${fmtDateTime(marketData.lastSyncAt)}` : '按需同步就绪';
  text.textContent = `数据源：${marketData.getProviderLabel()} · ${marketData.getDelayStatusLabel()} · ${syncLabel}`;
  connInd.className = 'conn-indicator ok';
  sideStatus.textContent = marketData.getProviderLabel();
  sideDot.className = 'status-dot connected';
}

function renderPortfolioAndStats() {
  const summary = computePortfolioSummary(accountState, marketData.quotes);

  $('#stat-total-equity').textContent =
    summary.totalEquity === null ? '待同步报价' : fmtUsd(summary.totalEquity);
  $('#stat-equity-note').textContent = summary.missingQuotes
    ? '含持仓缺少实时报价，请点击“同步持仓报价”'
    : `初始资金 ${fmtUsd(summary.initialCash)}`;

  const eqBadge = $('#equity-return-badge');
  eqBadge.textContent = summary.totalReturnPct === null ? '—' : fmtPct(summary.totalReturnPct);
  eqBadge.className = `stat-badge ${
    summary.totalReturnPct === null ? 'neutral' : summary.totalReturnPct >= 0 ? 'positive' : 'negative'
  }`;

  $('#stat-buying-power').textContent = fmtUsd(summary.availableCash);
  $('#stat-total-cash-note').textContent = `账户现金总额 ${fmtUsd(summary.cash)}`;

  $('#stat-frozen-cash').textContent = fmtUsd(summary.frozenCash);
  $('#stat-frozen-note').textContent = `${summary.pendingBuyOrders} 笔待成交限价买单`;

  $('#stat-market-value').textContent =
    summary.marketValue === null ? '待同步报价' : fmtUsd(summary.marketValue);
  $('#stat-holdings-count-note').textContent = `当前持有 ${summary.holdings.length} 只标的`;

  const uEl = $('#stat-unrealized-pnl');
  uEl.textContent = summary.unrealizedPnl === null ? '—' : fmtSignedUsd(summary.unrealizedPnl);
  uEl.className = `stat-value ${
    summary.unrealizedPnl === null || summary.unrealizedPnl === 0
      ? ''
      : summary.unrealizedPnl > 0
      ? 'positive-text'
      : 'negative-text'
  }`;
  const uPct = $('#stat-unrealized-pct');
  uPct.textContent = summary.unrealizedPnlPct === null ? '—' : fmtPct(summary.unrealizedPnlPct);
  uPct.className = `stat-badge ${
    summary.unrealizedPnlPct === null ? 'neutral' : summary.unrealizedPnlPct >= 0 ? 'positive' : 'negative'
  }`;
  $('#stat-cost-basis-note').textContent = `持仓总成本 ${fmtUsd(summary.totalCostBasis)}`;

  const rEl = $('#stat-realized-pnl');
  rEl.textContent = fmtSignedUsd(summary.realizedPnl);
  rEl.className = `stat-value ${
    summary.realizedPnl === 0 ? '' : summary.realizedPnl > 0 ? 'positive-text' : 'negative-text'
  }`;
  $('#stat-trades-count-note').textContent = `累计成交 ${accountState.trades.length} 笔`;

  // 侧边栏计数徽章
  $('#side-watch-count').textContent = String(accountState.watchlist.length);
  $('#watch-tab-count').textContent = String(accountState.watchlist.length);
  $('#side-pos-count').textContent = String(summary.holdings.length);

  const pendingTotal = accountState.orders.filter((o) => o.status === 'pending').length;
  const pendingPill = $('#side-pending-count');
  pendingPill.hidden = pendingTotal === 0;
  pendingPill.textContent = String(pendingTotal);

  // 持仓表格
  renderHoldingsTable($('#holdings-table-body'), $('#empty-holdings'), $('#holdings-table-wrap'), summary.holdings);

  // 订单与成交账本
  $('#orders-total-count').textContent = String(accountState.orders.length);
  $('#trades-total-count').textContent = String(accountState.trades.length);

  const statusFilterEl = $('#order-status-filter');
  statusFilterEl.hidden = uiState.ledgerTab !== 'orders';

  if (uiState.ledgerTab === 'orders') {
    const filteredOrders = filterOrders(accountState.orders, {
      status: uiState.orderFilterStatus,
      side: uiState.orderFilterSide,
      query: uiState.orderFilterQuery
    });
    $('#orders-table-wrap').hidden = filteredOrders.length === 0;
    $('#trades-table-wrap').hidden = true;
    $('#empty-ledger').hidden = filteredOrders.length > 0;
    $('#empty-ledger-title').textContent = accountState.orders.length ? '没有符合筛选条件的订单' : '尚无委托订单记录';
    renderOrdersTable($('#orders-table-body'), filteredOrders);
  } else {
    const filteredTrades = filterTrades(accountState.trades, {
      side: uiState.orderFilterSide,
      query: uiState.orderFilterQuery
    });
    $('#orders-table-wrap').hidden = true;
    $('#trades-table-wrap').hidden = filteredTrades.length === 0;
    $('#empty-ledger').hidden = filteredTrades.length > 0;
    $('#empty-ledger-title').textContent = accountState.trades.length ? '没有符合筛选条件的成交明细' : '尚无已成交记录';
    renderTradesTable($('#trades-table-body'), filteredTrades);
  }
}

function renderMarketList() {
  renderBenchmarks($('#benchmark-list'), marketData);

  // 非上市公司 / 退市证券拦截卡片（例如 Anthropic）
  const nonTradables = findNonTradableMatches(uiState.searchQuery);
  renderNonTradableCards($('#non-tradable-zone'), nonTradables);

  const { allCount, totalPages, start, items } = getCurrentPageItems();
  renderStockRows($('#stock-table-body'), items, {
    selectedSymbol: uiState.selectedSymbol,
    watchlist: accountState.watchlist,
    marketData,
    isConfigured: marketData.isConfigured(),
    searchQuery: uiState.searchQuery
  });

  const end = allCount === 0 ? 0 : Math.min(start + items.length, allCount);
  $('#stock-pagination-info').textContent =
    allCount === 0
      ? '显示 0 只可交易美股标的'
      : `显示第 ${start + 1}–${end} 只 / 共 ${allCount} 只可交易美股标的（总库 ${getAllInstruments().length} 只）`;
  $('#page-indicator').textContent = `${uiState.page} / ${totalPages}`;
  $('#prev-page-btn').disabled = uiState.page <= 1;
  $('#next-page-btn').disabled = uiState.page >= totalPages;

  $$('[data-sort-ind]').forEach((el) => {
    const key = el.dataset.sortInd;
    el.textContent = uiState.sortBy === key ? (uiState.sortDir === 'asc' ? '↑' : '↓') : '';
  });
}

function renderDetailAndOrderTicket() {
  const inst = getInstrument(uiState.selectedSymbol) || {
    symbol: uiState.selectedSymbol,
    name: uiState.selectedSymbol,
    nameZh: '',
    exchange: 'US',
    assetType: 'Stock',
    currency: 'USD',
    tone: 'blue'
  };

  const q = marketData.getQuote(inst.symbol);
  const freshInfo = marketData.getQuoteFreshnessInfo(inst.symbol);
  const isFresh = marketData.isQuoteFresh(inst.symbol);

  const logo = $('#detail-logo');
  logo.textContent = inst.symbol.slice(0, 2);
  logo.setAttribute('data-tone', inst.tone || 'blue');

  $('#detail-name').textContent = inst.nameZh ? `${inst.name} (${inst.nameZh})` : inst.name;
  $('#detail-asset-type').textContent = inst.assetType || 'Stock';
  $('#detail-symbol').textContent = inst.symbol;
  $('#detail-exchange').textContent = q?.exchange || inst.exchange || 'US';
  $('#detail-currency').textContent = q?.currency || inst.currency || 'USD';

  const disambigEl = $('#detail-disambiguation');
  if (inst.disambiguation) {
    disambigEl.hidden = false;
    disambigEl.textContent = inst.disambiguation;
  } else {
    disambigEl.hidden = true;
  }

  const saved = accountState.watchlist.includes(inst.symbol);
  const starBtn = $('#detail-star-btn');
  starBtn.textContent = saved ? '★' : '☆';
  starBtn.classList.toggle('saved', saved);
  starBtn.setAttribute('aria-label', saved ? `将 ${inst.symbol} 移出自选` : `将 ${inst.symbol} 加入自选`);

  $('#detail-price').textContent = q ? fmtUsd(q.price) : '—';
  const moveEl = $('#detail-move');
  if (q && Number.isFinite(q.percent)) {
    moveEl.textContent = `${fmtSignedUsd(q.change)} (${fmtPct(q.percent)})`;
    moveEl.className = `detail-move ${q.percent >= 0 ? 'positive-text' : 'negative-text'}`;
  } else {
    moveEl.textContent = marketData.isConfigured() ? '等待同步该标的报价' : '连接行情源后显示真实涨跌';
    moveEl.className = 'detail-move';
  }

  const fBadge = $('#detail-freshness-badge');
  fBadge.className = `freshness-pill ${freshInfo.state}`;
  fBadge.textContent = freshInfo.label;

  $('#detail-quote-time').textContent = q?.datetime
    ? `交易所报价时间：${q.datetime}`
    : '报价时间：—';

  $('#detail-source-meta').textContent = q
    ? `数据源：${q.provider} · 交易所：${q.exchange} · 币种：${q.currency} · ${q.delayStatus}`
    : '数据源：未获取报价 · 严禁展示虚构价格或随机数据';

  $('#detail-open').textContent = fmtUsd(q?.open);
  $('#detail-high').textContent = fmtUsd(q?.high);
  $('#detail-low').textContent = fmtUsd(q?.low);
  $('#detail-prev-close').textContent = fmtUsd(q?.previousClose);
  $('#detail-volume').textContent = q ? fmtVolume(q.volume) : '—';

  // 图表渲染
  const svgEl = $('#price-chart');
  const labelsEl = $('#chart-labels');
  const tooltipEl = $('#chart-tooltip');
  const cachedSeries = marketData.getCachedSeries(inst.symbol, uiState.chartRange);

  if (cachedSeries) {
    renderPriceChart(svgEl, labelsEl, tooltipEl, cachedSeries, uiState.chartMode);
  } else if (uiState.chartLoading) {
    renderChartPlaceholder(svgEl, labelsEl, tooltipEl, `正在从数据源加载 ${inst.symbol} (${uiState.chartRange}) 真实历史 K 线…`);
  } else if (uiState.chartError) {
    renderChartPlaceholder(svgEl, labelsEl, tooltipEl, uiState.chartError, true);
  } else if (!marketData.isConfigured()) {
    renderChartPlaceholder(svgEl, labelsEl, tooltipEl, '连接行情数据源后展示真实历史 OHLCV K 线');
  } else {
    renderChartPlaceholder(svgEl, labelsEl, tooltipEl, '点击右上角 ⟳ 或切换周期按需加载真实 K 线');
  }

  updateOrderPreviewUI();
}

function updateOrderPreviewUI() {
  const sym = uiState.selectedSymbol;
  const q = marketData.getQuote(sym);
  const isFresh = marketData.isQuoteFresh(sym);
  const isLimit = uiState.orderType === 'limit';

  $('#limit-field-wrap').hidden = !isLimit;
  $('#bd-slip-label').textContent = isLimit ? '限价单 0.00%' : '市价单 ±0.05%';

  const rawQty = $('#quantity-input').value;
  const rawLimit = $('#limit-price-input').value;

  const preview = previewOrder({
    side: uiState.orderSide,
    type: uiState.orderType,
    rawQty,
    rawLimitPrice: rawLimit,
    quote: q,
    isQuoteFresh: isFresh,
    state: accountState,
    symbol: sym
  });

  if (uiState.orderSide === 'buy') {
    $('#order-capacity-label').innerHTML = `可用购买力 <b id="order-capacity-value">${fmtUsd(preview.buyingPower)}</b>`;
  } else {
    $('#order-capacity-label').innerHTML = `可卖持仓 <b id="order-capacity-value">${fmtQty(preview.sellableQty)} 股</b>`;
  }

  if (preview.estimate) {
    $('#bd-ref-price').textContent = fmtUsd(preview.estimate.refPrice);
    $('#bd-slippage').textContent = fmtUsd(preview.estimate.slippageAmount);
    $('#bd-commission').textContent = fmtUsd(preview.estimate.commission);
    $('#bd-total').textContent = fmtUsd(preview.estimate.total);
  } else {
    $('#bd-ref-price').textContent = q ? fmtUsd(q.price) : '—';
    $('#bd-slippage').textContent = '—';
    $('#bd-commission').textContent = '$0.00';
    $('#bd-total').textContent = '—';
  }

  const guardEl = $('#order-guard-msg');
  if (preview.disableReason) {
    guardEl.hidden = false;
    guardEl.textContent = preview.disableReason;
  } else {
    guardEl.hidden = true;
    guardEl.textContent = '';
  }

  const submitBtn = $('#trade-submit-btn');
  submitBtn.disabled = !preview.canSubmit;
  submitBtn.classList.toggle('sell-mode', uiState.orderSide === 'sell');
  const actionVerb = uiState.orderSide === 'buy' ? '模拟买入' : '模拟卖出';
  const typeLabel = isLimit ? '限价委托' : '市价成交';
  submitBtn.textContent = preview.canSubmit
    ? `${actionVerb} ${sym} (${typeLabel}) →`
    : !marketData.isConfigured()
    ? '请先连接行情源'
    : '当前条件不可下单';
}

function renderAll() {
  renderMarketClockAndSession();
  renderConnectionBanner();
  renderMarketList();
  renderDetailAndOrderTicket();
  renderPortfolioAndStats();
}

async function loadSelectedStockData({ forceQuote = false, forceSeries = false } = {}) {
  const sym = uiState.selectedSymbol;
  if (!marketData.isConfigured() || !sym || isNonTradableSymbol(sym)) {
    renderAll();
    return;
  }

  uiState.chartError = null;
  try {
    await marketData.fetchQuote(sym, { force: forceQuote });
    checkAndFillPendingOrders();
  } catch (err) {
    showToast(`${sym} 报价加载失败：${err.message}`);
  }

  renderAll();

  const existingSeries = marketData.getCachedSeries(sym, uiState.chartRange);
  if (existingSeries && !forceSeries) {
    renderDetailAndOrderTicket();
    return;
  }

  uiState.chartLoading = true;
  uiState.chartError = null;
  renderDetailAndOrderTicket();

  try {
    await marketData.fetchSeries(sym, uiState.chartRange, { force: forceSeries });
    uiState.chartError = null;
  } catch (err) {
    uiState.chartError = err.message || '历史 K 线暂不可用';
  } finally {
    uiState.chartLoading = false;
    renderDetailAndOrderTicket();
    renderConnectionBanner();
  }
}

async function syncPriorityQuotes({ force = false, includeVisiblePage = false } = {}) {
  if (!marketData.isConfigured() || marketData.syncing) return;
  const targets = collectPrioritySymbols(includeVisiblePage);
  renderConnectionBanner();

  try {
    const res = await marketData.fetchQuotesPriority(targets, {
      force,
      onProgress: () => renderAll()
    });
    checkAndFillPendingOrders();
    renderAll();
    if (res.deferred > 0) {
      showToast(`已更新 ${res.ok} 只标的；其余 ${res.deferred} 只因每分钟配额保护已暂缓，稍后可继续同步`);
    } else if (res.ok > 0) {
      showToast(`已同步 ${res.ok} 只美股/ETF 最新报价`);
    }
  } catch (err) {
    renderAll();
    showToast(err.message || '行情同步未完成');
  }
}

function selectSymbol(symbol, { openMobileDrawer = false, side = null } = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym || isNonTradableSymbol(sym)) return;

  uiState.selectedSymbol = sym;
  uiState.chartError = null;

  if (side === 'buy' || side === 'sell') {
    uiState.orderSide = side;
    $$('.trade-switch button').forEach((b) => b.classList.toggle('active', b.dataset.side === side));
  }

  if (openMobileDrawer && window.innerWidth <= 768) {
    $('#detail-panel').classList.add('mobile-open');
  }

  renderAll();
  loadSelectedStockData();
}

function toggleWatchlist(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym || isNonTradableSymbol(sym)) return;
  const exists = accountState.watchlist.includes(sym);
  accountState.watchlist = exists
    ? accountState.watchlist.filter((s) => s !== sym)
    : [...accountState.watchlist, sym];
  saveAccountState(accountState);
  renderAll();
  showToast(exists ? `${sym} 已移出自选列表` : `${sym} 已加入自选列表`);
}

function openOrderDetailModal(orderId) {
  const order = accountState.orders.find((o) => o.id === orderId);
  if (!order) return;

  const statusText = {
    pending: '等待成交 (Pending)',
    filled: '已成交 (Filled)',
    cancelled: '已撤单 (Cancelled)',
    rejected: '已拒绝 (Rejected)'
  }[order.status] || order.status;

  $('#order-detail-body').innerHTML = `
    <div class="od-item"><span>订单编号</span><b>${esc(order.id)}</b></div>
    <div class="od-item"><span>交易标的</span><b>${esc(order.symbol)}</b></div>
    <div class="od-item"><span>买卖方向 / 类型</span><b>${order.side === 'buy' ? '买入 (Buy)' : '卖出 (Sell)'} · ${order.type === 'limit' ? '限价单 (Limit)' : '市价单 (Market)'}</b></div>
    <div class="od-item"><span>委托数量</span><b>${fmtQty(order.qty)} 股</b></div>
    <div class="od-item"><span>委托限价</span><b>${order.limitPrice ? fmtUsd(order.limitPrice) : '— (市价)'}</b></div>
    <div class="od-item"><span>成交均价</span><b>${order.fillPrice ? fmtUsd(order.fillPrice) : '—'}</b></div>
    <div class="od-item"><span>模拟滑点费用</span><b>${fmtUsd(order.slippage || 0)}</b></div>
    <div class="od-item"><span>平台模拟佣金</span><b>${fmtUsd(order.commission || 0)}</b></div>
    ${order.realizedPnl !== null && order.realizedPnl !== undefined ? `<div class="od-item"><span>本笔已实现盈亏</span><b>${fmtSignedUsd(order.realizedPnl)}</b></div>` : ''}
    <div class="od-item"><span>当前状态</span><b>${esc(statusText)}</b></div>
    ${order.rejectReason ? `<div class="od-item"><span>拒绝原因</span><b class="negative-text">${esc(order.rejectReason)}</b></div>` : ''}
    <div class="od-item"><span>关联数据源报价时间</span><b>${esc(order.quoteTimestamp || '—')}</b></div>
    <div class="od-item"><span>委托创建时间</span><b>${esc(fmtDateTime(order.time))}</b></div>
    <div class="od-item"><span>最后状态更新</span><b>${esc(fmtDateTime(order.updatedAt))}</b></div>
  `;

  const cancelSlot = $('#order-detail-cancel-slot');
  if (order.status === 'pending') {
    cancelSlot.innerHTML = `<button class="btn-danger-ghost" type="button" id="modal-cancel-order-btn">撤销该限价单</button>`;
    $('#modal-cancel-order-btn').addEventListener('click', () => {
      const res = cancelPendingOrder(accountState, order.id);
      if (res.ok) {
        saveAccountState(accountState);
        $('#order-detail-modal').hidden = true;
        renderAll();
        showToast(`已撤销订单 ${order.id}，对应冻结资金/持仓已释放`);
      }
    });
  } else {
    cancelSlot.innerHTML = '';
  }

  $('#order-detail-modal').hidden = false;
}

function openSettingsModal() {
  uiState.settingsMode = marketData.mode || 'byok';
  $$('.mode-tab').forEach((b) => b.classList.toggle('active', b.dataset.connMode === uiState.settingsMode));
  $('#pane-byok').hidden = uiState.settingsMode !== 'byok';
  $('#pane-proxy').hidden = uiState.settingsMode !== 'proxy';

  $('#api-key-input').value = marketData.apiKey || '';
  $('#proxy-url-input').value = marketData.proxyUrl || '';
  $('#plan-tier-select').value = marketData.planTier || 'free';
  $('#settings-status-msg').textContent = marketData.isConfigured()
    ? `当前已配置：${marketData.getProviderLabel()}`
    : '尚未连接行情源';

  $('#settings-modal').hidden = false;
  if (uiState.settingsMode === 'byok') $('#api-key-input').focus();
  else $('#proxy-url-input').focus();
}

function closeAllModals() {
  $('#settings-modal').hidden = true;
  $('#order-detail-modal').hidden = true;
  $('#reset-modal').hidden = true;
  $('#detail-panel').classList.remove('mobile-open');
}

function bindEvents() {
  // 导航与视图滚动
  const handleNav = (nav) => {
    $$('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === nav));
    const labels = {
      market: '市场行情 (Markets)',
      watchlist: '我的自选 (Watchlist)',
      portfolio: '持仓资产 (Positions)',
      orders: '订单与成交 (Orders)'
    };
    $('#breadcrumb-label').textContent = labels[nav] || '市场行情';

    if (nav === 'watchlist') {
      uiState.category = 'watch';
      uiState.page = 1;
      $$('#category-tabs .tab').forEach((t) => {
        const active = t.dataset.filter === 'watch';
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });
      renderMarketList();
      $('#market-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (nav === 'portfolio') {
      $('#portfolio-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (nav === 'orders') {
      $('#orders-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      if (uiState.category === 'watch') {
        uiState.category = 'all';
        $$('#category-tabs .tab').forEach((t) => {
          const active = t.dataset.filter === 'all';
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', String(active));
        });
        renderMarketList();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  $$('[data-nav]').forEach((btn) => btn.addEventListener('click', () => handleNav(btn.dataset.nav)));

  // 基准 ETF 点击选择
  $('#benchmark-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bench-symbol]');
    if (btn) selectSymbol(btn.dataset.benchSymbol, { openMobileDrawer: true });
  });

  // 分类标签切换
  $('#category-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    uiState.category = btn.dataset.filter;
    uiState.page = 1;
    $$('#category-tabs .tab').forEach((t) => {
      const active = t === btn;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    renderMarketList();
  });

  // 本地实时检索与远程全市场检索
  const searchInput = $('#search-input');
  const clearSearchBtn = $('#clear-search-btn');
  searchInput.addEventListener('input', () => {
    uiState.searchQuery = searchInput.value;
    uiState.page = 1;
    clearSearchBtn.hidden = !searchInput.value;
    renderMarketList();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    uiState.searchQuery = '';
    clearSearchBtn.hidden = true;
    uiState.page = 1;
    renderMarketList();
    searchInput.focus();
  });

  const triggerRemoteSearch = async () => {
    const q = searchInput.value.trim();
    if (!q) {
      showToast('请先在搜索框输入股票代码或英文名称');
      searchInput.focus();
      return;
    }
    const nonTradable = findNonTradableMatches(q);
    if (nonTradable.length > 0 && searchLocalInstruments(q).length === 0) {
      renderMarketList();
      showToast(`${nonTradable[0].name} 为${nonTradable[0].badge}，无公开股票代码`);
      return;
    }
    if (!marketData.isConfigured()) {
      openSettingsModal();
      showToast('连接行情源后可搜索全美股证券目录');
      return;
    }
    const btn = $('#remote-search-btn');
    btn.disabled = true;
    btn.textContent = '检索中…';
    try {
      const found = await marketData.searchSymbolsRemote(q);
      uiState.page = 1;
      renderAll();
      if (found.length > 0) {
        showToast(`从数据源检索并载入 ${found.length} 只美股标的`);
      } else {
        showToast(`数据源中未找到与 “${q}” 匹配的美股 USD 标的`);
      }
    } catch (err) {
      renderConnectionBanner();
      showToast(`远程检索失败：${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '全市场检索';
    }
  };

  $('#remote-search-btn').addEventListener('click', triggerRemoteSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerRemoteSearch();
    }
  });

  $('#reset-filters-btn').addEventListener('click', () => {
    uiState.category = 'all';
    uiState.searchQuery = '';
    uiState.sortBy = 'default';
    uiState.page = 1;
    searchInput.value = '';
    clearSearchBtn.hidden = true;
    $$('#category-tabs .tab').forEach((t) => {
      const active = t.dataset.filter === 'all';
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    renderMarketList();
  });

  // 表头排序
  $$('.sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (uiState.sortBy === key) {
        uiState.sortDir = uiState.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        uiState.sortBy = key;
        uiState.sortDir = key === 'symbol' ? 'asc' : 'desc';
      }
      renderMarketList();
    });
  });

  // 分页控件
  $('#page-size-select').addEventListener('change', (e) => {
    uiState.pageSize = Number(e.target.value) || 12;
    uiState.page = 1;
    renderMarketList();
  });
  $('#prev-page-btn').addEventListener('click', () => {
    if (uiState.page > 1) {
      uiState.page--;
      renderMarketList();
    }
  });
  $('#next-page-btn').addEventListener('click', () => {
    uiState.page++;
    renderMarketList();
  });

  // 股票表格事件委托（点击行、自选、交易、键盘回车）
  const stockTbody = $('#stock-table-body');
  stockTbody.addEventListener('click', (e) => {
    const starBtn = e.target.closest('[data-star]');
    if (starBtn) {
      e.stopPropagation();
      toggleWatchlist(starBtn.dataset.star);
      return;
    }
    const tradeBtn = e.target.closest('[data-trade]');
    if (tradeBtn) {
      e.stopPropagation();
      selectSymbol(tradeBtn.dataset.trade, { openMobileDrawer: true });
      return;
    }
    const row = e.target.closest('.stock-row');
    if (row) {
      selectSymbol(row.dataset.symbol, { openMobileDrawer: true });
    }
  });

  stockTbody.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target.closest('.stock-row');
      if (row && e.target === row) {
        e.preventDefault();
        selectSymbol(row.dataset.symbol, { openMobileDrawer: true });
      }
    }
  });

  // 同步按钮
  $('#refresh-quotes-btn').addEventListener('click', () => {
    if (!marketData.canManualRefresh()) return;
    marketData.markManualRefresh();
    syncPriorityQuotes({ force: true, includeVisiblePage: false });
  });

  $('#sync-visible-btn').addEventListener('click', () => {
    if (!marketData.isConfigured()) {
      openSettingsModal();
      return;
    }
    syncPriorityQuotes({ force: false, includeVisiblePage: true });
  });

  $('#sync-holdings-btn').addEventListener('click', async () => {
    if (!marketData.isConfigured()) {
      openSettingsModal();
      return;
    }
    const syms = Object.keys(accountState.positions);
    if (syms.length === 0) {
      showToast('当前暂无持仓标的');
      return;
    }
    try {
      const res = await marketData.fetchQuotesPriority(syms, { force: true, onProgress: () => renderAll() });
      checkAndFillPendingOrders();
      renderAll();
      showToast(`已更新 ${res.ok} 只持仓标的报价`);
    } catch (err) {
      renderAll();
      showToast(err.message);
    }
  });

  $('#refresh-single-btn').addEventListener('click', () => {
    if (!marketData.isConfigured()) {
      openSettingsModal();
      return;
    }
    loadSelectedStockData({ forceQuote: true, forceSeries: true });
  });

  $('#close-detail-btn').addEventListener('click', () => {
    $('#detail-panel').classList.remove('mobile-open');
  });

  $('#detail-star-btn').addEventListener('click', () => toggleWatchlist(uiState.selectedSymbol));

  // K 线周期与蜡烛图切换
  $$('.range-select button').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.chartRange = btn.dataset.range;
      $$('.range-select button').forEach((b) => b.classList.toggle('active', b === btn));
      loadSelectedStockData({ forceQuote: false, forceSeries: false });
    });
  });

  $$('.chart-mode-select button').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.chartMode = btn.dataset.chartMode;
      $$('.chart-mode-select button').forEach((b) => b.classList.toggle('active', b === btn));
      renderDetailAndOrderTicket();
    });
  });

  // 下单表单交互
  $$('.trade-switch button').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.orderSide = btn.dataset.side;
      $$('.trade-switch button').forEach((b) => b.classList.toggle('active', b === btn));
      updateOrderPreviewUI();
    });
  });

  $('#order-type-select').addEventListener('change', (e) => {
    uiState.orderType = e.target.value;
    if (uiState.orderType === 'limit' && !$('#limit-price-input').value) {
      const q = marketData.getQuote(uiState.selectedSymbol);
      if (q?.price) $('#limit-price-input').value = q.price.toFixed(2);
    }
    updateOrderPreviewUI();
  });

  $('#fill-last-price-btn').addEventListener('click', () => {
    const q = marketData.getQuote(uiState.selectedSymbol);
    if (q?.price) {
      $('#limit-price-input').value = q.price.toFixed(2);
      updateOrderPreviewUI();
    } else {
      showToast('当前标的暂无可用报价');
    }
  });

  $('#quantity-input').addEventListener('input', updateOrderPreviewUI);
  $('#limit-price-input').addEventListener('input', updateOrderPreviewUI);

  $('#qty-minus-btn').addEventListener('click', () => {
    const cur = Number($('#quantity-input').value) || 1;
    const next = Math.max(APP_CONFIG.minQty, roundQty(cur - 1));
    $('#quantity-input').value = String(next);
    updateOrderPreviewUI();
  });

  $('#qty-plus-btn').addEventListener('click', () => {
    const cur = Number($('#quantity-input').value) || 0;
    $('#quantity-input').value = String(roundQty(cur + 1));
    updateOrderPreviewUI();
  });

  $$('.quick-qty-row button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ratio = Number(btn.dataset.pct) || 1;
      const sym = uiState.selectedSymbol;
      const q = marketData.getQuote(sym);
      const summary = computePortfolioSummary(accountState, marketData.quotes);

      if (uiState.orderSide === 'sell') {
        const holding = summary.holdings.find((h) => h.symbol === sym);
        const sellable = holding ? holding.sellableQty : 0;
        if (sellable <= 0) {
          showToast(`当前无可卖 ${sym} 持仓`);
          return;
        }
        $('#quantity-input').value = String(Math.max(APP_CONFIG.minQty, roundQty(sellable * ratio)));
      } else {
        const refPrice =
          uiState.orderType === 'limit' && Number($('#limit-price-input').value) > 0
            ? Number($('#limit-price-input').value)
            : q?.price
            ? q.price * (1 + APP_CONFIG.slippageRate)
            : 0;
        if (!refPrice || refPrice <= 0) {
          showToast('请先获取股票报价或输入限价以计算可买股数');
          return;
        }
        const budget = Math.max(0, summary.availableCash - APP_CONFIG.commissionPerOrder) * ratio;
        // 向下取整至 4 位小数避免浮点进位超出可用现金
        const rawShares = Math.floor((budget / refPrice) * 10000) / 10000;
        if (rawShares < APP_CONFIG.minQty) {
          showToast('当前可用购买力不足以买入最小单位 (0.0001 股)');
          return;
        }
        $('#quantity-input').value = String(rawShares);
      }
      updateOrderPreviewUI();
    });
  });

  $('#order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const sym = uiState.selectedSymbol;
    const q = marketData.getQuote(sym);
    const isFresh = marketData.isQuoteFresh(sym);

    const res = submitOrder(accountState, {
      symbol: sym,
      side: uiState.orderSide,
      type: uiState.orderType,
      qty: $('#quantity-input').value,
      limitPrice: $('#limit-price-input').value,
      quote: q,
      isQuoteFresh: isFresh,
      now: Date.now()
    });

    saveAccountState(accountState);
    renderAll();

    if (!res.ok) {
      showToast(`下单未成功：${res.error}`);
      return;
    }

    if (res.status === 'filled') {
      showToast(
        `模拟成交：${uiState.orderSide === 'buy' ? '买入' : '卖出'} ${fmtQty(res.order.qty)} 股 ${sym} @ ${fmtUsd(res.fillPrice)}`
      );
    } else {
      showToast(
        `限价委托已提交 (${res.order.id})：等待最新新鲜报价达到 ${fmtUsd(res.order.limitPrice)} 时触发`
      );
    }
  });

  // 持仓快捷加仓/卖出
  $('#holdings-table-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pos-act]');
    if (!btn) return;
    selectSymbol(btn.dataset.sym, { openMobileDrawer: true, side: btn.dataset.posAct });
    if (window.innerWidth > 768) {
      $('#market-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // 订单与成交切换、筛选、撤单与查看详情
  $$('.ledger-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.ledgerTab = btn.dataset.ledger;
      $$('.ledger-tab').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      renderPortfolioAndStats();
    });
  });

  $('#order-status-filter').addEventListener('change', (e) => {
    uiState.orderFilterStatus = e.target.value;
    renderPortfolioAndStats();
  });

  $('#order-side-filter').addEventListener('change', (e) => {
    uiState.orderFilterSide = e.target.value;
    renderPortfolioAndStats();
  });

  $('#order-symbol-filter').addEventListener('input', (e) => {
    uiState.orderFilterQuery = e.target.value;
    renderPortfolioAndStats();
  });

  $('#orders-table-body').addEventListener('click', (e) => {
    const inspectBtn = e.target.closest('[data-inspect-order]');
    if (inspectBtn) {
      openOrderDetailModal(inspectBtn.dataset.inspectOrder);
      return;
    }
    const cancelBtn = e.target.closest('[data-cancel-order]');
    if (cancelBtn) {
      const res = cancelPendingOrder(accountState, cancelBtn.dataset.cancelOrder);
      if (res.ok) {
        saveAccountState(accountState);
        renderAll();
        showToast(`订单 ${res.order.id} 已撤单，冻结资金/股数已释放`);
      } else {
        showToast(res.error);
      }
    }
  });

  $('#close-order-detail-btn').addEventListener('click', () => ($('#order-detail-modal').hidden = true));
  $('#done-order-detail-btn').addEventListener('click', () => ($('#order-detail-modal').hidden = true));

  // 行情源设置弹窗
  $('#open-settings-btn').addEventListener('click', openSettingsModal);
  $('#banner-action-btn').addEventListener('click', openSettingsModal);
  $('#mobile-settings-btn').addEventListener('click', openSettingsModal);
  $('#close-settings-btn').addEventListener('click', () => ($('#settings-modal').hidden = true));
  $('#cancel-settings-btn').addEventListener('click', () => ($('#settings-modal').hidden = true));

  $$('.mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.settingsMode = btn.dataset.connMode;
      $$('.mode-tab').forEach((b) => b.classList.toggle('active', b === btn));
      $('#pane-byok').hidden = uiState.settingsMode !== 'byok';
      $('#pane-proxy').hidden = uiState.settingsMode !== 'proxy';
    });
  });

  $('#save-connect-btn').addEventListener('click', async () => {
    const statusEl = $('#settings-status-msg');
    const saveBtn = $('#save-connect-btn');

    if (uiState.settingsMode === 'byok') {
      const key = $('#api-key-input').value.trim();
      const planTier = $('#plan-tier-select').value;
      if (!key) {
        statusEl.textContent = '请输入个人 Twelve Data API Key';
        return;
      }
      marketData.configure({ mode: 'byok', apiKey: key, planTier });
    } else {
      const proxyUrl = $('#proxy-url-input').value.trim();
      if (!proxyUrl || !/^https?:\/\//i.test(proxyUrl)) {
        statusEl.textContent = '请输入以 https:// 或 http:// 开头的有效服务端代理地址';
        return;
      }
      marketData.configure({ mode: 'proxy', proxyUrl, planTier: 'pro' });
    }

    saveBtn.disabled = true;
    statusEl.textContent = '正在验证行情连接与报价权限…';

    try {
      await marketData.fetchQuote(uiState.selectedSymbol || 'AAPL', { force: true });
      checkAndFillPendingOrders();
      statusEl.textContent = '连接验证成功！正在按配额同步核心行情…';
      $('#settings-modal').hidden = true;
      renderAll();
      loadSelectedStockData({ forceQuote: false, forceSeries: true });
      syncPriorityQuotes({ force: false, includeVisiblePage: false });
    } catch (err) {
      statusEl.textContent = `连接失败：${err.message}`;
      renderAll();
    } finally {
      saveBtn.disabled = false;
    }
  });

  $('#disconnect-market-btn').addEventListener('click', () => {
    marketData.clearConnection();
    $('#api-key-input').value = '';
    $('#proxy-url-input').value = '';
    $('#settings-status-msg').textContent = '已清除会话密钥与行情缓存（本地模拟账户、持仓与订单完整保留）';
    renderAll();
    showToast('已断开行情连接；本地账户与持仓数据未受影响');
  });

  // 重置账户确认弹窗
  $('#open-reset-btn').addEventListener('click', () => {
    $('#reset-modal').hidden = false;
  });
  $('#close-reset-btn').addEventListener('click', () => ($('#reset-modal').hidden = true));
  $('#cancel-reset-btn').addEventListener('click', () => ($('#reset-modal').hidden = true));
  $('#confirm-reset-btn').addEventListener('click', () => {
    const keepWatch = $('#keep-watchlist-checkbox').checked ? accountState.watchlist : null;
    accountState = createInitialAccount(keepWatch);
    saveAccountState(accountState);
    $('#reset-modal').hidden = true;
    renderAll();
    showToast('模拟账户已重置为 $100,000.00 初始状态');
  });

  // 点击遮罩关闭模态框 & 全局快捷键
  ['#settings-modal', '#order-detail-modal', '#reset-modal'].forEach((sel) => {
    $(sel).addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.hidden = true;
    });
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#search-input').focus();
    }
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

// 初始化启动
bindEvents();
renderAll();

// 每秒更新美东时钟、市场休市状态与刷新冷却显示；每 30 秒复核报价过期状态
setInterval(() => {
  renderMarketClockAndSession();
  renderConnectionBanner();
}, 1000);

setInterval(() => {
  renderMarketList();
  renderDetailAndOrderTicket();
}, 30 * 1000);

// 若当前会话已存在有效行情连接配置，启动时自动按配额同步优先级标的
if (marketData.isConfigured()) {
  loadSelectedStockData();
  syncPriorityQuotes({ force: false, includeVisiblePage: false });
  setInterval(() => {
    if (marketData.isConfigured() && !document.hidden) {
      syncPriorityQuotes({ force: false, includeVisiblePage: false });
    }
  }, APP_CONFIG.autoRefreshIntervalMs);
}

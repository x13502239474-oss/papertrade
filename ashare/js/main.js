// PaperTrade A-Share 前端主控制器
import {
  createAccount, previewOrder, placeOrder, cancelOrder, processQuotes, rollover,
  portfolioSummary, recordEquity, reviewStats, filterByDate,
  isWatched, addToWatch, removeFromWatch, moveInWatch,
  createGroup, renameGroup, deleteGroup, updateSettings,
} from './core/account.js';
import { loadAccount, saveAccount, exportBackup, parseBackup } from './core/storage.js';
import {
  parseSymbol, boardInfo, quantityStep, maxBuyQty, priceBand, isST, isDelisting, round2,
} from './core/rules.js';
import { calcFees } from './core/fees.js';
import { marketPhase } from './core/session.js';
import { nextTradingDay } from './core/calendar.js';
import { now as clockNow, setClockOffset, getClockOffset, shDate, fromShanghai, shDateTime } from './core/time.js';
import { MarketService } from './data/provider.js';
import { searchCatalog } from './data/catalog.js';
import {
  esc, fmtPrice, fmtMoney, fmtSignedMoney, fmtPct, fmtSigned, fmtAmount, fmtShares,
  dirClass, boardBadge, fmtClock, fmtStamp,
} from './ui/format.js';
import { renderIntradayChart, renderKlineChart, renderEquityChart } from './ui/charts.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------------------------------------------------------------- 状态
const loaded = loadAccount();
let account = loaded.state;
const ui = {
  tab: 'market',
  ptab: 'positions',
  board: 'all',
  sort: 'amount',
  asc: false,
  page: 1,
  pageSize: 30,
  search: '',
  watchSearch: '',
  watchSort: 'manual',
  selected: 'sh600519',
  drawerOpen: false,
  tf: '1D',
  side: 'buy',
  otype: 'limit',
  dateFrom: '',
  dateTo: '',
  indices: [],
  marketList: [],
  marketTotal: 0,
  pendingConfirm: null,
};

const market = new MarketService({
  mode: account.settings.provider || 'public',
  proxyBase: account.settings.proxyBase || '',
  onStatus: renderStatus,
});

function persist(next) {
  account = next;
  saveAccount(account);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

function applyTheme() {
  const theme = account.settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
}

// ---------------------------------------------------------------- 状态栏 & 时钟
function renderStatus(st = market.getStatus()) {
  const dot = $('#status-dot');
  dot.className = `status-dot ${st.meta.tone}`;
  $('#status-label').textContent = st.meta.label;
  $('#status-source').textContent = `${st.source} · ${st.delayText}`;
  $('#status-updated').textContent = st.lastUpdated ? `行情 ${fmtClock(st.lastUpdated)}` : '尚未更新';

  const fault = $('#fault-banner');
  if (st.status === 'error' || st.status === 'rate_limited') {
    fault.hidden = false;
    $('#fault-text').textContent = `${st.meta.label}：${st.error || '请稍后重试或切换演示快照'}（以下不再伪装为最新行情）`;
  } else {
    fault.hidden = true;
  }

  const box = $('#provider-status-box');
  if (box) {
    box.innerHTML = `当前状态：<strong>${esc(st.meta.label)}</strong> · 来源：${esc(st.source)}<br>延迟说明：${esc(st.delayText)}${st.error ? `<br><span class="up">最近错误：${esc(st.error)}</span>` : ''}`;
  }
}

function renderClock() {
  const t = clockNow();
  const phase = marketPhase(t);
  const clockStr = shDateTime(t);
  $('#market-clock').textContent = `北京时间 ${clockStr.slice(11)}`;
  $('#market-phase').textContent = phase.label;
  $('#side-session-text').textContent = `${clockStr} · ${phase.label}`;
  $('#side-calendar-note').textContent = phase.calendar.note;

  const off = getClockOffset();
  const banner = $('#clock-offset-banner');
  if (Math.abs(off) > 1000) {
    banner.hidden = false;
    $('#clock-offset-text').textContent = `练习时间模式：当前模拟时间为 ${clockStr}（${phase.label}），仅用于验证 T+1 与跨日解锁`;
  } else {
    banner.hidden = true;
  }
}

// ---------------------------------------------------------------- 数据拉取与自动刷新
async function refreshIndices() {
  try {
    const res = await market.getIndices();
    ui.indices = res.items || [];
    renderIndices();
  } catch {
    renderIndices(true);
  }
}

async function refreshMarketList() {
  const q = ui.search.trim();
  if (q) {
    await runSearch(q);
    return;
  }
  const tbody = $('#market-tbody');
  if (!ui.marketList.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">正在获取行情列表…</td></tr>`;
  }
  try {
    const res = await market.getList({
      board: ui.board, sort: ui.sort, asc: ui.asc, page: ui.page, pageSize: ui.pageSize,
    });
    ui.marketList = res.items || [];
    ui.marketTotal = res.total || ui.marketList.length;
    renderMarketTable();
  } catch (e) {
    if (!ui.marketList.length || market.getStatus().status === 'error') {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">行情列表获取失败：${esc(e.message)}。请点击顶部“重试”或在设置中切换“静态演示快照”。</td></tr>`;
    }
  }
}

async function runSearch(query) {
  const tbody = $('#market-tbody');
  const direct = parseSymbol(query);
  const localHits = searchCatalog(query, 25);
  const syms = new Set(localHits.map((x) => x.symbol));
  if (direct && boardInfo(direct.symbol)) syms.add(direct.symbol);

  // 如果已配置代理且支持远程搜索，合并远程结果
  if (market.mode === 'proxy' && market.provider.search) {
    try {
      const r = await market.provider.search(query);
      for (const item of r.items || []) syms.add(item.symbol);
    } catch { /* fallback to local */ }
  }

  const symList = [...syms].slice(0, 30);
  if (!symList.length) {
    ui.marketList = [];
    ui.marketTotal = 0;
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">未找到匹配 “${esc(query)}” 的股票；可尝试输入完整 6 位股票代码（如 600519、300750、688981、920002）。</td></tr>`;
    $('#market-count').textContent = '搜索结果 0 只';
    return;
  }

  try {
    const res = await market.getQuotes(symList);
    ui.marketList = symList.map((s) => res.quotes[s]).filter(Boolean);
    ui.marketTotal = ui.marketList.length;
    renderMarketTable();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">搜索报价获取失败：${esc(e.message)}</td></tr>`;
  }
}

async function refreshTrackedQuotes() {
  const syms = new Set();
  if (ui.selected) syms.add(ui.selected);
  for (const s of Object.keys(account.positions)) syms.add(s);
  for (const o of account.orders) if (o.status === 'pending') syms.add(o.symbol);
  for (const g of account.watch.groups) for (const i of g.items) syms.add(i.symbol);
  if (!syms.size) return;

  try {
    const res = await market.getQuotes([...syms]);
    // 先做跨日结算，再尝试撮合挂单
    let next = rollover(account, clockNow()).state;
    const matched = processQuotes(next, res.quotes, clockNow());
    next = matched.state;
    const sum = portfolioSummary(next, market.getAllCachedQuotes(), clockNow());
    next = recordEquity(next, sum, clockNow());
    if (next !== account) {
      persist(next);
      for (const f of matched.fills) {
        toast(`限价委托模拟成交：${f.side === 'buy' ? '买入' : '卖出'} ${f.name} ${f.qty} 股 @ ¥${fmtPrice(f.price)}`);
      }
    }
    renderAccountViews();
    renderWatchTable();
    renderDetailQuoteOnly();
  } catch {
    renderAccountViews();
    renderDetailQuoteOnly();
  }
}

async function refreshAll() {
  renderClock();
  await Promise.allSettled([refreshIndices(), refreshMarketList(), refreshTrackedQuotes()]);
  if (ui.selected) await loadDetailChart();
}

// ---------------------------------------------------------------- 渲染：指数 & 行情表
function renderIndices(failed = false) {
  const el = $('#indices-strip');
  if (!ui.indices.length) {
    el.innerHTML = `<div class="idx-card"><div class="idx-name muted">${failed ? '指数行情暂不可用' : '正在加载指数…'}</div><div class="idx-price mono">—</div></div>`;
    return;
  }
  el.innerHTML = ui.indices.map((x) => {
    const cls = dirClass(x.changePct);
    return `
      <div class="idx-card">
        <div class="idx-top">
          <span class="idx-name">${esc(x.name)}</span>
          <span class="muted mono small">${fmtClock(x.time)}</span>
        </div>
        <div class="idx-price mono ${cls}">${fmtPrice(x.price)}</div>
        <div class="idx-chg mono ${cls}">
          <span>${fmtSigned(x.change)}</span>
          <span>${fmtPct(x.changePct)}</span>
        </div>
      </div>`;
  }).join('');
}

function renderMarketTable() {
  const tbody = $('#market-tbody');
  if (!ui.marketList.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">暂无符合条件的股票</td></tr>`;
  } else {
    tbody.innerHTML = ui.marketList.map((s) => {
      const cls = dirClass(s.changePct);
      const watched = isWatched(account, s.symbol);
      const sel = ui.selected === s.symbol ? ' selected' : '';
      return `
        <tr class="clickable${sel}" data-symbol="${esc(s.symbol)}">
          <td>
            <div class="stk-cell">
              <div class="stk-name">${esc(s.name)}</div>
              <div class="stk-sub mono"><span>${esc(s.code)}</span><span class="mini-tag">${esc(boardBadge(s.symbol))}</span></div>
            </div>
          </td>
          <td class="num mono ${cls}"><b>${fmtPrice(s.price)}</b></td>
          <td class="num mono"><span class="pct-pill ${cls}">${fmtPct(s.changePct)}</span></td>
          <td class="num mono col-md ${cls}">${fmtSigned(s.change)}</td>
          <td class="num mono">${fmtAmount(s.amount)}</td>
          <td class="num mono col-md">${s.turnoverRate != null ? fmtPct(s.turnoverRate, { signed: false }) : '—'}</td>
          <td class="num mono col-lg">${s.pe != null && s.pe !== 0 ? fmtPrice(s.pe, 1) : '—'}</td>
          <td class="act">
            <div class="row-btns">
              <button class="btn-xs ${watched ? 'starred' : ''}" data-act="star" data-sym="${esc(s.symbol)}" data-name="${esc(s.name)}" type="button" aria-label="${watched ? '管理自选' : '加入自选'}">${watched ? '★' : '☆'}</button>
              <button class="btn-xs" data-act="trade" data-sym="${esc(s.symbol)}" type="button">模拟</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }
  $('#market-count').textContent = ui.search.trim()
    ? `搜索结果 ${ui.marketList.length} 只`
    : (ui.marketTotal ? `共 ${ui.marketTotal.toLocaleString('zh-CN')} 只 · 当前第 ${ui.page} 页` : `本页显示 ${ui.marketList.length} 只 · 第 ${ui.page} 页`);
  $('#page-indicator').textContent = `第 ${ui.page} 页`;
  $('#btn-prev-page').disabled = ui.page <= 1 || !!ui.search.trim();
  $('#btn-next-page').disabled = !!ui.search.trim() || ui.marketList.length < ui.pageSize;
}

// ---------------------------------------------------------------- 渲染：自选
function renderWatchTable() {
  const totalWatched = new Set(account.watch.groups.flatMap((g) => g.items.map((i) => i.symbol))).size;
  $('#nav-watch-count').textContent = String(totalWatched);

  const tabsEl = $('#group-tabs');
  tabsEl.innerHTML = account.watch.groups.map((g) => `
    <button class="chip ${g.id === account.watch.activeGroupId ? 'active' : ''}" data-gid="${esc(g.id)}" role="tab" aria-selected="${g.id === account.watch.activeGroupId}">
      ${esc(g.name)} (${g.items.length})
    </button>
  `).join('');

  const group = account.watch.groups.find((g) => g.id === account.watch.activeGroupId) || account.watch.groups[0];
  $('#btn-delete-group').disabled = group.id === 'default';

  const q = ui.watchSearch.trim().toLowerCase();
  let rows = group.items.map((item) => ({ item, quote: market.getCachedQuote(item.symbol) }));
  if (q) {
    rows = rows.filter(({ item, quote }) =>
      item.symbol.includes(q) || (quote?.name || item.name).toLowerCase().includes(q));
  }
  if (ui.watchSort === 'changePct-desc') rows.sort((a, b) => (b.quote?.changePct ?? -999) - (a.quote?.changePct ?? -999));
  else if (ui.watchSort === 'changePct-asc') rows.sort((a, b) => (a.quote?.changePct ?? 999) - (b.quote?.changePct ?? 999));
  else if (ui.watchSort === 'amount-desc') rows.sort((a, b) => (b.quote?.amount ?? 0) - (a.quote?.amount ?? 0));

  const tbody = $('#watch-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">当前分组暂无自选股票，可在“行情”或个股详情中点击 ☆ 加入。</td></tr>`;
    return;
  }
  const manual = ui.watchSort === 'manual' && !q;
  tbody.innerHTML = rows.map(({ item, quote }, idx) => {
    const cls = dirClass(quote?.changePct);
    const name = quote?.name || item.name;
    return `
      <tr class="clickable" data-symbol="${esc(item.symbol)}">
        <td>
          <div class="stk-cell">
            <div class="stk-name">${esc(name)}</div>
            <div class="stk-sub mono"><span>${esc(item.symbol.slice(2))}</span><span class="mini-tag">${esc(boardBadge(item.symbol))}</span></div>
          </div>
        </td>
        <td class="num mono ${cls}"><b>${fmtPrice(quote?.price)}</b></td>
        <td class="num mono"><span class="pct-pill ${cls}">${fmtPct(quote?.changePct)}</span></td>
        <td class="num mono col-md">${fmtAmount(quote?.amount)}</td>
        <td class="act">
          <div class="row-btns">
            ${manual ? `<button class="btn-xs" data-wact="up" data-sym="${esc(item.symbol)}" ${idx === 0 ? 'disabled' : ''} type="button" aria-label="上移">↑</button>
            <button class="btn-xs" data-wact="down" data-sym="${esc(item.symbol)}" ${idx === rows.length - 1 ? 'disabled' : ''} type="button" aria-label="下移">↓</button>` : ''}
            <button class="btn-xs danger" data-wact="rm" data-sym="${esc(item.symbol)}" type="button">移除</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ---------------------------------------------------------------- 渲染：持仓、委托、成交复盘
function renderAccountViews() {
  const quotes = market.getAllCachedQuotes();
  const sum = portfolioSummary(account, quotes, clockNow());

  $('#side-total').textContent = fmtMoney(sum.total);
  $('#side-cash').textContent = fmtMoney(sum.cash);
  const pnlCls = dirClass(sum.totalPnl);
  $('#side-pnl').textContent = `${fmtSignedMoney(sum.totalPnl)} (${fmtPct(sum.totalPnlPct, { ratio: true })})`;
  $('#side-pnl').className = `mono ${pnlCls}`;

  $('#kpi-total').textContent = fmtMoney(sum.total);
  $('#kpi-total-pnl').textContent = `${fmtSignedMoney(sum.totalPnl)} (${fmtPct(sum.totalPnlPct, { ratio: true })})`;
  $('#kpi-total-pnl').className = `mono ${pnlCls}`;
  $('#kpi-day-pnl').textContent = fmtSignedMoney(sum.dayPnl);
  $('#kpi-day-pnl').className = `kpi-value mono ${dirClass(sum.dayPnl)}`;
  $('#kpi-float-pnl').textContent = fmtSignedMoney(sum.floating);
  $('#kpi-float-pnl').className = `mono ${dirClass(sum.floating)}`;
  $('#kpi-cash').textContent = fmtMoney(sum.cash);
  $('#kpi-frozen').textContent = fmtMoney(sum.frozenCash);
  $('#kpi-mv').textContent = fmtMoney(sum.marketValue);
  $('#kpi-realized').textContent = fmtSignedMoney(sum.realizedPnl);
  $('#kpi-realized').className = `mono ${dirClass(sum.realizedPnl)}`;

  renderEquityChart($('#equity-chart'), account.equity, account.initialCash);

  // 持仓表
  const posTbody = $('#positions-tbody');
  if (!sum.positions.length) {
    posTbody.innerHTML = `<tr><td colspan="6" class="empty-cell">当前无模拟持仓。在“行情”中点击任意股票即可创建模拟买入委托。</td></tr>`;
  } else {
    posTbody.innerHTML = sum.positions.map((p) => {
      const cls = dirClass(p.pnl);
      return `
        <tr class="clickable" data-symbol="${esc(p.symbol)}">
          <td>
            <div class="stk-cell">
              <div class="stk-name">${esc(p.name)}</div>
              <div class="stk-sub mono">${esc(p.code)} · ${esc(boardBadge(p.symbol))}</div>
            </div>
          </td>
          <td class="num mono">
            <div>${p.qty.toLocaleString('zh-CN')}</div>
            <div class="small muted">可卖 ${p.sellable.toLocaleString('zh-CN')}${p.locked > 0 ? ` · T+1锁 ${p.locked}` : ''}</div>
          </td>
          <td class="num mono">
            <div>${fmtPrice(p.avgCost)}</div>
            <div class="small ${p.priceLive ? '' : 'muted'}">${fmtPrice(p.price)}${p.priceLive ? '' : ' (成本)'}</div>
          </td>
          <td class="num mono">${fmtMoney(p.marketValue)}</td>
          <td class="num mono ${cls}">
            <div>${fmtSignedMoney(p.pnl)}</div>
            <div class="small">${fmtPct(p.pnlPct, { ratio: true })}</div>
          </td>
          <td class="act">
            <button class="btn-xs" data-pact="sell" data-sym="${esc(p.symbol)}" type="button">卖出</button>
          </td>
        </tr>`;
    }).join('');
  }

  // 委托表
  const pendingCount = account.orders.filter((o) => o.status === 'pending').length;
  $('#pending-count').textContent = String(pendingCount);
  const statusMap = { pending: '挂单中', filled: '已成交', cancelled: '已撤单', expired: '收盘失效', rejected: '已拒绝' };
  const ordTbody = $('#orders-tbody');
  if (!account.orders.length) {
    ordTbody.innerHTML = `<tr><td colspan="6" class="empty-cell">暂无模拟委托记录</td></tr>`;
  } else {
    ordTbody.innerHTML = account.orders.slice(0, 100).map((o) => `
      <tr>
        <td>
          <div class="stk-cell">
            <div class="stk-name">${esc(o.name)} <span class="mono muted small">${esc(o.code)}</span></div>
            <div class="stk-sub mono">${fmtStamp(o.createdAt)} · 归属 ${esc(o.tradeDate)}</div>
          </div>
        </td>
        <td><span class="${o.side === 'buy' ? 'up' : 'down'}">${o.side === 'buy' ? '买入' : '卖出'}</span> · ${o.type === 'limit' ? '限价' : '市价'}</td>
        <td class="num mono">${o.price != null ? fmtPrice(o.price) : '市价'}</td>
        <td class="num mono">${o.qty.toLocaleString('zh-CN')}</td>
        <td>
          <div>${statusMap[o.status] || o.status}</div>
          ${o.reason ? `<div class="small muted">${esc(o.reason)}</div>` : ''}
        </td>
        <td class="act">
          ${o.status === 'pending' ? `<button class="btn-xs danger" data-cancel="${esc(o.id)}" type="button">撤单</button>` : '—'}
        </td>
      </tr>`).join('');
  }

  // 成交与复盘
  const range = { from: ui.dateFrom || null, to: ui.dateTo || null };
  const stats = reviewStats(account, range);
  $('#review-stats').innerHTML = `
    <div class="rev-item"><span>成交笔数</span><b class="mono">${stats.count}（买${stats.buyCount}/卖${stats.sellCount}）</b></div>
    <div class="rev-item"><span>区间已实现盈亏</span><b class="mono ${dirClass(stats.realized)}">${fmtSignedMoney(stats.realized)}</b></div>
    <div class="rev-item"><span>卖出胜率</span><b class="mono">${stats.winRate != null ? fmtPct(stats.winRate, { ratio: true, signed: false }) : '—'}</b></div>
    <div class="rev-item"><span>累计模拟费用</span><b class="mono">${fmtMoney(stats.fees)}</b></div>
    <div class="rev-item"><span>买入总额</span><b class="mono">${fmtAmount(stats.buyAmount)}</b></div>
    <div class="rev-item"><span>卖出总额</span><b class="mono">${fmtAmount(stats.sellAmount)}</b></div>
  `;

  const fills = filterByDate(account.fills, range);
  const fillsTbody = $('#fills-tbody');
  if (!fills.length) {
    fillsTbody.innerHTML = `<tr><td colspan="6" class="empty-cell">当前日期范围内暂无模拟成交记录</td></tr>`;
  } else {
    fillsTbody.innerHTML = fills.slice(0, 200).map((f) => `
      <tr>
        <td class="mono small">
          <div>成交 ${fmtStamp(f.time)}</div>
          <div class="muted">行情 ${f.quoteTime ? fmtStamp(f.quoteTime) : '—'}</div>
        </td>
        <td>
          <div><strong>${esc(f.name)}</strong> <span class="mono muted small">${esc(f.code)}</span></div>
          <div class="small"><span class="${f.side === 'buy' ? 'up' : 'down'}">${f.side === 'buy' ? '模拟买入' : '模拟卖出'}</span> · ${esc(f.priceBasis || '')}</div>
        </td>
        <td class="num mono">${fmtPrice(f.price)}</td>
        <td class="num mono">
          <div>${f.qty.toLocaleString('zh-CN')} 股</div>
          <div class="small muted">${fmtMoney(f.amount)}</div>
        </td>
        <td class="num mono small">${fmtMoney(f.fees.total)}</td>
        <td class="num mono ${f.realizedPnl != null ? dirClass(f.realizedPnl) : 'muted'}">${f.realizedPnl != null ? fmtSignedMoney(f.realizedPnl) : '—'}</td>
      </tr>`).join('');
  }
}

// ---------------------------------------------------------------- 个股详情 & 图表 & 下单
async function openStock(symbol, { openDrawer = true, side } = {}) {
  const p = parseSymbol(symbol);
  if (!p) return;
  ui.selected = p.symbol;
  if (side) ui.side = side;
  if (openDrawer) {
    ui.drawerOpen = true;
    $('#detail-drawer').classList.add('open');
    $('#detail-drawer').setAttribute('aria-hidden', 'false');
  }
  renderMarketTable();
  renderDetailQuoteOnly(true);

  try {
    await market.getQuotes([ui.selected]);
  } catch { /* status banner handles error */ }
  renderDetailQuoteOnly(true);
  await loadDetailChart();
}

function closeDrawer() {
  ui.drawerOpen = false;
  $('#detail-drawer').classList.remove('open');
  $('#detail-drawer').setAttribute('aria-hidden', 'true');
}

function renderDetailQuoteOnly(syncInputs = false) {
  const sym = ui.selected;
  const q = market.getCachedQuote(sym);
  const b = boardInfo(sym);

  $('#d-name').textContent = q?.name || sym;
  $('#d-symbol').textContent = sym.toUpperCase();
  $('#d-board').textContent = boardBadge(sym) || '指数';

  const riskEl = $('#d-risk');
  if (q?.noTrade) { riskEl.hidden = false; riskEl.textContent = '无成交/停牌'; }
  else if (isDelisting(q?.name)) { riskEl.hidden = false; riskEl.textContent = '退市整理'; }
  else if (isST(q?.name)) { riskEl.hidden = false; riskEl.textContent = '风险警示'; }
  else riskEl.hidden = true;

  $('#d-source-time').textContent = q
    ? `${q.source} · ${q.time ? fmtStamp(q.time) : '—'}${q.demo ? ' · 演示' : ''}`
    : '行情暂不可用';

  const watched = isWatched(account, sym);
  const starBtn = $('#d-star');
  starBtn.textContent = watched ? '★ 已自选' : '☆ 自选';
  starBtn.classList.toggle('saved', watched);

  const cls = dirClass(q?.changePct);
  $('#d-price').textContent = fmtPrice(q?.price);
  $('#d-price').className = `hero-price mono ${cls}`;
  $('#d-change').textContent = q ? `${fmtSigned(q.change)} (${fmtPct(q.changePct)})` : '—';
  $('#d-change').className = `hero-change mono ${cls}`;

  const band = priceBand(q, { name: q?.name });
  $('#d-limit-up').textContent = band ? `${fmtPrice(band.up)}${band.source === 'feed' ? '' : '*'}` : '—';
  $('#d-limit-down').textContent = band ? `${fmtPrice(band.down)}${band.source === 'feed' ? '' : '*'}` : '—';

  const metrics = [
    ['今开', fmtPrice(q?.open)],
    ['昨收', fmtPrice(q?.prevClose)],
    ['最高', fmtPrice(q?.high)],
    ['最低', fmtPrice(q?.low)],
    ['成交量', fmtShares(q?.volume)],
    ['成交额', fmtAmount(q?.amount)],
    ['换手率', q?.turnoverRate != null ? fmtPct(q.turnoverRate, { signed: false }) : '—'],
    ['市盈率', q?.pe != null && q.pe !== 0 ? fmtPrice(q.pe, 2) : '—'],
  ];
  $('#d-metrics').innerHTML = metrics.map(([k, v]) => `<div class="metric-item"><span>${k}</span><b class="mono">${v}</b></div>`).join('');

  // 五档盘口（仅数据源实际提供时展示）
  const bookPanel = $('#d-book-panel');
  if (q && ((q.bids && q.bids.length) || (q.asks && q.asks.length))) {
    bookPanel.hidden = false;
    $('#d-book-delay').textContent = q.delayText || '盘口快照存在延迟';
    $('#d-bids').innerHTML = q.bids.map((lv, i) => `
      <button class="book-row mono" data-fill-price="${lv.price}" type="button">
        <span class="muted">买${i + 1}</span>
        <span class="${dirClass(lv.price - (q.prevClose || lv.price))}">${fmtPrice(lv.price)}</span>
        <span>${lv.vol}</span>
      </button>`).join('');
    $('#d-asks').innerHTML = q.asks.map((lv, i) => `
      <button class="book-row mono" data-fill-price="${lv.price}" type="button">
        <span class="muted">卖${i + 1}</span>
        <span class="${dirClass(lv.price - (q.prevClose || lv.price))}">${fmtPrice(lv.price)}</span>
        <span>${lv.vol}</span>
      </button>`).join('');
  } else {
    bookPanel.hidden = true;
  }

  // 同步下单控件默认值
  $$('.t-side').forEach((btn) => btn.classList.toggle('active', btn.dataset.side === ui.side));
  $$('#order-type-seg .seg-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.otype === ui.otype));
  $('#price-input-row').hidden = ui.otype === 'market';
  $('#t-rule-hint').textContent = b ? b.lotText : '不可交易';

  const stepInfo = quantityStep(sym, ui.side);
  const qtyInput = $('#t-qty');
  qtyInput.step = String(stepInfo.step);
  qtyInput.min = String(stepInfo.min);
  if (syncInputs) {
    if (q?.price > 0) $('#t-price').value = q.price.toFixed(2);
    if (ui.side === 'buy') qtyInput.value = String(stepInfo.min);
  }
  updateTicketPreview();
}

async function loadDetailChart() {
  const box = $('#d-chart');
  box.innerHTML = `<div class="chart-empty">正在加载${ui.tf}图表…</div>`;
  try {
    const res = await market.getChart(ui.selected, ui.tf);
    if (!res.supported) {
      box.innerHTML = `<div class="chart-empty">${esc(res.reason || '当前数据源不支持该周期，未以假数据补图。')}</div>`;
      return;
    }
    if (ui.tf === '1D' || ui.tf === '5D') {
      renderIntradayChart(box, { points: res.points, prevClose: res.prevClose, is5Day: ui.tf === '5D' });
    } else {
      renderKlineChart(box, { points: res.points });
    }
  } catch (e) {
    box.innerHTML = `<div class="chart-empty">图表数据暂不可用：${esc(e.message)}</div>`;
  }
}

function getTicketInput() {
  return {
    symbol: ui.selected,
    side: ui.side,
    type: ui.otype,
    price: Number($('#t-price').value),
    qty: parseInt($('#t-qty').value, 10),
  };
}

function updateTicketPreview() {
  const q = market.getCachedQuote(ui.selected);
  const pv = previewOrder(account, getTicketInput(), { quote: q, now: clockNow() });

  if (ui.side === 'buy') {
    $('#t-avail-label').textContent = '可用资金';
    $('#t-avail-val').textContent = fmtMoney(account.cash);
  } else {
    $('#t-avail-label').textContent = '可卖数量（T+1）';
    $('#t-avail-val').textContent = `${(pv.sellable || 0).toLocaleString('zh-CN')} 股${pv.locked ? `（锁 ${pv.locked}）` : ''}`;
  }

  $('#t-est-amt').textContent = pv.amount > 0 ? fmtMoney(pv.amount) : '—';
  $('#t-est-fee').textContent = pv.fees ? fmtMoney(pv.fees.total) : '—';

  const msgs = [
    ...pv.errors.map((e) => `<div class="msg-err">${esc(e)}</div>`),
    ...pv.warnings.map((w) => `<div class="msg-warn">${esc(w)}</div>`),
  ];
  $('#t-msgs').innerHTML = msgs.join('');

  const btn = $('#btn-submit-order');
  btn.disabled = !pv.ok;
  btn.className = `btn submit-btn ${ui.side}`;
  btn.textContent = ui.side === 'buy'
    ? `创建模拟买入委托 (${pv.code || ''})`
    : `创建模拟卖出委托 (${pv.code || ''})`;
  return pv;
}

function openConfirmModal() {
  const q = market.getCachedQuote(ui.selected);
  const input = getTicketInput();
  const pv = previewOrder(account, input, { quote: q, now: clockNow() });
  if (!pv.ok) {
    toast(pv.errors[0] || '委托参数无效');
    return;
  }
  ui.pendingConfirm = { input, pv };
  $('#confirm-title').textContent = `确认模拟${pv.side === 'buy' ? '买入' : '卖出'}委托`;
  $('#confirm-body').innerHTML = `
    <div class="kv-row"><span class="muted">标的</span><strong>${esc(pv.name)} (${esc(pv.symbol.toUpperCase())}) · ${esc(pv.board.label)}</strong></div>
    <div class="kv-row"><span class="muted">方向 / 类型</span><strong class="${pv.side === 'buy' ? 'up' : 'down'}">模拟${pv.side === 'buy' ? '买入' : '卖出'} · ${pv.type === 'limit' ? '限价委托' : '市价模拟'}</strong></div>
    <div class="kv-row"><span class="muted">委托价格</span><strong class="mono">${pv.type === 'limit' ? `¥${fmtPrice(pv.price)}` : `市价参考 ¥${fmtPrice(pv.estPrice)} (${esc(pv.priceBasis || '最新价')})`}</strong></div>
    <div class="kv-row"><span class="muted">委托数量</span><strong class="mono">${pv.qty.toLocaleString('zh-CN')} 股</strong></div>
    <div class="kv-row"><span class="muted">估算成交金额</span><strong class="mono">${fmtMoney(pv.amount)}</strong></div>
    <div class="kv-row"><span class="muted">估算总费用</span><strong class="mono">${fmtMoney(pv.fees.total)}</strong></div>
    <div class="kv-row"><span class="muted">${pv.side === 'buy' ? '预计冻结/扣除' : '预计净到账'}</span><strong class="mono">${fmtMoney(pv.total)}</strong></div>
    <div class="fee-basis">
      <div><strong>费用估算依据（用户练习参数，非券商实际费率）：</strong></div>
      ${pv.fees.basis.map((line) => `<div>• ${esc(line)}</div>`).join('')}
      <div>• 委托归属交易日：${esc(pv.tradeDate)}（仅模拟成交，无真实券商路由）</div>
    </div>
  `;
  $('#confirm-modal').hidden = false;
  $('#confirm-ok').focus();
}

function submitConfirmedOrder() {
  if (!ui.pendingConfirm) return;
  const { input } = ui.pendingConfirm;
  const q = market.getCachedQuote(input.symbol);
  const res = placeOrder(account, input, { quote: q, now: clockNow() });
  $('#confirm-modal').hidden = true;
  ui.pendingConfirm = null;

  if (!res.ok) {
    toast(`委托未提交：${res.error}`);
    return;
  }
  let next = res.state;
  const sum = portfolioSummary(next, market.getAllCachedQuotes(), clockNow());
  next = recordEquity(next, sum, clockNow());
  persist(next);

  if (res.fill) {
    toast(`模拟${res.fill.side === 'buy' ? '买入' : '卖出'}成交：${res.fill.name} ${res.fill.qty} 股 @ ¥${fmtPrice(res.fill.price)}`);
  } else {
    toast(`模拟限价单已挂出：${res.waitingReason || '等待行情满足条件后成交'}`);
  }
  renderAccountViews();
  renderDetailQuoteOnly();
}

// ---------------------------------------------------------------- 自选分组弹窗
function openGroupModal(symbol, name) {
  const body = $('#group-modal-body');
  body.innerHTML = account.watch.groups.map((g) => {
    const has = g.items.some((i) => i.symbol === symbol);
    return `
      <div class="kv-row">
        <span>${esc(g.name)} (${g.items.length})</span>
        <button class="btn-xs ${has ? 'danger' : ''}" data-gpick="${esc(g.id)}" data-has="${has ? '1' : '0'}" type="button">
          ${has ? '移出分组' : '加入分组'}
        </button>
      </div>`;
  }).join('');
  body.dataset.symbol = symbol;
  body.dataset.name = name || symbol;
  $('#group-modal').hidden = false;
}

// ---------------------------------------------------------------- 设置表单同步
function renderSettingsForm() {
  const s = account.settings;
  $('#cfg-provider').value = s.provider || 'public';
  $('#cfg-proxy-base').value = s.proxyBase || '';
  $('#proxy-url-field').hidden = $('#cfg-provider').value !== 'proxy';
  $('#cfg-comm-rate').value = s.fees.commissionRate;
  $('#cfg-comm-min').value = s.fees.commissionMin;
  $('#cfg-stamp-rate').value = s.fees.stampDutyRate;
  $('#cfg-transfer-rate').value = s.fees.transferFeeRate;
  $('#cfg-offhours').checked = !!s.practiceOffHours;
  $('#btn-test-fault').textContent = market.simulateFault ? '关闭模拟故障' : '模拟行情故障';
  renderStatus();
}

// ---------------------------------------------------------------- 视图切换
function switchTab(tab) {
  ui.tab = tab;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab}`));
  $$('.nav-btn, .mnav-btn').forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (tab === 'watch') renderWatchTable();
  if (tab === 'portfolio') renderAccountViews();
  if (tab === 'settings') renderSettingsForm();
}

// ---------------------------------------------------------------- 事件绑定
function bindEvents() {
  $$('.nav-btn, .mnav-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#status-pill').addEventListener('click', () => switchTab('settings'));
  $('#btn-refresh').addEventListener('click', () => { toast('正在刷新行情…'); refreshAll(); });
  $('#btn-retry-feed').addEventListener('click', () => {
    market.configure({ simulateFault: false });
    renderSettingsForm();
    refreshAll();
  });
  $('#btn-use-demo').addEventListener('click', () => {
    market.configure({ mode: 'demo', simulateFault: false });
    persist(updateSettings(account, { provider: 'demo' }));
    renderSettingsForm();
    refreshAll();
    toast('已切换为静态演示快照（非实时）');
  });

  // 搜索防抖
  let searchTimer;
  $('#market-search').addEventListener('input', (e) => {
    ui.search = e.target.value;
    $('#search-clear').hidden = !ui.search;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { ui.page = 1; refreshMarketList(); }, 260);
  });
  $('#search-clear').addEventListener('click', () => {
    $('#market-search').value = '';
    ui.search = '';
    $('#search-clear').hidden = true;
    ui.page = 1;
    refreshMarketList();
  });

  // 板块筛选 & 排序 & 分页
  $('#board-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-board]');
    if (!btn) return;
    ui.board = btn.dataset.board;
    ui.page = 1;
    $$('#board-chips .chip').forEach((c) => {
      c.classList.toggle('active', c === btn);
      c.setAttribute('aria-selected', String(c === btn));
    });
    refreshMarketList();
  });

  $('#sort-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    ui.sort = btn.dataset.sort;
    ui.asc = btn.dataset.asc === '1';
    ui.page = 1;
    $$('#sort-bar .sort-btn').forEach((b) => b.classList.toggle('active', b === btn));
    refreshMarketList();
  });

  $('#btn-prev-page').addEventListener('click', () => { if (ui.page > 1) { ui.page--; refreshMarketList(); } });
  $('#btn-next-page').addEventListener('click', () => { ui.page++; refreshMarketList(); });

  // 行情表点击
  $('#market-tbody').addEventListener('click', (e) => {
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      e.stopPropagation();
      const sym = actBtn.dataset.sym;
      if (actBtn.dataset.act === 'star') openGroupModal(sym, actBtn.dataset.name);
      else openStock(sym, { openDrawer: true, side: 'buy' });
      return;
    }
    const tr = e.target.closest('tr[data-symbol]');
    if (tr) openStock(tr.dataset.symbol, { openDrawer: true });
  });

  // 自选页事件
  $('#group-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-gid]');
    if (!btn) return;
    const next = { ...account, watch: { ...account.watch, activeGroupId: btn.dataset.gid } };
    persist(next);
    renderWatchTable();
  });
  $('#btn-add-group').addEventListener('click', () => {
    const name = prompt('输入新自选分组名称（最多 12 字）：');
    if (!name) return;
    const res = createGroup(account, name);
    if (!res.ok) return toast(res.error);
    persist(res.state);
    renderWatchTable();
  });
  $('#btn-rename-group').addEventListener('click', () => {
    const cur = account.watch.groups.find((g) => g.id === account.watch.activeGroupId);
    const name = prompt('重命名分组：', cur?.name || '');
    if (!name) return;
    const res = renameGroup(account, cur.id, name);
    if (!res.ok) return toast(res.error);
    persist(res.state);
    renderWatchTable();
  });
  $('#btn-delete-group').addEventListener('click', () => {
    const cur = account.watch.groups.find((g) => g.id === account.watch.activeGroupId);
    if (!cur || cur.id === 'default') return;
    if (!confirm(`确定删除自选分组“${cur.name}”？`)) return;
    const res = deleteGroup(account, cur.id);
    if (res.ok) { persist(res.state); renderWatchTable(); }
  });
  $('#watch-search').addEventListener('input', (e) => { ui.watchSearch = e.target.value; renderWatchTable(); });
  $('#watch-sort').addEventListener('change', (e) => { ui.watchSort = e.target.value; renderWatchTable(); });
  $('#watch-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wact]');
    if (btn) {
      e.stopPropagation();
      const sym = btn.dataset.sym;
      const gid = account.watch.activeGroupId;
      if (btn.dataset.wact === 'up') persist(moveInWatch(account, gid, sym, -1));
      else if (btn.dataset.wact === 'down') persist(moveInWatch(account, gid, sym, 1));
      else if (btn.dataset.wact === 'rm') persist(removeFromWatch(account, sym, gid));
      renderWatchTable();
      renderMarketTable();
      renderDetailQuoteOnly();
      return;
    }
    const tr = e.target.closest('tr[data-symbol]');
    if (tr) openStock(tr.dataset.symbol, { openDrawer: true });
  });

  // 持仓子页签与操作
  $('#portfolio-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ptab]');
    if (!btn) return;
    ui.ptab = btn.dataset.ptab;
    $$('#portfolio-tabs .sub-tab').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    $('#ptab-positions').hidden = ui.ptab !== 'positions';
    $('#ptab-orders').hidden = ui.ptab !== 'orders';
    $('#ptab-fills').hidden = ui.ptab !== 'fills';
  });
  $('#positions-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pact]');
    if (btn) { e.stopPropagation(); openStock(btn.dataset.sym, { openDrawer: true, side: 'sell' }); return; }
    const tr = e.target.closest('tr[data-symbol]');
    if (tr) openStock(tr.dataset.symbol, { openDrawer: true });
  });
  $('#orders-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    const res = cancelOrder(account, btn.dataset.cancel, clockNow());
    if (!res.ok) return toast(res.error);
    persist(res.state);
    renderAccountViews();
    renderDetailQuoteOnly();
    toast('已模拟撤单并释放冻结资金/股数');
  });
  $('#filter-from').addEventListener('change', (e) => { ui.dateFrom = e.target.value; renderAccountViews(); });
  $('#filter-to').addEventListener('change', (e) => { ui.dateTo = e.target.value; renderAccountViews(); });
  $('#btn-clear-dates').addEventListener('click', () => {
    ui.dateFrom = ''; ui.dateTo = '';
    $('#filter-from').value = ''; $('#filter-to').value = '';
    renderAccountViews();
  });

  // 详情面板与下单区
  $('#detail-close').addEventListener('click', closeDrawer);
  $('#d-star').addEventListener('click', () => {
    const q = market.getCachedQuote(ui.selected);
    openGroupModal(ui.selected, q?.name || ui.selected);
  });
  $('#tf-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tf]');
    if (!btn) return;
    ui.tf = btn.dataset.tf;
    $$('#tf-tabs .tf-btn').forEach((b) => b.classList.toggle('active', b === btn));
    loadDetailChart();
  });
  $('#d-book-panel').addEventListener('click', (e) => {
    const row = e.target.closest('[data-fill-price]');
    if (!row) return;
    ui.otype = 'limit';
    $('#t-price').value = Number(row.dataset.fillPrice).toFixed(2);
    renderDetailQuoteOnly();
  });

  $$('.t-side').forEach((b) => b.addEventListener('click', () => {
    ui.side = b.dataset.side;
    renderDetailQuoteOnly(true);
  }));
  $('#order-type-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-otype]');
    if (!btn) return;
    ui.otype = btn.dataset.otype;
    renderDetailQuoteOnly();
  });

  $('#t-price').addEventListener('input', updateTicketPreview);
  $('#t-qty').addEventListener('input', updateTicketPreview);
  $('#t-price-minus').addEventListener('click', () => {
    const v = Math.max(0.01, round2((Number($('#t-price').value) || 0) - 0.01));
    $('#t-price').value = v.toFixed(2);
    updateTicketPreview();
  });
  $('#t-price-plus').addEventListener('click', () => {
    const v = round2((Number($('#t-price').value) || 0) + 0.01);
    $('#t-price').value = v.toFixed(2);
    updateTicketPreview();
  });
  $('#t-qty-minus').addEventListener('click', () => {
    const st = quantityStep(ui.selected, ui.side);
    const cur = parseInt($('#t-qty').value, 10) || st.min;
    $('#t-qty').value = String(Math.max(st.min, cur - st.step));
    updateTicketPreview();
  });
  $('#t-qty-plus').addEventListener('click', () => {
    const st = quantityStep(ui.selected, ui.side);
    const cur = parseInt($('#t-qty').value, 10) || 0;
    $('#t-qty').value = String(cur + st.step);
    updateTicketPreview();
  });
  $('#quick-qty').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-frac]');
    if (!btn) return;
    const frac = Number(btn.dataset.frac);
    const q = market.getCachedQuote(ui.selected);
    const pv = previewOrder(account, getTicketInput(), { quote: q, now: clockNow() });
    if (ui.side === 'buy') {
      const price = ui.otype === 'limit' ? Number($('#t-price').value) || q?.price : q?.price;
      const ex = ui.selected.slice(0, 2).toUpperCase();
      const maxQ = maxBuyQty({
        symbol: ui.selected, cash: account.cash * frac, price,
        feeFn: (amt) => calcFees({ side: 'buy', amount: amt, exchange: ex }, account.settings.fees).total,
      });
      if (maxQ > 0) $('#t-qty').value = String(maxQ);
    } else {
      const s = pv.sellable || 0;
      const b = boardInfo(ui.selected);
      let target = frac === 1 ? s : Math.floor(s * frac);
      if (frac !== 1 && b && b.buyStep > 1) target = Math.floor(target / 100) * 100;
      $('#t-qty').value = String(Math.max(0, target));
    }
    updateTicketPreview();
  });
  $('#btn-submit-order').addEventListener('click', openConfirmModal);

  // 确认弹窗
  $('#confirm-close').addEventListener('click', () => { $('#confirm-modal').hidden = true; });
  $('#confirm-cancel').addEventListener('click', () => { $('#confirm-modal').hidden = true; });
  $('#confirm-ok').addEventListener('click', submitConfirmedOrder);

  // 自选分组弹窗
  $('#group-modal-close').addEventListener('click', () => { $('#group-modal').hidden = true; });
  $('#group-modal-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-gpick]');
    if (!btn) return;
    const body = $('#group-modal-body');
    const sym = body.dataset.symbol;
    const name = body.dataset.name;
    const gid = btn.dataset.gpick;
    if (btn.dataset.has === '1') persist(removeFromWatch(account, sym, gid));
    else persist(addToWatch(account, gid, { symbol: sym, name }, clockNow()));
    openGroupModal(sym, name);
    renderWatchTable();
    renderMarketTable();
    renderDetailQuoteOnly();
  });

  // 设置页
  $('#cfg-provider').addEventListener('change', (e) => {
    $('#proxy-url-field').hidden = e.target.value !== 'proxy';
  });
  $('#btn-save-provider').addEventListener('click', () => {
    const provider = $('#cfg-provider').value;
    const proxyBase = $('#cfg-proxy-base').value.trim();
    persist(updateSettings(account, { provider, proxyBase }));
    market.configure({ mode: provider, proxyBase, simulateFault: false });
    renderSettingsForm();
    refreshAll();
    toast('数据源配置已保存');
  });
  $('#btn-test-fault').addEventListener('click', () => {
    market.configure({ simulateFault: !market.simulateFault });
    renderSettingsForm();
    refreshAll();
  });
  $('#btn-save-fees').addEventListener('click', () => {
    persist(updateSettings(account, {
      practiceOffHours: $('#cfg-offhours').checked,
      fees: {
        commissionRate: Number($('#cfg-comm-rate').value),
        commissionMin: Number($('#cfg-comm-min').value),
        stampDutyRate: Number($('#cfg-stamp-rate').value),
        transferFeeRate: Number($('#cfg-transfer-rate').value),
      },
    }));
    renderDetailQuoteOnly();
    toast('交易与费用参数已保存');
  });
  $('#btn-advance-day').addEventListener('click', () => {
    const curDate = shDate(clockNow());
    const nextDay = nextTradingDay(curDate);
    const targetMs = fromShanghai(nextDay, 10, 0, 0);
    setClockOffset(targetMs - Date.now());
    const rolled = rollover(account, clockNow());
    if (rolled.state !== account) persist(rolled.state);
    renderClock();
    renderAccountViews();
    renderDetailQuoteOnly();
    toast(`已模拟推进至下一交易日 ${nextDay} 10:00（T+1 持仓已解锁）`);
  });
  $('#btn-reset-clock').addEventListener('click', () => {
    setClockOffset(0);
    renderClock();
    renderAccountViews();
    renderDetailQuoteOnly();
    toast('已恢复真实北京时间');
  });

  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([exportBackup(account, clockNow())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `papertrade-ashare-backup-${shDate(clockNow())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出模拟账户备份文件');
  });
  $('#input-import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const res = parseBackup(text);
    if (!res.ok) return toast(`导入失败：${res.error}`);
    persist(res.state);
    market.configure({ mode: account.settings.provider, proxyBase: account.settings.proxyBase });
    applyTheme();
    renderSettingsForm();
    renderWatchTable();
    renderAccountViews();
    renderDetailQuoteOnly();
    toast('账户备份导入成功');
  });
  $('#btn-toggle-theme').addEventListener('click', () => {
    const nextTheme = account.settings.theme === 'light' ? 'dark' : 'light';
    persist(updateSettings(account, { theme: nextTheme }));
    applyTheme();
  });
  $('#btn-reset-account').addEventListener('click', () => {
    if (!confirm('确定重置模拟账户吗？将清空所有持仓、委托、成交记录与自选分组，恢复 ¥100,000 虚拟初始资金。')) return;
    persist(createAccount({ now: clockNow(), settings: account.settings }));
    renderWatchTable();
    renderAccountViews();
    renderDetailQuoteOnly();
    toast('模拟账户已重置');
  });

  // 键盘 ESC 关闭模态框与抽屉；在线/离线监听
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#confirm-modal').hidden) $('#confirm-modal').hidden = true;
      else if (!$('#group-modal').hidden) $('#group-modal').hidden = true;
      else if (ui.drawerOpen) closeDrawer();
    }
  });
  window.addEventListener('online', () => { toast('网络已恢复，正在刷新行情'); refreshAll(); });
  window.addEventListener('offline', () => { renderStatus(); toast('浏览器已断网'); });
}

// ---------------------------------------------------------------- 启动
applyTheme();
bindEvents();
renderSettingsForm();
renderWatchTable();
renderAccountViews();
renderClock();
if (loaded.migrated) toast('已自动迁移旧版模拟账户数据');

refreshAll();

setInterval(renderClock, 1000);
setInterval(() => {
  if (document.hidden) return;
  const phase = marketPhase(clockNow());
  if (!phase.inSession && market.mode !== 'demo') return;
  refreshIndices();
  refreshTrackedQuotes();
  if (!ui.search.trim()) refreshMarketList();
}, 15_000);

// UI 格式化工具与视图渲染组件
import { BENCHMARK_ITEMS } from './config.js';
import { getInstrument } from './catalog.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtUsd(n, decimals = 2) {
  const num = Number(n);
  if (n === null || n === undefined || !Number.isFinite(num)) return '—';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtSignedUsd(n, decimals = 2) {
  const num = Number(n);
  if (n === null || n === undefined || !Number.isFinite(num)) return '—';
  const prefix = num > 0 ? '+' : num < 0 ? '−' : '';
  return `${prefix}$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function fmtPct(n) {
  const num = Number(n);
  if (n === null || n === undefined || !Number.isFinite(num)) return '—';
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
}

export function fmtQty(n) {
  const num = Number(n);
  if (n === null || n === undefined || !Number.isFinite(num)) return '—';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

export function fmtVolume(n) {
  const num = Number(n);
  if (n === null || n === undefined || !Number.isFinite(num) || num < 0) return '—';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString('en-US');
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function renderBenchmarks(containerEl, marketData) {
  if (!containerEl) return;
  containerEl.innerHTML = BENCHMARK_ITEMS.map((item) => {
    const q = marketData.getQuote(item.symbol);
    const pct = q?.percent;
    const cls = Number.isFinite(pct) ? (pct >= 0 ? 'positive-text' : 'negative-text') : '';
    return `
      <button class="bench-item" type="button" data-bench-symbol="${esc(item.symbol)}" aria-label="查看 ${esc(item.label)} (${esc(item.symbol)})">
        <div class="bench-meta">
          <b>${esc(item.symbol)} <span style="font-weight:400;color:var(--muted)">· ${esc(item.exchange)}</span></b>
          <small>${esc(item.label)}</small>
        </div>
        <div class="bench-quote">
          <span class="bp">${q ? fmtUsd(q.price) : '—'}</span>
          <span class="bc ${cls}">${q ? fmtPct(pct) : '待同步'}</span>
        </div>
      </button>
    `;
  }).join('');
}

export function renderNonTradableCards(containerEl, matches) {
  if (!containerEl) return;
  if (!matches || matches.length === 0) {
    containerEl.hidden = true;
    containerEl.innerHTML = '';
    return;
  }
  containerEl.hidden = false;
  containerEl.innerHTML = matches
    .map(
      (m) => `
      <div class="non-tradable-card">
        <div>
          <div class="nt-head">
            <strong>${esc(m.name)}</strong>
            <span class="nt-badge">${esc(m.badge)}</span>
          </div>
          <p class="nt-desc">${esc(m.description)}</p>
        </div>
        ${
          m.officialUrl
            ? `<a class="nt-link" href="${esc(m.officialUrl)}" target="_blank" rel="noopener noreferrer">${esc(m.officialLabel || '官方信息 ↗')}</a>`
            : ''
        }
      </div>
    `
    )
    .join('');
}

export function renderStockRows(tbodyEl, pageItems, { selectedSymbol, watchlist, marketData, isConfigured, searchQuery }) {
  if (!tbodyEl) return;
  if (pageItems.length === 0) {
    const hint = searchQuery
      ? isConfigured
        ? `未在本地目录找到与 “${esc(searchQuery)}” 匹配的可交易美股；可点击上方“全市场检索”查询数据源，或核对是否为非上市/已退市代码。`
        : `未在内置美股目录找到与 “${esc(searchQuery)}” 匹配的可交易证券（连接行情源后可使用全市场检索）。`
      : '当前筛选条件下暂无匹配股票。';
    tbodyEl.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;color:var(--muted);padding:28px 16px;">${hint}</td>
      </tr>
    `;
    return;
  }

  tbodyEl.innerHTML = pageItems
    .map((inst) => {
      const q = marketData.getQuote(inst.symbol);
      const freshInfo = marketData.getQuoteFreshnessInfo(inst.symbol);
      const saved = watchlist.includes(inst.symbol);
      const isSelected = inst.symbol === selectedSymbol;
      const pct = q?.percent;
      const chg = q?.change;
      const moveCls = Number.isFinite(pct) ? (pct >= 0 ? 'positive-text' : 'negative-text') : '';
      const typeClass = inst.assetType === 'ETF' ? 'etf' : inst.assetType === 'ADR' ? 'adr' : '';
      const displayName = inst.nameZh ? `${inst.name} · ${inst.nameZh}` : inst.name;
      const dayRange =
        q && q.open && q.low && q.high ? `${fmtUsd(q.open)} / ${fmtUsd(q.low)}–${fmtUsd(q.high)}` : '—';

      return `
        <tr class="stock-row ${isSelected ? 'selected-row' : ''}" data-symbol="${esc(inst.symbol)}" tabindex="0" aria-label="${esc(inst.symbol)} ${esc(displayName)}">
          <td>
            <div class="stock-cell">
              <span class="ticker-logo" data-tone="${esc(inst.tone || 'blue')}">${esc(inst.symbol.slice(0, 2))}</span>
              <div>
                <div class="stock-title-line">
                  <span class="stock-name" title="${esc(displayName)}">${esc(displayName)}</span>
                  <span class="type-pill ${typeClass}">${esc(inst.assetType)}</span>
                </div>
                <div class="stock-sub">
                  <b>${esc(inst.symbol)}</b> · <span>${esc(q?.exchange || inst.exchange)}</span> · <span>${esc(q?.currency || inst.currency)}</span>
                </div>
              </div>
            </div>
          </td>
          <td class="num-col mono-cell">${q ? fmtUsd(q.price) : '—'}</td>
          <td class="num-col">
            ${
              q && Number.isFinite(pct)
                ? `<div class="change-stack ${moveCls}">
                    <span>${fmtPct(pct)}</span>
                    <small>${fmtSignedUsd(chg)}</small>
                  </div>`
                : '<span class="muted-mono">—</span>'
            }
          </td>
          <td class="num-col hide-sm muted-mono">${dayRange}</td>
          <td class="num-col hide-md muted-mono">${q ? fmtVolume(q.volume) : '—'}</td>
          <td class="hide-md">
            <span class="fresh-tag ${freshInfo.state}">${esc(freshInfo.label)}</span>
          </td>
          <td class="action-col">
            <div class="row-actions">
              <button
                class="row-star ${saved ? 'saved' : ''}"
                type="button"
                data-star="${esc(inst.symbol)}"
                aria-label="${saved ? `将 ${esc(inst.symbol)} 移出自选` : `将 ${esc(inst.symbol)} 加入自选`}"
                title="${saved ? '移出自选' : '加入自选'}"
              >${saved ? '★' : '☆'}</button>
              <button class="row-trade-btn" type="button" data-trade="${esc(inst.symbol)}">交易</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function renderHoldingsTable(tbodyEl, emptyEl, wrapEl, holdings) {
  if (!tbodyEl || !emptyEl || !wrapEl) return;
  if (!holdings || holdings.length === 0) {
    wrapEl.hidden = true;
    emptyEl.hidden = false;
    tbodyEl.innerHTML = '';
    return;
  }

  wrapEl.hidden = false;
  emptyEl.hidden = true;
  tbodyEl.innerHTML = holdings
    .map((h) => {
      const inst = getInstrument(h.symbol) || { name: h.symbol, nameZh: '', tone: 'blue' };
      const title = inst.nameZh ? `${inst.name} (${inst.nameZh})` : inst.name;
      const pnlCls = h.unrealizedPnl !== null ? (h.unrealizedPnl >= 0 ? 'positive-text' : 'negative-text') : '';
      const freezeText = h.frozenQty > 0 ? `${fmtQty(h.sellableQty)} <small style="color:var(--amber)">(冻 ${fmtQty(h.frozenQty)})</small>` : fmtQty(h.sellableQty);

      return `
        <tr>
          <td>
            <div class="stock-cell">
              <span class="ticker-logo" data-tone="${esc(inst.tone)}">${esc(h.symbol.slice(0, 2))}</span>
              <div>
                <div class="stock-name">${esc(title)}</div>
                <div class="stock-sub"><b>${esc(h.symbol)}</b></div>
              </div>
            </div>
          </td>
          <td class="num-col mono-cell">${fmtQty(h.qty)} 股</td>
          <td class="num-col mono-cell">${freezeText}</td>
          <td class="num-col mono-cell">${fmtUsd(h.avgCost)}</td>
          <td class="num-col mono-cell">${h.price !== null ? fmtUsd(h.price) : '<span style="color:var(--amber)">待同步</span>'}</td>
          <td class="num-col mono-cell">${h.marketValue !== null ? fmtUsd(h.marketValue) : '—'}</td>
          <td class="num-col mono-cell ${pnlCls}">
            ${h.unrealizedPnl !== null ? `${fmtSignedUsd(h.unrealizedPnl)} (${fmtPct(h.unrealizedPnlPct)})` : '—'}
          </td>
          <td class="action-col">
            <div class="row-actions">
              <button class="table-mini-btn" type="button" data-pos-act="buy" data-sym="${esc(h.symbol)}">加仓</button>
              <button class="table-mini-btn" type="button" data-pos-act="sell" data-sym="${esc(h.symbol)}">卖出</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function renderOrdersTable(tbodyEl, orders) {
  if (!tbodyEl) return;
  const statusMap = {
    pending: '等待成交',
    filled: '已成交',
    cancelled: '已撤单',
    rejected: '已拒绝'
  };

  tbodyEl.innerHTML = orders
    .slice(0, 100)
    .map((o) => {
      const priceCol =
        o.status === 'filled'
          ? `${fmtUsd(o.fillPrice)}${o.limitPrice ? ` <small style="color:var(--muted)">(限 ${fmtUsd(o.limitPrice)})</small>` : ''}`
          : o.type === 'limit'
          ? `限 ${fmtUsd(o.limitPrice)}`
          : '市价';
      const note = o.rejectReason ? ` · ${esc(o.rejectReason)}` : '';
      return `
        <tr>
          <td class="muted-mono">${esc(fmtDateTime(o.time))}</td>
          <td class="muted-mono">${esc(o.id)}</td>
          <td><b class="mono-cell">${esc(o.symbol)}</b></td>
          <td>
            <span class="${o.side === 'buy' ? 'positive-text' : 'negative-text'}">${o.side === 'buy' ? '买入' : '卖出'}</span>
            · ${o.type === 'limit' ? '限价单' : '市价单'}
          </td>
          <td class="num-col mono-cell">${fmtQty(o.qty)}</td>
          <td class="num-col mono-cell">${priceCol}</td>
          <td>
            <span class="order-status ${esc(o.status)}">${esc(statusMap[o.status] || o.status)}</span>
            <small style="color:var(--muted)">${note}</small>
          </td>
          <td class="action-col">
            <div class="row-actions">
              <button class="table-mini-btn" type="button" data-inspect-order="${esc(o.id)}">详情</button>
              ${
                o.status === 'pending'
                  ? `<button class="table-mini-btn danger" type="button" data-cancel-order="${esc(o.id)}">撤单</button>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function renderTradesTable(tbodyEl, trades) {
  if (!tbodyEl) return;
  tbodyEl.innerHTML = trades
    .slice(0, 100)
    .map((t) => {
      const pnlCls = t.realizedPnl !== null ? (t.realizedPnl >= 0 ? 'positive-text' : 'negative-text') : '';
      return `
        <tr>
          <td class="muted-mono">${esc(fmtDateTime(t.time))}</td>
          <td class="muted-mono">${esc(t.id)}</td>
          <td><b class="mono-cell">${esc(t.symbol)}</b></td>
          <td>
            <span class="${t.side === 'buy' ? 'positive-text' : 'negative-text'}">${t.side === 'buy' ? '买入' : '卖出'}</span>
            · ${t.type === 'limit' ? '限价' : '市价'}
          </td>
          <td class="num-col mono-cell">${fmtQty(t.qty)}</td>
          <td class="num-col mono-cell">${fmtUsd(t.price)}</td>
          <td class="num-col mono-cell">${fmtUsd(t.gross)} <small style="color:var(--muted)">(滑点 ${fmtUsd(t.slippage)})</small></td>
          <td class="num-col mono-cell ${pnlCls}">${t.realizedPnl !== null ? fmtSignedUsd(t.realizedPnl) : '—'}</td>
        </tr>
      `;
    })
    .join('');
}

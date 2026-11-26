// 真实历史 K 线（面积折线图 / OHLC 蜡烛图）与成交量交互式 SVG 渲染器
// 严格要求：仅渲染来自数据源的真实时间序列，绝不合成任何随机或虚构 K 线。

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtPrice(n) {
  return Number.isFinite(n) ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function fmtVol(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function shortTimeLabel(dt, range) {
  if (!dt) return '';
  if (range === '1D') return dt.slice(11, 16) || dt;
  if (range === '1W') return dt.slice(5, 16) || dt;
  return dt.slice(0, 10);
}

export function renderChartPlaceholder(svgEl, labelsEl, tooltipEl, message, isError = false) {
  if (!svgEl) return;
  const color = isError ? '#ff7d8a' : '#858f9e';
  svgEl.innerHTML = `
    <rect x="0" y="0" width="560" height="190" fill="transparent" />
    <path class="chart-grid" d="M0 32H560 M0 88H560 M0 144H560" />
    <text x="280" y="96" text-anchor="middle" fill="${color}" font-size="11.5" font-family="var(--sans)">${esc(message)}</text>
  `;
  if (labelsEl) labelsEl.innerHTML = '<span>—</span><span>—</span><span>—</span>';
  if (tooltipEl) tooltipEl.hidden = true;
  svgEl._chartData = null;
}

export function renderPriceChart(svgEl, labelsEl, tooltipEl, seriesEntry, mode = 'area') {
  if (!svgEl) return;
  if (!seriesEntry || !Array.isArray(seriesEntry.values) || seriesEntry.values.length < 2) {
    renderChartPlaceholder(svgEl, labelsEl, tooltipEl, '连接行情源后按需加载真实历史 K 线');
    return;
  }

  const values = seriesEntry.values;
  const range = seriesEntry.range || '1D';
  const W = 560;
  const H = 190;
  const padTop = 14;
  const padBottom = 36; // 底部成交量柱区域
  const chartH = H - padTop - padBottom;

  const lows = values.map((v) => (Number.isFinite(v.low) && v.low > 0 ? v.low : v.close));
  const highs = values.map((v) => (Number.isFinite(v.high) && v.high > 0 ? v.high : v.close));
  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const span = maxP - minP || Math.max(maxP * 0.01, 0.01);

  const maxVol = Math.max(...values.map((v) => v.volume || 0), 1);
  const isOverallUp = values[values.length - 1].close >= values[0].close;
  const mainColor = isOverallUp ? '#24cf8e' : '#ff6675';

  const priceToY = (p) => padTop + (1 - (p - minP) / span) * chartH;
  const idxToX = (i) => (values.length === 1 ? W / 2 : (i * (W - 12)) / (values.length - 1) + 6);

  const pts = values.map((v, i) => [idxToX(i), priceToY(v.close)]);
  const candleWidth = Math.max(2, Math.min(8, ((W - 16) / values.length) * 0.62));

  const volBars = values
    .map((v, i) => {
      if (!v.volume) return '';
      const vh = Math.max(1.2, (v.volume / maxVol) * (padBottom - 8));
      const x = pts[i][0] - candleWidth / 2;
      const y = H - vh;
      const up = v.close >= v.open;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${vh.toFixed(1)}" fill="${up ? '#24cf8e38' : '#ff667538'}" />`;
    })
    .join('');

  let mainSeriesMarkup = '';
  if (mode === 'candle') {
    mainSeriesMarkup = values
      .map((v, i) => {
        const cx = pts[i][0];
        const yHigh = priceToY(v.high);
        const yLow = priceToY(v.low);
        const yOpen = priceToY(v.open);
        const yClose = priceToY(v.close);
        const up = v.close >= v.open;
        const c = up ? '#24cf8e' : '#ff6675';
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
        return `
          <line x1="${cx.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yLow.toFixed(1)}" stroke="${c}" stroke-width="1.1" />
          <rect x="${(cx - candleWidth / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${c}" rx="0.6" />
        `;
      })
      .join('');
  } else {
    const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)} ${(padTop + chartH).toFixed(1)} L${pts[0][0].toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`;
    const lastPt = pts[pts.length - 1];
    mainSeriesMarkup = `
      <path class="chart-area" fill="url(#chart-fill)" d="${areaPath}" />
      <path class="chart-line" stroke="${mainColor}" d="${linePath}" />
      <circle cx="${lastPt[0].toFixed(1)}" cy="${lastPt[1].toFixed(1)}" r="3.4" fill="${mainColor}" />
    `;
  }

  const midP = (maxP + minP) / 2;

  svgEl.innerHTML = `
    <defs>
      <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${mainColor}" stop-opacity="0.30" />
        <stop offset="100%" stop-color="${mainColor}" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path class="chart-grid" d="M0 ${padTop}H${W} M0 ${(padTop + chartH / 2).toFixed(1)}H${W} M0 ${padTop + chartH}H${W}" />
    ${volBars}
    ${mainSeriesMarkup}
    <text x="${W - 4}" y="${padTop + 10}" text-anchor="end" fill="#8590a0" font-size="9.5" font-family="var(--mono)">${fmtPrice(maxP)}</text>
    <text x="${W - 4}" y="${(padTop + chartH / 2 - 3).toFixed(1)}" text-anchor="end" fill="#687383" font-size="9" font-family="var(--mono)">${fmtPrice(midP)}</text>
    <text x="${W - 4}" y="${padTop + chartH - 4}" text-anchor="end" fill="#8590a0" font-size="9.5" font-family="var(--mono)">${fmtPrice(minP)}</text>
    <line id="chart-crosshair" x1="0" y1="${padTop}" x2="0" y2="${H}" stroke="#9aa6b8" stroke-width="1" stroke-dasharray="2 3" opacity="0" />
    <circle id="chart-hover-dot" cx="0" cy="0" r="4" fill="${mainColor}" stroke="#0b0d12" stroke-width="1.5" opacity="0" />
  `;

  if (labelsEl) {
    const indices = [
      0,
      Math.floor(values.length * 0.25),
      Math.floor(values.length * 0.5),
      Math.floor(values.length * 0.75),
      values.length - 1
    ];
    labelsEl.innerHTML = indices.map((idx) => `<span>${esc(shortTimeLabel(values[idx]?.datetime, range) || '—')}</span>`).join('');
  }

  svgEl._chartData = { values, pts };

  if (!svgEl._chartBound) {
    svgEl._chartBound = true;
    const onPointer = (clientX) => {
      const data = svgEl._chartData;
      if (!data) return;
      const rect = svgEl.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const idx = Math.round(ratio * (data.values.length - 1));
      const bar = data.values[idx];
      const pt = data.pts[idx];
      const line = svgEl.querySelector('#chart-crosshair');
      const dot = svgEl.querySelector('#chart-hover-dot');
      if (line && dot && pt) {
        line.setAttribute('x1', pt[0].toFixed(1));
        line.setAttribute('x2', pt[0].toFixed(1));
        line.setAttribute('opacity', '0.75');
        dot.setAttribute('cx', pt[0].toFixed(1));
        dot.setAttribute('cy', pt[1].toFixed(1));
        dot.setAttribute('opacity', '1');
      }
      if (tooltipEl && bar) {
        tooltipEl.hidden = false;
        tooltipEl.innerHTML = `
          <span class="tt-time">${esc(bar.datetime || '—')}</span>
          <span class="tt-ohlc">开 <b>${fmtPrice(bar.open)}</b> 高 <b>${fmtPrice(bar.high)}</b> 低 <b>${fmtPrice(bar.low)}</b> 收 <b>${fmtPrice(bar.close)}</b></span>
          <span class="tt-vol">量 <b>${fmtVol(bar.volume)}</b></span>
        `;
      }
    };
    const onLeave = () => {
      const line = svgEl.querySelector('#chart-crosshair');
      const dot = svgEl.querySelector('#chart-hover-dot');
      if (line) line.setAttribute('opacity', '0');
      if (dot) dot.setAttribute('opacity', '0');
      if (tooltipEl) tooltipEl.hidden = true;
    };
    svgEl.addEventListener('mousemove', (e) => onPointer(e.clientX));
    svgEl.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches?.[0]) onPointer(e.touches[0].clientX);
      },
      { passive: true }
    );
    svgEl.addEventListener('mouseleave', onLeave);
    svgEl.addEventListener('touchend', onLeave);
  }
}

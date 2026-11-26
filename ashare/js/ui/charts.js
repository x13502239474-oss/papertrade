// 轻量化 SVG 行情图表（分时 / 五日 / 日周月 K 线 / 资产曲线），支持悬停与触摸十字准星。
import { fmtPrice, fmtAmount, fmtPct, fmtMoney, esc } from './format.js';

const UP = '#f04848';
const DOWN = '#14b87a';
const AVG = '#f5a623';
const LINE = '#4e9af1';

function ma(points, n) {
  return points.map((_, i) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += points[j].close;
    return s / n;
  });
}

/** 渲染分时 / 五日分时图 */
export function renderIntradayChart(container, { points, prevClose, is5Day = false }) {
  if (!points || !points.length) {
    container.innerHTML = `<div class="chart-empty">暂无分时数据</div>`;
    return;
  }
  const W = 560, H = 220, padL = 8, padR = 8, padT = 14, priceH = 142, volTop = 166, volH = 42;
  const base = prevClose > 0 ? prevClose : points[0].price;
  let maxDev = 0;
  let maxVol = 1;
  for (const p of points) {
    maxDev = Math.max(maxDev, Math.abs(p.price - base), p.avg ? Math.abs(p.avg - base) : 0);
    maxVol = Math.max(maxVol, p.volume || 0);
  }
  if (maxDev < base * 0.005) maxDev = base * 0.01;
  const minP = base - maxDev * 1.1;
  const maxP = base + maxDev * 1.1;
  const denom = Math.max(1, is5Day ? points.length - 1 : Math.max(240, points.length - 1));
  const xAt = (i) => padL + (i / denom) * (W - padL - padR);
  const yAt = (p) => padT + ((maxP - p) / (maxP - minP)) * priceH;
  const baseY = yAt(base);

  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.price).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xAt(points.length - 1).toFixed(1)},${(padT + priceH).toFixed(1)} L${xAt(0).toFixed(1)},${(padT + priceH).toFixed(1)} Z`;
  const hasAvg = !is5Day && points.some((p) => p.avg > 0);
  const avgPath = hasAvg ? points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.avg).toFixed(1)}`).join(' ') : '';

  const barW = Math.max(1, (W - padL - padR) / (denom + 1) * 0.72);
  const volBars = points.map((p, i) => {
    const h = Math.max(1, ((p.volume || 0) / maxVol) * volH);
    const prev = i > 0 ? points[i - 1].price : base;
    const col = p.price >= prev ? UP : DOWN;
    return `<rect x="${(xAt(i) - barW / 2).toFixed(1)}" y="${(volTop + volH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" opacity="0.65"/>`;
  }).join('');

  const last = points[points.length - 1];
  const pctMax = ((maxP - base) / base) * 100;

  container.innerHTML = `
    <div class="chart-hud" id="chart-hud">
      <span>${esc(last.time)}</span>
      <span>价 <b>${fmtPrice(last.price)}</b></span>
      ${hasAvg ? `<span class="hud-avg">均 ${fmtPrice(last.avg)}</span>` : ''}
      <span class="${last.price >= base ? 'up' : 'down'}">${fmtPct((last.price - base) / base, { ratio: true })}</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="分时走势图">
      <defs>
        <linearGradient id="intraGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${LINE}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${LINE}" stop-opacity="0.01"/>
        </linearGradient>
      </defs>
      <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" class="grid-line"/>
      <line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" class="ref-line"/>
      <line x1="${padL}" y1="${padT + priceH}" x2="${W - padR}" y2="${padT + priceH}" class="grid-line"/>
      <path d="${areaPath}" fill="url(#intraGrad)"/>
      <path d="${linePath}" fill="none" stroke="${LINE}" stroke-width="1.6"/>
      ${avgPath ? `<path d="${avgPath}" fill="none" stroke="${AVG}" stroke-width="1.2" opacity="0.9"/>` : ''}
      ${volBars}
      <text x="${padL + 2}" y="${padT + 10}" class="axis-lbl up">${fmtPrice(maxP)}</text>
      <text x="${W - padR - 2}" y="${padT + 10}" text-anchor="end" class="axis-lbl up">+${pctMax.toFixed(2)}%</text>
      <text x="${padL + 2}" y="${baseY - 3}" class="axis-lbl">${fmtPrice(base)}</text>
      <text x="${padL + 2}" y="${padT + priceH - 3}" class="axis-lbl down">${fmtPrice(minP)}</text>
      <text x="${W - padR - 2}" y="${padT + priceH - 3}" text-anchor="end" class="axis-lbl down">-${pctMax.toFixed(2)}%</text>
      <line id="xhair-v" x1="0" y1="${padT}" x2="0" y2="${volTop + volH}" class="xhair" hidden/>
      <circle id="xhair-dot" cx="0" cy="0" r="3.5" fill="${LINE}" hidden/>
    </svg>
    <div class="chart-xlabels">
      ${is5Day ? `<span>${esc(points[0].day || '')}</span><span>近 5 个交易日</span><span>${esc(last.day || '')}</span>` : '<span>09:30</span><span>10:30</span><span>11:30/13:00</span><span>14:00</span><span>15:00</span>'}
    </div>
  `;

  attachCrosshair(container, points, (pt, i) => ({
    x: xAt(i),
    y: yAt(pt.price),
    html: `<span>${esc(pt.time)}</span><span>价 <b>${fmtPrice(pt.price)}</b></span>${hasAvg ? `<span class="hud-avg">均 ${fmtPrice(pt.avg)}</span>` : ''}<span class="${pt.price >= base ? 'up' : 'down'}">${fmtPct((pt.price - base) / base, { ratio: true })}</span>`,
  }));
}

/** 渲染日/周/月 K 线图（含 MA5/MA10/MA20 与成交量） */
export function renderKlineChart(container, { points }) {
  if (!points || !points.length) {
    container.innerHTML = `<div class="chart-empty">暂无 K 线数据</div>`;
    return;
  }
  const view = points.slice(-72);
  const W = 560, H = 220, padL = 8, padR = 8, padT = 14, priceH = 142, volTop = 166, volH = 42;
  const ma5 = ma(view, 5), ma10 = ma(view, 10), ma20 = ma(view, 20);
  let minP = Infinity, maxP = -Infinity, maxVol = 1;
  for (let i = 0; i < view.length; i++) {
    const p = view[i];
    minP = Math.min(minP, p.low, ma5[i] ?? Infinity, ma10[i] ?? Infinity, ma20[i] ?? Infinity);
    maxP = Math.max(maxP, p.high, ma5[i] ?? -Infinity, ma10[i] ?? -Infinity, ma20[i] ?? -Infinity);
    maxVol = Math.max(maxVol, p.volume || 0);
  }
  const span = Math.max(0.01, maxP - minP);
  minP -= span * 0.06;
  maxP += span * 0.06;

  const step = (W - padL - padR) / Math.max(1, view.length);
  const xAt = (i) => padL + (i + 0.5) * step;
  const yAt = (p) => padT + ((maxP - p) / (maxP - minP)) * priceH;
  const cw = Math.max(2, Math.min(8, step * 0.66));

  const candles = view.map((p, i) => {
    const x = xAt(i);
    const up = p.close >= p.open;
    const col = up ? UP : DOWN;
    const yH = yAt(p.high), yL = yAt(p.low);
    const yTop = yAt(Math.max(p.open, p.close));
    const yBot = yAt(Math.min(p.open, p.close));
    const bodyH = Math.max(1.2, yBot - yTop);
    const vh = Math.max(1, ((p.volume || 0) / maxVol) * volH);
    return `
      <line x1="${x.toFixed(1)}" y1="${yH.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${col}" stroke-width="1"/>
      <rect x="${(x - cw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${cw.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${col}"/>
      <rect x="${(x - cw / 2).toFixed(1)}" y="${(volTop + volH - vh).toFixed(1)}" width="${cw.toFixed(1)}" height="${vh.toFixed(1)}" fill="${col}" opacity="0.6"/>
    `;
  }).join('');

  const maLine = (arr, color) => {
    const d = arr.map((v, i) => (v == null ? null : `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)).filter(Boolean);
    if (d.length < 2) return '';
    return `<path d="M${d.join(' L')}" fill="none" stroke="${color}" stroke-width="1.15" opacity="0.9"/>`;
  };

  const last = view[view.length - 1];
  const prevC = view.length > 1 ? view[view.length - 2].close : last.open;
  const lastPct = prevC > 0 ? (last.close - prevC) / prevC : 0;

  container.innerHTML = `
    <div class="chart-hud" id="chart-hud">
      <span>${esc(last.date)}</span>
      <span>开 ${fmtPrice(last.open)}</span>
      <span>高 ${fmtPrice(last.high)}</span>
      <span>低 ${fmtPrice(last.low)}</span>
      <span class="${last.close >= last.open ? 'up' : 'down'}">收 <b>${fmtPrice(last.close)}</b> (${fmtPct(lastPct, { ratio: true })})</span>
    </div>
    <div class="ma-legend">
      <span style="color:#f5a623">MA5 ${ma5.at(-1) ? fmtPrice(ma5.at(-1)) : '—'}</span>
      <span style="color:#4e9af1">MA10 ${ma10.at(-1) ? fmtPrice(ma10.at(-1)) : '—'}</span>
      <span style="color:#c084fc">MA20 ${ma20.at(-1) ? fmtPrice(ma20.at(-1)) : '—'}</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="K 线图">
      <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" class="grid-line"/>
      <line x1="${padL}" y1="${(padT + priceH / 2).toFixed(1)}" x2="${W - padR}" y2="${(padT + priceH / 2).toFixed(1)}" class="grid-line"/>
      <line x1="${padL}" y1="${padT + priceH}" x2="${W - padR}" y2="${padT + priceH}" class="grid-line"/>
      ${candles}
      ${maLine(ma5, '#f5a623')}
      ${maLine(ma10, '#4e9af1')}
      ${maLine(ma20, '#c084fc')}
      <text x="${padL + 2}" y="${padT + 10}" class="axis-lbl">${fmtPrice(maxP)}</text>
      <text x="${padL + 2}" y="${padT + priceH - 3}" class="axis-lbl">${fmtPrice(minP)}</text>
      <line id="xhair-v" x1="0" y1="${padT}" x2="0" y2="${volTop + volH}" class="xhair" hidden/>
      <circle id="xhair-dot" cx="0" cy="0" r="3" fill="${LINE}" hidden/>
    </svg>
    <div class="chart-xlabels">
      <span>${esc(view[0].date)}</span>
      <span>${esc(view[Math.floor(view.length / 2)].date)}</span>
      <span>${esc(last.date)}</span>
    </div>
  `;

  attachCrosshair(container, view, (pt, i) => {
    const pClose = i > 0 ? view[i - 1].close : pt.open;
    const chg = pClose > 0 ? (pt.close - pClose) / pClose : 0;
    return {
      x: xAt(i),
      y: yAt(pt.close),
      html: `<span>${esc(pt.date)}</span><span>开 ${fmtPrice(pt.open)}</span><span>高 ${fmtPrice(pt.high)}</span><span>低 ${fmtPrice(pt.low)}</span><span class="${pt.close >= pt.open ? 'up' : 'down'}">收 <b>${fmtPrice(pt.close)}</b> (${fmtPct(chg, { ratio: true })})</span>`,
    };
  });
}

function attachCrosshair(container, points, build) {
  const svg = container.querySelector('.chart-svg');
  const hud = container.querySelector('#chart-hud');
  const vline = container.querySelector('#xhair-v');
  const dot = container.querySelector('#xhair-dot');
  if (!svg || !hud || !vline || !dot || !points.length) return;
  const defaultHtml = hud.innerHTML;

  const update = (clientX) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.min(points.length - 1, Math.round(ratio * (points.length - 1)));
    const info = build(points[idx], idx);
    vline.setAttribute('x1', info.x.toFixed(1));
    vline.setAttribute('x2', info.x.toFixed(1));
    vline.hidden = false;
    dot.setAttribute('cx', info.x.toFixed(1));
    dot.setAttribute('cy', info.y.toFixed(1));
    dot.hidden = false;
    hud.innerHTML = info.html;
  };
  const reset = () => { vline.hidden = true; dot.hidden = true; hud.innerHTML = defaultHtml; };

  svg.addEventListener('pointermove', (e) => update(e.clientX));
  svg.addEventListener('pointerleave', reset);
}

/** 渲染资产曲线 */
export function renderEquityChart(container, points, initialCash) {
  if (!points || points.length < 2) {
    container.innerHTML = `<div class="chart-empty">至少需要 2 个交易日的资产快照才能绘制资产曲线（当前 ${points?.length || 0} 个点）</div>`;
    return;
  }
  const W = 560, H = 136, pad = 10;
  let minV = initialCash, maxV = initialCash;
  for (const p of points) { minV = Math.min(minV, p.total); maxV = Math.max(maxV, p.total); }
  const span = Math.max(initialCash * 0.01, maxV - minV);
  minV -= span * 0.12; maxV += span * 0.12;
  const xAt = (i) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const yAt = (v) => pad + ((maxV - v) / (maxV - minV)) * (H - pad * 2);
  const last = points[points.length - 1];
  const col = last.total >= initialCash ? UP : DOWN;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.total).toFixed(1)}`).join(' ');
  const area = `${d} L${xAt(points.length - 1).toFixed(1)},${H - pad} L${pad},${H - pad} Z`;

  container.innerHTML = `
    <svg class="chart-svg eq-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="账户资产曲线">
      <line x1="${pad}" y1="${yAt(initialCash).toFixed(1)}" x2="${W - pad}" y2="${yAt(initialCash).toFixed(1)}" class="ref-line"/>
      <path d="${area}" fill="${col}" opacity="0.14"/>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="1.8"/>
      <text x="${pad + 2}" y="${pad + 10}" class="axis-lbl">${fmtMoney(maxV, 0)}</text>
      <text x="${pad + 2}" y="${H - pad - 2}" class="axis-lbl">${fmtMoney(minV, 0)}</text>
    </svg>
    <div class="chart-xlabels"><span>${esc(points[0].date)}</span><span>基准 ${fmtMoney(initialCash, 0)}</span><span>${esc(last.date)} · ${fmtAmount(last.total)}</span></div>
  `;
}

// 格式化与安全转义工具
import { boardInfo, EXCHANGES } from '../core/rules.js';
import { shTime, shDateTime } from '../core/time.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function fmtPrice(v, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toFixed(digits);
}

export function fmtMoney(v, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return '¥' + Number(v).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtSignedMoney(v, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtPct(v, { ratio = false, signed = true } = {}) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = ratio ? Number(v) * 100 : Number(v);
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtSigned(v, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
}

export function fmtAmount(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const a = Math.abs(Number(v));
  if (a >= 1e8) return (Number(v) / 1e8).toFixed(2) + '亿';
  if (a >= 1e4) return (Number(v) / 1e4).toFixed(1) + '万';
  return Number(v).toFixed(0);
}

export function fmtShares(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const a = Math.abs(Number(v));
  if (a >= 1e8) return (Number(v) / 1e8).toFixed(2) + '亿股';
  if (a >= 1e4) return (Number(v) / 1e4).toFixed(1) + '万股';
  return Math.round(Number(v)).toLocaleString('zh-CN') + '股';
}

export function dirClass(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return 'flat';
  return n > 0 ? 'up' : 'down';
}

export function boardBadge(symbol) {
  const b = boardInfo(symbol);
  const ex = EXCHANGES[String(symbol || '').slice(0, 2).toUpperCase()];
  if (!b) return ex ? ex.short : '';
  if (b.id === 'main') return `${ex?.short || ''}主板`;
  return b.label;
}

export function fmtClock(ms) {
  return ms ? shTime(ms) : '—';
}

export function fmtStamp(ms) {
  return ms ? shDateTime(ms) : '—';
}

// 本地存储、旧版数据迁移与备份导入/导出。
// 数据仅保存在当前浏览器的 localStorage，不同设备或无痕模式之间不共享。
import {
  SCHEMA_VERSION, DEFAULT_INITIAL_CASH, DEFAULT_SETTINGS, createAccount, uid,
} from './account.js';
import { parseSymbol, round2 } from './rules.js';
import { normalizeFees } from './fees.js';
import { shDate } from './time.js';

export const STORAGE_KEY = 'papertrade-ashare-v2';
export const LEGACY_KEY = 'papertrade-ashare-state';

/**
 * 将旧版（v1，papertrade-ashare-state）迁移至 v2 结构。
 * 旧版结构：{ cash, positions:{ '600519':{ qty, available, today, avgCost } }, watchlist:['600519'], trades:[{symbol,qty,side,price,time}], day:'YYYY-MM-DD' }
 */
export function migrateV1(v1, now = Date.now()) {
  if (!v1 || typeof v1 !== 'object' || typeof v1.cash !== 'number') return null;
  const acc = createAccount({ initialCash: DEFAULT_INITIAL_CASH, now });
  acc.cash = round2(Math.max(0, v1.cash));
  acc.meta = { migratedFrom: 'v1', migratedAt: now };

  const tradeDate = typeof v1.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v1.day) ? v1.day : shDate(now);
  for (const [rawSym, p] of Object.entries(v1.positions || {})) {
    const parsed = parseSymbol(rawSym);
    if (!parsed || !p || !(p.qty > 0)) continue;
    const qty = Math.round(p.qty);
    const avgCost = Number(p.avgCost) > 0 ? Number(p.avgCost) : 0;
    const todayLocked = Math.max(0, Math.min(qty, Math.round(p.today || 0)));
    acc.positions[parsed.symbol] = {
      symbol: parsed.symbol,
      code: parsed.code,
      exchange: parsed.exchange,
      name: parsed.code,
      qty,
      frozenQty: 0,
      avgCost,
      costTotal: round2(avgCost * qty),
      realizedPnl: 0,
      lots: todayLocked > 0 ? [{ date: tradeDate, qty: todayLocked }] : [],
      openedAt: now,
    };
  }

  if (Array.isArray(v1.watchlist)) {
    const seen = new Set();
    for (const rawSym of v1.watchlist) {
      const parsed = parseSymbol(rawSym);
      if (!parsed || seen.has(parsed.symbol)) continue;
      seen.add(parsed.symbol);
      acc.watch.groups[0].items.push({ symbol: parsed.symbol, name: parsed.code, addedAt: now });
    }
  }

  if (Array.isArray(v1.trades)) {
    for (const t of v1.trades) {
      const parsed = parseSymbol(t?.symbol);
      if (!parsed || !(t.qty > 0) || !(t.price > 0)) continue;
      const side = t.side === 'sell' ? 'sell' : 'buy';
      const time = Number(t.time) || now;
      const amount = round2(t.price * t.qty);
      acc.fills.push({
        id: uid('f'),
        orderId: 'migrated_v1',
        symbol: parsed.symbol,
        code: parsed.code,
        exchange: parsed.exchange,
        name: parsed.code,
        side,
        type: 'market',
        price: Number(t.price),
        qty: Math.round(t.qty),
        amount,
        fees: { commission: 0, stampDuty: 0, transferFee: 0, total: 0 },
        feeBasis: ['由旧版模拟记录迁移，原版本未计交易费用'],
        time,
        tradeDate: shDate(time),
        quoteTime: time,
        quotePrice: Number(t.price),
        prevClose: null,
        priceBasis: '旧版迁移',
        source: '旧版演示行情',
        demo: true,
        practice: true,
        realizedPnl: null,
        costBasis: null,
      });
    }
  }

  return acc;
}

/** 校验并规范化 v2 账户对象；非法时返回 { ok:false, error } */
export function validateAccount(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '备份文件内容无效（非 JSON 对象）' };
  if (raw.version !== SCHEMA_VERSION) {
    if (typeof raw.cash === 'number' && !('version' in raw)) {
      const migrated = migrateV1(raw);
      if (migrated) return { ok: true, state: migrated, migratedFrom: 'v1' };
    }
    return { ok: false, error: `不支持的备份版本：${raw.version ?? '未知'}（当前支持 v${SCHEMA_VERSION}）` };
  }
  if (!Number.isFinite(raw.cash) || raw.cash < 0) return { ok: false, error: '账户可用资金字段无效' };
  if (!Number.isFinite(raw.initialCash) || raw.initialCash <= 0) return { ok: false, error: '初始资金字段无效' };
  if (typeof raw.positions !== 'object' || raw.positions === null || Array.isArray(raw.positions)) {
    return { ok: false, error: '持仓数据结构无效' };
  }
  if (!Array.isArray(raw.orders) || !Array.isArray(raw.fills)) {
    return { ok: false, error: '委托或成交记录结构无效' };
  }

  const base = createAccount({ initialCash: raw.initialCash, now: Number(raw.createdAt) || Date.now() });
  const state = {
    ...base,
    cash: round2(raw.cash),
    frozenCash: round2(Math.max(0, Number(raw.frozenCash) || 0)),
    realizedPnl: round2(Number(raw.realizedPnl) || 0),
    positions: {},
    orders: raw.orders.slice(0, 2000),
    fills: raw.fills.slice(0, 5000),
    equity: Array.isArray(raw.equity) ? raw.equity.slice(-1500) : [],
    meta: { ...(raw.meta || {}) },
  };

  for (const [sym, p] of Object.entries(raw.positions)) {
    const parsed = parseSymbol(sym);
    if (!parsed || !p || !(p.qty > 0)) continue;
    state.positions[parsed.symbol] = {
      symbol: parsed.symbol,
      code: parsed.code,
      exchange: parsed.exchange,
      name: String(p.name || parsed.code),
      qty: Math.round(p.qty),
      frozenQty: Math.max(0, Math.round(p.frozenQty || 0)),
      avgCost: Number(p.avgCost) || 0,
      costTotal: round2(Number(p.costTotal) || (Number(p.avgCost) || 0) * Math.round(p.qty)),
      realizedPnl: round2(Number(p.realizedPnl) || 0),
      lots: Array.isArray(p.lots)
        ? p.lots.filter((l) => l && typeof l.date === 'string' && l.qty > 0).map((l) => ({ date: l.date, qty: Math.round(l.qty) }))
        : [],
      openedAt: Number(p.openedAt) || base.createdAt,
    };
  }

  if (raw.watch && Array.isArray(raw.watch.groups) && raw.watch.groups.length > 0) {
    const groups = raw.watch.groups
      .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
      .map((g) => ({
        id: g.id,
        name: g.name.slice(0, 12),
        items: Array.isArray(g.items)
          ? g.items.filter((i) => i && parseSymbol(i.symbol)).map((i) => ({
            symbol: parseSymbol(i.symbol).symbol,
            name: String(i.name || i.symbol),
            addedAt: Number(i.addedAt) || base.createdAt,
          }))
          : [],
      }));
    if (!groups.some((g) => g.id === 'default')) groups.unshift({ id: 'default', name: '默认自选', items: [] });
    state.watch = {
      activeGroupId: groups.some((g) => g.id === raw.watch.activeGroupId) ? raw.watch.activeGroupId : 'default',
      groups,
    };
  }

  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(raw.settings || {}),
    fees: normalizeFees(raw.settings?.fees),
  };

  return { ok: true, state };
}

export function loadAccount(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const v = validateAccount(parsed);
      if (v.ok) return { state: v.state, migrated: false };
    }
    const legacyRaw = storage?.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const migrated = migrateV1(legacy, now);
      if (migrated) {
        saveAccount(migrated, storage);
        return { state: migrated, migrated: true };
      }
    }
  } catch {
    // 存储损坏或无权限时退回全新账户
  }
  return { state: createAccount({ now }), migrated: false };
}

export function saveAccount(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportBackup(state, now = Date.now()) {
  return JSON.stringify({
    app: 'PaperTrade-AShare',
    exportedAt: now,
    schemaVersion: SCHEMA_VERSION,
    account: state,
  }, null, 2);
}

export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: '无法解析 JSON 文件，请检查备份文件格式' };
  }
  const payload = obj && typeof obj === 'object' && obj.account ? obj.account : obj;
  return validateAccount(payload);
}

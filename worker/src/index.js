/**
 * PaperTrade A-Share 行情代理（Cloudflare Worker）
 *
 * 设计目的：
 *   1. GitHub Pages 只能托管静态文件，无法安全存放 Tushare Pro / iTick 等商业或个人 API Key。
 *   2. 本 Worker 在服务端通过环境变量（Secrets）持有密钥，向前端暴露统一的只读 JSON 接口。
 *   3. 支持三种上游模式（通过环境变量 UPSTREAM 配置）：
 *        - public  （默认）：转发腾讯财经 + 新浪财经公开接口，并做边缘缓存与 CORS 封装。
 *        - tushare ：使用 TUSHARE_TOKEN 调用 Tushare Pro `rt_k`（需已开通实时日线权限）。
 *        - itick   ：使用 ITICK_TOKEN 调用 iTick REST `/stock/quote` 与 `/stock/kline`。
 *
 * 绝不向前端返回任何密钥，也不接受前端 URL 传入密钥。
 */

const INDICES = ['sh000001', 'sz399001', 'sz399006', 'sh000688', 'bj899050'];
const NODE_MAP = { all: 'hs_a', sh_main: 'sh_a', sz_main: 'sz_a', chinext: 'cyb', star: 'kcb', bse: 'hs_bjs' };
const SORT_MAP = { changePct: 'changepercent', amount: 'amount', turnoverRate: 'turnoverratio', price: 'trade' };

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allow = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  let acao = '*';
  if (!allow.includes('*')) {
    acao = allow.includes(origin) ? origin : allow[0] || '';
  }
  return {
    'Access-Control-Allow-Origin': acao,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Vary': 'Origin',
  };
}

function jsonResp(data, request, env, { status = 200, cacheSec = 0 } = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheSec > 0 ? `public, max-age=${cacheSec}` : 'no-store',
    ...corsHeaders(request, env),
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseTencent(text, source = '代理(腾讯财经)') {
  const quotes = {};
  const re = /v_([a-z]{2}\d{6})="([^"]*)"/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const symbol = m[1].toLowerCase();
    const f = m[2].split('~');
    if (f.length < 45) continue;
    const exchange = symbol.slice(0, 2).toUpperCase();
    const code = f[2] || symbol.slice(2);
    const price = num(f[3]);
    const prevClose = num(f[4]);
    const rawVol = num(f[6]);
    const triple = (f[35] || '').split('/');
    const amount = num(triple[2]) ?? (num(f[37]) != null ? num(f[37]) * 10000 : null);
    const isStar = exchange === 'SH' && /^68[89]/.test(code);
    const isIndex = (f[61] || '').trim() === 'ZS' || (exchange === 'SH' && code.startsWith('000')) || (exchange === 'SZ' && code.startsWith('399')) || (exchange === 'BJ' && code.startsWith('899'));
    const volume = rawVol == null ? null : isIndex || isStar ? rawVol : rawVol * 100;
    const bids = [];
    const asks = [];
    if (!isIndex) {
      for (let i = 0; i < 5; i++) {
        const bp = num(f[9 + i * 2]); const bv = num(f[10 + i * 2]);
        if (bp > 0) bids.push({ price: bp, vol: bv || 0 });
        const ap = num(f[19 + i * 2]); const av = num(f[20 + i * 2]);
        if (ap > 0) asks.push({ price: ap, vol: av || 0 });
      }
    }
    const stamp = f[30] || '';
    const dataDate = /^\d{8}/.test(stamp) ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}` : null;
    quotes[symbol] = {
      symbol, code, exchange, name: (f[1] || '').trim(), isIndex,
      price: price ?? prevClose, prevClose, open: num(f[5]), high: num(f[33]), low: num(f[34]),
      change: num(f[31]), changePct: num(f[32]), volume, amount,
      turnoverRate: num(f[38]), pe: num(f[39]), pb: num(f[46]), amplitude: num(f[43]),
      limitUp: num(f[47]) > 0 ? num(f[47]) : null,
      limitDown: num(f[48]) > 0 ? num(f[48]) : null,
      bids, asks, noTrade: !isIndex && (!(price > 0) || (num(f[5]) === 0 && rawVol === 0)),
      time: Date.now(), dataDate, source, delayText: '经代理缓存（延迟数秒）', demo: false,
    };
  }
  return quotes;
}

async function fetchPublicQuotes(symbols) {
  const res = await fetch(`https://qt.gtimg.cn/q=${symbols.join(',')}`);
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  const text = new TextDecoder('gbk').decode(await res.arrayBuffer());
  return parseTencent(text);
}

async function fetchTushareQuotes(symbols, token) {
  const tsCodes = symbols.map((s) => `${s.slice(2)}.${s.slice(0, 2).toUpperCase()}`).join(',');
  const res = await fetch('https://api.tushare.pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_name: 'rt_k',
      token,
      params: { ts_code: tsCodes },
      fields: 'ts_code,name,pre_close,open,high,low,close,vol,amount,bid_price1,bid_volume1,ask_price1,ask_volume1,trade_time',
    }),
  });
  if (!res.ok) throw new Error(`Tushare HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(`Tushare error ${body.code}: ${body.msg}`);
  const idx = Object.fromEntries((body.data?.fields || []).map((f, i) => [f, i]));
  const quotes = {};
  for (const row of body.data?.items || []) {
    const [code, ex] = String(row[idx.ts_code]).split('.');
    const symbol = `${ex.toLowerCase()}${code}`;
    const price = num(row[idx.close]);
    const prevClose = num(row[idx.pre_close]);
    quotes[symbol] = {
      symbol, code, exchange: ex, name: row[idx.name], isIndex: false,
      price, prevClose, open: num(row[idx.open]), high: num(row[idx.high]), low: num(row[idx.low]),
      change: price != null && prevClose != null ? +(price - prevClose).toFixed(2) : null,
      changePct: price != null && prevClose > 0 ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : null,
      volume: num(row[idx.vol]), amount: num(row[idx.amount]),
      bids: num(row[idx.bid_price1]) > 0 ? [{ price: num(row[idx.bid_price1]), vol: Math.round((num(row[idx.bid_volume1]) || 0) / 100) }] : [],
      asks: num(row[idx.ask_price1]) > 0 ? [{ price: num(row[idx.ask_price1]), vol: Math.round((num(row[idx.ask_volume1]) || 0) / 100) }] : [],
      time: Date.now(), source: 'Tushare Pro (代理)', delayText: 'Tushare rt_k 实时日线', demo: false,
    };
  }
  return quotes;
}

async function fetchItickQuote(symbol, token) {
  const region = symbol.slice(0, 2).toUpperCase();
  const code = symbol.slice(2);
  const res = await fetch(`https://api.itick.org/stock/quote?region=${region}&code=${code}`, {
    headers: { accept: 'application/json', token },
  });
  if (res.status === 429) throw Object.assign(new Error('iTick 频率受限'), { status: 429 });
  if (!res.ok) throw new Error(`iTick HTTP ${res.status}`);
  const body = await res.json();
  const d = body.data;
  if (!d) return null;
  const price = num(d.ld);
  const prevClose = num(d.p);
  return {
    symbol, code, exchange: region, name: d.s || code, isIndex: false,
    price, prevClose, open: num(d.o), high: num(d.h), low: num(d.l),
    change: num(d.ch), changePct: num(d.chp),
    volume: num(d.v), amount: num(d.tu),
    bids: [], asks: [],
    time: d.t || Date.now(), source: 'iTick (代理)', delayText: 'iTick 个人 API', demo: false,
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method !== 'GET') {
      return jsonResp({ error: 'Method Not Allowed' }, request, env, { status: 405 });
    }

    const url = new URL(request.url);
    const upstream = (env.UPSTREAM || 'public').toLowerCase();
    const cacheSec = Number(env.CACHE_TTL_SEC || 5);

    try {
      if (url.pathname === '/api/health') {
        return jsonResp({
          ok: true,
          upstream,
          hasTushareToken: Boolean(env.TUSHARE_TOKEN),
          hasItickToken: Boolean(env.ITICK_TOKEN),
          time: Date.now(),
        }, request, env);
      }

      // 边缘缓存命中检查
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const resp = new Response(cached.body, cached);
        for (const [k, v] of Object.entries(corsHeaders(request, env))) resp.headers.set(k, v);
        return resp;
      }

      let payload;
      let ttl = cacheSec;

      if (url.pathname === '/api/indices') {
        const quotes = await fetchPublicQuotes(INDICES);
        payload = {
          items: INDICES.map((s) => quotes[s]).filter(Boolean),
          time: Date.now(),
          source: '代理(腾讯财经)',
          delayText: `边缘缓存 ${ttl}s`,
          demo: false,
        };
      } else if (url.pathname === '/api/quotes') {
        const syms = (url.searchParams.get('symbols') || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^(sh|sz|bj)\d{6}$/.test(s)).slice(0, 60);
        if (!syms.length) return jsonResp({ quotes: {}, time: Date.now() }, request, env);
        let quotes;
        if (upstream === 'tushare' && env.TUSHARE_TOKEN) {
          quotes = await fetchTushareQuotes(syms, env.TUSHARE_TOKEN);
        } else if (upstream === 'itick' && env.ITICK_TOKEN) {
          quotes = {};
          for (const s of syms.slice(0, 5)) {
            const q = await fetchItickQuote(s, env.ITICK_TOKEN);
            if (q) quotes[s] = q;
          }
        } else {
          quotes = await fetchPublicQuotes(syms);
        }
        payload = { quotes, time: Date.now(), source: `代理(${upstream})`, delayText: `边缘缓存 ${ttl}s`, demo: false };
      } else if (url.pathname === '/api/list') {
        const board = url.searchParams.get('board') || 'all';
        const sort = SORT_MAP[url.searchParams.get('sort') || 'amount'] || 'amount';
        const asc = url.searchParams.get('asc') === '1' ? 1 : 0;
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const pageSize = Math.min(80, Math.max(10, Number(url.searchParams.get('pageSize') || 40)));
        const node = NODE_MAP[board] || 'hs_a';
        const base = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center';
        const res = await fetch(`${base}.getHQNodeData?page=${page}&num=${pageSize}&sort=${sort}&asc=${asc}&node=${node}`);
        if (!res.ok) throw new Error(`Sina HTTP ${res.status}`);
        const rows = await res.json();
        const items = (Array.isArray(rows) ? rows : []).map((r) => ({
          symbol: String(r.symbol || '').toLowerCase(),
          code: String(r.code || ''),
          exchange: String(r.symbol || '').slice(0, 2).toUpperCase(),
          name: r.name,
          price: num(r.trade), prevClose: num(r.settlement), open: num(r.open), high: num(r.high), low: num(r.low),
          change: num(r.pricechange), changePct: num(r.changepercent),
          volume: num(r.volume), amount: num(r.amount), turnoverRate: num(r.turnoverratio),
          pe: num(r.per), pb: num(r.pb),
          time: Date.now(), source: '代理(新浪财经)', delayText: `边缘缓存 ${ttl}s`, demo: false,
        }));
        payload = { items, total: items.length, time: Date.now(), source: '代理(新浪财经)', delayText: `边缘缓存 ${ttl}s`, demo: false };
      } else if (url.pathname === '/api/chart') {
        const symbol = (url.searchParams.get('symbol') || '').toLowerCase();
        const tf = url.searchParams.get('timeframe') || 'D';
        if (!/^(sh|sz|bj)\d{6}$/.test(symbol)) return jsonResp({ supported: false, reason: '无效股票代码', points: [] }, request, env);
        ttl = tf === '1D' ? 15 : 60;
        if (tf === '1D') {
          const r = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${symbol}`);
          const j = await r.json();
          const rows = j?.data?.[symbol]?.data?.data || [];
          const qt = j?.data?.[symbol]?.qt?.[symbol];
          payload = {
            supported: true,
            prevClose: Array.isArray(qt) ? num(qt[4]) : null,
            points: rows.map((row) => {
              const p = row.split(/\s+/);
              return { time: `${p[0].slice(0, 2)}:${p[0].slice(2, 4)}`, price: Number(p[1]), avg: Number(p[1]), volume: Number(p[2]) || 0 };
            }),
            source: '代理(腾讯分时)',
          };
        } else if (['D', 'W', 'M'].includes(tf)) {
          const period = { D: 'day', W: 'week', M: 'month' }[tf];
          const r = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},${period},,,120,qfq`);
          const j = await r.json();
          const rec = j?.data?.[symbol] || {};
          const rows = rec[`qfq${period}`] || rec[period] || [];
          payload = {
            supported: true,
            points: rows.map((x) => ({ date: x[0], open: +x[1], close: +x[2], high: +x[3], low: +x[4], volume: +x[5] || 0 })),
            source: '代理(腾讯K线)',
          };
        } else {
          payload = { supported: false, reason: `代理暂不支持 ${tf} 周期`, points: [] };
        }
      } else if (url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return jsonResp({ items: [] }, request, env);
        const r = await fetch(`https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(q)}&t=gp`);
        const txt = await r.text();
        const m = txt.match(/v_hint="([^"]*)"/);
        const items = m && m[1] !== 'N'
          ? m[1].split('^').map((row) => row.split('~')).filter((p) => ['sh', 'sz', 'bj'].includes(p[0]) && /^\d{6}$/.test(p[1]))
            .map((p) => ({ symbol: `${p[0]}${p[1]}`, code: p[1], exchange: p[0].toUpperCase(), name: decodeURIComponent(JSON.parse(`"${p[2]}"`)), py: p[3] || '' }))
          : [];
        payload = { items };
        ttl = 60;
      } else {
        return jsonResp({ error: 'Not Found' }, request, env, { status: 404 });
      }

      const resp = jsonResp(payload, request, env, { cacheSec: ttl });
      ctx.waitUntil(cache.put(cacheKey, resp.clone()));
      return resp;
    } catch (err) {
      const status = err?.status || 502;
      return jsonResp({ error: err?.message || 'Upstream error' }, request, env, { status });
    }
  },
};

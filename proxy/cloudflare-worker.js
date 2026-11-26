/**
 * PaperTrade 美股行情安全服务端代理 (Cloudflare Worker)
 *
 * 作用：
 * 1. 将上游行情 API Key 保存在服务端加密环境变量 (TWELVE_DATA_API_KEY)，避免暴露在 GitHub Pages 静态前端代码或请求 URL 中。
 * 2. 严格限制允许访问的 CORS 来源 (ALLOWED_ORIGIN) 与允许转发的只读接口白名单。
 * 3. 利用边缘缓存 (Cache API) 缓存短期报价与历史 K 线，保护上游请求配额。
 *
 * 合规注意：
 * 在将代理服务对公开访客开放前，请务必确认你所持有的 Twelve Data 数据套餐具备公开网页展示（Public Display / Business）授权。
 */

const ALLOWED_PATHS = new Set(['/quote', '/time_series', '/symbol_search', '/market_state']);

function corsHeaders(origin, allowedOrigin) {
  const allow = !allowedOrigin || allowedOrigin === '*' ? '*' : origin === allowedOrigin ? origin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://x13502239474-oss.github.io';
    const headers = corsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'GET') {
      return Response.json({ status: 'error', code: 405, message: 'Method Not Allowed' }, { status: 405, headers });
    }

    if (allowedOrigin !== '*' && origin && origin !== allowedOrigin) {
      return Response.json({ status: 'error', code: 403, message: 'Origin not allowed by proxy' }, { status: 403, headers });
    }

    if (!env.TWELVE_DATA_API_KEY) {
      return Response.json(
        { status: 'error', code: 500, message: 'Proxy missing TWELVE_DATA_API_KEY secret' },
        { status: 500, headers }
      );
    }

    const reqUrl = new URL(request.url);
    if (!ALLOWED_PATHS.has(reqUrl.pathname)) {
      return Response.json({ status: 'error', code: 404, message: 'Unsupported endpoint' }, { status: 404, headers });
    }

    // 剔除任何外部传入的 apikey 参数，确保仅使用服务端环境变量密钥
    reqUrl.searchParams.delete('apikey');

    const cacheTtl = reqUrl.pathname === '/quote' ? 30 : reqUrl.pathname === '/time_series' ? 180 : 600;
    const cacheKey = new Request(`https://papertrade-proxy.internal${reqUrl.pathname}?${reqUrl.searchParams.toString()}`, {
      method: 'GET'
    });
    const cache = caches.default;

    const cached = await cache.match(cacheKey);
    if (cached) {
      const respHeaders = new Headers(cached.headers);
      Object.entries(headers).forEach(([k, v]) => respHeaders.set(k, v));
      respHeaders.set('X-Proxy-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: respHeaders });
    }

    const upstreamUrl = `https://api.twelvedata.com${reqUrl.pathname}?${reqUrl.searchParams.toString()}`;
    const upstreamResp = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `apikey ${env.TWELVE_DATA_API_KEY}`
      }
    });

    const bodyText = await upstreamResp.text();
    const outHeaders = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheTtl}`,
      'X-Proxy-Cache': 'MISS',
      ...headers
    });

    const response = new Response(bodyText, { status: upstreamResp.status, headers: outHeaders });
    if (upstreamResp.ok && !bodyText.includes('"status":"error"')) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  }
};

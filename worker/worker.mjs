/**
 * CORS-прокси для API, которое не разрешает браузерные запросы.
 *
 * Схема:
 *   PWA -> Worker -> https://api.aijuju.rest/v1/...
 *
 * В Worker лежит настоящий ключ провайдера (секрет UPSTREAM_KEY).
 * PWA получает отдельный токен PROXY_TOKEN. В настройках приложения
 * указывается URL Worker и этот токен, а не ключ провайдера.
 */

const UPSTREAM = 'https://api.aijuju.rest';

const ALLOWED_ORIGINS = new Set([
  'https://bodyamafanya.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://bodyamafanya.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

function authorized(request, env) {
  if (!env.PROXY_TOKEN) return false;
  return bearerToken(request) === env.PROXY_TOKEN;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/')) {
      return json({ error: 'Not found' }, 404, cors);
    }

    if (!env.UPSTREAM_KEY) {
      return json({ error: 'Не задан секрет UPSTREAM_KEY.' }, 500, cors);
    }

    if (!authorized(request, env)) {
      const token = bearerToken(request);
      let message = 'Неверный токен прокси.';
      if (!env.PROXY_TOKEN) {
        message = 'Не задан секрет PROXY_TOKEN в Cloudflare.';
      } else if (!token) {
        message = 'Токен прокси не задан. Вставьте его в поле «Ключ API».';
      } else if (token.toLowerCase().startsWith('rs_client_')) {
        message =
          'Похоже, это ключ AI Juju. Для прокси нужен отдельный токен PROXY_TOKEN, а не ключ провайдера.';
      }
      return json({ error: message }, 401, cors);
    }

    const headers = new Headers();
    headers.set('Authorization', `Bearer ${env.UPSTREAM_KEY}`);
    headers.set('Accept', request.headers.get('Accept') || 'application/json');
    const contentType = request.headers.get('Content-Type');
    if (contentType) headers.set('Content-Type', contentType);

    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.arrayBuffer();
    }

    let upstream;
    try {
      upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body,
      });
    } catch (error) {
      return json(
        {
          error: 'Не удалось связаться с API.',
          details: error instanceof Error ? error.message : String(error),
        },
        502,
        cors,
      );
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');
    for (const [key, value] of Object.entries(cors)) {
      responseHeaders.set(key, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};

import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createToken } from './crypto.js';
import {
  auditView,
  createdView,
  errorView,
  homeView,
  manageView,
  revealView,
  securityView,
  secretView,
  unavailableView,
} from './views.js';

export const TTL_OPTIONS = [
  { value: 900, label: '15 минут' },
  { value: 3600, label: '1 час' },
  { value: 21600, label: '6 часов' },
  { value: 86400, label: '24 часа' },
  { value: 259200, label: '3 дня' },
  { value: 604800, label: '7 дней' },
];

const MAX_BODY_SIZE = 512 * 1024;

function digest(value) {
  return createHash('sha256').update(value).digest();
}

function credentialsMatch(request, username, password) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Basic ')) return false;
  try {
    const actual = digest(Buffer.from(header.slice(6), 'base64').toString('utf8'));
    const expected = digest(`${username}:${password}`);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      const error = new Error('Секрет слишком большой');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function send(response, status, body, type = 'text/html; charset=utf-8', extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': type, ...extraHeaders });
  response.end(body);
}

function sanitizeMessage(value) {
  return typeof value === 'string' ? value.slice(0, 160) : '';
}

function cleanHeader(value, maxLength) {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  return first.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength) || null;
}

function requestMetadata(request) {
  const forwardedFor = cleanHeader(request.headers['x-forwarded-for'], 512);
  const forwardedIp = forwardedFor?.split(',').at(-1)?.trim();
  const realIp = cleanHeader(request.headers['x-real-ip'], 64);
  const remoteIp = request.socket?.remoteAddress?.replace(/^::ffff:/, '');
  const ipCandidate = realIp ?? forwardedIp ?? remoteIp;
  const ipAddress = ipCandidate && isIP(ipCandidate) ? ipCandidate : null;
  const referrer = cleanHeader(request.headers.referer, 1024);
  let referrerOrigin = null;
  if (referrer) {
    try {
      referrerOrigin = new URL(referrer).origin.slice(0, 255);
    } catch {
      // Ignore malformed referrers instead of storing untrusted free-form input.
    }
  }
  return {
    ipAddress,
    userAgent: cleanHeader(request.headers['user-agent'], 512),
    acceptLanguage: cleanHeader(request.headers['accept-language'], 160),
    referrerOrigin,
  };
}

export function createApp({
  store,
  publicUrl,
  adminUsername,
  adminPassword,
  defaultTtl = 86400,
  timeZone = 'Europe/Moscow',
  now = () => Date.now(),
  stylesheet,
  clientScript,
}) {
  const baseUrl = publicUrl.replace(/\/$/, '');
  const allowedTtls = new Set(TTL_OPTIONS.map(({ value }) => value));
  if (!allowedTtls.has(defaultTtl)) defaultTtl = 86400;
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
  const formatDate = (value) => formatter.format(new Date(value));
  const expectedOrigin = new URL(baseUrl).origin;

  function requireAdmin(request, response) {
    if (credentialsMatch(request, adminUsername, adminPassword)) return true;
    send(response, 401, 'Требуется административный доступ', 'text/plain; charset=utf-8', {
      'WWW-Authenticate': 'Basic realm="Secret Spark", charset="UTF-8"',
    });
    return false;
  }

  return async function handler(request, response) {
    const currentTime = now();
    store.purgeExpired(currentTime);

    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const metadata = requestMetadata(request);

      if (request.method === 'POST') {
        const fetchSite = request.headers['sec-fetch-site'];
        const origin = request.headers.origin;
        let unsafeOrigin = false;
        if (origin === 'null') {
          unsafeOrigin = fetchSite !== 'same-origin';
        } else if (origin) {
          try {
            unsafeOrigin = new URL(origin).origin !== expectedOrigin;
          } catch {
            unsafeOrigin = true;
          }
        }
        if (fetchSite === 'cross-site' || unsafeOrigin) {
          return send(response, 403, errorView('Запрос с другого сайта заблокирован.'));
        }
      }

      if (request.method === 'GET' && pathname === '/style.css') {
        response.setHeader('Cache-Control', 'public, max-age=3600');
        return send(response, 200, stylesheet, 'text/css; charset=utf-8');
      }

      if (request.method === 'GET' && pathname === '/app.js') {
        response.setHeader('Cache-Control', 'public, max-age=3600');
        return send(response, 200, clientScript ?? '', 'text/javascript; charset=utf-8');
      }

      if (request.method === 'GET' && pathname === '/robots.txt') {
        return send(response, 200, 'User-agent: *\nDisallow: /\n', 'text/plain; charset=utf-8');
      }

      if (request.method === 'GET' && (pathname === '/security' || pathname === '/security.html')) {
        return send(response, 200, securityView());
      }

      if (request.method === 'GET' && pathname === '/') {
        return send(response, 200, homeView({ ttlOptions: TTL_OPTIONS, defaultTtl }));
      }

      if (request.method === 'POST' && pathname === '/create') {
        const form = await readForm(request);
        const plaintext = form.get('secret')?.trim() ?? '';
        const requestedTtl = Number(form.get('ttl'));
        const ttl = allowedTtls.has(requestedTtl) ? requestedTtl : defaultTtl;
        if (!plaintext) return send(response, 422, errorView('Введите содержимое секрета.'));
        if (plaintext.length > 32768) return send(response, 413, errorView('Максимальный размер секрета — 32 768 символов.'));

        const token = createToken(32);
        const burnToken = createToken(32);
        const id = createToken(9);
        const expiresAt = currentTime + ttl * 1000;
        store.create({
          id,
          token,
          burnToken,
          plaintext,
          createdAt: currentTime,
          expiresAt,
          metadata,
        });
        return send(response, 201, createdView({
          shareUrl: `${baseUrl}/s/${token}`,
          manageUrl: `${baseUrl}/manage/${burnToken}`,
          expiresAt,
          formatDate,
        }));
      }

      const secretMatch = pathname.match(/^\/s\/([A-Za-z0-9_-]{40,60})$/);
      if (request.method === 'GET' && secretMatch) {
        const token = secretMatch[1];
        const record = store.inspect(token, currentTime);
        if (record) store.recordRequest(record.id, currentTime, metadata);
        if (!record || record.state !== 'active') {
          return send(response, 410, unavailableView(record?.state ?? 'missing'));
        }
        return send(response, 200, revealView({ token, expiresAt: record.expires_at, formatDate }));
      }

      const revealMatch = pathname.match(/^\/s\/([A-Za-z0-9_-]{40,60})\/reveal$/);
      if (request.method === 'POST' && revealMatch) {
        const token = revealMatch[1];
        const plaintext = store.reveal(token, currentTime, metadata);
        if (plaintext === null) {
          const record = store.inspect(token, currentTime);
          return send(response, 410, unavailableView(record?.state ?? 'missing'));
        }
        return send(response, 200, secretView(plaintext));
      }

      const manageMatch = pathname.match(/^\/manage\/([A-Za-z0-9_-]{40,60})$/);
      if (request.method === 'GET' && manageMatch) {
        const burnToken = manageMatch[1];
        return send(response, 200, manageView({
          record: store.inspectBurn(burnToken, currentTime),
          burnToken,
          formatDate,
          message: sanitizeMessage(url.searchParams.get('message')),
        }));
      }

      const burnMatch = pathname.match(/^\/manage\/([A-Za-z0-9_-]{40,60})\/delete$/);
      if (request.method === 'POST' && burnMatch) {
        if (!requireAdmin(request, response)) return;
        const burned = store.burn(burnMatch[1], currentTime, metadata);
        const message = burned ? 'Секрет удалён. Ссылка получателя больше не работает.' : 'Секрет уже недоступен.';
        return redirect(response, `/manage/${burnMatch[1]}?message=${encodeURIComponent(message)}`);
      }

      if (request.method === 'GET' && pathname === '/audit') {
        if (!requireAdmin(request, response)) return;
        return send(response, 200, auditView({
          records: store.list(),
          now: currentTime,
          formatDate,
          message: sanitizeMessage(url.searchParams.get('message')),
        }));
      }

      const auditDeleteMatch = pathname.match(/^\/audit\/([A-Za-z0-9_-]{12})\/delete$/);
      if (request.method === 'POST' && auditDeleteMatch) {
        if (!requireAdmin(request, response)) return;
        const burned = store.adminBurn(auditDeleteMatch[1], currentTime, metadata);
        const message = burned ? 'Активная ссылка удалена.' : 'Ссылка уже недоступна.';
        return redirect(response, `/audit?message=${encodeURIComponent(message)}`);
      }

      return send(response, 404, unavailableView('missing'));
    } catch (error) {
      console.error('Request failed:', error.message);
      if (error.statusCode === 413) {
        return send(response, 413, errorView('Максимальный размер секрета — 32 768 символов.'));
      }
      return send(response, 500, errorView('Внутренняя ошибка. Попробуйте ещё раз.'));
    }
  };
}

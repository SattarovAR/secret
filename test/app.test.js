import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

const username = 'team';
const password = 'correct-horse-battery-staple';
const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const workingDir = mkdtempSync(join(tmpdir(), 'secret-spark-'));
const store = createStore(join(workingDir, 'test.sqlite'), Buffer.alloc(32, 7));
let clock = Date.UTC(2026, 8, 2, 9, 0, 0);
let server;
let origin;

before(async () => {
  const stylesheet = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const handler = createApp({
    store,
    publicUrl: 'https://secret.example.test',
    adminUsername: username,
    adminPassword: password,
    timeZone: 'Europe/Moscow',
    now: () => clock,
    stylesheet,
  });
  server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
  rmSync(workingDir, { recursive: true, force: true });
});

async function createSecret(value, ttl = 86400, requestHeaders = {}) {
  const response = await fetch(`${origin}/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...requestHeaders,
    },
    body: new URLSearchParams({ secret: value, ttl: String(ttl) }),
  });
  assert.equal(response.status, 201);
  const html = await response.text();
  const secretPath = html.match(/https:\/\/secret\.example\.test(\/s\/[A-Za-z0-9_-]+)/)?.[1];
  const managePath = html.match(/https:\/\/secret\.example\.test(\/manage\/[A-Za-z0-9_-]+)/)?.[1];
  assert.ok(secretPath, 'secret link must be present');
  assert.ok(managePath, 'management link must be present');
  return { secretPath, managePath };
}

test('creation is public while audit remains administrator-only', async () => {
  const home = await fetch(`${origin}/`);
  assert.equal(home.status, 200);

  const publicCreation = await fetch(`${origin}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: 'public submission', ttl: '3600' }),
  });
  assert.equal(publicCreation.status, 201);

  const anonymousAudit = await fetch(`${origin}/audit`);
  assert.equal(anonymousAudit.status, 401);
  assert.match(anonymousAudit.headers.get('www-authenticate'), /Secret Spark/);

  const audit = await fetch(`${origin}/audit`, { headers: { Authorization: auth } });
  assert.equal(audit.status, 200);

  const crossSite = await fetch(`${origin}/create`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      Origin: 'https://attacker.example',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ secret: 'must not be stored', ttl: '3600' }),
  });
  assert.equal(crossSite.status, 403);

  const opaqueSameOrigin = await fetch(`${origin}/create`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      Origin: 'null',
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ secret: 'valid browser submission', ttl: '3600' }),
  });
  assert.equal(opaqueSameOrigin.status, 201);

  const malformedOrigin = await fetch(`${origin}/create`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      Origin: 'not a URL',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ secret: 'must not be stored', ttl: '3600' }),
  });
  assert.equal(malformedOrigin.status, 403);
});

test('a secret is revealed exactly once and audit records the read', async () => {
  const secretText = 'temporary API key: test-only-value';
  const { secretPath } = await createSecret(secretText, 86400, {
    'X-Real-IP': '203.0.113.10',
    'User-Agent': 'Creator Browser/1.0',
    'Accept-Language': 'ru-RU,ru;q=0.9',
  });

  const preview = await fetch(`${origin}${secretPath}`, {
    headers: {
      'X-Real-IP': '203.0.113.20',
      'User-Agent': 'TelegramBot (like TwitterBot)',
      Referer: 'https://t.me/company-chat/message',
    },
  });
  assert.equal(preview.status, 200);
  const previewHtml = await preview.text();
  assert.match(previewHtml, /Показать секрет/);
  assert.doesNotMatch(previewHtml, /test-only-value/);

  const first = await fetch(`${origin}${secretPath}/reveal`, {
    method: 'POST',
    headers: {
      'X-Real-IP': '203.0.113.21',
      'User-Agent': 'Recipient Browser/2.0',
    },
  });
  assert.equal(first.status, 200);
  assert.match(await first.text(), /test-only-value/);

  const second = await fetch(`${origin}${secretPath}/reveal`, { method: 'POST' });
  assert.equal(second.status, 410);
  assert.doesNotMatch(await second.text(), /test-only-value/);

  const audit = await fetch(`${origin}/audit`, { headers: { Authorization: auth } });
  const auditHtml = await audit.text();
  assert.match(auditHtml, /Прочитана/);
  assert.match(auditHtml, /2 сент. 2026/);
  assert.match(auditHtml, /Создана/);
  assert.match(auditHtml, /Страница запрошена/);
  assert.match(auditHtml, /Секрет раскрыт/);
  assert.match(auditHtml, /203\.0\.113\.10/);
  assert.match(auditHtml, /203\.0\.113\.20/);
  assert.match(auditHtml, /203\.0\.113\.21/);
  assert.match(auditHtml, /Creator Browser\/1\.0/);
  assert.match(auditHtml, /TelegramBot/);
  assert.match(auditHtml, /Recipient Browser\/2\.0/);
  assert.match(auditHtml, /ru-RU,ru;q=0\.9/);
  assert.match(auditHtml, /https:\/\/t\.me/);
  assert.doesNotMatch(auditHtml, /test-only-value/);
});

test('an active secret can be deleted before it is read', async () => {
  const { secretPath, managePath } = await createSecret('delete me');
  const unauthorizedDeletion = await fetch(`${origin}${managePath}/delete`, {
    method: 'POST',
    redirect: 'manual',
  });
  assert.equal(unauthorizedDeletion.status, 401);

  const stillActive = await fetch(`${origin}${secretPath}`);
  assert.equal(stillActive.status, 200);

  const deletion = await fetch(`${origin}${managePath}/delete`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'X-Real-IP': '203.0.113.30',
      'User-Agent': 'Administrator Browser/3.0',
    },
    redirect: 'manual',
  });
  assert.equal(deletion.status, 303);

  const secret = await fetch(`${origin}${secretPath}`);
  assert.equal(secret.status, 410);
  assert.match(await secret.text(), /Ссылка отозвана/);

  const audit = await fetch(`${origin}/audit`, { headers: { Authorization: auth } });
  const auditHtml = await audit.text();
  assert.match(auditHtml, /203\.0\.113\.30/);
  assert.match(auditHtml, /Administrator Browser\/3\.0/);
});

test('an unread secret expires and its content becomes unavailable', async () => {
  const { secretPath } = await createSecret('short lived', 900);
  clock += 901_000;

  const secret = await fetch(`${origin}${secretPath}`);
  assert.equal(secret.status, 410);
  assert.match(await secret.text(), /Время вышло/);

  const audit = await fetch(`${origin}/audit`, { headers: { Authorization: auth } });
  assert.match(await audit.text(), /Истекла/);
});

import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { parseSecretKey } from './crypto.js';
import { createStore } from './store.js';

const sourceDir = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? './data';
const publicUrl = process.env.PUBLIC_URL;
const adminUsername = process.env.ADMIN_USERNAME ?? 'team';
const adminPassword = process.env.ADMIN_PASSWORD;
const timeZone = process.env.TIME_ZONE ?? 'Europe/Moscow';
const defaultTtl = Number(process.env.DEFAULT_TTL ?? 86400);

if (!publicUrl || !/^https?:\/\//.test(publicUrl)) {
  throw new Error('PUBLIC_URL must be an absolute http(s) URL');
}
if (!adminPassword || adminPassword.length < 12) {
  throw new Error('ADMIN_PASSWORD is required and must be at least 12 characters');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

mkdirSync(dataDir, { recursive: true });
const secretKey = parseSecretKey(process.env.SECRET_KEY);
const store = createStore(join(dataDir, 'secrets.sqlite'), secretKey);
const stylesheet = readFileSync(join(sourceDir, 'style.css'), 'utf8');
const clientScript = readFileSync(join(sourceDir, 'client.js'), 'utf8');
const handler = createApp({
  store,
  publicUrl,
  adminUsername,
  adminPassword,
  defaultTtl,
  timeZone,
  stylesheet,
  clientScript,
});

const server = createServer(handler);
server.listen(port, '0.0.0.0', () => {
  console.log(`Secret Spark is listening on port ${port}`);
});

function shutdown() {
  clearInterval(purgeTimer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

const purgeTimer = setInterval(() => store.purgeExpired(Date.now()), 60_000);
purgeTimer.unref();

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

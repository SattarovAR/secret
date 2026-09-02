import { DatabaseSync } from 'node:sqlite';
import { decryptSecret, encryptSecret, hashToken } from './crypto.js';

export function createStore(filename, secretKey) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      burn_hash TEXT NOT NULL UNIQUE,
      ciphertext TEXT,
      iv TEXT,
      tag TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revealed_at INTEGER,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS secret_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      accept_language TEXT,
      referrer_origin TEXT
    );
    CREATE INDEX IF NOT EXISTS secrets_created_at_idx ON secrets(created_at DESC);
    CREATE INDEX IF NOT EXISTS secret_events_secret_id_idx
      ON secret_events(secret_id, occurred_at ASC);
  `);

  const insert = db.prepare(`
    INSERT INTO secrets (
      id, token_hash, burn_hash, ciphertext, iv, tag, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const byToken = db.prepare('SELECT * FROM secrets WHERE token_hash = ?');
  const byBurn = db.prepare('SELECT * FROM secrets WHERE burn_hash = ?');
  const claim = db.prepare(`
    UPDATE secrets
       SET revealed_at = ?, ciphertext = NULL, iv = NULL, tag = NULL
     WHERE token_hash = ?
       AND revealed_at IS NULL
       AND deleted_at IS NULL
       AND expires_at > ?
       AND ciphertext IS NOT NULL
  `);
  const burn = db.prepare(`
    UPDATE secrets
       SET deleted_at = ?, ciphertext = NULL, iv = NULL, tag = NULL
     WHERE burn_hash = ?
       AND revealed_at IS NULL
       AND deleted_at IS NULL
       AND expires_at > ?
  `);
  const adminBurn = db.prepare(`
    UPDATE secrets
       SET deleted_at = ?, ciphertext = NULL, iv = NULL, tag = NULL
     WHERE id = ?
       AND revealed_at IS NULL
       AND deleted_at IS NULL
       AND expires_at > ?
  `);
  const purge = db.prepare(`
    UPDATE secrets
       SET ciphertext = NULL, iv = NULL, tag = NULL
     WHERE expires_at <= ? AND ciphertext IS NOT NULL
  `);
  const list = db.prepare(`
    SELECT id, created_at, expires_at, revealed_at, deleted_at
      FROM secrets
     ORDER BY created_at DESC
     LIMIT ?
  `);
  const insertEvent = db.prepare(`
    INSERT INTO secret_events (
      secret_id, event_type, occurred_at, ip_address, user_agent, accept_language, referrer_origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const eventCount = db.prepare(`
    SELECT COUNT(*) AS count
      FROM secret_events
     WHERE secret_id = ? AND event_type = ?
  `);
  const eventsBySecret = db.prepare(`
    SELECT event_type, occurred_at, ip_address, user_agent, accept_language, referrer_origin
      FROM secret_events
     WHERE secret_id = ?
     ORDER BY occurred_at ASC, id ASC
  `);

  function recordEvent(secretId, eventType, occurredAt, metadata = {}) {
    const limit = eventType === 'requested' ? 100 : 10;
    if (eventCount.get(secretId, eventType).count >= limit) return false;
    insertEvent.run(
      secretId,
      eventType,
      occurredAt,
      metadata.ipAddress ?? null,
      metadata.userAgent ?? null,
      metadata.acceptLanguage ?? null,
      metadata.referrerOrigin ?? null,
    );
    return true;
  }

  function getState(record, now) {
    if (!record) return 'missing';
    if (record.revealed_at) return 'revealed';
    if (record.deleted_at) return 'deleted';
    if (record.expires_at <= now) return 'expired';
    return 'active';
  }

  return {
    create({ id, token, burnToken, plaintext, createdAt, expiresAt, metadata }) {
      const encrypted = encryptSecret(plaintext, secretKey);
      insert.run(
        id,
        hashToken(token),
        hashToken(burnToken),
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        createdAt,
        expiresAt,
      );
      recordEvent(id, 'created', createdAt, metadata);
    },

    inspect(token, now) {
      const record = byToken.get(hashToken(token));
      return record ? { ...record, state: getState(record, now) } : null;
    },

    inspectBurn(burnToken, now) {
      const record = byBurn.get(hashToken(burnToken));
      return record ? { ...record, state: getState(record, now) } : null;
    },

    recordRequest(id, now, metadata) {
      return recordEvent(id, 'requested', now, metadata);
    },

    reveal(token, now, metadata) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const tokenHash = hashToken(token);
        const record = byToken.get(tokenHash);
        if (getState(record, now) !== 'active') {
          db.exec('ROLLBACK');
          return null;
        }
        const plaintext = decryptSecret(record, secretKey);
        const result = claim.run(now, tokenHash, now);
        if (result.changes !== 1) {
          db.exec('ROLLBACK');
          return null;
        }
        recordEvent(record.id, 'revealed', now, metadata);
        db.exec('COMMIT');
        return plaintext;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    burn(burnToken, now, metadata) {
      const record = byBurn.get(hashToken(burnToken));
      const changed = burn.run(now, hashToken(burnToken), now).changes === 1;
      if (changed) recordEvent(record.id, 'deleted', now, metadata);
      return changed;
    },

    adminBurn(id, now, metadata) {
      const changed = adminBurn.run(now, id, now).changes === 1;
      if (changed) recordEvent(id, 'deleted', now, metadata);
      return changed;
    },

    purgeExpired(now) {
      return purge.run(now).changes;
    },

    list(limit = 200) {
      return list.all(limit).map((record) => ({
        ...record,
        events: eventsBySecret.all(record.id),
      }));
    },

    close() {
      db.close();
    },
  };
}

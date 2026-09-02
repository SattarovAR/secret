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
    CREATE INDEX IF NOT EXISTS secrets_created_at_idx ON secrets(created_at DESC);
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

  function getState(record, now) {
    if (!record) return 'missing';
    if (record.revealed_at) return 'revealed';
    if (record.deleted_at) return 'deleted';
    if (record.expires_at <= now) return 'expired';
    return 'active';
  }

  return {
    create({ id, token, burnToken, plaintext, createdAt, expiresAt }) {
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
    },

    inspect(token, now) {
      const record = byToken.get(hashToken(token));
      return record ? { ...record, state: getState(record, now) } : null;
    },

    inspectBurn(burnToken, now) {
      const record = byBurn.get(hashToken(burnToken));
      return record ? { ...record, state: getState(record, now) } : null;
    },

    reveal(token, now) {
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
        db.exec('COMMIT');
        return plaintext;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    burn(burnToken, now) {
      return burn.run(now, hashToken(burnToken), now).changes === 1;
    },

    adminBurn(id, now) {
      return adminBurn.run(now, id, now).changes === 1;
    },

    purgeExpired(now) {
      return purge.run(now).changes;
    },

    list(limit = 200) {
      return list.all(limit);
    },

    close() {
      db.close();
    },
  };
}

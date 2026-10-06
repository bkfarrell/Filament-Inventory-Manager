/// <reference types="node" />
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Accounts, sign-in sessions and each person's Home Assistant connection, kept in
// accounts.db. Everyone's filament data lives in their own separate database file.

export type User = { id: number; username: string; isAdmin: boolean };

const SESSION_DAYS = 30;
const USERNAME_RE = /^[A-Za-z0-9._-]{1,32}$/;
export const MIN_PASSWORD = 8;

export class Accounts {
  private db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ha_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        token TEXT NOT NULL
      );
    `);
  }

  hasUsers() {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n > 0;
  }

  listUsers(): User[] {
    return (
      this.db.prepare('SELECT id, username, is_admin FROM users ORDER BY username').all() as {
        id: number;
        username: string;
        is_admin: number;
      }[]
    ).map(toUser);
  }

  getUser(id: number): User | null {
    const row = this.db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(id);
    return row ? toUser(row as { id: number; username: string; is_admin: number }) : null;
  }

  // Throws an Error with a message suitable to show the person.
  createUser(username: string, password: string, isAdmin: boolean): User {
    if (!USERNAME_RE.test(username)) {
      throw new Error('Usernames can use letters, numbers, dots, dashes and underscores (up to 32).');
    }
    checkPassword(password);
    const exists = this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) throw new Error('That username is already taken.');
    const r = this.db
      .prepare('INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?)')
      .run(username, hashPassword(password), isAdmin ? 1 : 0, new Date().toISOString());
    return { id: Number(r.lastInsertRowid), username, isAdmin };
  }

  // Returns the user if the username and password match, otherwise null.
  verify(username: string, password: string): User | null {
    const row = this.db
      .prepare('SELECT id, username, is_admin, password_hash FROM users WHERE username = ?')
      .get(username) as
      | { id: number; username: string; is_admin: number; password_hash: string }
      | undefined;
    // Check a dummy hash when the user doesn't exist, so timing doesn't reveal usernames.
    const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    return row && ok ? toUser(row) : null;
  }

  setPassword(userId: number, password: string) {
    checkPassword(password);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
    // Signing everywhere else out is the safe default after a password change.
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  deleteUser(userId: number) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // ---- Sessions ----

  createSession(userId: number): string {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sha256(token), userId, expires);
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    return token;
  }

  userForSession(token: string | undefined): User | null {
    if (!token) return null;
    const row = this.db
      .prepare(
        `SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(sha256(token), new Date().toISOString());
    return row ? toUser(row as { id: number; username: string; is_admin: number }) : null;
  }

  deleteSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  // ---- Home Assistant connection (per person) ----

  getHaSettings(userId: number): { url: string; token: string } | null {
    const row = this.db.prepare('SELECT url, token FROM ha_settings WHERE user_id = ?').get(userId);
    return (row as { url: string; token: string } | undefined) ?? null;
  }

  setHaSettings(userId: number, url: string, token: string) {
    this.db
      .prepare(
        `INSERT INTO ha_settings (user_id, url, token) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET url = excluded.url, token = excluded.token`
      )
      .run(userId, url, token);
  }

  clearHaSettings(userId: number) {
    this.db.prepare('DELETE FROM ha_settings WHERE user_id = ?').run(userId);
  }
}

function toUser(r: { id: number; username: string; is_admin: number }): User {
  return { id: r.id, username: r.username, isAdmin: r.is_admin === 1 };
}

function checkPassword(password: string) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new Error(`Passwords need at least ${MIN_PASSWORD} characters.`);
  }
}

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

// Passwords are stored as "scrypt$salt$hash", never in plain text.
function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password: string, stored: string) {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

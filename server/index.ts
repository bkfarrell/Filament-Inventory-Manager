/// <reference types="node" />
import { createReadStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  addSpool,
  deleteSpool,
  findProduct,
  listAllSpools,
  listEvents,
  listSpools,
  loadSpool,
  markFinished,
  migrateDb,
  openSpool,
  recordUsage,
  rememberProduct,
  unloadSpool,
  updateSpool,
} from '../src/db.ts';
import type { StoreMethod } from '../src/storeMethods.ts';
import { Accounts, type User } from './accounts.ts';
import { openDatabase } from './sqlite.ts';

// Track My Filament web server.
//
// Serves the web version of the app (built into ./dist by `npm run build:web`) and the
// API it uses. Each account's filament data is kept in its own SQLite file under
// DATA_DIR/users, using the same database code as the phone app (src/db.ts).
//
// Settings (environment variables):
//   PORT      port to listen on (default 8787)
//   HOST      address to listen on (default 0.0.0.0 = every network interface)
//   DATA_DIR  where data is stored (default ./data next to this project)
//   WEB_DIR   the built web app (default ./dist)

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(ROOT, 'data'));
const WEB_DIR = resolve(process.env.WEB_DIR ?? join(ROOT, 'dist'));
const COOKIE = 'tmf_session';
const MAX_BODY = 1_000_000; // bytes

mkdirSync(join(DATA_DIR, 'users'), { recursive: true });
const accounts = new Accounts(join(DATA_DIR, 'accounts.db'));

// ---- Each person's own database ----

const userDbs = new Map<number, SQLiteDatabase>();

async function dbFor(userId: number) {
  let db = userDbs.get(userId);
  if (!db) {
    db = openDatabase(join(DATA_DIR, 'users', `${userId}.db`));
    await migrateDb(db); // same table setup/upgrades as the phone
    userDbs.set(userId, db);
  }
  return db;
}

// The operations the web app can run, by name (same list as the phone's, see src/store.ts).
const storeFunctions = {
  listSpools,
  listAllSpools,
  addSpool,
  updateSpool,
  deleteSpool,
  recordUsage,
  openSpool,
  loadSpool,
  unloadSpool,
  markFinished,
  listEvents,
  findProduct,
  rememberProduct,
} satisfies Record<StoreMethod, (db: SQLiteDatabase, ...args: never[]) => unknown>;

// ---- Small HTTP helpers ----

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.includes('application/json')) {
    throw new HttpError(415, 'Expected JSON.');
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (typeof parsed !== 'object' || parsed === null) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

function cookieValue(req: IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function sessionCookie(req: IncomingMessage, token: string, maxAge: number) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.SECURE_COOKIES === '1';
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function str(v: unknown) {
  return typeof v === 'string' ? v : '';
}

// ---- Sign-in protection: slow down repeated wrong passwords ----

const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60_000;

function checkLockout(ip: string) {
  const f = failures.get(ip);
  if (f && f.count >= MAX_FAILURES && Date.now() < f.until) {
    throw new HttpError(429, 'Too many wrong passwords. Try again in 15 minutes.');
  }
}

function recordFailure(ip: string) {
  const f = failures.get(ip);
  const count = f && Date.now() < f.until ? f.count + 1 : 1;
  failures.set(ip, { count, until: Date.now() + LOCKOUT_MS });
}

// ---- Home Assistant (requests made for the browser) ----

const HA_PATHS = new Set(['/api/', '/api/states', '/api/template']);

function normalizeHaUrl(url: string) {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  u = u.replace(/\/+$/, '');
  try {
    new URL(u);
  } catch {
    throw new HttpError(400, "That doesn't look like a valid address.");
  }
  return u;
}

async function haRequest(url: string, token: string, path: string, method: string, body?: string) {
  try {
    return await fetch(`${url}${path}`, {
      method,
      body,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(
      502,
      `The server couldn't reach Home Assistant at ${url}. Check the address, and that this computer can reach it.`
    );
  }
}

// ---- API routes ----

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string) {
  const method = req.method ?? 'GET';
  const ip = req.socket.remoteAddress ?? '';

  // Block requests made by other websites on your behalf (cross-site request forgery).
  if (method !== 'GET' && method !== 'HEAD' && req.headers.origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(req.headers.origin).host === req.headers.host;
    } catch {
      // not a valid origin: treat as cross-site
    }
    if (!sameOrigin) throw new HttpError(403, 'Cross-site request blocked.');
  }

  const token = cookieValue(req, COOKIE);
  const user = accounts.userForSession(token);
  const requireUser = (): User => {
    if (!user) throw new HttpError(401, 'Please sign in.');
    return user;
  };
  const requireAdmin = (): User => {
    const u = requireUser();
    if (!u.isAdmin) throw new HttpError(403, 'Only an admin can do that.');
    return u;
  };
  const signIn = (u: User) => {
    const t = accounts.createSession(u.id);
    send(res, 200, { user: u }, { 'Set-Cookie': sessionCookie(req, t, 30 * 86_400) });
  };

  // -- Accounts --
  if (path === '/api/auth/state' && method === 'GET') {
    return send(res, 200, { needsSetup: !accounts.hasUsers(), user });
  }
  if (path === '/api/auth/setup' && method === 'POST') {
    const body = await readJson(req);
    if (accounts.hasUsers()) throw new HttpError(403, 'Setup is already done. Please sign in.');
    try {
      return signIn(accounts.createUser(str(body.username).trim(), str(body.password), true));
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  if (path === '/api/auth/login' && method === 'POST') {
    checkLockout(ip);
    const body = await readJson(req);
    const u = accounts.verify(str(body.username).trim(), str(body.password));
    if (!u) {
      recordFailure(ip);
      throw new HttpError(401, 'Wrong username or password.');
    }
    failures.delete(ip);
    return signIn(u);
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    if (token) accounts.deleteSession(token);
    return send(res, 200, {}, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (path === '/api/auth/password' && method === 'POST') {
    const u = requireUser();
    const body = await readJson(req);
    if (!accounts.verify(u.username, str(body.currentPassword))) {
      throw new HttpError(400, 'Your current password is wrong.');
    }
    try {
      accounts.setPassword(u.id, str(body.newPassword));
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    return signIn(u); // the password change signed out every session, so start a new one
  }

  // -- Managing accounts (admin) --
  if (path === '/api/users' && method === 'GET') {
    requireAdmin();
    return send(res, 200, { users: accounts.listUsers() });
  }
  if (path === '/api/users' && method === 'POST') {
    requireAdmin();
    const body = await readJson(req);
    try {
      const created = accounts.createUser(str(body.username).trim(), str(body.password), body.isAdmin === true);
      return send(res, 200, { user: created });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  const userPath = path.match(/^\/api\/users\/(\d+)(\/password)?$/);
  if (userPath) {
    const admin = requireAdmin();
    const targetId = Number(userPath[1]);
    const target = accounts.getUser(targetId);
    if (!target) throw new HttpError(404, 'No such account.');
    if (userPath[2] && method === 'POST') {
      const body = await readJson(req);
      try {
        accounts.setPassword(targetId, str(body.password));
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      return send(res, 200, {});
    }
    if (!userPath[2] && method === 'DELETE') {
      if (targetId === admin.id) throw new HttpError(400, "You can't remove your own account.");
      accounts.deleteUser(targetId);
      // Keep their data in a "deleted" folder rather than erasing it.
      const db = userDbs.get(targetId);
      if (db) {
        await db.closeAsync();
        userDbs.delete(targetId);
      }
      const file = join(DATA_DIR, 'users', `${targetId}.db`);
      if (existsSync(file)) {
        mkdirSync(join(DATA_DIR, 'deleted'), { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        renameSync(file, join(DATA_DIR, 'deleted', `${targetId}-${target.username}-${stamp}.db`));
      }
      return send(res, 200, {});
    }
  }

  // -- Filament data: run one of the app's data operations on this person's database --
  const storeCall = path.match(/^\/api\/store\/([A-Za-z]+)$/);
  if (storeCall && method === 'POST') {
    const u = requireUser();
    const name = storeCall[1];
    if (!Object.hasOwn(storeFunctions, name)) throw new HttpError(404, 'Unknown operation.');
    const body = await readJson(req);
    const args = Array.isArray(body.args) ? body.args : [];
    if (args.length > 4) throw new HttpError(400, 'Too many arguments.');
    const fn = storeFunctions[name as StoreMethod] as (db: SQLiteDatabase, ...a: unknown[]) => unknown;
    const result = await fn(await dbFor(u.id), ...args);
    return send(res, 200, { result: result ?? null });
  }

  // -- Home Assistant --
  if (path === '/api/ha/settings') {
    const u = requireUser();
    if (method === 'GET') {
      const s = accounts.getHaSettings(u.id);
      return send(res, 200, s ? { url: s.url } : null); // the token never goes back to the browser
    }
    if (method === 'PUT') {
      const body = await readJson(req);
      const url = normalizeHaUrl(str(body.url));
      const haToken = str(body.token).trim();
      if (!haToken) throw new HttpError(400, 'Enter the token.');
      const check = await haRequest(url, haToken, '/api/', 'GET');
      if (check.status === 401) throw new HttpError(400, 'Home Assistant rejected the token.');
      if (!check.ok) throw new HttpError(400, `Home Assistant returned an error (${check.status}).`);
      accounts.setHaSettings(u.id, url, haToken);
      return send(res, 200, { url });
    }
    if (method === 'DELETE') {
      accounts.clearHaSettings(u.id);
      return send(res, 200, {});
    }
  }
  if (path === '/api/ha/request' && method === 'POST') {
    const u = requireUser();
    const body = await readJson(req);
    const haPath = str(body.path);
    const haMethod = str(body.method) === 'POST' ? 'POST' : 'GET';
    if (!HA_PATHS.has(haPath)) throw new HttpError(400, 'That Home Assistant request is not allowed.');
    // A token in the request means "test these new details"; otherwise use the saved ones.
    let target: { url: string; token: string } | null;
    if (str(body.token)) target = { url: normalizeHaUrl(str(body.url)), token: str(body.token) };
    else target = accounts.getHaSettings(u.id);
    if (!target) throw new HttpError(400, 'Connect Home Assistant in the Printer tab first.');
    const haRes = await haRequest(
      target.url,
      target.token,
      haPath,
      haMethod,
      haMethod === 'POST' ? str(body.body) : undefined
    );
    res.writeHead(haRes.status, {
      'Content-Type': haRes.headers.get('content-type') ?? 'application/json',
    });
    res.end(await haRes.text());
    return;
  }

  throw new HttpError(404, 'Not found.');
}

// ---- Serving the web app ----

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
  if (!existsSync(join(WEB_DIR, 'index.html'))) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('The web app has not been built yet. Run "npm run build:web", then restart the server.');
    return;
  }
  // Resolve inside WEB_DIR only, so a request can't reach other files on the computer.
  let file = resolve(WEB_DIR, `.${decodeURIComponent(path)}`);
  if (file !== WEB_DIR && !file.startsWith(WEB_DIR + sep)) file = join(WEB_DIR, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB_DIR, 'index.html');
  const isIndex = file.endsWith('index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // Built files have content hashes in their names, so they can be cached for good.
    'Cache-Control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
}

// ---- Server ----

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  try {
    if (path.startsWith('/api/')) await handleApi(req, res, path);
    else serveStatic(req, res, path);
  } catch (e) {
    if (res.headersSent) return res.end();
    if (e instanceof HttpError) {
      const extra: Record<string, string> = path === '/api/ha/request' ? { 'X-TMF-Proxy-Error': '1' } : {};
      return send(res, e.status, { error: e.message }, extra);
    }
    console.error(e);
    send(res, 500, { error: 'Something went wrong on the server.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Track My Filament is running at http://localhost:${PORT}`);
  console.log(`Data is stored in ${DATA_DIR}`);
  if (!accounts.hasUsers()) console.log('No accounts yet: open the address above to create the first one.');
});

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { config } from './config.js';
import { resetDemoData, seedAssets } from './db.js';
import { ah, HttpError, makeLimiter } from './http.js';
import { Session, User } from './models.js';
import { validateLogin, validateSignup } from './validate.js';

// ------------------------------------------------------------------ passwords (scrypt, built into Node)
const scrypt = promisify(crypto.scrypt);
const N = 16384; const R = 8; const P = 1;
const scryptOpts = { N, r: R, p: P, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, scryptOpts);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, n, r, p, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown, so "no such user" costs the same time as "wrong password".
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));

// ------------------------------------------------------------------ sessions and cookies
// In production the cookie is Secure and uses the __Host- prefix (no Domain, Path=/, HTTPS only).
export const COOKIE_NAME = config.cookieSecure ? '__Host-qv_session' : 'qv_session';
const SESSION_MS = config.sessionDays * 24 * 3600 * 1000;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const cookieOptions = () => ({
  httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/', maxAge: SESSION_MS,
});

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

async function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  await Session.create({
    tokenHash: sha256(token), user: user._id, expiresAt: new Date(Date.now() + SESSION_MS),
    userAgent: String(req.get('user-agent') || '').slice(0, 200),
  });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' });
}

/** Resolve the session cookie to `req.user` (null when absent or invalid). Never throws on a bad cookie. */
export const loadSession = ah(async (req, res, next) => {
  req.user = null;
  const token = readCookie(req, COOKIE_NAME);
  if (!token || token.length > 128) return next();
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session) return next();
  const user = await User.findById(session.user).lean();
  if (!user) { await session.deleteOne(); return next(); }
  req.user = { id: String(user._id), name: user.name, email: user.email };
  // Rolling expiry: refresh at most once an hour.
  if (Date.now() - session.lastSeen.getTime() > 3600 * 1000) {
    session.lastSeen = new Date();
    session.expiresAt = new Date(Date.now() + SESSION_MS);
    await session.save();
    res.cookie(COOKIE_NAME, token, cookieOptions());
  }
  return next();
});

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  return next();
}

/**
 * CSRF defence in depth (on top of SameSite=Lax): a browser's cross-site write carries a foreign Origin.
 * In production the Origin must match this site's Host. Outside production, localhost origins are also
 * accepted, because the Vite dev server (another port) proxies /api to this server.
 */
const LOCAL_ORIGIN = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export function originCheck(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let url;
    try { url = new URL(origin); } catch { return next(new HttpError(403, 'Cross-site request blocked')); }
    const sameSite = url.host === req.get('host');
    const localDev = !config.isProd && LOCAL_ORIGIN.test(url.hostname);
    if (!sameSite && !localDev) return next(new HttpError(403, 'Cross-site request blocked'));
  }
  return next();
}

// ------------------------------------------------------------------ demo account
/** Create the shared demo account if it does not exist yet (idempotent). */
export async function ensureDemoUser() {
  const { enabled, email, password } = config.demo;
  if (!enabled) return null;
  let user = await User.findOne({ email });
  if (user && !user.isDemo) {
    console.warn(`[auth] ${email} belongs to a real account, so the demo account is disabled`);
    return null;
  }
  if (!user) {
    try {
      user = await User.create({ name: 'Demo User', email, passwordHash: await hashPassword(password), isDemo: true });
      await seedAssets(user._id);
      console.log(`[auth] demo account ready: ${email}`);
    } catch (e) {
      if (e.code !== 11000) throw e; // another server created it first: that is fine
      user = await User.findOne({ email });
    }
  }
  return user;
}

// ------------------------------------------------------------------ routes
const ipLimiter = makeLimiter({ max: 60, windowMs: 15 * 60_000 });                         // all attempts per IP
const failLimiter = makeLimiter({ max: config.authMaxFailures, windowMs: 15 * 60_000 });  // failures per IP + email

export function authRouter() {
  const router = express.Router();

  router.get('/me', (req, res) => res.json({ user: req.user }));

  // The demo credentials are public by design; they unlock a sandbox that is reset on every sign-in.
  router.get('/demo', ah(async (_req, res) => {
    const { enabled, email, password } = config.demo;
    const ready = enabled && await User.exists({ email, isDemo: true });
    res.json(ready ? { enabled: true, email, password } : { enabled: false });
  }));

  router.post('/signup', ah(async (req, res) => {
    const ip = req.ip || 'unknown';
    if (ipLimiter.blocked(ip)) throw new HttpError(429, 'Too many attempts. Please try again later.');
    ipLimiter.hit(ip);
    const { value, errors } = validateSignup(req.body);
    if (errors.length) throw new HttpError(422, errors[0], errors);
    if (await User.exists({ email: value.email })) throw new HttpError(409, 'An account with this email already exists');
    let user;
    try {
      user = await User.create({ name: value.name, email: value.email, passwordHash: await hashPassword(value.password) });
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'An account with this email already exists');
      throw e;
    }
    await seedAssets(user._id); // every account starts with its own copy of the sample inventory
    await startSession(req, res, user);
    res.status(201).json({ user: { id: String(user._id), name: user.name, email: user.email } });
  }));

  router.post('/login', ah(async (req, res) => {
    const ip = req.ip || 'unknown';
    if (ipLimiter.blocked(ip)) throw new HttpError(429, 'Too many attempts. Please try again later.');
    ipLimiter.hit(ip);
    const { value, errors } = validateLogin(req.body);
    if (errors.length) throw new HttpError(422, errors[0]);
    const failKey = `${ip}|${value.email}`;
    if (failLimiter.blocked(failKey)) throw new HttpError(429, 'Too many failed attempts. Please try again in 15 minutes.');

    const user = await User.findOne({ email: value.email });
    const ok = await verifyPassword(value.password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) {
      failLimiter.hit(failKey);
      throw new HttpError(401, 'Invalid email or password');
    }
    failLimiter.reset(failKey);
    if (user.isDemo) await resetDemoData(user._id); // every reviewer starts from the clean sample data
    // New token on every sign-in (prevents session fixation); retire the previous one if present.
    const old = readCookie(req, COOKIE_NAME);
    if (old) await Session.deleteOne({ tokenHash: sha256(old) });
    await startSession(req, res, user);
    res.json({ user: { id: String(user._id), name: user.name, email: user.email } });
  }));

  router.post('/logout', ah(async (req, res) => {
    const token = readCookie(req, COOKIE_NAME);
    if (token) await Session.deleteOne({ tokenHash: sha256(token) });
    clearCookie(res);
    res.status(204).end();
  }));

  return router;
}

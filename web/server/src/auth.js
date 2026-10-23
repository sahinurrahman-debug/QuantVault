import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { config } from './config.js';
import { pruneSandboxes, purgeUsers, seedAssets } from './db.js';
import { ah, HttpError, makeLimiter } from './http.js';
import {
  Asset, Experiment, QkdRun, Session, User,
} from './models.js';
import { validateLogin, validatePasswordChange, validateSignup } from './validate.js';

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

/** What a client is allowed to know about a user. */
const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, demo: Boolean(u.isSandbox) });

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
  // Keep the newest few sessions per user; repeated sign-ins cannot grow the table without bound.
  const stale = await Session.find({ user: user._id }).sort({ createdAt: -1 }).skip(config.limits.maxSessionsPerUser).select('_id').lean();
  if (stale.length) await Session.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
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
  req.user = publicUser(user);
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
/**
 * The public demo account is only a doorway: it owns no data. Every demo sign-in creates a fresh, private
 * sandbox workspace (its own copy of the sample data) that is deleted after `sandboxHours`. Visitors therefore
 * cannot see or wipe each other's work, and simultaneous sign-ins cannot collide.
 */
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
      console.log(`[auth] demo account ready: ${email}`);
    } catch (e) {
      if (e.code !== 11000) throw e; // another server created it first: that is fine
      user = await User.findOne({ email });
    }
  } else if (!(await verifyPassword(password, user.passwordHash))) {
    // The credentials shown on the sign-in page must always be the ones that work.
    user.passwordHash = await hashPassword(password);
    await user.save();
    console.log('[auth] demo password updated to match DEMO_PASSWORD');
  }
  // Clear anything an earlier version left on the doorway account itself.
  await Promise.all([Asset.deleteMany({ owner: user._id }), QkdRun.deleteMany({ owner: user._id }), Experiment.deleteMany({ owner: user._id })]);
  return user;
}

async function createSandbox() {
  if (await User.countDocuments({ isSandbox: true }) >= config.demo.maxSandboxes) await pruneSandboxes();
  const user = await User.create({
    name: 'Demo User', email: `demo-${crypto.randomBytes(6).toString('hex')}@sandbox.quantvault.app`,
    passwordHash: 'disabled', // nobody can sign in to a sandbox directly; it is only reachable through the demo doorway
    isSandbox: true, sandboxExpiresAt: new Date(Date.now() + config.demo.sandboxHours * 3600 * 1000),
  });
  await seedAssets(user._id);
  return user;
}

// ------------------------------------------------------------------ routes
// Only failures and sign-ups count against an IP, so many honest visitors behind one network (an event Wi-Fi)
// are not locked out by successful sign-ins.
export function authRouter(limits = config.limits) {
  const ipFailures = makeLimiter({ max: limits.failuresPer15MinPerIp, windowMs: 15 * 60_000 });
  const signupLimiter = makeLimiter({ max: limits.signupsPerHourPerIp, windowMs: 3_600_000 });
  const failLimiter = makeLimiter({ max: config.authMaxFailures, windowMs: 15 * 60_000 }); // failures per IP + email
  const router = express.Router();
  const tooMany = () => new HttpError(429, 'Too many attempts. Please try again later.');

  router.get('/me', (req, res) => res.json({ user: req.user }));

  // The demo credentials are public by design; they open a private sandbox.
  router.get('/demo', ah(async (_req, res) => {
    const { enabled, email, password } = config.demo;
    const ready = enabled && await User.exists({ email, isDemo: true });
    res.json(ready ? { enabled: true, email, password } : { enabled: false });
  }));

  router.post('/signup', ah(async (req, res) => {
    const ip = req.ip || 'unknown';
    if (signupLimiter.blocked(ip) || ipFailures.blocked(ip)) throw tooMany();
    signupLimiter.hit(ip);
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
    res.status(201).json({ user: publicUser(user) });
  }));

  router.post('/login', ah(async (req, res) => {
    const ip = req.ip || 'unknown';
    if (ipFailures.blocked(ip)) throw tooMany();
    const { value, errors } = validateLogin(req.body);
    if (errors.length) throw new HttpError(422, errors[0]);
    const failKey = `${ip}|${value.email}`;
    if (failLimiter.blocked(failKey)) throw new HttpError(429, 'Too many failed attempts. Please try again in 15 minutes.');

    const user = await User.findOne({ email: value.email });
    const demoOff = Boolean(user?.isDemo) && !config.demo.enabled; // DEMO_ACCOUNT=false really turns the doorway off
    const ok = await verifyPassword(value.password, user && !demoOff ? user.passwordHash : DUMMY_HASH);
    if (!user || demoOff || !ok) {
      ipFailures.hit(ip);
      failLimiter.hit(failKey);
      throw new HttpError(401, 'Invalid email or password');
    }
    failLimiter.reset(failKey);
    // New token on every sign-in (prevents session fixation); retire the previous one if present.
    const old = readCookie(req, COOKIE_NAME);
    if (old) await Session.deleteOne({ tokenHash: sha256(old) });
    const sessionUser = user.isDemo ? await createSandbox() : user;
    await startSession(req, res, sessionUser);
    res.json({ user: publicUser(sessionUser) });
  }));

  router.post('/logout', ah(async (req, res) => {
    const token = readCookie(req, COOKIE_NAME);
    if (token) await Session.deleteOne({ tokenHash: sha256(token) });
    clearCookie(res);
    res.status(204).end();
  }));

  // ---- account management (all require a session; a wrong password is 403, never 401, so the app does not sign you out)
  router.post('/password', requireAuth, ah(async (req, res) => {
    const key = `pw|${req.user.id}`;
    if (failLimiter.blocked(key)) throw tooMany();
    const { value, errors } = validatePasswordChange(req.body);
    if (errors.length) throw new HttpError(422, errors[0], errors);
    const user = await User.findById(req.user.id);
    if (!user || user.isSandbox) throw new HttpError(403, 'Demo workspaces have no password to change');
    if (!(await verifyPassword(value.currentPassword, user.passwordHash))) {
      failLimiter.hit(key);
      throw new HttpError(403, 'Your current password is not correct');
    }
    user.passwordHash = await hashPassword(value.newPassword);
    await user.save();
    const current = readCookie(req, COOKIE_NAME);
    await Session.deleteMany({ user: user._id, tokenHash: { $ne: sha256(current || '') } }); // sign out every other device
    res.status(204).end();
  }));

  router.delete('/sessions', requireAuth, ah(async (req, res) => {
    await Session.deleteMany({ user: req.user.id });
    clearCookie(res);
    res.status(204).end();
  }));

  router.delete('/account', requireAuth, ah(async (req, res) => {
    const key = `del|${req.user.id}`;
    if (failLimiter.blocked(key)) throw tooMany();
    const user = await User.findById(req.user.id);
    if (!user) throw new HttpError(404, 'Account not found');
    if (!user.isSandbox) { // a demo sandbox has no password; a real account must confirm with its password
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password || !(await verifyPassword(password, user.passwordHash))) {
        failLimiter.hit(key);
        throw new HttpError(403, 'Enter your current password to delete the account');
      }
    }
    await purgeUsers([user._id]);
    clearCookie(res);
    res.status(204).end();
  }));

  return router;
}

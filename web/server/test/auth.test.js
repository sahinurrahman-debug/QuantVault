import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { COOKIE_NAME, ensureDemoUser } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { connectDb, pruneSandboxes } from '../src/db.js';
import {
  Asset, Experiment, QkdRun, Session, User, ensureIndexes,
} from '../src/models.js';
import { Client, newAsset, PASSWORD } from './helpers.js';

let db;
let server;
let base;
let origin;
const anon = () => new Client(base);

async function signup(email, name = 'Test User', password = PASSWORD) {
  const c = anon();
  const r = await c.request('POST', '/auth/signup', { name, email, password });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return c;
}

before(async () => {
  db = await connectDb({ persist: false, allowEnvUri: false });
  await ensureIndexes();
  await ensureDemoUser();
  server = createApp().listen(0);
  origin = `http://127.0.0.1:${server.address().port}`;
  base = `${origin}/api`;
});

after(async () => {
  server?.close();
  await db?.close();
});

describe('sign up', () => {
  it('rejects weak or malformed input', async () => {
    const c = anon();
    assert.equal((await c.request('POST', '/auth/signup', { name: 'A', email: 'a@example.com', password: 'short' })).status, 422);
    assert.equal((await c.request('POST', '/auth/signup', { name: 'A', email: 'nope', password: PASSWORD })).status, 422);
    assert.equal((await c.request('POST', '/auth/signup', { name: '', email: 'a@example.com', password: PASSWORD })).status, 422);
    assert.equal((await c.request('POST', '/auth/signup', { name: 'A', email: 'a@example.com', password: 'x'.repeat(200) })).status, 422);
  });

  it('creates an account, signs the user in and never returns the password hash', async () => {
    const c = anon();
    const r = await c.request('POST', '/auth/signup', { name: '  Grace Hopper ', email: 'Grace@Example.com', password: PASSWORD });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body.user).sort(), ['demo', 'email', 'id', 'name']);
    assert.equal(r.body.user.demo, false);
    assert.equal(r.body.user.email, 'grace@example.com');
    assert.equal(r.body.user.name, 'Grace Hopper');
    assert.ok(!JSON.stringify(r.body).includes('scrypt'));
    assert.equal((await c.request('GET', '/auth/me')).body.user.email, 'grace@example.com');
  });

  it('refuses a duplicate email (case-insensitive)', async () => {
    await signup('dupe@example.com');
    const r = await anon().request('POST', '/auth/signup', { name: 'Other', email: 'DUPE@example.com', password: PASSWORD });
    assert.equal(r.status, 409);
  });

  it('gives each new account its own copy of the sample inventory', async () => {
    const c = await signup('seeded@example.com');
    assert.equal((await c.request('GET', '/assets')).body.length, 13);
  });
});

describe('sessions and cookies', () => {
  it('sets an httpOnly, SameSite=Lax cookie that holds a random token, not the user', async () => {
    const c = anon();
    const r = await c.request('POST', '/auth/signup', { name: 'Cookie Test', email: 'cookie@example.com', password: PASSWORD });
    const line = r.setCookie.find((l) => l.startsWith(`${COOKIE_NAME}=`));
    assert.ok(line, 'session cookie must be set');
    assert.match(line, /HttpOnly/i);
    assert.match(line, /SameSite=Lax/i);
    assert.match(line, /Path=\//i);
    assert.match(line, /Max-Age=\d+/i);
    const token = line.split(';')[0].split('=')[1];
    assert.ok(token.length >= 40, 'token is long and random');
    assert.ok(!token.includes(r.body.user.id) && !token.includes('cookie@'));
  });

  it('stores only a hash of the token and a scrypt hash of the password', async () => {
    const c = await signup('hashes@example.com');
    const token = c.jar.get(COOKIE_NAME);
    assert.equal(await Session.countDocuments({ tokenHash: token }), 0, 'raw token must not be stored');
    assert.equal(await Session.countDocuments({ tokenHash: /^[0-9a-f]{64}$/ }), await Session.countDocuments());
    const u = await User.findOne({ email: 'hashes@example.com' }).lean();
    assert.ok(u.passwordHash.startsWith('scrypt$'));
    assert.ok(!u.passwordHash.includes(PASSWORD));
  });

  it('persists across a page refresh (same cookie, new request) but not without the cookie', async () => {
    const c = await signup('persist@example.com');
    const refreshed = c.fork();
    assert.equal((await refreshed.request('GET', '/auth/me')).body.user.email, 'persist@example.com');
    assert.equal((await anon().request('GET', '/auth/me')).body.user, null);
  });

  it('ignores garbage, forged and expired cookies', async () => {
    const forged = anon();
    forged.jar.set(COOKIE_NAME, 'not-a-real-token');
    assert.equal((await forged.request('GET', '/assets')).status, 401);
    const huge = anon();
    huge.jar.set(COOKIE_NAME, 'x'.repeat(5000));
    assert.equal((await huge.request('GET', '/assets')).status, 401);

    const c = await signup('expired@example.com');
    await Session.updateMany({ user: (await User.findOne({ email: 'expired@example.com' }))._id }, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await c.request('GET', '/assets')).status, 401);
  });

  it('sends security headers and never caches API responses', async () => {
    const r = await anon().request('GET', '/health');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  it('uses a Secure __Host- cookie in production mode', () => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e',
      "import('./src/auth.js').then((m) => { console.log(m.COOKIE_NAME); process.exit(0); })"],
    { env: { ...process.env, COOKIE_SECURE: 'true' }, cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    assert.equal(out.trim(), '__Host-qv_session');
  });
});

describe('sign in and sign out', () => {
  it('gives the same generic error for a wrong password and an unknown email', async () => {
    await signup('login@example.com');
    const bad = await anon().request('POST', '/auth/login', { email: 'login@example.com', password: 'wrong-password-123' });
    const none = await anon().request('POST', '/auth/login', { email: 'nobody@example.com', password: 'wrong-password-123' });
    assert.equal(bad.status, 401);
    assert.equal(none.status, 401);
    assert.equal(bad.body.error, none.body.error);
    assert.equal(bad.setCookie.length, 0);
  });

  it('signs in with the right password and rotates the session token', async () => {
    const first = await signup('rotate@example.com');
    const oldToken = first.jar.get(COOKIE_NAME);
    const r = await first.request('POST', '/auth/login', { email: 'ROTATE@example.com', password: PASSWORD });
    assert.equal(r.status, 200);
    const newToken = first.jar.get(COOKIE_NAME);
    assert.notEqual(newToken, oldToken);
    const replay = anon();
    replay.jar.set(COOKIE_NAME, oldToken);
    assert.equal((await replay.request('GET', '/assets')).status, 401, 'the retired token must stop working');
  });

  it('signs out: the cookie is cleared and the old token is dead on the server', async () => {
    const c = await signup('logout@example.com');
    const token = c.jar.get(COOKIE_NAME);
    const out = await c.request('POST', '/auth/logout');
    assert.equal(out.status, 204);
    assert.ok(out.setCookie.some((l) => l.startsWith(`${COOKIE_NAME}=`) && /Expires=|Max-Age=0/i.test(l)));
    assert.equal((await c.request('GET', '/auth/me')).body.user, null);
    const stolen = anon();
    stolen.jar.set(COOKIE_NAME, token);
    assert.equal((await stolen.request('GET', '/assets')).status, 401, 'a copied cookie must not survive logout');
  });

  it('locks out repeated failed attempts for that email, even with the right password', async () => {
    await signup('brute@example.com');
    const c = anon();
    for (let i = 0; i < 8; i += 1) {
      assert.equal((await c.request('POST', '/auth/login', { email: 'brute@example.com', password: `wrong-password-${i}` })).status, 401);
    }
    const locked = await c.request('POST', '/auth/login', { email: 'brute@example.com', password: PASSWORD });
    assert.equal(locked.status, 429);
  });
});

describe('protected routes', () => {
  it('reject anonymous requests with 401', async () => {
    const c = anon();
    const calls = [
      ['GET', '/meta'], ['GET', '/assets'], ['POST', '/assets', newAsset()], ['PUT', '/assets/A01', newAsset()],
      ['DELETE', '/assets/A01'], ['POST', '/assets/reset'], ['GET', '/risk?horizon=15'], ['GET', '/risk/sweep'],
      ['POST', '/qkd/run', { n_qubits: 256 }], ['GET', '/qkd/runs'], ['DELETE', '/qkd/runs'],
      ['POST', '/experiments/run', { n_qubits: 256, reps: 1 }], ['GET', '/experiments/latest'],
    ];
    for (const [method, path, body] of calls) {
      const r = await c.request(method, path, body);
      assert.equal(r.status, 401, `${method} ${path} should require authentication`);
    }
  });

  it('keep the public endpoints public', async () => {
    const c = anon();
    assert.equal((await c.request('GET', '/health')).status, 200);
    assert.equal((await c.request('GET', '/auth/me')).status, 200);
    assert.equal((await c.request('POST', '/subscribe', { email: 'public@example.com' })).status, 201);
  });
});

describe('cross-site request protection', () => {
  it('blocks writes whose Origin is another site, even with a valid cookie', async () => {
    const c = await signup('csrf@example.com');
    const evil = await c.request('POST', '/assets/reset', undefined, { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
    const evilLogout = await c.request('POST', '/auth/logout', undefined, { headers: { origin: 'https://evil.example' } });
    assert.equal(evilLogout.status, 403);
    assert.equal((await c.request('GET', '/auth/me')).body.user.email, 'csrf@example.com', 'still signed in');
    const same = await c.request('POST', '/assets/reset', undefined, { headers: { origin } });
    assert.equal(same.status, 200);
  });

  it('accepts the Vite dev server origin (localhost on another port) outside production', async () => {
    const c = await signup('devproxy@example.com');
    const r = await c.request('POST', '/assets/reset', undefined, { headers: { origin: 'http://localhost:5173' } });
    assert.equal(r.status, 200);
    const lookalike = await c.request('POST', '/assets/reset', undefined, { headers: { origin: 'http://localhost.evil.example' } });
    assert.equal(lookalike.status, 403, 'a look-alike hostname must not pass');
  });
});

describe('users cannot see or change each other\'s data', () => {
  let alice;
  let bob;
  before(async () => {
    alice = await signup('alice-iso@example.com', 'Alice');
    bob = await signup('bob-iso@example.com', 'Bob');
  });

  it('inventories are separate, and the same asset id can exist for both users', async () => {
    assert.equal((await alice.request('POST', '/assets', newAsset({ id: 'SECRET1', name: 'Alice only' }))).status, 201);
    const bobList = (await bob.request('GET', '/assets')).body;
    assert.equal(bobList.length, 13);
    assert.ok(!bobList.some((a) => a.id === 'SECRET1' || a.name === 'Alice only'));
    assert.equal((await bob.request('POST', '/assets', newAsset({ id: 'SECRET1', name: 'Bob own' }))).status, 201, 'ids are unique per user');
    assert.equal((await alice.request('GET', '/assets')).body.find((a) => a.id === 'SECRET1').name, 'Alice only');
  });

  it('a user cannot edit or delete another user\'s asset (and cannot tell it exists)', async () => {
    await alice.request('POST', '/assets', newAsset({ id: 'ONLYA', name: 'Alice private' }));
    const put = await bob.request('PUT', '/assets/ONLYA', newAsset({ id: 'ONLYA', name: 'Hijacked' }));
    const del = await bob.request('DELETE', '/assets/ONLYA');
    assert.equal(put.status, 404);
    assert.equal(del.status, 404);
    const mine = (await alice.request('GET', '/assets')).body.find((a) => a.id === 'ONLYA');
    assert.equal(mine.name, 'Alice private');
  });

  it('resetting one inventory leaves the other untouched', async () => {
    await bob.request('POST', '/assets/reset');
    assert.ok((await alice.request('GET', '/assets')).body.some((a) => a.id === 'ONLYA'));
  });

  it('risk results are computed from the caller\'s own inventory only', async () => {
    const a = (await alice.request('GET', '/risk?horizon=15')).body;
    const b = (await bob.request('GET', '/risk?horizon=15')).body;
    assert.ok(a.results.some((r) => r.id === 'ONLYA'));
    assert.ok(!b.results.some((r) => r.id === 'ONLYA'));
  });

  it('QKD run history is private', async () => {
    assert.equal((await alice.request('POST', '/qkd/run', { n_qubits: 512, seed: 3 })).status, 201);
    assert.equal((await bob.request('GET', '/qkd/runs')).body.length, 0);
    assert.equal((await bob.request('DELETE', '/qkd/runs')).body.deleted, 0);
    assert.equal((await alice.request('GET', '/qkd/runs')).body.length, 1);
  });

  it('experiment batches are private and do not block each other', async () => {
    const a = await alice.request('POST', '/experiments/run', { n_qubits: 256, reps: 1 });
    assert.equal(a.status, 202);
    const bobView = (await bob.request('GET', '/experiments/latest')).body;
    assert.equal(bobView.running, null);
    assert.equal(bobView.done, null);
    const b = await bob.request('POST', '/experiments/run', { n_qubits: 256, reps: 1 });
    assert.equal(b.status, 202, 'a batch running for Alice must not block Bob');
    for (let i = 0; i < 150; i += 1) {
      const [x, y] = await Promise.all([alice, bob].map((c) => c.request('GET', '/experiments/latest')));
      if (!x.body.running && !y.body.running) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const done = (await alice.request('GET', '/experiments/latest')).body.done;
    assert.ok(done, 'Alice\'s batch finished');
    assert.equal(done.owner, undefined, 'internal owner ids are never sent to clients');
  });
});

describe('demo account', () => {
  it('publishes its credentials and signs in with them', async () => {
    const info = (await anon().request('GET', '/auth/demo')).body;
    assert.equal(info.enabled, true);
    const c = anon();
    const r = await c.request('POST', '/auth/login', { email: info.email, password: info.password });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'Demo User');
    assert.equal((await c.request('GET', '/assets')).body.length, 13);
  });

  it('is idempotent and reset to the sample data on every sign-in', async () => {
    const again = await ensureDemoUser();
    assert.equal(await User.countDocuments({ isDemo: true }), 1);
    assert.ok(again);
    const { email, password } = (await anon().request('GET', '/auth/demo')).body;
    const c = anon();
    await c.request('POST', '/auth/login', { email, password });
    await c.request('DELETE', '/assets/A01');
    await c.request('POST', '/qkd/run', { n_qubits: 256, seed: 1 });
    assert.equal((await c.request('GET', '/assets')).body.length, 12);
    await c.request('POST', '/auth/logout');
    await c.request('POST', '/auth/login', { email, password });
    assert.equal((await c.request('GET', '/assets')).body.length, 13, 'the next visitor gets the full sample inventory');
    assert.equal((await c.request('GET', '/qkd/runs')).body.length, 0, 'and an empty run history');
  });

  it('cannot be used to reach another user\'s data', async () => {
    const other = await signup('private-owner@example.com');
    await other.request('POST', '/assets', newAsset({ id: 'PRIVATE', name: 'Private asset' }));
    const { email, password } = (await anon().request('GET', '/auth/demo')).body;
    const demo = anon();
    await demo.request('POST', '/auth/login', { email, password });
    assert.ok(!(await demo.request('GET', '/assets')).body.some((a) => a.id === 'PRIVATE'));
    assert.equal((await demo.request('DELETE', '/assets/PRIVATE')).status, 404);
  });

  it('refuses a sign-up that takes the demo email', async () => {
    const { email } = (await anon().request('GET', '/auth/demo')).body;
    assert.equal((await anon().request('POST', '/auth/signup', { name: 'Imposter', email, password: PASSWORD })).status, 409);
  });
});

describe('demo sandboxes', () => {
  const creds = async () => (await anon().request('GET', '/auth/demo')).body;

  it('gives every demo sign-in its own private workspace', async () => {
    const { email, password } = await creds();
    const a = anon();
    const b = anon();
    const ra = await a.request('POST', '/auth/login', { email, password });
    const rb = await b.request('POST', '/auth/login', { email, password });
    assert.equal(ra.status, 200);
    assert.equal(rb.status, 200);
    assert.notEqual(ra.body.user.id, rb.body.user.id);
    assert.equal(ra.body.user.demo, true);
    assert.notEqual(ra.body.user.email, email, 'a visitor is never signed in as the doorway account itself');
    await a.request('DELETE', '/assets/A01');
    assert.equal((await a.request('GET', '/assets')).body.length, 12);
    assert.equal((await b.request('GET', '/assets')).body.length, 13, "one visitor's edits never reach another visitor");
  });

  it('lets eight judges sign in at the same moment', async () => {
    const { email, password } = await creds();
    const results = await Promise.all(Array.from({ length: 8 }, () => anon().request('POST', '/auth/login', { email, password })));
    assert.deepEqual(results.map((r) => r.status), Array(8).fill(200));
    assert.equal(new Set(results.map((r) => r.body.user.id)).size, 8);
  });

  it('keeps the doorway account free of data', async () => {
    const { email } = await creds();
    const gateway = await User.findOne({ email, isDemo: true });
    for (const Model of [Asset, QkdRun, Experiment]) assert.equal(await Model.countDocuments({ owner: gateway._id }), 0);
  });

  it('DEMO_ACCOUNT=false really switches the demo sign-in off', async () => {
    const { email, password } = await creds();
    config.demo.enabled = false;
    try {
      assert.equal((await anon().request('GET', '/auth/demo')).body.enabled, false);
      assert.equal((await anon().request('POST', '/auth/login', { email, password })).status, 401, 'hidden credentials must not still work');
    } finally {
      config.demo.enabled = true;
    }
    assert.equal((await anon().request('POST', '/auth/login', { email, password })).status, 200);
  });

  it('keeps the advertised password working when DEMO_PASSWORD changes', async () => {
    const original = config.demo.password;
    const changed = 'A-brand-new-demo-pass-1';
    config.demo.password = changed;
    try {
      await ensureDemoUser();
      const { email, password } = await creds();
      assert.equal(password, changed);
      assert.equal((await anon().request('POST', '/auth/login', { email, password: changed })).status, 200);
      assert.equal((await anon().request('POST', '/auth/login', { email, password: original })).status, 401);
    } finally {
      config.demo.password = original;
      await ensureDemoUser();
    }
    const { email } = await creds();
    assert.equal((await anon().request('POST', '/auth/login', { email, password: original })).status, 200);
  });

  it('deletes expired sandboxes together with everything they own', async () => {
    const { email, password } = await creds();
    const c = anon();
    const id = (await c.request('POST', '/auth/login', { email, password })).body.user.id;
    await c.request('POST', '/qkd/run', { n_qubits: 256, seed: 2 });
    await User.updateOne({ _id: id }, { sandboxExpiresAt: new Date(Date.now() - 1000) });
    assert.ok(await pruneSandboxes() >= 1);
    assert.equal(await User.countDocuments({ _id: id }), 0);
    for (const Model of [Asset, QkdRun, Experiment]) assert.equal(await Model.countDocuments({ owner: id }), 0);
    assert.equal(await Session.countDocuments({ user: id }), 0);
    assert.equal((await c.request('GET', '/assets')).status, 401, "an expired sandbox's cookie stops working");
  });

  it('keeps the number of sandboxes under the cap by dropping the oldest', async () => {
    const { email, password } = await creds();
    for (let i = 0; i < 3; i += 1) await anon().request('POST', '/auth/login', { email, password });
    const total = await User.countDocuments({ isSandbox: true });
    await pruneSandboxes(total - 2);
    assert.equal(await User.countDocuments({ isSandbox: true }), total - 2);
  });
});

describe('rate limits count failures, not successes', () => {
  it('blocks an address after repeated failures, but never for successful sign-ins', async () => {
    const srv = createApp({ limits: { ...config.limits, failuresPer15MinPerIp: 3, signupsPerHourPerIp: 100 } }).listen(0);
    const root = `http://127.0.0.1:${srv.address().port}/api`;
    try {
      const { email, password } = (await new Client(root).request('GET', '/auth/demo')).body;
      for (let i = 0; i < 6; i += 1) {
        assert.equal((await new Client(root).request('POST', '/auth/login', { email, password })).status, 200, 'successful sign-ins are free');
      }
      for (let i = 0; i < 3; i += 1) {
        assert.equal((await new Client(root).request('POST', '/auth/login', { email: `nobody${i}@example.com`, password: 'wrong-password-123' })).status, 401);
      }
      assert.equal((await new Client(root).request('POST', '/auth/login', { email, password })).status, 429);
    } finally {
      srv.close();
    }
  });

  it('limits sign-ups per address', async () => {
    const srv = createApp({ limits: { ...config.limits, signupsPerHourPerIp: 2 } }).listen(0);
    const root = `http://127.0.0.1:${srv.address().port}/api`;
    try {
      const statuses = [];
      for (let i = 0; i < 3; i += 1) {
        statuses.push((await new Client(root).request('POST', '/auth/signup', { name: 'Burst', email: `burst${i}@example.com`, password: PASSWORD })).status);
      }
      assert.deepEqual(statuses, [201, 201, 429]);
    } finally {
      srv.close();
    }
  });
});

describe('session limits', () => {
  it('keeps only the newest sessions per user', async () => {
    const first = await signup('sessions@example.com');
    const id = (await first.request('GET', '/auth/me')).body.user.id;
    for (let i = 0; i < 14; i += 1) await anon().request('POST', '/auth/login', { email: 'sessions@example.com', password: PASSWORD });
    assert.ok(await Session.countDocuments({ user: id }) <= config.limits.maxSessionsPerUser);
  });
});

describe('account management', () => {
  const NEW_PASSWORD = 'another-long-passphrase-9';

  it('requires a session', async () => {
    const c = anon();
    assert.equal((await c.request('POST', '/auth/password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status, 401);
    assert.equal((await c.request('DELETE', '/auth/sessions')).status, 401);
    assert.equal((await c.request('DELETE', '/auth/account', { password: PASSWORD })).status, 401);
  });

  it('changes the password, signs out other devices and keeps this one', async () => {
    const here = await signup('changepw@example.com');
    const elsewhere = anon();
    assert.equal((await elsewhere.request('POST', '/auth/login', { email: 'changepw@example.com', password: PASSWORD })).status, 200);

    const wrong = await here.request('POST', '/auth/password', { currentPassword: 'not-my-password-1', newPassword: NEW_PASSWORD });
    assert.equal(wrong.status, 403, 'a wrong current password is 403, so the app does not sign the user out');
    assert.ok((await here.request('GET', '/auth/me')).body.user, 'still signed in after the mistake');
    assert.equal((await here.request('POST', '/auth/password', { currentPassword: PASSWORD, newPassword: 'short' })).status, 422);
    assert.equal((await here.request('POST', '/auth/password', { currentPassword: PASSWORD, newPassword: PASSWORD })).status, 422);

    assert.equal((await here.request('POST', '/auth/password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status, 204);
    assert.ok((await here.request('GET', '/auth/me')).body.user, 'this device stays signed in');
    assert.equal((await elsewhere.request('GET', '/auth/me')).body.user, null, 'every other device is signed out');
    assert.equal((await anon().request('POST', '/auth/login', { email: 'changepw@example.com', password: PASSWORD })).status, 401);
    assert.equal((await anon().request('POST', '/auth/login', { email: 'changepw@example.com', password: NEW_PASSWORD })).status, 200);
  });

  it('signs out everywhere', async () => {
    const a = await signup('everywhere@example.com');
    const b = anon();
    await b.request('POST', '/auth/login', { email: 'everywhere@example.com', password: PASSWORD });
    assert.equal((await a.request('DELETE', '/auth/sessions')).status, 204);
    assert.equal((await a.request('GET', '/auth/me')).body.user, null);
    assert.equal((await b.request('GET', '/auth/me')).body.user, null);
  });

  it('deletes an account and all of its data, but only with the password', async () => {
    const c = await signup('deleteme@example.com');
    const id = (await c.request('GET', '/auth/me')).body.user.id;
    await c.request('POST', '/qkd/run', { n_qubits: 256, seed: 4 });
    assert.equal((await c.request('DELETE', '/auth/account', {})).status, 403);
    assert.equal((await c.request('DELETE', '/auth/account', { password: 'wrong-password-123' })).status, 403);
    assert.ok((await c.request('GET', '/auth/me')).body.user, 'a failed deletion does not sign the user out');
    assert.equal((await c.request('DELETE', '/auth/account', { password: PASSWORD })).status, 204);
    assert.equal((await anon().request('POST', '/auth/login', { email: 'deleteme@example.com', password: PASSWORD })).status, 401);
    for (const Model of [Asset, QkdRun, Experiment]) assert.equal(await Model.countDocuments({ owner: id }), 0);
    assert.equal(await Session.countDocuments({ user: id }), 0);
    assert.equal(await User.countDocuments({ _id: id }), 0);
  });

  it('lets a demo workspace end itself without a password, but never change one', async () => {
    const { email, password } = (await anon().request('GET', '/auth/demo')).body;
    const c = anon();
    const id = (await c.request('POST', '/auth/login', { email, password })).body.user.id;
    assert.equal((await c.request('POST', '/auth/password', { currentPassword: password, newPassword: NEW_PASSWORD })).status, 403);
    assert.equal((await c.request('DELETE', '/auth/account', {})).status, 204);
    assert.equal(await User.countDocuments({ _id: id }), 0);
    assert.equal(await User.countDocuments({ email, isDemo: true }), 1, 'the doorway itself is never deleted');
  });
});

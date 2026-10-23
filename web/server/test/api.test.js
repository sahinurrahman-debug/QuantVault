import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { connectDb } from '../src/db.js';
import { ensureIndexes } from '../src/models.js';
import { Client, newAsset, PASSWORD } from './helpers.js';

let db;
let server;
let base;
let user; // every request in this file is made as one signed-in user
const http = (method, path, body) => user.request(method, path, body);

before(async () => {
  db = await connectDb({ persist: false, allowEnvUri: false }); // tests never touch a real MONGODB_URI
  await ensureIndexes();
  server = createApp({ limits: { ...config.limits, experimentsPerHour: 1000, qkdPerHour: 1000 } }).listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  user = new Client(base);
  const r = await user.request('POST', '/auth/signup', { name: 'Alice Test', email: 'alice@example.com', password: PASSWORD });
  assert.equal(r.status, 201);
});

after(async () => {
  server?.close();
  await db?.close();
});

describe('health and meta', () => {
  it('reports a connected database', async () => {
    const r = await http('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.db, 'connected');
  });

  it('serves the algorithm catalogue and static content from Python', async () => {
    const r = await http('GET', '/meta');
    assert.equal(r.status, 200);
    assert.equal(r.body.algorithms['ML-KEM'].role, 'key_establishment');
    assert.ok(r.body.comparison.length > 5);
    assert.deepEqual(r.body.scenarios.Central, 15);
  });
});

describe('inventory CRUD', () => {
  it('is seeded with the 13 sample assets', async () => {
    const r = await http('GET', '/assets');
    assert.equal(r.body.length, 13);
  });

  it('rejects invalid assets with details', async () => {
    const r = await http('POST', '/assets', newAsset({ key_establishment: 'ML-DSA', exposure: 'moon', migration_years: -1 }));
    assert.equal(r.status, 422);
    assert.ok(r.body.details.length >= 3);
  });

  it('creates, rejects duplicates, updates and deletes', async () => {
    assert.equal((await http('POST', '/assets', newAsset())).status, 201);
    assert.equal((await http('POST', '/assets', newAsset())).status, 409);
    const upd = await http('PUT', '/assets/T01', newAsset({ name: 'Renamed', confidentiality_years: 5 }));
    assert.equal(upd.status, 200);
    assert.equal(upd.body.name, 'Renamed');
    assert.equal((await http('PUT', '/assets/NOPE', newAsset({ id: 'NOPE' }))).status, 404);
    assert.equal((await http('DELETE', '/assets/T01')).status, 204);
    assert.equal((await http('DELETE', '/assets/T01')).status, 404);
  });

  it('accepts null and UNKNOWN algorithm roles', async () => {
    const r = await http('POST', '/assets', newAsset({ id: 'T02', key_establishment: 'UNKNOWN', symmetric: null }));
    assert.equal(r.status, 201);
    await http('DELETE', '/assets/T02');
  });

  it('rejects malformed JSON', async () => {
    const res = await fetch(`${base}/assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400);
  });
});

describe('risk engine through the API', () => {
  it('scores the stored inventory (EHR is Critical, Mosca violated at Z=15)', async () => {
    const r = await http('GET', '/risk?horizon=15');
    assert.equal(r.status, 200);
    assert.equal(r.body.results.length, 13);
    const ehr = r.body.results.find((a) => a.id === 'A01');
    assert.equal(ehr.tier, 'Critical');
    assert.equal(ehr.mosca.status, 'violated');
    assert.equal(r.body.plan.length, 5);
  });

  it('the threat horizon changes the Mosca outcome', async () => {
    const near = await http('GET', '/risk?horizon=5');
    const far = await http('GET', '/risk?horizon=40');
    assert.ok(near.body.overview.mosca_violated > far.body.overview.mosca_violated);
  });

  it('rejects an invalid horizon', async () => {
    assert.equal((await http('GET', '/risk?horizon=abc')).status, 422);
  });

  it('reflects inventory edits immediately', async () => {
    await http('POST', '/assets', newAsset({ id: 'T03' }));
    const r = await http('GET', '/risk?horizon=15');
    const t = r.body.results.find((a) => a.id === 'T03');
    assert.equal(r.body.results.length, 14);
    assert.equal(t.mosca.status, 'violated');
    assert.ok(['Critical', 'High'].includes(t.tier));
    await http('DELETE', '/assets/T03');
  });

  it('returns a horizon sweep for 5..40 years', async () => {
    const r = await http('GET', '/risk/sweep');
    assert.equal(r.body.rows.length, 36);
    assert.equal(r.body.rows[0].z, 5);
  });

  it('can reset to the sample inventory', async () => {
    await http('DELETE', '/assets/A04');
    assert.equal((await http('GET', '/assets')).body.length, 12);
    assert.equal((await http('POST', '/assets/reset')).body.restored, 13);
  });
});

describe('QKD simulation', () => {
  it('detects an intercept-resend eavesdropper (QBER about 25%) and aborts', async () => {
    const r = await http('POST', '/qkd/run', { n_qubits: 2048, eve_enabled: true, seed: 7 });
    assert.equal(r.status, 201);
    assert.ok(r.body.summary.qber_true > 0.2 && r.body.summary.qber_true < 0.3, `qber ${r.body.summary.qber_true}`);
    assert.equal(r.body.summary.accepted, false);
    assert.equal(r.body.transmission.alice_bits.length, 64);
  });

  it('produces a key on an ideal channel and persists the run', async () => {
    const r = await http('POST', '/qkd/run', { n_qubits: 2048, seed: 8 });
    assert.equal(r.body.summary.accepted, true);
    assert.ok(r.body.summary.final_length > 100);
    assert.equal(r.body.summary.keys_match, true);
    const list = await http('GET', '/qkd/runs');
    assert.ok(list.body.length >= 2);
    assert.equal(list.body[0].transmission, undefined);
  });

  it('validates parameters', async () => {
    assert.equal((await http('POST', '/qkd/run', { n_qubits: 10 })).status, 422);
    assert.equal((await http('POST', '/qkd/run', { noise_model: 'gaussian' })).status, 422);
    assert.equal((await http('POST', '/qkd/run', { noise_p: 0.9 })).status, 422);
  });
});

describe('experiments A-D (background job)', () => {
  it('runs asynchronously, refuses a concurrent batch and stores the result', async () => {
    const start = await http('POST', '/experiments/run', { n_qubits: 256, reps: 1 });
    assert.equal(start.status, 202);
    assert.equal(start.body.status, 'running');
    assert.equal((await http('POST', '/experiments/run', { n_qubits: 256, reps: 1 })).status, 409);

    let latest;
    for (let i = 0; i < 120; i += 1) {
      latest = (await http('GET', '/experiments/latest')).body;
      if (!latest.running) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(latest.done, `expected a finished batch, got ${JSON.stringify(latest.lastFailure)}`);
    const { grid, eve_sweep: sweep } = latest.done.result;
    assert.ok(grid.length > 20 && sweep.length === 6);
    const b = grid.find((g) => g.experiment === 'B');
    assert.ok(b.qber_mean > 0.15, 'experiment B shows the eavesdropper');
  });

  it('validates parameters', async () => {
    assert.equal((await http('POST', '/experiments/run', { n_qubits: 5 })).status, 422);
  });
});

describe('pilot-list sign-up', () => {
  it('stores a valid email once and reports duplicates without erroring', async () => {
    const first = await http('POST', '/subscribe', { email: 'Person@Example.com ' });
    assert.equal(first.status, 201);
    assert.equal(first.body.already, false);
    const again = await http('POST', '/subscribe', { email: 'person@example.com' });
    assert.equal(again.status, 200);
    assert.equal(again.body.already, true);
  });

  it('rejects invalid emails and never echoes stored addresses', async () => {
    assert.equal((await http('POST', '/subscribe', { email: 'not-an-email' })).status, 422);
    assert.equal((await http('POST', '/subscribe', {})).status, 422);
    assert.equal((await http('GET', '/subscribe')).status, 404);
  });
});

const tally = (rs) => rs.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});

async function waitForBatch(client) {
  for (let i = 0; i < 150; i += 1) {
    if (!(await client.request('GET', '/experiments/latest')).body.running) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('experiment batch did not finish');
}

describe('simultaneous requests used to return 500; now they are handled', () => {
  it('creating the same asset id twelve times at once: exactly one 201, the rest 409', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => http('POST', '/assets', newAsset({ id: 'RACE1' }))));
    assert.deepEqual(tally(results), { 201: 1, 409: 11 });
    await http('DELETE', '/assets/RACE1');
  });

  it('resetting the inventory six times at once: all succeed and the sample data is intact', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => http('POST', '/assets/reset')));
    assert.deepEqual(tally(results), { 200: 6 });
    assert.equal((await http('GET', '/assets')).body.length, 13);
  });

  it('starting four experiment batches at once: exactly one runs, the rest get 409', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => http('POST', '/experiments/run', { n_qubits: 256, reps: 1 })));
    assert.deepEqual(tally(results), { 202: 1, 409: 3 });
    await waitForBatch(user);
  });
});

describe('a long simulation never blocks the dashboard', () => {
  it('risk requests stay fast while another user runs an experiment batch', async () => {
    const runner = new Client(base);
    await runner.request('POST', '/auth/signup', { name: 'Runner', email: 'runner@example.com', password: PASSWORD });
    const viewer = new Client(base);
    await viewer.request('POST', '/auth/signup', { name: 'Viewer', email: 'viewer@example.com', password: PASSWORD });
    assert.equal((await runner.request('POST', '/experiments/run', { n_qubits: 512, reps: 2 })).status, 202);
    await new Promise((r) => setTimeout(r, 500)); // let the batch occupy the heavy lane
    const started = Date.now();
    const risk = await viewer.request('GET', '/risk?horizon=15');
    const sweep = await viewer.request('GET', '/risk/sweep');
    const elapsed = Date.now() - started;
    assert.equal(risk.status, 200);
    assert.equal(sweep.status, 200);
    assert.ok(elapsed < 5000, `risk + sweep took ${elapsed} ms while a batch was running`);
    await waitForBatch(runner);
  });
});

describe('quotas', () => {
  it('limits risk requests per user', async () => {
    const srv = createApp({ limits: { ...config.limits, riskPer15Min: 3 } }).listen(0);
    const c = new Client(`http://127.0.0.1:${srv.address().port}/api`);
    try {
      await c.request('POST', '/auth/signup', { name: 'Quota', email: 'quota@example.com', password: PASSWORD });
      const statuses = [];
      for (let i = 0; i < 4; i += 1) statuses.push((await c.request('GET', '/risk?horizon=15')).status);
      assert.deepEqual(statuses, [200, 200, 200, 429]);
    } finally {
      srv.close();
    }
  });
});

describe('errors never leak server internals', () => {
  it('hides file paths when the Python engine cannot be started', async () => {
    const real = config.python;
    config.python = 'C:\\definitely\\not\\here\\python.exe';
    try {
      const r = await http('GET', '/risk?horizon=15');
      assert.equal(r.status, 500);
      assert.equal(r.body.error, 'The calculation engine failed. Please try again.');
      assert.ok(!/definitely|python\.exe|not.here/i.test(JSON.stringify(r.body)));
    } finally {
      config.python = real;
    }
  });
});

describe('serving the built client', () => {
  let dist;
  let srv;
  let root;
  before(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'qv-dist-'));
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>t</title><div id="root"></div>');
    fs.writeFileSync(path.join(dist, 'assets', 'app.abc123.js'), 'console.log("hello");'.repeat(2000));
    fs.writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    srv = createApp({ clientDist: dist }).listen(0);
    root = `http://127.0.0.1:${srv.address().port}`;
  });
  after(() => { srv?.close(); fs.rmSync(dist, { recursive: true, force: true }); });

  it('serves the app for GET and HEAD, with a content security policy', async () => {
    const get = await fetch(`${root}/`);
    assert.equal(get.status, 200);
    assert.match(get.headers.get('content-type'), /text\/html/);
    assert.match(get.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal((await fetch(`${root}/`, { method: 'HEAD' })).status, 200);
  });

  it('gives client-side routes the app, including deep dashboard tabs', async () => {
    for (const p of ['/login', '/signup', '/dashboard', '/dashboard/risk', '/account']) {
      const r = await fetch(`${root}${p}`);
      assert.equal(r.status, 200, p);
      assert.match(r.headers.get('content-type'), /text\/html/);
    }
  });

  it('answers 404, not a page of HTML, for a file that does not exist', async () => {
    for (const p of ['/assets/missing.js', '/robots.txt', '/nope.png']) {
      const r = await fetch(`${root}${p}`);
      assert.equal(r.status, 404, p);
      assert.doesNotMatch(r.headers.get('content-type') || '', /text\/html/);
    }
  });

  it('caches hashed bundles for a year, revalidates the page, and compresses text', async () => {
    const js = await fetch(`${root}/assets/app.abc123.js`, { headers: { 'accept-encoding': 'gzip' } });
    assert.match(js.headers.get('cache-control'), /max-age=31536000.*immutable/);
    assert.equal(js.headers.get('content-encoding'), 'gzip');
    assert.match((await fetch(`${root}/`)).headers.get('cache-control'), /no-cache/);
  });

  it('answers unknown API paths with JSON (401 when signed out), never with the app page', async () => {
    const r = await fetch(`${root}/api/nope`);
    assert.equal(r.status, 401);
    assert.match(r.headers.get('content-type'), /json/);
  });
});

// Keep this LAST: it disconnects the database.
describe('health check', () => {
  it('reports 503 when the database is unreachable, so the platform can restart the instance', async () => {
    assert.equal((await http('GET', '/health')).status, 200);
    await mongoose.disconnect();
    const r = await http('GET', '/health');
    assert.equal(r.status, 503);
    assert.equal(r.body.db, 'disconnected');
  });
});

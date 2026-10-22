import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { connectDb, seedAssetsIfEmpty } from '../src/db.js';

let db;
let server;
let base;

async function http(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const newAsset = (over = {}) => ({
  id: 'T01', name: 'Test archive', category: 'Test', protocol: 'TLS 1.2',
  key_establishment: 'RSA-KT', signature: 'RSA-SIG', symmetric: 'AES-256', hash: 'SHA-256',
  forward_secrecy: false, confidentiality_years: 30, integrity_years: 0, migration_years: 6,
  sensitivity: 'restricted', exposure: 'internet', migration_difficulty: 'high', link_type: 'internet',
  notes: 'created by the API test', ...over,
});

before(async () => {
  db = await connectDb({ persist: false });
  await seedAssetsIfEmpty();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
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

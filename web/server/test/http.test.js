import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeLimiter } from '../src/http.js';
import { callPython, childEnv, PythonError, schedulerStats } from '../src/python.js';

describe('makeLimiter', () => {
  it('blocks a key once its budget is used and lets others through', () => {
    const l = makeLimiter({ max: 2, windowMs: 60_000 });
    assert.equal(l.blocked('a'), false);
    l.hit('a');
    l.hit('a');
    assert.equal(l.blocked('a'), true);
    assert.equal(l.blocked('b'), false);
  });

  it('forgets old events once the window has passed, and can be reset', async () => {
    const l = makeLimiter({ max: 1, windowMs: 40 });
    l.hit('a');
    assert.equal(l.blocked('a'), true);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(l.blocked('a'), false);
    l.hit('a');
    l.reset('a');
    assert.equal(l.blocked('a'), false);
  });
});

describe('the Python child process', () => {
  it('does not inherit secrets from the server environment', () => {
    const saved = { ...process.env };
    process.env.MONGODB_URI = 'placeholder-connection-value';
    process.env.SOME_API_TOKEN = 'placeholder-token';
    process.env.COOKIE_SECURE = 'true';
    try {
      const env = childEnv();
      for (const key of ['MONGODB_URI', 'SOME_API_TOKEN', 'COOKIE_SECURE', 'DEMO_PASSWORD']) assert.equal(env[key], undefined, key);
      assert.equal(env.PYTHONIOENCODING, 'utf-8');
      assert.ok(env.PATH || env.Path, 'PATH is still passed so the interpreter can start');
    } finally {
      Object.assign(process.env, saved);
      delete process.env.SOME_API_TOKEN;
    }
  });
});

describe('PythonError', () => {
  it('is not safe to show by default', () => {
    assert.equal(new PythonError('boom').expose, false);
    assert.equal(new PythonError('busy', 503, { expose: true }).expose, true);
  });

  it('shows bad-input messages from the engine (422) but marks them as safe', async () => {
    await assert.rejects(callPython({ cmd: 'qkd', n_qubits: 4 }), (e) => e.status === 422 && e.expose === true && /n_qubits/.test(e.message));
  });

  it('leaves the scheduler empty after jobs finish', () => {
    const { light, heavy } = schedulerStats();
    assert.deepEqual([light.active, light.queued, heavy.active, heavy.queued], [0, 0, 0, 0]);
  });
});

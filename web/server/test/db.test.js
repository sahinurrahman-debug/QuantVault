import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const SERVER_DIR = new URL('..', import.meta.url);
const run = (env) => spawnSync(process.execPath, ['--input-type=module', '-e',
  "import('./src/db.js').then(async (m) => { const d = await m.connectDb(); await d.close(); console.log('CONNECTED'); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(3); })"],
{ cwd: SERVER_DIR, encoding: 'utf8', env: { ...process.env, MONGODB_URI: '', USE_LOCAL_DB: '', NODE_ENV: '', ...env }, timeout: 90_000 });

describe('database selection', () => {
  it('refuses to start without MONGODB_URI instead of silently using a private local database', () => {
    const r = run({});
    assert.equal(r.status, 3);
    assert.match(r.stderr, /MONGODB_URI is not set/);
    assert.match(r.stderr, /npm run setup:db/);
    assert.ok(!r.stdout.includes('CONNECTED'));
  });

  it('requires MONGODB_URI in production even when the local database is allowed', () => {
    const r = run({ NODE_ENV: 'production', USE_LOCAL_DB: 'true' });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /required when NODE_ENV=production/);
  });

  it('never prints credentials when describing the connection', async () => {
    const { describeUri } = await import('../src/db.js');
    // Built from pieces on purpose, so no credentialed connection string appears literally in the source.
    const password = ['S3cret', 'Pass'].join('');
    const uri = ['mongodb+srv://', 'someone', ':', password, '@', 'cluster0.abc12.mongodb.net/quantvault?retryWrites=true'].join('');
    const shown = describeUri(uri);
    assert.equal(shown, 'cluster0.abc12.mongodb.net/quantvault');
    assert.ok(!shown.includes(password) && !shown.includes('someone'));
  });
});

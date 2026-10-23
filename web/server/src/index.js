import { createApp } from './app.js';
import { ensureDemoUser } from './auth.js';
import { config } from './config.js';
import { connectDb, failStaleExperiments, pruneSandboxes } from './db.js';
import { ensureIndexes } from './models.js';

// A stray rejection must be logged, not allowed to take the whole server down. A synchronous crash still exits.
process.on('unhandledRejection', (reason) => console.error('[server] unhandled rejection:', reason));
process.on('uncaughtException', (err) => { console.error('[server] uncaught exception:', err); process.exit(1); });

const db = await connectDb();
await ensureIndexes();
await failStaleExperiments();
await ensureDemoUser();
await pruneSandboxes();
// Expired demo workspaces are removed hourly (idempotent, so it is safe on every server that shares the database).
setInterval(() => pruneSandboxes().catch((e) => console.error('[demo] cleanup failed:', e.message)), 3_600_000).unref();

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`[api] QuantVault API on http://localhost:${config.port}  (python: ${config.python}, secure cookies: ${config.cookieSecure})`);
});

async function shutdown() {
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import { createApp } from './app.js';
import { config } from './config.js';
import { connectDb, failStaleExperiments } from './db.js';
import { ensureDemoUser } from './auth.js';
import { ensureIndexes } from './models.js';

const db = await connectDb();
await ensureIndexes();
await failStaleExperiments();
await ensureDemoUser();

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

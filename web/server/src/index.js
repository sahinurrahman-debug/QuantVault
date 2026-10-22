import { createApp } from './app.js';
import { config } from './config.js';
import { connectDb, failStaleExperiments, seedAssetsIfEmpty } from './db.js';
import { Experiment } from './models.js';
import { callPython } from './python.js';

const db = await connectDb();
await failStaleExperiments();
const seeded = await seedAssetsIfEmpty();
if (seeded) console.log(`[db] seeded ${seeded} sample assets from data/inventory.json`);

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`[api] QuantVault API on http://localhost:${config.port}  (python: ${config.python})`);
});

// First start: compute a small experiment batch in the background so the QKD page has data.
if (process.env.SKIP_EXPERIMENT_SEED !== '1' && await Experiment.estimatedDocumentCount() === 0) {
  const params = { n_qubits: 2048, reps: 3 };
  const doc = await Experiment.create({ params });
  console.log('[experiments] computing the initial A-D batch in the background...');
  callPython({ cmd: 'experiments', ...params }, 15 * 60_000)
    .then((result) => Experiment.findByIdAndUpdate(doc._id, { status: 'done', result, finishedAt: new Date() }))
    .then(() => console.log('[experiments] initial batch ready'))
    .catch((e) => Experiment.findByIdAndUpdate(doc._id, { status: 'failed', error: e.message, finishedAt: new Date() })
      .then(() => console.error(`[experiments] initial batch failed: ${e.message}`)));
}

async function shutdown() {
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

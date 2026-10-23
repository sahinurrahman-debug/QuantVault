import fs from 'node:fs';
import mongoose from 'mongoose';
import { config } from './config.js';
import { Asset, Experiment, QkdRun } from './models.js';

/** "mongodb+srv://user:pass@host/db?x" -> "host/db" (never prints credentials). */
export function describeUri(uri) {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/?([^?]*)/.exec(uri);
  return m ? `${m[1]}${m[2] ? `/${m[2]}` : ''}` : 'unknown host';
}

/**
 * Connect to MongoDB. Every run uses the SAME shared database, so data is identical on every machine.
 *  - MONGODB_URI set (from the environment or web/server/.env) -> use it (MongoDB Atlas).
 *  - not set -> refuse to start, with instructions. A silent local fallback would give each machine its own
 *    private data, which is exactly what we do not want.
 *  - USE_LOCAL_DB=true -> explicit opt-in to a throw-away local database for offline work.
 * Tests pass `allowEnvUri: false`, so they always use their own temporary database and can never touch Atlas.
 */
export async function connectDb({ persist = process.env.DEV_DB_PERSIST !== 'false', allowEnvUri = true } = {}) {
  let uri = allowEnvUri ? config.mongoUri : '';
  let memory = null;
  if (!uri) {
    if (config.isProd) throw new Error('MONGODB_URI is required when NODE_ENV=production');
    if (allowEnvUri && !config.useLocalDb) {
      throw new Error(
        'MONGODB_URI is not set, so there is no shared database to connect to.\n'
        + '  Run once:  npm run setup:db        (saves your MongoDB Atlas connection string to web/server/.env)\n'
        + '  Or, for a private throw-away local database:  set USE_LOCAL_DB=true',
      );
    }
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const instance = {};
    if (persist) {
      fs.mkdirSync(config.dataDir, { recursive: true });
      instance.dbPath = config.dataDir;
    }
    memory = await MongoMemoryServer.create({ instance });
    uri = memory.getUri();
    console.log(`[db] USING A LOCAL THROW-AWAY DATABASE${persist ? ` (data in ${config.dataDir})` : ''}: data is NOT shared`);
  } else {
    console.log(`[db] connecting to MongoDB at ${describeUri(uri)} ...`);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  if (!memory) console.log(`[db] connected to MongoDB at ${describeUri(uri)}: data is shared by every machine using this database`);
  return {
    uri,
    inMemory: Boolean(memory),
    async close() {
      await mongoose.disconnect();
      if (memory) await memory.stop();
    },
  };
}

export function loadSampleInventory() {
  return JSON.parse(fs.readFileSync(config.inventoryPath, 'utf-8')).assets;
}

/** Give a user their own copy of the sample inventory. */
export async function seedAssets(owner) {
  const docs = await Asset.insertMany(loadSampleInventory().map((a) => ({ ...a, owner })));
  return docs.length;
}

/** Replace one user's assets with the sample inventory (other users are untouched). */
export async function resetAssets(owner) {
  await Asset.deleteMany({ owner });
  return seedAssets(owner);
}

/** Put the shared demo account back to a clean state (called on every demo sign-in). */
export async function resetDemoData(owner) {
  await resetAssets(owner);
  await QkdRun.deleteMany({ owner });
  await Experiment.deleteMany({ owner, status: { $ne: 'running' } });
}

/**
 * Mark experiments that can no longer be running as failed. Several servers can share this database, so a
 * restart must not touch another machine's live batch: only batches older than the job timeout (15 min) count.
 */
export async function failStaleExperiments() {
  await Experiment.updateMany(
    { status: 'running', createdAt: { $lt: new Date(Date.now() - 16 * 60_000) } },
    { status: 'failed', error: 'The server running this batch stopped before it finished', finishedAt: new Date() },
  );
}

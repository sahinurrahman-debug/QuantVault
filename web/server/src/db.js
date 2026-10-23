import fs from 'node:fs';
import mongoose from 'mongoose';
import { config } from './config.js';
import {
  Asset, Experiment, QkdRun, Session, User,
} from './models.js';

/** Reduces a connection string to just "host/db" so logs never show the user name or password. */
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

// The sample inventory never changes while the server runs, so read it once.
let sampleCache = null;
export function loadSampleInventory() {
  if (!sampleCache) sampleCache = JSON.parse(fs.readFileSync(config.inventoryPath, 'utf-8')).assets;
  return sampleCache;
}

const isDuplicateKey = (e) => e && (e.code === 11000 || e.writeErrors?.some?.((w) => w.err?.code === 11000));

/** Concurrent upserts on a unique index can lose a race with E11000; the retry then simply updates. */
async function retryOnDuplicate(fn, tries = 5) {
  for (let i = 0; ; i += 1) {
    try { return await fn(); } catch (e) { if (!isDuplicateKey(e) || i >= tries - 1) throw e; }
  }
}

/**
 * Give a user their own copy of the sample inventory. Idempotent: running it twice, or twice at the same time,
 * ends in the same state (an upsert per sample asset) instead of colliding on the unique (owner, id) index.
 */
export async function seedAssets(owner) {
  const sample = loadSampleInventory();
  await retryOnDuplicate(() => Asset.bulkWrite(sample.map((a) => ({
    replaceOne: { filter: { owner, id: a.id }, replacement: { ...a, owner }, upsert: true },
  })), { ordered: false }));
  return sample.length;
}

/**
 * Make one user's inventory exactly the sample inventory. The sample assets are written first and only then
 * are extras removed, so there is never a moment with an empty inventory, and concurrent calls are safe.
 */
export async function resetAssets(owner) {
  const count = await seedAssets(owner);
  await Asset.deleteMany({ owner, id: { $nin: loadSampleInventory().map((a) => a.id) } });
  return count;
}

/** Delete users and everything they own (the public demo gateway account is never deleted). */
export async function purgeUsers(ids) {
  if (!ids.length) return 0;
  await Promise.all([
    Asset.deleteMany({ owner: { $in: ids } }), QkdRun.deleteMany({ owner: { $in: ids } }),
    Experiment.deleteMany({ owner: { $in: ids } }), Session.deleteMany({ user: { $in: ids } }),
  ]);
  return (await User.deleteMany({ _id: { $in: ids }, isDemo: { $ne: true } })).deletedCount;
}

/** Remove expired demo sandboxes, and the oldest ones if there are more than the cap. Safe to run anywhere, any time. */
export async function pruneSandboxes(max = config.demo.maxSandboxes) {
  const expired = await User.find({ isSandbox: true, sandboxExpiresAt: { $lt: new Date() } }).select('_id').lean();
  let removed = await purgeUsers(expired.map((u) => u._id));
  const total = await User.countDocuments({ isSandbox: true });
  if (total > max) {
    const oldest = await User.find({ isSandbox: true }).sort({ createdAt: 1 }).limit(total - max).select('_id').lean();
    removed += await purgeUsers(oldest.map((u) => u._id));
  }
  return removed;
}

/** Keep only the newest `keep` documents of a user-owned collection. */
export async function trimOwned(Model, owner, keep, extraFilter = {}) {
  const old = await Model.find({ owner, ...extraFilter }).sort({ createdAt: -1 }).skip(keep).select('_id').lean();
  if (old.length) await Model.deleteMany({ _id: { $in: old.map((d) => d._id) } });
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

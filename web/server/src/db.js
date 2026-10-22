import fs from 'node:fs';
import mongoose from 'mongoose';
import { config } from './config.js';
import { Asset, Experiment } from './models.js';

/**
 * Connect to MongoDB.
 *  - MONGODB_URI set  -> use it (Atlas or a local server).
 *  - not set (dev/test) -> start a throw-away mongod via mongodb-memory-server
 *    (persisted under web/server/.data unless `persist` is false).
 * Production requires MONGODB_URI.
 */
export async function connectDb({ persist = true, allowEnvUri = true } = {}) {
  let uri = allowEnvUri ? config.mongoUri : "";
  let memory = null;
  if (!uri) {
    if (config.isProd) throw new Error('MONGODB_URI is required when NODE_ENV=production');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const instance = {};
    if (persist) {
      fs.mkdirSync(config.dataDir, { recursive: true });
      instance.dbPath = config.dataDir;
    }
    memory = await MongoMemoryServer.create({ instance });
    uri = memory.getUri();
    console.log(`[db] no MONGODB_URI: started local in-process MongoDB${persist ? ` (data in ${config.dataDir})` : ''}`);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
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

/** Fill the assets collection from data/inventory.json when it is empty. */
export async function seedAssetsIfEmpty() {
  if (await Asset.estimatedDocumentCount() > 0) return 0;
  const docs = await Asset.insertMany(loadSampleInventory());
  return docs.length;
}

/** Replace every asset with the sample inventory. */
export async function resetAssets() {
  await Asset.deleteMany({});
  const docs = await Asset.insertMany(loadSampleInventory());
  return docs.length;
}

/** A server restart interrupts any experiment that was still running. */
export async function failStaleExperiments() {
  await Experiment.updateMany(
    { status: 'running' },
    { status: 'failed', error: 'Interrupted by a server restart', finishedAt: new Date() },
  );
}

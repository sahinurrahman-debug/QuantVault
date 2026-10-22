import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';
import { resetAssets } from './db.js';
import { Asset, Experiment, QkdRun, toPlainAsset } from './models.js';
import { callPython, getMeta, PythonError } from './python.js';
import {
  validateAsset, validateExperiment, validateHorizon, validateQkd,
} from './validate.js';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function currentAssets() {
  const docs = await Asset.find().sort({ id: 1 }).lean();
  return docs.map(toPlainAsset);
}

/** Run an experiment batch in the background and record the outcome. */
async function runExperimentJob(id, params) {
  try {
    const result = await callPython({ cmd: 'experiments', ...params }, 15 * 60_000);
    await Experiment.findByIdAndUpdate(id, { status: 'done', result, finishedAt: new Date() });
  } catch (e) {
    await Experiment.findByIdAndUpdate(id, { status: 'failed', error: e.message, finishedAt: new Date() });
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  const api = express.Router();

  api.get('/health', ah(async (_req, res) => {
    res.json({
      ok: true,
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      python: config.python,
    });
  }));

  api.get('/meta', ah(async (_req, res) => res.json(await getMeta())));

  // ------------------------------------------------------------------ inventory
  api.get('/assets', ah(async (_req, res) => res.json(await currentAssets())));

  api.post('/assets', ah(async (req, res) => {
    const { value, errors } = validateAsset(req.body, await getMeta());
    if (errors.length) throw new HttpError(422, 'Invalid asset', errors);
    if (await Asset.countDocuments() >= config.maxAssets) throw new HttpError(409, `Inventory is limited to ${config.maxAssets} assets`);
    if (await Asset.exists({ id: value.id })) throw new HttpError(409, `Asset ${value.id} already exists`);
    res.status(201).json(toPlainAsset(await Asset.create(value)));
  }));

  api.put('/assets/:id', ah(async (req, res) => {
    const { value, errors } = validateAsset({ ...req.body, id: req.params.id }, await getMeta());
    if (errors.length) throw new HttpError(422, 'Invalid asset', errors);
    const doc = await Asset.findOneAndUpdate({ id: req.params.id }, { $set: value },
      { returnDocument: 'after', runValidators: true });
    if (!doc) throw new HttpError(404, `Asset ${req.params.id} not found`);
    res.json(toPlainAsset(doc));
  }));

  api.delete('/assets/:id', ah(async (req, res) => {
    const doc = await Asset.findOneAndDelete({ id: req.params.id });
    if (!doc) throw new HttpError(404, `Asset ${req.params.id} not found`);
    res.status(204).end();
  }));

  api.post('/assets/reset', ah(async (_req, res) => {
    res.json({ restored: await resetAssets() });
  }));

  // ------------------------------------------------------------------ risk
  api.get('/risk', ah(async (req, res) => {
    const { value: horizon, errors } = validateHorizon(req.query.horizon);
    if (errors.length) throw new HttpError(422, errors[0]);
    const assets = await currentAssets();
    if (!assets.length) throw new HttpError(409, 'The inventory is empty; add an asset or reset to the sample inventory');
    res.json(await callPython({ cmd: 'risk', assets, horizon }));
  }));

  api.get('/risk/sweep', ah(async (_req, res) => {
    const assets = await currentAssets();
    if (!assets.length) throw new HttpError(409, 'The inventory is empty');
    res.json(await callPython({ cmd: 'sweep', assets }));
  }));

  // ------------------------------------------------------------------ QKD
  api.post('/qkd/run', ah(async (req, res) => {
    const { value, errors } = validateQkd(req.body);
    if (errors.length) throw new HttpError(422, 'Invalid QKD parameters', errors);
    const out = await callPython({ cmd: 'qkd', ...value });
    const doc = await QkdRun.create({ params: value, ...out });
    res.status(201).json(doc.toObject());
  }));

  api.get('/qkd/runs', ah(async (_req, res) => {
    res.json(await QkdRun.find().sort({ createdAt: -1 }).limit(50).select('-transmission').lean());
  }));

  api.delete('/qkd/runs', ah(async (_req, res) => {
    res.json({ deleted: (await QkdRun.deleteMany({})).deletedCount });
  }));

  // ------------------------------------------------------------------ experiments A-D
  api.post('/experiments/run', ah(async (req, res) => {
    const { value, errors } = validateExperiment(req.body);
    if (errors.length) throw new HttpError(422, 'Invalid experiment parameters', errors);
    if (await Experiment.exists({ status: 'running' })) throw new HttpError(409, 'An experiment batch is already running');
    const doc = await Experiment.create({ params: value });
    runExperimentJob(doc._id, value); // intentionally not awaited
    res.status(202).json(doc.toObject());
  }));

  api.get('/experiments/latest', ah(async (_req, res) => {
    const running = await Experiment.findOne({ status: 'running' }).sort({ createdAt: -1 }).lean();
    const done = await Experiment.findOne({ status: 'done' }).sort({ createdAt: -1 }).lean();
    const failed = await Experiment.findOne({ status: 'failed' }).sort({ createdAt: -1 }).lean();
    res.json({ running, done, lastFailure: failed && (!done || failed.createdAt > done.createdAt) ? failed : null });
  }));

  api.use((req, _res, next) => next(new HttpError(404, `No such endpoint: ${req.method} ${req.originalUrl}`)));
  app.use('/api', api);

  // Production: serve the built React client.
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(config.clientDist, 'index.html')) : next()));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err instanceof PythonError) return res.status(err.status).json({ error: err.message });
    if (err.name === 'ValidationError') return res.status(422).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

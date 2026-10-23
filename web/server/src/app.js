import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import { authRouter, loadSession, originCheck, requireAuth } from './auth.js';
import { config } from './config.js';
import { resetAssets } from './db.js';
import { ah, HttpError, makeLimiter } from './http.js';
import {
  Asset, Experiment, QkdRun, Subscriber, publicDoc, toPlainAsset,
} from './models.js';
import { callPython, getMeta, PythonError } from './python.js';
import {
  validateAsset, validateEmail, validateExperiment, validateHorizon, validateQkd,
} from './validate.js';

const subscribeLimiter = makeLimiter({ max: 10, windowMs: 3_600_000 });
function limitSubscribe(req, _res, next) {
  const key = req.ip || 'unknown';
  if (subscribeLimiter.blocked(key)) return next(new HttpError(429, 'Too many attempts. Please try again later.'));
  subscribeLimiter.hit(key);
  return next();
}

// Every data query below is scoped by `owner = req.user.id`; there is no code path that reads without it.
async function currentAssets(owner) {
  const docs = await Asset.find({ owner }).sort({ id: 1 }).lean();
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

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
  + "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1); // behind Render's proxy: correct client IP and req.secure
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (config.isProd) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(originCheck);
  api.use(loadSession);

  // ------------------------------------------------------------------ public routes
  api.get('/health', ah(async (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
  }));

  api.post('/subscribe', limitSubscribe, ah(async (req, res) => {
    const { value: email, errors } = validateEmail(req.body);
    if (errors.length) throw new HttpError(422, errors[0]);
    const existing = await Subscriber.findOne({ email }).lean();
    if (existing) return res.json({ ok: true, already: true });
    try {
      await Subscriber.create({ email });
    } catch (e) {
      if (e.code !== 11000) throw e; // lost a race with a duplicate: still a success
      return res.json({ ok: true, already: true });
    }
    return res.status(201).json({ ok: true, already: false });
  }));

  api.use('/auth', authRouter());

  // ------------------------------------------------------------------ everything below requires a session
  api.use(requireAuth);

  api.get('/meta', ah(async (_req, res) => res.json(await getMeta())));

  // ---- inventory
  api.get('/assets', ah(async (req, res) => res.json(await currentAssets(req.user.id))));

  api.post('/assets', ah(async (req, res) => {
    const owner = req.user.id;
    const { value, errors } = validateAsset(req.body, await getMeta());
    if (errors.length) throw new HttpError(422, 'Invalid asset', errors);
    if (await Asset.countDocuments({ owner }) >= config.maxAssets) throw new HttpError(409, `Inventory is limited to ${config.maxAssets} assets`);
    if (await Asset.exists({ owner, id: value.id })) throw new HttpError(409, `Asset ${value.id} already exists`);
    res.status(201).json(toPlainAsset(await Asset.create({ ...value, owner })));
  }));

  api.put('/assets/:id', ah(async (req, res) => {
    const { value, errors } = validateAsset({ ...req.body, id: req.params.id }, await getMeta());
    if (errors.length) throw new HttpError(422, 'Invalid asset', errors);
    const doc = await Asset.findOneAndUpdate({ owner: req.user.id, id: req.params.id }, { $set: value },
      { returnDocument: 'after', runValidators: true });
    if (!doc) throw new HttpError(404, `Asset ${req.params.id} not found`); // same answer for "not yours" and "not there"
    res.json(toPlainAsset(doc));
  }));

  api.delete('/assets/:id', ah(async (req, res) => {
    const doc = await Asset.findOneAndDelete({ owner: req.user.id, id: req.params.id });
    if (!doc) throw new HttpError(404, `Asset ${req.params.id} not found`);
    res.status(204).end();
  }));

  api.post('/assets/reset', ah(async (req, res) => {
    res.json({ restored: await resetAssets(req.user.id) });
  }));

  // ---- risk
  api.get('/risk', ah(async (req, res) => {
    const { value: horizon, errors } = validateHorizon(req.query.horizon);
    if (errors.length) throw new HttpError(422, errors[0]);
    const assets = await currentAssets(req.user.id);
    if (!assets.length) throw new HttpError(409, 'The inventory is empty; add an asset or reset to the sample inventory');
    res.json(await callPython({ cmd: 'risk', assets, horizon }));
  }));

  api.get('/risk/sweep', ah(async (req, res) => {
    const assets = await currentAssets(req.user.id);
    if (!assets.length) throw new HttpError(409, 'The inventory is empty');
    res.json(await callPython({ cmd: 'sweep', assets }));
  }));

  // ---- QKD
  api.post('/qkd/run', ah(async (req, res) => {
    const { value, errors } = validateQkd(req.body);
    if (errors.length) throw new HttpError(422, 'Invalid QKD parameters', errors);
    const out = await callPython({ cmd: 'qkd', ...value });
    const doc = await QkdRun.create({ owner: req.user.id, params: value, ...out });
    res.status(201).json(publicDoc(doc));
  }));

  api.get('/qkd/runs', ah(async (req, res) => {
    res.json(await QkdRun.find({ owner: req.user.id }).sort({ createdAt: -1 }).limit(50).select('-transmission -owner -__v').lean());
  }));

  api.delete('/qkd/runs', ah(async (req, res) => {
    res.json({ deleted: (await QkdRun.deleteMany({ owner: req.user.id })).deletedCount });
  }));

  // ---- experiments A-D
  api.post('/experiments/run', ah(async (req, res) => {
    const owner = req.user.id;
    const { value, errors } = validateExperiment(req.body);
    if (errors.length) throw new HttpError(422, 'Invalid experiment parameters', errors);
    if (await Experiment.exists({ owner, status: 'running' })) throw new HttpError(409, 'An experiment batch is already running');
    const doc = await Experiment.create({ owner, params: value });
    runExperimentJob(doc._id, value); // intentionally not awaited
    res.status(202).json(publicDoc(doc));
  }));

  api.get('/experiments/latest', ah(async (req, res) => {
    const owner = req.user.id;
    const find = (status) => Experiment.findOne({ owner, status }).sort({ createdAt: -1 }).select('-owner -__v').lean();
    const [running, done, failed] = await Promise.all([find('running'), find('done'), find('failed')]);
    res.json({ running, done, lastFailure: failed && (!done || failed.createdAt > done.createdAt) ? failed : null });
  }));

  api.use((req, _res, next) => next(new HttpError(404, `No such endpoint: ${req.method} ${req.originalUrl}`)));
  app.use('/api', api);

  // Production: serve the built React client; unknown GET paths fall through to the SPA (client-side routes).
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    const spaHeaders = (res) => res.set('Content-Security-Policy', CSP);
    app.use(express.static(config.clientDist, { setHeaders: spaHeaders, index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      spaHeaders(res);
      return res.sendFile(path.join(config.clientDist, 'index.html'));
    });
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

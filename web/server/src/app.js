import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import mongoose from 'mongoose';
import { authRouter, loadSession, originCheck, requireAuth } from './auth.js';
import { config } from './config.js';
import { resetAssets, trimOwned } from './db.js';
import { ah, HttpError, makeLimiter } from './http.js';
import {
  Asset, Experiment, QkdRun, Subscriber, publicDoc, toPlainAsset,
} from './models.js';
import { callPython, getMeta, PythonError } from './python.js';
import {
  validateAsset, validateEmail, validateExperiment, validateHorizon, validateQkd,
} from './validate.js';

const subscribeLimiter = makeLimiter({ max: 10, windowMs: 3_600_000 });
function limitByIp(limiter) {
  return (req, _res, next) => {
    const key = req.ip || 'unknown';
    if (limiter.blocked(key)) return next(new HttpError(429, 'Too many attempts. Please try again later.'));
    limiter.hit(key);
    return next();
  };
}
/** Budget per signed-in user, so one account (or the public demo) cannot use up the server. */
function limitByUser(limiter, what) {
  return (req, _res, next) => {
    if (limiter.blocked(req.user.id)) return next(new HttpError(429, `You have reached the hourly limit for ${what}. Please try again later.`));
    limiter.hit(req.user.id);
    return next();
  };
}

// Every data query below is scoped by `owner = req.user.id`; there is no code path that reads without it.
async function currentAssets(owner) {
  const docs = await Asset.find({ owner }).sort({ id: 1 }).lean();
  return docs.map(toPlainAsset);
}

/** Record a batch's outcome. A database hiccup here must never become an unhandled rejection (it would kill the server). */
async function finishExperiment(id, update) {
  try {
    await Experiment.findByIdAndUpdate(id, update);
  } catch (e) {
    console.error(`[experiments] could not record the outcome of batch ${id}: ${e.message}`);
  }
}

/** Run an experiment batch in the background and record the outcome. Never throws. */
async function runExperimentJob(id, owner, params) {
  try {
    const result = await callPython({ cmd: 'experiments', ...params }, { timeoutMs: 15 * 60_000, userId: String(owner) });
    await finishExperiment(id, { status: 'done', result, finishedAt: new Date() });
  } catch (e) {
    console.error(`[experiments] batch ${id} failed: ${e.message}`);
    await finishExperiment(id, { status: 'failed', error: e.expose ? e.message : 'The experiment batch failed on the server.', finishedAt: new Date() });
  }
  try {
    await trimOwned(Experiment, owner, config.limits.keepExperiments, { status: { $ne: 'running' } });
  } catch (e) {
    console.error(`[experiments] retention cleanup failed: ${e.message}`);
  }
}

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
  + "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export function createApp({ clientDist = config.clientDist, limits = config.limits } = {}) {
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
  app.use(compression());

  // One line per API call: method, path (no query string, no body), status, time, short user id.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path === '/api/health') return next();
    const started = Date.now();
    res.on('finish', () => {
      const line = { m: req.method, p: req.path, s: res.statusCode, ms: Date.now() - started, u: req.user ? req.user.id.slice(-6) : '-' };
      console.log(config.isProd ? `[http] ${JSON.stringify(line)}` : `[http] ${line.m} ${line.p} ${line.s} ${line.ms}ms user=${line.u}`);
    });
    return next();
  });
  app.use(express.json({ limit: '100kb' }));

  const riskLimiter = makeLimiter({ max: limits.riskPer15Min, windowMs: 15 * 60_000 });
  const qkdLimiter = makeLimiter({ max: limits.qkdPerHour, windowMs: 3_600_000 });
  const experimentLimiter = makeLimiter({ max: limits.experimentsPerHour, windowMs: 3_600_000 });

  const api = express.Router();
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(originCheck);

  // Registered BEFORE the session loader: a health check must answer even when the database is down and must
  // never wait on it. 503 tells the platform to restart a broken instance.
  api.get('/health', (_req, res) => {
    const ok = mongoose.connection.readyState === 1;
    res.status(ok ? 200 : 503).json({ ok, db: ok ? 'connected' : 'disconnected' });
  });

  api.use(loadSession);

  // ------------------------------------------------------------------ public routes
  api.post('/subscribe', limitByIp(subscribeLimiter), ah(async (req, res) => {
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

  // Anyone can remove an address from the pilot list (it only ever deletes a stored email).
  api.post('/subscribe/remove', limitByIp(subscribeLimiter), ah(async (req, res) => {
    const { value: email, errors } = validateEmail(req.body);
    if (errors.length) throw new HttpError(422, errors[0]);
    const { deletedCount } = await Subscriber.deleteOne({ email });
    res.json({ ok: true, removed: deletedCount > 0 });
  }));

  api.use('/auth', authRouter(limits));

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
    try {
      res.status(201).json(toPlainAsset(await Asset.create({ ...value, owner })));
    } catch (e) {
      // The unique (owner, id) index is the real guard; two simultaneous requests cannot both pass a check-then-insert.
      if (e.code === 11000) throw new HttpError(409, `Asset ${value.id} already exists`);
      throw e;
    }
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
  api.get('/risk', limitByUser(riskLimiter, 'risk assessments'), ah(async (req, res) => {
    const { value: horizon, errors } = validateHorizon(req.query.horizon);
    if (errors.length) throw new HttpError(422, errors[0]);
    const assets = await currentAssets(req.user.id);
    if (!assets.length) throw new HttpError(409, 'The inventory is empty; add an asset or reset to the sample inventory');
    res.json(await callPython({ cmd: 'risk', assets, horizon }, { userId: req.user.id }));
  }));

  api.get('/risk/sweep', limitByUser(riskLimiter, 'risk assessments'), ah(async (req, res) => {
    const assets = await currentAssets(req.user.id);
    if (!assets.length) throw new HttpError(409, 'The inventory is empty');
    res.json(await callPython({ cmd: 'sweep', assets }, { userId: req.user.id }));
  }));

  // ---- QKD
  api.post('/qkd/run', limitByUser(qkdLimiter, 'QKD simulations'), ah(async (req, res) => {
    const { value, errors } = validateQkd(req.body);
    if (errors.length) throw new HttpError(422, 'Invalid QKD parameters', errors);
    const out = await callPython({ cmd: 'qkd', ...value }, { userId: req.user.id });
    const doc = await QkdRun.create({ owner: req.user.id, params: value, ...out });
    await trimOwned(QkdRun, req.user.id, limits.keepQkdRuns);
    res.status(201).json(publicDoc(doc));
  }));

  api.get('/qkd/runs', ah(async (req, res) => {
    res.json(await QkdRun.find({ owner: req.user.id }).sort({ createdAt: -1 }).limit(50).select('-transmission -owner -__v').lean());
  }));

  api.delete('/qkd/runs', ah(async (req, res) => {
    res.json({ deleted: (await QkdRun.deleteMany({ owner: req.user.id })).deletedCount });
  }));

  // ---- experiments A-D
  api.post('/experiments/run', limitByUser(experimentLimiter, 'experiment batches'), ah(async (req, res) => {
    const owner = req.user.id;
    const { value, errors } = validateExperiment(req.body);
    if (errors.length) throw new HttpError(422, 'Invalid experiment parameters', errors);
    let doc;
    try {
      // A partial unique index allows only one running batch per user, so simultaneous requests cannot both start one.
      doc = await Experiment.create({ owner, params: value });
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'An experiment batch is already running');
      throw e;
    }
    runExperimentJob(doc._id, owner, value); // intentionally not awaited; it never throws
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

  // ------------------------------------------------------------------ the built React app
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    const indexFile = path.join(clientDist, 'index.html');
    const withCsp = (res) => res.set('Content-Security-Policy', CSP);
    app.use(express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        withCsp(res);
        // Vite names bundles by content hash, so they can be cached for a year; everything else is revalidated.
        res.set('Cache-Control', /[\\/]assets[\\/]/.test(filePath) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
      },
    }));
    // Client-side routes (/login, /dashboard/risk, ...) get index.html. A path with a file extension that was not
    // found above is a genuinely missing file and must be a 404, not a 200 page of HTML.
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || path.extname(req.path)) return next();
      withCsp(res);
      res.set('Cache-Control', 'no-cache');
      return res.sendFile(indexFile);
    });
  }
  app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err instanceof PythonError) {
      if (err.expose) return res.status(err.status).json({ error: err.message });
      console.error(`[python] ${err.message}`); // paths and stack traces stay in the server log
      return res.status(500).json({ error: 'The calculation engine failed. Please try again.' });
    }
    if (err.code === 11000) return res.status(409).json({ error: 'That already exists.' });
    if (err.name === 'ValidationError') return res.status(422).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

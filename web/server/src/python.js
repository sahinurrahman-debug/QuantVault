import { spawn } from 'node:child_process';
import { config, REPO_ROOT } from './config.js';

/**
 * `expose` marks messages that are safe to show a client (bad input, busy server).
 * Everything else is logged on the server and replaced by a generic message, so file paths and
 * stack traces never reach the browser.
 */
export class PythonError extends Error {
  constructor(message, status = 500, { expose = false } = {}) {
    super(message);
    this.name = 'PythonError';
    this.status = status;
    this.expose = expose;
  }
}

// ------------------------------------------------------------------ scheduling
// Two lanes, so a long simulation can never block a quick dashboard request:
//   light - meta / risk / sweep: pure Python, no Qiskit, ~0.4 s each
//   heavy - qkd / experiments: import Qiskit and use real CPU and memory
// Inside the heavy lane an interactive QKD run is served before a queued experiment batch.
const LANES = {
  light: { max: () => config.pythonConcurrency, maxQueue: 60, perUser: 8, active: 0, queue: [], users: new Map() },
  heavy: { max: () => config.pythonHeavyConcurrency, maxQueue: 8, perUser: 2, active: 0, queue: [], users: new Map() },
};
const PRIORITY = { qkd: 0, experiments: 1 };
const laneOf = (cmd) => (cmd === 'qkd' || cmd === 'experiments' ? 'heavy' : 'light');

function userCount(lane, userId, delta) {
  const n = (lane.users.get(userId) || 0) + delta;
  if (n <= 0) lane.users.delete(userId); else lane.users.set(userId, n);
}

function acquire(lane, userId, priority) {
  if (userId && (lane.users.get(userId) || 0) >= lane.perUser) {
    throw new PythonError('You already have the maximum number of jobs running. Please wait for one to finish.', 429, { expose: true });
  }
  if (lane.active >= lane.max() && lane.queue.length >= lane.maxQueue) {
    throw new PythonError('The server is busy right now. Please try again in a moment.', 503, { expose: true });
  }
  if (userId) userCount(lane, userId, +1);
  if (lane.active < lane.max()) { lane.active += 1; return Promise.resolve(); }
  return new Promise((resolve) => {
    lane.queue.push({ resolve, priority });
    lane.queue.sort((a, b) => a.priority - b.priority); // stable: FIFO within a priority
  });
}

function release(lane, userId) {
  if (userId) userCount(lane, userId, -1);
  const next = lane.queue.shift();
  if (next) next.resolve(); else lane.active -= 1;
}

// ------------------------------------------------------------------ running one job
// The child only gets what it needs. In particular it must NOT inherit MONGODB_URI or other secrets.
const ENV_ALLOWLIST = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE',
  'LANG', 'LC_ALL', 'OMP_NUM_THREADS', 'PYTHONUTF8'];
export function childEnv() {
  const env = { PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
  for (const k of ENV_ALLOWLIST) if (process.env[k] !== undefined) env[k] = process.env[k];
  return env;
}

function run(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.python, ['-m', 'src.bridge'], { cwd: REPO_ROOT, env: childEnv(), windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => {
      child.kill();
      done(reject, new PythonError(`Python bridge timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => done(reject, new PythonError(`Cannot start Python (${config.python}): ${e.message}`)));
    child.on('close', () => {
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return done(reject, new PythonError(`Python bridge returned invalid output: ${(stderr || stdout).slice(-400)}`));
      }
      if (!parsed.ok) {
        const bad = String(parsed.error).startsWith('ValueError');
        return done(reject, new PythonError(parsed.error, bad ? 422 : 500, { expose: bad }));
      }
      return done(resolve, parsed.data);
    });
    child.stdin.on('error', () => {}); // the process may exit before reading stdin
    child.stdin.end(JSON.stringify(request));
  });
}

/**
 * Send one request to ``python -m src.bridge`` and resolve with its ``data``.
 * `userId` enables the per-user cap on concurrent jobs; the queue wait is not counted against `timeoutMs`.
 */
export async function callPython(request, { timeoutMs = config.pythonTimeoutMs, userId = null } = {}) {
  const lane = LANES[laneOf(request.cmd)];
  await acquire(lane, userId, PRIORITY[request.cmd] ?? 0);
  try {
    return await run(request, timeoutMs);
  } finally {
    release(lane, userId);
  }
}

/** Current queue depth, for logs and tests. */
export function schedulerStats() {
  return Object.fromEntries(Object.entries(LANES).map(([k, l]) => [k, { active: l.active, queued: l.queue.length }]));
}

let metaPromise = null;
/** Algorithm catalogue, enums and static content; fetched once per process. */
export function getMeta() {
  if (!metaPromise) {
    metaPromise = callPython({ cmd: 'meta' }).catch((e) => { metaPromise = null; throw e; });
  }
  return metaPromise;
}

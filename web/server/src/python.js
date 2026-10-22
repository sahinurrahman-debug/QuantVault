import { spawn } from 'node:child_process';
import { config, REPO_ROOT } from './config.js';

export class PythonError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'PythonError';
    this.status = status;
  }
}

// Qiskit start-up is heavy, so cap how many Python processes run at once.
let active = 0;
const waiting = [];
const acquire = () => new Promise((resolve) => {
  if (active < config.pythonConcurrency) { active += 1; resolve(); } else waiting.push(resolve);
});
const release = () => {
  const next = waiting.shift();
  if (next) next(); else active -= 1;
};

function run(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.python, ['-m', 'src.bridge'], {
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new PythonError(`Python bridge timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new PythonError(`Cannot start Python (${config.python}): ${e.message}`));
    });
    child.on('close', () => {
      clearTimeout(timer);
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return reject(new PythonError(`Python bridge returned invalid output: ${(stderr || stdout).slice(-400)}`));
      }
      if (!parsed.ok) {
        const status = String(parsed.error).startsWith('ValueError') ? 422 : 500;
        return reject(new PythonError(parsed.error, status));
      }
      return resolve(parsed.data);
    });
    child.stdin.on('error', () => {}); // process may exit before reading stdin
    child.stdin.end(JSON.stringify(request));
  });
}

/** Send one request to ``python -m src.bridge`` and resolve with its ``data``. */
export async function callPython(request, timeoutMs = config.pythonTimeoutMs) {
  await acquire();
  try {
    return await run(request, timeoutMs);
  } finally {
    release();
  }
}

let metaPromise = null;
/** Algorithm catalogue, enums and static content; fetched once per process. */
export function getMeta() {
  if (!metaPromise) {
    metaPromise = callPython({ cmd: 'meta' }).catch((e) => { metaPromise = null; throw e; });
  }
  return metaPromise;
}

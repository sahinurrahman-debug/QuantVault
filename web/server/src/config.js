import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// web/server/src -> repository root
export const REPO_ROOT = path.resolve(here, '../../..');

function findPython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = process.platform === 'win32'
    ? path.join(REPO_ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(REPO_ROOT, '.venv', 'bin', 'python');
  if (fs.existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  // Opt-in only: a throw-away local database instead of MongoDB Atlas (see connectDb).
  useLocalDb: process.env.USE_LOCAL_DB === 'true',
  isProd: process.env.NODE_ENV === 'production',
  python: findPython(),
  pythonTimeoutMs: Number(process.env.PYTHON_TIMEOUT_MS) || 180_000,
  // Light lane (risk, sweep, meta): cheap, many at once. Heavy lane (qkd, experiments): imports Qiskit, so keep it small.
  pythonConcurrency: Number(process.env.PYTHON_CONCURRENCY) || 2,
  pythonHeavyConcurrency: Number(process.env.PYTHON_HEAVY_CONCURRENCY) || 1,
  inventoryPath: path.join(REPO_ROOT, 'data', 'inventory.json'),
  dataDir: path.resolve(here, '..', '.data'),
  clientDist: path.resolve(here, '..', '..', 'client', 'dist'),
  maxAssets: 200,
  // Sessions: opaque random token in an httpOnly cookie; only its SHA-256 is stored server-side.
  sessionDays: 7,
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  authMaxFailures: Number(process.env.AUTH_MAX_FAILURES) || 8,
  // Public demo account for reviewers (credentials are shown on the sign-in page). Disable with DEMO_ACCOUNT=false.
  // Per-user and per-IP budgets that keep one visitor from using up the server.
  limits: {
    qkdPerHour: 40, experimentsPerHour: 8, riskPer15Min: 1500,
    signupsPerHourPerIp: Number(process.env.RL_SIGNUPS_PER_HOUR) || 10,
    failuresPer15MinPerIp: Number(process.env.RL_FAILURES_PER_15MIN) || 60,
    keepQkdRuns: 50, keepExperiments: 5, maxSessionsPerUser: 10,
  },
  demo: {
    sandboxHours: 24, maxSandboxes: 300,
    enabled: process.env.DEMO_ACCOUNT !== 'false',
    email: (process.env.DEMO_EMAIL || 'demo@quantvault.app').toLowerCase(),
    password: process.env.DEMO_PASSWORD || 'DemoPass-2026!',
  },
};

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
  isProd: process.env.NODE_ENV === 'production',
  python: findPython(),
  pythonTimeoutMs: Number(process.env.PYTHON_TIMEOUT_MS) || 180_000,
  pythonConcurrency: Number(process.env.PYTHON_CONCURRENCY) || 2,
  inventoryPath: path.join(REPO_ROOT, 'data', 'inventory.json'),
  dataDir: path.resolve(here, '..', '.data'),
  clientDist: path.resolve(here, '..', '..', 'client', 'dist'),
  maxAssets: 200,
};

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Guard against committing secrets. It reads every file git would add (tracked, or untracked and not
// ignored) and fails if any contains a connection string with an embedded password, or if a real env file
// would be committed. The pattern is assembled from pieces so this file does not match itself.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CREDENTIALED_URI = new RegExp(['mongodb(\\+srv)?:', '\\/\\/', '[^\\s:/@]+', ':', '[^\\s@]+', '@'].join(''));

function committableFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\n').filter(Boolean);
  } catch {
    return null; // not a git checkout (for example inside the Docker image): nothing to check
  }
}

describe('secrets never reach git', () => {
  const files = committableFiles();
  const skip = files === null ? 'git is not available here' : false;

  it('no committable file contains a connection string with a password', { skip }, () => {
    const offenders = [];
    for (const rel of files) {
      if (/\.(png|jpg|jpeg|gif|ico|woff2?|pdf|zip)$/i.test(rel) || /(^|\/)package-lock\.json$/.test(rel)) continue;
      const abs = path.join(REPO, rel);
      if (!fs.existsSync(abs) || fs.statSync(abs).size > 5 * 1024 * 1024) continue;
      const lines = fs.readFileSync(abs, 'utf8').split('\n');
      lines.forEach((line, i) => { if (CREDENTIALED_URI.test(line)) offenders.push(`${rel}:${i + 1}`); });
    }
    assert.deepEqual(offenders, [], `credentialed connection string found in: ${offenders.join(', ')}`);
  });

  it('real env files are ignored; only the .env.example template may be committed', { skip }, () => {
    const envLike = files.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example'));
    assert.deepEqual(envLike, [], `env files would be committed: ${envLike.join(', ')}`);
  });
});

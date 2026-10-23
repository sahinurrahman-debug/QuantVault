#!/usr/bin/env node
// One-time setup: ask for the MongoDB Atlas connection string, test it, and save it to web/server/.env
// (git-ignored). After this, `npm run dev` and `npm start` connect to Atlas automatically on every machine
// that has the same .env.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const DEFAULT_DB = 'quantvault';

const describe = (uri) => {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/?([^?]*)/.exec(uri);
  return m ? `${m[1]}${m[2] ? `/${m[2]}` : ''}` : 'unknown host';
};

/** Read one line; the typed/pasted text is not echoed when running in a real terminal. */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const interactive = Boolean(process.stdin.isTTY);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
    let muted = false;
    rl._writeToOutput = (text) => { if (!muted) process.stdout.write(text); };
    process.stdout.write(prompt);
    muted = interactive;
    rl.question('', (answer) => {
      rl.close();
      if (interactive) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

function normalise(raw) {
  let uri = raw.replace(/^["']|["']$/g, '');
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) throw new Error('The string must start with mongodb+srv:// (or mongodb://).');
  if (/<[^>]*password[^>]*>/i.test(uri) || uri.includes('<') || uri.includes('>')) {
    throw new Error('It still contains a <placeholder>. Replace <db_password> with the real password (no angle brackets).');
  }
  // Make sure a database name is present: mongodb+srv://user:pass@host[/db][?options]
  uri = uri.replace(/^(mongodb(?:\+srv)?:\/\/[^/?]+)\/?(\?|$)/, `$1/${DEFAULT_DB}$2`);
  return uri;
}

function explain(err) {
  const msg = String(err.message || err);
  if (/bad auth|authentication failed/i.test(msg)) {
    return 'Authentication failed. The username or password is wrong (symbols such as @ : / ? # % must be URL-encoded).\n'
      + '  Easiest fix: in Atlas > Database Access, set a new password using letters and digits only.';
  }
  if (/ReplicaSetNoPrimary|Server selection timed out|MongoServerSelectionError/i.test(msg)) {
    return 'Could not reach the cluster. In Atlas > Network Access, add your current IP address\n'
      + '  (or 0.0.0.0/0 so that every machine can connect), then try again.';
  }
  if (/querySrv|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    return 'The host name could not be resolved. Check the string for typos, or use the standard (non-SRV) connection string\n'
      + '  from Atlas > Connect > Drivers if your network blocks "mongodb+srv" lookups.';
  }
  return msg;
}

function saveEnv(uri) {
  const line = `MONGODB_URI=${uri}`;
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  text = /^MONGODB_URI=.*$/m.test(text)
    ? text.replace(/^MONGODB_URI=.*$/m, () => line)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
}

async function main() {
  console.log('\nQuantVault: connect to MongoDB Atlas\n');
  console.log('In Atlas: Database > Connect > Drivers > Node.js, copy the connection string, and replace <db_password>');
  console.log('with your real password. It is typed hidden and is saved only in web/server/.env (never committed).\n');

  const raw = await askHidden('Paste your MongoDB connection string: ');
  if (!raw) throw new Error('Nothing was entered.');
  const uri = normalise(raw);

  console.log(`\nTesting the connection to ${describe(uri)} ...`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  await mongoose.connection.db.admin().ping();
  await mongoose.disconnect();

  saveEnv(uri);
  console.log(`\nConnected. Saved to ${path.relative(process.cwd(), ENV_PATH) || '.env'}`);
  console.log('From now on, "npm run dev" and "npm start" use this shared database automatically.');
  console.log('Copy the same .env file (or run this command) on any other machine to use the same data.\n');
}

main().catch(async (err) => {
  console.error(`\nSetup failed: ${explain(err)}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

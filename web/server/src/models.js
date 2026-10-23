import mongoose from 'mongoose';

const { Schema } = mongoose;

// ---------------------------------------------------------------------- accounts
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true }, // scrypt; never sent to a client
  isDemo: { type: Boolean, default: false },       // the public demo "gateway": it owns no data, signing in creates a sandbox
  isSandbox: { type: Boolean, default: false },    // a throw-away demo workspace created by one demo sign-in
  sandboxExpiresAt: { type: Date },
}, { timestamps: true });
userSchema.index({ isSandbox: 1, sandboxExpiresAt: 1 });

// Server-side session. The cookie holds a random token; only its SHA-256 is stored here,
// so a database leak does not expose usable session tokens. MongoDB deletes expired rows (TTL).
const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  lastSeen: { type: Date, default: Date.now },
  userAgent: { type: String, default: '' },
}, { timestamps: true });

// ---------------------------------------------------------------------- user-owned data
// Every document below carries `owner`; every query in the API filters by it.
const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true };

// One cryptographic asset. Algorithm ids are defined in src/algorithms.py;
// `null` = role not applicable, "UNKNOWN" = not inventoried (scored conservatively).
const assetSchema = new Schema({
  owner,
  id: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, default: '' },
  protocol: { type: String, default: '' },
  key_establishment: { type: String, default: null },
  signature: { type: String, default: null },
  symmetric: { type: String, default: null },
  hash: { type: String, default: null },
  forward_secrecy: { type: Boolean, default: null },
  confidentiality_years: { type: Number, default: 0, min: 0 },
  integrity_years: { type: Number, default: 0, min: 0 },
  migration_years: { type: Number, required: true, min: 0 },
  sensitivity: { type: String, required: true },
  exposure: { type: String, required: true },
  migration_difficulty: { type: String, required: true },
  link_type: { type: String, default: 'internal' },
  notes: { type: String, default: '' },
}, { timestamps: true });
assetSchema.index({ owner: 1, id: 1 }, { unique: true }); // asset ids are unique per user, not globally

// One simulated BB84 run (parameters, summary statistics and the first qubits).
const qkdRunSchema = new Schema({
  owner,
  params: { type: Schema.Types.Mixed, required: true },
  summary: { type: Schema.Types.Mixed, required: true },
  security: { type: Schema.Types.Mixed },
  transmission: { type: Schema.Types.Mixed },
  key_preview: { type: String, default: '' },
}, { timestamps: true });

// A batch of experiments A-D (long-running, so it has a status).
const experimentSchema = new Schema({
  owner: { ...owner, index: false }, // indexed below (a plain owner index would clash with the partial unique one)
  status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
  params: { type: Schema.Types.Mixed, required: true },
  result: { type: Schema.Types.Mixed, default: null },
  error: { type: String, default: '' },
  finishedAt: { type: Date },
}, { timestamps: true });
// At most ONE running batch per user, enforced by the database (a check-then-insert in code can race).
experimentSchema.index({ owner: 1 }, { name: 'one_running_batch_per_owner', unique: true, partialFilterExpression: { status: 'running' } });
experimentSchema.index({ owner: 1, createdAt: -1 });

// Email addresses collected by the landing-page pilot-list form (never exposed by any endpoint).
const subscriberSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  consentAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export const Asset = mongoose.models.Asset || mongoose.model('Asset', assetSchema);
export const QkdRun = mongoose.models.QkdRun || mongoose.model('QkdRun', qkdRunSchema);
export const Experiment = mongoose.models.Experiment || mongoose.model('Experiment', experimentSchema);
export const Subscriber = mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema);

/** Build indexes and drop any that no longer match the schemas (e.g. the old global asset-id index). */
export async function ensureIndexes() {
  await Promise.all([User, Session, Asset, QkdRun, Experiment, Subscriber].map((m) => m.syncIndexes()));
}

/** Plain object in the shape the Python engine expects (no ownership or bookkeeping fields). */
export function toPlainAsset(doc) {
  const { _id, __v, createdAt, updatedAt, owner: _owner, ...rest } = doc.toObject ? doc.toObject() : doc;
  return rest;
}

/** A document as sent to its owner: no internal owner id. */
export function publicDoc(doc) {
  const { owner: _owner, __v, ...rest } = doc.toObject ? doc.toObject() : doc;
  return rest;
}

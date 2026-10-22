import mongoose from 'mongoose';

const { Schema } = mongoose;

// One cryptographic asset. Algorithm ids are defined in src/algorithms.py;
// `null` = role not applicable, "UNKNOWN" = not inventoried (scored conservatively).
const assetSchema = new Schema({
  id: { type: String, required: true, unique: true, trim: true },
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

// One simulated BB84 run (parameters, summary statistics and the first qubits).
const qkdRunSchema = new Schema({
  params: { type: Schema.Types.Mixed, required: true },
  summary: { type: Schema.Types.Mixed, required: true },
  security: { type: Schema.Types.Mixed },
  transmission: { type: Schema.Types.Mixed },
  key_preview: { type: String, default: '' },
}, { timestamps: true });

// A batch of experiments A-D (long-running, so it has a status).
const experimentSchema = new Schema({
  status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
  params: { type: Schema.Types.Mixed, required: true },
  result: { type: Schema.Types.Mixed, default: null },
  error: { type: String, default: '' },
  finishedAt: { type: Date },
}, { timestamps: true });

export const Asset = mongoose.models.Asset || mongoose.model('Asset', assetSchema);
export const QkdRun = mongoose.models.QkdRun || mongoose.model('QkdRun', qkdRunSchema);
export const Experiment = mongoose.models.Experiment || mongoose.model('Experiment', experimentSchema);

/** Plain object in the shape the Python engine expects. */
export function toPlainAsset(doc) {
  const { _id, __v, createdAt, updatedAt, ...rest } = doc.toObject ? doc.toObject() : doc;
  return rest;
}

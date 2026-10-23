// Request validation. Returns { value, errors } and never throws.

const ROLE_FIELDS = ['key_establishment', 'signature', 'symmetric', 'hash'];
const ID_RE = /^[A-Za-z0-9_-]{1,16}$/;

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const str = (v, max) => typeof v === 'string' && v.length <= max;

function num(errors, field, v, lo, hi) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
    errors.push(`${field} must be a number between ${lo} and ${hi}`);
    return null;
  }
  return v;
}

/** Validate an inventory asset against the Python catalogue (`meta`). */
export function validateAsset(body, meta, { requireId = true } = {}) {
  const errors = [];
  if (!isObj(body)) return { value: null, errors: ['body must be a JSON object'] };
  const value = {};

  if (requireId || body.id !== undefined) {
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) errors.push('id must be 1-16 characters: letters, digits, - or _');
    else value.id = body.id;
  }
  if (!str(body.name, 120) || !body.name.trim()) errors.push('name is required (max 120 characters)');
  else value.name = body.name.trim();
  for (const f of ['category', 'protocol']) {
    if (body[f] !== undefined && !str(body[f], 120)) errors.push(`${f} must be text up to 120 characters`);
    else value[f] = body[f] ?? '';
  }
  if (body.notes !== undefined && !str(body.notes, 500)) errors.push('notes must be text up to 500 characters');
  else value.notes = body.notes ?? '';

  // null = role not applicable; "UNKNOWN" = not inventoried; otherwise a catalogue id for that role.
  for (const role of ROLE_FIELDS) {
    const v = body[role] === '' ? null : (body[role] ?? null);
    const ok = v === null || v === 'UNKNOWN'
      || (typeof v === 'string' && meta.algorithms[v] && meta.algorithms[v].role === role);
    if (!ok) errors.push(`${role} must be null, "UNKNOWN" or a known ${role.replace('_', ' ')} algorithm id`);
    else value[role] = v;
  }

  if (body.forward_secrecy !== undefined && body.forward_secrecy !== null && typeof body.forward_secrecy !== 'boolean') {
    errors.push('forward_secrecy must be true, false or null');
  } else value.forward_secrecy = body.forward_secrecy ?? null;

  value.confidentiality_years = num(errors, 'confidentiality_years', body.confidentiality_years ?? 0, 0, 100);
  value.integrity_years = num(errors, 'integrity_years', body.integrity_years ?? 0, 0, 100);
  value.migration_years = num(errors, 'migration_years', body.migration_years, 0, 30);

  const enums = [['sensitivity', meta.sensitivity], ['exposure', meta.exposure],
    ['migration_difficulty', meta.migration_difficulty], ['link_type', meta.link_types]];
  for (const [f, allowed] of enums) {
    if (!allowed.includes(body[f])) errors.push(`${f} must be one of: ${allowed.join(', ')}`);
    else value[f] = body[f];
  }
  return { value, errors };
}

export function validateHorizon(raw) {
  if (raw === undefined) return { value: 15, errors: [] };
  const z = Number(raw);
  if (!Number.isFinite(z) || z < 1 || z > 100) return { value: null, errors: ['horizon must be a number between 1 and 100'] };
  return { value: z, errors: [] };
}

const NOISE = ['none', 'bitflip', 'depolarizing', 'readout'];

export function validateQkd(body) {
  const errors = [];
  if (!isObj(body)) return { value: null, errors: ['body must be a JSON object'] };
  const value = {
    n_qubits: body.n_qubits ?? 2048,
    eve_enabled: body.eve_enabled ?? false,
    eve_fraction: body.eve_fraction ?? 1,
    noise_model: body.noise_model ?? 'none',
    noise_p: body.noise_p ?? 0,
    sample_fraction: body.sample_fraction ?? 0.25,
    max_qber: body.max_qber ?? 0.11,
  };
  if (!Number.isInteger(value.n_qubits) || value.n_qubits < 64 || value.n_qubits > 8192) errors.push('n_qubits must be an integer between 64 and 8192');
  if (typeof value.eve_enabled !== 'boolean') errors.push('eve_enabled must be a boolean');
  num(errors, 'eve_fraction', value.eve_fraction, 0, 1);
  if (!NOISE.includes(value.noise_model)) errors.push(`noise_model must be one of: ${NOISE.join(', ')}`);
  num(errors, 'noise_p', value.noise_p, 0, 0.5);
  num(errors, 'sample_fraction', value.sample_fraction, 0.05, 0.5);
  num(errors, 'max_qber', value.max_qber, 0.01, 0.25);
  if (body.seed !== undefined && body.seed !== null) {
    if (!Number.isInteger(body.seed) || body.seed < 0 || body.seed > 2 ** 31 - 1) errors.push('seed must be a non-negative integer');
    else value.seed = body.seed;
  }
  return { value, errors };
}

export function validateExperiment(body) {
  const errors = [];
  const value = { n_qubits: body?.n_qubits ?? 2048, reps: body?.reps ?? 3 };
  if (!Number.isInteger(value.n_qubits) || value.n_qubits < 256 || value.n_qubits > 4096) errors.push('n_qubits must be an integer between 256 and 4096');
  if (!Number.isInteger(value.reps) || value.reps < 1 || value.reps > 10) errors.push('reps must be an integer between 1 and 10');
  return { value, errors };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { value: null, errors: ['Please enter a valid email address'] };
  return { value: email, errors: [] };
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

function checkEmail(raw) {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return email && email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function validateSignup(body) {
  const errors = [];
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) errors.push('Enter your name (up to 80 characters)');
  const email = checkEmail(body?.email);
  if (!email) errors.push('Enter a valid email address');
  const password = body?.password;
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    errors.push(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
  }
  return { value: errors.length ? null : { name, email, password }, errors };
}

export function validateLogin(body) {
  const email = checkEmail(body?.email);
  const password = body?.password;
  if (!email || typeof password !== 'string' || !password || password.length > PASSWORD_MAX) {
    return { value: null, errors: ['Enter your email and password'] };
  }
  return { value: { email, password }, errors: [] };
}

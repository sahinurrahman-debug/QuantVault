export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wrap an async route handler so rejections reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Sliding-window counter kept in memory (fine for a single instance). */
export function makeLimiter({ max, windowMs }) {
  const hits = new Map();
  const prune = (key, now) => {
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length) hits.set(key, recent); else hits.delete(key);
    return recent;
  };
  return {
    /** True when `key` has already used up its budget. */
    blocked(key) { return prune(key, Date.now()).length >= max; },
    /** Record one event for `key`. */
    hit(key) {
      const now = Date.now();
      const recent = prune(key, now);
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) { for (const k of hits.keys()) prune(k, now); }
    },
    reset(key) { hits.delete(key); },
  };
}

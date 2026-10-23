// Thin fetch wrapper around the Express API. The session cookie is httpOnly, so it is sent by the
// browser automatically (same origin) and is never visible to this code.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    // A 401 outside the sign-in forms means the session is gone: let the app sign the user out.
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('qv:unauthorized'));
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/health'),
  // auth
  me: () => request('/auth/me'),
  signup: (name, email, password) => request('/auth/signup', { method: 'POST', body: { name, email, password } }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  demoInfo: () => request('/auth/demo'),
  // data (all require a session)
  meta: () => request('/meta'),
  assets: () => request('/assets'),
  createAsset: (a) => request('/assets', { method: 'POST', body: a }),
  updateAsset: (id, a) => request(`/assets/${encodeURIComponent(id)}`, { method: 'PUT', body: a }),
  deleteAsset: (id) => request(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resetAssets: () => request('/assets/reset', { method: 'POST' }),
  risk: (horizon) => request(`/risk?horizon=${horizon}`),
  sweep: () => request('/risk/sweep'),
  runQkd: (params) => request('/qkd/run', { method: 'POST', body: params }),
  qkdRuns: () => request('/qkd/runs'),
  clearQkdRuns: () => request('/qkd/runs', { method: 'DELETE' }),
  runExperiments: (params) => request('/experiments/run', { method: 'POST', body: params }),
  latestExperiments: () => request('/experiments/latest'),
  // public
  subscribe: (email) => request('/subscribe', { method: 'POST', body: { email } }),
};

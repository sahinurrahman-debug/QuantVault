// Thin fetch wrapper around the Express API.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/health'),
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
};

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { IconDatabase } from '../components/Icons.jsx';
import { Card, EmptyState, ErrorBox, Skeleton } from '../components/ui.jsx';

const BLANK = {
  id: '', name: '', category: '', protocol: '', key_establishment: 'UNKNOWN', signature: null, symmetric: null, hash: null,
  forward_secrecy: null, confidentiality_years: 10, integrity_years: 0, migration_years: 3,
  sensitivity: 'confidential', exposure: 'internal', migration_difficulty: 'medium', link_type: 'internal', notes: '',
};

const titleCase = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const ROLES = [['key_establishment', 'Key Establishment'], ['signature', 'Signature'], ['symmetric', 'Symmetric Cipher'], ['hash', 'Hash']];

function AlgoSelect({ role, label, value, meta, onChange }) {
  const options = Object.entries(meta.algorithms).filter(([, a]) => a.role === role);
  return (
    <label>{label}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        <option value="">Not Applicable</option>
        <option value="UNKNOWN">Unknown (Not Inventoried)</option>
        {options.map(([id, a]) => <option key={id} value={id}>{id} — {a.family}</option>)}
      </select>
    </label>
  );
}

function AssetForm({ initial, meta, editing, onSaved, onCancel }) {
  const [a, setA] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setA((p) => ({ ...p, [k]: v }));
  const text = (k, label, props = {}) => (
    <label>{label}<input type="text" value={a[k] ?? ''} onChange={(e) => set(k)(e.target.value)} {...props} /></label>
  );
  const number = (k, label, max) => (
    <label>{label}<input type="number" min="0" max={max} step="1" value={a[k]} onChange={(e) => set(k)(e.target.value === '' ? '' : Number(e.target.value))} /></label>
  );
  const choice = (k, label, options) => (
    <label>{label}<select value={a[k]} onChange={(e) => set(k)(e.target.value)}>{options.map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}</select></label>
  );

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = editing ? await api.updateAsset(a.id, a) : await api.createAsset(a);
      onSaved(saved);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={editing ? `Edit ${a.id}` : 'Add Asset'} lead="Choose each algorithm from the catalogue.">
      <form onSubmit={submit}>
        <div className="form">
          {text('id', 'ID (e.g. A14)', { disabled: editing, required: true, maxLength: 16 })}
          {text('name', 'Name', { required: true, maxLength: 120 })}
          {text('category', 'Category', { maxLength: 120 })}
          {text('protocol', 'Protocol', { maxLength: 120 })}
          {ROLES.map(([role, label]) => <AlgoSelect key={role} role={role} label={label} value={a[role]} meta={meta} onChange={set(role)} />)}
          <label>Forward Secrecy
            <select value={a.forward_secrecy === null ? '' : String(a.forward_secrecy)} onChange={(e) => set('forward_secrecy')(e.target.value === '' ? null : e.target.value === 'true')}>
              <option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option>
            </select>
          </label>
          {number('confidentiality_years', 'Confidentiality Lifetime X (Years)', 100)}
          {number('integrity_years', 'Signature-Trust Lifetime (Years)', 100)}
          {number('migration_years', 'Migration Time Y (Years)', 30)}
          {choice('sensitivity', 'Sensitivity', meta.sensitivity)}
          {choice('exposure', 'External Exposure', meta.exposure)}
          {choice('migration_difficulty', 'Migration Difficulty', meta.migration_difficulty)}
          {choice('link_type', 'Link Type', meta.link_types)}
          <label className="wide">Notes<textarea rows={2} maxLength={500} value={a.notes} onChange={(e) => set('notes')(e.target.value)} /></label>
        </div>
        <ErrorBox error={error} />
        <div className="row-actions">
          <button className="btn primary" type="submit" disabled={busy}>{editing ? 'Save Changes' : 'Add Asset'}</button>
          <button className="btn" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

export default function Inventory({ meta, onChanged }) {
  const [assets, setAssets] = useState(null);
  const [form, setForm] = useState(null); // { initial, editing }
  const [error, setError] = useState(null);

  const load = useCallback(() => api.assets().then(setAssets).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  const changed = () => { setForm(null); load(); onChanged(); };
  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.id} "${a.name}"?`)) return;
    try { await api.deleteAsset(a.id); changed(); } catch (e) { setError(e); }
  };
  const reset = async () => {
    if (!window.confirm('Replace the whole inventory with the 13 sample assets? Your changes will be lost.')) return;
    try { await api.resetAssets(); changed(); } catch (e) { setError(e); }
  };
  const nextId = () => {
    const nums = (assets || []).map((a) => Number((a.id.match(/\d+$/) || [0])[0]));
    return `A${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`;
  };

  return (
    <>
      <Card title="Cryptographic Inventory" lead="Stored in MongoDB. Every change re-scores the assessment.">
        <div className="row-actions" style={{ marginTop: 0, marginBottom: 12 }}>
          <button className="btn primary" onClick={() => setForm({ initial: { ...BLANK, id: nextId() }, editing: false })}>Add Asset</button>
          <button className="btn danger" onClick={reset}>Reset to Sample Inventory</button>
        </div>
        <ErrorBox error={error} />
        {!assets && !error && <div role="status" aria-label="Loading inventory"><Skeleton className="h-6 w-full" /><Skeleton className="mt-3 h-6 w-full" /><Skeleton className="mt-3 h-6 w-3/4" /></div>}
        {assets && assets.length === 0 && (
          <EmptyState icon={IconDatabase} title="No Assets in the Inventory" text="Add your first asset, or restore the 13-asset sample inventory.">
            <div className="row-actions">
              <button className="btn primary" onClick={() => setForm({ initial: { ...BLANK, id: nextId() }, editing: false })}>Add Asset</button>
              <button className="btn" onClick={reset}>Restore Sample Inventory</button>
            </div>
          </EmptyState>
        )}
        {assets && assets.length > 0 && (
          <div className="scroll">
            <table>
              <thead><tr><th>ID</th><th>Asset</th><th>KE</th><th>Sig</th><th>Sym</th><th>Hash</th><th>X</th><th>Y</th><th>Exposure</th><th /></tr></thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td>{a.id}</td><td><b>{a.name}</b><br /><small>{a.protocol}</small></td>
                    <td>{a.key_establishment ?? '–'}</td><td>{a.signature ?? '–'}</td><td>{a.symmetric ?? '–'}</td><td>{a.hash ?? '–'}</td>
                    <td>{Math.max(a.confidentiality_years, a.integrity_years)}</td><td>{a.migration_years}</td><td>{titleCase(a.exposure)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn small" onClick={() => setForm({ initial: { ...BLANK, ...a }, editing: true })}>Edit</button>{' '}
                      <button className="btn small danger" onClick={() => remove(a)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {form && <AssetForm key={form.initial.id + form.editing} initial={form.initial} editing={form.editing} meta={meta} onSaved={changed} onCancel={() => setForm(null)} />}
    </>
  );
}

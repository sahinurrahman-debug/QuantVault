import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { ErrorBox } from './components/ui.jsx';
import Overview from './pages/Overview.jsx';
import Prioritisation from './pages/Prioritisation.jsx';
import Inventory from './pages/Inventory.jsx';
import QkdLab from './pages/QkdLab.jsx';
import Migration from './pages/Migration.jsx';

const TABS = [
  ['overview', 'A. Exposure overview'],
  ['risk', 'B. Risk prioritisation'],
  ['inventory', 'Inventory'],
  ['qkd', 'C. QKD laboratory'],
  ['migration', 'D. Migration & QKD vs PQC'],
];

export default function App() {
  const [tab, setTab] = useState('overview');
  const [meta, setMeta] = useState(null);
  const [z, setZ] = useState(15);
  const [risk, setRisk] = useState(null);
  const [sweep, setSweep] = useState(null);
  const [version, setVersion] = useState(0); // bumps when the inventory changes
  const [error, setError] = useState(null);

  useEffect(() => {
    api.meta().then((m) => { setMeta(m); setZ(m.default_horizon); }).catch(setError);
  }, []);

  // Re-score whenever the horizon or the inventory changes (debounced while the slider moves).
  useEffect(() => {
    if (!meta) return undefined;
    let stale = false;
    const t = setTimeout(() => {
      api.risk(z).then((r) => { if (!stale) { setRisk(r); setError(null); } }).catch((e) => { if (!stale) setError(e); });
    }, 150);
    return () => { stale = true; clearTimeout(t); };
  }, [meta, z, version]);

  useEffect(() => {
    if (!meta) return;
    api.sweep().then(setSweep).catch(setError);
  }, [meta, version]);

  const inventoryChanged = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <>
      <header className="top">
        <h1>Quant<span>Vault</span></h1>
        <p className="sub">Quantum-Aware Cryptographic Risk &amp; Migration Framework · MERN dashboard · illustrative sample data, not findings from a real system</p>
      </header>
      <main>
        <div className="bar">
          <div className="tabs" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          {meta && (
            <div className="horizon">
              <label htmlFor="z"><b>Assumed quantum-threat horizon Z:</b> {z} years</label>
              <input id="z" type="range" min="5" max="40" step="1" value={z} onChange={(e) => setZ(Number(e.target.value))} />
              <span>
                {Object.entries(meta.scenarios).map(([name, years]) => (
                  <button key={name} className="chip" aria-pressed={z === years} onClick={() => setZ(years)} style={{ marginRight: 6 }}>
                    {name} ({years})
                  </button>
                ))}
              </span>
              <small>An assumption you control, not a prediction.</small>
            </div>
          )}
        </div>

        <ErrorBox error={error} />
        {!meta && !error && <p className="muted">Loading…</p>}

        {meta && risk && (
          <>
            {tab === 'overview' && <Overview risk={risk} sweep={sweep} z={z} />}
            {tab === 'risk' && <Prioritisation risk={risk} meta={meta} z={z} />}
            {tab === 'inventory' && <Inventory meta={meta} onChanged={inventoryChanged} />}
            {tab === 'qkd' && <QkdLab meta={meta} />}
            {tab === 'migration' && <Migration risk={risk} meta={meta} z={z} />}
          </>
        )}
      </main>
    </>
  );
}

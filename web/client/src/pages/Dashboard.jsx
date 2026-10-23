import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { IconDatabase } from '../components/Icons.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { Card, DashboardSkeleton, EmptyState, ErrorBox } from '../components/ui.jsx';
import Inventory from './Inventory.jsx';
import Migration from './Migration.jsx';
import Overview from './Overview.jsx';
import Prioritisation from './Prioritisation.jsx';
import QkdLab from './QkdLab.jsx';
import { usePageTitle } from '../router.jsx';

const TABS = [
  ['overview', 'A. Exposure Overview'],
  ['risk', 'B. Risk Prioritisation'],
  ['inventory', 'Inventory'],
  ['qkd', 'C. QKD Laboratory'],
  ['migration', 'D. Migration & QKD vs PQC'],
];

export default function Dashboard() {
  usePageTitle('Risk Dashboard | QuantVault');
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [meta, setMeta] = useState(null);
  const [z, setZ] = useState(15);
  const [risk, setRisk] = useState(null);
  const [sweep, setSweep] = useState(null);
  const [version, setVersion] = useState(0); // bumps when the inventory changes
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    api.meta().then((m) => { setMeta(m); setZ(m.default_horizon); }).catch(setError);
  }, [attempt]);

  // Re-score whenever the horizon or the inventory changes (debounced while the slider moves).
  useEffect(() => {
    if (!meta) return undefined;
    let stale = false;
    const t = setTimeout(() => {
      api.risk(z).then((r) => { if (!stale) { setRisk(r); setError(null); } }).catch((e) => { if (!stale) { setRisk(null); setError(e); } });
    }, 150);
    return () => { stale = true; clearTimeout(t); };
  }, [meta, z, version, attempt]);

  useEffect(() => {
    if (!meta) return;
    api.sweep().then(setSweep).catch(() => setSweep(null));
  }, [meta, version]);

  const inventoryChanged = useCallback(() => setVersion((v) => v + 1), []);
  const retry = () => setAttempt((a) => a + 1);
  const emptyInventory = error?.status === 409;
  const restoreSample = async () => { await api.resetAssets(); inventoryChanged(); };

  return (
    <div className="wrap pb-6 pt-12">
      <Reveal className="dash-head">
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">Risk Dashboard</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Welcome back, {user.name.split(' ')[0]}. Live risk assessment of your inventory.
        </p>
      </Reveal>

      <div className="bar">
        <div className="tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {meta ? (
          <div className="horizon">
            <label htmlFor="z"><b>Assumed Quantum-Threat Horizon Z:</b> {z} Years</label>
            <input id="z" type="range" min="5" max="40" step="1" value={z} onChange={(e) => setZ(Number(e.target.value))} />
            <span className="chips">
              {Object.entries(meta.scenarios).map(([name, years]) => (
                <button key={name} className="chip" aria-pressed={z === years} onClick={() => setZ(years)}>
                  {name} ({years})
                </button>
              ))}
            </span>
          </div>
        ) : <div className="skeleton h-9 w-full max-w-xl" aria-hidden="true" />}
      </div>

      <div className="stack">
      {error && !emptyInventory && <ErrorBox error={error} onRetry={retry} />}

      {emptyInventory && (
        <Card>
          <EmptyState icon={IconDatabase} title="The Inventory Is Empty"
            text="There is nothing to score yet. Restore the 13-asset sample inventory, or add your own assets on the Inventory tab.">
            <div className="row-actions">
              <button className="btn primary" onClick={restoreSample}>Restore Sample Inventory</button>
              <button className="btn" onClick={() => setTab('inventory')}>Add an Asset</button>
            </div>
          </EmptyState>
        </Card>
      )}

      {!meta && !error && <DashboardSkeleton />}
      {meta && !risk && !error && <DashboardSkeleton />}

      {meta && risk && (
        <>
          {tab === 'overview' && <Overview risk={risk} sweep={sweep} z={z} />}
          {tab === 'risk' && <Prioritisation risk={risk} meta={meta} z={z} />}
          {tab === 'inventory' && <Inventory meta={meta} onChanged={inventoryChanged} />}
          {tab === 'qkd' && <QkdLab meta={meta} />}
          {tab === 'migration' && <Migration risk={risk} meta={meta} z={z} />}
        </>
      )}
      {meta && !risk && emptyInventory && tab === 'inventory' && <Inventory meta={meta} onChanged={inventoryChanged} />}
      </div>
    </div>
  );
}

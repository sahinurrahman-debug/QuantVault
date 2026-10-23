import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { IconDatabase } from '../components/Icons.jsx';
import { Reveal } from '../components/Reveal.jsx';
import {
  Card, DashboardSkeleton, EmptyState, ErrorBox,
} from '../components/ui.jsx';
import { Link, usePageTitle, useRouter } from '../router.jsx';
import { DASHBOARD_TABS } from './dashboardTabs.js';
import Inventory from './Inventory.jsx';
import Migration from './Migration.jsx';
import Overview from './Overview.jsx';
import Prioritisation from './Prioritisation.jsx';
import QkdLab from './QkdLab.jsx';

export default function Dashboard({ tab }) {
  const current = DASHBOARD_TABS.find((t) => t.key === tab) || DASHBOARD_TABS[0];
  usePageTitle(`${current.title} | QuantVault`);
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [meta, setMeta] = useState(null);
  const [z, setZ] = useState(15);
  const [risk, setRisk] = useState(null);
  const [sweep, setSweep] = useState(null);
  const [version, setVersion] = useState(0); // bumps when the inventory changes
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [qkdRun, setQkdRun] = useState(null); // the last simulation survives switching tabs

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
  const restoreSample = async () => {
    try { await api.resetAssets(); inventoryChanged(); } catch (e) { setError(e); }
  };

  // Arrow keys / Home / End move between tabs, as the ARIA tabs pattern requires.
  const onTabKeyDown = (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1 };
    const i = DASHBOARD_TABS.findIndex((t) => t.key === current.key);
    let next = null;
    if (e.key in keys) next = DASHBOARD_TABS[(i + keys[e.key] + DASHBOARD_TABS.length) % DASHBOARD_TABS.length];
    else if (e.key === 'Home') [next] = DASHBOARD_TABS;
    else if (e.key === 'End') next = DASHBOARD_TABS[DASHBOARD_TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    navigate(next.path);
    setTimeout(() => document.getElementById(`tab-${next.key}`)?.focus(), 0);
  };

  const showTab = Boolean(meta) && (Boolean(risk) || (emptyInventory && current.key === 'inventory'));
  const renderTab = () => {
    switch (current.key) {
      case 'risk': return <Prioritisation risk={risk} meta={meta} z={z} />;
      case 'inventory': return <Inventory meta={meta} onChanged={inventoryChanged} />;
      case 'qkd': return <QkdLab meta={meta} run={qkdRun} setRun={setQkdRun} />;
      case 'migration': return <Migration risk={risk} meta={meta} z={z} />;
      default: return <Overview risk={risk} sweep={sweep} z={z} />;
    }
  };

  return (
    <div className="wrap pb-6 pt-12">
      <Reveal className="dash-head">
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">Risk Dashboard</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Welcome back, {user.name.split(' ')[0]}. Live risk assessment of your inventory.
        </p>
        {user.demo && (
          <p className="mt-3"><span className="badge m-indeterminate">Demo Workspace · Deleted After 24 Hours</span></p>
        )}
      </Reveal>

      <div className="bar">
        <div className="tabs" role="tablist" aria-label="Dashboard sections" onKeyDown={onTabKeyDown}>
          {DASHBOARD_TABS.map((t) => (
            <Link key={t.key} id={`tab-${t.key}`} to={t.path} role="tab" className="tab"
              aria-selected={t.key === current.key} aria-controls="dashboard-panel" tabIndex={t.key === current.key ? 0 : -1}>
              {t.label}
            </Link>
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

      <div className="stack" id="dashboard-panel" role="tabpanel" aria-labelledby={`tab-${current.key}`}>
        {error && !emptyInventory && <ErrorBox error={error} onRetry={retry} />}

        {emptyInventory && current.key !== 'inventory' && (
          <Card>
            <EmptyState icon={IconDatabase} title="The Inventory Is Empty"
              text="There is nothing to score yet. Restore the 13-asset sample inventory, or add your own assets on the Inventory tab.">
              <div className="row-actions">
                <button className="btn primary" onClick={restoreSample}>Restore Sample Inventory</button>
                <button className="btn" onClick={() => navigate('/dashboard/inventory')}>Add an Asset</button>
              </div>
            </EmptyState>
          </Card>
        )}

        {!showTab && !error && <DashboardSkeleton />}
        {showTab && renderTab()}
      </div>
    </div>
  );
}

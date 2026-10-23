import React from 'react';
import { IconAlert, IconInbox } from './Icons.jsx';
import { Reveal } from './Reveal.jsx';

export const TIERS = ['Critical', 'High', 'Medium', 'Low'];
export const TIER_CLASS = { Critical: 't-crit', High: 't-high', Medium: 't-med', Low: 't-low' };
export const TIER_COLOR = { Critical: '#fb7185', High: '#fb923c', Medium: '#fcd34d', Low: '#34d399' };
export const CHART = { accent: '#a78bfa', cyan: '#67e8f9', red: '#fb7185', orange: '#fb923c', green: '#34d399', grey: '#94a3b8' };
export const GRID = 'rgba(255,255,255,0.1)';
export const TOOLTIP = {
  contentStyle: { background: 'rgba(15,10,40,0.92)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12, color: '#f1f5f9', fontSize: 14 },
  labelStyle: { color: '#c4b5fd' },
  cursor: { stroke: 'rgba(255,255,255,0.25)' },
};

export const TierBadge = ({ tier }) => <span className={`badge ${TIER_CLASS[tier]}`}>{tier}</span>;

export function MoscaBadge({ mosca }) {
  const { status, margin } = mosca;
  if (status === 'violated') return <span className="badge m-violated">X+Y&gt;Z by {Math.round(margin)} Years</span>;
  if (status === 'ok') return <span className="badge m-ok">OK, Slack {Math.round(-margin)} Years</span>;
  if (status === 'indeterminate') return <span className="badge m-indeterminate">Indeterminate (Unknown Crypto)</span>;
  return <span className="badge m-na">Not Applicable</span>;
}

export const Kpi = ({ value, label, color }) => (
  <div className="kpi"><b style={color ? { color } : undefined}>{value}</b><span>{label}</span></div>
);

/** Glass card that fades in the first time it scrolls into view. */
export const Card = ({ title, lead, children }) => (
  <Reveal className="card">
    {title && <h2>{title}</h2>}
    {lead && <p className="lead">{lead}</p>}
    {children}
  </Reveal>
);

export const Spinner = ({ text }) => <span><span className="spinner" />{text}</span>;

export const pct = (v, d = 1) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(d)}%`);

/** Loading placeholder; `className` sets the size. */
export const Skeleton = ({ className = '' }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading the risk assessment">
      <div className="kpis">{Array.from({ length: 6 }, (_, i) => <div key={i} className="kpi"><Skeleton className="h-8 w-16" /><Skeleton className="mt-3 h-4 w-full" /></div>)}</div>
      <div className="card"><Skeleton className="h-6 w-56" /><Skeleton className="mt-4 h-4 w-3/4" /><Skeleton className="mt-6 h-4 w-full" /></div>
      <div className="card"><Skeleton className="h-6 w-72" /><Skeleton className="mt-6 h-64 w-full" /></div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Designed empty state: icon, explanation and an optional next action. */
export function EmptyState({ icon: Icon = IconInbox, title, text, children }) {
  return (
    <div className="empty">
      <div className="ico"><Icon className="size-6" /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      <b className="flex items-center gap-2"><IconAlert className="size-5" /> {error.message}</b>
      {error.details?.length ? <ul className="clean">{error.details.map((d) => <li key={d}>{d}</li>)}</ul> : null}
      {onRetry && <div className="row-actions"><button className="btn small" onClick={onRetry}>Try Again</button></div>}
    </div>
  );
}

export function ComponentBars({ components }) {
  const names = {
    C: 'Confidentiality Lifetime & Sensitivity', Q: 'Quantum Exposure of Mechanisms',
    E: 'External Exposure', M: 'Migration Difficulty & Urgency',
  };
  return Object.entries(components).map(([k, v]) => (
    <div key={k}>
      <div className="comp" title={names[k]}>
        <b>{k}</b><div className="track"><div className="fill" style={{ width: `${v * 100}%` }} /></div><span>{v.toFixed(2)}</span>
      </div>
      <small>{names[k]}</small>
    </div>
  ));
}

export function AssetDetail({ asset, qlabels }) {
  const mech = Object.entries(asset.mechanisms).filter(([, m]) => m.applicable);
  const { confidentiality: mc, authenticity: ma } = asset.mosca;
  const line = (name, m) => (m.status === 'not_applicable' ? null : (
    <div key={name}>{name}: X={m.x}, Y={m.y}, Z={m.z} &rarr; X+Y={m.x + m.y} {m.margin > 0 ? '>' : '≤'} {m.z} ({m.status})</div>
  ));
  return (
    <div>
      <div className="grid2">
        <div>
          <b>Score Components</b>
          <ComponentBars components={asset.components} />
          <p><small>Security Exposure (C, Q, E): <b>{asset.security_exposure}</b> · Migration Priority R (Adds M): <b>{asset.risk_score}</b></small></p>
          <p><b>Mosca</b>{line('Confidentiality', mc)}{line('Authenticity', ma)}</p>
          {asset.tier_reasons.length > 0 && <p><small>{asset.tier_reasons.join(' ')}</small></p>}
        </div>
        <div className="scroll">
          <b>Mechanisms</b>
          <table>
            <thead><tr><th>Role</th><th>Algorithm</th><th>Class</th><th>Why</th></tr></thead>
            <tbody>
              {mech.map(([role, m]) => (
                <tr key={role}><td>{role.replace('_', ' ')}</td><td>{m.family}</td><td>{qlabels[m.qclass]}</td><td>{m.note}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p><b>Recommended Next Actions</b></p>
      <ul className="clean">
        {asset.recommendations.map((r) => (
          <li key={r.action}><b>[{r.priority}]</b> {r.action} — <span className="muted">{r.detail}</span></li>
        ))}
      </ul>
      {asset.qkd_candidate && <p className="warn"><b>QKD Candidate:</b> {asset.qkd_reason}</p>}
    </div>
  );
}

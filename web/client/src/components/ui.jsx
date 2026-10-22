import React from 'react';

export const TIERS = ['Critical', 'High', 'Medium', 'Low'];
export const TIER_CLASS = { Critical: 't-crit', High: 't-high', Medium: 't-med', Low: 't-low' };
export const TIER_COLOR = { Critical: '#d64545', High: '#e08a3a', Medium: '#c9a227', Low: '#3fa56f' };
export const CHART = { accent: '#4c8bd6', red: '#e0534f', orange: '#e29a3f', green: '#3fa56f', grey: '#8a93a6' };

export const TierBadge = ({ tier }) => <span className={`badge ${TIER_CLASS[tier]}`}>{tier}</span>;

export function MoscaBadge({ mosca }) {
  const { status, margin } = mosca;
  if (status === 'violated') return <span className="badge m-violated">X+Y&gt;Z by {Math.round(margin)} yr</span>;
  if (status === 'ok') return <span className="badge m-ok">OK, slack {Math.round(-margin)} yr</span>;
  if (status === 'indeterminate') return <span className="badge m-indeterminate">Indeterminate (unknown crypto)</span>;
  return <span className="badge m-na">Not applicable</span>;
}

export const Kpi = ({ value, label, color }) => (
  <div className="kpi"><b style={color ? { color } : undefined}>{value}</b><span>{label}</span></div>
);

export const Card = ({ title, lead, children }) => (
  <div className="card">
    {title && <h2>{title}</h2>}
    {lead && <p className="lead">{lead}</p>}
    {children}
  </div>
);

export const Spinner = ({ text }) => <span><span className="spinner" />{text}</span>;

export const pct = (v, d = 1) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(d)}%`);

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      <b>{error.message}</b>
      {error.details?.length ? <ul className="clean">{error.details.map((d) => <li key={d}>{d}</li>)}</ul> : null}
    </div>
  );
}

export function ComponentBars({ components }) {
  const names = {
    C: 'Confidentiality lifetime & sensitivity', Q: 'Quantum exposure of mechanisms',
    E: 'External exposure', M: 'Migration difficulty & urgency',
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
          <b>Score components</b>
          <ComponentBars components={asset.components} />
          <p><small>Security exposure (C, Q, E): <b>{asset.security_exposure}</b> · Migration priority R (adds M): <b>{asset.risk_score}</b></small></p>
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
      <p><b>Recommended next actions</b></p>
      <ul className="clean">
        {asset.recommendations.map((r) => (
          <li key={r.action}><b>[{r.priority}]</b> {r.action} — <span className="muted">{r.detail}</span></li>
        ))}
      </ul>
      {asset.qkd_candidate && <p className="warn"><b>QKD candidate:</b> {asset.qkd_reason}</p>}
    </div>
  );
}

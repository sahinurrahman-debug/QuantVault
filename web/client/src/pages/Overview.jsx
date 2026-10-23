import React from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import ScoreBars from '../components/ScoreBars.jsx';
import {
  CHART, Card, Kpi, TIERS, TIER_COLOR, TOOLTIP,
} from '../components/ui.jsx';

export default function Overview({ risk, sweep, z }) {
  const o = risk.overview;
  const total = o.total_assets;
  const completeness = Math.round(o.inventory_completeness * 100);
  const unknown = risk.results.filter((a) => a.has_unknown);
  const bars = [...risk.results].sort((a, b) => b.risk_score - a.risk_score)
    .map((a) => ({ id: a.id, name: a.name, score: a.risk_score, tier: a.tier, raw: a.risk_score_raw, adjusted: a.score_adjusted }));
  const sweepData = sweep?.rows.map((r) => ({ z: r.z, 'Mosca Violated': r.mosca_violated, 'Critical or High': r.urgent }));

  return (
    <>
      <div className="kpis">
        <Kpi value={total} label="Assets Inventoried" />
        <Kpi value={o.quantum_vulnerable} label="Quantum-Vulnerable Assets" color="var(--high)" />
        <Kpi value={o.mosca_violated} label={`Mosca Violations (Z = ${z})`} color="var(--crit)"
          hint={o.mosca_possible > 0 ? `+${o.mosca_possible} possible (unknown crypto)` : undefined} />
        <Kpi value={o.urgent_review} label="Urgent Review (Critical or High)" color="var(--crit)" />
        <Kpi value={o.unknown_config} label="Unknown Configurations" color="var(--med)" />
        <Kpi value={o.uses_pq_or_hybrid} label="Already PQ or Hybrid" color="var(--low)" />
      </div>

      <div className="grid2">
        <Card title="Priority Distribution" lead="Assets by tier at the selected threat horizon.">
          <div className="tierbar">
            {TIERS.map((t) => <div key={t} style={{ width: `${(o.tier_counts[t] / total) * 100}%`, background: TIER_COLOR[t] }} title={`${t}: ${o.tier_counts[t]}`} />)}
          </div>
          <div className="legend">{TIERS.map((t) => <span key={t}><i style={{ background: TIER_COLOR[t] }} />{t}: {o.tier_counts[t]}</span>)}</div>
        </Card>

        <Card title="Inventory Completeness" lead="Share of cryptographic roles that have been identified.">
          <div className="big-number">{completeness}%</div>
          <div className="meter" role="progressbar" aria-valuenow={completeness} aria-valuemin={0} aria-valuemax={100} aria-label="Inventory completeness"><i style={{ width: `${completeness}%` }} /></div>
          {unknown.length ? (
            <ul className="clean">{unknown.map((a) => <li key={a.id}><b>{a.name}</b>: {a.notes}</li>)}</ul>
          ) : <p className="muted">Every asset has a fully identified configuration.</p>}
        </Card>
      </div>

      <Card title="How the Threat Horizon Changes Urgency" lead="Assets violating Mosca's inequality and assets rated Critical or High, for each assumed horizon Z. The dashed line marks the current selection.">
        <div className="chart">
          {sweepData ? (
            <ResponsiveContainer>
              <LineChart data={sweepData} margin={{ left: 0, right: 16, top: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="z" label={{ value: 'Assumed Years to a Relevant Quantum Computer (Z)', position: 'insideBottom', offset: -2 }} height={46} />
                <YAxis allowDecimals={false} />
                <Tooltip {...TOOLTIP} />
                <Legend />
                <ReferenceLine x={z} stroke={CHART.grey} strokeDasharray="4 4" />
                <Line type="stepAfter" dataKey="Mosca Violated" stroke={CHART.red} strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="Critical or High" stroke={CHART.orange} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="skeleton h-full w-full" aria-hidden="true" />}
        </div>
      </Card>

      <Card title="Risk Score by Asset" lead="R = 100 × (0.35C + 0.25Q + 0.20E + 0.20M)">
        <ScoreBars items={bars} />
      </Card>
    </>
  );
}

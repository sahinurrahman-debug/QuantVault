import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHART, Card, Kpi, TIERS, TIER_COLOR } from '../components/ui.jsx';

export default function Overview({ risk, sweep, z }) {
  const o = risk.overview;
  const total = o.total_assets;
  const unknown = risk.results.filter((a) => a.has_unknown);
  const bars = [...risk.results].sort((a, b) => b.risk_score - a.risk_score)
    .map((a) => ({ name: a.name, score: a.risk_score, tier: a.tier }));
  const sweepData = sweep?.rows.map((r) => ({ z: r.z, 'Mosca violated': r.mosca_violated, 'Critical or High': r.urgent }));

  return (
    <>
      <div className="kpis">
        <Kpi value={total} label="assets inventoried" />
        <Kpi value={o.quantum_vulnerable} label="use quantum-vulnerable mechanisms" color="var(--high)" />
        <Kpi value={o.mosca_violated} label={`violate Mosca X+Y>Z at Z=${z}`} color="var(--crit)" />
        <Kpi value={o.urgent_review} label="need urgent migration review (Critical/High)" color="var(--crit)" />
        <Kpi value={o.unknown_config} label="with unknown cryptographic configuration" color="var(--med)" />
        <Kpi value={o.uses_pq_or_hybrid} label="already use PQ / hybrid mechanisms" color="var(--low)" />
        <Kpi value={`${Math.round(o.inventory_completeness * 100)}%`} label="inventory completeness" />
      </div>

      <Card title="Priority distribution" lead="Tier combines the risk score R with the Mosca test. Move the horizon slider to see priorities shift.">
        <div className="tierbar">
          {TIERS.map((t) => <div key={t} style={{ width: `${(o.tier_counts[t] / total) * 100}%`, background: TIER_COLOR[t] }} title={`${t}: ${o.tier_counts[t]}`} />)}
        </div>
        <div className="legend">{TIERS.map((t) => <span key={t}><i style={{ background: TIER_COLOR[t] }} />{t}: {o.tier_counts[t]}</span>)}</div>
      </Card>

      <Card title="How the threat horizon changes urgency" lead="Number of assets violating Mosca's inequality, and Critical/High assets, for every assumed horizon Z. The dashed line is your current assumption.">
        <div className="chart">
          {sweepData ? (
            <ResponsiveContainer>
              <LineChart data={sweepData} margin={{ left: 0, right: 16, top: 8 }}>
                <CartesianGrid stroke="rgba(128,128,128,.25)" />
                <XAxis dataKey="z" label={{ value: 'assumed years to a relevant quantum computer (Z)', position: 'insideBottom', offset: -2 }} height={46} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <ReferenceLine x={z} stroke={CHART.grey} strokeDasharray="4 4" />
                <Line type="stepAfter" dataKey="Mosca violated" stroke={CHART.red} strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="Critical or High" stroke={CHART.orange} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="muted">Loading sweep…</p>}
        </div>
      </Card>

      <div className="grid2">
        <Card title="Unknown configurations" lead="Unknown is scored conservatively and is never classified as safe.">
          {unknown.length ? (
            <ul className="clean">{unknown.map((a) => <li key={a.id}><b>{a.name}</b> — {a.notes}</li>)}</ul>
          ) : <p>None.</p>}
        </Card>
        <Card title="Risk score by asset" lead="R = 100·(0.35C + 0.25Q + 0.20E + 0.20M); weights are configurable server-side.">
          <div className="chart" style={{ height: 40 + bars.length * 26 }}>
            <ResponsiveContainer>
              <BarChart data={bars} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid stroke="rgba(128,128,128,.25)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} interval={0} />
                <Tooltip />
                <Bar dataKey="score" name="R">
                  {bars.map((b) => <Cell key={b.name} fill={TIER_COLOR[b.tier]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}

import React, { Fragment, useMemo, useState } from 'react';
import {
  AssetDetail, Card, EmptyState, MoscaBadge, TIERS, TierBadge,
} from '../components/ui.jsx';
import { downloadCsv, toCsv } from '../lib/csv.js';

const COLUMNS = [
  { label: 'Rank', value: (a) => a.rank },
  { label: 'ID', value: (a) => a.id },
  { label: 'Asset', value: (a) => a.name },
  { label: 'Tier', value: (a) => a.tier },
  { label: 'Risk Score', value: (a) => a.risk_score },
  { label: 'Security Exposure', value: (a) => a.security_exposure },
  { label: 'Mosca Status', value: (a) => a.mosca.status },
  { label: 'Mosca Margin (Years)', value: (a) => (a.mosca.margin === null ? '' : a.mosca.margin) },
  { label: 'Key Establishment', value: (a) => a.mechanisms.key_establishment.id },
  { label: 'Signature', value: (a) => a.mechanisms.signature.id },
  { label: 'Symmetric', value: (a) => a.mechanisms.symmetric.id },
  { label: 'Hash', value: (a) => a.mechanisms.hash.id },
  { label: 'Lifetime X (Years)', value: (a) => Math.max(a.inputs.confidentiality_years, a.inputs.integrity_years) },
  { label: 'Migration Y (Years)', value: (a) => a.inputs.migration_years },
  { label: 'Top Recommendation', value: (a) => a.recommendations[0]?.action ?? '' },
  { label: 'Needs Attention', value: (a) => [...a.data_warnings, ...a.classical_weakness.map((w) => `${w.id} is classically weak`)].join('; ') },
];

export default function Prioritisation({ risk, meta, z }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState(null);
  const rows = useMemo(() => risk.results.filter((a) => !filter || a.tier === filter), [risk, filter]);
  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const exportCsv = () => downloadCsv(`quantvault-risk-z${z}.csv`, toCsv(risk.results, COLUMNS));

  return (
    <Card
      title={`Risk Prioritisation at Z = ${z} Years`}
      lead="Select a row for score components, mechanisms and recommended actions."
    >
      <div className="toolbar">
        <div className="chips" role="group" aria-label="Filter by tier">
          {TIERS.map((t) => (
            <button key={t} className="chip" aria-pressed={filter === t} onClick={() => setFilter(filter === t ? null : t)}>
              {t} ({risk.overview.tier_counts[t]})
            </button>
          ))}
        </div>
        <button className="btn small" onClick={exportCsv}>Export CSV</button>
      </div>
      {rows.length === 0 && (
        <EmptyState title={`No ${filter} Assets at Z = ${z}`} text="Nothing falls in this tier at the selected horizon. Clear the filter or change the horizon.">
          <button className="btn" onClick={() => setFilter(null)}>Clear Filter</button>
        </EmptyState>
      )}
      <div className="scroll" hidden={rows.length === 0}>
        <table>
          <thead>
            <tr><th>#</th><th>Asset</th><th>KE / Sig / Sym</th><th>X</th><th>Y</th><th>Mosca (Z={z})</th><th>R</th><th>Exposure</th><th>Tier</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const mk = a.mechanisms;
              const x = Math.max(a.inputs.confidentiality_years, a.inputs.integrity_years);
              const expanded = open === a.id;
              return (
                <Fragment key={a.id}>
                  <tr className="row" tabIndex={0} aria-expanded={expanded} onClick={() => toggle(a.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(a.id); } }}>
                    <td>{a.rank}</td>
                    <td><b>{a.name}</b><br /><small>{a.protocol}</small></td>
                    <td><small>{mk.key_establishment.id} / {mk.signature.id} / {mk.symmetric.id}</small></td>
                    <td>{x}</td><td>{a.inputs.migration_years}</td>
                    <td><MoscaBadge mosca={a.mosca} /></td>
                    <td>
                      <b className={a.score_adjusted ? 'adj' : undefined}
                        title={a.score_adjusted ? `Weighted score ${a.risk_score_raw}, shown within the ${a.tier} range` : undefined}>{a.risk_score}</b>
                    </td>
                    <td>{a.security_exposure}</td>
                    <td><TierBadge tier={a.tier} /></td>
                  </tr>
                  {expanded && (
                    <tr className="detail"><td colSpan={9}><AssetDetail asset={a} qlabels={meta.qclass_labels} /></td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

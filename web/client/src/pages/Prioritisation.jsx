import React, { Fragment, useMemo, useState } from 'react';
import { AssetDetail, Card, MoscaBadge, TIERS, TierBadge } from '../components/ui.jsx';

export default function Prioritisation({ risk, meta, z }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState(null);
  const rows = useMemo(() => risk.results.filter((a) => !filter || a.tier === filter), [risk, filter]);

  return (
    <Card
      title={`Risk prioritisation at Z = ${z} years`}
      lead="Click a row for component scores, mechanisms and recommended actions. KE / Sig / Sym = key establishment / signature / symmetric. X is the confidentiality (or signature-trust) lifetime and Y the migration time, in years. Mosca's inequality is a prioritisation heuristic, not a probability of compromise."
    >
      <p>
        {TIERS.map((t) => (
          <button key={t} className="chip" aria-pressed={filter === t} onClick={() => setFilter(filter === t ? null : t)} style={{ marginRight: 6 }}>
            {t} ({risk.overview.tier_counts[t]})
          </button>
        ))}
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>#</th><th>Asset</th><th>KE / Sig / Sym</th><th>X</th><th>Y</th><th>Mosca (Z={z})</th><th>R</th><th>Exposure</th><th>Tier</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const mk = a.mechanisms;
              const x = Math.max(a.inputs.confidentiality_years, a.inputs.integrity_years);
              return (
                <Fragment key={a.id}>
                  <tr className="row" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <td>{a.rank}</td>
                    <td><b>{a.name}</b><br /><small>{a.protocol}</small></td>
                    <td><small>{mk.key_establishment.id} / {mk.signature.id} / {mk.symmetric.id}</small></td>
                    <td>{x}</td><td>{a.inputs.migration_years}</td>
                    <td><MoscaBadge mosca={a.mosca} /></td>
                    <td><b>{a.risk_score}</b></td><td>{a.security_exposure}</td>
                    <td><TierBadge tier={a.tier} /></td>
                  </tr>
                  {open === a.id && (
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

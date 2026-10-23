import React from 'react';
import { Card, TierBadge } from '../components/ui.jsx';

export default function Migration({ risk, meta, z }) {
  const qkd = risk.results.filter((a) => a.qkd_candidate);
  return (
    <>
      <Card title={`Migration Roadmap at Z = ${z} Years`} lead="Generated from the stored inventory at the selected horizon.">
        {risk.plan.map((p) => (
          <div className="phase" key={p.phase}>
            <div className="n">{p.phase}</div>
            <div>
              <b>{p.name}</b><br /><span className="muted">{p.summary}</span>
              <ul className="clean">
                {p.items.map((i, idx) => (
                  <li key={idx}>{i.asset && <><b>{i.asset.name}</b> <TierBadge tier={i.asset.tier} /> — </>}{i.task}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Where QKD Fits">
        <ol className="clean">{meta.priorities.map(([k, v]) => <li key={k}><b>{k}:</b> {v}</li>)}</ol>
        {qkd.length
          ? qkd.map((a) => <p className="warn" key={a.id}><b>{a.name}:</b> {a.qkd_reason}</p>)
          : <p>No asset in this inventory is a QKD candidate.</p>}
      </Card>

      <Card title="QKD vs Post-Quantum Cryptography">
        <div className="scroll">
          <table>
            <thead><tr><th /><th>Quantum Key Distribution</th><th>Post-Quantum Cryptography</th></tr></thead>
            <tbody>{meta.comparison.map(([d, a, b]) => <tr key={d}><td><b>{d}</b></td><td>{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <div className="grid2">
        <Card title="PQC Workflow"><ol className="clean">{meta.workflow_pqc.map((s) => <li key={s}>{s}</li>)}</ol></Card>
        <Card title="QKD Workflow"><ol className="clean">{meta.workflow_qkd.map((s) => <li key={s}>{s}</li>)}</ol></Card>
      </div>
    </>
  );
}

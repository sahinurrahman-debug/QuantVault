import React, { useState } from 'react';
import { Card, TierBadge } from '../components/ui.jsx';
import { api } from '../api.js';

export default function Migration({ risk, meta, z }) {
  const [downloading, setDownloading] = useState(false);
  const qkd = risk.results.filter((a) => a.qkd_candidate);

  const handleDownloadReport = async () => {
    try {
      setDownloading(true);
      const res = await api.boardReport(z);
      if (res && res.markdown_content) {
        const blob = new Blob([res.markdown_content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QuantVault_Executive_Board_Report_Z${z}yr.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert(`Failed to generate report: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="card" style={{ border: '2px solid rgba(167, 139, 250, 0.4)', background: 'rgba(167, 139, 250, 0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ color: '#c4b5fd', margin: '0 0 4px 0' }}>📋 Executive Board Migration Briefing</h2>
            <p className="lead" style={{ margin: 0 }}>Formal governance migration report for CISO, Audit & Risk Committee, and Board reviews.</p>
          </div>
          <button
            type="button"
            className="chip"
            onClick={handleDownloadReport}
            disabled={downloading}
            style={{ background: '#7c3aed', color: '#fff', fontWeight: 600, padding: '8px 18px', cursor: 'pointer', border: 'none' }}
          >
            {downloading ? 'Generating…' : '📥 Download Board Report (.md)'}
          </button>
        </div>
      </div>

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

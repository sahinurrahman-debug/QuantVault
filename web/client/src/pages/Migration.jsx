import React, { useState } from 'react';
import { api } from '../api.js';
import { Card, ErrorBox, Spinner, TierBadge } from '../components/ui.jsx';
import { downloadText } from '../lib/download.js';

const REPORT_FORMATS = {
  md: { label: 'Download Report (.md)', mime: 'text/markdown', field: 'markdown_content' },
  html: { label: 'Printable Report (.html)', mime: 'text/html', field: 'html_content' },
};

export default function Migration({ risk, meta, z }) {
  const [busy, setBusy] = useState(null); // 'md' | 'html' while a report is being built
  const [reportError, setReportError] = useState(null);
  const qkd = risk.results.filter((a) => a.qkd_candidate);

  const downloadReport = async (format) => {
    const { mime, field } = REPORT_FORMATS[format];
    setBusy(format);
    setReportError(null);
    try {
      const res = await api.boardReport(z);
      if (!res?.[field]) throw new Error('The server returned an empty report. Please try again.');
      downloadText(`QuantVault_Board_Report_Z${z}yr.${format}`, res[field], mime);
    } catch (err) {
      setReportError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card title="Executive Board Migration Briefing" lead="A formal migration report for the CISO, the Audit & Risk Committee and the Board, built from your inventory at the selected horizon.">
        <div className="row-actions" style={{ marginTop: 0 }}>
          {Object.entries(REPORT_FORMATS).map(([format, { label }]) => (
            <button key={format} type="button" className={`btn ${format === 'md' ? 'primary' : ''}`} onClick={() => downloadReport(format)} disabled={Boolean(busy)}>
              {busy === format ? <Spinner text="Building…" /> : label}
            </button>
          ))}
        </div>
        <ErrorBox error={reportError} />
      </Card>

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

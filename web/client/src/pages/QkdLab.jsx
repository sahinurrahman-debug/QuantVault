import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api.js';
import { CHART, Card, EmptyState, ErrorBox, Skeleton, Spinner, TOOLTIP, pct } from '../components/ui.jsx';

const DEFAULTS = { n_qubits: 2048, eve_enabled: false, eve_fraction: 1, noise_model: 'none', noise_p: 0, max_qber: 0.11 };
const MODELS = { none: 'Ideal Channel', bitflip: 'Bit-Flip (Channel)', depolarizing: 'Depolarizing (Channel)', readout: "Readout Error (Bob's Detector)" };
const ZX = (b) => (b === 1 ? 'X' : 'Z');

function Transmission({ t }) {
  const hasEve = t.eve_bases.some((b) => b >= 0);
  const lines = [
    ['Alice bits ', t.alice_bits.join('')],
    ['Alice basis', t.alice_bases.map(ZX).join('')],
    ...(hasEve ? [['Eve basis  ', t.eve_bases.map((b) => (b < 0 ? '-' : ZX(b))).join('')]] : []),
    ['Bob basis  ', t.bob_bases.map(ZX).join('')],
    ['Bob bits   ', t.bob_bits.join('')],
    ['Sifted?    ', t.sift.map((m) => (m ? '^' : ' ')).join('')],
    ['Error?     ', t.err.map((e, i) => (t.sift[i] ? (e ? '!' : '.') : ' ')).join('')],
  ];
  return (
    <>
      <p className="lead">First {t.alice_bits.length} transmitted qubits. <code>^</code> = bases matched (kept), <code>!</code> = error in the sifted key.</p>
      <div className="mono">{lines.map(([k, v]) => `${k} ${v}`).join('\n')}</div>
    </>
  );
}

function RunResult({ run }) {
  const s = run.summary;
  const funnel = [
    { step: 'Sent', bits: s.n_sent }, { step: 'Sifted', bits: s.n_sifted }, { step: 'After Sampling', bits: s.n_remaining },
    { step: 'After Leakage', bits: Math.max(0, s.n_remaining - s.leak_ec - s.leak_verify) }, { step: 'Final Key', bits: s.final_length },
  ];
  return (
    <Card title="Result">
      <Transmission t={run.transmission} />
      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="scroll">
          <table><tbody>
            <tr><td>Sifted Key</td><td><b>{s.n_sifted}</b> bits</td></tr>
            <tr><td>Compared Sample</td><td>{s.n_sample} bits ({s.sample_errors} errors)</td></tr>
            <tr><td>QBER (Sample)</td><td><b>{pct(s.qber_sample)}</b> <small>Ground Truth {pct(s.qber_true)}</small></td></tr>
            <tr><td>QBER Upper Bound</td><td>{pct(s.qber_upper)}</td></tr>
            <tr><td>Reconciliation Leakage</td><td>{s.leak_ec} + {s.leak_verify} verification bits</td></tr>
            <tr><td>Residual Errors</td><td>{s.residual_errors}</td></tr>
            <tr><td>Final Key</td><td><b>{s.final_length} bits</b> {s.accepted ? <span className="badge m-ok">Accepted</span> : <span className="badge m-violated">Aborted</span>}</td></tr>
          </tbody></table>
        </div>
        <div className="chart" style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={funnel} margin={{ left: 0, right: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="step" tick={{ fontSize: 11 }} /><YAxis /><Tooltip {...TOOLTIP} />
              <Bar dataKey="bits" fill={CHART.accent} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {!s.accepted && <p className="warn">{s.abort_reason}</p>}
      {s.accepted && run.key_preview && <p><small>Key Preview: <code>{run.key_preview}…</code></small></p>}
    </Card>
  );
}

function Controls({ onRun, busy }) {
  const [p, setP] = useState(DEFAULTS);
  const set = (k) => (v) => setP((o) => ({ ...o, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    const body = { ...p, noise_p: p.noise_model === 'none' ? 0 : p.noise_p };
    onRun(body);
  };
  return (
    <Card title="Run a BB84 Simulation" lead="Choose the channel conditions and run. Each run is saved to MongoDB.">
      <form onSubmit={submit}>
        <div className="form">
          <label>Qubits Transmitted: {p.n_qubits}
            <input type="range" min="256" max="8192" step="256" value={p.n_qubits} onChange={(e) => set('n_qubits')(Number(e.target.value))} />
            {p.n_qubits < 1024 && <small>Below about 1,000 qubits even a perfect channel cannot be certified.</small>}
          </label>
          <label>Eavesdropper (Intercept-Resend)
            <select value={String(p.eve_enabled)} onChange={(e) => set('eve_enabled')(e.target.value === 'true')}>
              <option value="false">Absent</option><option value="true">Present</option>
            </select>
          </label>
          <label>Share of Qubits Eve Intercepts: {Math.round(p.eve_fraction * 100)}%
            <input type="range" min="0" max="1" step="0.05" value={p.eve_fraction} disabled={!p.eve_enabled} onChange={(e) => set('eve_fraction')(Number(e.target.value))} />
          </label>
          <label>Channel Noise Model
            <select value={p.noise_model} onChange={(e) => set('noise_model')(e.target.value)}>
              {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Noise Parameter p: {p.noise_p.toFixed(2)}
            <input type="range" min="0" max="0.3" step="0.01" value={p.noise_p} disabled={p.noise_model === 'none'} onChange={(e) => set('noise_p')(Number(e.target.value))} />
          </label>
          <label>Abort Threshold on QBER Upper Bound
            <input type="number" min="0.01" max="0.25" step="0.01" value={p.max_qber} onChange={(e) => set('max_qber')(Number(e.target.value))} />
          </label>
        </div>
        <div className="row-actions">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? <Spinner text="Simulating…" /> : 'Run Simulation'}</button>
        </div>
      </form>
    </Card>
  );
}

function History({ runs, onClear }) {
  if (runs === null) {
    return <Card title="Run History (MongoDB)"><Skeleton className="h-5 w-full" /><Skeleton className="mt-3 h-5 w-5/6" /><Skeleton className="mt-3 h-5 w-2/3" /></Card>;
  }
  if (!runs.length) {
    return (
      <Card title="Run History (MongoDB)">
        <EmptyState title="No Simulations Yet" text="Run a BB84 simulation above. Each run is saved here so you can compare Eve-present and Eve-absent runs." />
      </Card>
    );
  }
  return (
    <Card title="Run History (MongoDB)">
      <div className="scroll">
        <table>
          <thead><tr><th>When</th><th>Qubits</th><th>Eve</th><th>Noise</th><th>QBER</th><th>Final Key</th><th>Status</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r._id}>
                <td>{new Date(r.createdAt).toLocaleTimeString()}</td><td>{r.summary.n_sent}</td>
                <td>{r.summary.eve ? `${Math.round(r.summary.eve_fraction * 100)}%` : 'Off'}</td>
                <td>{r.summary.noise_model === 'none' ? '–' : `${r.summary.noise_model} ${r.summary.noise_p}`}</td>
                <td>{pct(r.summary.qber_sample)}</td><td>{r.summary.final_length}</td>
                <td>{r.summary.accepted ? <span className="badge m-ok">Accepted</span> : <span className="badge m-violated">Aborted</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row-actions"><button className="btn small danger" onClick={onClear}>Clear History</button></div>
    </Card>
  );
}

function Experiments({ meta }) {
  const [state, setState] = useState(null);
  const [model, setModel] = useState('bitflip');
  const [error, setError] = useState(null);
  const refresh = useCallback(() => api.latestExperiments().then(setState).catch(setError), []);
  useEffect(() => { refresh(); }, [refresh]);
  const running = Boolean(state?.running);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [running, refresh]);

  const [starting, setStarting] = useState(false);
  const start = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try { await api.runExperiments({ n_qubits: 2048, reps: 3 }); await refresh(); } catch (e) { setError(e); } finally { setStarting(false); }
  };

  const result = state?.done?.result;
  const charts = useMemo(() => {
    if (!result) return null;
    const rows = result.grid.filter((g) => g.model === model);
    const ps = [...new Set(rows.map((g) => g.noise_p))].sort((a, b) => a - b);
    const at = (p, eve) => rows.find((g) => g.noise_p === p && g.eve === eve);
    return {
      qber: ps.map((p) => ({ p, 'Eve Absent': +(at(p, false).qber_mean * 100).toFixed(2), 'Eve Intercept-Resend': +(at(p, true).qber_mean * 100).toFixed(2) })),
      key: ps.map((p) => ({ p, 'Mean Final Key (Bits)': Math.round(at(p, false).final_len_mean) })),
      done: ps.map((p) => ({ p, 'Eve Absent': Math.round(at(p, false).accept_rate * 100), 'Eve Present': Math.round(at(p, true).accept_rate * 100) })),
      eve: result.eve_sweep.map((e) => ({ f: e.eve_fraction, Simulation: +(e.qber_mean * 100).toFixed(2), Theory: +(e.eve_fraction * 25).toFixed(2) })),
    };
  }, [result, model]);

  const axis = <XAxis dataKey="p" label={{ value: 'Noise Parameter p', position: 'insideBottom', offset: -2 }} height={44} />;
  const grid = <CartesianGrid stroke="rgba(255,255,255,0.1)" />;

  return (
    <Card title="Experiments A–D" lead="A: No Eve, No Noise · B: Eve, No Noise · C: Noise Only · D: Eve and Noise">
      <div className="row-actions" style={{ marginTop: 0, marginBottom: 8 }}>
        <button className="btn primary" onClick={start} disabled={running || starting}>{running || starting ? <Spinner text="Running (about 40 s)…" /> : 'Re-Run Experiments'}</button>
        <label>Noise Model&nbsp;
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 'auto' }}>
            {['bitflip', 'depolarizing', 'readout'].map((m) => <option key={m} value={m}>{meta.noise_labels[m]}</option>)}
          </select>
        </label>
        {result && <small>{result.n_qubits} Qubits × {result.reps} Repetitions per Setting</small>}
      </div>
      <ErrorBox error={error} />
      {state?.lastFailure && !result && <p className="error">Last batch failed: {state.lastFailure.error}</p>}
      {!state && !error && <div role="status" aria-label="Loading experiments"><Skeleton className="h-64 w-full" /></div>}
      {state && !result && !running && (
        <EmptyState title="No Experiment Batch Yet" text="Experiments A–D compare QBER with and without an eavesdropper across noise levels.">
          <button className="btn primary" onClick={start}>Run Experiments A–D</button>
        </EmptyState>
      )}
      {state && !result && running && <div role="status" className="py-6"><Skeleton className="h-64 w-full" /><p className="mt-3 text-center muted"><Spinner text="The first batch is being computed…" /></p></div>}
      {charts && (
        <div className="grid2">
          <div><b className="chart-title">QBER vs Noise</b><div className="chart"><ResponsiveContainer><LineChart data={charts.qber}>{grid}{axis}<YAxis unit="%" /><Tooltip {...TOOLTIP} /><Legend />
            <Line dataKey="Eve Absent" stroke={CHART.accent} strokeWidth={2} /><Line dataKey="Eve Intercept-Resend" stroke={CHART.red} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>
          <div><b className="chart-title">Eavesdropping Strength vs QBER</b><div className="chart"><ResponsiveContainer><LineChart data={charts.eve}>{grid}
            <XAxis dataKey="f" label={{ value: 'Fraction of Qubits Eve Intercepts', position: 'insideBottom', offset: -2 }} height={44} /><YAxis unit="%" /><Tooltip {...TOOLTIP} /><Legend />
            <Line dataKey="Theory" stroke={CHART.grey} strokeDasharray="5 5" dot={false} /><Line dataKey="Simulation" stroke={CHART.red} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>
          <div><b className="chart-title">Final Key Length vs Noise (No Eve)</b><div className="chart"><ResponsiveContainer><LineChart data={charts.key}>{grid}{axis}<YAxis /><Tooltip {...TOOLTIP} /><Legend />
            <Line dataKey="Mean Final Key (Bits)" stroke={CHART.green} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>
          <div><b className="chart-title">Protocol Completion vs Noise</b><div className="chart"><ResponsiveContainer><LineChart data={charts.done}>{grid}{axis}<YAxis unit="%" domain={[0, 100]} /><Tooltip {...TOOLTIP} /><Legend />
            <Line dataKey="Eve Absent" stroke={CHART.accent} strokeWidth={2} /><Line dataKey="Eve Present" stroke={CHART.red} strokeWidth={2} strokeDasharray="5 5" /></LineChart></ResponsiveContainer></div></div>
        </div>
      )}
    </Card>
  );
}

function LiveChannelCard() {
  const [spy, setSpy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);

  const runChannel = async (spyVal) => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.transmitChannel(spyVal, 2048);
      setRes(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const isAborted = res?.status === 'ABORTED';

  return (
    <Card
      title="Live Quantum-Safe Healthcare Channel (PQC + QKD Tri-Hybrid)"
      lead="Demonstrates 'QKD supplements PQC, doesn't replace it': Encrypts Eleanor Vance's Electronic Health Record with AES-256-GCM under a tri-hybrid key (X25519 + ML-KEM-768 + QKD)."
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <b>Eavesdropper Interception (Spy):</b>
        <button
          type="button"
          className="chip"
          onClick={() => { setSpy(false); runChannel(false); }}
          disabled={busy}
          style={!spy ? { background: '#10b981', color: '#fff', fontWeight: 600 } : undefined}
        >
          Spy OFF (Clean Link)
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => { setSpy(true); runChannel(true); }}
          disabled={busy}
          style={spy ? { background: '#ef4444', color: '#fff', fontWeight: 600 } : undefined}
        >
          Spy ON (Interception)
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => runChannel(spy)}
          disabled={busy}
          style={{ marginLeft: 'auto' }}
        >
          {busy ? <Spinner text="Simulating Channel…" /> : 'Transmit Patient Record (Live)'}
        </button>
      </div>

      {error && <p className="warn" style={{ color: '#ef4444' }}>{error}</p>}

      {res && (
        <div style={{ marginTop: 12 }}>
          {isAborted ? (
            <div style={{ borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: 14, borderRadius: 8 }}>
              <b style={{ color: '#ef4444', fontSize: 16 }}>🚨 HARD SECURITY BARRIER ENFORCED (TRANSMISSION ABORTED)</b>
              <p style={{ margin: '6px 0', fontSize: 14 }}>
                Observed QBER of <b>{(res.qkd.qber_observed * 100).toFixed(2)}%</b> exceeded the 11.00% security bound.
                Quantum no-cloning disturbance detected an eavesdropper on the optical link.
                Key derivation was halted immediately.
              </p>
              <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 13 }}>
                <span><b>Plaintext Leaked:</b> <code style={{ color: '#ef4444', background: '#fff', padding: '2px 6px', borderRadius: 4 }}>0 BYTES</code></span>
                <span><b>Transmitted Ciphertext:</b> <code>[BLOCKED BY QUANTUM INTERLOCK]</code></span>
              </div>
            </div>
          ) : (
            <div style={{ borderLeft: '4px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', padding: 14, borderRadius: 8 }}>
              <b style={{ color: '#10b981', fontSize: 16 }}>🛡️ SECURE ENCRYPTED TRANSMISSION VERIFIED</b>
              <p style={{ margin: '6px 0', fontSize: 14 }}>
                Quantum link verified clean (QBER {(res.qkd.qber_observed * 100).toFixed(2)}% &lt; 11.00%).
                Derived 256-bit AES-GCM session key binding Curve25519, NIST FIPS 203 ML-KEM-768, and QKD secret.
              </p>
              <div style={{ fontSize: 13, marginTop: 8 }}>
                <div><b>AES-GCM Nonce:</b> <code>{res.payload.nonce_hex}</code></div>
                <div><b>128-bit Auth Tag:</b> <code>{res.payload.tag_hex}</code></div>
                <div><b>Ciphertext (Hex):</b> <code style={{ wordBreak: 'break-all' }}>{res.payload.ciphertext_hex?.slice(0, 72)}... ({res.payload.ciphertext_hex?.length / 2} bytes)</code></div>
                <div><b>Bob Verification:</b> <span className="badge m-ok">Integrity Authenticated (0 Errors)</span></div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <b>Patient Record Payload (Decrypted / Clinical Enclave View):</b>
            <pre className="mono" style={{ padding: 10, borderRadius: 8, maxHeight: 150, overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
              {JSON.stringify(res.payload.decrypted_record || { patient_id: res.payload.patient_id, patient_name: res.payload.patient_name, status: "PROTECTED_IN_LOCAL_ENCLAVE" }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function QkdLab({ meta, run, setRun }) {
  const [runs, setRuns] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const loadRuns = useCallback(() => api.qkdRuns().then(setRuns).catch(setError), []);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const onRun = async (params) => {
    setBusy(true);
    setError(null);
    try { setRun(await api.runQkd(params)); loadRuns(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const clear = async () => {
    try { await api.clearQkdRuns(); setRuns([]); } catch (e) { setError(e); }
  };

  return (
    <>
      <LiveChannelCard />
      <Controls onRun={onRun} busy={busy} />
      <ErrorBox error={error} />
      {run && <RunResult run={run} />}
      <History runs={runs} onClear={clear} />
      <Experiments meta={meta} />
    </>
  );
}

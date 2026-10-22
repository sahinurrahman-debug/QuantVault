import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api.js';
import { CHART, Card, ErrorBox, Spinner, pct } from '../components/ui.jsx';

const DEFAULTS = { n_qubits: 2048, eve_enabled: false, eve_fraction: 1, noise_model: 'none', noise_p: 0, max_qber: 0.11 };
const MODELS = { none: 'Ideal channel', bitflip: 'Bit-flip (channel)', depolarizing: 'Depolarizing (channel)', readout: "Readout error (Bob's detector)" };
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
    { step: 'Sent', bits: s.n_sent }, { step: 'Sifted', bits: s.n_sifted }, { step: 'After sampling', bits: s.n_remaining },
    { step: 'After leakage', bits: Math.max(0, s.n_remaining - s.leak_ec - s.leak_verify) }, { step: 'Final key', bits: s.final_length },
  ];
  return (
    <Card title="Result" lead="Every figure comes from Qiskit circuits executed on Qiskit Aer.">
      <Transmission t={run.transmission} />
      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="scroll">
          <table><tbody>
            <tr><td>Sifted key</td><td><b>{s.n_sifted}</b> bits</td></tr>
            <tr><td>Compared sample</td><td>{s.n_sample} bits ({s.sample_errors} errors)</td></tr>
            <tr><td>QBER (sample)</td><td><b>{pct(s.qber_sample)}</b> <small>simulator ground truth {pct(s.qber_true)}</small></td></tr>
            <tr><td>QBER upper bound</td><td>{pct(s.qber_upper)} <small>(eps = {run.security.eps_pe})</small></td></tr>
            <tr><td>Reconciliation leakage</td><td>{s.leak_ec} + {s.leak_verify} verification bits</td></tr>
            <tr><td>Residual errors</td><td>{s.residual_errors}</td></tr>
            <tr><td>Final key</td><td><b>{s.final_length} bits</b> {s.accepted ? <span className="badge m-ok">accepted</span> : <span className="badge m-violated">aborted</span>}</td></tr>
          </tbody></table>
        </div>
        <div className="chart" style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={funnel} margin={{ left: 0, right: 8 }}>
              <CartesianGrid stroke="rgba(128,128,128,.25)" vertical={false} />
              <XAxis dataKey="step" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
              <Bar dataKey="bits" fill={CHART.accent} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {!s.accepted && <p className="warn">{s.abort_reason}</p>}
      {s.accepted && (
        <p><small>Accepted means the simplified checks passed. It does not prove that no eavesdropper exists or that the key is formally secure.{run.key_preview && <> Key preview: <code>{run.key_preview}…</code></>}</small></p>
      )}
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
    <Card title="Run a BB84 simulation" lead="Alice prepares states, Eve optionally intercepts and resends, Bob measures. Results are saved to MongoDB.">
      <form onSubmit={submit}>
        <div className="form">
          <label>Qubits transmitted: {p.n_qubits}
            <input type="range" min="256" max="8192" step="256" value={p.n_qubits} onChange={(e) => set('n_qubits')(Number(e.target.value))} />
          </label>
          <label>Eavesdropper (intercept-resend)
            <select value={String(p.eve_enabled)} onChange={(e) => set('eve_enabled')(e.target.value === 'true')}>
              <option value="false">Absent</option><option value="true">Present</option>
            </select>
          </label>
          <label>Share of qubits Eve intercepts: {Math.round(p.eve_fraction * 100)}%
            <input type="range" min="0" max="1" step="0.05" value={p.eve_fraction} disabled={!p.eve_enabled} onChange={(e) => set('eve_fraction')(Number(e.target.value))} />
          </label>
          <label>Channel noise model
            <select value={p.noise_model} onChange={(e) => set('noise_model')(e.target.value)}>
              {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Noise parameter p: {p.noise_p.toFixed(2)}
            <input type="range" min="0" max="0.3" step="0.01" value={p.noise_p} disabled={p.noise_model === 'none'} onChange={(e) => set('noise_p')(Number(e.target.value))} />
          </label>
          <label>Operational abort threshold on QBER upper bound
            <input type="number" min="0.01" max="0.25" step="0.01" value={p.max_qber} onChange={(e) => set('max_qber')(Number(e.target.value))} />
            <small>A configurable setting, not a universal BB84 limit.</small>
          </label>
        </div>
        <div className="row-actions">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? <Spinner text="Simulating…" /> : 'Run simulation'}</button>
        </div>
      </form>
    </Card>
  );
}

function History({ runs, onClear }) {
  if (!runs.length) return null;
  return (
    <Card title="Run history (MongoDB)">
      <div className="scroll">
        <table>
          <thead><tr><th>When</th><th>Qubits</th><th>Eve</th><th>Noise</th><th>QBER</th><th>Final key</th><th>Status</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r._id}>
                <td>{new Date(r.createdAt).toLocaleTimeString()}</td><td>{r.summary.n_sent}</td>
                <td>{r.summary.eve ? `${Math.round(r.summary.eve_fraction * 100)}%` : 'off'}</td>
                <td>{r.summary.noise_model === 'none' ? '–' : `${r.summary.noise_model} ${r.summary.noise_p}`}</td>
                <td>{pct(r.summary.qber_sample)}</td><td>{r.summary.final_length}</td>
                <td>{r.summary.accepted ? <span className="badge m-ok">accepted</span> : <span className="badge m-violated">aborted</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row-actions"><button className="btn small danger" onClick={onClear}>Clear history</button></div>
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

  const start = async () => {
    setError(null);
    try { await api.runExperiments({ n_qubits: 2048, reps: 3 }); refresh(); } catch (e) { setError(e); }
  };

  const result = state?.done?.result;
  const charts = useMemo(() => {
    if (!result) return null;
    const rows = result.grid.filter((g) => g.model === model);
    const ps = [...new Set(rows.map((g) => g.noise_p))].sort((a, b) => a - b);
    const at = (p, eve) => rows.find((g) => g.noise_p === p && g.eve === eve);
    return {
      qber: ps.map((p) => ({ p, 'Eve absent': +(at(p, false).qber_mean * 100).toFixed(2), 'Eve intercept-resend': +(at(p, true).qber_mean * 100).toFixed(2) })),
      key: ps.map((p) => ({ p, 'mean final key (bits)': Math.round(at(p, false).final_len_mean) })),
      done: ps.map((p) => ({ p, 'Eve absent': Math.round(at(p, false).accept_rate * 100), 'Eve present': Math.round(at(p, true).accept_rate * 100) })),
      eve: result.eve_sweep.map((e) => ({ f: e.eve_fraction, simulation: +(e.qber_mean * 100).toFixed(2), theory: +(e.eve_fraction * 25).toFixed(2) })),
    };
  }, [result, model]);

  const axis = <XAxis dataKey="p" label={{ value: 'noise parameter p', position: 'insideBottom', offset: -2 }} height={44} />;
  const grid = <CartesianGrid stroke="rgba(128,128,128,.25)" />;

  return (
    <Card title="Experiments A–D" lead="A: no Eve, no noise · B: Eve, no noise (expect ~25%) · C: noise only · D: Eve and noise. Means over repeated runs; they fluctuate around expectations.">
      <div className="row-actions" style={{ marginTop: 0, marginBottom: 8 }}>
        <button className="btn primary" onClick={start} disabled={running}>{running ? <Spinner text="Running (about 40 s)…" /> : 'Re-run experiments'}</button>
        <label>Noise model&nbsp;
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 'auto' }}>
            {['bitflip', 'depolarizing', 'readout'].map((m) => <option key={m} value={m}>{meta.noise_labels[m]}</option>)}
          </select>
        </label>
        {result && <small>{result.n_qubits} qubits × {result.reps} repetitions per setting ({result.runs} runs)</small>}
      </div>
      <ErrorBox error={error} />
      {state?.lastFailure && !result && <p className="error">Last batch failed: {state.lastFailure.error}</p>}
      {!result && !running && <p className="muted">No completed batch yet.</p>}
      {!result && running && <p className="muted"><Spinner text="The first batch is being computed…" /></p>}
      {charts && (
        <div className="grid2">
          <div><b>QBER vs noise</b><div className="chart"><ResponsiveContainer><LineChart data={charts.qber}>{grid}{axis}<YAxis unit="%" /><Tooltip /><Legend />
            <Line dataKey="Eve absent" stroke={CHART.accent} strokeWidth={2} /><Line dataKey="Eve intercept-resend" stroke={CHART.red} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>
          <div><b>Eavesdropping strength vs QBER</b><div className="chart"><ResponsiveContainer><LineChart data={charts.eve}>{grid}
            <XAxis dataKey="f" label={{ value: 'fraction of qubits Eve intercepts', position: 'insideBottom', offset: -2 }} height={44} /><YAxis unit="%" /><Tooltip /><Legend />
            <Line dataKey="theory" stroke={CHART.grey} strokeDasharray="5 5" dot={false} /><Line dataKey="simulation" stroke={CHART.red} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>
          <div><b>Final key length vs noise (no Eve)</b><div className="chart"><ResponsiveContainer><LineChart data={charts.key}>{grid}{axis}<YAxis /><Tooltip /><Legend />
            <Line dataKey="mean final key (bits)" stroke={CHART.green} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>
          <div><b>Protocol completion vs noise</b><div className="chart"><ResponsiveContainer><LineChart data={charts.done}>{grid}{axis}<YAxis unit="%" domain={[0, 100]} /><Tooltip /><Legend />
            <Line dataKey="Eve absent" stroke={CHART.accent} strokeWidth={2} /><Line dataKey="Eve present" stroke={CHART.red} strokeWidth={2} strokeDasharray="5 5" /></LineChart></ResponsiveContainer></div></div>
        </div>
      )}
      {charts && <p><small>Bit-flip noise is a Pauli-X error: it leaves X-basis states unchanged, so only Z-basis bits are affected and QBER is about p/2. Readout noise flips Bob's result in both bases (QBER about p). p is the parameter of the chosen Aer noise model, not a universal physical noise measure.</small></p>}
    </Card>
  );
}

export default function QkdLab({ meta }) {
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const loadRuns = useCallback(() => api.qkdRuns().then(setRuns).catch(setError), []);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const onRun = async (params) => {
    setBusy(true);
    setError(null);
    try { setRun(await api.runQkd(params)); loadRuns(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const clear = async () => { await api.clearQkdRuns(); setRuns([]); };

  return (
    <>
      <Controls onRun={onRun} busy={busy} />
      <ErrorBox error={error} />
      {run && <RunResult run={run} />}
      <History runs={runs} onClear={clear} />
      <Experiments meta={meta} />
      <Card title="Model limitations">
        <ul className="clean">{meta.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </Card>
    </>
  );
}

"""QuantVault command-line entry point.

Full suite of post-quantum risk, hardware QKD, and cryptographic tools:
    python -m src.main                 # full end-to-end pipeline
    python -m src.main risk            # probabilistic Mosca + risk prioritization
    python -m src.main risk --sensitivity # 1,000-trial weight sensitivity Monte Carlo
    python -m src.main qkd             # BB84 simulation on Qiskit Aer
    python -m src.main bb84-hw         # parallel packed BB84 on FakeMarrakesh 156-qubit chip
    python -m src.main e91             # E91 entanglement QKD + CHSH Bell test
    python -m src.main e91 --eve       # E91 with intercept-resend attack (collapses S <= 2)
    python -m src.main clone           # optimal phase-covariant cloning attack (~14.6% QBER)
    python -m src.main decoy           # decoy-state BB84 & GLLP key rate against PNS attacks
    python -m src.main pqc             # hybrid ML-KEM-768 + X25519 + QKD session key derivation
    python -m src.main scan --host localhost # active TLS scanner with allow-list guard
    python -m src.main qkd-calc --distance 40 # QKD feasibility & secret key rate vs distance
    python -m src.main dashboard       # build static dashboard
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


def cmd_risk(args) -> None:
    from .risk import RiskConfig, analyse_inventory, overview, weight_sensitivity_analysis

    results = analyse_inventory(cfg=RiskConfig(threat_horizon_years=args.horizon))
    o = overview(results)
    print(f"\nQuantVault risk assessment | assumed threat horizon Z = {args.horizon:g} years")
    print(f"{o['total_assets']} assets | {o['quantum_vulnerable']} quantum-vulnerable | "
          f"{o['mosca_violated']} violate Mosca (X+Y>Z) | {o['unknown_config']} unknown | "
          f"inventory completeness {o['inventory_completeness']:.0%}\n")
    print(f"{'#':>2}  {'Asset':<36}{'Tier':<10}{'Raw R':>7}{'Tier R':>8}{'Exposure':>10}  {'Mosca':<18} P(violation)")
    for r in results:
        m = r["mosca"]
        mosca = m["status"].replace("_", " ")
        if m["margin"] is not None and m["status"] in ("violated", "ok"):
            mosca += f" ({m['margin']:+.0f} yr)"
        raw_r = r["risk_score_raw"]
        tier_r = r["risk_score_clamped"]
        p_viol = m.get("p_violation", 0.0)
        p_str = f"{p_viol:.0%}" if m["status"] != "not_applicable" else "N/A"
        print(f"{r['rank']:>2}  {r['name']:<36}{r['tier']:<10}{raw_r:>7.1f}{tier_r:>8.1f}{r['security_exposure']:>10.1f}  {mosca:<18} {p_str:>12}")
    print("\nMosca's inequality is a prioritisation heuristic; Z is an assumption, not a prediction.")

    if getattr(args, "sensitivity", False):
        print("\nRunning weight sensitivity Monte Carlo (1,000 trials, +/-30% weight jitter)...")
        sens = weight_sensitivity_analysis(seed=42)
        print(f"  Mean Kendall tau rank correlation: {sens['mean_kendall_tau']:.3f} (95% CI: [{sens['ci_95_tau'][0]:.3f}, {sens['ci_95_tau'][1]:.3f}])")
        print(f"  Top-5 asset retention rate:        {sens['top5_exact_match_rate']:.1%} (mean top-5 overlap {sens['mean_top5_overlap_pct']:.1f}%)")
        print(f"  Ranking robustness verdict:        {'ROBUST (ranking does not depend on arbitrary weights)' if sens['robust'] else 'SENSITIVE'}")
        from .e91 import results_dir

        out = results_dir() / "weight_sensitivity_benchmark.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(sens, indent=2), encoding="utf-8")
        print(f"  Saved to {out}")


def cmd_qkd(args) -> None:
    from .bb84 import BB84Config
    from .postprocessing import run_qkd

    cfg = BB84Config(n_qubits=args.qubits, eve_enabled=args.eve, eve_fraction=args.eve_fraction,
                     noise_model=args.noise if args.p else "none", noise_p=args.p, seed=args.seed)
    r = run_qkd(cfg)
    print(f"\nBB84 on Qiskit Aer | Eve {'on' if args.eve else 'off'} | noise {cfg.noise_model} p={cfg.noise_p}")
    print(f"  qubits sent        {r.n_sent}")
    print(f"  sifted key         {r.n_sifted}")
    print(f"  compared sample    {r.n_sample}  ({r.sample_errors} errors)")
    print(f"  QBER (sample)      {r.qber_sample:.2%}   [simulator ground truth {r.qber_true:.2%}]")
    print(f"  QBER upper bound   {r.qber_upper:.2%}  (eps={r.security.eps_pe:g})")
    print(f"  reconciliation     leak {r.leak_ec} bits + {r.leak_verify} verification bits, residual errors {r.residual_errors}")
    print(f"  final key length   {r.final_length} bits")
    print(f"  result             {'ACCEPTED (simplified checks passed; not a security proof)' if r.accepted else 'ABORTED: ' + r.abort_reason}")


def cmd_bb84_hw(args) -> None:
    from .bb84_hardware import HardwareBB84Config, run_hardware_bb84

    cfg = HardwareBB84Config(
        n_pairs_per_circuit=args.pairs,
        n_circuits=args.circuits,
        shots_per_circuit=args.shots,
        backend_name=args.backend,
    )
    r = run_hardware_bb84(cfg)
    print("\nBB84 Multi-Qubit Parallel Packing on Hardware")
    print(f"  Backend:             {r.backend}")
    print(f"  Job ID:              {r.job_id}")
    print(f"  Pairs/circuit:       {r.pairs_per_circuit} (Parallel width: {r.pairs_per_circuit * 2} qubits)")
    print(f"  Circuits executed:   {r.num_circuits}")
    print(f"  Sifted bits tested:  {r.sifted_bits_analyzed:,}")
    print(f"  Hardware QBER:       {r.hardware_qber:.2%} (95% CI: [{r.qber_95_ci[0]:.2%}, {r.qber_95_ci[1]:.2%}])")
    print(f"  Ideal Aer QBER:      {r.ideal_aer_qber:.2%}")
    print(f"  Status:              {r.status}")


def cmd_e91(args) -> None:
    from .e91 import E91Config, run_e91_experiment

    cfg = E91Config(
        shots_per_setting=args.shots,
        key_shots=args.shots,
        eve_enabled=args.eve,
        backend_name=args.backend,
        ibm_backend=args.ibm_backend,
        ibm_token=args.token,
        seed=args.seed,
    )
    r = run_e91_experiment(cfg)
    print(f"\nE91 Entanglement-based QKD + CHSH Bell Test | Eve {'ON (intercept-resend)' if args.eve else 'OFF'}")
    print(f"  Backend:           {r.backend}")
    print(f"  Job ID:            {r.job_id}")
    print(f"  Shots/setting:     {r.shots_per_setting:,}")
    print("\n  CHSH Correlations E(a, b):")
    for name, s in r.settings.items():
        print(f"    {name:<8} theta_A={s['theta_a']:.2f}, theta_B={s['theta_b']:+.2f} -> E = {s['e_val']:+.4f} (std err {s['std_err']:.4f})")
    print(f"\n  Bell parameter S:  {r.s_value:.4f}  (std err {r.s_std_err:.4f})")
    print(f"  95% Conf. Int.:    [{r.ci_95[0]:.4f}, {r.ci_95[1]:.4f}]")
    print("  Classical limit:   |S| <= 2.0000 (Local Hidden Variable theories)")
    print("  Tsirelson bound:   S <= 2.8284 (Quantum maximum: 2*sqrt(2))")
    print(f"  Significance:      {r.sigma_above_classical:+.1f} sigma above classical bound")
    print("\n  Matching Key Basis (A0=0, B0=0):")
    print(f"    Shots:           {r.key_shots:,}")
    print(f"    QBER:            {r.qber_key:.2%}")
    print(f"\n  Verdict:           {r.verdict}")
    if r.key_accepted:
        print("  Secret key:        not extracted (E91 certifies the channel; the BB84 pipeline distils keys)")


def cmd_clone(args) -> None:
    from .cloning_and_decoy import run_optimal_cloning_simulation

    print(f"\nSimulating Optimal 1->2 Symmetric Phase-Covariant Quantum Cloning ({args.qubits:,} qubits)...")
    res = run_optimal_cloning_simulation(n_qubits=args.qubits, seed=args.seed)
    print(f"  Theoretical QBER:   {res.theoretical_qber:.2%}  (1 - 1/sqrt(2))/2")
    print(f"  Simulated QBER:     {res.simulated_qber:.2%}")
    print(f"  Eve Clone Fidelity: {res.eve_fidelity:.2%}")
    print(f"  Bob Clone Fidelity: {res.bob_fidelity:.2%}")
    print(f"  Exceeds 11% Limit:  {res.detected_by_threshold_11pct}")
    print(f"  Status:             {res.status}")


def cmd_decoy(args) -> None:
    from .cloning_and_decoy import DecoyStateConfig, analyze_decoy_state_bb84

    loss = args.loss if args.loss is not None else (args.distance * 0.2)
    cfg = DecoyStateConfig(channel_loss_db=loss)
    res = analyze_decoy_state_bb84(cfg)
    print(f"\nDecoy-State BB84 Analysis (Channel Loss = {loss:.1f} dB, ~{loss/0.2:.0f} km fiber)")
    print(f"  Transmittance (eta):       {res.transmittance:.6f}")
    print(f"  Signal Gain (Q_mu):        {res.gain_signal:.6f}")
    print(f"  Decoy Gain (Q_nu):         {res.gain_decoy:.6f}")
    print(f"  Signal QBER (E_mu):        {res.qber_signal:.2%}")
    print(f"  Single-photon Yield (Y1):  {res.yield_single_photon:.6f}")
    print(f"  Single-photon Error (e1):  {res.error_single_photon:.2%}")
    print(f"  GLLP Key Rate/Pulse:       {res.gllp_secure_rate_per_pulse:.6e}")
    print(f"  Status:                    {res.status}")


def cmd_pqc(args) -> None:
    from .pqc import execute_full_hybrid_exchange

    res = execute_full_hybrid_exchange(args.qkd_key)
    print("\nHybrid Post-Quantum Cryptography & QKD Session Key Derivation")
    print(f"  X25519 Secret (ECDH):      {res.x25519_shared_secret_hex[:16]}... ({len(res.x25519_shared_secret_hex)//2} bytes)")
    print(f"  ML-KEM-768 Secret (FIPS):  {res.mlkem_shared_secret_hex[:16]}... ({len(res.mlkem_shared_secret_hex)//2} bytes)")
    print(f"  QKD Shared Secret:         {res.qkd_shared_secret_hex[:16]}... ({len(res.qkd_shared_secret_hex)//2} bytes)")
    print(f"  Derived Session Key:       {res.hybrid_session_key_hex}")
    print(f"  Defense-in-depth:          {res.defense_in_depth_summary}")


def cmd_scan(args) -> None:
    from .scanner import scan_tls_endpoint, import_cyclonedx_cbom, import_sslyze_report, ScannerError

    if args.cbom:
        assets = import_cyclonedx_cbom(args.cbom)
        print(f"\nImported {len(assets)} cryptographic assets from CycloneDX CBOM '{args.cbom}':")
        for a in assets:
            print(f"  {a['id']:<10} {a['name']:<30} KE: {a['key_establishment']} Sig: {a['signature']}")
        return

    if args.sslyze:
        assets = import_sslyze_report(args.sslyze)
        print(f"\nImported {len(assets)} servers from SSLyze report '{args.sslyze}':")
        for a in assets:
            print(f"  {a['id']:<10} {a['name']:<30} KE: {a['key_establishment']} Sig: {a['signature']}")
        return

    try:
        res = scan_tls_endpoint(args.host, port=args.port)
        print(f"\nLive TLS Discovery Scan for '{args.host}:{args.port}' (Allow-list guarded)")
        print(f"  TLS Version:        {res['tls_version']}")
        print(f"  Cipher Suite:       {res['cipher_suite']} ({res['cipher_bits']} bits)")
        print(f"  Key Establishment:  {res['key_establishment']} {'[PQC HYBRID]' if res['is_pqc_hybrid'] else '[CLASSICAL]'}")
        print(f"  Signature / Cert:   {res['signature_algorithm']} ({res['cert_key_type']})")
        print(f"  Symmetric Cipher:   {res['symmetric_cipher']}")
        print(f"  Hash Algorithm:     {res['hash_algorithm']}")
    except ScannerError as e:
        print(f"\nScan blocked or failed: {e}")


def cmd_qkd_calc(args) -> None:
    from .qkd_calc import evaluate_link_feasibility

    res = evaluate_link_feasibility(args.distance)
    print(f"\nQKD Link Feasibility Assessment ({args.distance:g} km Fibre)")
    print(f"  Channel Loss:           {res.channel_loss_db:.1f} dB (0.2 dB/km at 1550 nm)")
    print(f"  Total Transmittance:    {res.total_transmittance:.6e}")
    print(f"  Estimated QBER:         {res.qber:.2%}")
    print(f"  Secret Key Rate:        {res.secret_key_rate_kbps:.1f} kbit/s")
    print(f"  Unrepeatered Limit:     {res.max_unrepeatered_distance_km:.0f} km")
    print(f"  Trusted Relays Needed:  {res.trusted_relays_needed}")
    print(f"  Recommendation:         {res.recommendation}")


def cmd_channel(args) -> None:
    from .channel import run_quantum_safe_channel

    print(f"\nLive Quantum-Safe Channel Demonstration (Spy: {'ON [Interception]' if args.spy else 'OFF [Clean Fiber]'})")
    res = run_quantum_safe_channel(spy=args.spy, qkd_qubits=args.qubits)
    print(f"  Channel Status:      {res['status']}")
    print(f"  Spy Detected:        {res['spy_detected']}")
    print(f"  Observed QBER:       {res['qkd']['qber_observed']:.2%} (Threshold: {res['qkd']['qber_threshold']:.2%})")
    print(f"  PQC Status:          {res['pqc']['status']}")
    print(f"  Target Record:       {res['payload']['patient_id']} ({res['payload']['patient_name']})")
    print(f"  Plaintext Transmit:  {res['payload']['plaintext_transmitted']}")
    print(f"  Plaintext Leaked:    {res['payload']['plaintext_bytes_leaked']} bytes")
    if res['payload']['ciphertext_hex']:
        print(f"  Ciphertext (GCM):    {res['payload']['ciphertext_hex'][:32]}... ({len(res['payload']['ciphertext_hex'])//2} bytes)")
        print(f"  Auth Tag (128-bit):  {res['payload']['tag_hex']}")
        print(f"  Integrity Verified:  {res['payload']['integrity_verified']}")
    print(f"  Verdict:             {res['verdict']}")


def cmd_report(args) -> None:
    from .report import generate_board_report
    from .risk import RiskConfig

    cfg = RiskConfig(threat_horizon_years=args.horizon)
    res = generate_board_report(cfg=cfg, output_md_path=args.output, output_html_path=args.html)
    print("\nQuantVault Executive Board Migration Plan Generated:")
    print(f"  Target Assets:       {res['total_assets']} systems evaluated")
    print(f"  Mosca Violations:    {res['mosca_violated']} systems expired under Z={args.horizon:.0f}y")
    print(f"  Urgent Reviews:      {res['urgent_review']} Critical/High priority systems")
    print(f"  Sensitivity Tau:     {res['sensitivity_tau']} (Robust)")
    print(f"  Markdown Document:   {res['markdown_path']}")
    print(f"  Printable HTML/PDF:  {res['html_path']}")


def cmd_dashboard(args) -> None:
    from .dashboard import build_dashboard
    from .experiments import run_eve_sweep, run_grid

    n, reps = (1024, 3) if args.quick else (2048, 5)
    print(f"Running QKD experiments A-D ({n} qubits, {reps} repetitions per setting)...")
    grid = run_grid(n_qubits=n, reps=reps)
    sweep = run_eve_sweep(n_qubits=n, reps=reps)
    out = build_dashboard(grid, sweep, n, DOCS / "dashboard.html", DOCS / "figures", demo_qubits=n)
    print(f"Dashboard written to {out.relative_to(ROOT)}")
    print(f"Figures written to {(DOCS / 'figures').relative_to(ROOT)}")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="python -m src.main", description="QuantVault Cryptographic Security Framework")
    p.add_argument("--quick", action="store_true", help="smaller experiment grid (faster)")
    sub = p.add_subparsers(dest="cmd")

    # 1. Risk
    r = sub.add_parser("risk", help="print the risk assessment")
    r.add_argument("--horizon", type=float, default=15.0, help="assumed years to a relevant quantum computer (Z)")
    r.add_argument("--sensitivity", action="store_true", help="run weight-sensitivity Monte Carlo analysis")

    # 2. BB84
    q = sub.add_parser("qkd", help="run one BB84 simulation")
    q.add_argument("--qubits", type=int, default=2048)
    q.add_argument("--eve", action="store_true", help="enable intercept-resend eavesdropper")
    q.add_argument("--eve-fraction", type=float, default=1.0)
    q.add_argument("--noise", choices=("bitflip", "depolarizing", "readout"), default="depolarizing")
    q.add_argument("--p", type=float, default=0.0, help="noise-model parameter")
    q.add_argument("--seed", type=int, default=None)

    # 3. BB84 Hardware
    bh = sub.add_parser("bb84-hw", help="run parallel packed BB84 on FakeMarrakesh / IBM hardware")
    bh.add_argument("--pairs", type=int, default=20, help="pairs packed per circuit (width = 2*pairs)")
    bh.add_argument("--circuits", type=int, default=5, help="number of parallel circuits")
    bh.add_argument("--shots", type=int, default=200, help="shots per circuit")
    bh.add_argument("--backend", default="fake_marrakesh", choices=("fake_marrakesh", "aer", "ibm"))

    # 4. E91 CHSH Bell Test
    e = sub.add_parser("e91", help="run E91 entanglement-based QKD with CHSH Bell test")
    e.add_argument("--shots", type=int, default=4000, help="shots per CHSH setting")
    e.add_argument("--eve", action="store_true", help="enable intercept-resend eavesdropper (breaks Bell inequality)")
    e.add_argument("--backend", choices=("aer", "fake_marrakesh", "ibm"), default="fake_marrakesh")
    e.add_argument("--ibm-backend", type=str, default="ibm_brisbane")
    e.add_argument("--token", type=str, default=None)
    e.add_argument("--seed", type=int, default=42)

    # 5. Optimal Cloning
    cl = sub.add_parser("clone", help="simulate optimal phase-covariant cloning attack")
    cl.add_argument("--qubits", type=int, default=4000)
    cl.add_argument("--seed", type=int, default=42)

    # 6. Decoy State
    dc = sub.add_parser("decoy", help="decoy-state BB84 & GLLP key rate against PNS attacks")
    dc.add_argument("--loss", type=float, default=None, help="channel loss in dB (e.g. 8.0 dB)")
    dc.add_argument("--distance", type=float, default=40.0, help="link distance in km (at standard 0.2 dB/km fiber loss)")

    # 7. PQC Hybrid
    pq = sub.add_parser("pqc", help="run hybrid ML-KEM-768 + X25519 + QKD session key derivation")
    pq.add_argument("--qkd-key", type=str, default=None, help="hex string of QKD key")

    # 8. Discovery Scanner
    sc = sub.add_parser("scan", help="active TLS scanner with allow-list guard or CBOM/SSLyze import")
    sc.add_argument("--host", type=str, default="localhost", help="target host to inspect")
    sc.add_argument("--port", type=int, default=443, help="port number")
    sc.add_argument("--cbom", type=str, default=None, help="path to CycloneDX CBOM JSON file")
    sc.add_argument("--sslyze", type=str, default=None, help="path to SSLyze JSON output file")

    # 9. QKD Feasibility Calculator
    qc = sub.add_parser("qkd-calc", help="quantitative QKD secret key rate vs distance calculator")
    qc.add_argument("--distance", type=float, default=40.0, help="link distance in km")

    # 10. Live Quantum-Safe Channel
    ch = sub.add_parser("channel", help="live quantum-safe channel encrypting sample patient EHR record with AES-GCM")
    ch.add_argument("--spy", action="store_true", help="enable active eavesdropper on the quantum link")
    ch.add_argument("--qubits", type=int, default=2048, help="number of qubits for QKD")

    # 11. Board Migration Report
    rp = sub.add_parser("report", help="generate formal executive board migration report (Markdown & printable HTML)")
    rp.add_argument("--output", type=str, default="docs/board_migration_report.md", help="output path for Markdown report")
    rp.add_argument("--html", type=str, default="docs/board_migration_report.html", help="output path for printable HTML report")
    rp.add_argument("--horizon", type=float, default=15.0, help="threat horizon Z in years")

    # 12. Dashboard
    d = sub.add_parser("dashboard", help="run experiments and build docs/dashboard.html")
    d.add_argument("--quick", action="store_true")

    args = p.parse_args(argv)
    if args.cmd == "risk":
        cmd_risk(args)
    elif args.cmd == "qkd":
        cmd_qkd(args)
    elif args.cmd == "bb84-hw":
        cmd_bb84_hw(args)
    elif args.cmd == "e91":
        cmd_e91(args)
    elif args.cmd == "clone":
        cmd_clone(args)
    elif args.cmd == "decoy":
        cmd_decoy(args)
    elif args.cmd == "pqc":
        cmd_pqc(args)
    elif args.cmd == "scan":
        cmd_scan(args)
    elif args.cmd == "qkd-calc":
        cmd_qkd_calc(args)
    elif args.cmd == "channel":
        cmd_channel(args)
    elif args.cmd == "report":
        cmd_report(args)
    elif args.cmd == "dashboard":
        cmd_dashboard(args)
    else:  # full pipeline
        args.horizon = 15.0
        args.sensitivity = True
        cmd_risk(args)
        args.qubits, args.eve, args.eve_fraction, args.noise, args.p, args.seed = 2048, False, 1.0, "depolarizing", 0.0, 1
        cmd_qkd(args)
        args.eve = True
        cmd_qkd(args)
        args.shots = 2048 if args.quick else 4000
        args.backend = "fake_marrakesh"
        args.ibm_backend = "ibm_brisbane"
        args.token = None
        args.seed = 42
        args.eve = False
        cmd_e91(args)
        args.eve = True
        cmd_e91(args)
        cmd_dashboard(args)


if __name__ == "__main__":
    main()

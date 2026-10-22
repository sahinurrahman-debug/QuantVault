"""QuantVault command-line entry point.

    python -m src.main                 # full pipeline: risk + QKD experiments + dashboard
    python -m src.main --quick         # same, with a smaller/faster experiment grid
    python -m src.main risk --horizon 12
    python -m src.main qkd --qubits 4096 --eve --noise readout --p 0.03
    python -m src.main dashboard
"""

from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


def cmd_risk(args) -> None:
    from .risk import RiskConfig, analyse_inventory, overview

    results = analyse_inventory(cfg=RiskConfig(threat_horizon_years=args.horizon))
    o = overview(results)
    print(f"\nQuantVault risk assessment | assumed threat horizon Z = {args.horizon:g} years")
    print(f"{o['total_assets']} assets | {o['quantum_vulnerable']} quantum-vulnerable | "
          f"{o['mosca_violated']} violate Mosca (X+Y>Z) | {o['unknown_config']} unknown | "
          f"inventory completeness {o['inventory_completeness']:.0%}\n")
    print(f"{'#':>2}  {'Asset':<36}{'Tier':<10}{'R':>6}{'Exposure':>10}  Mosca")
    for r in results:
        m = r["mosca"]
        mosca = m["status"].replace("_", " ")
        if m["margin"] is not None and m["status"] in ("violated", "ok"):
            mosca += f" ({m['margin']:+.0f} yr)"
        print(f"{r['rank']:>2}  {r['name']:<36}{r['tier']:<10}{r['risk_score']:>6}{r['security_exposure']:>10}  {mosca}")
    print("\nMosca's inequality is a prioritisation heuristic; Z is an assumption, not a prediction.")


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
    p = argparse.ArgumentParser(prog="python -m src.main", description="QuantVault")
    p.add_argument("--quick", action="store_true", help="smaller experiment grid (faster)")
    sub = p.add_subparsers(dest="cmd")

    r = sub.add_parser("risk", help="print the risk assessment")
    r.add_argument("--horizon", type=float, default=15.0, help="assumed years to a relevant quantum computer (Z)")

    q = sub.add_parser("qkd", help="run one BB84 simulation")
    q.add_argument("--qubits", type=int, default=2048)
    q.add_argument("--eve", action="store_true", help="enable intercept-resend eavesdropper")
    q.add_argument("--eve-fraction", type=float, default=1.0)
    q.add_argument("--noise", choices=("bitflip", "depolarizing", "readout"), default="depolarizing")
    q.add_argument("--p", type=float, default=0.0, help="noise-model parameter")
    q.add_argument("--seed", type=int, default=None)

    d = sub.add_parser("dashboard", help="run experiments and build docs/dashboard.html")
    d.add_argument("--quick", action="store_true")

    args = p.parse_args(argv)
    if args.cmd == "risk":
        cmd_risk(args)
    elif args.cmd == "qkd":
        cmd_qkd(args)
    elif args.cmd == "dashboard":
        cmd_dashboard(args)
    else:  # full pipeline
        args.horizon = 15.0
        cmd_risk(args)
        args.qubits, args.eve, args.eve_fraction, args.noise, args.p, args.seed = 2048, False, 1.0, "depolarizing", 0.0, 1
        cmd_qkd(args)
        args.eve = True
        cmd_qkd(args)
        cmd_dashboard(args)


if __name__ == "__main__":
    main()

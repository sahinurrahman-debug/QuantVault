"""Build the self-contained QuantVault dashboard (``docs/dashboard.html``).

The page is a single HTML file with embedded data and figures: no server and
no packages beyond those in ``requirements.txt``. Risk results are
pre-computed for every threat horizon from 5 to 40 years, so the slider is
instant and the browser never re-implements the risk logic.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pandas as pd

from .bb84 import BB84Config
from .comparison import (COMPARISON_ROWS, MODEL_LIMITATIONS, PRIORITIES, WORKFLOW_PQC, WORKFLOW_QKD)
from .algorithms import QCLASS_LABELS
from .experiments import NOISE_LABELS, aggregate, make_figures, risk_figure
from .postprocessing import run_qkd
from .risk import (THREAT_SCENARIOS, RiskConfig, analyse_inventory, load_inventory, migration_plan, overview)

TEMPLATE = Path(__file__).with_name("dashboard_template.html")
HORIZONS = range(5, 41)
MOSCA_REC_PREFIX = "Start migration planning"

FIGURE_ORDER = [
    ("noise_vs_qber", "QBER versus noise parameter, Eve absent and present, for each Aer noise model"),
    ("eve_vs_qber", "QBER versus the fraction of qubits Eve intercepts (theory: 25% x fraction)"),
    ("key_length", "Final secret-key length versus noise (no eavesdropper)"),
    ("completion", "Share of runs that complete (not aborted) versus noise"),
    ("sifted_vs_qber", "Sifted-key length versus measured QBER over all runs"),
]
NOISE_NOTE = (
    "Bit-flip noise is a Pauli-X error: it leaves X-basis states unchanged, so only Z-basis bits are "
    "affected and QBER is about p/2. Readout noise flips Bob's result in both bases (QBER about p). "
    "p is the parameter of the chosen Aer noise model, not a universal physical noise measure."
)


def _b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def _demo(label: str, cfg: BB84Config, show: int = 48) -> dict:
    res = run_qkd(cfg)
    q = res.quantum
    s = slice(0, show)
    return {
        "label": label,
        "alice_bits": q.alice_bits[s].tolist(), "alice_bases": q.alice_bases[s].tolist(),
        "bob_bases": q.bob_bases[s].tolist(), "bob_bits": q.bob_bits[s].tolist(),
        "eve_bases": q.eve_bases[s].tolist(), "sift": q.sift_mask[s].astype(int).tolist(),
        "err": (q.alice_bits[s] != q.bob_bits[s]).astype(int).tolist(),
        "summary": res.summary(),
    }


def build_dashboard(grid: pd.DataFrame, eve_sweep: pd.DataFrame, n_qubits: int,
                    out_path: Path, fig_dir: Path, demo_qubits: int = 2048) -> Path:
    inv = load_inventory()
    base_cfg = RiskConfig()

    # Risk results: static part once, horizon-dependent part for each Z.
    central = analyse_inventory(inv, base_cfg)
    assets = {}
    for r in central:
        assets[r["id"]] = {
            "id": r["id"], "name": r["name"], "category": r["category"], "protocol": r["protocol"],
            "notes": r["notes"], "mechanisms": r["mechanisms"], "inputs": r["inputs"],
            "components": r["components"], "risk_score": r["risk_score"],
            "security_exposure": r["security_exposure"], "has_unknown": r["has_unknown"],
            "qkd_candidate": r["qkd_candidate"], "qkd_reason": r["qkd_reason"],
            "recs": [x for x in r["recommendations"] if not x["action"].startswith(MOSCA_REC_PREFIX)],
        }
    dyn = {}
    for z in HORIZONS:
        cfg = RiskConfig(threat_horizon_years=z)
        res = analyse_inventory(inv, cfg)
        dyn[str(z)] = {
            "assets": [{"id": r["id"], "tier": r["tier"], "rank": r["rank"], "mosca": r["mosca"],
                        "tier_reasons": r["tier_reasons"]} for r in res],
            "overview": overview(res),
            "plan": migration_plan(res, cfg),
        }

    risk_png = risk_figure(central, fig_dir / "risk_scores.png")
    figs = make_figures(grid, eve_sweep, fig_dir)

    agg = aggregate(grid, ["model", "experiment", "noise_p", "eve"]).sort_values(
        ["model", "experiment", "noise_p"])
    models = [m for m in NOISE_LABELS if m in set(grid["model"])]
    # A and B (p = 0) are repeated for every model; keep them once per model view.
    agg_rows = [{k: (bool(v) if k == "eve" else v) for k, v in row.items()}
                for row in agg.to_dict("records")]

    demos = [
        _demo("Experiment A: no eavesdropper, ideal channel", BB84Config(n_qubits=demo_qubits, seed=11)),
        _demo("Experiment B: intercept-resend eavesdropper on every qubit",
              BB84Config(n_qubits=demo_qubits, eve_enabled=True, seed=12)),
        _demo("Experiment C: no eavesdropper, depolarizing channel noise p = 0.03",
              BB84Config(n_qubits=demo_qubits, noise_model="depolarizing", noise_p=0.03, seed=13)),
    ]

    data = {
        "organisation": inv["organisation"], "default": int(base_cfg.threat_horizon_years),
        "scenarios": THREAT_SCENARIOS, "qlabels": QCLASS_LABELS,
        "order": [r["id"] for r in central], "assets": assets, "dyn": dyn,
        "qkd": {
            "n_qubits": n_qubits, "models": models, "model_labels": NOISE_LABELS, "grid": agg_rows,
            "demos": demos, "noise_note": NOISE_NOTE,
            "figures": {k: _b64(p) for k, p in figs.items()}, "figure_order": FIGURE_ORDER,
            "risk_fig": _b64(risk_png),
        },
        "comparison": COMPARISON_ROWS, "workflow_pqc": WORKFLOW_PQC, "workflow_qkd": WORKFLOW_QKD,
        "priorities": PRIORITIES, "limitations": MODEL_LIMITATIONS,
    }
    payload = json.dumps(data, default=float).replace("</", "<\\/")
    html = TEMPLATE.read_text(encoding="utf-8").replace("/*__DATA__*/null", payload)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return out_path

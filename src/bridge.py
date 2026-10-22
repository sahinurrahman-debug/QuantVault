"""JSON bridge used by the Express API (``web/server``).

Reads ONE JSON request from stdin, writes ONE JSON response to stdout::

    echo '{"cmd": "risk", "assets": [...], "horizon": 15}' | python -m src.bridge

Keeping all scoring and simulation logic in Python means the web app never
re-implements it. Qiskit is imported lazily so that ``risk``/``meta`` stay fast.

Commands: ``meta``, ``risk``, ``sweep``, ``qkd``, ``experiments``.
"""

from __future__ import annotations

import json
import sys
from typing import Any

import numpy as np

SHOW_QUBITS = 64  # qubits echoed back for the on-screen transmission table


def _clean(obj: Any) -> Any:
    """Make numpy scalars/arrays JSON-serialisable."""
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return _clean(obj.tolist())
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        v = float(obj)
        return None if v != v else v  # NaN -> null
    if isinstance(obj, float) and obj != obj:
        return None
    return obj


def _config(req: dict):
    from .risk import RiskConfig

    kwargs = {"threat_horizon_years": float(req.get("horizon", 15))}
    if req.get("weights"):
        kwargs["weights"] = {k: float(v) for k, v in req["weights"].items()}
    return RiskConfig(**kwargs)


def cmd_meta(_req: dict) -> dict:
    from .algorithms import ALGORITHMS, QCLASS_LABELS
    from .comparison import (COMPARISON_ROWS, MODEL_LIMITATIONS, NOISE_LABELS, PRIORITIES, WORKFLOW_PQC,
                             WORKFLOW_QKD)
    from .risk import DIFFICULTY, EXPOSURE, SENSITIVITY, THREAT_SCENARIOS, RiskConfig

    cfg = RiskConfig()
    return {
        "algorithms": {k: {"role": v["role"], "family": v["family"], "qclass": v["qclass"], "q": v["q"],
                           "note": v["note"]} for k, v in ALGORITHMS.items()},
        "qclass_labels": QCLASS_LABELS,
        "sensitivity": list(SENSITIVITY), "exposure": list(EXPOSURE), "migration_difficulty": list(DIFFICULTY),
        "link_types": ["internet", "internal", "dedicated_fibre_p2p"],
        "scenarios": THREAT_SCENARIOS,
        "default_weights": cfg.weights, "default_horizon": cfg.threat_horizon_years,
        "noise_labels": NOISE_LABELS,
        "comparison": COMPARISON_ROWS, "workflow_pqc": WORKFLOW_PQC, "workflow_qkd": WORKFLOW_QKD,
        "priorities": PRIORITIES, "limitations": MODEL_LIMITATIONS,
    }


def cmd_risk(req: dict) -> dict:
    from .risk import analyse_inventory, migration_plan, overview

    cfg = _config(req)
    results = analyse_inventory({"assets": req["assets"]}, cfg)
    return {"horizon": cfg.threat_horizon_years, "weights": cfg.weights, "results": results,
            "overview": overview(results), "plan": migration_plan(results, cfg)}


def cmd_sweep(req: dict) -> dict:
    """Tier counts and per-asset tiers for each threat horizon (drives the horizon chart)."""
    from .risk import horizon_sweep, overview

    lo, hi = int(req.get("min", 5)), int(req.get("max", 40))
    sweep = horizon_sweep({"assets": req["assets"]}, horizons=range(lo, hi + 1))
    rows = []
    for z, results in sweep.items():
        o = overview(results)
        rows.append({"z": z, "mosca_violated": o["mosca_violated"], "urgent": o["urgent_review"],
                     "tiers": o["tier_counts"],
                     "assets": {r["id"]: {"tier": r["tier"], "mosca": r["mosca"]["status"]} for r in results}})
    return {"rows": rows}


def cmd_qkd(req: dict) -> dict:
    from .bb84 import BB84Config
    from .postprocessing import SecurityParams, run_qkd

    cfg = BB84Config(
        n_qubits=int(req.get("n_qubits", 2048)), eve_enabled=bool(req.get("eve_enabled", False)),
        eve_fraction=float(req.get("eve_fraction", 1.0)), noise_model=str(req.get("noise_model", "none")),
        noise_p=float(req.get("noise_p", 0.0)), sample_fraction=float(req.get("sample_fraction", 0.25)),
        seed=req.get("seed"))
    params = SecurityParams(max_qber=float(req.get("max_qber", 0.11)))
    res = run_qkd(cfg, params)
    q, s = res.quantum, slice(0, SHOW_QUBITS)
    return {
        "summary": res.summary(),
        "security": {"eps_pe": params.eps_pe, "eps_cor": params.eps_cor, "eps_pa": params.eps_pa,
                     "max_qber": params.max_qber},
        "transmission": {
            "alice_bits": q.alice_bits[s], "alice_bases": q.alice_bases[s], "eve_bases": q.eve_bases[s],
            "bob_bases": q.bob_bases[s], "bob_bits": q.bob_bits[s],
            "sift": q.sift_mask[s].astype(int), "err": (q.alice_bits[s] != q.bob_bits[s]).astype(int),
        },
        "key_preview": "".join(map(str, res.final_key_alice[:32].tolist())) if res.accepted else "",
    }


def cmd_experiments(req: dict) -> dict:
    from .experiments import DEFAULT_P_VALUES, aggregate, run_eve_sweep, run_grid

    n, reps = int(req.get("n_qubits", 1024)), int(req.get("reps", 3))
    grid = run_grid(n_qubits=n, reps=reps, p_values=tuple(req.get("p_values", DEFAULT_P_VALUES)),
                    seed=int(req.get("seed", 2026)))
    sweep = run_eve_sweep(n_qubits=n, reps=reps)
    agg = aggregate(grid, ["model", "experiment", "noise_p", "eve"]).sort_values(["model", "experiment", "noise_p"])
    ev = sweep.groupby("eve_fraction").agg(qber_mean=("qber_true", "mean"), qber_std=("qber_true", "std")).reset_index()
    return {"n_qubits": n, "reps": reps, "grid": agg.to_dict("records"), "eve_sweep": ev.to_dict("records"),
            "runs": int(len(grid) + len(sweep))}


COMMANDS = {"meta": cmd_meta, "risk": cmd_risk, "sweep": cmd_sweep, "qkd": cmd_qkd, "experiments": cmd_experiments}


def main() -> int:
    try:
        req = json.loads(sys.stdin.read() or "{}")
        cmd = req.get("cmd")
        if cmd not in COMMANDS:
            raise ValueError(f"unknown cmd {cmd!r}; expected one of {sorted(COMMANDS)}")
        out = {"ok": True, "data": _clean(COMMANDS[cmd](req))}
    except Exception as exc:  # report every failure as JSON so the API can relay it
        out = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    sys.stdout.write(json.dumps(out))
    return 0 if out["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

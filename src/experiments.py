"""Reproducible BB84 experiments (A-D), sweeps and figures.

Experiment matrix (same n_qubits, sampling procedure and seeds family throughout):

====  =====  =============  ====================================================
 ID    Eve    Channel noise  Expected behaviour
====  =====  =============  ====================================================
 A     off    none           QBER ~ 0
 B     on     none           QBER ~ 25 % (ideal intercept-resend, sifted key)
 C     off    p > 0          QBER grows with p (depends on the noise model)
 D     on     p > 0          Attack and noise both contribute
====  =====  =============  ====================================================

These are expected qualitative behaviours, not guaranteed values for finite runs,
so every figure reports the number of compared bits and repetition spread.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .bb84 import BB84Config
from .comparison import NOISE_LABELS  # noqa: F401  (re-exported for the dashboard)
from .postprocessing import SecurityParams, run_qkd

DEFAULT_P_VALUES = (0.0, 0.01, 0.03, 0.05, 0.10, 0.15)


def experiment_id(eve: bool, p: float) -> str:
    return {(False, True): "A", (True, True): "B", (False, False): "C", (True, False): "D"}[(eve, p == 0)]


def run_grid(n_qubits: int = 2048, p_values=DEFAULT_P_VALUES, noise_models=("bitflip", "depolarizing", "readout"),
             reps: int = 5, seed: int = 2026, params: SecurityParams | None = None) -> pd.DataFrame:
    """Run experiments A-D over every noise model and noise value."""
    rows = []
    counter = 0
    for model in noise_models:
        for p in p_values:
            for eve in (False, True):
                for rep in range(reps):
                    counter += 1
                    cfg = BB84Config(n_qubits=n_qubits, eve_enabled=eve, noise_model=model if p else "none",
                                     noise_p=p, seed=seed + counter)
                    row = run_qkd(cfg, params).summary()
                    row.update(experiment=experiment_id(eve, p), model=model, rep=rep)
                    rows.append(row)
    return pd.DataFrame(rows)


def run_eve_sweep(n_qubits: int = 2048, fractions=(0.0, 0.1, 0.25, 0.5, 0.75, 1.0), reps: int = 5,
                  seed: int = 4242) -> pd.DataFrame:
    """QBER versus the fraction of qubits Eve intercepts (ideal channel)."""
    rows = []
    for f in fractions:
        for rep in range(reps):
            cfg = BB84Config(n_qubits=n_qubits, eve_enabled=f > 0, eve_fraction=f, seed=seed + int(f * 1000) + rep)
            row = run_qkd(cfg).summary()
            row.update(eve_fraction=f, rep=rep)
            rows.append(row)
    return pd.DataFrame(rows)


def aggregate(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    """Mean and standard deviation across repetitions."""
    g = df.groupby(by)
    out = g.agg(qber_mean=("qber_true", "mean"), qber_std=("qber_true", "std"),
                sample_qber_mean=("qber_sample", "mean"),
                sifted_mean=("n_sifted", "mean"), compared_mean=("n_sample", "mean"),
                final_len_mean=("final_length", "mean"), accept_rate=("accepted", "mean"),
                runs=("rep", "count")).reset_index()
    out["qber_std"] = out["qber_std"].fillna(0.0)
    return out


# ------------------------------------------------------------------------- figures
def _style():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        "figure.facecolor": "white", "axes.facecolor": "white", "axes.edgecolor": "#8a93a6",
        "axes.labelcolor": "#1b2333", "xtick.color": "#4a5468", "ytick.color": "#4a5468",
        "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
        "grid.color": "#e6e9f0", "grid.linewidth": 0.8, "font.size": 10, "axes.titlesize": 11,
        "axes.titleweight": "bold", "legend.frameon": False, "figure.dpi": 130,
    })
    return plt


BLUE, ORANGE, GREEN, RED, GREY = "#2b6cb0", "#d9822b", "#2f855a", "#c53030", "#718096"


def make_figures(grid: pd.DataFrame, eve_sweep: pd.DataFrame, out_dir: Path) -> dict[str, Path]:
    """Render the standard figure set and return {name: path}."""
    plt = _style()
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    agg = aggregate(grid, ["model", "noise_p", "eve"])

    # 1. Noise parameter vs QBER, Eve off / on, one panel per noise model
    models = [m for m in NOISE_LABELS if m in set(grid["model"])]
    fig, axes = plt.subplots(1, len(models), figsize=(4.2 * len(models), 3.6), sharey=True)
    axes = np.atleast_1d(axes)
    for ax, model in zip(axes, models):
        for eve, color, label in ((False, BLUE, "Eve absent"), (True, RED, "Eve intercept-resend")):
            d = agg[(agg.model == model) & (agg.eve == eve)].sort_values("noise_p")
            ax.errorbar(d.noise_p, d.qber_mean * 100, yerr=d.qber_std * 100, color=color, marker="o",
                        capsize=3, label=label)
        ax.axhline(25, color=GREY, ls=":", lw=1)
        ax.set_title(NOISE_LABELS[model])
        ax.set_xlabel("noise parameter p")
    axes[0].set_ylabel("QBER on sifted key (%)")
    axes[0].legend(loc="upper left")
    fig.tight_layout()
    paths["noise_vs_qber"] = out_dir / "noise_vs_qber.png"
    fig.savefig(paths["noise_vs_qber"]); plt.close(fig)

    # 2. Eve interception fraction vs QBER
    ev = eve_sweep.groupby("eve_fraction").agg(m=("qber_true", "mean"), s=("qber_true", "std")).reset_index()
    fig, ax = plt.subplots(figsize=(4.8, 3.6))
    xs = np.linspace(0, 1, 50)
    ax.plot(xs, xs * 25, color=GREY, ls="--", label="theory: 25 % x fraction")
    ax.errorbar(ev.eve_fraction, ev.m * 100, yerr=ev.s.fillna(0) * 100, color=RED, marker="o", capsize=3,
                label="simulation")
    ax.set_xlabel("fraction of qubits Eve intercepts"); ax.set_ylabel("QBER on sifted key (%)")
    ax.set_title("Eavesdropping strength vs QBER"); ax.legend()
    fig.tight_layout()
    paths["eve_vs_qber"] = out_dir / "eve_vs_qber.png"
    fig.savefig(paths["eve_vs_qber"]); plt.close(fig)

    # 3. Final key length vs noise (Eve off), per model
    fig, ax = plt.subplots(figsize=(4.8, 3.6))
    for model, color in zip(models, (BLUE, ORANGE, GREEN)):
        d = agg[(agg.model == model) & (~agg.eve)].sort_values("noise_p")
        ax.plot(d.noise_p, d.final_len_mean, marker="o", color=color, label=NOISE_LABELS[model])
    ax.set_xlabel("noise parameter p"); ax.set_ylabel("mean final key length (bits)")
    ax.set_title("Secret key length vs noise (no Eve)"); ax.legend(fontsize=8)
    fig.tight_layout()
    paths["key_length"] = out_dir / "key_length.png"
    fig.savefig(paths["key_length"]); plt.close(fig)

    # 4. Protocol completion (accept rate) vs noise, with and without Eve
    fig, ax = plt.subplots(figsize=(4.8, 3.6))
    for model, color in zip(models, (BLUE, ORANGE, GREEN)):
        d = agg[(agg.model == model) & (~agg.eve)].sort_values("noise_p")
        ax.plot(d.noise_p, d.accept_rate * 100, marker="o", color=color, label=f"{model}, Eve off")
    d = agg[agg.eve].groupby("noise_p").accept_rate.mean().reset_index()
    ax.plot(d.noise_p, d.accept_rate * 100, marker="s", color=RED, ls="--", label="Eve on (all models)")
    ax.set_ylim(-5, 105)
    ax.set_xlabel("noise parameter p"); ax.set_ylabel("runs completed (%)")
    ax.set_title("Protocol completion vs noise"); ax.legend(fontsize=8)
    fig.tight_layout()
    paths["completion"] = out_dir / "completion.png"
    fig.savefig(paths["completion"]); plt.close(fig)

    # 5. Sifted-key length vs QBER (scatter of every run)
    fig, ax = plt.subplots(figsize=(4.8, 3.6))
    for eve, color, label in ((False, BLUE, "Eve absent"), (True, RED, "Eve present")):
        d = grid[grid.eve == eve]
        ax.scatter(d.qber_true * 100, d.n_sifted, s=14, alpha=0.6, color=color, label=label)
    ax.set_xlabel("QBER on sifted key (%)"); ax.set_ylabel("sifted-key length (bits)")
    ax.set_title("Sifted-key length vs QBER"); ax.legend()
    fig.tight_layout()
    paths["sifted_vs_qber"] = out_dir / "sifted_vs_qber.png"
    fig.savefig(paths["sifted_vs_qber"]); plt.close(fig)
    return paths


def risk_figure(results: list[dict], out_path: Path) -> Path:
    """Horizontal bar chart of risk scores coloured by tier."""
    plt = _style()
    colors = {"Critical": RED, "High": ORANGE, "Medium": "#d6b02b", "Low": GREEN}
    rs = sorted(results, key=lambda r: r["risk_score"])
    fig, ax = plt.subplots(figsize=(7.2, 0.38 * len(rs) + 1.2))
    ax.barh([r["name"] for r in rs], [r["risk_score"] for r in rs], color=[colors[r["tier"]] for r in rs])
    ax.set_xlabel("risk score R (0-100)"); ax.set_xlim(0, 100)
    ax.set_title("Migration priority by asset")
    handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in colors.values()]
    ax.legend(handles, colors.keys(), loc="lower right")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path); plt.close(fig)
    return out_path

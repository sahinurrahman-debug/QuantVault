"""The static dashboard builder (docs/dashboard.html) and its figures."""

import json
import re

from src.dashboard import build_dashboard
from src.experiments import run_eve_sweep, run_grid


def test_dashboard_builds_a_self_contained_page(tmp_path):
    grid = run_grid(n_qubits=256, reps=1, p_values=(0.0, 0.05))
    sweep = run_eve_sweep(n_qubits=256, reps=1, fractions=(0.0, 1.0))
    out = build_dashboard(grid, sweep, 256, tmp_path / "dashboard.html", tmp_path / "figures", demo_qubits=256)

    html = out.read_text(encoding="utf-8")
    assert "/*__DATA__*/null" not in html, "the data placeholder must be replaced"
    assert "QuantVault" in html and len(html) > 100_000
    payload = re.search(r"const D = (\{.*?\});\s*\n", html, re.S)
    assert payload, "embedded data block not found"
    data = json.loads(payload.group(1))
    assert len(data["assets"]) == 13
    assert set(data["dyn"]) == {str(z) for z in range(5, 41)}, "every threat horizon from 5 to 40 is precomputed"
    for name in ("noise_vs_qber", "eve_vs_qber", "key_length", "completion", "sifted_vs_qber", "risk_scores"):
        assert (tmp_path / "figures" / f"{name}.png").stat().st_size > 1_000, name

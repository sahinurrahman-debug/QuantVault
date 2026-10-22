"""The JSON bridge used by the Express API."""

import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np

from src import bridge
from src.risk import load_inventory

ROOT = Path(__file__).resolve().parent.parent


def test_clean_makes_numpy_and_nan_json_safe():
    data = {"a": np.int64(3), "b": np.float64(1.5), "c": np.array([1, 2]), "d": np.bool_(True), "e": float("nan"),
            "f": np.float64("nan")}
    out = json.loads(json.dumps(bridge._clean(data)))
    assert out == {"a": 3, "b": 1.5, "c": [1, 2], "d": True, "e": None, "f": None}


def test_meta_exposes_catalogue_and_enums():
    meta = bridge.cmd_meta({})
    assert meta["algorithms"]["ML-KEM"]["role"] == "key_establishment"
    assert "restricted" in meta["sensitivity"] and "dedicated_fibre_p2p" in meta["link_types"]
    assert math.isclose(sum(meta["default_weights"].values()), 1.0)
    assert meta["scenarios"]["Central"] == 15


def test_risk_command_scores_supplied_assets():
    out = bridge.cmd_risk({"assets": load_inventory()["assets"], "horizon": 15})
    assert len(out["results"]) == 13 and len(out["plan"]) == 5
    assert out["overview"]["total_assets"] == 13


def test_sweep_covers_the_requested_range():
    out = bridge.cmd_sweep({"assets": load_inventory()["assets"], "min": 10, "max": 12})
    assert [r["z"] for r in out["rows"]] == [10, 11, 12]


def test_qkd_command_returns_transmission_and_summary():
    out = bridge.cmd_qkd({"n_qubits": 512, "eve_enabled": True, "seed": 5})
    assert len(out["transmission"]["alice_bits"]) == bridge.SHOW_QUBITS
    assert out["summary"]["accepted"] is False
    json.dumps(bridge._clean(out))  # must serialise


def test_cli_round_trip_and_error_reporting():
    run = lambda payload: subprocess.run([sys.executable, "-m", "src.bridge"], input=json.dumps(payload),
                                         capture_output=True, text=True, cwd=ROOT)
    ok = run({"cmd": "meta"})
    assert ok.returncode == 0 and json.loads(ok.stdout)["ok"] is True
    bad = run({"cmd": "nope"})
    assert bad.returncode == 1 and json.loads(bad.stdout)["ok"] is False
    invalid = run({"cmd": "qkd", "noise_model": "gaussian"})
    assert "ValueError" in json.loads(invalid.stdout)["error"]

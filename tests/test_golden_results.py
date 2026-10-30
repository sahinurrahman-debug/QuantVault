"""Golden-Result Verification Tests.

Re-derives the published numbers in README.md directly from raw measurement counts
stored in results/*.json.
"""

import json
from pathlib import Path
import pytest
import math

ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = ROOT / "results"


def test_reproduce_fakemarrakesh_clean_bell_parameter():
    clean_files = list(RESULTS_DIR.glob("e91_fake_marrakesh_clean_*.json"))
    assert clean_files, "Golden result file for FakeMarrakesh clean run must exist"

    with open(clean_files[0], "r", encoding="utf-8") as f:
        data = json.load(f)

    settings = data["settings"]
    e_recalculated = {}
    var_sum = 0.0

    for name, s in settings.items():
        counts = s["counts"]
        n00 = counts.get("00", 0)
        n11 = counts.get("11", 0)
        n01 = counts.get("01", 0)
        n10 = counts.get("10", 0)
        total = n00 + n11 + n01 + n10
        assert total == data["shots_per_setting"]

        e_val = (n00 + n11 - n01 - n10) / total
        e_recalculated[name] = e_val
        std_err = math.sqrt(max(0.0, 1.0 - e_val**2) / total)
        var_sum += std_err**2
        assert e_val == pytest.approx(s["e_val"], abs=1e-4)

    s_recalculated = (
        e_recalculated["A0_B0"]
        + e_recalculated["A0_B1"]
        + e_recalculated["A1_B0"]
        - e_recalculated["A1_B1"]
    )
    s_std_err = math.sqrt(var_sum)
    assert s_recalculated == pytest.approx(data["s_value"], abs=1e-4)
    assert s_recalculated > 2.0, "Must violate classical Bell limit"

    # Verify key QBER
    k_counts = data["key_counts"]
    k_errs = k_counts.get("01", 0) + k_counts.get("10", 0)
    k_total = sum(k_counts.values())
    qber_recalculated = k_errs / k_total
    assert qber_recalculated == pytest.approx(data["qber_key"], abs=1e-4)
    assert qber_recalculated < 0.03


def test_reproduce_fakemarrakesh_eve_bell_parameter():
    eve_files = list(RESULTS_DIR.glob("e91_fake_marrakesh_eve_*.json"))
    assert eve_files, "Golden result file for FakeMarrakesh Eve run must exist"

    with open(eve_files[0], "r", encoding="utf-8") as f:
        data = json.load(f)

    settings = data["settings"]
    e_recalculated = {}

    for name, s in settings.items():
        counts = s["counts"]
        n00 = counts.get("00", 0)
        n11 = counts.get("11", 0)
        n01 = counts.get("01", 0)
        n10 = counts.get("10", 0)
        total = n00 + n11 + n01 + n10
        e_val = (n00 + n11 - n01 - n10) / total
        e_recalculated[name] = e_val

    s_recalculated = (
        e_recalculated["A0_B0"]
        + e_recalculated["A0_B1"]
        + e_recalculated["A1_B0"]
        - e_recalculated["A1_B1"]
    )
    assert s_recalculated == pytest.approx(data["s_value"], abs=1e-4)
    assert s_recalculated <= 2.0, "Eavesdropper must collapse Bell parameter to <= 2.0"

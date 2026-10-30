"""Tests for E91 Entanglement-based QKD and CHSH Bell Inequality."""

import pytest
import numpy as np

from src.e91 import (
    CHSH_ANGLES, E91Config, build_e91_circuit, compute_correlation, run_e91_experiment,
)


def test_build_e91_circuit_structure():
    qc = build_e91_circuit(0.0, np.pi / 4, eve_intercept=False)
    assert qc.num_qubits == 2
    assert qc.num_clbits == 2
    gate_names = [inst.operation.name for inst in qc.data]
    assert "h" in gate_names
    assert "cx" in gate_names
    assert "measure" in gate_names


def test_build_e91_circuit_with_eve():
    qc_eve_z = build_e91_circuit(0.0, np.pi / 4, eve_intercept=True, eve_basis="Z")
    assert qc_eve_z.num_qubits == 2
    gate_names = [inst.operation.name for inst in qc_eve_z.data]
    assert "reset" in gate_names
    assert "if_else" in gate_names or "x" in gate_names


def test_compute_correlation_perfect():
    # Only 00 and 11
    counts = {"00": 500, "11": 500}
    e, err = compute_correlation(counts, 1000)
    assert e == pytest.approx(1.0)
    assert err == pytest.approx(0.0)

    # Only 01 and 10
    counts_anti = {"01": 500, "10": 500}
    e_anti, _ = compute_correlation(counts_anti, 1000)
    assert e_anti == pytest.approx(-1.0)


def test_e91_ideal_simulation_violates_bell():
    # 2000 shots per setting on ideal Aer
    cfg = E91Config(
        shots_per_setting=2000,
        key_shots=1000,
        eve_enabled=False,
        backend_name="aer",
        seed=42,
    )
    result = run_e91_experiment(cfg)

    # Ideal S should be approx 2*sqrt(2) approx 2.8284
    assert result.s_value > 2.65, f"Expected S > 2.65, got {result.s_value}"
    assert result.ci_95[0] > 2.0, "95% confidence interval lower bound must exceed 2.0"
    assert result.sigma_above_classical > 15.0, "Significance should be > 15 sigma"
    assert result.violates_bell is True
    assert result.qber_key < 0.03, f"Ideal QBER should be near zero, got {result.qber_key}"
    assert result.key_accepted is True
    assert not hasattr(result, "final_key_hex")  # E91 certifies the channel; it must not present a made-up key


def test_e91_intercept_resend_collapses_bell_inequality():
    # Eve active -> S should drop to <= 2.0 (theoretical ~ sqrt(2) approx 1.41)
    cfg = E91Config(
        shots_per_setting=2000,
        key_shots=1000,
        eve_enabled=True,
        backend_name="aer",
        seed=42,
    )
    result = run_e91_experiment(cfg)

    assert result.s_value <= 2.0, f"Eve should collapse Bell parameter to <= 2.0, got {result.s_value}"
    assert result.ci_95[1] < 2.0, "Upper CI should remain strictly below classical bound"
    assert result.violates_bell is False
    assert result.qber_key == pytest.approx(0.25, abs=0.06), f"Eve QBER should be ~25%, got {result.qber_key}"
    assert result.key_accepted is False
    assert "ABORTED" in result.verdict

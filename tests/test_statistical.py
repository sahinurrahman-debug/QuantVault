"""Statistical and Physical Hypothesis Tests for Quantum Protocols."""

import pytest
import numpy as np

from src.bb84 import BB84Config, run_quantum_phase
from src.e91 import E91Config, run_e91_experiment
from src.cloning_and_decoy import run_optimal_cloning_simulation, analyze_decoy_state_bb84
from src.qkd_calc import evaluate_link_feasibility


def test_qber_under_full_intercept_resend():
    """QBER under full intercept-resend must be ~25% within statistical bounds."""
    cfg = BB84Config(n_qubits=4096, eve_enabled=True, eve_fraction=1.0, seed=123)
    qp = run_quantum_phase(cfg)
    sifted_a = qp.sifted_alice
    sifted_b = qp.sifted_bob
    qber = float(np.mean(sifted_a != sifted_b))
    n = len(sifted_a)

    # Binomial std error for p=0.25 at n ~ 2000 is sqrt(0.25*0.75/2000) ~ 0.0097
    std_err = np.sqrt(0.25 * 0.75 / n)
    z_score = abs(qber - 0.25) / std_err
    assert z_score < 3.0, f"QBER {qber:.2%} deviates by {z_score:.2f} sigma from theoretical 25%"


def test_qber_under_bitflip_noise():
    """Under bit-flip noise p, X-basis states are invariant so QBER ~ p/2."""
    p_val = 0.08
    cfg = BB84Config(n_qubits=4096, eve_enabled=False, noise_model="bitflip", noise_p=p_val, seed=456)
    qp = run_quantum_phase(cfg)
    sifted_a = qp.sifted_alice
    sifted_b = qp.sifted_bob
    qber = float(np.mean(sifted_a != sifted_b))

    expected = p_val / 2.0  # 0.04
    assert abs(qber - expected) < 0.015, f"Expected QBER ~ {expected:.2%}, got {qber:.2%}"


def test_qber_under_optimal_phase_covariant_cloning():
    """Optimal cloning induces 1 - F = 0.5*(1 - 1/sqrt(2)) ~ 14.645% error."""
    res = run_optimal_cloning_simulation(n_qubits=4000, seed=789)
    assert abs(res.simulated_qber - 0.1464) < 0.025
    assert res.detected_by_threshold_11pct is True


def test_bell_test_statistical_violation():
    """Ideal Bell test must achieve S > 2.0 by more than 15 standard errors."""
    cfg = E91Config(shots_per_setting=3000, key_shots=1000, eve_enabled=False, backend_name="aer", seed=42)
    res = run_e91_experiment(cfg)
    assert res.s_value > 2.70
    assert res.sigma_above_classical > 15.0
    assert res.violates_bell is True


def test_bell_test_statistical_collapse_under_eve():
    """Under intercept-resend, Bell parameter must collapse to S <= 2.0."""
    cfg = E91Config(shots_per_setting=3000, key_shots=1000, eve_enabled=True, backend_name="aer", seed=42)
    res = run_e91_experiment(cfg)
    assert res.s_value <= 2.0
    assert res.sigma_above_classical < 0.0
    assert res.violates_bell is False


def test_decoy_state_gllp_rate_positive_for_40km():
    """At 40 km standard telecom fibre, decoy-state analysis yields positive key rate."""
    feas = evaluate_link_feasibility(40.0)
    assert feas.is_viable_unrepeatered is True
    assert feas.secret_key_rate_kbps > 100.0
    assert feas.trusted_relays_needed == 0


def test_decoy_state_cutoff_requires_trusted_relays_for_long_haul():
    """At 300 km distance, direct QKD is infeasible and requires trusted relays."""
    feas = evaluate_link_feasibility(300.0)
    assert feas.is_viable_unrepeatered is False
    assert feas.trusted_relays_needed >= 3

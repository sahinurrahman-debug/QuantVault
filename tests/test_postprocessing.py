"""Sampling, reconciliation, privacy amplification and the end-to-end pipeline."""

import numpy as np
import pytest

from src.bb84 import BB84Config
from src.postprocessing import (SecurityParams, binary_entropy, cascade_reconcile, qber_upper_bound,
                                run_qkd, toeplitz_hash, verify_keys)


def test_binary_entropy():
    assert binary_entropy(0) == 0 and binary_entropy(1) == 0
    assert binary_entropy(0.5) == pytest.approx(1.0)
    assert binary_entropy(0.11) == pytest.approx(0.4999, abs=1e-3)


def test_upper_bound_is_above_observation_and_shrinks_with_sample_size():
    assert qber_upper_bound(5, 100, 1e-3) > 0.05
    assert qber_upper_bound(50, 1000, 1e-3) < qber_upper_bound(5, 100, 1e-3)
    assert qber_upper_bound(0, 100, 1e-3) > 0
    assert qber_upper_bound(10, 10, 1e-3) == 1.0


@pytest.mark.parametrize("rate", [0.0, 0.02, 0.05, 0.08])
def test_cascade_corrects_errors_and_counts_leakage(rate):
    rng = np.random.default_rng(1)
    alice = rng.integers(0, 2, 1500)
    bob = alice ^ (rng.random(1500) < rate).astype(int)
    fixed, leaked = cascade_reconcile(alice, bob, max(rate, 0.001), rng=np.random.default_rng(2))
    assert np.array_equal(alice, fixed)
    assert leaked > 0
    if rate >= 0.05:
        assert leaked > 100  # noisier channels leak more parity information


def test_cascade_on_identical_keys_changes_nothing():
    key = np.random.default_rng(3).integers(0, 2, 400)
    fixed, _ = cascade_reconcile(key, key.copy(), 0.0, rng=np.random.default_rng(4))
    assert np.array_equal(key, fixed)


def test_verification_detects_differences():
    rng = np.random.default_rng(5)
    a = rng.integers(0, 2, 300)
    b = a.copy(); b[17] ^= 1
    assert verify_keys(a, a.copy(), 20, rng)[0]
    assert not verify_keys(a, b, 40, rng)[0]


def test_toeplitz_hash_is_deterministic_linear_and_the_right_length():
    rng = np.random.default_rng(6)
    n, l = 200, 80
    seed = rng.integers(0, 2, n + l - 1)
    k1, k2 = rng.integers(0, 2, n), rng.integers(0, 2, n)
    h = lambda k: toeplitz_hash(k, l, seed)
    assert len(h(k1)) == l
    assert np.array_equal(h(k1), h(k1))
    assert np.array_equal(h(k1 ^ k2), h(k1) ^ h(k2))  # linear over GF(2)


def test_pipeline_ideal_channel_produces_matching_keys():
    r = run_qkd(BB84Config(n_qubits=2048, seed=21))
    assert r.accepted and r.keys_match and r.residual_errors == 0
    assert 0 < r.final_length < r.n_sifted


def test_pipeline_aborts_under_intercept_resend():
    r = run_qkd(BB84Config(n_qubits=2048, eve_enabled=True, seed=22))
    assert not r.accepted and r.final_length == 0
    assert 0.18 < r.qber_sample < 0.32
    assert "exceeds" in r.abort_reason


def test_pipeline_survives_moderate_noise_with_shorter_key():
    clean = run_qkd(BB84Config(n_qubits=2048, seed=23))
    noisy = run_qkd(BB84Config(n_qubits=2048, noise_model="depolarizing", noise_p=0.06, seed=23))
    assert noisy.accepted and noisy.keys_match
    assert noisy.final_length < clean.final_length
    assert noisy.leak_ec > clean.leak_ec


def test_low_qber_does_not_guarantee_acceptance_for_tiny_runs():
    r = run_qkd(BB84Config(n_qubits=64, seed=24))
    assert not r.accepted  # finite-size penalties leave no secure key


def test_threshold_is_configurable():
    cfg = BB84Config(n_qubits=2048, noise_model="readout", noise_p=0.05, seed=25)
    strict = run_qkd(cfg, SecurityParams(max_qber=0.05))
    assert not strict.accepted


def test_a_clean_but_small_run_explains_that_the_sample_is_too_small():
    r = run_qkd(BB84Config(n_qubits=512, seed=5))
    assert not r.accepted and r.qber_true == 0.0
    assert "too few to prove" in r.abort_reason and "send more qubits" in r.abort_reason


def test_a_genuinely_noisy_run_is_not_blamed_on_sample_size():
    r = run_qkd(BB84Config(n_qubits=2048, eve_enabled=True, seed=6))
    assert not r.accepted
    assert "send more qubits" not in r.abort_reason

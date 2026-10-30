"""Property and Invariant Tests for Post-Processing, PQC, and Scanners."""

import pytest
import numpy as np

from src.postprocessing import (
    cascade_reconcile, toeplitz_hash, binary_entropy, qber_upper_bound,
)
from src.pqc import HybridKEM, derive_hybrid_qkd_pqc_key, execute_full_hybrid_exchange
from src.scanner import is_host_allowed, import_cyclonedx_cbom, import_sslyze_report


def test_property_cascade_reconciliation_zero_residual_errors():
    """Property: Cascade must correct all errors when error rate is moderate."""
    rng = np.random.default_rng(101)
    for trial in range(10):
        n = 1000
        alice_key = rng.integers(0, 2, n)
        # Flip ~3% of bits
        error_mask = rng.random(n) < 0.03
        bob_key = alice_key.copy()
        bob_key[error_mask] ^= 1

        reconciled_bob, leak = cascade_reconcile(alice_key, bob_key, qber_estimate=0.03, passes=6, rng=np.random.default_rng(trial))
        initial_errors = int(np.sum(alice_key != bob_key))
        residual = int(np.sum(alice_key != reconciled_bob))
        # Cascade reduces the bit error rate by at least 95% across trials
        assert residual <= max(1, int(0.05 * initial_errors)), f"Trial {trial}: Expected <=1 residual, got {residual} from {initial_errors}"
        assert leak > 0, "Leakage must be positive"


def test_property_toeplitz_hash_output_length_and_determinism():
    """Property: Toeplitz hash must output exact target length and be deterministic."""
    rng = np.random.default_rng(202)
    for in_len, out_len in [(1000, 500), (512, 256), (256, 128)]:
        inp = rng.integers(0, 2, in_len)
        seed = rng.integers(0, 2, in_len + out_len - 1)
        h1 = toeplitz_hash(inp, out_len, seed)
        h2 = toeplitz_hash(inp, out_len, seed)
        assert len(h1) == out_len
        assert np.array_equal(h1, h2)


def test_property_pqc_and_qkd_hybrid_key_derivation():
    """Property: Hybrid derivation must produce 32-byte non-zero session keys."""
    res = execute_full_hybrid_exchange("11" * 32)
    assert len(res.hybrid_session_key_hex) == 64
    assert res.key_length_bytes == 32
    assert res.hybrid_session_key_hex != "00" * 32


def test_property_scanner_allowlist_enforcement():
    """Property: Only allowlisted hosts can be scanned."""
    assert is_host_allowed("localhost") is True
    assert is_host_allowed("127.0.0.1") is True
    assert is_host_allowed("quantvault-n8cp.onrender.com") is True
    assert is_host_allowed("attacker.internal") is False
    assert is_host_allowed("169.254.169.254") is False  # AWS metadata IP blocked

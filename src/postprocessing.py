"""Educational classical post-processing for BB84.

Pipeline: sifting -> parameter estimation (QBER) -> error reconciliation
(simplified Cascade) -> verification -> privacy amplification (Toeplitz hash).

IMPORTANT - scope and limitations
---------------------------------
This is a *teaching-grade* pipeline, not a production QKD stack or a formally
verified finite-key proof.

* Parameter estimation uses a one-sided Clopper-Pearson bound for a random
  sample. A rigorous treatment needs a hypergeometric/Serfling-type bound and
  a composable security definition.
* The key-length formula is a simplified finite-key accounting::

      l = n (1 - h2(Q_upper)) - leak_EC - leak_verify
          - 2 log2(1/eps_PA) - log2(2/eps_cor)

  where ``h2`` is the binary entropy. It illustrates how finite statistics,
  reconciliation leakage and security parameters reduce the key; it is NOT a
  certified security proof.
* Real security additionally needs an *authenticated* classical channel,
  trusted/characterised devices, side-channel protection and a security
  model beyond intercept-resend attacks.
* The ``max_qber`` abort threshold is a configurable operational setting. It
  is NOT a universal BB84 limit; the right threshold depends on the protocol
  variant, device model and security proof.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.linalg import toeplitz
from scipy.stats import beta

from .bb84 import BB84Config, QuantumPhase, qber, run_quantum_phase


# --------------------------------------------------------------------------- maths
def binary_entropy(x: float) -> float:
    """h2(x) in bits (0 at the endpoints)."""
    if x <= 0.0 or x >= 1.0:
        return 0.0
    return -x * math.log2(x) - (1 - x) * math.log2(1 - x)


def qber_upper_bound(errors: int, n: int, eps: float) -> float:
    """One-sided (1 - eps) Clopper-Pearson upper bound on the error rate."""
    if n <= 0:
        return 1.0
    if errors >= n:
        return 1.0
    return float(beta.ppf(1.0 - eps, errors + 1, n - errors))


# ------------------------------------------------------------------ reconciliation
def _parity(bits: np.ndarray, idx: np.ndarray) -> int:
    return int(bits[idx].sum() & 1)


def cascade_reconcile(alice: np.ndarray, bob: np.ndarray, qber_estimate: float,
                      passes: int = 4, rng: np.random.Generator | None = None
                      ) -> tuple[np.ndarray, int]:
    """Simplified Cascade error correction (Brassard & Salvail, 1993).

    Alice's key is the reference. Bob corrects his copy by comparing block
    parities and binary-searching mismatching blocks. Returns ``(bob_corrected,
    disclosed_bits)`` where ``disclosed_bits`` is the number of parity bits
    revealed on the public channel (each one leaks one bit of information).
    """
    rng = rng or np.random.default_rng()
    a = alice.astype(np.int8)
    b = bob.astype(np.int8).copy()
    n = len(a)
    if n == 0:
        return b, 0

    k1 = int(min(n, max(4, math.ceil(0.73 / max(qber_estimate, 1e-3)))))
    perms, blocks, block_of, alice_par = [], [], [], []
    disclosed = 0

    def disclose_parity(idx: np.ndarray) -> int:
        nonlocal disclosed
        disclosed += 1
        return _parity(a, idx)

    def binary_search(idx: np.ndarray) -> int:
        while len(idx) > 1:
            half = idx[: len(idx) // 2]
            if disclose_parity(half) != _parity(b, half):
                idx = half
            else:
                idx = idx[len(idx) // 2:]
        return int(idx[0])

    def correct(pass_i: int, block_i: int) -> None:
        stack = [(pass_i, block_i)]
        while stack:
            pi, bi = stack.pop()
            idx = blocks[pi][bi]
            if alice_par[pi][bi] == _parity(b, idx):
                continue  # already fixed by a cascaded correction
            pos = binary_search(idx)
            b[pos] ^= 1
            # Flipping one bit changes the parity of its block in every earlier
            # pass; Alice's parities there were already disclosed, so checking
            # them costs no additional leakage.
            for pj in range(pi):
                bj = block_of[pj][pos]
                if alice_par[pj][bj] != _parity(b, blocks[pj][bj]):
                    stack.append((pj, bj))

    for p in range(min(passes, 8)):
        perm = np.arange(n) if p == 0 else rng.permutation(n)
        size = min(n, k1 * (2 ** p))
        pass_blocks = [perm[s:s + size] for s in range(0, n, size)]
        lookup = np.empty(n, dtype=np.int64)
        for bi, idx in enumerate(pass_blocks):
            lookup[idx] = bi
        perms.append(perm)
        blocks.append(pass_blocks)
        block_of.append(lookup)
        alice_par.append([disclose_parity(idx) for idx in pass_blocks])
        for bi in range(len(pass_blocks)):
            if alice_par[p][bi] != _parity(b, pass_blocks[bi]):
                correct(p, bi)
    return b.astype(int), disclosed


def verify_keys(alice: np.ndarray, bob: np.ndarray, bits: int,
                rng: np.random.Generator) -> tuple[bool, int]:
    """Compare ``bits`` random parities of both keys.

    Two different keys survive each random parity with probability 1/2, so a
    residual error is missed with probability 2^-bits. Each parity leaks 1 bit.
    """
    n = len(alice)
    for _ in range(bits):
        mask = rng.integers(0, 2, n).astype(bool)
        if (int(alice[mask].sum()) & 1) != (int(bob[mask].sum()) & 1):
            return False, bits
    return True, bits


# ----------------------------------------------------------------- privacy amplification
def toeplitz_hash(key: np.ndarray, out_len: int, seed_bits: np.ndarray) -> np.ndarray:
    """2-universal Toeplitz hash of ``key`` to ``out_len`` bits.

    ``seed_bits`` (length ``len(key) + out_len - 1``) is chosen by Alice and
    sent publicly; it is not secret.
    """
    n = len(key)
    if out_len <= 0:
        return np.zeros(0, dtype=int)
    col = seed_bits[:out_len]
    row = seed_bits[out_len - 1:out_len - 1 + n]
    matrix = toeplitz(col, row).astype(np.int64)
    return (matrix @ key.astype(np.int64) % 2).astype(int)


# ------------------------------------------------------------------------- pipeline
@dataclass
class SecurityParams:
    eps_pe: float = 1e-5     # parameter-estimation failure probability
    eps_cor: float = 1e-6    # correctness error
    eps_pa: float = 1e-6     # privacy-amplification (secrecy) error
    max_qber: float = 0.11   # operational abort threshold on the upper bound (configurable)


@dataclass
class QKDResult:
    config: BB84Config
    security: SecurityParams
    quantum: QuantumPhase
    n_sent: int
    n_sifted: int
    n_sample: int
    sample_errors: int
    qber_sample: float
    qber_true: float            # ground truth over the whole sifted key (simulator-only knowledge)
    qber_upper: float
    n_remaining: int
    leak_ec: int
    leak_verify: int
    residual_errors: int
    verified: bool
    final_length: int
    accepted: bool
    abort_reason: str
    final_key_alice: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=int))
    final_key_bob: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=int))

    @property
    def keys_match(self) -> bool:
        return bool(len(self.final_key_alice)) and bool(np.array_equal(self.final_key_alice, self.final_key_bob))

    @property
    def secret_fraction(self) -> float:
        return self.final_length / self.n_sent if self.n_sent else 0.0

    def summary(self) -> dict:
        """Flat, serialisable record (used for tables and plots)."""
        c = self.config
        return {
            "n_sent": self.n_sent, "eve": c.eve_enabled, "eve_fraction": c.eve_fraction,
            "noise_model": c.noise_model, "noise_p": c.noise_p,
            "n_sifted": self.n_sifted, "n_sample": self.n_sample, "sample_errors": self.sample_errors,
            "qber_sample": self.qber_sample, "qber_true": self.qber_true, "qber_upper": self.qber_upper,
            "n_remaining": self.n_remaining, "leak_ec": self.leak_ec, "leak_verify": self.leak_verify,
            "residual_errors": self.residual_errors, "verified": self.verified,
            "final_length": self.final_length, "accepted": self.accepted,
            "abort_reason": self.abort_reason, "keys_match": self.keys_match,
        }


def run_qkd(cfg: BB84Config, params: SecurityParams | None = None) -> QKDResult:
    """Full simulated protocol run, returning every intermediate quantity."""
    params = params or SecurityParams()
    quantum = run_quantum_phase(cfg)
    rng = np.random.default_rng(None if cfg.seed is None else cfg.seed + 7919)

    a_sift, b_sift = quantum.sifted_alice, quantum.sifted_bob
    n_sifted = len(a_sift)

    # Parameter estimation: reveal a random sample (and discard it).
    n_sample = max(1, int(round(cfg.sample_fraction * n_sifted)))
    order = rng.permutation(n_sifted)
    sample_idx, keep_idx = order[:n_sample], np.sort(order[n_sample:])
    sample_errors = int(np.sum(a_sift[sample_idx] != b_sift[sample_idx]))
    q_sample = sample_errors / n_sample
    q_upper = qber_upper_bound(sample_errors, n_sample, params.eps_pe)
    a_key, b_key = a_sift[keep_idx], b_sift[keep_idx]
    n_rem = len(a_key)

    base = dict(config=cfg, security=params, quantum=quantum, n_sent=cfg.n_qubits, n_sifted=n_sifted,
                n_sample=n_sample, sample_errors=sample_errors, qber_sample=q_sample,
                qber_true=qber(a_sift, b_sift), qber_upper=q_upper, n_remaining=n_rem)

    def abort(reason: str, leak_ec=0, leak_verify=0, residual=0, verified=False) -> QKDResult:
        return QKDResult(**base, leak_ec=leak_ec, leak_verify=leak_verify, residual_errors=residual,
                         verified=verified, final_length=0, accepted=False, abort_reason=reason)

    if n_rem < 16:
        return abort("Too few sifted bits remain after sampling")
    if q_upper > params.max_qber:
        reason = f"QBER upper bound {q_upper:.1%} exceeds operational threshold {params.max_qber:.0%}"
        if q_sample <= params.max_qber:
            # The measured error rate is fine; it is the small sample that cannot prove it. Say so.
            reason += f" (measured {q_sample:.1%}, but {n_sample} compared bits are too few to prove it is low; send more qubits)"
        return abort(reason)

    # Error reconciliation (leaks `leak_ec` parity bits).
    # Block sizes use the midpoint of the sample estimate and its upper bound: a small sample can
    # under-estimate the error rate, and oversized blocks would leave residual errors.
    b_corr, leak_ec = cascade_reconcile(a_key, b_key, 0.5 * (q_sample + q_upper), rng=rng)
    residual = int(np.sum(a_key != b_corr))

    # Verification: confirm both parties hold the same string.
    verify_bits = math.ceil(math.log2(1.0 / params.eps_cor))
    verified, leak_verify = verify_keys(a_key, b_corr, verify_bits, rng)
    if not verified:
        return abort("Reconciled keys failed verification", leak_ec, leak_verify, residual, False)

    # Privacy amplification: compress to remove what Eve may know.
    final_len = math.floor(
        n_rem * (1.0 - binary_entropy(q_upper)) - leak_ec - leak_verify
        - 2.0 * math.log2(1.0 / params.eps_pa) - math.log2(2.0 / params.eps_cor)
    )
    if final_len <= 0:
        return abort("Secure key length is non-positive after leakage and security margins",
                     leak_ec, leak_verify, residual, True)

    seed_bits = rng.integers(0, 2, n_rem + final_len - 1)
    key_a = toeplitz_hash(a_key, final_len, seed_bits)
    key_b = toeplitz_hash(b_corr, final_len, seed_bits)
    return QKDResult(**base, leak_ec=leak_ec, leak_verify=leak_verify, residual_errors=residual,
                     verified=True, final_length=final_len, accepted=True, abort_reason="",
                     final_key_alice=key_a, final_key_bob=key_b)

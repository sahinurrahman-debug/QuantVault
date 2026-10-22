"""Catalogue of cryptographic mechanisms and their quantum-era classification.

Each entry maps an algorithm identifier (as used in ``data/inventory.json``) to:

* ``role``     - what the mechanism does (key establishment, signature, ...)
* ``family``   - human-readable family name
* ``qclass``   - quantum-era class (see ``QCLASS_LABELS``)
* ``q``        - exposure score in [0, 1] used by the risk engine
* ``note``     - one-line justification shown in the dashboard

The ``q`` scores are transparent, illustrative expert-judgement values, not
measurements. They can be edited here without touching the risk engine.

Key points encoded below (and why):

* RSA / ECC / finite-field DH are broken by a sufficiently capable Shor
  implementation. For *key establishment* this is the Harvest-Now-Decrypt-Later
  (HNDL) vector. Ephemeral exchanges (ECDHE/DHE) give forward secrecy against
  later theft of a long-term key, but a recorded handshake is still exposed to
  a quantum attacker, so they score slightly lower than static/key-transport
  schemes, not safe.
* AES-128 / SHA-256 are *not* broken by Grover; only the generic search margin
  shrinks, so they carry a small score.
* ML-KEM (FIPS 203) is a key-encapsulation mechanism; ML-DSA (FIPS 204) and
  SLH-DSA (FIPS 205) are signatures. They are never interchangeable.
* ``UNKNOWN`` is never treated as safe.
"""

from __future__ import annotations

# Quantum-era classes -> display label
QCLASS_LABELS = {
    "shor_vulnerable": "Quantum-vulnerable (Shor)",
    "grover_reduced": "Reduced margin (Grover)",
    "grover_adequate": "Adequate margin",
    "legacy_weak": "Classically weak / legacy",
    "hybrid": "Hybrid classical + PQC",
    "pq": "Post-quantum (NIST standard)",
    "none": "Not applicable",
    "unknown": "Unknown - not inventoried",
}

KEY_ESTABLISHMENT = "key_establishment"
SIGNATURE = "signature"
SYMMETRIC = "symmetric"
HASH = "hash"

ALGORITHMS: dict[str, dict] = {
    # ------------------------------------------------------------ key establishment
    "RSA-KT": dict(
        role=KEY_ESTABLISHMENT, family="RSA key transport (no forward secrecy)",
        qclass="shor_vulnerable", q=1.00,
        note="Recorded sessions fall to Shor on the server key; no forward secrecy even classically."),
    "RSA-WRAP": dict(
        role=KEY_ESTABLISHMENT, family="RSA key wrapping (RSA-OAEP)",
        qclass="shor_vulnerable", q=1.00,
        note="Wrapped data-encryption keys are recoverable once the RSA key is broken."),
    "DH-STATIC": dict(
        role=KEY_ESTABLISHMENT, family="Static finite-field Diffie-Hellman",
        qclass="shor_vulnerable", q=1.00,
        note="Discrete log is solved by Shor; static keys expose every past session."),
    "DHE": dict(
        role=KEY_ESTABLISHMENT, family="Ephemeral finite-field DH",
        qclass="shor_vulnerable", q=0.90,
        note="Forward secrecy helps against key theft, but a recorded exchange is still exposed to Shor."),
    "ECDH-STATIC": dict(
        role=KEY_ESTABLISHMENT, family="Static elliptic-curve DH",
        qclass="shor_vulnerable", q=1.00,
        note="ECDLP is solved by Shor; static keys expose every past session."),
    "ECDHE": dict(
        role=KEY_ESTABLISHMENT, family="Ephemeral ECDH (P-256/X25519)",
        qclass="shor_vulnerable", q=0.90,
        note="Forward secrecy helps against key theft, but a recorded exchange is still exposed to Shor."),
    "HYBRID-KEM": dict(
        role=KEY_ESTABLISHMENT, family="Hybrid ECDHE + ML-KEM (e.g. X25519MLKEM768)",
        qclass="hybrid", q=0.20,
        note="Secure if either component holds; residual risk is implementation and configuration."),
    "ML-KEM": dict(
        role=KEY_ESTABLISHMENT, family="ML-KEM (FIPS 203)",
        qclass="pq", q=0.10,
        note="Standardised post-quantum KEM; derives symmetric keys, it does not encrypt data directly."),
    # ------------------------------------------------------------ signatures
    "RSA-SIG": dict(
        role=SIGNATURE, family="RSA signatures",
        qclass="shor_vulnerable", q=1.00,
        note="Forgeable by a quantum attacker; matters for long-lived signatures and trust anchors."),
    "ECDSA": dict(
        role=SIGNATURE, family="ECDSA / EdDSA",
        qclass="shor_vulnerable", q=1.00,
        note="Forgeable by a quantum attacker; matters for long-lived signatures and trust anchors."),
    "ML-DSA": dict(
        role=SIGNATURE, family="ML-DSA (FIPS 204)",
        qclass="pq", q=0.10,
        note="Standardised post-quantum signature scheme."),
    "SLH-DSA": dict(
        role=SIGNATURE, family="SLH-DSA (FIPS 205)",
        qclass="pq", q=0.10,
        note="Standardised hash-based signature scheme; conservative assumptions, larger signatures."),
    # ------------------------------------------------------------ symmetric
    "AES-128": dict(
        role=SYMMETRIC, family="AES-128",
        qclass="grover_reduced", q=0.25,
        note="Grover lowers the generic search margin; this is not a break of AES."),
    "AES-192": dict(
        role=SYMMETRIC, family="AES-192",
        qclass="grover_adequate", q=0.10,
        note="Comfortable margin against generic quantum search."),
    "AES-256": dict(
        role=SYMMETRIC, family="AES-256",
        qclass="grover_adequate", q=0.05,
        note="Larger margin against generic quantum search."),
    "3DES": dict(
        role=SYMMETRIC, family="3DES",
        qclass="legacy_weak", q=0.70,
        note="Deprecated: 64-bit blocks (Sweet32) and small effective key. Weak classically as well."),
    # ------------------------------------------------------------ hashes
    "SHA-256": dict(
        role=HASH, family="SHA-256",
        qclass="grover_adequate", q=0.05,
        note="Generic quantum preimage search is not a practical break."),
    "SHA-384": dict(
        role=HASH, family="SHA-384",
        qclass="grover_adequate", q=0.03,
        note="Larger output; ample margin."),
    "SHA-1": dict(
        role=HASH, family="SHA-1",
        qclass="legacy_weak", q=0.60,
        note="Deprecated: practical collisions exist classically."),
}

# Conservative stand-in used when a role is present but not identified.
UNKNOWN_Q = {KEY_ESTABLISHMENT: 0.60, SIGNATURE: 0.50, SYMMETRIC: 0.40, HASH: 0.30}

# Scores that mark a mechanism as "quantum-vulnerable" for the Mosca test.
VULNERABLE_Q_THRESHOLD = 0.50


def lookup(algorithm_id: str | None, role: str) -> dict:
    """Return the catalogue entry, or a conservative ``unknown`` entry.

    ``None``/``"UNKNOWN"`` mean "role not identified" and are *never* treated
    as safe. An id that is not in the catalogue is also treated as unknown.
    """
    if algorithm_id in ALGORITHMS and ALGORITHMS[algorithm_id]["role"] == role:
        return {"id": algorithm_id, **ALGORITHMS[algorithm_id]}
    return {
        "id": algorithm_id or "UNKNOWN",
        "role": role,
        "family": "Unknown - not inventoried",
        "qclass": "unknown",
        "q": UNKNOWN_Q[role],
        "note": "Configuration not inventoried; treated conservatively until verified.",
    }

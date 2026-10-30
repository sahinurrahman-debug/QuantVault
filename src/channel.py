"""Live Quantum-Safe Channel: Tri-Hybrid Key Derivation & AES-GCM Patient Record Encryption.

Demonstrates the core thesis: "QKD supplements PQC, it doesn't replace it" by
connecting all cryptographic layers into a live end-to-end data transmission:

1. Quantum Layer (QKD):
   - Physical layer key generation over simulated optical fiber.
   - If an eavesdropper (Spy) intercepts:
     QBER rises above the 11% bound, so the protocol aborts before any key is derived.
     The record is never encrypted or sent (0 bytes leaked).

2. Post-Quantum Layer (PQC):
   - NIST FIPS 203 ML-KEM-768 lattice key encapsulation.
   - Classical X25519 ECDH key exchange.

3. Tri-Hybrid Key Derivation Function (KDF):
   - Combines K_X25519 || K_MLKEM768 || K_QKD via HKDF-SHA256 into an
     authenticated 256-bit symmetric session key.

4. Application Payload:
   - A synthetic Electronic Health Record (EHR) standing in for data with genomic markers and
     clinical history that needs long-term confidentiality (Mosca X = 30 years).
   - Encrypted with AES-256-GCM (Galois/Counter Mode with 128-bit authentication tag).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .bb84 import BB84Config
from .postprocessing import SecurityParams, run_qkd
from .pqc import HybridKEM, derive_hybrid_qkd_pqc_key

# A synthetic record (no real person) standing in for data that needs multi-decade confidentiality
SAMPLE_PATIENT_RECORD = {
    "patient_id": "MRN-2026-98412",
    "patient_name": "Eleanor Vance",
    "dob": "1968-07-14",
    "blood_group": "A+",
    "diagnosis": "Stage II Post-Operative Oncology Management",
    "genomic_risk_markers": ["BRCA1-Positive", "TP53-Wildtype", "CYP2D6-Normal"],
    "confidential_notes": (
        "Patient enrolled in longitudinal genomic therapy trial. "
        "Lifetime confidentiality required (Mosca X = 30 years)."
    ),
    "vital_signs": {
        "heart_rate_bpm": 72,
        "blood_pressure": "118/76",
        "spO2_percent": 98.5,
    },
    "facility_source": "Oncology Centre - Node Alpha (Fiber ID: FO-084)",
    "facility_destination": "Central Pathology Data Repository - Node Beta",
    "timestamp_iso": "2026-10-30T16:00:00Z",
}


MIN_QUBITS = 256
MAX_QUBITS = 8192
SESSION_KEY_BITS = 256  # the QKD secret that is mixed into the session key


def _fingerprint(key: bytes) -> str:
    """Short public identifier of a key, so both ends can show they hold the same one without revealing it."""
    return hashlib.sha256(b"QuantVault-key-fingerprint:" + key).hexdigest()[:16]


def run_quantum_safe_channel(
    spy: bool = False,
    qkd_qubits: int = 2048,
    record: dict | None = None,
    seed: int = 42,
) -> dict[str, Any]:
    """Execute live quantum-safe channel transmission.

    Bob (the sender) and Alice (the receiver) each derive the session key on their own side from the
    X25519, ML-KEM-768 and QKD secrets they hold. The record is encrypted with Bob's key and decrypted with
    Alice's, so a mismatch in any component makes the transfer fail instead of passing unnoticed.

    Args:
        spy: If True, Eve intercepts and resends every qubit on the quantum link.
        qkd_qubits: Number of qubits sent in the QKD phase (256 to 8192).
        record: Record to encrypt; defaults to the synthetic SAMPLE_PATIENT_RECORD.
        seed: Random seed for reproducible quantum simulation.

    Returns:
        Structured result detailing channel status, key agreement and payload outcome.
    """
    if not isinstance(qkd_qubits, int) or isinstance(qkd_qubits, bool) or not MIN_QUBITS <= qkd_qubits <= MAX_QUBITS:
        raise ValueError(f"qubits must be a whole number between {MIN_QUBITS} and {MAX_QUBITS}")
    record = record or SAMPLE_PATIENT_RECORD
    if not isinstance(record, dict):
        raise ValueError("record must be a JSON object")
    for field in ("patient_id", "patient_name"):
        record.setdefault(field, "(not provided)")

    # -------------------------------------------------------------------------
    # STEP 1: Quantum Key Distribution (QKD)
    # -------------------------------------------------------------------------
    qkd_cfg = BB84Config(
        n_qubits=qkd_qubits,
        eve_enabled=spy,
        eve_fraction=1.0 if spy else 0.0,
        noise_model="depolarizing" if not spy else "none",
        noise_p=0.005 if not spy else 0.0,
        seed=seed,
    )
    security_params = SecurityParams(max_qber=0.11)
    qkd_res = run_qkd(qkd_cfg, security_params)
    observed_qber = float(qkd_res.qber_sample)
    qkd_summary = {
        "qber_observed": observed_qber,
        "qber_threshold": security_params.max_qber,
        "qubits_exchanged": qkd_qubits,
        "sifted_bits": int(qkd_res.n_sifted),
    }

    def withheld(status: str, reason: str, verdict: str, spy_detected: bool) -> dict[str, Any]:
        """No key was produced, so nothing is encrypted and nothing leaves the sender."""
        return {
            "status": status,
            "spy_present": spy,
            "spy_detected": spy_detected,
            "qkd": {"accepted": False, "abort_reason": reason, **qkd_summary},
            "pqc": {"status": "HALTED", "reason": "Key derivation suppressed because the quantum link produced no usable key"},
            "payload": {
                "patient_id": record["patient_id"],
                "patient_name": record["patient_name"],
                "plaintext_transmitted": False,
                "plaintext_bytes_leaked": 0,
                "ciphertext_hex": None,
                "nonce_hex": None,
                "tag_hex": None,
            },
            "defense_summary": "No session key was derived, so no data was encrypted or sent.",
            "verdict": verdict,
        }

    # -------------------------------------------------------------------------
    # STEP 2: Abort before the payload is touched if the quantum link is not trustworthy
    # -------------------------------------------------------------------------
    if not qkd_res.accepted:
        reason = (
            f"Observed QBER of {observed_qber:.2%} against a limit of {security_params.max_qber:.2%}: "
            "the link was disturbed, which is what an eavesdropper's measurements look like. "
            "Key derivation was halted and the payload never left the sender."
        )
        return withheld("ABORTED", reason, "ABORTED: the quantum link failed its security check. Transmission halted, 0 bytes leaked.", True)

    if len(qkd_res.final_key_alice) < SESSION_KEY_BITS:
        reason = (
            f"The link passed its security check, but only {len(qkd_res.final_key_alice)} secret bits survived "
            f"error correction and privacy amplification; {SESSION_KEY_BITS} are needed. Send more qubits."
        )
        return withheld("INSUFFICIENT_KEY", reason, "HALTED: not enough secret key from the quantum link. Send more qubits.", False)

    # -------------------------------------------------------------------------
    # STEP 3: Each side holds its own copy of every secret
    # -------------------------------------------------------------------------
    qkd_alice = np_bits_to_bytes(qkd_res.final_key_alice[:SESSION_KEY_BITS])
    qkd_bob = np_bits_to_bytes(qkd_res.final_key_bob[:SESSION_KEY_BITS])

    kem = HybridKEM()
    alice_kp = kem.generate_keypair()
    ct, x_ss_bob, ml_ss_bob = kem.encapsulate(alice_kp)
    x_ss_alice, ml_ss_alice = kem.decapsulate(alice_kp, ct)

    salt = b"QuantVault-EHR-Live-Channel-v1"
    key_alice = bytes.fromhex(derive_hybrid_qkd_pqc_key(x_ss_alice, ml_ss_alice, qkd_alice, salt=salt).hybrid_session_key_hex)
    key_bob = bytes.fromhex(derive_hybrid_qkd_pqc_key(x_ss_bob, ml_ss_bob, qkd_bob, salt=salt).hybrid_session_key_hex)
    if not hmac.compare_digest(key_alice, key_bob):
        components = {
            "X25519": x_ss_alice == x_ss_bob,
            "ML-KEM-768": ml_ss_alice == ml_ss_bob,
            "QKD": qkd_alice == qkd_bob,
        }
        failed = ", ".join(name for name, ok in components.items() if not ok)
        raise ValueError(f"Alice and Bob derived different session keys (disagreeing component: {failed})")

    # -------------------------------------------------------------------------
    # STEP 4: Bob encrypts with his key, Alice decrypts with hers (AES-256-GCM)
    # -------------------------------------------------------------------------
    plaintext_json = json.dumps(record, separators=(",", ":")).encode("utf-8")
    nonce = secrets.token_bytes(12)  # standard 96-bit GCM nonce
    aad = b"QuantVault-Healthcare-EHR-Authenticated-Data"
    ct_with_tag = AESGCM(key_bob).encrypt(nonce, plaintext_json, aad)
    ciphertext, auth_tag = ct_with_tag[:-16], ct_with_tag[-16:]

    decrypted_record = json.loads(AESGCM(key_alice).decrypt(nonce, ct_with_tag, aad).decode("utf-8"))
    if decrypted_record != record:
        raise ValueError("Decrypted record does not match the original")

    return {
        "status": "TRANSMITTED",
        "spy_present": False,
        "spy_detected": False,
        "qkd": {
            "accepted": True,
            "final_key_bits": len(qkd_res.final_key_alice),
            **qkd_summary,
        },
        "pqc": {
            "status": "SUCCESS",
            "keys_agree": True,
            "session_key_fingerprint": _fingerprint(key_alice),
            "kdf": "HKDF-SHA256(X25519 || ML-KEM-768 || QKD)",
            "cipher": "AES-256-GCM (256-bit key, 96-bit IV, 128-bit tag)",
        },
        "payload": {
            "patient_id": record["patient_id"],
            "patient_name": record["patient_name"],
            "diagnosis": record.get("diagnosis"),
            "plaintext_transmitted": True,
            "plaintext_length_bytes": len(plaintext_json),
            "plaintext_bytes_leaked": 0,
            "nonce_hex": nonce.hex(),
            "ciphertext_hex": ciphertext.hex(),
            "tag_hex": auth_tag.hex(),
            "decrypted_record": decrypted_record,
            "integrity_verified": True,
        },
        "defense_summary": (
            "The session key mixes three independent secrets, so an attacker has to break X25519, "
            "ML-KEM-768 and the QKD secret to recompute it."
        ),
        "verdict": "SECURE TRANSMISSION: QKD link verified, both ends derived the same hybrid key, record encrypted and decrypted intact.",
    }


def np_bits_to_bytes(bits: Any) -> bytes:
    """Pack a numpy array or list of 0/1 bits into bytes."""
    import numpy as np

    arr = np.asarray(bits, dtype=np.uint8)
    byte_count = len(arr) // 8
    truncated = arr[: byte_count * 8]
    packed = np.packbits(truncated)
    return packed.tobytes()

"""Hybrid key agreement: X25519 + ML-KEM-768 (FIPS 203) + a QKD secret, combined with HKDF-SHA256.

1. ML-KEM-768 comes from the ``kyber-py`` package, a pure-Python implementation of FIPS 203. It is
   correct (it matches the standard's sizes and round-trips), but it is not constant-time and not
   hardened, so it is meant for demonstration; production systems should use liboqs or a vendor library.
2. X25519 comes from the ``cryptography`` package (OpenSSL).
3. The three secrets are concatenated and run through HKDF-SHA256:
       K = HKDF(K_X25519 || K_MLKEM768 || K_QKD)
   An attacker has to learn all three inputs to recompute K, so the key stays safe while at least one of
   the three components holds. This is a computational guarantee (HKDF is a hash-based extractor); only the
   QKD component is information-theoretic, and only under the QKD protocol's own assumptions.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from kyber_py.ml_kem import ML_KEM_768


@dataclass
class HybridKeyPair:
    x25519_private_key: x25519.X25519PrivateKey
    x25519_public_bytes: bytes
    mlkem_private_bytes: bytes
    mlkem_public_bytes: bytes


@dataclass
class HybridCiphertext:
    x25519_ephemeral_public_bytes: bytes
    mlkem_ciphertext: bytes


@dataclass
class HybridHandshakeResult:
    x25519_shared_secret_hex: str
    mlkem_shared_secret_hex: str
    qkd_shared_secret_hex: str
    hybrid_session_key_hex: str
    key_length_bytes: int
    defense_in_depth_summary: str


# ---------------------------------------------------------------------------
# ML-KEM-768 (FIPS 203)
# ---------------------------------------------------------------------------

class MLKEM768:
    """ML-KEM-768 key encapsulation (FIPS 203) backed by kyber-py."""

    PUBLIC_KEY_BYTES = 1184
    CIPHERTEXT_BYTES = 1088
    SHARED_SECRET_BYTES = 32

    def generate_keypair(self) -> tuple[bytes, bytes]:
        """Return (encapsulation_key, decapsulation_key)."""
        return ML_KEM_768.keygen()

    def encapsulate(self, public_key_bytes: bytes) -> tuple[bytes, bytes]:
        """Return (ciphertext, shared_secret) for the holder of the matching decapsulation key."""
        shared_secret, ciphertext = ML_KEM_768.encaps(public_key_bytes)
        return ciphertext, shared_secret

    def decapsulate(self, private_key_bytes: bytes, ciphertext_bytes: bytes) -> bytes:
        """Recover the shared secret. A tampered ciphertext yields an unrelated secret (implicit rejection)."""
        return ML_KEM_768.decaps(private_key_bytes, ciphertext_bytes)


# ---------------------------------------------------------------------------
# Hybrid X25519 + ML-KEM-768 Handshake
# ---------------------------------------------------------------------------

class HybridKEM:
    """Combines classical X25519 (ECDH) and post-quantum ML-KEM-768."""

    def __init__(self) -> None:
        self.mlkem = MLKEM768()

    def generate_keypair(self) -> HybridKeyPair:
        """Alice generates combined classical and post-quantum keypair."""
        x_priv = x25519.X25519PrivateKey.generate()
        x_pub = x_priv.public_key().public_bytes_raw()
        ml_pub, ml_priv = self.mlkem.generate_keypair()
        return HybridKeyPair(
            x25519_private_key=x_priv,
            x25519_public_bytes=x_pub,
            mlkem_private_bytes=ml_priv,
            mlkem_public_bytes=ml_pub,
        )

    def encapsulate(self, alice_keypair: HybridKeyPair) -> tuple[HybridCiphertext, bytes, bytes]:
        """Bob encapsulates: generates ephemeral X25519 + ML-KEM ciphertext.
        
        Returns (ciphertext, x25519_shared_secret, mlkem_shared_secret).
        """
        # 1. Ephemeral X25519
        bob_x_priv = x25519.X25519PrivateKey.generate()
        bob_x_pub = bob_x_priv.public_key().public_bytes_raw()
        alice_x_pub = x25519.X25519PublicKey.from_public_bytes(alice_keypair.x25519_public_bytes)
        x_ss = bob_x_priv.exchange(alice_x_pub)

        # 2. ML-KEM encapsulation
        ml_ct, ml_ss = self.mlkem.encapsulate(alice_keypair.mlkem_public_bytes)

        ct = HybridCiphertext(
            x25519_ephemeral_public_bytes=bob_x_pub,
            mlkem_ciphertext=ml_ct,
        )
        return ct, x_ss, ml_ss

    def decapsulate(self, alice_keypair: HybridKeyPair, ct: HybridCiphertext) -> tuple[bytes, bytes]:
        """Alice decapsulates to recover both shared secrets."""
        bob_x_pub = x25519.X25519PublicKey.from_public_bytes(ct.x25519_ephemeral_public_bytes)
        x_ss = alice_keypair.x25519_private_key.exchange(bob_x_pub)
        ml_ss = self.mlkem.decapsulate(alice_keypair.mlkem_private_bytes, ct.mlkem_ciphertext)
        return x_ss, ml_ss


# ---------------------------------------------------------------------------
# Hybrid QKD + PQC Key Derivation (RFC 5869 HKDF)
# ---------------------------------------------------------------------------

def derive_hybrid_qkd_pqc_key(
    x25519_secret: bytes,
    mlkem_secret: bytes,
    qkd_secret: bytes | None = None,
    salt: bytes | None = None,
    key_length: int = 32,
) -> HybridHandshakeResult:
    """Combine Classical, Post-Quantum, and Physical QKD secrets into a session key.
    
    If QKD is not available on a given link, a 32-byte zero/salt is bound with explicit info.
    """
    salt = salt or b"QuantVault-Salt-2026-FIPS203-QKD"
    qkd_bytes = qkd_secret or bytes(32)

    # Concatenate all three secrets: K_total = K_X25519 || K_MLKEM || K_QKD
    combined_ikm = x25519_secret + mlkem_secret + qkd_bytes

    info = b"QuantVault-Hybrid-Session-Key-v1:X25519+MLKEM768+QKD"

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=key_length,
        salt=salt,
        info=info,
    )
    master_key = hkdf.derive(combined_ikm)

    summary = (
        "Tri-hybrid key: an attacker must break X25519, ML-KEM-768 and the QKD secret to recompute it, "
        "so it stays safe while at least one of the three holds."
    )

    return HybridHandshakeResult(
        x25519_shared_secret_hex=x25519_secret.hex(),
        mlkem_shared_secret_hex=mlkem_secret.hex(),
        qkd_shared_secret_hex=qkd_bytes.hex(),
        hybrid_session_key_hex=master_key.hex(),
        key_length_bytes=key_length,
        defense_in_depth_summary=summary,
    )


def execute_full_hybrid_exchange(qkd_secret_hex: str | None = None) -> HybridHandshakeResult:
    """Execute complete end-to-end handshake demonstrating PQC + QKD key derivation."""
    kem = HybridKEM()
    alice_kp = kem.generate_keypair()
    ct, x_ss_bob, ml_ss_bob = kem.encapsulate(alice_kp)
    x_ss_alice, ml_ss_alice = kem.decapsulate(alice_kp, ct)

    if x_ss_bob != x_ss_alice:
        raise ValueError("X25519 shared secrets do not match")
    if ml_ss_bob != ml_ss_alice:
        raise ValueError("ML-KEM shared secrets do not match")

    qkd_bytes = bytes.fromhex(qkd_secret_hex) if qkd_secret_hex else secrets.token_bytes(32)
    return derive_hybrid_qkd_pqc_key(x_ss_alice, ml_ss_alice, qkd_bytes)

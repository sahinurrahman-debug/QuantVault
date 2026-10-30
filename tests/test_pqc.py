"""ML-KEM-768 (via kyber-py) and the hybrid X25519 + ML-KEM + QKD key derivation."""

import pytest

from src.pqc import HybridKEM, MLKEM768, derive_hybrid_qkd_pqc_key, execute_full_hybrid_exchange


def test_mlkem_round_trip_and_fips203_sizes():
    kem = MLKEM768()
    pub, priv = kem.generate_keypair()
    ct, secret_sender = kem.encapsulate(pub)
    assert len(pub) == MLKEM768.PUBLIC_KEY_BYTES == 1184
    assert len(ct) == MLKEM768.CIPHERTEXT_BYTES == 1088
    assert len(secret_sender) == MLKEM768.SHARED_SECRET_BYTES == 32
    assert kem.decapsulate(priv, ct) == secret_sender


def test_mlkem_secrets_are_fresh_each_time():
    kem = MLKEM768()
    pub, _ = kem.generate_keypair()
    assert kem.encapsulate(pub)[1] != kem.encapsulate(pub)[1]


def test_mlkem_tampered_ciphertext_gives_an_unrelated_secret():
    """FIPS 203 implicit rejection: a modified ciphertext must not reveal the real secret."""
    kem = MLKEM768()
    pub, priv = kem.generate_keypair()
    ct, secret = kem.encapsulate(pub)
    tampered = bytes([ct[0] ^ 1]) + ct[1:]
    assert kem.decapsulate(priv, tampered) != secret


def test_mlkem_wrong_private_key_fails_to_recover_the_secret():
    kem = MLKEM768()
    pub, _ = kem.generate_keypair()
    _, other_priv = kem.generate_keypair()
    ct, secret = kem.encapsulate(pub)
    assert kem.decapsulate(other_priv, ct) != secret


def test_hybrid_kem_both_sides_agree_on_both_secrets():
    kem = HybridKEM()
    alice = kem.generate_keypair()
    ct, x_bob, ml_bob = kem.encapsulate(alice)
    x_alice, ml_alice = kem.decapsulate(alice, ct)
    assert x_alice == x_bob
    assert ml_alice == ml_bob


def test_session_key_depends_on_every_component():
    x, ml, qkd = b"x" * 32, b"m" * 32, b"q" * 32
    base = derive_hybrid_qkd_pqc_key(x, ml, qkd).hybrid_session_key_hex
    assert derive_hybrid_qkd_pqc_key(b"y" * 32, ml, qkd).hybrid_session_key_hex != base
    assert derive_hybrid_qkd_pqc_key(x, b"n" * 32, qkd).hybrid_session_key_hex != base
    assert derive_hybrid_qkd_pqc_key(x, ml, b"r" * 32).hybrid_session_key_hex != base
    assert derive_hybrid_qkd_pqc_key(x, ml, qkd).hybrid_session_key_hex == base


def test_full_exchange_returns_a_32_byte_key():
    res = execute_full_hybrid_exchange("11" * 32)
    assert res.key_length_bytes == 32
    assert len(res.hybrid_session_key_hex) == 64

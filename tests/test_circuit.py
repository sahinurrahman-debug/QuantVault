"""BB84 circuits and the quantum phase."""

import numpy as np
import pytest
from qiskit_aer import AerSimulator

from src.bb84 import BB84Config, bb84_circuit, qber, run_quantum_phase


def _bob(circuit, shots=200):
    mem = AerSimulator().run(circuit, shots=shots, memory=True, seed_simulator=1).result().get_memory()
    return np.array([int(m.split()[-1]) for m in mem])


@pytest.mark.parametrize("bit", [0, 1])
@pytest.mark.parametrize("basis", [0, 1])
def test_matching_bases_recover_the_bit(bit, basis):
    assert set(_bob(bb84_circuit(bit, basis, basis))) == {bit}


@pytest.mark.parametrize("alice_basis", [0, 1])
def test_mismatched_bases_give_random_outcome(alice_basis):
    out = _bob(bb84_circuit(0, alice_basis, 1 - alice_basis), shots=2000)
    assert 0.44 < out.mean() < 0.56


def test_eve_with_matching_basis_is_invisible():
    assert set(_bob(bb84_circuit(1, 0, 0, eve_basis=0))) == {1}


def test_eve_with_wrong_basis_causes_errors_about_half_the_time():
    out = _bob(bb84_circuit(1, 0, 0, eve_basis=1), shots=2000)
    assert 0.44 < (out == 0).mean() < 0.56


def test_ideal_channel_has_zero_qber():
    q = run_quantum_phase(BB84Config(n_qubits=1000, seed=1))
    assert qber(q.sifted_alice, q.sifted_bob) == 0.0
    assert 400 < q.sift_mask.sum() < 600  # about half the bases agree


def test_intercept_resend_gives_about_25_percent_qber():
    q = run_quantum_phase(BB84Config(n_qubits=4000, eve_enabled=True, seed=2))
    assert 0.21 < qber(q.sifted_alice, q.sifted_bob) < 0.29


def test_partial_interception_scales_qber():
    q = run_quantum_phase(BB84Config(n_qubits=4000, eve_enabled=True, eve_fraction=0.4, seed=3))
    assert 0.06 < qber(q.sifted_alice, q.sifted_bob) < 0.14


def test_bitflip_noise_only_hits_one_basis():
    p = 0.2
    q = run_quantum_phase(BB84Config(n_qubits=4000, noise_model="bitflip", noise_p=p, seed=4))
    z = q.sift_mask & (q.alice_bases == 0)
    x = q.sift_mask & (q.alice_bases == 1)
    assert qber(q.alice_bits[z], q.bob_bits[z]) == pytest.approx(p, abs=0.04)
    assert qber(q.alice_bits[x], q.bob_bits[x]) == 0.0


def test_readout_noise_affects_both_bases():
    q = run_quantum_phase(BB84Config(n_qubits=4000, noise_model="readout", noise_p=0.1, seed=5))
    assert qber(q.sifted_alice, q.sifted_bob) == pytest.approx(0.1, abs=0.03)


def test_noise_increases_qber():
    values = [qber(*(lambda q: (q.sifted_alice, q.sifted_bob))(
        run_quantum_phase(BB84Config(n_qubits=3000, noise_model="depolarizing", noise_p=p, seed=6))))
        for p in (0.0, 0.1, 0.3)]
    assert values[0] < values[1] < values[2]


def test_seed_reproducibility():
    a = run_quantum_phase(BB84Config(n_qubits=300, eve_enabled=True, seed=9))
    b = run_quantum_phase(BB84Config(n_qubits=300, eve_enabled=True, seed=9))
    assert np.array_equal(a.bob_bits, b.bob_bits)


def test_invalid_config_rejected():
    with pytest.raises(ValueError):
        BB84Config(noise_model="gaussian")
    with pytest.raises(ValueError):
        BB84Config(noise_p=1.5)

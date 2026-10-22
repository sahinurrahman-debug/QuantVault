"""BB84 quantum key distribution simulated with Qiskit and Qiskit Aer.

Participants
------------
* **Alice** encodes a random bit in a random basis (Z: |0>,|1>  or  X: |+>,|->).
* **Eve** (optional) performs an *intercept-resend* attack: she measures a
  qubit in a random basis and resends the state she observed.
* **Bob** measures in his own random basis.

Simulation strategy
-------------------
Every qubit is physically simulated as a small circuit, but circuits that have
identical structure (same bit, Alice basis, Eve basis, Bob basis) are run once
with ``shots = number of such qubits`` and ``memory=True``. Each shot is an
independent trial (independent Eve outcome, independent noise), so this is
equivalent to simulating the qubits one by one but needs at most 16 circuits.

Circuit layout (2 qubits)
-------------------------
* qubit 0 is the photon travelling through the quantum channel,
* qubit 1 is Bob's detector. The photon is moved to it with an ideal SWAP so
  that detector (readout) noise can be attached to Bob only, never to Eve.

Noise models (``noise_model``)
------------------------------
* ``"bitflip"``      - X error with probability p on the channel. A Pauli-X
  leaves X-basis states unchanged, so only half the sifted bits can be
  affected and QBER is about p/2.
* ``"depolarizing"`` - single-qubit depolarizing channel with parameter p.
* ``"readout"``      - Bob's detector misreports the outcome with probability p.

``p`` is the parameter of the chosen Aer noise model, not a universal physical
noise measure.
"""

from __future__ import annotations

from dataclasses import dataclass
from collections import defaultdict

import numpy as np
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, ReadoutError, depolarizing_error, pauli_error

NOISE_MODELS = ("none", "bitflip", "depolarizing", "readout")


@dataclass
class BB84Config:
    n_qubits: int = 2048
    eve_enabled: bool = False
    eve_fraction: float = 1.0       # share of qubits Eve intercepts (1.0 = all)
    noise_model: str = "none"       # one of NOISE_MODELS
    noise_p: float = 0.0
    sample_fraction: float = 0.25   # share of the sifted key revealed for QBER estimation
    seed: int | None = None

    def __post_init__(self) -> None:
        if self.noise_model not in NOISE_MODELS:
            raise ValueError(f"noise_model must be one of {NOISE_MODELS}")
        if not 0.0 <= self.noise_p <= 1.0:
            raise ValueError("noise_p must be in [0, 1]")
        if not 0.0 <= self.eve_fraction <= 1.0:
            raise ValueError("eve_fraction must be in [0, 1]")
        if not 0.0 < self.sample_fraction < 1.0:
            raise ValueError("sample_fraction must be in (0, 1)")
        if self.n_qubits < 8:
            raise ValueError("n_qubits must be at least 8")


@dataclass
class QuantumPhase:
    """Everything that happens before classical post-processing."""

    config: BB84Config
    alice_bits: np.ndarray
    alice_bases: np.ndarray      # 0 = Z (computational), 1 = X (diagonal)
    bob_bases: np.ndarray
    bob_bits: np.ndarray
    eve_bases: np.ndarray        # -1 = qubit not intercepted
    sift_mask: np.ndarray        # True where Alice's and Bob's bases agree

    @property
    def sifted_alice(self) -> np.ndarray:
        return self.alice_bits[self.sift_mask]

    @property
    def sifted_bob(self) -> np.ndarray:
        return self.bob_bits[self.sift_mask]


def build_noise_model(kind: str, p: float) -> NoiseModel | None:
    """Aer noise model for the chosen channel type (``None`` when ideal)."""
    if kind == "none" or p == 0.0:
        return None
    nm = NoiseModel()
    if kind == "bitflip":
        nm.add_quantum_error(pauli_error([("X", p), ("I", 1.0 - p)]), ["id"], [0])
    elif kind == "depolarizing":
        nm.add_quantum_error(depolarizing_error(p, 1), ["id"], [0])
    elif kind == "readout":
        nm.add_readout_error(ReadoutError([[1 - p, p], [p, 1 - p]]), [1])
    return nm


def bb84_circuit(bit: int, alice_basis: int, bob_basis: int, eve_basis: int = -1) -> QuantumCircuit:
    """One BB84 transmission. ``eve_basis`` = -1 means no interception."""
    photon, detector = QuantumRegister(1, "photon"), QuantumRegister(1, "detector")
    bob_bit = ClassicalRegister(1, "bob")
    regs = [photon, detector, bob_bit]
    eve_bit = None
    if eve_basis >= 0:
        eve_bit = ClassicalRegister(1, "eve")
        regs.append(eve_bit)
    qc = QuantumCircuit(*regs, name=f"bb84_b{bit}_a{alice_basis}_e{eve_basis}_r{bob_basis}")

    # Alice: prepare |bit> in her basis
    if bit:
        qc.x(photon[0])
    if alice_basis:
        qc.h(photon[0])
    qc.barrier()

    # Eve: measure in her basis, then resend what she saw
    if eve_bit is not None:
        if eve_basis:
            qc.h(photon[0])
        qc.measure(photon[0], eve_bit[0])
        qc.reset(photon[0])
        with qc.if_test((eve_bit, 1)):
            qc.x(photon[0])
        if eve_basis:
            qc.h(photon[0])
        qc.barrier()

    # Quantum channel (noisy identity) and hand-over to Bob's detector
    qc.id(photon[0])
    qc.swap(photon[0], detector[0])

    # Bob: measure in his basis
    if bob_basis:
        qc.h(detector[0])
    qc.measure(detector[0], bob_bit[0])
    return qc


def run_quantum_phase(cfg: BB84Config) -> QuantumPhase:
    """Alice -> (Eve) -> Bob for ``cfg.n_qubits`` qubits."""
    rng = np.random.default_rng(cfg.seed)
    n = cfg.n_qubits
    alice_bits = rng.integers(0, 2, n)
    alice_bases = rng.integers(0, 2, n)
    bob_bases = rng.integers(0, 2, n)
    eve_bases = np.full(n, -1)
    if cfg.eve_enabled:
        intercepted = rng.random(n) < cfg.eve_fraction
        eve_bases[intercepted] = rng.integers(0, 2, int(intercepted.sum()))

    # Group qubits with identical circuit structure.
    groups: dict[tuple, list[int]] = defaultdict(list)
    for i in range(n):
        groups[(int(alice_bits[i]), int(alice_bases[i]), int(bob_bases[i]), int(eve_bases[i]))].append(i)

    keys = list(groups)
    circuits = [bb84_circuit(bit, ab, rb, eb) for (bit, ab, rb, eb) in keys]

    backend = AerSimulator(noise_model=build_noise_model(cfg.noise_model, cfg.noise_p))
    bob_bits = np.zeros(n, dtype=int)
    # One run per distinct shot count would waste time; run groups individually
    # so each gets exactly as many shots as it has qubits.
    seed_base = int(rng.integers(0, 2**31 - 1))
    for k, (key, qc) in enumerate(zip(keys, circuits)):
        positions = groups[key]
        job = backend.run(qc, shots=len(positions), memory=True, seed_simulator=seed_base + k)
        memory = job.result().get_memory()
        # Aer prints registers newest-first: "<eve> <bob>" -> Bob is the last token.
        bob_bits[positions] = [int(m.split()[-1]) for m in memory]

    return QuantumPhase(
        config=cfg, alice_bits=alice_bits, alice_bases=alice_bases, bob_bases=bob_bases,
        bob_bits=bob_bits, eve_bases=eve_bases, sift_mask=alice_bases == bob_bases,
    )


def qber(a: np.ndarray, b: np.ndarray) -> float:
    """Quantum bit error rate: mismatches / compared bits."""
    return float(np.mean(a != b)) if len(a) else float("nan")

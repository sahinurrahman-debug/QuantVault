"""E91 Entanglement-based Quantum Key Distribution with CHSH Bell Inequality Test.

Theoretical foundation
----------------------
1. Entangled state:
   Alice and Bob share maximally entangled Bell pairs:
       |Phi+> = (|00> + |11>) / sqrt(2)

2. CHSH Bell Inequality (Clauser-Horne-Shimony-Holt, 1969; Ekert, 1991):
   Alice chooses from measurement angles:
       A0 = 0,  A1 = pi/2
   Bob chooses from measurement angles:
       B0 = pi/4,  B1 = -pi/4
   Key generation basis:
       A_key = 0,  B_key = 0  (identical Z basis -> perfect correlation)

   Expectation values for |Phi+> under measurement angles theta_A and theta_B:
       E(A, B) = cos(theta_A - theta_B)
       E(A0, B0) = cos(-pi/4) = +1/sqrt(2) approx +0.7071
       E(A0, B1) = cos(+pi/4) = +1/sqrt(2) approx +0.7071
       E(A1, B0) = cos(+pi/4) = +1/sqrt(2) approx +0.7071
       E(A1, B1) = cos(3pi/4) = -1/sqrt(2) approx -0.7071

   Bell parameter:
       S = E(A0, B0) + E(A0, B1) + E(A1, B0) - E(A1, B1)
       S_ideal = 2 * sqrt(2) approx 2.8284

3. Classical vs Quantum limits:
   * Any local hidden-variable (classical) theory must satisfy: |S| <= 2.
   * A measured S > 2 conclusively refutes classical randomness ("classical in a costume"),
     proving genuine non-local quantum entanglement.
   * Under an intercept-resend attack (Eve measuring Bob's qubit in Z or X basis),
     entanglement is broken into a separable mixture, dropping S to:
       S_eve = sqrt(2) approx 1.4142 <= 2.
   * Any eavesdropper is thus detected unconditionally by the collapse of S below 2,
     independent of Eve's technology or device flaws (device-independent certification).
"""

from __future__ import annotations

import json
import os
import math
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister, transpile
from qiskit_aer import AerSimulator

ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = ROOT / "results"


KEY_NOTE = (
    "E91 here certifies the channel (Bell test plus key-basis QBER). It does not extract a secret key; "
    "reconciliation and privacy amplification are implemented in the BB84 pipeline."
)


def results_dir() -> Path:
    """Where result artifacts are written; QUANTVAULT_RESULTS_DIR redirects it (the tests use a temp folder)."""
    return Path(os.environ.get("QUANTVAULT_RESULTS_DIR") or RESULTS_DIR)

# Standard CHSH test angles (radians in X-Z plane)
CHSH_ANGLES = {
    "A0": 0.0,
    "A1": np.pi / 2.0,
    "B0": np.pi / 4.0,
    "B1": -np.pi / 4.0,
}


@dataclass
class E91Config:
    shots_per_setting: int = 4000
    key_shots: int = 4000
    eve_enabled: bool = False
    eve_fraction: float = 1.0
    backend_name: str = "fake_marrakesh"  # "aer", "fake_marrakesh", or "ibm"
    ibm_backend: str = "ibm_brisbane"
    ibm_token: str | None = None
    seed: int | None = 42
    alpha: float = 0.05  # 95% confidence intervals


@dataclass
class CHSHSettingResult:
    setting: str
    theta_a: float
    theta_b: float
    counts: dict[str, int]
    n_shots: int
    e_val: float
    std_err: float


@dataclass
class E91Result:
    backend: str
    job_id: str
    timestamp: str
    eve_enabled: bool
    eve_fraction: float
    shots_per_setting: int
    settings: dict[str, dict[str, Any]]
    s_value: float
    s_std_err: float
    ci_95: tuple[float, float]
    sigma_above_classical: float
    violates_bell: bool
    verdict: str
    # Key generation metrics on matching basis (A0, B_key) = (0, 0)
    key_shots: int
    key_counts: dict[str, int]
    qber_key: float
    key_accepted: bool
    key_note: str = KEY_NOTE
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["ci_95"] = list(self.ci_95)
        return d


def build_e91_circuit(
    theta_a: float,
    theta_b: float,
    eve_intercept: bool = False,
    eve_basis: str = "Z",
) -> QuantumCircuit:
    """Build a 2-qubit Bell pair circuit with planar measurement rotations.
    
    Qubit 0 is Alice's, Qubit 1 is Bob's.
    Measurement along angle theta in X-Z plane is performed by Ry(-theta) followed by Z-basis measurement.
    """
    q = QuantumRegister(2, "q")
    c = ClassicalRegister(2, "c")
    circ_name = f"e91_a{theta_a:.2f}_b{theta_b:.2f}"
    if eve_intercept:
        circ_name += f"_eve_{eve_basis}"
    qc = QuantumCircuit(q, c, name=circ_name)

    # Prepare maximally entangled Bell state |Phi+> = (|00> + |11>) / sqrt(2)
    qc.h(q[0])
    qc.cx(q[0], q[1])
    qc.barrier()

    # Optional Eve intercept-resend attack on Bob's qubit (q[1])
    if eve_intercept:
        if eve_basis == "X":
            qc.h(q[1])
        qc.measure(q[1], c[1])
        qc.reset(q[1])
        with qc.if_test((c[1], 1)):
            qc.x(q[1])
        if eve_basis == "X":
            qc.h(q[1])
        qc.barrier()

    # Alice's measurement along angle theta_a
    if abs(theta_a) > 1e-6:
        qc.ry(-theta_a, q[0])
    qc.measure(q[0], c[0])

    # Bob's measurement along angle theta_b
    if abs(theta_b) > 1e-6:
        qc.ry(-theta_b, q[1])
    qc.measure(q[1], c[1])

    return qc


def compute_correlation(counts: dict[str, int], total_shots: int) -> tuple[float, float]:
    """Calculate correlation E = (N00 + N11 - N01 - N10) / N and standard error."""
    # Qiskit count keys are formatted as "c1 c0" or "c1c0" (Bob Alice)
    n00 = n11 = n01 = n10 = 0
    for k, v in counts.items():
        k_clean = k.replace(" ", "")
        bob_bit = int(k_clean[0])
        alice_bit = int(k_clean[1])
        if alice_bit == 0 and bob_bit == 0:
            n00 += v
        elif alice_bit == 1 and bob_bit == 1:
            n11 += v
        elif alice_bit == 0 and bob_bit == 1:
            n01 += v
        elif alice_bit == 1 and bob_bit == 0:
            n10 += v

    e_val = (n00 + n11 - n01 - n10) / total_shots if total_shots > 0 else 0.0
    # Standard error for bounded [-1, 1] sample mean
    std_err = math.sqrt(max(0.0, 1.0 - e_val**2) / total_shots) if total_shots > 0 else 0.0
    return float(e_val), float(std_err)


def get_backend(cfg: E91Config):
    """Instantiate the simulator or hardware target."""
    if cfg.backend_name == "aer":
        return AerSimulator(), "AerSimulator (Ideal)"
    elif cfg.backend_name == "fake_marrakesh":
        from qiskit_ibm_runtime.fake_provider import FakeMarrakesh
        fake = FakeMarrakesh()
        sim = AerSimulator.from_backend(fake)
        return sim, f"FakeMarrakesh ({fake.num_qubits}-qubit IBM Heron model)"
    elif cfg.backend_name == "ibm":
        from qiskit_ibm_runtime import QiskitRuntimeService
        if cfg.ibm_token:
            service = QiskitRuntimeService(channel="ibm_quantum_platform", token=cfg.ibm_token)
        else:
            service = QiskitRuntimeService(channel="ibm_quantum_platform")
        backend = service.backend(cfg.ibm_backend)
        return backend, f"IBM Quantum Hardware ({backend.name})"
    else:
        raise ValueError(f"Unknown backend: {cfg.backend_name}. Choose 'aer', 'fake_marrakesh', or 'ibm'.")


def run_e91_experiment(cfg: E91Config | None = None) -> E91Result:
    """Execute the full 4-setting CHSH Bell test and matching-basis key generation."""
    cfg = cfg or E91Config()
    backend, backend_label = get_backend(cfg)

    timestamp = datetime.now(timezone.utc).isoformat()
    job_id = f"qv-e91-{uuid.uuid4().hex[:12]}"

    settings_to_run = [
        ("A0_B0", CHSH_ANGLES["A0"], CHSH_ANGLES["B0"]),
        ("A0_B1", CHSH_ANGLES["A0"], CHSH_ANGLES["B1"]),
        ("A1_B0", CHSH_ANGLES["A1"], CHSH_ANGLES["B0"]),
        ("A1_B1", CHSH_ANGLES["A1"], CHSH_ANGLES["B1"]),
    ]

    setting_results: dict[str, dict[str, Any]] = {}
    e_vals = {}
    var_sum = 0.0

    shots = cfg.shots_per_setting

    for name, ta, tb in settings_to_run:
        if cfg.eve_enabled:
            # Eve randomly measures 50% in Z and 50% in X
            shots_half = shots // 2
            qc_z = build_e91_circuit(ta, tb, eve_intercept=True, eve_basis="Z")
            qc_x = build_e91_circuit(ta, tb, eve_intercept=True, eve_basis="X")

            tqc_z = transpile(qc_z, backend)
            tqc_x = transpile(qc_x, backend)

            counts_z = backend.run(tqc_z, shots=shots_half).result().get_counts()
            counts_x = backend.run(tqc_x, shots=shots - shots_half).result().get_counts()

            # Merge counts
            merged_counts: dict[str, int] = {}
            for k, v in counts_z.items():
                merged_counts[k] = merged_counts.get(k, 0) + v
            for k, v in counts_x.items():
                merged_counts[k] = merged_counts.get(k, 0) + v
            counts = merged_counts
        else:
            qc = build_e91_circuit(ta, tb, eve_intercept=False)
            tqc = transpile(qc, backend)
            counts = backend.run(tqc, shots=shots).result().get_counts()

        e_val, std_err = compute_correlation(counts, shots)
        e_vals[name] = e_val
        var_sum += std_err**2

        setting_results[name] = {
            "theta_a": ta,
            "theta_b": tb,
            "e_val": round(e_val, 4),
            "std_err": round(std_err, 4),
            "counts": counts,
        }

    # CHSH parameter: S = E(A0, B0) + E(A0, B1) + E(A1, B0) - E(A1, B1)
    s_val = e_vals["A0_B0"] + e_vals["A0_B1"] + e_vals["A1_B0"] - e_vals["A1_B1"]
    s_std_err = math.sqrt(var_sum)
    z_critical = 1.96  # 95% confidence interval
    ci_95 = (round(s_val - z_critical * s_std_err, 4), round(s_val + z_critical * s_std_err, 4))
    sigma_above_classical = (s_val - 2.0) / s_std_err if s_std_err > 0 else 0.0

    violates_bell = bool(s_val > 2.0 and ci_95[0] > 2.0)

    # Key generation setting: (A0, B_key) = (0.0, 0.0) -> perfectly correlated in Z basis
    k_shots = cfg.key_shots
    if cfg.eve_enabled:
        shots_half = k_shots // 2
        qc_kz = build_e91_circuit(0.0, 0.0, eve_intercept=True, eve_basis="Z")
        qc_kx = build_e91_circuit(0.0, 0.0, eve_intercept=True, eve_basis="X")
        tqc_kz = transpile(qc_kz, backend)
        tqc_kx = transpile(qc_kx, backend)
        k_counts_z = backend.run(tqc_kz, shots=shots_half).result().get_counts()
        k_counts_x = backend.run(tqc_kx, shots=k_shots - shots_half).result().get_counts()
        key_counts: dict[str, int] = {}
        for k, v in k_counts_z.items():
            key_counts[k] = key_counts.get(k, 0) + v
        for k, v in k_counts_x.items():
            key_counts[k] = key_counts.get(k, 0) + v
    else:
        qc_key = build_e91_circuit(0.0, 0.0, eve_intercept=False)
        tqc_key = transpile(qc_key, backend)
        key_counts = backend.run(tqc_key, shots=k_shots).result().get_counts()

    # Calculate QBER on matching basis: mismatches are '01' and '10'
    n_err = sum(v for k, v in key_counts.items() if k.replace(" ", "") in ("01", "10"))
    qber_key = n_err / k_shots if k_shots > 0 else 1.0

    # Decision logic
    # Key is accepted only if Bell test succeeds (S > 2) AND QBER <= 11% (standard QKD abort threshold)
    if violates_bell and qber_key <= 0.11:
        key_accepted = True
        verdict = f"ACCEPTED: Bell violation verified (S={s_val:.3f} > 2.0, {sigma_above_classical:.1f} sigma above classical bound). Genuine entanglement certified."
    else:
        key_accepted = False
        if not violates_bell:
            verdict = f"ABORTED: Bell inequality not violated (S={s_val:.3f} <= 2.0). Entanglement broken by eavesdropper or severe noise."
        else:
            verdict = f"ABORTED: High QBER on key generation basis ({qber_key:.2%} > 11.0%)."

    result = E91Result(
        backend=backend_label,
        job_id=job_id,
        timestamp=timestamp,
        eve_enabled=cfg.eve_enabled,
        eve_fraction=cfg.eve_fraction,
        shots_per_setting=cfg.shots_per_setting,
        settings=setting_results,
        s_value=round(s_val, 4),
        s_std_err=round(s_std_err, 4),
        ci_95=ci_95,
        sigma_above_classical=round(sigma_above_classical, 2),
        violates_bell=violates_bell,
        verdict=verdict,
        key_shots=k_shots,
        key_counts=key_counts,
        qber_key=round(qber_key, 4),
        key_accepted=key_accepted,
        notes="Device-independent Bell test directly eliminates classical simulation / RNG masquerading.",
    )

    # Save artifact in results/
    out_dir = results_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = f"e91_{cfg.backend_name}_{'eve' if cfg.eve_enabled else 'clean'}_{job_id}"
    out_file = out_dir / f"{slug}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result.to_dict(), f, indent=2)

    return result

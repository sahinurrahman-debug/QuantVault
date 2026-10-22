"""QKD versus post-quantum cryptography (PQC): comparison content.

The two are not drop-in alternatives. QKD distributes key material using
quantum states; ML-KEM is a classical key-encapsulation mechanism. In both
cases the resulting secret is normally fed into a key-derivation function and
used with a symmetric cipher (e.g. AES-256-GCM) to protect the traffic.
"""

from __future__ import annotations

NOISE_LABELS = {"bitflip": "Bit-flip (channel)", "depolarizing": "Depolarizing (channel)",
                "readout": "Readout error (Bob's detector)"}

COMPARISON_ROWS = [
    ("Fundamental approach",
     "Quantum states plus an authenticated classical channel",
     "Classical algorithms designed to resist known quantum attacks"),
    ("Example", "BB84", "ML-KEM (FIPS 203) for key establishment; ML-DSA (FIPS 204) for signatures"),
    ("Specialised hardware", "Generally required for a physical deployment", "Not required"),
    ("Network infrastructure", "Needs a suitable quantum channel (e.g. dedicated fibre)",
     "Runs over conventional digital networks"),
    ("Deployment complexity", "Often high", "Usually compatible with existing IT, though migration is still non-trivial"),
    ("Distance / topology limits", "Set by the physical channel and trusted-node infrastructure",
     "Normal network constraints only"),
    ("Security assumptions", "Protocol, device, implementation, authentication and physical-channel assumptions",
     "Mathematical hardness assumptions, specification and implementation security"),
    ("Needs authentication?", "Yes: an authenticated classical channel is mandatory",
     "Yes: authenticity comes from signatures/certificates (ML-DSA, SLH-DSA, ...)"),
    ("Typical application", "Specialised point-to-point key-distribution links",
     "Broadly applicable key establishment and signatures"),
    ("Main limitation", "Infrastructure cost, hardware constraints, deployment complexity",
     "Depends on the chosen algorithm and a correct implementation; migration effort"),
]

WORKFLOW_PQC = [
    "Client and server run a key-establishment protocol (e.g. TLS 1.3 with hybrid X25519 + ML-KEM-768).",
    "ML-KEM encapsulation yields a shared secret (a KEM does not encrypt the application data).",
    "A key-derivation function (HKDF) turns the shared secret into symmetric session keys.",
    "AES-256-GCM (or similar) protects the actual traffic; signatures/certificates authenticate the peers.",
]
WORKFLOW_QKD = [
    "Alice and Bob exchange quantum states over a quantum channel and sift, estimate errors, reconcile.",
    "Privacy amplification yields a shared secret key (needs an authenticated classical channel).",
    "The key is fed into a key-management system / KDF.",
    "A symmetric cipher (AES-256-GCM, or a one-time pad where rates allow) protects the traffic.",
]

PRIORITIES = [
    ("First", "Inventory cryptographic assets and plan migration to standardised post-quantum cryptography."),
    ("Second", "Identify systems needing long-term confidentiality and evaluate their exposure (Mosca)."),
    ("Third", "Consider QKD for specific high-value fixed links where its properties justify the cost."),
]

MODEL_LIMITATIONS = [
    "This is a simulation of an idealised BB84; real devices have source, detector and side-channel imperfections.",
    "Only the intercept-resend attack is modelled. Other attacks (photon-number splitting, detector blinding, "
    "coherent attacks) are out of scope.",
    "A low QBER does not prove that no eavesdropper exists; detection depends on sampling and statistics.",
    "The key-length accounting is a simplified finite-key illustration, not a formal security proof.",
    "Reconciliation (Cascade) is an educational implementation, not a production QKD reconciliation protocol.",
    "The operational QBER threshold is a configurable setting, not a universal BB84 security limit.",
    "QKD requires an authenticated classical channel; authentication is assumed, not simulated.",
    "The risk inventory is illustrative sample data, and the threat horizon Z is an assumption, not a prediction.",
]

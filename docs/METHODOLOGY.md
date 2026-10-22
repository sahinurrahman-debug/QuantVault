# QuantVault Methodology and Security Model

QuantVault answers three questions: **what cryptography do we use, what must migrate first, and where does
quantum-secure communication make sense?** This document states the formulas, assumptions and limits behind each answer.

## 1. Harvest Now, Decrypt Later (HNDL)

An adversary records encrypted traffic today and decrypts it once a capable quantum computer exists. RSA, classical
elliptic-curve and finite-field Diffie-Hellman key establishment are exposed to a sufficiently capable Shor implementation.

* Seeing RSA/ECC in a system does **not** mean every captured session is decryptable. Forward secrecy (ECDHE/DHE) protects
  recorded sessions against *later theft of a long-term key*, but a recorded ephemeral exchange is still exposed to a
  quantum attack on that exchange. QuantVault therefore scores ephemeral exchanges slightly below static ones (0.90 vs 1.00),
  not as safe.
* Signatures (RSA, ECDSA) are a different risk: forging one needs a quantum attacker *at attack time*, so it is an
  authenticity risk for long-lived trust (firmware, certificates), not a retroactive confidentiality risk.
* AES-128 and SHA-256 are not broken by Grover's algorithm; the generic search margin shrinks. They get small scores.
* ML-KEM (FIPS 203) is a **key-encapsulation mechanism**; ML-DSA (FIPS 204) and SLH-DSA (FIPS 205) are **signatures**.
  They are not interchangeable and ML-KEM does not encrypt data directly.

## 2. Mosca's inequality

`X + Y > Z`: X = years the data must stay confidential, Y = years to migrate, Z = assumed years to a cryptographically
relevant quantum computer. For signatures X is the number of years the signature must remain trustworthy.

* Z is a user-controlled assumption (slider, 5-40 years). No one knows its true value.
* The test applies when the relevant mechanism is quantum-vulnerable (status *violated* or *ok*) or unknown
  (*indeterminate*, never silently safe). It is *not applicable* for post-quantum/hybrid mechanisms or when nothing must
  stay protected.
* It is a prioritisation heuristic, not a probability of compromise. `-(X+Y-Z)` is reported as "slack" in years.

## 3. Risk score

`R = 100 (0.35 C + 0.25 Q + 0.20 E + 0.20 M)`, every component in [0, 1], weights configurable (`RiskConfig.weights`).

| Component | Definition |
| :-- | :-- |
| C | `0.7 * min(X/30, 1) + 0.3 * sensitivity` (public 0, internal 0.4, confidential 0.7, restricted 1.0) |
| Q | max of the key-establishment, symmetric and hash scores (+ signature score when integrity lifetime > 0); catalogue in `src/algorithms.py` |
| E | internet 1.0, partner 0.7, internal 0.4, isolated 0.15 |
| M | `0.5 * difficulty + 0.5 * min(Y/10, 1)`; difficulty low 0.2, medium 0.5, high 0.8, very high 1.0 |

`security_exposure` uses C, Q and E only, so migration difficulty never makes a vulnerable system look more or less secure.
`R` (which adds M) is the **migration priority**.

**Tier rules** (`src/risk.py`): Critical `R>=75`, High `R>=62`, Medium `R>=40`, else Low, then
(1) no confidentiality/integrity lifetime, or only post-quantum/hybrid/adequate-margin mechanisms with nothing unknown -> Low (monitor);
(2) Mosca violated -> at least High; (3) any unknown mechanism -> at least Medium.

The sample inventory (`data/inventory.json`) is **illustrative**, not findings from a real organisation.
Score values are transparent expert-judgement defaults, meant to be edited and challenged.

## 4. BB84 simulation

Alice encodes a random bit in a random basis (Z or X); Eve optionally intercepts and resends; Bob measures in a random basis.
Implemented with Qiskit circuits executed on Qiskit Aer. Circuits with identical structure are run once with `shots = count` and
`memory=True`, so each shot is an independent trial (independent Eve result and noise).

`QBER = errors / compared bits`. For an ideal intercept-resend attack on **every** qubit the expected sifted-key QBER is
about 25 %; intercepting a fraction f gives about 25 % x f. A low QBER does **not** prove no eavesdropper exists.

Noise models (Aer): bit-flip and depolarizing on the channel, readout error on Bob's detector. A Pauli-X leaves X-basis
states unchanged, so bit-flip noise p gives QBER about p/2. `p` is a model parameter, not a universal physical measure.

## 5. Post-processing (educational)

1. **Sifting** and **parameter estimation**: a random 25 % sample of the sifted key is revealed and discarded;
   a one-sided Clopper-Pearson bound gives `Q_upper` (failure probability eps_pe).
2. **Reconciliation**: simplified Cascade (4 passes, shuffled blocks, binary search, back-tracking). Every disclosed parity is counted as leakage.
3. **Verification**: `ceil(log2(1/eps_cor))` random parities compared; also counted as leakage.
4. **Privacy amplification**: Toeplitz 2-universal hash to

   `l = n (1 - h2(Q_upper)) - leak_EC - leak_verify - 2 log2(1/eps_PA) - log2(2/eps_cor)`

   The run aborts if `Q_upper` exceeds the configurable operational threshold (default 11 %) or if `l <= 0`.

### Limitations

* Teaching-grade, not a production QKD stack and not a formal finite-key security proof.
* The abort threshold is a configurable setting, **not** a universal BB84 limit; it depends on protocol, devices and proof.
* Only the intercept-resend attack is modelled (no photon-number splitting, detector blinding or coherent attacks, no side channels).
* The classical channel must be **authenticated**; authentication is assumed, not simulated.
* An "accepted" run means the simplified checks passed. It is not a certificate of security.

## 6. QKD versus post-quantum cryptography

For most organisations PQC is the practical first step: it needs no quantum hardware and runs on existing networks.
QKD needs a quantum channel, specialised hardware and an authenticated classical channel. QuantVault flags a QKD candidate
only for fixed, dedicated point-to-point fibre links with long-lived data, and recommends evaluating it *after* PQC, as a supplement.

Priority order: (1) inventory and migrate to standardised PQC; (2) find long-lived-confidentiality systems and assess exposure;
(3) consider QKD for specific high-value links.

## 7. Reproducing everything

```bash
python -m src.main               # risk table, two QKD runs, experiments, dashboard
python -m src.main risk --horizon 10
python -m src.main qkd --qubits 4096 --eve
python -m src.main dashboard --quick
pytest -q
```

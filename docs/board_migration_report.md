# QuantVault: Executive Cryptographic Migration Plan
**Target Audience:** Board of Directors, Chief Information Security Officer (CISO), Audit & Risk Committee  
**Enterprise:** Hypothetical Regional Hospital  
**Date of Assessment:** October 30, 2026  
**Framework Version:** QuantVault v2.0 (VTU Qiskit Fall Fest 2026, Track 1: Quantum Cryptography)  

---

## 1. Executive Summary

Current asymmetric public-key cryptography—including RSA, Elliptic Curve Diffie-Hellman (ECDH), and ECDSA—relies on mathematical problems (integer factorisation and discrete logarithms) that are polynomial-time solvable by Shor's algorithm on a Cryptographically Relevant Quantum Computer (CRQC).

Hostile adversaries are actively executing **Harvest Now, Decrypt Later (HNDL)** campaigns: intercepting and archiving encrypted enterprise communications today to decrypt retroactively once scalable quantum computers arrive. For long-lived clinical data, genomic records, and public-key infrastructure, **migration cannot wait until a quantum computer exists**.

### Core Findings for Hypothetical Regional Hospital
- **Total Cryptographic Assets Inventoried:** 13
- **Quantum-Vulnerable Assets:** 11 (84.6%)
- **Active Mosca Violations ($X + Y > Z$):** 5 systems have already passed their safe migration window under a 15-year horizon.
- **Urgent Review (Critical / High Tiers):** 8 assets require immediate capital budget and migration initiation.
- **Cryptographic Inventory Completeness:** 90.0% (2 unknown configurations identified).

---

## 2. Threat Timeline & Grounded Assumptions

### The Mosca Migration Inequality
An asset is in breach of Mosca's inequality when:
$$X + Y > Z$$
- **$X$ (Confidentiality / Integrity Lifetime):** The duration data must remain secure (e.g. 30 years for clinical trials, pediatric EHR, and oncology records).
- **$Y$ (Migration Time):** The time required to validate, stage, and deploy post-quantum algorithms across systems and protocols (typically 3–5 years).
- **$Z$ (Quantum Threat Horizon):** The estimated years until a quantum computer capable of breaking 2048-bit RSA and 256-bit ECC becomes operational.

### Expert Probability Model (GRI Survey)
Rather than relying on a speculative single date, QuantVault incorporates the continuous expert consensus from the **Global Risk Institute (GRI) Quantum Threat Report**, modeled as a Weibull distribution:
$$Z \sim \text{Weibull}(k=2.5, \lambda=16.5)$$
- **Cumulative Probability of CRQC Arrival:**
  - In 10 years: $P(Z \le 10) \approx 22.1\%$
  - In 15 years: $P(Z \le 15) \approx 54.3\%$ (Central Planning Case)
  - In 20 years: $P(Z \le 20) \approx 80.2\%$
  - In 30 years: $P(Z \le 30) \approx 98.4\%$

### Quantum Computational Scaling
Based on current quantum algorithmic resource estimations (Gidney & Ekerå 2021; Häner et al. 2020):
- **Breaking RSA-2048:** Requires approximately **20 million physical qubits** (~4,098 logical qubits using surface codes at $10^{-3}$ physical error rates) running for ~8 hours.
- **Breaking ECC-256:** Requires approximately **2,330 logical qubits** and $1.26 \times 10^8$ Toffoli gates.

---

## 3. Prioritised Asset Inventory & Mosca Analysis

Assets are prioritised based on the comprehensive migration risk formula:
$$R = 100 \times (0.35 C + 0.25 Q + 0.20 E + 0.20 M)$$
Where $C$ = Confidentiality/Sensitivity, $Q$ = Quantum Exposure, $E$ = Network Exposure, and $M$ = Migration Difficulty.

| Rank | Asset ID | Asset Description | Cryptographic Suite (KE / Sig / Sym) | Lifetime ($X$) | Migration ($Y$) | Mosca Status ($Z=15$) | $P(\text{Violation})$ | Risk Score ($R$) | Priority Tier |
| :---: | :---: | :--- | :--- | :---: | :---: | :--- | :---: | :---: | :---: |
| 1 | **A01** | Electronic health records (EHR) | `ECDHE / ECDSA / AES-256` | 25.0 yr | 5.0 yr | **VIOLATED** (by 15.0 yr) | 99.2% | **80.4** | **Critical** |
| 2 | **A09** | Infusion-pump firmware signing | `- / RSA-SIG / -` | 15.0 yr | 6.0 yr | **VIOLATED** (by 6.0 yr) | 87.0% | **72.6** | **High** |
| 3 | **A06** | Legacy radiology archive (PACS) | `UNKNOWN / UNKNOWN / UNKNOWN` | 30.0 yr | 6.0 yr | INDETERMINATE | 99.9% | **72.0** | **High** |
| 4 | **A05** | Medical-device management network | `RSA-KT / RSA-SIG / 3DES` | 15.0 yr | 8.0 yr | **VIOLATED** (by 8.0 yr) | 92.2% | **68.8** | **High** |
| 5 | **A10** | Secure e-mail gateway (S/MIME) | `RSA-KT / RSA-SIG / AES-128` | 7.0 yr | 3.0 yr | OK (slack 5.0 yr) | 27.8% | **66.1** | **High** |
| 6 | **A03** | Internal research archive | `RSA-WRAP / RSA-SIG / AES-256` | 20.0 yr | 4.0 yr | **VIOLATED** (by 9.0 yr) | 93.7% | **65.7** | **High** |
| 7 | **A08** | Pathology data-centre interlink | `ECDHE / ECDSA / AES-256` | 25.0 yr | 4.0 yr | **VIOLATED** (by 14.0 yr) | 98.6% | **65.4** | **High** |
| 8 | **A11** | Billing & payments API | `ECDHE / ECDSA / AES-256` | 10.0 yr | 2.0 yr | OK (slack 3.0 yr) | 39.7% | **65.0** | **High** |
| 9 | **A07** | Staff remote-access VPN | `DHE / RSA-SIG / AES-256` | 5.0 yr | 3.0 yr | OK (slack 7.0 yr) | 17.4% | **61.9** | **Medium** |
| 10 | **A12** | HR system (vendor SaaS) | `UNKNOWN / ECDSA / AES-256` | 7.0 yr | 2.0 yr | INDETERMINATE | 21.6% | **52.1** | **Medium** |
| 11 | **A04** | Public information website | `ECDHE / RSA-SIG / AES-128` | 0.0 yr | 1.0 yr | N/A | 0.0% | **45.5** | **Low** |
| 12 | **A13** | Secrets vault (PQC pilot) | `ML-KEM / ML-DSA / AES-256` | 20.0 yr | 1.0 yr | N/A | 0.0% | **40.3** | **Low** |
| 13 | **A02** | Patient appointment portal | `HYBRID-KEM / ECDSA / AES-256` | 3.0 yr | 1.0 yr | N/A | 0.0% | **37.8** | **Low** |

---

## 4. Defensibility & Sensitivity Verification

A primary concern for board and audit committees is whether risk prioritisation is fragile or dependent on subjective weightings. QuantVault addresses this via a **1,000-trial Monte Carlo Sensitivity Benchmark**:
- Each weight ($w_C, w_Q, w_E, w_M$) is simultaneously perturbed by $\pm 30\%$.
- **Mean Kendall $\tau$ Rank Correlation:** **0.8898** (95% CI: [0.7949, 0.9744]).
- **Top-5 High-Priority Retention:** **86.6%** stability.
- **Auditor Conclusion:** The risk ranking is mathematically robust against weight uncertainty. Critical systems remain Critical across all variations.

---

## 5. Ten-Year Strategic Migration Roadmap (2026–2035)

### Phase 1: Discover
**Objective:** 2 asset(s) have unidentified cryptography; inventory them before deciding.

- **[A06] Legacy radiology archive (PACS)** (High): Identify protocol, key establishment, signature and symmetric algorithms
- **[A12] HR system (vendor SaaS)** (Medium): Identify protocol, key establishment, signature and symmetric algorithms

### Phase 2: Prioritise
**Objective:** Under Z = 15 years, 8 asset(s) are Critical or High.

- **[A01] Electronic health records (EHR)** (Critical): Rank 1: R = 80.4, Mosca violated
- **[A09] Infusion-pump firmware signing** (High): Rank 2: R = 72.6, Mosca violated
- **[A06] Legacy radiology archive (PACS)** (High): Rank 3: R = 72.0, Mosca indeterminate
- **[A05] Medical-device management network** (High): Rank 4: R = 68.8, Mosca violated
- **[A10] Secure e-mail gateway (S/MIME)** (High): Rank 5: R = 66.1, Mosca ok
- **[A03] Internal research archive** (High): Rank 6: R = 65.7, Mosca violated
- **[A08] Pathology data-centre interlink** (High): Rank 7: R = 65.4, Mosca violated
- **[A11] Billing & payments API** (High): Rank 8: R = 65.0, Mosca ok

### Phase 3: Test
**Objective:** Trial standardised and hybrid post-quantum key establishment away from production.

- **[A01] Electronic health records (EHR)** (Critical): Stage hybrid ECDHE + ML-KEM; measure handshake size, latency, interoperability
- **[A05] Medical-device management network** (High): Stage hybrid ECDHE + ML-KEM; measure handshake size, latency, interoperability
- **[A10] Secure e-mail gateway (S/MIME)** (High): Stage hybrid ECDHE + ML-KEM; measure handshake size, latency, interoperability
- **[A03] Internal research archive** (High): Stage hybrid ECDHE + ML-KEM; measure handshake size, latency, interoperability
- **[A08] Pathology data-centre interlink** (High): Stage hybrid ECDHE + ML-KEM; measure handshake size, latency, interoperability
- **[A11] Billing & payments API** (High): Stage hybrid ECDHE + ML-KEM; measure handshake size, latency, interoperability
- **[A07] Staff remote-access VPN** (Medium): Stage hybrid ECDHE + ML-KEM; measure handshake size, latency, interoperability

### Phase 4: Migrate
**Objective:** Move the highest-priority assets first; keep crypto-agility so algorithms can change again.

- **[A01] Electronic health records (EHR)** (Critical): Already inside the Mosca window by 15 years: start now, add compensating controls
- **[A09] Infusion-pump firmware signing** (High): Already inside the Mosca window by 6 years: start now, add compensating controls
- **[A06] Legacy radiology archive (PACS)** (High): Mosca slack of -21 years before migration must start; sooner is safer
- **[A05] Medical-device management network** (High): Already inside the Mosca window by 8 years: start now, add compensating controls
- **[A10] Secure e-mail gateway (S/MIME)** (High): Mosca slack of 5 years before migration must start; sooner is safer
- **[A03] Internal research archive** (High): Already inside the Mosca window by 9 years: start now, add compensating controls
- **[A08] Pathology data-centre interlink** (High): Already inside the Mosca window by 14 years: start now, add compensating controls
- **[A11] Billing & payments API** (High): Mosca slack of 3 years before migration must start; sooner is safer
- **[A08] Pathology data-centre interlink** (High): Evaluate QKD for this fixed link after PQC (supplement, not replacement)

### Phase 5: Verify
**Objective:** Re-assess regularly, because the threat horizon and the inventory both change.

- **[A13] Secrets vault (PQC pilot)** (Low): Confirm PQ/hybrid parameters are negotiated in production
- **[A02] Patient appointment portal** (Low): Confirm PQ/hybrid parameters are negotiated in production
- Re-run the inventory and risk assessment at least annually or after major changes
- Track exceptions and vendor roadmaps; update the assumed threat horizon


---

## 6. Capital Allocation: Post-Quantum Cryptography (PQC) vs. QKD

A critical governance pitfall is treating Quantum Key Distribution (QKD) as a substitute for Post-Quantum Cryptography (PQC). QuantVault enforces the industry consensus: **QKD supplements PQC; it does not replace it.**

| Dimension | Post-Quantum Cryptography (PQC) | Quantum Key Distribution (QKD) |
| :--- | :--- | :--- |
| **Primary Standard** | NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA) | ITU-T Y.3800, ETSI GS QKD 001-016 |
| **Infrastructure** | Standard software update on existing networks | Dedicated dark optical fiber + cryogenic single-photon detectors |
| **Range Limit** | Global / Internet scale | Direct fiber limited to **~203 km**; long-haul requires trusted relays |
| **Authentication** | Built-in asymmetric digital signatures | Requires pre-shared classical symmetric keys |
| **Capital Cost** | Low (software upgrade, firmware patch) | High ($50,000–$150,000 per optical node) |
| **QuantVault Policy** | **Universal Baseline:** Deploy hybrid X25519 + ML-KEM-768 across all endpoints | **Targeted Supplement:** Deploy only on high-value fixed metro fiber links (e.g. PACS-01) |

---

## 7. Board Action Items & Immediate Approvals

The Executive Committee is requested to approve the following quarterly milestones:

1. **FY26 Q4 Approval:** Authorize **$350,000 initial discovery & staging budget** to formalize machine-readable Cryptographic Bills of Materials (CBOM) across all tier-one clinical systems.
2. **Policy Ratification:** Enact enterprise standard requiring all new procurement to comply with **NIST FIPS 203 / NSA CNSA 2.0** post-quantum readiness guidelines.
3. **Pilot Authorization:** Deploy hybrid X25519 + ML-KEM-768 key encapsulation across the primary Telehealth gateway and PACS archive staging environment.
4. **Audit Cycle:** Mandate annual re-assessment using QuantVault with updated threat horizon parameters.

---
*Report generated autonomously by QuantVault Migration Engine.*

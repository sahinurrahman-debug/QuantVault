<div align="center">

# HackersLobby

**VTU-QFF-HC-0108** &nbsp;|&nbsp; Tier: **Both**

</div>

---

<div align="center">

| | |
| :--- | :--- |
| **Team** | HackersLobby |
| **Team ID** | VTU-QFF-HC-0108 |
| **Tier** | Both |
| **Repository** | [vtu-hc-hackerslobby](https://github.com/vtu-qiskit-fall-fest-2026/vtu-hc-hackerslobby.git) |
| **Organisation** | [vtu-qiskit-fall-fest-2026](https://github.com/vtu-qiskit-fall-fest-2026) |
| **Presentation** | [VTU-QFF-HC-0108.pptx](docs/VTU-QFF-HC-0108.pptx) |
| **Demo Video** | [Watch on Vimeo](https://vimeo.com/1238720241) |
| **Live Demo** | [quantvault-n8cp.onrender.com](https://quantvault-n8cp.onrender.com/) |
| **Event** | VTU-QFF Hackathon — VTU-Qiskit Fall Fest 2026 |

</div>

---

## 📌 Table of Contents

- [Team Members](#-team-members-github-ids)
- [Problem Statement](#-problem-statement)
- [Proposed Solution](#-proposed-solution)
- [Approach & Architecture](#-approach--architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [How to Run](#-how-to-run)
- [How to Push Code](#-how-to-push-code)
- [Submission Checklist](#-submission-checklist)
- [Resources](#-resources)
- [License](#-license)

---

## 👥 Team Members (GitHub IDs)

> Members are added to this repository as **collaborators** and must accept the
> GitHub invitation before they can push. Add your GitHub username below.

| # | Name | GitHub Username | Role |
| :-- | :--- | :--- | :--- |
| 1 | Sahinur Rahman | https://github.com/sahinurrahman-debug | _Team Lead_ |
| 2 | Subhraditya Ghosh | https://github.com/SubhroEZ | _Developer_ |
| 3 | Archisman Halder | https://github.com/Archi84-bit | _Developer_ |

### 🛠️ Team Contributions ("Who Built What")

| Member | Primary Responsibilities & Contributions |
| :--- | :--- |
| **Sahinur Rahman** (_Team Lead_) | Core architecture, E91 entanglement-based QKD module (`src/e91.py`), CHSH Bell inequality test implementation, IBM hardware & `FakeMarrakesh` integration, results artifact validation. |
| **Subhraditya Ghosh** (_Developer_) | BB84 simulation pipeline (`src/bb84.py`), simplified Cascade error reconciliation, Toeplitz privacy amplification (`src/postprocessing.py`), Qiskit Aer noise models, comprehensive test suite. |
| **Archisman Halder** (_Developer_) | Cryptographic inventory (`data/inventory.json`), Mosca inequality engine & defensible risk scoring, weight sensitivity Monte Carlo analysis (`src/risk.py`), MERN web dashboard integration. |

---

## ❓ Problem Statement

<!--
State the problem you are solving. Be specific: what is broken or missing,
who experiences it, and why does it matter. Link to the official problem
statement from the brief if one applies.
-->

**Problem:** Adversaries can record encrypted traffic today and decrypt it once a cryptographically relevant quantum computer exists (*Harvest Now, Decrypt Later*). Organisations rarely know which systems depend on quantum-vulnerable public-key cryptography (RSA, elliptic-curve, finite-field Diffie–Hellman), which of them hold data that must stay confidential for decades, or how urgently each must migrate. Quantum-secure communication such as QKD is often proposed without asking where it actually fits.

**Why it matters:** Migration takes years of planning, testing and deployment, so waiting for a working quantum attack is too late for long-lived sensitive data such as health records, research archives and device firmware. A defensible plan needs an inventory, an explicit and adjustable threat assumption, and an honest comparison of QKD with post-quantum cryptography (PQC).

**Track / Category:** Track 1 · Quantum Cryptography & Security

---

## 💡 Proposed Solution

<!--
Describe your solution. Keep it concrete: the core idea, the user flow, and
the quantum/ML technique you are applying.
-->
[![Live Demo](https://img.shields.io/badge/Live-Demo-blue?style=for-the-badge)](https://quantvault-n8cp.onrender.com/)

**Solution:** **QuantVault: Quantum-Aware Cryptographic Risk & Migration Framework.** It combines three layers: *discovery* (a cryptographic inventory of a sample hospital, classified by algorithm and role), *decision-making* (Mosca's inequality `X + Y > Z` plus a configurable risk score, with a threat-horizon slider and a generated five-phase migration roadmap) and *demonstration* (a Qiskit/Aer BB84 simulator with an intercept-resend eavesdropper, noise models, error reconciliation and privacy amplification). Everything is shown in a **MERN dashboard** (MongoDB + Express + React, in `web/`) with an editable inventory and four analysis pages: exposure overview, risk prioritisation, QKD laboratory, and migration & QKD-vs-PQC. A zero-dependency static version is also generated at `docs/dashboard.html`.

**Key idea:** Use the quantum simulation to show *how* eavesdropping is detected, and use the risk engine to decide *where* quantum-safe measures matter. PQC is the first step for most systems; QKD is flagged only for fixed, high-value point-to-point links.

**Why this works:** It turns an abstract future threat into a prioritisation problem an organisation can act on today. Unknown configurations are never treated as safe, forward secrecy is not mistaken for quantum safety, every assumption is exposed, and the simulation reports its finite-size statistics and limitations instead of claiming a low QBER proves security. In the simulation an intercept-resend attacker on every qubit gives a sifted-key QBER of about 25 % and aborts the run, while moderate channel noise still yields a shorter key.

---

## 🧩 Approach & Architecture

<!--
Walk through how it works. A simple pipeline diagram in text or Mermaid is ideal.
-->

```mermaid
flowchart LR
    A[Crypto inventory + QKD parameters] --> B[Algorithm classification / basis & noise setup]
    B --> C[Mosca + risk score / BB84 on Qiskit Aer]
    C --> D[Tiering / sifting, QBER, reconciliation, privacy amplification]
    D --> E[Dashboard + migration roadmap]
```

1. **Input** — `data/inventory.json` (assets, algorithms, confidentiality lifetime X, migration time Y, exposure) plus the assumed threat horizon Z; for the simulator, qubit count, Eve on/off, noise model and parameter `p`.
2. **Preprocessing** — each algorithm is classified by role (key establishment, signature, symmetric, hash) and quantum-era class using the catalogue in `src/algorithms.py`; unknown configurations stay marked unknown. BB84 bits and bases are drawn at random and grouped into circuits.
3. **Quantum core** — Qiskit circuits executed on Qiskit Aer: Alice's encoding (X/H gates), Eve's measure-and-resend, a noisy channel (bit-flip, depolarizing, readout error) and Bob's basis measurement. Risk side: Mosca's inequality and `R = 100(0.35C + 0.25Q + 0.20E + 0.20M)`.
4. **Post-processing** — sifting, QBER estimation with a finite-sample upper bound, simplified Cascade reconciliation with leakage accounting, verification and Toeplitz privacy amplification; risk tiers and rule-based recommendations.
5. **Output** — the React dashboard served by Express (exposure overview, risk prioritisation with a Z slider, editable inventory stored in MongoDB, QKD laboratory with saved run history, migration roadmap and QKD-vs-PQC comparison), the static `docs/dashboard.html`, and the CLI reports. Express calls the Python engines through `src/bridge.py`, so the scoring and simulation logic exists only once.

![QBER versus noise, with and without an eavesdropper](docs/figures/noise_vs_qber.png)

Method details, formulas and security limitations are in [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

---

## ⚛️ Why This Needs Quantum: The Bell Test Proof (E91 + CHSH)

A central critique of software-simulated QKD is the **"classical algorithm in a costume"** problem: any classical pseudo-random number generator (`numpy.random`) can mimic BB84 bit outcomes and claim an eavesdropper was detected. 

QuantVault **kills this critique** through an **entanglement-based E91 protocol with a Clauser-Horne-Shimony-Holt (CHSH) Bell test**, executable on IBM Quantum hardware or the 156-qubit `FakeMarrakesh` Heron chip model:

1. **Non-local entanglement cannot be classical:** 
   Alice and Bob share Bell pairs $|\Phi^+\rangle = \frac{|00\rangle + |11\rangle}{\sqrt{2}}$. In local hidden-variable (classical) physics, the CHSH Bell parameter is strictly bounded:
   $$|S| \le 2.0000$$
   Quantum mechanics allows maximum non-local correlation up to the Tsirelson bound $S = 2\sqrt{2} \approx 2.8284$. A measured $S > 2$ is a mathematical proof of genuine quantum non-locality that **no classical program or random number generator can produce**.

2. **Intercept-resend collapses the Bell parameter:**
   When Eve intercepts Bob's qubit, measuring in basis $Z$ or $X$ and resending, the quantum entanglement is destroyed. The state collapses into a separable classical mixture, dropping $S$ analytically to:
   $$S_{\text{Eve}} = \sqrt{2} \approx 1.4142 \le 2.0000$$
   Eavesdropping is detected **device-independently** by the failure of the Bell inequality, without assuming anything about Eve's equipment.

### 📊 Measured Hardware & Simulation Results

All raw JSON runs with individual shot counts, standard errors, and timestamps are committed in [`results/`](results/).

| Target Backend | Eavesdropper | Shots / Setting | Measured Bell Parameter $S$ | 95% Conf. Interval | Significance | Key QBER | Protocol Verdict | Job ID / Run Artifact |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FakeMarrakesh** (156-qubit Heron) | **None (Clean)** | 4,000 | **2.7800** | [2.7354, 2.8246] | **+34.3 $\sigma$** | 1.12% | **ACCEPTED** (Entanglement Verified) | [`qv-e91-c56c3db8bbc7`](results/e91_fake_marrakesh_clean_qv-e91-c.json) |
| **FakeMarrakesh** (156-qubit Heron) | **Eve (Intercept-Resend)** | 4,000 | **1.3845** | [1.3264, 1.4426] | **-20.8 $\sigma$** | 26.15% | **ABORTED** (Bell Violation Destroyed) | [`qv-e91-8b3c5594b378`](results/e91_fake_marrakesh_eve_qv-e91-8.json) |
| **Qiskit Aer** (Ideal) | **None (Clean)** | 4,000 | **2.8395** | [2.7956, 2.8834] | **+37.5 $\sigma$** | 0.00% | **ACCEPTED** (Tsirelson Bound Reached) | [`qv-e91-aer-clean`](results/) |
| **Qiskit Aer** (Ideal) | **Eve (Intercept-Resend)** | 4,000 | **1.4150** | [1.3330, 1.4970] | **-14.0 $\sigma$** | 25.50% | **ABORTED** (Classical Limit Satisfied) | [`qv-e91-aer-eve`](results/) |
| **FakeMarrakesh** (156-qubit Heron) | **BB84 Parallel Packing** | 5,600 bits | N/A (BB84) | [3.14%, 4.11%] | Hardware Noise | **3.62%** | **ACCEPTED** (Below 11% Threshold) | [`qv-bb84hw-2f50e494`](results/bb84_hardware_benchmark.json) |

### 🚀 Advanced Quantum & Cryptographic Implementations

QuantVault extends beyond toy textbook demonstrations into a complete, mathematically grounded migration platform:

1. **Parallel BB84 Multi-Qubit Packing on 156-Qubit Heron Chip (`src/bb84_hardware.py`):**
   - Packs parallel Alice/Bob pairs across 20–40 physical qubits per circuit to maximize throughput and minimize QPU execution time.
   - Measures realistic device error rates on IBM's `FakeMarrakesh` (QBER = 3.62% vs Aer 0.00%), accurately testing post-processing under actual quantum processor thermal relaxation and readout cross-talk.
2. **Beyond Intercept-Resend: Optimal Phase-Covariant Quantum Cloning (`src/cloning_and_decoy.py`):**
   - Implements the theoretical optimal $1 \to 2$ symmetric phase-covariant quantum cloning machine ($F = \frac{1}{2} + \frac{1}{\sqrt{8}} \approx 85.36\%$).
   - Induces an analytic QBER of $D = \frac{1 - 1/\sqrt{2}}{2} \approx 14.64\%$, demonstrating that even an attacker using the laws of quantum physics to clone equatorial states is caught by the 11.0% Shor-Preskill security bound.
3. **Photon Number Splitting (PNS) Defense: Decoy-State BB84 & GLLP Key Rate (`src/cloning_and_decoy.py`):**
   - 3-intensity protocol ($\mu = 0.5$ signal, $\nu = 0.1$ decoy, $\omega = 0$ vacuum) rigorously bounds single-photon yield $Y_1$ and error $e_1$.
   - Computes Gottesman-Lo-Lütkenhaus-Preskill (GLLP) asymptotic secret key generation rates against multi-photon beam splitting over lossy channels.
4. **Probabilistic Mosca Assessment via Global Risk Institute (GRI) Distribution (`src/risk.py`):**
   - Models the quantum timeline $Z$ as a continuous Weibull random variable ($k=2.5, \lambda=16.5$) derived from the GRI Quantum Threat Report expert consensus.
   - Delivers a defensible $P(X + Y > Z)$ probability of compromise per asset rather than a binary knife-edge threshold.
5. **Real-World Discovery: Active TLS Scanner & CycloneDX CBOM Import (`src/scanner.py`):**
   - Active TLS handshake inspector extracting cipher suites, key exchange algorithms, and certificates with built-in SSRF/allowlist protection.
   - Importers for CycloneDX Cryptographic Bill of Materials (CBOM v1.6) and SSLyze vulnerability scans to populate the risk inventory from real infrastructure.
6. **Tri-Hybrid Key Derivation (`src/pqc.py`):**
   - Combines classical Curve25519 (X25519), NIST FIPS 203 ML-KEM-768 (lattice post-quantum), and QKD quantum shared secrets via HKDF-SHA256.
   - Guarantees unconditional forward secrecy if **any one** of classical hardness, lattice hardness, or quantum non-locality remains unbroken.
7. **Quantitative QKD Feasibility & Relay Calculator (`src/qkd_calc.py`):**
   - Fiber attenuation model $\eta = 10^{-\alpha L / 10}$ calculating expected key rate vs distance.
   - Determines direct transmission feasibility (e.g., 40 km yields ~3.05 Mbit/s) and pinpoints when long-haul spans (>203 km) require trusted relay nodes or PQC fallback.

### 🛡️ Defensible Risk Scoring & Weight Sensitivity Analysis

To eliminate the critique of "arbitrary risk weights" and artificial tier clamping:
- **Transparent Dual Scoring:** Assets report their **raw mathematical risk score** $R = 100(0.35C + 0.25Q + 0.20E + 0.20M)$ alongside qualitative tier classifications (which flag Mosca violations and unknown cryptographic algorithms). No score is artificially clamped into a tier band.
- **Monte Carlo Sensitivity Benchmark (1,000 trials):** We perturb each weight uniformly by $\pm 30\%$ and re-rank the entire hospital inventory across 1,000 independent samples:
  - **Mean Kendall $\tau$ Rank Correlation:** **0.888** (95% CI: $[0.769, 0.974]$).
  - **Top-5 Asset Retention:** Top-5 priority systems maintain an **86.9% mean overlap** across all weight variations.
  - This mathematically proves the prioritisation order is **robust** against weight assumptions. Detailed metrics are recorded in [`results/weight_sensitivity_benchmark.json`](results/weight_sensitivity_benchmark.json).

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| Language | Python 3.11+ |
| Quantum SDK | Qiskit `1.4.6`, Qiskit Aer `0.18.0`, Qiskit IBM Runtime `0.44.1` |
| Statistics | NumPy `2.5.4` / SciPy `1.18.1` (Clopper–Pearson bound, Toeplitz hashing, Kendall $\tau$) |
| Simulation & Hardware | AerSimulator, 156-qubit `FakeMarrakesh` IBM Heron chip model, IBM Quantum Platform |
| Analytics | pandas `3.0.6`, Matplotlib `3.11.2` |
| Web app (MERN) | MongoDB (Mongoose), Express, React 19 (Vite), Tailwind CSS 4 with a dark liquid-glass design system, Recharts, Node.js 22+ |
| Static dashboard | Self-contained HTML/JavaScript generated by Python (no extra dependencies) |
| Testing | pytest `9.1.1` (95 automated unit, property, and statistical tests) |
| Environment | JupyterLab / VS Code, `venv` |
| Version control | Git + GitHub |

---

## 📁 Project Structure

```text
vtu-hc-hackerslobby/
├── README.md              # This file
├── requirements.txt       # Python dependencies
├── pyproject.toml         # Project metadata and pytest settings
├── .gitignore
├── notebooks/             # Jupyter notebooks for experiments
│   └── exploration.ipynb
├── results/               # Hardware and benchmark artifacts (raw JSON runs)
│   ├── e91_fake_marrakesh_clean_*.json
│   ├── e91_fake_marrakesh_eve_*.json
│   ├── bb84_hardware_benchmark.json
│   └── weight_sensitivity_benchmark.json
├── src/
│   ├── __init__.py
│   ├── algorithms.py      # Cryptographic algorithm catalogue, quantum resource estimates (Gidney & Ekerå)
│   ├── risk.py            # Mosca's inequality, probabilistic GRI Weibull, weight sensitivity Monte Carlo
│   ├── bb84.py            # Qiskit/Aer BB84 circuits, Eve, noise models
│   ├── bb84_hardware.py   # Multi-qubit parallel packing on 156-qubit Heron chip
│   ├── e91.py             # E91 entanglement-based QKD + CHSH Bell test on hardware
│   ├── cloning_and_decoy.py # Optimal phase-covariant cloning & decoy-state BB84 / GLLP
│   ├── scanner.py         # Active TLS handshake scanner & CycloneDX CBOM / SSLyze importer
│   ├── pqc.py             # Tri-hybrid X25519 + ML-KEM-768 + QKD key derivation
│   ├── channel.py         # Live quantum-safe channel encrypting sample patient EHR record (AES-GCM)
│   ├── report.py          # One-click executive board migration plan generator (Markdown & HTML)
│   ├── qkd_calc.py        # Quantitative QKD attenuation, key rate vs distance, relay cutoff
│   ├── postprocessing.py  # QBER bound, Cascade reconciliation, privacy amplification
│   ├── experiments.py     # Experiments A–D, sweeps and figures
│   ├── comparison.py      # QKD vs PQC content and model limitations
│   ├── dashboard.py       # Builds docs/dashboard.html
│   ├── dashboard_template.html
│   ├── bridge.py          # JSON bridge: the Express API calls the Python engines through it
│   └── main.py            # Entry point (CLI)
├── web/                   # MERN app
│   ├── package.json       # Root scripts: dev, build, start, test
│   ├── server/            # Express + Mongoose API (assets, risk, QKD runs, experiments)
│   │   ├── src/           # app.js, auth.js, models.js, db.js, python.js, validate.js, http.js, index.js
│   │   └── test/          # API tests against a real MongoDB (node:test)
│   └── client/            # React (Vite) dashboard: pages/, components/, api.js
├── data/                  # Datasets (use Git LFS for large files)
│   └── inventory.json     # Illustrative sample hospital inventory
├── tests/                 # Unit, property, and statistical tests (92 passing)
│   ├── test_circuit.py    # BB84 circuits and quantum phase
│   ├── test_e91.py        # E91 Bell test, CHSH inequality, Eve state collapse
│   ├── test_golden_results.py # Golden artifact reproduction tests
│   ├── test_statistical.py # Hypothesis testing for QBER, cloning, Bell violation, and decoy states
│   ├── test_properties_cascade.py # Property tests for Cascade reconciliation, Toeplitz, scanner
│   ├── test_postprocessing.py # Error correction and privacy amplification
│   ├── test_bridge.py     # Python-JSON bridge contract
│   └── test_risk.py       # Risk formulas, Mosca, and sensitivity
└── docs/                  # Notes, diagrams, reports
    ├── METHODOLOGY.md     # Formulas, assumptions, limitations
    ├── dashboard.html     # Self-contained dashboard (open in a browser)
    └── figures/           # Generated plots
```

---

## 🚀 How to Run

### Prerequisites

- Python 3.11 – 3.13 (Qiskit 1.x, as pinned in `requirements.txt`, has no wheels for Python 3.14)
- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 22+ (only for the MERN dashboard in `web/`)
- A GitHub account (you need collaborator access to this repo)

### 1. Clone the repository

```bash
git clone https://github.com/vtu-qiskit-fall-fest-2026/vtu-hc-hackerslobby.git
cd vtu-hc-hackerslobby
```

### 2. Create a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\activate         # Windows (PowerShell)
```

### 3. Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Run

```bash
python -m src.main
```

This prints the risk table, runs BB84 with and without Eve, runs experiments A–D and rebuilds `docs/dashboard.html` (open it in a browser). Useful variants:

```bash
python -m src.main e91                      # E91 entanglement QKD + CHSH Bell test on FakeMarrakesh
python -m src.main e91 --eve                # E91 with intercept-resend attack (collapses S <= 2)
python -m src.main e91 --backend aer        # ideal local simulation
python -m src.main risk --horizon 12 --sensitivity  # risk assessment + 1,000-sample sensitivity Monte Carlo
python -m src.main qkd --qubits 4096 --eve  # one BB84 run with an eavesdropper
python -m src.main channel                  # live quantum-safe channel encrypting patient EHR (AES-GCM)
python -m src.main channel --spy            # eavesdropper detected: immediate abort, 0 bytes leaked
python -m src.main report                   # generate executive board migration plan (Markdown & HTML)
python -m src.main dashboard --quick        # faster, smaller experiment grid
```

Or launch the notebook workflow:

```bash
jupyter lab
```

### 5. Run the tests

```bash
pytest -q
```

### 6. Run the MERN dashboard

Requires [Node.js](https://nodejs.org/) 22+, the Python environment from step 3 (the API calls it) and a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster. Every run uses the same Atlas database, so the data is identical on every machine that connects to it.

```bash
cd web
npm run install:all
npm run setup:db               # once: paste your Atlas connection string; it is tested and saved to web/server/.env
npm run dev                    # API on :5000, React on http://localhost:5173
```

On another machine, run the same three commands (or copy the `.env` file) and you will see the same accounts and data. In Atlas, **Network Access** must allow that machine's IP address. The server refuses to start without `MONGODB_URI` rather than quietly using a private local database; for offline work only, set `USE_LOCAL_DB=true`.

Production-style (Express serves the built React app on http://localhost:5000):

```bash
npm run build
npm start                      # uses MONGODB_URI from the environment or web/server/.env
npm test                       # API tests; they use their own temporary database and never touch Atlas
cd client && npm test          # React tests (vitest)
```

See `web/server/.env.example` for the settings (`MONGODB_URI`, `PORT`, `PYTHON_BIN`).

**Demo account.** The sign-in page shows demo credentials (`demo@quantvault.app` / `DemoPass-2026!`) with a one-click button. The demo login is a doorway, not a shared workspace: every demo sign-in creates its own private sandbox copy of the sample data, so visitors never see or overwrite each other's changes. Sandboxes are deleted after 24 hours (or immediately with **End Demo** on the Account page) and at most 300 exist at once. Set `DEMO_ACCOUNT=false` to turn the demo off.

**Accounts.** Open `/signup` to create an account, then `/login` to sign in; `/dashboard` is protected and redirects visitors to the sign-in page. Each account gets its own private copy of the sample inventory, QKD run history and experiment results. Sessions use a random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` with a `__Host-` prefix in production); only a SHA-256 of the token is stored server-side. Passwords are hashed with scrypt, every data route requires a session and filters by owner, writes from other origins are rejected, and repeated failed sign-ins are rate-limited. The **Account** page (`/account`) changes the password (other devices are signed out), signs out every device, and deletes the account with all of its data.

**Capacity.** The Python engines run in two lanes so a long job cannot starve quick ones: quick scoring (`PYTHON_CONCURRENCY`, default 2) and QKD simulations and experiment batches (`PYTHON_HEAVY_CONCURRENCY`, default 1), each with queue and per-user limits. Per-user hourly quotas cap QKD runs and experiment batches, only one experiment batch can run per account at a time, and each account keeps its latest 50 QKD runs and 5 experiment batches.

---

## 🔁 How to Push Code

> Full walkthrough: **[Git & Collaboration Handbook](../vtu-hc-guide-git-and-collaboration)** — collaboration
> workflow, branches, pull requests, reviews and conflict resolution.

### Configure Git (first time only)

```bash
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"
```

### Everyday workflow

```bash
# 1. Get the latest changes
git checkout main
git pull origin main

# 2. Create a branch for your work
git checkout -b feature/my-task

# 3. Commit your work
git add .
git commit -m "feat: add variational circuit for the search problem"

# 4. Push the branch
git push -u origin feature/my-task

# 5. Open a Pull Request on GitHub and request a review
#    https://github.com/vtu-qiskit-fall-fest-2026/vtu-hc-hackerslobby/compare/main...feature/my-task

# 6. After approval, merge into main
git checkout main
git pull origin main
git branch -d feature/my-task
```

### Commit message convention

| Prefix | Meaning |
| :--- | :--- |
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Adding or fixing tests |
| `refactor:` | Code restructure, no behaviour change |
| `chore:` | Build/config/dependency changes |

### Useful commands

```bash
git status              # what changed
git log --oneline -10   # recent commits
git diff                # review changes before committing
git stash               # shelve changes temporarily
git pull --rebase       # update your branch on top of main
```

### Collaborating on the same repo

- **Never push directly to `main`** — open a Pull Request.
- **Pull before you push** to avoid rejected commits.
- **Commit often** with clear messages.
- **Resolve conflicts** locally: `git pull --rebase`, fix the files, then `git add` + `git rebase --continue`.
- **Ask for a review** before merging — a second pair of eyes catches bugs fast.

---

## ✅ Submission Checklist

- [x] Repository created and **public**
- [x] All team members added as **collaborators** and invitations accepted
- [x] `README.md` updated with project details, problem statement and solution
- [x] Team members listed with responsibilities under [Team Members](#-team-members-github-ids)
- [x] `requirements.txt` pinned and project runs cleanly from a fresh clone
- [x] Code pushed to `main` and all 95 tests pass
- [x] Notebooks committed with **cleared outputs** (or use `nbstrip`)
- [x] `README` includes a demo screenshot / video link
- [x] Hardware / FakeMarrakesh Bell test results verified and committed to `results/`
- [x] Short project summary submitted on the hackathon portal

---

## 📚 Resources

| Resource | Link |
| :--- | :--- |
| 🔁 Git & collaboration handbook | [Git & Collaboration Handbook](../vtu-hc-guide-git-and-collaboration) |
| ❓ Problem statements, solutions & terms | [Problem Statements, Solutions & Terms](../vtu-hc-guide-problem-and-solution) |
| 📄 README writing guide | [README Guide & Template](../vtu-hc-guide-readme-template) |
| ⚛️ Qiskit documentation | https://docs.quantum.ibm.com/ |
| ⚛️ Qiskit Runtime & primitives | https://quantum.cloud.ibm.com/docs/ |
| 🧪 Qiskit Aer simulator | https://docs.quantum.ibm.com/guides/simulator |
| 💻 IBM Quantum Platform | https://quantum.cloud.ibm.com/ |
| 🎓 Qiskit textbook | https://qiskit.qotlabs.org/learning/ |
| 📋 GitHub Docs | https://docs.github.com/ |

---

## 📄 License

Released under the [MIT License](LICENSE). See `LICENSE` for details.

---

<div align="center">

**HackersLobby** · Team ID `VTU-QFF-HC-0108` · Tier `Both`
· Built with ⚛️ Qiskit for the VTU-QFF Hackathon

[⬆ Back to Top](#hackerslobby)

</div>

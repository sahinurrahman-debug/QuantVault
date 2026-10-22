"""Quantum-aware cryptographic risk assessment.

Two complementary views are produced for every asset:

1. **Mosca's inequality** ``X + Y > Z`` - a *prioritisation heuristic*, not a
   probability of compromise.

   * X: years the data must stay confidential (or, for signatures, years the
     signature must remain trustworthy)
   * Y: years needed to migrate
   * Z: assumed years until a cryptographically relevant quantum computer
     (a user-controlled assumption; nobody knows the true value)

2. **Risk score** ``R = 100 (wC*C + wQ*Q + wE*E + wM*M)`` with every component
   normalised to [0, 1] and the weights configurable.

   * C: confidentiality lifetime and sensitivity
   * Q: exposure of the cryptographic mechanisms to quantum attack
   * E: exposure to external networks / adversaries
   * M: migration difficulty and operational urgency

   ``R`` is a *migration priority*. A separate ``security_exposure`` score
   (C, Q, E only) answers "how exposed is this asset?" without letting
   migration difficulty make a system look more or less secure.

Unknown configurations are never treated as safe.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .algorithms import (
    HASH, KEY_ESTABLISHMENT, SIGNATURE, SYMMETRIC, QCLASS_LABELS, lookup,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SENSITIVITY = {"public": 0.0, "internal": 0.4, "confidential": 0.7, "restricted": 1.0}
EXPOSURE = {"internet": 1.0, "partner": 0.7, "internal": 0.4, "isolated": 0.15}
DIFFICULTY = {"low": 0.2, "medium": 0.5, "high": 0.8, "very_high": 1.0}

TIERS = ("Low", "Medium", "High", "Critical")
THREAT_SCENARIOS = {"Aggressive": 10, "Central": 15, "Moderate": 20, "Conservative": 30}


@dataclass
class RiskConfig:
    """All assumptions in one place so they can be shown and changed."""

    threat_horizon_years: float = 15.0  # Z
    weights: dict = field(default_factory=lambda: {"C": 0.35, "Q": 0.25, "E": 0.20, "M": 0.20})
    x_max_years: float = 30.0  # lifetime at which C's lifetime term saturates
    y_max_years: float = 10.0  # migration time at which M's duration term saturates
    tier_critical: float = 75.0
    tier_high: float = 62.0
    tier_medium: float = 40.0
    low_q_cap: float = 0.30  # below this (and nothing unknown) an asset is capped at Low

    def __post_init__(self) -> None:
        total = sum(self.weights.values())
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"weights must sum to 1, got {total}")


def load_inventory(path: str | Path | None = None) -> dict:
    path = Path(path) if path else DATA_DIR / "inventory.json"
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _mechanism(asset: dict, role: str) -> dict:
    """Look up one role; ``None`` means the role does not apply to the asset."""
    value = asset.get(role)
    if value is None:
        return {"id": "-", "role": role, "family": "Not used", "qclass": "none", "q": 0.0,
                "note": "Role not applicable to this asset.", "applicable": False}
    return {**lookup(value, role), "applicable": True}


def _is_vulnerable_or_unknown(mech: dict) -> str | None:
    if mech["qclass"] == "shor_vulnerable":
        return "vulnerable"
    if mech["qclass"] == "unknown":
        return "unknown"
    return None


def _mosca(x: float, y: float, z: float, verdict: str | None) -> dict:
    """One Mosca check. ``verdict`` is 'vulnerable', 'unknown' or None."""
    margin = x + y - z
    if verdict is None or x <= 0:
        return {"status": "not_applicable", "x": x, "y": y, "z": z, "margin": margin}
    if verdict == "unknown":
        return {"status": "indeterminate", "x": x, "y": y, "z": z, "margin": margin,
                "violated_if_vulnerable": margin > 0}
    return {"status": "violated" if margin > 0 else "ok", "x": x, "y": y, "z": z, "margin": margin}


def analyse_asset(asset: dict, cfg: RiskConfig | None = None) -> dict:
    """Score one asset and explain the result."""
    cfg = cfg or RiskConfig()
    z = cfg.threat_horizon_years
    ke = _mechanism(asset, KEY_ESTABLISHMENT)
    sig = _mechanism(asset, SIGNATURE)
    sym = _mechanism(asset, SYMMETRIC)
    hsh = _mechanism(asset, HASH)

    x_conf = float(asset.get("confidentiality_years", 0))
    x_int = float(asset.get("integrity_years", 0))
    y = float(asset["migration_years"])

    # ---- Mosca: confidentiality (HNDL, key establishment) and authenticity (signatures)
    mosca_conf = _mosca(x_conf, y, z, _is_vulnerable_or_unknown(ke))
    mosca_auth = _mosca(x_int, y, z, _is_vulnerable_or_unknown(sig))
    statuses = {mosca_conf["status"], mosca_auth["status"]}
    if "violated" in statuses:
        mosca_status = "violated"
    elif "indeterminate" in statuses:
        mosca_status = "indeterminate"
    elif "ok" in statuses:
        mosca_status = "ok"
    else:
        mosca_status = "not_applicable"
    margins = [m["margin"] for m in (mosca_conf, mosca_auth) if m["status"] != "not_applicable"]
    mosca_margin = max(margins) if margins else None

    # ---- Components (all in [0, 1])
    # Signatures only matter when something must stay trustworthy over time.
    x_eff = max(x_conf, x_int if _is_vulnerable_or_unknown(sig) else 0.0)
    q_parts = [ke["q"], sym["q"], hsh["q"]]
    if x_int > 0:
        q_parts.append(sig["q"])
    Q = max(q_parts)
    sens = SENSITIVITY[asset["sensitivity"]]
    C = 0.7 * min(x_eff / cfg.x_max_years, 1.0) + 0.3 * sens
    E = EXPOSURE[asset["exposure"]]
    M = 0.5 * DIFFICULTY[asset["migration_difficulty"]] + 0.5 * min(y / cfg.y_max_years, 1.0)

    w = cfg.weights
    R = 100 * (w["C"] * C + w["Q"] * Q + w["E"] * E + w["M"] * M)
    exposure_score = 100 * (w["C"] * C + w["Q"] * Q + w["E"] * E) / (w["C"] + w["Q"] + w["E"])

    # ---- Tier (rules are deliberately simple and listed in docs/METHODOLOGY.md)
    has_unknown = any(m["applicable"] and m["qclass"] == "unknown" for m in (ke, sig, sym, hsh))
    tier = _tier_from_score(R, cfg)
    reasons = []
    if x_eff <= 0:
        tier = "Low"
        reasons.append("No confidentiality or integrity lifetime requirement.")
    elif Q < cfg.low_q_cap and not has_unknown:
        tier = "Low"
        reasons.append("Mechanisms are post-quantum, hybrid or have an adequate margin: monitor.")
    else:
        if mosca_status == "violated" and TIERS.index(tier) < TIERS.index("High"):
            tier = "High"
            reasons.append("Raised to High because Mosca's inequality X + Y > Z holds.")
        if has_unknown and TIERS.index(tier) < TIERS.index("Medium"):
            tier = "Medium"
            reasons.append("Raised to Medium because part of the configuration is unknown.")

    qkd_candidate, qkd_reason = _qkd_candidate(asset, x_eff, ke, sig)

    result = {
        "id": asset["id"], "name": asset["name"], "category": asset["category"],
        "protocol": asset["protocol"], "notes": asset.get("notes", ""),
        "link_type": asset.get("link_type"), "forward_secrecy": asset.get("forward_secrecy"),
        "mechanisms": {"key_establishment": ke, "signature": sig, "symmetric": sym, "hash": hsh},
        "inputs": {
            "confidentiality_years": x_conf, "integrity_years": x_int, "migration_years": y,
            "sensitivity": asset["sensitivity"], "exposure": asset["exposure"],
            "migration_difficulty": asset["migration_difficulty"],
        },
        "components": {"C": round(C, 3), "Q": round(Q, 3), "E": round(E, 3), "M": round(M, 3)},
        "risk_score": round(R, 1),
        "security_exposure": round(exposure_score, 1),
        "tier": tier, "tier_reasons": reasons,
        "mosca": {"status": mosca_status, "margin": mosca_margin,
                  "confidentiality": mosca_conf, "authenticity": mosca_auth},
        "has_unknown": has_unknown,
        "qkd_candidate": qkd_candidate, "qkd_reason": qkd_reason,
        "quantum_vulnerable": any(_is_vulnerable_or_unknown(m) == "vulnerable"
                                  for m in (ke, sig) if m["applicable"]),
        "uses_pq": any(m["qclass"] in ("pq", "hybrid") for m in (ke, sig)),
    }
    result["recommendations"] = recommend(asset, result)
    return result


def _tier_from_score(score: float, cfg: RiskConfig) -> str:
    if score >= cfg.tier_critical:
        return "Critical"
    if score >= cfg.tier_high:
        return "High"
    if score >= cfg.tier_medium:
        return "Medium"
    return "Low"


def _qkd_candidate(asset: dict, x_eff: float, ke: dict, sig: dict) -> tuple[bool, str]:
    """QKD is only worth evaluating for fixed, authenticated point-to-point links."""
    if asset.get("link_type") != "dedicated_fibre_p2p":
        return False, "Not a dedicated point-to-point fibre link: post-quantum cryptography is the practical option."
    if x_eff < 10:
        return False, "Dedicated fibre, but the confidentiality lifetime does not justify QKD hardware."
    if ke["qclass"] not in ("shor_vulnerable", "unknown"):
        return False, "Key establishment is already post-quantum or hybrid."
    return True, ("Fixed dedicated fibre with long-lived data: evaluate QKD as a supplement to, "
                  "not a replacement for, post-quantum cryptography. Needs authenticated classical "
                  "channel, trusted endpoints and a hardware/vendor assessment.")


def recommend(asset: dict, res: dict) -> list[dict]:
    """Rule-based, asset-specific recommendations (ordered by importance)."""
    recs: list[dict] = []
    mech = res["mechanisms"]
    ke, sig, sym, hsh = (mech[k] for k in ("key_establishment", "signature", "symmetric", "hash"))
    cid = ke["id"]

    if res["mosca"]["status"] == "violated":
        m = res["mosca"]["margin"]
        recs.append({"priority": "now", "action": "Start migration planning immediately",
                     "detail": f"Mosca's inequality holds under the selected horizon (X+Y exceeds Z by {m:.0f} years)."})
    if res["has_unknown"]:
        recs.append({"priority": "now", "action": "Complete the cryptographic inventory first",
                     "detail": "Identify protocol, key-establishment, signature and symmetric algorithms "
                               "(vendor documentation, packet capture, configuration review). Unknown is scored conservatively."})

    if ke["applicable"] and ke["qclass"] == "shor_vulnerable":
        if cid in ("RSA-KT", "DH-STATIC", "ECDH-STATIC"):
            recs.append({"priority": "now", "action": "Replace static/key-transport exchange with ephemeral key agreement",
                         "detail": "Removes the no-forward-secrecy exposure even before post-quantum migration, "
                                   "then move to hybrid key establishment."})
            recs.append({"priority": "next", "action": "Adopt hybrid key establishment (ECDHE + ML-KEM, FIPS 203)",
                         "detail": "Test in a staging environment for interoperability, handshake size and latency."})
        elif cid == "RSA-WRAP":
            recs.append({"priority": "next", "action": "Re-wrap data-encryption keys with an ML-KEM-based hybrid scheme",
                         "detail": "ML-KEM is a KEM: derive a wrapping key via KEM + KDF; it does not encrypt the data itself. "
                                   "Rotate and re-wrap long-lived archive keys."})
        else:
            recs.append({"priority": "next", "action": "Enable hybrid key establishment (e.g. X25519MLKEM768)",
                         "detail": "Forward secrecy protects against later key theft but not against a recorded "
                                   "handshake being attacked with a capable quantum computer."})
    elif ke["applicable"] and ke["qclass"] in ("hybrid", "pq"):
        recs.append({"priority": "verify", "action": "Verify the post-quantum configuration in production",
                     "detail": "Confirm the hybrid/PQ group is actually negotiated, clients fall back safely, "
                               "and the implementation is maintained."})

    if sig["applicable"] and sig["qclass"] == "shor_vulnerable":
        if res["inputs"]["integrity_years"] > 0:
            recs.append({"priority": "next", "action": "Plan quantum-resistant signatures for long-lived trust",
                         "detail": "Evaluate ML-DSA (FIPS 204), SLH-DSA (FIPS 205) or, for firmware signing, hash-based "
                                   "LMS/XMSS (NIST SP 800-208). Ship verifiers that support new algorithms before signing with them."})
        else:
            recs.append({"priority": "later", "action": "Track PKI / certificate-authority post-quantum roadmap",
                         "detail": "Forging a signature requires a quantum attacker at attack time, so this is not a "
                                   "retroactive harvest risk; schedule with certificate renewal."})

    if sym["applicable"] and sym["id"] == "AES-128":
        recs.append({"priority": "later", "action": "Prefer AES-256 where it is cheap to do so",
                     "detail": "Grover reduces the generic search margin; this is hygiene, not an emergency."})
    if sym["id"] == "3DES":
        recs.append({"priority": "now", "action": "Retire 3DES",
                     "detail": "Classically weak (64-bit blocks); replace with AES-GCM regardless of quantum timelines."})
    if hsh["id"] == "SHA-1":
        recs.append({"priority": "now", "action": "Replace SHA-1",
                     "detail": "Deprecated for collision resistance; use SHA-256 or SHA-384."})

    if res["inputs"]["migration_difficulty"] in ("high", "very_high") and res["tier"] in ("Critical", "High"):
        recs.append({"priority": "next", "action": "Add compensating controls and a crypto-agility plan",
                     "detail": "Segment the network, shorten data retention, require post-quantum support in procurement, "
                               "and schedule vendor or device replacement."})
    if res["qkd_candidate"]:
        recs.append({"priority": "later", "action": "Evaluate QKD for this specific link (after PQC)",
                     "detail": res["qkd_reason"]})
    if not recs:
        recs.append({"priority": "verify", "action": "No quantum-specific action required now",
                     "detail": "Keep the asset in the inventory and re-assess periodically."})
    return recs


def analyse_inventory(inventory: dict | None = None, cfg: RiskConfig | None = None) -> list[dict]:
    """Analyse every asset and return them ranked (highest priority first)."""
    inventory = inventory or load_inventory()
    cfg = cfg or RiskConfig()
    results = [analyse_asset(a, cfg) for a in inventory["assets"]]
    results.sort(key=lambda r: (TIERS.index(r["tier"]), r["risk_score"]), reverse=True)
    for rank, r in enumerate(results, 1):
        r["rank"] = rank
    return results


def overview(results: list[dict]) -> dict:
    """Page-A style summary numbers."""
    total = len(results)
    roles_total = roles_known = 0
    for r in results:
        for m in r["mechanisms"].values():
            if m["applicable"]:
                roles_total += 1
                roles_known += m["qclass"] != "unknown"
    return {
        "total_assets": total,
        "quantum_vulnerable": sum(r["quantum_vulnerable"] for r in results),
        "mosca_violated": sum(r["mosca"]["status"] == "violated" for r in results),
        "urgent_review": sum(r["tier"] in ("Critical", "High") for r in results),
        "unknown_config": sum(r["has_unknown"] for r in results),
        "uses_pq_or_hybrid": sum(r["uses_pq"] for r in results),
        "inventory_completeness": round(roles_known / roles_total, 3) if roles_total else 1.0,
        "tier_counts": {t: sum(r["tier"] == t for r in results) for t in TIERS},
    }


def horizon_sweep(inventory: dict | None = None, horizons=range(5, 41),
                  base_cfg: RiskConfig | None = None) -> dict[int, list[dict]]:
    """Re-run the analysis for several threat horizons (powers the dashboard slider)."""
    inventory = inventory or load_inventory()
    base = base_cfg or RiskConfig()
    out = {}
    for z in horizons:
        cfg = RiskConfig(threat_horizon_years=z, weights=base.weights, x_max_years=base.x_max_years,
                         y_max_years=base.y_max_years, tier_critical=base.tier_critical,
                         tier_high=base.tier_high, tier_medium=base.tier_medium, low_q_cap=base.low_q_cap)
        out[z] = analyse_inventory(inventory, cfg)
    return out


def migration_plan(results: list[dict], cfg: RiskConfig | None = None) -> list[dict]:
    """Five-phase roadmap generated from the actual inventory and assumptions."""
    cfg = cfg or RiskConfig()
    z = cfg.threat_horizon_years
    unknown = [r for r in results if r["has_unknown"]]
    ranked = [r for r in results if r["tier"] in ("Critical", "High")]
    hybrid_candidates = [r for r in results
                         if r["mechanisms"]["key_establishment"]["id"] in ("ECDHE", "DHE", "RSA-KT", "RSA-WRAP", "DH-STATIC", "ECDH-STATIC", "ECDH")
                         and r["tier"] != "Low"]
    done = [r for r in results if r["uses_pq"]]
    qkd = [r for r in results if r["qkd_candidate"]]

    def ref(r):  # compact asset reference
        return {"id": r["id"], "name": r["name"], "tier": r["tier"]}

    return [
        {"phase": 1, "name": "Discover",
         "summary": f"{len(unknown)} asset(s) have unidentified cryptography; inventory them before deciding.",
         "items": [{"asset": ref(r), "task": "Identify protocol, key establishment, signature and symmetric algorithms"} for r in unknown]
                  or [{"task": "Inventory is complete for the sample assets; repeat for new systems."}]},
        {"phase": 2, "name": "Prioritise",
         "summary": f"Under Z = {z:g} years, {len(ranked)} asset(s) are Critical or High.",
         "items": [{"asset": ref(r),
                    "task": f"Rank {r['rank']}: R = {r['risk_score']}, Mosca {r['mosca']['status'].replace('_', ' ')}"}
                   for r in ranked]},
        {"phase": 3, "name": "Test",
         "summary": "Trial standardised and hybrid post-quantum key establishment away from production.",
         "items": [{"asset": ref(r), "task": "Stage hybrid ECDHE + ML-KEM; measure handshake size, latency, interoperability"}
                   for r in hybrid_candidates]},
        {"phase": 4, "name": "Migrate",
         "summary": "Move the highest-priority assets first; keep crypto-agility so algorithms can change again.",
         "items": [{"asset": ref(r), "task": _migrate_task(r)} for r in ranked]
                  + [{"asset": ref(r), "task": "Evaluate QKD for this fixed link after PQC (supplement, not replacement)"} for r in qkd],
         },
        {"phase": 5, "name": "Verify",
         "summary": "Re-assess regularly, because the threat horizon and the inventory both change.",
         "items": [{"asset": ref(r), "task": "Confirm PQ/hybrid parameters are negotiated in production"} for r in done]
                  + [{"task": "Re-run the inventory and risk assessment at least annually or after major changes"},
                     {"task": "Track exceptions and vendor roadmaps; update the assumed threat horizon"}]},
    ]


def _migrate_task(r: dict) -> str:
    margin = r["mosca"]["margin"]
    if r["mosca"]["status"] == "violated":
        return f"Already inside the Mosca window by {margin:.0f} years: start now, add compensating controls"
    if margin is not None:
        return f"Mosca slack of {-margin:.0f} years before migration must start; sooner is safer"
    return "Schedule by risk score; no Mosca test applies"


def label_for(qclass: str) -> str:
    return QCLASS_LABELS.get(qclass, qclass)

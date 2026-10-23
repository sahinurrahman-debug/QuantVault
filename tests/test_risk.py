"""Risk engine: Mosca, scoring, tiers and recommendations."""

import pytest

from src.risk import (RiskConfig, analyse_asset, analyse_inventory, horizon_sweep, load_inventory,
                      migration_plan, overview)


def asset(**kw):
    base = dict(id="T", name="t", category="c", protocol="p", key_establishment="ECDHE", signature="ECDSA",
                symmetric="AES-256", hash="SHA-256", forward_secrecy=True, confidentiality_years=20,
                integrity_years=0, migration_years=4, sensitivity="restricted", exposure="internet",
                migration_difficulty="medium", link_type="internet")
    base.update(kw)
    return base


def test_mosca_matches_the_worked_example():
    # X = 20, Y = 4, Z = 12 -> 24 > 12
    r = analyse_asset(asset(), RiskConfig(threat_horizon_years=12))
    m = r["mosca"]["confidentiality"]
    assert (m["x"], m["y"], m["z"]) == (20, 4, 12)
    assert m["status"] == "violated" and m["margin"] == 12


def test_mosca_boundary_is_strict():
    r = analyse_asset(asset(confidentiality_years=10, migration_years=5), RiskConfig(threat_horizon_years=15))
    assert r["mosca"]["status"] == "ok"  # X + Y == Z is not > Z


def test_changing_horizon_changes_priority():
    a = asset(confidentiality_years=5, migration_years=3, exposure="internal", sensitivity="internal")
    near = analyse_asset(a, RiskConfig(threat_horizon_years=5))
    far = analyse_asset(a, RiskConfig(threat_horizon_years=30))
    assert near["mosca"]["status"] == "violated" and far["mosca"]["status"] == "ok"
    assert near["tier"] in ("High", "Critical")


def test_risk_score_formula_and_weights():
    r = analyse_asset(asset())
    c = r["components"]
    assert r["risk_score"] == pytest.approx(100 * (0.35 * c["C"] + 0.25 * c["Q"] + 0.20 * c["E"] + 0.20 * c["M"]), abs=0.2)
    with pytest.raises(ValueError):
        RiskConfig(weights={"C": 0.5, "Q": 0.5, "E": 0.5, "M": 0.5})


def test_exposure_score_ignores_migration_difficulty():
    easy = analyse_asset(asset(migration_difficulty="low", migration_years=1))
    hard = analyse_asset(asset(migration_difficulty="very_high", migration_years=9))
    assert easy["security_exposure"] == hard["security_exposure"]
    assert hard["risk_score"] > easy["risk_score"]


def test_unknown_is_never_safe():
    r = analyse_asset(asset(key_establishment="UNKNOWN"))
    assert r["has_unknown"] and r["mosca"]["status"] == "indeterminate"
    assert r["components"]["Q"] >= 0.5 and r["tier"] != "Low"
    assert any("inventory" in x["action"].lower() for x in r["recommendations"])


def test_pq_and_hybrid_are_low_priority_but_verified():
    for kem in ("ML-KEM", "HYBRID-KEM"):
        r = analyse_asset(asset(key_establishment=kem, signature="ML-DSA"))
        assert r["tier"] == "Low" and r["mosca"]["status"] == "not_applicable"
        assert any(x["priority"] == "verify" for x in r["recommendations"])


def test_forward_secrecy_is_not_treated_as_quantum_safe():
    ephemeral = analyse_asset(asset(key_establishment="ECDHE"))
    static = analyse_asset(asset(key_establishment="RSA-KT", forward_secrecy=False))
    assert ephemeral["components"]["Q"] >= 0.8  # still exposed to a recorded handshake
    assert static["components"]["Q"] > ephemeral["components"]["Q"]


def test_aes128_is_hygiene_not_emergency():
    r = analyse_asset(asset(key_establishment="ML-KEM", symmetric="AES-128"))
    assert r["components"]["Q"] == pytest.approx(0.25) and r["tier"] == "Low"


def test_no_confidentiality_requirement_is_low():
    assert analyse_asset(asset(confidentiality_years=0, sensitivity="public"))["tier"] == "Low"


def test_signature_only_asset_uses_integrity_lifetime():
    r = analyse_asset(asset(key_establishment=None, symmetric=None, confidentiality_years=0, integrity_years=15,
                            migration_years=6), RiskConfig(threat_horizon_years=15))
    assert r["mosca"]["authenticity"]["status"] == "violated"
    assert r["mosca"]["confidentiality"]["status"] == "not_applicable"
    assert any("ML-DSA" in x["detail"] or "SP 800-208" in x["detail"] for x in r["recommendations"])


def test_qkd_only_suggested_for_dedicated_fibre_with_long_lived_data():
    assert analyse_asset(asset(link_type="dedicated_fibre_p2p"))["qkd_candidate"]
    assert not analyse_asset(asset())["qkd_candidate"]
    assert not analyse_asset(asset(link_type="dedicated_fibre_p2p", confidentiality_years=2))["qkd_candidate"]


def test_sample_inventory_loads_and_is_ranked():
    results = analyse_inventory()
    assert len(results) == 13
    assert [r["rank"] for r in results] == list(range(1, 14))
    order = ["Low", "Medium", "High", "Critical"]
    assert all(order.index(a["tier"]) >= order.index(b["tier"]) for a, b in zip(results, results[1:]))
    assert any(r["has_unknown"] for r in results)  # unknowns are surfaced, not hidden


def test_overview_counts():
    o = overview(analyse_inventory())
    assert o["total_assets"] == 13 and o["unknown_config"] == 2
    assert 0 < o["inventory_completeness"] < 1


def test_longer_horizon_never_increases_mosca_violations():
    sweep = horizon_sweep(horizons=[5, 10, 20, 40])
    counts = [overview(sweep[z])["mosca_violated"] for z in (5, 10, 20, 40)]
    assert counts == sorted(counts, reverse=True)


def test_migration_plan_has_five_phases_built_from_the_inventory():
    results = analyse_inventory()
    plan = migration_plan(results)
    assert [p["name"] for p in plan] == ["Discover", "Prioritise", "Test", "Migrate", "Verify"]
    assert len(plan[0]["items"]) == 2  # the two unknown assets
    assert load_inventory()["assets"]


# ---------------------------------------------------------------------------- audit regressions
def test_forward_secrecy_flag_is_used_not_just_stored():
    ok = analyse_asset(asset(key_establishment="ECDHE", forward_secrecy=True))
    broken = analyse_asset(asset(key_establishment="ECDHE", forward_secrecy=False))
    assert broken["components"]["Q"] == 1.0 > ok["components"]["Q"]
    assert any("marked No" in w for w in broken["data_warnings"])
    contradiction = analyse_asset(asset(key_establishment="RSA-KT", forward_secrecy=True))
    assert any("cannot provide" in w for w in contradiction["data_warnings"])
    assert analyse_asset(asset(key_establishment="ECDHE", forward_secrecy=None))["data_warnings"] == []


def test_classical_weakness_is_not_reported_as_quantum_exposure():
    r = analyse_asset(asset(key_establishment="ML-KEM", signature="ML-DSA", symmetric="3DES", hash="SHA-1"))
    assert r["components"]["Q"] <= 0.3, "3DES / SHA-1 are classical problems, not quantum exposure"
    assert not r["quantum_vulnerable"]
    assert r["mosca"]["status"] == "not_applicable"
    assert {w["id"] for w in r["classical_weakness"]} == {"3DES", "SHA-1"}
    assert r["tier"] != "Low", "classically weak algorithms must not be hidden by the 'post-quantum, monitor' cap"


def test_classical_weakness_raises_an_otherwise_low_asset_to_medium():
    r = analyse_asset(asset(key_establishment="ML-KEM", signature="ML-DSA", symmetric="3DES", hash="SHA-256",
                            confidentiality_years=2, exposure="isolated", sensitivity="internal", migration_difficulty="low", migration_years=1))
    assert r["tier"] == "Medium"
    assert any("classically weak" in why for why in r["tier_reasons"])


def test_displayed_score_always_agrees_with_the_tier():
    bounds = {"Low": (0, 40), "Medium": (40, 62), "High": (62, 75), "Critical": (75, 100.01)}
    for r in analyse_inventory():
        lo, hi = bounds[r["tier"]]
        assert lo <= r["risk_score"] < hi, f"{r['name']}: R={r['risk_score']} but tier {r['tier']}"
        assert r["risk_score_raw"] is not None
    site = next(r for r in analyse_inventory() if r["name"].startswith("Public information"))
    assert site["tier"] == "Low" and site["score_adjusted"] and site["risk_score"] < 40 < site["risk_score_raw"]


def test_unknown_crypto_with_an_expired_window_is_counted_as_a_possible_violation():
    results = analyse_inventory(cfg=RiskConfig(threat_horizon_years=15))
    pacs = next(r for r in results if r["name"].startswith("Legacy radiology"))
    assert pacs["mosca"]["status"] == "indeterminate" and pacs["mosca"]["possible_violation"]
    o = overview(results)
    assert o["mosca_possible"] >= 1
    assert o["mosca_violated"] == sum(r["mosca"]["status"] == "violated" for r in results)


@pytest.mark.parametrize("bad", [{"exposure": "moon"}, {"sensitivity": "top-secret"}, {"migration_difficulty": ""},
                                 {"migration_years": "soon"}, {"migration_years": -3}, {"confidentiality_years": None, "migration_years": float("nan")}])
def test_bad_input_is_a_clear_value_error_not_a_key_error(bad):
    with pytest.raises(ValueError):
        analyse_asset(asset(**bad))


def test_missing_required_field_is_a_value_error():
    a = asset()
    del a["migration_years"]
    with pytest.raises(ValueError, match="migration_years"):
        analyse_asset(a)

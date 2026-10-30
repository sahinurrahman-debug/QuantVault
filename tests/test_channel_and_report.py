"""Tests for Live Quantum-Safe Channel and Executive Board Report Generator."""

import json
from pathlib import Path
import pytest

from src.channel import run_quantum_safe_channel, SAMPLE_PATIENT_RECORD
from src.report import generate_board_report
from src.risk import RiskConfig


def test_quantum_safe_channel_clean_transmission():
    """Test clean channel encrypts patient record with AES-256-GCM and verifies integrity."""
    res = run_quantum_safe_channel(spy=False, qkd_qubits=2048, seed=42)

    assert res["status"] == "TRANSMITTED"
    assert res["spy_present"] is False
    assert res["spy_detected"] is False
    assert res["qkd"]["accepted"] is True
    assert res["qkd"]["qber_observed"] < res["qkd"]["qber_threshold"]
    assert res["pqc"]["status"] == "SUCCESS"
    assert res["pqc"]["keys_agree"] is True
    assert len(res["pqc"]["session_key_fingerprint"]) == 16
    assert "hybrid_session_key_hex" not in res["pqc"]  # the key itself never leaves the function
    assert not any("preview" in k for k in res["pqc"]) and not any("preview" in k for k in res["qkd"])

    payload = res["payload"]
    assert payload["plaintext_transmitted"] is True
    assert payload["plaintext_bytes_leaked"] == 0
    assert payload["nonce_hex"] is not None and len(payload["nonce_hex"]) == 24  # 12 bytes = 24 hex
    assert payload["tag_hex"] is not None and len(payload["tag_hex"]) == 32      # 16 bytes = 32 hex
    assert payload["ciphertext_hex"] is not None
    assert payload["integrity_verified"] is True
    assert payload["decrypted_record"]["patient_id"] == SAMPLE_PATIENT_RECORD["patient_id"]
    assert payload["decrypted_record"]["patient_name"] == SAMPLE_PATIENT_RECORD["patient_name"]


def test_quantum_safe_channel_aborts_under_spy_with_zero_leakage():
    """Test eavesdropping triggers immediate protocol abort with zero plaintext leakage."""
    res = run_quantum_safe_channel(spy=True, qkd_qubits=2048, seed=42)

    assert res["status"] == "ABORTED"
    assert res["spy_present"] is True
    assert res["spy_detected"] is True
    assert res["qkd"]["accepted"] is False
    assert res["qkd"]["qber_observed"] > 0.11  # Expected ~25%
    assert res["pqc"]["status"] == "HALTED"

    payload = res["payload"]
    assert payload["plaintext_transmitted"] is False
    assert payload["plaintext_bytes_leaked"] == 0
    assert payload["ciphertext_hex"] is None
    assert payload["nonce_hex"] is None
    assert payload["tag_hex"] is None


def test_channel_abort_comes_from_the_measured_qber_not_from_the_flag():
    clean = run_quantum_safe_channel(spy=False, qkd_qubits=2048, seed=7)
    spied = run_quantum_safe_channel(spy=True, qkd_qubits=2048, seed=7)
    assert clean["qkd"]["qber_observed"] < 0.11 < spied["qkd"]["qber_observed"]
    assert spied["qkd"]["accepted"] is False


def test_channel_never_substitutes_random_bytes_for_a_short_qkd_key():
    """1024 qubits pass the security check but leave only ~85 secret bits; the channel must say so."""
    res = run_quantum_safe_channel(spy=False, qkd_qubits=1024, seed=42)
    assert res["status"] == "INSUFFICIENT_KEY"
    assert res["pqc"]["status"] == "HALTED"
    assert res["payload"]["plaintext_transmitted"] is False
    assert res["payload"]["ciphertext_hex"] is None


@pytest.mark.parametrize("qubits", [0, 255, 8193, 100_000, 2048.5, "2048", True, None])
def test_channel_rejects_out_of_range_qubits(qubits):
    with pytest.raises(ValueError):
        run_quantum_safe_channel(qkd_qubits=qubits)


def test_channel_rejects_a_non_object_record():
    with pytest.raises(ValueError):
        run_quantum_safe_channel(qkd_qubits=2048, record=["not", "an", "object"])


def test_channel_encrypts_a_custom_record_and_decrypts_it_intact():
    record = {"patient_id": "X-1", "patient_name": "Test Person", "diagnosis": "none"}
    res = run_quantum_safe_channel(record=dict(record), qkd_qubits=2048, seed=42)
    assert res["status"] == "TRANSMITTED"
    assert res["payload"]["decrypted_record"] == record


def test_report_for_the_web_api_writes_nothing_to_disk(tmp_path: Path, monkeypatch):
    import src.report as report

    monkeypatch.setattr(report, "REPORT_MD_PATH", tmp_path / "must_not_exist.md")
    monkeypatch.setattr(report, "REPORT_HTML_PATH", tmp_path / "must_not_exist.html")
    res = generate_board_report(cfg=RiskConfig(threat_horizon_years=15.0), write_files=False)
    assert res["markdown_path"] is None and res["html_path"] is None
    assert "Executive Cryptographic Migration Plan" in res["markdown_content"]
    assert "<!doctype html>" in res["html_content"]
    assert list(tmp_path.iterdir()) == []


def test_report_is_built_for_the_assets_it_is_given():
    from src.bridge import cmd_report

    asset = dict(json.loads((Path(__file__).resolve().parent.parent / "data" / "inventory.json").read_text(encoding="utf-8"))["assets"][0])
    asset["name"] = "Only Asset"
    res = cmd_report({"assets": [asset], "horizon": 12})
    assert res["total_assets"] == 1
    assert "Only Asset" in res["markdown_content"]
    assert res["markdown_path"] is None  # the API path never writes files


def test_report_for_an_empty_inventory_is_an_error_not_the_sample_data():
    from src.bridge import cmd_report

    with pytest.raises(ValueError, match="empty"):
        cmd_report({"assets": [], "horizon": 15})


def test_board_report_generation(tmp_path: Path):
    """Test generation of comprehensive Markdown and printable HTML migration plans."""
    md_path = tmp_path / "board_report_test.md"
    html_path = tmp_path / "board_report_test.html"

    cfg = RiskConfig(threat_horizon_years=15.0)
    res = generate_board_report(cfg=cfg, output_md_path=md_path, output_html_path=html_path)

    assert md_path.exists()
    assert html_path.exists()
    assert res["total_assets"] >= 10
    assert res["urgent_review"] >= 1

    md_text = md_path.read_text(encoding="utf-8")
    assert "QuantVault: Executive Cryptographic Migration Plan" in md_text
    assert "Mosca Migration Inequality" in md_text
    assert "GRI Survey" in md_text
    assert "Roadmap" in md_text
    assert "Capital Allocation: Post-Quantum Cryptography (PQC) vs. QKD" in md_text

    html_text = html_path.read_text(encoding="utf-8")
    assert "<!doctype html>" in html_text
    assert "Print / Save as PDF" in html_text
    assert "Prioritised Cryptographic Asset Inventory" in html_text

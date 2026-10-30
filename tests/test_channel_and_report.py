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

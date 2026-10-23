"""The command-line interface."""

from src.main import main


def test_risk_command_prints_the_ranked_table(capsys):
    main(["risk", "--horizon", "10"])
    out = capsys.readouterr().out
    assert "QuantVault risk assessment" in out and "Z = 10 years" in out
    assert "Electronic health records" in out and "Mosca" in out


def test_qkd_command_accepts_a_clean_channel(capsys):
    main(["qkd", "--qubits", "2048", "--seed", "3"])
    out = capsys.readouterr().out
    assert "ACCEPTED" in out and "final key length" in out


def test_qkd_command_aborts_when_an_eavesdropper_is_present(capsys):
    main(["qkd", "--qubits", "2048", "--eve", "--seed", "3"])
    assert "ABORTED" in capsys.readouterr().out

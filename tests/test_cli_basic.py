# tests/test_cli_basic.py
from typer.testing import CliRunner
from quantkit.cli import app


def test_cli_help_loads():
    runner = CliRunner()
    res = runner.invoke(app, ["--help"])
    assert res.exit_code == 0
    assert "Quantkit CLI" in res.stdout


def test_cli_plot_stub():
    runner = CliRunner()
    res = runner.invoke(app, ["plot", "AAPL", "20240101-000000"])
    assert res.exit_code == 0
    assert "Plottar AAPL (run 20240101-000000)" in res.stdout


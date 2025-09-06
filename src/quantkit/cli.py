from __future__ import annotations

from pathlib import Path
from enum import Enum
import typer

# Viktigt för testet: exakt stavning "Quantkit CLI"
app = typer.Typer(add_completion=False, help="Quantkit CLI")


class Timeframe(str, Enum):
    m5 = "5m"
    h1 = "1h"
    d1 = "1d"


# -------- snapshot-hotlists --------
@app.command("snapshot-hotlists")
def snapshot_hotlists(
    timeframe: Timeframe = typer.Option(Timeframe.m5, help="Aggregation window"),
    tickers_file: str = typer.Option("config/tickers.txt", help="Path to tickers list"),
    out_path: str = typer.Option("storage/snapshots/hotlists/latest.parquet", help="Output parquet"),
    force: bool = typer.Option(False, help="Overwrite even if fresh"),
) -> None:
    """
    Build the hotlists snapshot and write it to parquet.
    Prints an OK line on success (used by Actions).
    """
    from .snapshots.hotlists_snapshot import build_hotlists_snapshot

    df, out_file = build_hotlists_snapshot(
        timeframe=timeframe.value,
        tickers_file=tickers_file,
        out_path=out_path,
        force=force,
        api_key=None,
    )
    typer.echo(f"OK snapshot → {out_file} rows={len(df)} cols={df.shape[1]}")


# -------- plot (minimal smoke) --------
@app.command("plot")
def plot(
    symbol: str = typer.Argument(..., help="Ticker symbol, e.g. AAPL"),
    run_id: str = typer.Argument(..., help="Run folder name, e.g. 20240101-000000"),
) -> None:
    """Minimal 'plot' som skriver en HTML-fil och echo:ar vägen (för test)."""
    out_dir = Path("reports") / "plots" / symbol / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_html = out_dir / "index.html"
    out_html.write_text(
        f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{symbol} plot</title></head>
<body><h1>{symbol}</h1><p>Run: {run_id}</p></body></html>""",
        encoding="utf-8",
    )
    typer.echo(f"Plottar {symbol} (run {run_id})")
    typer.echo(str(out_html))


def main() -> None:
    app()

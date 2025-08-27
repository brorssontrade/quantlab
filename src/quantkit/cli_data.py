# src/quantkit/cli_data.py
from __future__ import annotations

import time
import datetime as dt
from pathlib import Path
from typing import List, Iterable

import typer
import yaml

from quantkit.data.eodhd_loader import load_bars
from quantkit.data.market_hours import is_open_stockholm, is_open_us

app = typer.Typer(add_completion=False, help="Quantkit data sync CLI")


def _read_watchlist_codes(path: str) -> List[str]:
    p = Path(path)
    if not p.exists():
        return []
    doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    items = (doc.get("items") or []) or (doc.get("tickers") or [])
    out: List[str] = []
    for it in items:
        code = (it or {}).get("code") if isinstance(it, dict) else (it if isinstance(it, str) else None)
        if code:
            out.append(str(code).strip())
    return out


def _filter_by_market_open(symbols: Iterable[str]) -> List[str]:
    res: List[str] = []
    se_open = is_open_stockholm()
    us_open = is_open_us()
    for s in symbols:
        if s.endswith(".ST"):
            if se_open:
                res.append(s)
        elif s.endswith(".US"):
            if us_open:
                res.append(s)
        else:
            # Unknown suffix: don't gate
            res.append(s)
    return res


@app.command("sync")
def sync_cmd(
    watchlist: str = typer.Option("watchlist.yaml", help="YAML with items: [{code: 'ABB.ST'}, ...]"),
    intervals: str = typer.Option("EOD,5m", help="Comma separated, e.g. EOD,5m"),
    eod_days: int = typer.Option(9000),
    intra_days: int = typer.Option(5),
    loop_minutes: int = typer.Option(0, help="0=run once; >0=loop with sleep"),
    respect_hours: bool = typer.Option(False, help="Skip .ST/.US when the market is closed"),
    verbose: bool = typer.Option(True),
):
    syms = _read_watchlist_codes(watchlist)
    if not syms:
        typer.echo(f"❌ No tickers found in {watchlist}")
        raise typer.Exit(2)

    wanted = [x.strip() for x in intervals.split(",") if x.strip()]

    def _run_once() -> None:
        run_list = list(syms)
        if respect_hours:
            run_list = _filter_by_market_open(run_list)
            if verbose:
                typer.echo(f"⏱  market gate -> {len(run_list)}/{len(syms)} symbols")

        for sym in run_list:
            for iv in wanted:
                days = eod_days if iv.upper() == "EOD" else intra_days
                try:
                    df = load_bars(sym, interval=iv, days=days, debug=verbose, cached=True)
                    n = 0 if df is None else len(df)
                    typer.echo(f"✔ {sym} {iv}: {n} rows")
                except Exception as e:
                    typer.echo(f"⚠ {sym} {iv}: {e}")

    if loop_minutes and loop_minutes > 0:
        while True:
            _run_once()
            time.sleep(loop_minutes * 60)
    else:
        _run_once()


if __name__ == "__main__":
    app()

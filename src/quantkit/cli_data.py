# src/quantkit/cli_data.py
from __future__ import annotations

import re, time, sys
from pathlib import Path
from typing import List, Optional

import typer
import yaml

from quantkit.data.eodhd_loader import load_bars
from quantkit.data.market_hours import is_open_us, is_open_stockholm

# Tillåt okända/extra argument så att vi kan svälja "sync" om någon kör toppnivåvarianten
app = typer.Typer(
    add_completion=False,
    help="Data sync CLI för Quantkit",
    context_settings={"allow_extra_args": True, "ignore_unknown_options": True},
)


def _read_watchlist_yaml(path: Path) -> List[str]:
    if not path.exists():
        return []
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    items = doc.get("items") or doc.get("tickers") or doc.get("symbols") or []
    out: List[str] = []
    for it in items:
        if isinstance(it, dict):
            code = it.get("code") or it.get("symbol") or it.get("ticker")
        else:
            code = str(it)
        if code:
            out.append(str(code).strip())
    return out


def _read_any_list_file(path: Path) -> List[str]:
    if path.suffix.lower() in {".yaml", ".yml"}:
        return _read_watchlist_yaml(path)
    txt = path.read_text(encoding="utf-8")
    return [t.strip() for t in re.split(r"[,\s;]+", txt) if t.strip()]


def _parse_tickers(source: Optional[str]) -> List[str]:
    # 1) Angiven sträng kan vara CSV eller filväg
    if source and source.strip():
        s = source.strip()
        if s.startswith("file:"):
            s = s[5:]
        p = Path(s)
        if ("," not in s) and p.exists():
            return _read_any_list_file(p)
        return [t.strip() for t in re.split(r"[,\s;]+", s) if t.strip()]

    # 2) watchlist.yaml
    wl = Path("watchlist.yaml")
    if wl.exists():
        vals = _read_watchlist_yaml(wl)
        if vals:
            return vals

    # 3) config/tickers.txt
    txt = Path("config/tickers.txt")
    if txt.exists():
        vals = _read_any_list_file(txt)
        if vals:
            return vals

    return []


def _parse_intervals(s: str) -> List[str]:
    return [x.strip() for x in re.split(r"[,\s;]+", s) if x.strip()]


def _markets_in_symbols(symbols: List[str]) -> set[str]:
    m: set[str] = set()
    for s in symbols:
        ss = s.upper()
        if ss.endswith(".US"):
            m.add("US")
        if ss.endswith(".ST") or ss.endswith(".SE"):
            m.add("SE")
    return m


def _run_sync(
    tickers: Optional[str],
    interval: str,
    days: Optional[int],
    eod_days: int,
    intra_days: int,
    gate_hours: bool,
    sleep_between: float,
    debug: bool,
) -> None:
    syms = _parse_tickers(tickers)
    if not syms:
        typer.echo("❌ Hittade inga tickers (ange --tickers eller lägg watchlist.yaml / config/tickers.txt).")
        raise typer.Exit(2)

    intervals = _parse_intervals(interval)
    if not intervals:
        typer.echo("❌ Inga intervall angivna.")
        raise typer.Exit(2)

    # Gating på öppettider
    if gate_hours:
        markets = _markets_in_symbols(syms)
        us_ok = is_open_us() if "US" in markets else False
        se_ok = is_open_stockholm() if "SE" in markets else False
        if markets and not (us_ok or se_ok):
            typer.echo("⏸ Marknader stängda för dina tickers. Kör igen senare.")
            raise typer.Exit(0)

    ok = 0
    fail = 0

    for iv in intervals:
        iv_upper = iv.upper()
        dflt_days = eod_days if iv_upper == "EOD" else intra_days
        d = dflt_days if days is None else int(days)

        typer.echo(f"▶ Intervall {iv} (days={d}) på {len(syms)} tickers …")
        for sym in syms:
            try:
                df = load_bars(sym, interval=iv, days=d, cached=True, debug=debug)
                n = 0 if df is None else len(df)
                typer.echo(f"  ✔ {sym} {iv}: {n} rader")
                ok += 1
            except Exception as e:
                typer.echo(f"  ⚠ {sym} {iv}: {e}")
                fail += 1
            if sleep_between > 0:
                time.sleep(float(sleep_between))

    if ok == 0:
        raise typer.Exit(1)

    typer.echo(f"✅ Klart. Lyckade: {ok}, misslyckade: {fail}")


@app.command(help="Synka data för givna tickers och intervall (EOD, 5m, mfl).")
def sync(
    tickers: Optional[str] = typer.Option(
        None, "--tickers", "-t",
        help="CSV/blankseparerade tickers eller sökväg till fil (txt/csv/yaml). "
             "Utelämnad ⇒ försöker watchlist.yaml eller config/tickers.txt.",
    ),
    interval: str = typer.Option(
        "EOD,5m", "--interval", "-i",
        help="Intervall (en eller flera), t.ex. 'EOD,5m'.",
    ),
    days: Optional[int] = typer.Option(
        None, "--days",
        help="Överskriv dagar för ALLA intervall. Utelämnad ⇒ eod_days/intra_days.",
    ),
    eod_days: int = typer.Option(9000, help="Dagar för EOD när --days ej anges."),
    intra_days: int = typer.Option(10, help="Dagar för intraday när --days ej anges."),
    gate_hours: bool = typer.Option(True, "--gate-hours/--no-gate-hours", help="Skippa körning om relevanta börser är stängda."),
    sleep_between: float = typer.Option(0.25, help="Sekunders paus mellan API-anrop per symbol."),
    debug: bool = typer.Option(False, help="Mer loggning från loadern."),
) -> None:
    _run_sync(tickers, interval, days, eod_days, intra_days, gate_hours, sleep_between, debug)


# Fallback: om någon kör toppnivåvarianten (eller om runner råkar se "sync" som okänt extra-argument)
@app.callback(invoke_without_command=True)
def _default(
    ctx: typer.Context,
    tickers: Optional[str] = typer.Option(None, "--tickers", "-t"),
    interval: str = typer.Option("EOD,5m", "--interval", "-i"),
    days: Optional[int] = typer.Option(None, "--days"),
    eod_days: int = typer.Option(9000, "--eod-days"),
    intra_days: int = typer.Option(10, "--intra-days"),
    gate_hours: bool = typer.Option(True, "--gate-hours/--no-gate-hours"),
    sleep_between: float = typer.Option(0.25, "--sleep-between"),
    debug: bool = typer.Option(False, "--debug"),
):
    # Svälj ev. kvarvarande "sync" i argv om den dyker upp som "okänd"
    args = list(ctx.args or [])
    if args and args[0].lower() == "sync":
        args.pop(0)
        # skriv tillbaka rensad args till sys.argv för tydlighet (frivilligt)
        sys.argv = [sys.argv[0]] + args

    if ctx.invoked_subcommand is None:
        _run_sync(tickers, interval, days, eod_days, intra_days, gate_hours, sleep_between, debug)


if __name__ == "__main__":
    app()

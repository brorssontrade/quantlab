# src/quantkit/cli.py
from __future__ import annotations
from pathlib import Path
from typing import Optional, Dict, Any, List
import typer, pandas as pd, yaml, datetime as dt

from quantkit.config import get_settings
from quantkit.logging import setup_logging

from quantkit.indicators.registry import (
    normalize_ohlcv,
    write_html_catalog as write_ind_docs,
    ensure_populated as ind_ensure,
)
from quantkit.strategies import registry as SREG
from quantkit.reporting.ts_report import build_report
from quantkit.backtest.engine2 import run_signals

from quantkit.data.eodhd_loader import load_bars
from quantkit.data.market_hours import is_open_stockholm, is_open_us

from quantkit.portfolio.ledger import (
    positions as ledger_positions,
    open_position,
    close_position,
)

from quantkit.optimize.best_params import load_best_params, harvest_from_path

app = typer.Typer(add_completion=False, help="Quantkit CLI")

# ----- kostnadsmodell -----
_AVANZA = {
    "mini":   dict(rate=0.0025,  min_fee=1.0),
    "small":  dict(rate=0.0015,  min_fee=39.0),
    "medium": dict(rate=0.00069, min_fee=69.0),
}
def commission_per_fill(notional: float, plan: str | None, fallback: float) -> float:
    if plan is None or plan.lower() == "none":
        return float(fallback)
    p = _AVANZA[plan.lower()]
    return max(notional * p["rate"], p["min_fee"])

def _read_watchlist_codes(path: str = "watchlist.yaml") -> List[str]:
    p = Path(path)
    if not p.exists():
        return []
    doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    items = doc.get("items", []) or doc.get("tickers", [])
    codes = []
    for it in items:
        code = (it or {}).get("code") or (it if isinstance(it, str) else None)
        if code:
            codes.append(str(code).strip())
    return codes

def _timestamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S")

def _write_hit_log(rows: List[Dict[str, Any]], base_dir: Path = Path("reports/screen/logs")) -> Optional[Path]:
    if not rows:
        return None
    base_dir.mkdir(parents=True, exist_ok=True)
    fname = dt.datetime.now().strftime("%Y%m%d") + ".csv"
    p = (base_dir / fname).resolve()
    df = pd.DataFrame(rows)
    if p.exists():
        df.to_csv(p, mode="a", header=False, index=False)
    else:
        df.to_csv(p, index=False)
    return p

def _write_live_report(symbol: str, strategy: str, bars: pd.DataFrame, params: Dict[str, Any] | None) -> Path:
    """
    Kör ett snabbt backtest på de laddade barerna och skriv en TS-lik rapport under:
      reports/live/<symbol>/<strategy>/<ts>/report.html
    och spegla till:
      reports/live/<symbol>/<strategy>/latest/report.html
    """
    SREG.ensure_populated()
    spec = SREG.get(strategy)
    sig = SREG.generate(strategy, bars.copy(), params=params or {})
    entry = sig["entry"].astype(bool)
    exit_rule = sig["exit"].astype(bool)
    meta = dict(sig.get("meta", {}))
    side_eff = (meta.get("side") or spec.direction or "long").lower()

    res = run_signals(
        bars=bars.copy(),
        entry=entry,
        exit_rule=exit_rule,
        side=side_eff,
        sl_pct=meta.get("sl_pct"),
        tp_pct=meta.get("tp_pct"),
        max_bars=meta.get("max_bars"),
        fee_bps=0.0, slippage_bps=0.0, commission_plan="none", qty=1.0,
    )

    # equity
    eq = getattr(res, "equity", None)
    if isinstance(eq, pd.DataFrame) and "equity" in eq:
        equity = eq.set_index(pd.to_datetime(eq.get("ts", eq.index)))["equity"]
    elif isinstance(eq, pd.Series):
        equity = eq
    else:
        equity = pd.Series(range(len(bars)), index=pd.to_datetime(bars["ts"]), name="equity")

    # trades_like
    tdf = getattr(res, "trades", None)
    trades_like = tdf.to_dict("records") if isinstance(tdf, pd.DataFrame) else list(tdf or [])

    run_id = _timestamp()
    out_dir = Path("reports/live") / symbol / strategy / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    html = build_report(
        bars=bars, equity=equity, trades_like=trades_like,
        symbol=symbol, run_id=run_id, out_dir=out_dir, tz="Europe/Stockholm",
        strategy_name=spec.name, strategy_params=(params or meta),
        init_capital=100_000.0, commission_total=0.0, bps_fees_total=0.0, slippage_total=0.0,
    )

    # spegla till latest
    latest = Path("reports/live") / symbol / strategy / "latest"
    latest.mkdir(parents=True, exist_ok=True)
    (latest / "report.html").write_text(Path(html).read_text(encoding="utf-8"), encoding="utf-8")
    return html

@app.callback()
def main(log_level: str = typer.Option("INFO", "--log-level", "-l", help="Loggnivå (DEBUG/INFO/WARN/ERROR)")):
    setup_logging(log_level)



# ---------- BACKTEST ----------
@app.command(help="Kör backtest och skriv TS-lik rapport.")
def backtest(
    symbol: str,
    days: int = typer.Option(750, help="Antal handelsdagar att ladda"),
    strategy: str = typer.Option("luke", help="Strategi-id", case_sensitive=False),
    fee_bps: float = typer.Option(0.10, help="BPS-avgifter per sida"),
    slippage_bps: float = typer.Option(0.15, help="Slippage per sida (BPS)"),
    commission_plan: Optional[str] = typer.Option("small", help="Avanza-plan: mini/small/medium/none"),
    commission_per_fill_fixed: float = typer.Option(0.0, help="Fast kommission per fill (om ej plan)"),
    qty: float = typer.Option(1.0, help="Trade size"),
    side: Optional[str] = typer.Option(None, help="Överstyr riktning: long/short"),
    save: bool = typer.Option(True, help="Spara rapport"),
    interval: str = typer.Option("EOD", help="Dataintervall: EOD eller t.ex. 5m"),
    use_best: bool = typer.Option(True, help="Använd sparade Optuna-params om de finns"),
):
    setup_logging("INFO")
    typer.echo(f"📥 Laddar {symbol} ({interval}, days={days}) från EODHD …")
    bars_raw = load_bars(symbol, interval=interval, days=days, debug=True, cached=True)

    if bars_raw is None or bars_raw.empty:
        typer.echo("❌ Inga barer hittades (kolla EODHD_API_KEY, symbolkod och plan).")
        raise typer.Exit(2)
    else:
        typer.echo(f"✔ Hittade {len(bars_raw)} rader.")

    bars = normalize_ohlcv(bars_raw)
    if "ts" not in bars.columns:
        bars = bars.assign(ts=pd.to_datetime(bars.index))

    SREG.ensure_populated()
    try:
        spec = SREG.get(strategy)
    except KeyError:
        typer.echo(f"❌ Okänd strategi: {strategy}"); raise typer.Exit(2)

    params: Dict[str, Any] | None = load_best_params(symbol, strategy) if use_best else None
    if params:
        typer.echo(f"🔧 Använder best-params ({symbol}/{strategy}): {params}")
    else:
        typer.echo("ℹ️  Inga best-params hittade – kör defaults.")
    sig = SREG.generate(strategy, bars.copy(), params=params or {})
    entry = sig["entry"].astype(bool)
    exit_rule = sig["exit"].astype(bool)
    meta = dict(sig.get("meta", {}))
    side_eff = (side or meta.get("side") or spec.direction or "long").lower()

    res = run_signals(
        bars=bars.copy(), entry=entry, exit_rule=exit_rule, side=side_eff,
        sl_pct=meta.get("sl_pct"), tp_pct=meta.get("tp_pct"), max_bars=meta.get("max_bars"),
        fee_bps=float(fee_bps), slippage_bps=float(slippage_bps),
        commission_plan=commission_plan, qty=float(qty),
    )

    trades_df = getattr(res, "trades", pd.DataFrame()).copy() if hasattr(res, "trades") else pd.DataFrame()
    def _sum(col: str) -> float: return float(trades_df[col].sum()) if col in trades_df.columns else 0.0
    commission_total = _sum("commission"); bps_fees_total = _sum("cost_bps"); slippage_total = _sum("slippage_bps")

    if (commission_total == 0.0) and not trades_df.empty:
        for _, t in trades_df.iterrows():
            e_not = float(qty) * float(t.get("entry_px", 0.0))
            x_not = float(qty) * float(t.get("exit_px", 0.0))
            commission_total += commission_per_fill(e_not, commission_plan, commission_per_fill_fixed)
            commission_total += commission_per_fill(x_not, commission_plan, commission_per_fill_fixed)

    if (bps_fees_total == 0.0 or slippage_total == 0.0) and not trades_df.empty:
        notional_total = 0.0
        for _, t in trades_df.iterrows():
            notional_total += float(qty) * (float(t.get("entry_px", 0.0)) + float(t.get("exit_px", 0.0)))
        if bps_fees_total == 0.0:
            bps_fees_total = notional_total * (float(fee_bps) / 10_000.0)
        if slippage_total == 0.0:
            slippage_total = notional_total * (float(slippage_bps) / 10_000.0)

    if save:
        s = get_settings()
        out_dir = (s.reports_dir / symbol / "latest").resolve()
        out_dir.mkdir(parents=True, exist_ok=True)

        equity = getattr(res, "equity", None)
        if isinstance(equity, pd.DataFrame) and "equity" in equity:
            equity = equity.set_index(pd.to_datetime(equity.get("ts", equity.index)))["equity"]
        elif not isinstance(equity, pd.Series):
            equity = pd.Series(range(len(bars)), index=pd.to_datetime(bars["ts"]), name="equity")

        tdf = getattr(res, "trades", None)
        trades_like = tdf.to_dict("records") if isinstance(tdf, pd.DataFrame) else list(tdf or [])

        html = build_report(
            bars=bars, equity=equity, trades_like=trades_like,
            symbol=symbol, run_id="latest", out_dir=out_dir, tz="Europe/Stockholm",
            commission_total=float(commission_total), bps_fees_total=float(bps_fees_total),
            slippage_total=float(slippage_total), strategy_name=spec.name,
            strategy_params=(params or meta), init_capital=100_000.0,
        )
        typer.echo(f"✅ Rapport: {html}")
    else:
        typer.echo("✔️ Backtest klar (save=False).")


# ---------- KATALOGER ----------
@app.command(name="indicators-docs", help="Generera HTML-katalog över indikatorer (reset).")
def indicators_docs(out: str = typer.Option("reports/indicators/index.html")):
    p = write_ind_docs(out, reset=True)
    typer.echo(f"✅ Indicator docs: {p}")

@app.command(name="strategies-docs", help="Generera HTML-katalog över strategier (reset).")
def strategies_docs(out: str = typer.Option("reports/strategies/index.html")):
    p = SREG.write_html_catalog(out, reset=True)
    typer.echo(f"✅ Strategy docs: {p}")

@app.command(name="catalogs", help="Skriv om både indikator- och strategi-katalogen (reset=True).")
def catalogs():
    ind = write_ind_docs("reports/indicators/index.html", reset=True)
    strat = SREG.write_html_catalog("reports/strategies/index.html", reset=True)
    typer.echo(f"✅ Indicators: {ind}")
    typer.echo(f"✅ Strategies: {strat}")

# ---------- LIVE SCREEN ----------
@app.command(name="screen-live", help="Sweep med valfria strategier. Loggar träffar. Kan skriva rapporter på signalträffar.")
def screen_live(
    strategies_csv: str = typer.Option("swe_ifrsi_sqz,swe_stc_trend,swe_tdi_breakout", "--strats"),
    interval: str = typer.Option("5m"),
    days: int = typer.Option(30),
    loop_minutes: int = typer.Option(5),
    gate_by_market_hours: bool = typer.Option(True),
    use_best: bool = typer.Option(True),
    report_mode: str = typer.Option("hit"),
    watchlist: str = typer.Option("watchlist.yaml", help="Sökväg till watchlist YAML")
):
    import time
    ind_ensure()
    SREG.ensure_populated()

    tickers = _read_watchlist_codes("watchlist.yaml")
    if not tickers:
        typer.echo("❌ Inga tickers i watchlist.yaml (code: …)."); return

    strats = [s.strip() for s in strategies_csv.split(",") if s.strip()]
    typer.echo(f"▶ Live-screen på {len(tickers)} tickers, strategier={strats} (Ctrl+C för att stoppa)")

    while True:
        # marknadsgating
        run_list = list(tickers)
        if gate_by_market_hours:
            se_open = is_open_stockholm()
            us_open = is_open_us()
            run_list = [t for t in run_list if (t.endswith(".ST") and se_open) or (t.endswith(".US") and us_open)]
            if not run_list:
                typer.echo("⏳ Alla marknader stängda. Väntar…")
                time.sleep(loop_minutes * 60); continue

        pos = ledger_positions()
        open_map = {(r["symbol"], r["strategy"]) for _, r in pos.iterrows()} if not pos.empty else set()
        buys, sells = [], []
        log_rows: List[Dict[str, Any]] = []

        for sym in run_list:
            try:
                bars = load_bars(sym, interval=interval, days=days, cached=True)
                if bars.empty: 
                    continue
                bars = normalize_ohlcv(bars)
                for st in strats:
                    try:
                        params = load_best_params(sym, st) if use_best else None
                        sig = SREG.generate(st, bars.copy(), params=params or {})
                        entry = sig["entry"].astype(bool)
                        exit_ = sig["exit"].astype(bool)
                        last_entry = bool(entry.iloc[-1])
                        last_exit  = bool(exit_.iloc[-1])
                        key = (sym, st)
                        have_pos = (key in open_map)

                        # logga alltid rad per symbol/strategi
                        log_rows.append(dict(
                            ts=dt.datetime.now().isoformat(timespec="seconds"),
                            symbol=sym, strategy=st,
                            in_pos=int(have_pos),
                            entry=int(last_entry),
                            exit=int(last_exit),
                        ))

                        # BUY/SELL-beslut
                        if have_pos:
                            if last_exit:
                                sells.append((sym, st))
                                if report_mode in ("hit","every"):
                                    _write_live_report(sym, st, bars, params)
                        else:
                            if last_entry:
                                buys.append((sym, st))
                                if report_mode in ("hit","every"):
                                    _write_live_report(sym, st, bars, params)

                        # "every": skriv rapport även utan träff
                        if report_mode == "every" and not (last_entry or last_exit):
                            _write_live_report(sym, st, bars, params)

                    except Exception as e:
                        typer.echo(f"  ⚠ {sym}/{st}: {e}")
            except Exception as e:
                typer.echo(f"⚠ {sym}: {e}")

        if buys:
            typer.echo("🟢 BUY: " + ", ".join(f"{s}/{st}" for s,st in buys))
        if sells:
            typer.echo("🔴 SELL: " + ", ".join(f"{s}/{st}" for s,st in sells))
        if not buys and not sells:
            typer.echo("… inga träffar denna runda.")

        # skriv logg
        log_path = _write_hit_log(log_rows)
        if log_path:
            typer.echo(f"📝 Logg → {log_path}")

        time.sleep(loop_minutes * 60)

# ---------- LEDGER ----------
@app.command(name="trade", help="Logga manuell fill: BUY/SELL till lokalt ledger.")
def trade(
    side: str = typer.Argument(..., help="buy/sell"),
    symbol: str = typer.Argument(..., help="EODHD-symbol, ex NVDA.US / ABB.ST"),
    qty: float = typer.Argument(...),
    price: float = typer.Argument(...),
    strategy: str = typer.Option("manual", help="Strategi-tag")
):
    side = side.lower()
    if side == "buy":
        open_position(symbol, qty, price, strategy)
        typer.echo(f"✔ Köp loggat: {symbol} x{qty} @ {price} (strategy={strategy})")
    elif side == "sell":
        close_position(symbol, strategy if strategy != "manual" else None)
        typer.echo(f"✔ Sälj stängt: {symbol} (strategy={strategy})")
    else:
        typer.echo("❌ side måste vara buy/sell")

@app.command(name="positions", help="Visa öppna positioner.")
def positions():
    df = ledger_positions()
    if df.empty:
        typer.echo("— Inga öppna positioner —")
    else:
        typer.echo(df.to_string(index=False))

# ---------- OPTUNA ----------
@app.command(name="optuna", help="Kör Optuna och sparar bästa params till standardplats (data/optuna/best).")
def optuna_cmd(
    symbol: str,
    strategy: str,
    interval: str = typer.Option("EOD"),
    days: int = typer.Option(1500),
    n_trials: int = typer.Option(50),
    objective: str = typer.Option("pp", help="pp|pf|exp|sharpe|custom"),
    min_trades: int = typer.Option(8, help="Minsta #trades för full poäng")
):
    from quantkit.optimize.optuna_runner import run as optuna_run
    from quantkit.optimize.best_params import harvest_from_path
    SREG.ensure_populated()
    result_path = optuna_run(symbol, strategy, interval=interval, days=days, n_trials=n_trials,
                             objective=objective, min_trades=min_trades)
    saved = harvest_from_path(result_path, symbol, strategy)
    if saved:
        typer.echo(f"✅ Optuna klart. Best sparad: {saved}")
    else:
        typer.echo(f"✅ Optuna klart. (Ingen best-fil hittad i {result_path} att harvest:a)")



@app.command(name="bootstrap-cache", help="Fyll lokal cache (Parquet) för alla tickers i watchlist.")
def bootstrap_cache(
    watchlist: str = typer.Option("watchlist.yaml"),
    intervals: str = typer.Option("EOD,5m", help="Komma-separerat, t.ex. EOD,5m"),
    eod_days: int = typer.Option(9000),
    intra_days: int = typer.Option(10),
):
    from quantkit.data.eodhd_loader import load_bars
    codes = _read_watchlist_codes(watchlist)
    if not codes:
        typer.echo(f"❌ Inga tickers i {watchlist}"); raise typer.Exit(2)

    wanted = [x.strip() for x in intervals.split(",") if x.strip()]
    for sym in codes:
        for iv in wanted:
            d = eod_days if iv.upper() == "EOD" else intra_days
            try:
                df = load_bars(sym, interval=iv, days=d, debug=True)
                n = 0 if df is None else len(df)
                typer.echo(f"✔ {sym} {iv}: {n} rader")
            except Exception as e:
                typer.echo(f"⚠ {sym} {iv}: {e}")

# ---------- PLOT (stub för test) ----------
@app.command(help="Minimal plot-stub för test: skriver en liten HTML under reports/plots/…")
def plot(
    symbol: str = typer.Argument(..., help="T.ex. AAPL eller ABB.ST"),
    stamp: str = typer.Argument(..., help="Tidsstämpel, t.ex. 20240101-000000"),
    out: Optional[str] = typer.Option(None, help="Valfri utfil (html)"),
):
    """
    Gör ingen riktig plotting (ingen tunga deps i CI). Skapar bara en enkel HTML som bevis
    på att kommandot fungerar och returnerar 0-exit.
    """
    try:
        target = Path(out) if out else Path("reports/plots") / symbol / stamp / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{symbol} {stamp}</title></head>
<body><h1>{symbol} {stamp}</h1><p>plot stub ok</p></body></html>"""
        target.write_text(html, encoding="utf-8")

        # det här raden krävs av testen:
        typer.echo(f"Plottar {symbol} (run {stamp})")
        # och skriv gärna ut var filen landade:
        typer.echo(str(target.resolve()))
    except Exception as e:
        typer.echo(f"plot stub error: {e}")
        raise typer.Exit(1)



if __name__ == "__main__":
    app()
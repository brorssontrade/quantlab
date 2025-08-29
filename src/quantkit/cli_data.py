# src/quantkit/cli_data.py
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
import typing as T

import typer
import yaml

try:
    from quantkit.data import load_bars  # type: ignore
except Exception:  # pragma: no cover
    load_bars = None  # type: ignore

from quantkit.data.market_hours import is_open_stockholm, is_open_us

try:
    import requests  # type: ignore
except Exception:  # pragma: no cover
    requests = None  # type: ignore

app = typer.Typer(add_completion=False, help="Data sync CLI för Quantkit")

# -------- utils --------
def _read_watchlist_codes(path: str = "watchlist.yaml") -> list[str]:
    p = Path(path)
    if not p.exists():
        return []
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return []
    items = doc.get("items", []) or doc.get("tickers", [])
    out: list[str] = []
    for it in items:
        if isinstance(it, str):
            code = it
        else:
            code = (it or {}).get("code")
        if code:
            out.append(str(code).strip())
    return out


def _read_tickers_txt(path: str = "config/tickers.txt") -> list[str]:
    p = Path(path)
    if not p.exists():
        return []
    return [ln.strip() for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]


def _coerce_list(val: str | None) -> list[str]:
    if not val:
        return []
    return [x.strip() for x in val.split(",") if x.strip()]


def _want_days(interval: str, days: int | None, eod_days: int, intra_days: int) -> int:
    if days is not None:
        return int(days)
    return int(eod_days if interval.upper() == "EOD" else intra_days)


def _gate_by_hours(symbol: str) -> bool:
    if symbol.endswith(".US"):
        return is_open_us()
    if symbol.endswith(".ST"):
        return is_open_stockholm()
    return True


def _load_bars_safe(symbol: str, interval: str, days: int, debug: bool = False):
    if load_bars is None:
        raise RuntimeError("quantkit.data.load_bars kunde inte importeras")
    return load_bars(symbol, interval=interval, days=days, debug=debug)  # type: ignore[call-arg]


def _resolve_tickers(explicit: str | None) -> list[str]:
    tickers = _coerce_list(explicit)
    if tickers:
        return tickers
    tickers = _read_watchlist_codes("watchlist.yaml")
    if tickers:
        return tickers
    tickers = _read_tickers_txt("config/tickers.txt")
    return tickers


# -------- notify helpers --------
def _run_url() -> str:
    server = os.getenv("GITHUB_SERVER_URL", "https://github.com").rstrip("/")
    repo = os.getenv("GITHUB_REPOSITORY", "").strip("/")
    run_id = os.getenv("GITHUB_RUN_ID", "")
    if repo and run_id:
        return f"{server}/{repo}/actions/runs/{run_id}"
    return ""


def _notify(text: str) -> None:
    sent = False
    try:
        if requests is None:
            raise RuntimeError("requests saknas")

        hook = os.getenv("SLACK_WEBHOOK_URL", "").strip()
        if hook:
            try:
                requests.post(hook, json={"text": text}, timeout=10)
                sent = True
            except Exception as e:  # pragma: no cover
                print(f"[notify] Slack fel: {e}", file=sys.stderr)

        tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        tg_chat = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        if tg_token and tg_chat:
            try:
                url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                requests.post(url, data={"chat_id": tg_chat, "text": text}, timeout=10)
                sent = True
            except Exception as e:  # pragma: no cover
                print(f"[notify] Telegram fel: {e}", file=sys.stderr)
    except Exception as e:  # pragma: no cover
        print(f"[notify] generellt fel: {e}", file=sys.stderr)

    if not sent:
        pass


# -------- huvudkommando --------
def _run_sync(
    tickers: str | None,
    interval: str,
    days: int | None,
    eod_days: int,
    intra_days: int,
    gate_hours: bool,
    sleep_between: float,
    debug: bool,
) -> int:
    syms = _resolve_tickers(tickers)
    if not syms:
        typer.echo("❌ Inga tickers (ange --tickers, eller lägg till watchlist.yaml / config/tickers.txt)")
        return 1

    wanted = _coerce_list(interval) or ["EOD", "5m"]

    summarize = os.getenv("NOTIFY_SUMMARY", "").strip() == "1"
    any_success = False
    any_error = False
    any_skip_only = True  # om *allt* blir skippat, ska vi inte faila

    for iv in wanted:
        d = _want_days(iv, days, eod_days, intra_days)
        typer.echo(f"▶ Intervall {iv} (days={d}) på {len(syms)} tickers …")

        ok_count = 0
        err_count = 0
        skip_count = 0
        errors: list[str] = []

        for sym in syms:
            try:
                if gate_hours and iv.upper() != "EOD" and not _gate_by_hours(sym):
                    typer.echo(f"⏭ {sym} {iv}: market closed (gated by hours)")
                    continue

                df = _load_bars_safe(sym, iv, d, debug=debug)
                n = 0 if df is None else len(df)
                typer.echo(f"✔ {sym} {iv}: {n} rader")
                ok_count += 1
                any_success = True
                any_skip_only = False
            except Exception as e:
                msg = f"{sym} {iv}: {e}"
                typer.echo(f"  ⚠ {msg}")
                errors.append(msg)
                err_count += 1
                any_error = True
                any_skip_only = False
            time.sleep(float(sleep_between))

        if err_count > 0 or summarize:
            title = os.getenv("GITHUB_WORKFLOW", "quantkit data sync")
            run_url = _run_url()
            head = f"{title}: interval={iv}, days={d}, tickers={len(syms)}"
            tail = f"ok={ok_count}, errors={err_count}, skipped_closed={skip_count}"
            lines = [f"{head} → {tail}"]
            if err_count > 0:
                for row in errors[:5]:
                    lines.append(f"- {row}")
            if run_url:
                lines.append(run_url)
            _notify("\n".join(lines))

    # Exit-kod:
    # - om vi hade fel => 1
    # - om allt blev skippat pga stängt => 0 (grön bock i Actions)
    # - om vi hade minst en lyckad => 0
    if any_error:
        return 1
    return 0

@app.command("sync", help="Synka data för givna tickers och intervall (EOD, 5m, mfl).")
def sync_cmd(
    tickers: str | None = typer.Option(None, "--tickers", "-t", help="Komma-separerad lista, ex: AAPL.US,ABB.ST"),
    interval: str = typer.Option("EOD,5m", "--interval", "-i", help="Ex: EOD,5m"),
    days: int | None = typer.Option(None, help="Överskriv antal dagar för alla intervall"),
    eod_days: int = typer.Option(9000, help="Days för EOD om --days ej sätts"),
    intra_days: int = typer.Option(10, help="Days för intradag om --days ej sätts"),
    gate_hours: bool = typer.Option(True, "--gate-hours/--no-gate-hours", help="Skippa stängda marknader för intradag"),
    sleep_between: float = typer.Option(0.25, help="Sömn mellan symboler (sek)"),
    debug: bool = typer.Option(False, "--debug", help="Verbose loader"),
):
    code = _run_sync(tickers, interval, days, eod_days, intra_days, gate_hours, sleep_between, debug)
    raise typer.Exit(code)


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    tickers: str | None = typer.Option(None, "--tickers", "-t"),
    interval: str = typer.Option("EOD,5m", "--interval", "-i"),
    days: int | None = typer.Option(None),
    eod_days: int = typer.Option(9000),
    intra_days: int = typer.Option(10),
    gate_hours: bool = typer.Option(True, "--gate-hours/--no-gate-hours"),
    sleep_between: float = typer.Option(0.25),
    debug: bool = typer.Option(False, "--debug"),
):
    if ctx.invoked_subcommand is None:
        code = _run_sync(tickers, interval, days, eod_days, intra_days, gate_hours, sleep_between, debug)
        raise typer.Exit(code)


if __name__ == "__main__":
    app()

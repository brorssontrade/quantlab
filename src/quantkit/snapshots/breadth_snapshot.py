from __future__ import annotations

from pathlib import Path
from typing import Iterable
import pandas as pd
import typer
import yfinance as yf

from ..data.cache import parquet_write

app = typer.Typer(add_completion=False, help="Breadth snapshot CLI")


def _read_tickers(path: str | Path) -> list[str]:
    p = Path(path)
    if not p.is_file():
        # Fallback om fil saknas i CI – behåll litet sample
        return ["AAPL", "MSFT", "NVDA"]
    tickers: list[str] = []
    for raw in p.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        # stöd för komma-separerat
        tickers.extend([t.strip() for t in s.split(",") if t.strip()])
    return tickers


def _latest_change_pct(ticker: str, interval: str) -> float | None:
    """
    Hämta dagsdata för en ticker och beräkna intradags %change som
    (senaste close / dagens första close) - 1. Returnerar None om saknas.
    """
    try:
        if interval in ("1d", "EOD", "eod"):
            # EOD: ta senaste två dagars dagbar – jämför close mot föregående close
            df = yf.download(ticker, period="5d", interval="1d", progress=False, auto_adjust=False)
            if df.empty or len(df) < 2:
                return None
            last = float(df["Close"].iloc[-1])
            prev = float(df["Close"].iloc[-2])
            if prev == 0:
                return None
            return last / prev - 1.0
        else:
            # Intraday: 1d + valt intervall (t.ex. 5m)
            df = yf.download(ticker, period="1d", interval=interval, progress=False, auto_adjust=False)
            if df.empty or df["Close"].dropna().empty:
                return None
            first = float(df["Close"].dropna().iloc[0])
            last = float(df["Close"].dropna().iloc[-1])
            if first == 0:
                return None
            return last / first - 1.0
    except Exception:
        return None


def _classify(pct: float | None, eps: float = 1e-9) -> str:
    if pct is None:
        return "na"
    if pct > eps:
        return "adv"
    if pct < -eps:
        return "dec"
    return "unch"


def _build_breadth(tickers: Iterable[str], *, interval: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows = []
    for t in tickers:
        pct = _latest_change_pct(t, interval=interval)
        state = _classify(pct)
        rows.append({"Symbol": t, "ChangePct": pct if pct is not None else pd.NA, "State": state})

    per_sym = pd.DataFrame(rows)
    now_utc = pd.Timestamp.utcnow().tz_localize("UTC")
    per_sym["Ts"] = now_utc

    adv = int((per_sym["State"] == "adv").sum())
    dec = int((per_sym["State"] == "dec").sum())
    unch = int((per_sym["State"] == "unch").sum())
    valid = int(per_sym["State"].isin(["adv", "dec", "unch"]).sum())

    agg = pd.DataFrame(
        [{
            "ts": now_utc,
            "adv": adv,
            "dec": dec,
            "unch": unch,
            "total": valid,
            "adv_ratio": (adv / valid) if valid else pd.NA,
        }]
    )
    return agg, per_sym


@app.command("build")
def build(
    out_agg: str = typer.Option("storage/snapshots/breadth/latest.parquet", help="Aggregate breadth parquet"),
    out_sym: str = typer.Option("storage/snapshots/breadth/symbols/latest.parquet", help="Per-symbol breadth parquet"),
    tickers_file: str = typer.Option("config/tickers.txt", help="Tickers (en per rad, # = kommentar)"),
    interval: str = typer.Option("5m", help="Intraday intervall (1m/2m/5m/15m/30m/60m) eller '1d' för EOD"),
) -> None:
    """
    Beräkna enkel breadth: adv/dec/unch vs dagens första bar (intraday) eller
    gårdagens close (EOD), och skriv både aggregat + per symbol till parquet.
    """
    tickers = _read_tickers(tickers_file)
    agg, per_sym = _build_breadth(tickers, interval=interval)

    parquet_write(agg, out_agg)
    parquet_write(per_sym, out_sym)

    typer.echo(f"OK breadth → {out_agg} rows={len(agg)}; {out_sym} rows={len(per_sym)}")


if __name__ == "__main__":
    app()

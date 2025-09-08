from __future__ import annotations

import os
import time
import pathlib as p
from typing import List, Dict

import numpy as np
import pandas as pd
import requests
import typer
import yaml

app = typer.Typer(add_completion=False)

# ---------- Helpers ----------

def _load_symbols() -> List[str]:
    """Läs tickers i första hand från config/tickers.txt, annars från ev. watchlist*.yml."""
    tfile = p.Path("config/tickers.txt")
    if tfile.is_file():
        syms = [l.strip() for l in tfile.read_text(encoding="utf-8").splitlines()
                if l.strip() and not l.strip().startswith("#")]
        if syms:
            return syms

    for yml in ("config/settings.yml", "config/watchlist.yml", "watchlist.yml", "watchlist.yaml"):
        yp = p.Path(yml)
        if yp.is_file():
            doc = yaml.safe_load(yp.read_text(encoding="utf-8")) or {}
            items = []
            if isinstance(doc.get("watchlist"), dict):
                items = doc["watchlist"].get("items", []) or []
            elif "items" in doc:
                items = doc["items"] or []
            elif "tickers" in doc:
                items = [{"code": t} if isinstance(t, str) else t for t in doc["tickers"]]

            def code(x):
                if isinstance(x, str): return x
                if isinstance(x, dict): return x.get("code") or x.get("symbol")
                return None

            syms = [code(it) for it in items if code(it)]
            if syms:
                return syms

    raise SystemExit("Hittar inga tickers. Lägg i config/tickers.txt eller watchlist.yml.")

def _exchange_from_symbol(sym: str) -> str:
    """Grov mapping baserat på suffix."""
    if sym.startswith("^"):
        return "US"
    if "." in sym:
        suf = sym.rsplit(".", 1)[-1].upper()
        if suf == "ST":  # Nasdaq Stockholm
            return "SE"
        if suf in {"US", "NYSE", "NASDAQ"}:
            return "US"
        return suf
    return "US"

def _fetch_eod(symbol: str, api_key: str, days_back: int = 420) -> pd.DataFrame:
    """Hämta dagliga EOD-bars från EODHD."""
    url = f"https://eodhd.com/api/eod/{symbol}"
    frm = (pd.Timestamp.utcnow().date() - pd.Timedelta(days=days_back)).isoformat()
    params = {"api_token": api_key, "fmt": "json", "period": "d", "from": frm}
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    js = r.json()
    if not isinstance(js, list) or not js:
        return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])

    df = pd.DataFrame(js)
    # EODHD använder gemener: date, open, high, low, close, adjusted_close, volume
    df = df.rename(columns={"date": "ts"})
    df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    for c in ["open", "high", "low", "close", "volume"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["ts", "close"]).sort_values("ts").reset_index(drop=True)
    return df

def _add_ta(df: pd.DataFrame) -> pd.DataFrame:
    """Lägg till MA20/50/200 samt RSI14."""
    if df.empty:
        for c in ["MA20", "MA50", "MA200", "RSI14"]:
            df[c] = np.nan
        return df

    close = df["close"].astype(float)
    df["MA20"] = close.rolling(20, min_periods=1).mean()
    df["MA50"] = close.rolling(50, min_periods=1).mean()
    df["MA200"] = close.rolling(200, min_periods=1).mean()

    # RSI14 (enkel variant med glidande medel)
    delta = close.diff()
    up = delta.clip(lower=0.0)
    down = -delta.clip(upper=0.0)
    roll_up = up.rolling(14, min_periods=14).mean()
    roll_down = down.rolling(14, min_periods=14).mean()
    rs = roll_up / roll_down.replace(0, np.nan)
    df["RSI14"] = 100.0 - (100.0 / (1.0 + rs))
    return df

def _row_from_series(sym: str, ex: str, df: pd.DataFrame) -> Dict:
    """Bygg symbolrad för senaste handelsdag."""
    if df.empty:
        return {
            "Ts": pd.NaT, "Symbol": sym, "Exchange": ex,
            "Price": np.nan, "ChangePct": np.nan, "State": "None",
            "RSI14": np.nan, "MA20Pct": np.nan, "MA50Pct": np.nan, "MA200Pct": np.nan,
        }
    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else None
    change_pct = float(((last["close"] / prev["close"]) - 1) * 100.0) if prev is not None else np.nan

    def pct_dist(v, ma):
        if pd.isna(ma) or ma == 0: return np.nan
        return float((v - ma) / ma * 100.0)

    row = {
        "Ts": last["ts"],
        "Symbol": sym,
        "Exchange": ex,
        "Price": float(last["close"]),
        "ChangePct": change_pct,
        "State": ("Adv" if change_pct > 0 else ("Dec" if change_pct < 0 else "Unch")) if pd.notna(change_pct) else "None",
        "RSI14": float(last.get("RSI14", np.nan)) if pd.notna(last.get("RSI14", np.nan)) else np.nan,
        "MA20Pct": pct_dist(last["close"], last.get("MA20", np.nan)),
        "MA50Pct": pct_dist(last["close"], last.get("MA50", np.nan)),
        "MA200Pct": pct_dist(last["close"], last.get("MA200", np.nan)),
    }
    return row

def _aggregate(sym_df: pd.DataFrame) -> pd.DataFrame:
    """Aggregat per Exchange."""
    if sym_df.empty:
        return pd.DataFrame(columns=[
            "Ts", "Exchange", "Adv", "Dec", "Unch", "N",
            "PctAdv", "PctDec", "ADLine", "PctAboveMA20", "PctAboveMA50", "PctAboveMA200"
        ])
    g = []
    for ex, part in sym_df.groupby("Exchange"):
        n = len(part)
        adv = int((part["State"] == "Adv").sum())
        dec = int((part["State"] == "Dec").sum())
        unch = int((part["State"] == "Unch").sum())
        pct_adv = (adv / n * 100.0) if n else 0.0
        pct_dec = (dec / n * 100.0) if n else 0.0
        pct_above_ma20 = float((part["MA20Pct"] > 0).mean() * 100.0) if "MA20Pct" in part else np.nan
        pct_above_ma50 = float((part["MA50Pct"] > 0).mean() * 100.0) if "MA50Pct" in part else np.nan
        pct_above_ma200 = float((part["MA200Pct"] > 0).mean() * 100.0) if "MA200Pct" in part else np.nan
        ts = pd.to_datetime(part["Ts"], utc=True, errors="coerce").max()

        g.append({
            "Ts": ts,
            "Exchange": ex,
            "Adv": adv,
            "Dec": dec,
            "Unch": unch,
            "N": n,
            "PctAdv": pct_adv,
            "PctDec": pct_dec,
            "ADLine": adv - dec,
            "PctAboveMA20": pct_above_ma20,
            "PctAboveMA50": pct_above_ma50,
            "PctAboveMA200": pct_above_ma200,
        })
    return pd.DataFrame(g).sort_values(["Ts", "Exchange"]).reset_index(drop=True)

# ---------- CLI ----------

@app.command()
def main(
    interval: str = typer.Option("1d", "--interval", help="1d eller 1m. (1m används mest för symbol-listan; aggregerar på senaste bar.)"),
    out_agg: str = typer.Option("storage/snapshots/breadth/latest.parquet", "--out-agg"),
    out_sym: str = typer.Option("storage/snapshots/breadth/symbols/latest.parquet", "--out-sym"),
):
    """Bygger breadth-snapshots enbart med EODHD."""
    api = os.environ.get("EODHD_API_KEY") or os.environ.get("EODHD_API_TOKEN")
    if not api:
        raise SystemExit("EODHD_API_KEY saknas.")

    syms = _load_symbols()
    rows = []
    for i, sym in enumerate(syms, 1):
        try:
            df = _fetch_eod(sym, api_key=api, days_back=420)
            df = _add_ta(df)
            ex = _exchange_from_symbol(sym)
            rows.append(_row_from_series(sym, ex, df))
            # snäll rate limit
            time.sleep(0.12)
        except Exception as e:
            print(f"⚠ {sym}: {e}", flush=True)

    sym_df = pd.DataFrame(rows)
    agg_df = _aggregate(sym_df)

    def _to_parquet_smart(df, target: str):
        t = str(target)
        if t.startswith("s3://"):
            # Låt pandas/pyarrow + s3fs hantera S3 direkt
            df.to_parquet(t, index=False)
        else:
            out_p = p.Path(t)
            out_p.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(str(out_p), index=False)

    _to_parquet_smart(agg_df, out_agg)
    _to_parquet_smart(sym_df, out_sym)

    print(f"✓ Wrote {len(agg_df)} agg rows -> {out_agg_p}")
    print(f"✓ Wrote {len(sym_df)} symbol rows -> {out_sym_p}")

if __name__ == "__main__":
    app()

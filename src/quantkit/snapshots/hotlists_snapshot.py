# src/quantkit/snapshots/hotlists_snapshot.py
from __future__ import annotations
import os
from pathlib import Path
import typing as T

import pandas as pd
import typer
import yaml

DATA_ROOT = Path("storage")
PARQ_A_DIR = DATA_ROOT / "parquet"
PARQ_B_DIR = DATA_ROOT / "cache" / "eodhd"

S3_BUCKET = os.getenv("S3_BUCKET", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", f"s3://{S3_BUCKET}" if S3_BUCKET else "").rstrip("/")

app = typer.Typer(add_completion=False, help="Build Hot Lists snapshot.")

def _s3_opts() -> dict:
    opts: dict = {}
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    if region:
        opts.setdefault("client_kwargs", {})["region_name"] = region
    if os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"):
        opts["key"] = os.getenv("AWS_ACCESS_KEY_ID")
        opts["secret"] = os.getenv("AWS_SECRET_ACCESS_KEY")
    return opts

def _read_watchlist_codes(path: str = "watchlist.yaml") -> list[str]:
    p = Path(path)
    if not p.exists(): return []
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return []
    items = doc.get("items", []) or doc.get("tickers", [])
    out: list[str] = []
    for it in items:
        code = it if isinstance(it, str) else (it or {}).get("code")
        if code: out.append(str(code).strip())
    return out

def _exchange_for(sym: str) -> str:
    if sym.endswith(".US"): return "US"
    if sym.endswith(".ST"): return "ST"
    return "OTHER"

def _path_candidates_local(symbol: str, interval: str) -> list[Path]:
    return [PARQ_A_DIR / symbol / f"{interval}.parquet",
            PARQ_B_DIR / f"{symbol}__{interval}.parquet"]

def _path_candidates_s3(symbol: str, interval: str) -> list[str]:
    if not S3_PREFIX: return []
    return [f"{S3_PREFIX}/parquet/{symbol}/{interval}.parquet",
            f"{S3_PREFIX}/cache/eodhd/{symbol}__{interval}.parquet"]

def _read_parquet_uri(uri: str) -> pd.DataFrame | None:
    try:
        storage_options = _s3_opts() if uri.startswith("s3://") else None
        df = pd.read_parquet(uri, storage_options=storage_options)
    except Exception:
        return None
    if "ts" in df.columns:
        df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    for c in ("open","high","low","close","volume"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df.sort_values("ts").reset_index(drop=True)

def _read_parquet_if_exists(symbol: str, interval: str) -> pd.DataFrame | None:
    for u in _path_candidates_s3(symbol, interval):
        df = _read_parquet_uri(u)
        if df is not None: return df
    for p in _path_candidates_local(symbol, interval):
        if p.exists():
            df = _read_parquet_uri(str(p))
            if df is not None: return df
    return None

def _pct(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0: return None
    return (a / b - 1.0) * 100.0

def _tz_for(sym: str) -> str:
    ex = _exchange_for(sym)
    return "America/New_York" if ex == "US" else ("Europe/Stockholm" if ex == "ST" else "UTC")

def _session_slice_local(df: pd.DataFrame | None, symbol: str) -> pd.DataFrame:
    if df is None or df.empty or "ts" not in df.columns:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"]).iloc[0:0]
    tz = _tz_for(symbol)
    local = df["ts"].dt.tz_convert(tz)
    last_day = local.dt.date.max()
    return df[local.dt.date == last_day]

def _rise_minutes_pct(intra5: pd.DataFrame | None, minutes: int) -> float | None:
    if intra5 is None or intra5.empty: return None
    last_ts = intra5["ts"].iloc[-1]
    cutoff = last_ts - pd.Timedelta(minutes=minutes)
    prev = intra5.loc[intra5["ts"] <= cutoff, "close"]
    if prev.empty: return None
    ref = float(prev.iloc[-1]); last = float(intra5["close"].iloc[-1])
    return _pct(last, ref)

def _sma(s: pd.Series | None, n: int) -> float | None:
    if s is None: return None
    v = pd.to_numeric(s, errors="coerce").dropna().tail(n)
    if len(v) < n: return None
    return float(v.mean())

def _rsi14(eod: pd.DataFrame | None) -> float | None:
    if eod is None or eod.empty or "close" not in eod.columns: return None
    c = pd.to_numeric(eod["close"], errors="coerce").dropna()
    if len(c) < 15: return None
    diff = c.diff()
    gain = diff.clip(lower=0.0); loss = -diff.clip(upper=0.0)
    avg_gain = gain.rolling(14).mean(); avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    v = rsi.iloc[-1]
    return None if pd.isna(v) else float(v)

def _atr14(eod: pd.DataFrame | None) -> tuple[float | None, float | None]:
    if eod is None or eod.empty or not all(c in eod.columns for c in ("high","low","close")):
        return None, None
    df = eod[["high","low","close"]].dropna().copy()
    if len(df) < 15: return None, None
    prev_close = df["close"].shift(1)
    tr = pd.concat([df["high"]-df["low"], (df["high"]-prev_close).abs(), (df["low"]-prev_close).abs()], axis=1).max(axis=1)
    atr = tr.rolling(14).mean().iloc[-1]
    last_close = df["close"].iloc[-1]
    atrpct = (atr / last_close) * 100.0 if last_close else None
    return float(atr), (None if atrpct is None or pd.isna(atrpct) else float(atrpct))

@app.command()
def build(
    tickers: str | None = typer.Option(None, "--tickers", "-t"),
    out: str | None = typer.Option(None, "--out", help="Målfil för snapshot (parquet). Default snapshots/hotlists/latest.parquet"),
):
    syms = [s.strip() for s in (tickers or "").split(",") if s.strip()] or _read_watchlist_codes()
    if not syms:
        typer.echo("❌ Inga tickers hittade (watchlist.yaml?)")
        raise typer.Exit(1)

    rows: list[dict] = []
    for sym in syms:
        intra = _read_parquet_if_exists(sym, "5m")
        eod   = _read_parquet_if_exists(sym, "EOD")

        last = None
        if intra is not None and "close" in intra.columns and not intra.empty:
            last = float(intra["close"].iloc[-1])
        elif eod is not None and "close" in eod.columns and not eod.empty:
            last = float(eod["close"].iloc[-1])

        tz = _tz_for(sym)
        last_ts_local = None
        if intra is not None and not intra.empty:
            last_ts_local = intra["ts"].iloc[-1].tz_convert(tz).strftime("%Y-%m-%d %H:%M")
        elif eod is not None and not eod.empty:
            last_ts_local = eod["ts"].iloc[-1].tz_convert(tz).strftime("%Y-%m-%d %H:%M")

        prev_close = None
        if eod is not None and "close" in eod.columns and len(eod["close"].dropna()) >= 2:
            prev_close = float(eod["close"].dropna().iloc[-2])

        netchg = None if last is None or prev_close is None else last - prev_close
        netpct = _pct(last, prev_close)

        sess = _session_slice_local(intra, sym)
        day_open = float(sess["open"].iloc[0]) if not sess.empty else None
        day_high = float(sess["high"].max()) if not sess.empty else None
        day_low  = float(sess["low"].min())  if not sess.empty else None
        day_close = last if not sess.empty else None
        vol_tot = float(sess["volume"].sum()) if (not sess.empty and "volume" in sess.columns) else None

        from_open = _pct(last, day_open) if (last is not None and day_open is not None) else None
        range_pct = None; range_pos = None
        if day_high is not None and day_low is not None and day_open is not None and day_high > day_low:
            range_pct = ((day_high - day_low) / day_open) * 100.0
            if last is not None:
                range_pos = ((last - day_low) / (day_high - day_low)) * 100.0

        rise5  = _rise_minutes_pct(intra, 5)
        rise15 = _rise_minutes_pct(intra, 15)
        rise30 = _rise_minutes_pct(intra, 30)
        rise60 = _rise_minutes_pct(intra, 60)

        def _n_days_ret(eod: pd.DataFrame | None, n: int) -> float | None:
            if eod is None or eod.empty or "close" not in eod.columns: return None
            closes = eod["close"].dropna()
            if len(closes) <= n: return None
            last_ = float(closes.iloc[-1]); prev_ = float(closes.iloc[-1 - n])
            return _pct(last_, prev_)

        ret1  = _n_days_ret(eod, 1)
        ret5  = _n_days_ret(eod, 5)
        ret10 = _n_days_ret(eod, 10)
        ret20 = _n_days_ret(eod, 20)
        ret30 = _n_days_ret(eod, 30)
        ret60 = _n_days_ret(eod, 60)

        ma20 = _sma(eod["close"] if eod is not None else None, 20)
        ma50 = _sma(eod["close"] if eod is not None else None, 50)
        ma200 = _sma(eod["close"] if eod is not None else None, 200)
        ma20pct = _pct(last, ma20) if ma20 else None
        ma50pct = _pct(last, ma50) if ma50 else None
        ma200pct = _pct(last, ma200) if ma200 else None
        rsi14 = _rsi14(eod)
        _, atrpct = _atr14(eod)

        rows.append({
            "Symbol": sym,
            "Exchange": _exchange_for(sym),
            "Last": last,
            "LastTs": last_ts_local,
            "NetChg": netchg, "NetPct": netpct,
            "Open": day_open, "High": day_high, "Low": day_low, "Close": day_close,
            "VolTot": vol_tot, "Trades": "-",
            "Rise5mPct": rise5, "Rise15mPct": rise15, "Rise30mPct": rise30, "Rise60mPct": rise60,
            "FromOpenPct": from_open, "RangePct": range_pct, "RangePosPct": range_pos,
            "VolSurgePct": ( (vol_tot / (eod["volume"].dropna().tail(30).mean())) * 100.0
                             if (vol_tot is not None and eod is not None and "volume" in eod.columns and eod["volume"].dropna().tail(30).mean() ) else None),
            "GapPct": (None if eod is None or intra is None else
                       ( (float(_session_slice_local(intra, sym)["open"].iloc[0]) / float(eod["close"].dropna().iloc[-2]) - 1.0) * 100.0
                         if (not _session_slice_local(intra, sym).empty and len(eod["close"].dropna()) >= 2) else None)),
            "Ret1D": ret1, "Ret5D": ret5, "Ret10D": ret10, "Ret20D": ret20, "Ret30D": ret30, "Ret60D": ret60,
            "MA20Pct": ma20pct, "MA50Pct": ma50pct, "MA200Pct": ma200pct,
            "RSI14": rsi14, "ATRpct": atrpct,
        })

    out = out or (f"{S3_PREFIX}/snapshots/hotlists/latest.parquet" if S3_PREFIX else str(DATA_ROOT / "snapshots" / "hotlists" / "latest.parquet"))
    Path(out if not out.startswith("s3://") else DATA_ROOT).parent.mkdir(parents=True, exist_ok=True)
    opts = _s3_opts() if str(out).startswith("s3://") else None
    df = pd.DataFrame(rows)
    df.to_parquet(out, index=False, storage_options=opts)
    typer.echo(f"✅ Wrote {len(df)} rows → {out}")

if __name__ == "__main__":
    app()

# src/quantkit/snapshots/hotlists_snapshot.py
from __future__ import annotations
import os
import sys
from pathlib import Path
from typing import Optional, Tuple, List

import pandas as pd
import yaml
import argparse

DATA_ROOT = Path("storage")
PARQ_A_DIR = DATA_ROOT / "parquet"          # storage/parquet/<SYM>/{5m,EOD}.parquet
PARQ_B_DIR = DATA_ROOT / "cache" / "eodhd"  # storage/cache/eodhd/<SYM>__{5m,EOD}.parquet

S3_BUCKET = os.getenv("S3_BUCKET", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", f"s3://{S3_BUCKET}" if S3_BUCKET else "").rstrip("/")

def _s3_opts() -> dict:
    opts: dict = {}
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    if region:
        opts.setdefault("client_kwargs", {})["region_name"] = region
    if os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"):
        opts["key"] = os.getenv("AWS_ACCESS_KEY_ID")
        opts["secret"] = os.getenv("AWS_SECRET_ACCESS_KEY")
    return opts

def _read_watchlist_codes(path: str = "watchlist.yaml") -> List[str]:
    p = Path(path)
    if not p.exists():
        return []
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return []
    items = doc.get("items", []) or doc.get("tickers", [])
    out: List[str] = []
    for it in items:
        code = it if isinstance(it, str) else (it or {}).get("code")
        if code:
            out.append(str(code).strip())
    return out

def _exchange_for(sym: str) -> str:
    if sym.endswith(".US"): return "US"
    if sym.endswith(".ST"): return "ST"
    return "OTHER"

def _tz_for(sym: str) -> str:
    return "America/New_York" if sym.endswith(".US") else ("Europe/Stockholm" if sym.endswith(".ST") else "UTC")

def _path_candidates_local(symbol: str, interval: str) -> List[Path]:
    return [PARQ_A_DIR / symbol / f"{interval}.parquet",
            PARQ_B_DIR / f"{symbol}__{interval}.parquet"]

def _path_candidates_s3(symbol: str, interval: str) -> List[str]:
    if not S3_PREFIX: return []
    return [f"{S3_PREFIX}/parquet/{symbol}/{interval}.parquet",
            f"{S3_PREFIX}/cache/eodhd/{symbol}__{interval}.parquet"]

def _read_parquet_uri(uri: str) -> Optional[pd.DataFrame]:
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

def _read_parquet_if_exists(symbol: str, interval: str) -> Optional[pd.DataFrame]:
    for uri in _path_candidates_s3(symbol, interval):
        df = _read_parquet_uri(uri)
        if df is not None:
            return df
    for p in _path_candidates_local(symbol, interval):
        if p.exists():
            df = _read_parquet_uri(str(p))
            if df is not None:
                return df
    return None

def _last_safe(series: pd.Series) -> Optional[float]:
    if series is None or series.empty: return None
    v = series.iloc[-1]
    return None if pd.isna(v) else float(v)

def _pct(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or not b: return None
    return (a/b - 1.0) * 100.0

def _session_slice_local(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if df is None or not isinstance(df, pd.DataFrame) or df.empty or "ts" not in df.columns:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"]).iloc[0:0]
    tz = _tz_for(symbol)
    local = df["ts"].dt.tz_convert(tz)
    last_day = local.dt.date.max()
    return df[local.dt.date == last_day]

def _n_days_ret(eod: pd.DataFrame, n: int) -> Optional[float]:
    if eod is None or eod.empty or "close" not in eod.columns: return None
    closes = pd.to_numeric(eod["close"], errors="coerce").dropna()
    if len(closes) <= n: return None
    return _pct(float(closes.iloc[-1]), float(closes.iloc[-1 - n]))

def _rise_minutes_pct(intra5: pd.DataFrame, minutes: int) -> Optional[float]:
    if intra5 is None or intra5.empty: return None
    last_ts = intra5["ts"].iloc[-1]
    cutoff = last_ts - pd.Timedelta(minutes=minutes)
    prev = intra5.loc[intra5["ts"] <= cutoff, "close"]
    if prev.empty: return None
    return _pct(float(intra5["close"].iloc[-1]), float(prev.iloc[-1]))

def _gap_pct(symbol: str, intra5: pd.DataFrame, eod: pd.DataFrame) -> Optional[float]:
    if eod is None or eod.empty or intra5 is None or intra5.empty: return None
    eodc = pd.to_numeric(eod["close"], errors="coerce").dropna()
    if len(eodc) < 2: return None
    prev_close = float(eodc.iloc[-2])
    sess = _session_slice_local(intra5, symbol)
    if sess.empty or "open" not in sess.columns: return None
    day_open = float(sess["open"].iloc[0])
    return _pct(day_open, prev_close)

def _sma(series: pd.Series, n: int) -> Optional[float]:
    if series is None: return None
    s = pd.to_numeric(series, errors="coerce").dropna().tail(n)
    if len(s) < n: return None
    return float(s.mean())

def _rsi14(eod: pd.DataFrame) -> Optional[float]:
    if eod is None or eod.empty or "close" not in eod.columns: return None
    c = pd.to_numeric(eod["close"], errors="coerce").dropna()
    if len(c) < 15: return None
    diff = c.diff()
    gain = diff.clip(lower=0.0)
    loss = -diff.clip(upper=0.0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    val = rsi.iloc[-1]
    return None if pd.isna(val) else float(val)

def _atr14(eod: pd.DataFrame) -> Tuple[Optional[float], Optional[float]]:
    cols_ok = all(c in (eod.columns if eod is not None else []) for c in ("high", "low", "close"))
    if not cols_ok: return None, None
    df = eod[["high", "low", "close"]].dropna().copy()
    if len(df) < 15: return None, None
    prev_close = df["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(14).mean().iloc[-1]
    last_close = df["close"].iloc[-1]
    atrpct = (atr / last_close) * 100.0 if last_close else None
    return float(atr), (None if atrpct is None or pd.isna(atrpct) else float(atrpct))

def build(out_uri: str) -> int:
    syms = _read_watchlist_codes()
    if not syms:
        print("❌ watchlist.yaml saknas eller tom", file=sys.stderr)
        return 1

    rows = []
    for symbol in syms:
        intra = _read_parquet_if_exists(symbol, "5m")
        eod   = _read_parquet_if_exists(symbol, "EOD")

        last = _last_safe(intra["close"]) if isinstance(intra, pd.DataFrame) and "close" in intra else None
        if last is None:
            last = _last_safe(eod["close"]) if isinstance(eod, pd.DataFrame) and "close" in eod else None

        tz = _tz_for(symbol)
        last_ts_local = None
        if isinstance(intra, pd.DataFrame) and not intra.empty:
            last_ts_local = intra["ts"].iloc[-1].tz_convert(tz).strftime("%Y-%m-%d %H:%M")
        elif isinstance(eod, pd.DataFrame) and not eod.empty:
            last_ts_local = eod["ts"].iloc[-1].tz_convert(tz).strftime("%Y-%m-%d %H:%M")

        sess = _session_slice_local(intra, symbol) if isinstance(intra, pd.DataFrame) else None
        day_open = _last_safe(sess["open"]) if isinstance(sess, pd.DataFrame) and not sess.empty else None
        day_high = None if sess is None or sess.empty else float(sess["high"].max())
        day_low  = None if sess is None or sess.empty else float(sess["low"].min())
        day_close = last if sess is not None and not sess.empty else None
        vol_tot = None if sess is None or sess.empty or "volume" not in sess.columns else float(sess["volume"].sum())

        prev_close = None
        if isinstance(eod, pd.DataFrame) and not eod.empty and "close" in eod.columns and len(eod["close"].dropna()) >= 2:
            prev_close = float(eod["close"].dropna().iloc[-2])
        netchg = None if last is None or prev_close is None else last - prev_close
        netpct = _pct(last, prev_close)

        rise5  = _rise_minutes_pct(intra, 5)
        rise15 = _rise_minutes_pct(intra, 15)
        rise30 = _rise_minutes_pct(intra, 30)
        rise60 = _rise_minutes_pct(intra, 60)

        from_open = _pct(last, day_open) if (last is not None and day_open is not None) else None
        range_pct = None
        range_pos = None
        if day_high is not None and day_low is not None and day_open is not None and day_high > day_low:
            range_pct = ((day_high - day_low) / day_open) * 100.0
            if last is not None:
                range_pos = ((last - day_low) / (day_high - day_low)) * 100.0

        vol_surge = None
        if vol_tot is not None and isinstance(eod, pd.DataFrame) and "volume" in eod.columns:
            avg30 = pd.to_numeric(eod["volume"], errors="coerce").dropna().tail(30).mean()
            if avg30 and avg30 > 0:
                vol_surge = (vol_tot / avg30) * 100.0

        ret1  = _n_days_ret(eod, 1)
        ret5  = _n_days_ret(eod, 5)
        ret10 = _n_days_ret(eod, 10)
        ret20 = _n_days_ret(eod, 20)
        ret30 = _n_days_ret(eod, 30)
        ret60 = _n_days_ret(eod, 60)

        gap = _gap_pct(symbol, intra, eod)
        ma20 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 20)
        ma50 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 50)
        ma200 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 200)
        ma20pct = _pct(last, ma20) if ma20 else None
        ma50pct = _pct(last, ma50) if ma50 else None
        ma200pct = _pct(last, ma200) if ma200 else None
        rsi14 = _rsi14(eod)
        _, atrpct = _atr14(eod)

        rows.append({
            "Symbol": symbol,
            "Exchange": _exchange_for(symbol),
            "Last": last,
            "LastTs": last_ts_local,

            "NetChg": netchg,
            "NetPct": netpct,

            "Open": day_open, "High": day_high, "Low": day_low, "Close": day_close,
            "VolTot": vol_tot, "Trades": "-",

            "Rise5mPct": rise5, "Rise15mPct": rise15, "Rise30mPct": rise30, "Rise60mPct": rise60,
            "FromOpenPct": from_open, "RangePct": range_pct, "RangePosPct": range_pos, "VolSurgePct": vol_surge,

            "GapPct": gap,

            "Ret1D": ret1, "Ret5D": ret5, "Ret10D": ret10, "Ret20D": ret20, "Ret30D": ret30, "Ret60D": ret60,

            "MA20Pct": ma20pct, "MA50Pct": ma50pct, "MA200Pct": ma200pct,
            "RSI14": rsi14, "ATRpct": atrpct,
        })

    out = out_uri
    storage_opts = _s3_opts() if out.startswith("s3://") else None
    if not out.startswith("s3://"):
        Path(out).parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    df.to_parquet(out, index=False, storage_options=storage_opts)
    print(f"✅ hotlists snapshot written: {out}")
    return 0

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build Hot Lists snapshot")
    ap.add_argument("--out", required=True, help="Parquet URI (s3:// or local path)")
    args = ap.parse_args(argv)
    return build(args.out)

if __name__ == "__main__":
    raise SystemExit(main())

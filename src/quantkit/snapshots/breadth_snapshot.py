# src/quantkit/snapshots/breadth_snapshot.py
from __future__ import annotations
import os
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List

import pandas as pd
import yaml

DATA_ROOT = Path("storage")
PARQ_A = DATA_ROOT / "parquet"          # storage/parquet/<SYM>/{5m,EOD}.parquet
PARQ_B = DATA_ROOT / "cache" / "eodhd"  # storage/cache/eodhd/<SYM>__{5m,EOD}.parquet

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

def _read_watchlist_codes(path: str = "watchlist.yaml") -> list[str]:
    p = Path(path)
    if not p.exists():
        return []
    doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    items = doc.get("items", []) or doc.get("tickers", [])
    out: list[str] = []
    for it in items:
        code = it if isinstance(it, str) else (it or {}).get("code")
        if code:
            out.append(str(code).strip())
    return out

def _ex(sym: str) -> str:
    if sym.endswith(".US"): return "US"
    if sym.endswith(".ST"): return "ST"
    return "OTHER"

def _paths_local(symbol: str, interval: str) -> list[Path]:
    return [PARQ_A / symbol / f"{interval}.parquet", PARQ_B / f"{symbol}__{interval}.parquet"]

def _paths_s3(symbol: str, interval: str) -> list[str]:
    if not S3_PREFIX: return []
    return [
        f"{S3_PREFIX}/parquet/{symbol}/{interval}.parquet",
        f"{S3_PREFIX}/cache/eodhd/{symbol}__{interval}.parquet",
    ]

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

def _read(symbol: str, interval: str) -> Optional[pd.DataFrame]:
    for u in _paths_s3(symbol, interval):
        df = _read_parquet_uri(u)
        if df is not None: return df
    for p in _paths_local(symbol, interval):
        if p.exists():
            df = _read_parquet_uri(str(p))
            if df is not None: return df
    return None

def _last_safe(s: Optional[pd.Series]) -> Optional[float]:
    if s is None or s.empty: return None
    v = s.iloc[-1]
    return None if pd.isna(v) else float(v)

def _pct(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or not b: return None
    return (a/b - 1.0) * 100.0

def _session(intra: Optional[pd.DataFrame]) -> pd.DataFrame:
    if intra is None or intra.empty or "ts" not in intra.columns:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"]).iloc[0:0]
    last_day = intra["ts"].dt.tz_convert("UTC").dt.date.max()
    local = intra["ts"].dt.date
    return intra[local == last_day]

def _rise(intra: Optional[pd.DataFrame], mins: int) -> Optional[float]:
    if intra is None or intra.empty: return None
    last_ts = intra["ts"].iloc[-1]
    cutoff = last_ts - pd.Timedelta(minutes=mins)
    prev = intra.loc[intra["ts"] <= cutoff, "close"]
    if prev.empty: return None
    return _pct(float(intra["close"].iloc[-1]), float(prev.iloc[-1]))

def _sma(series: Optional[pd.Series], n: int) -> Optional[float]:
    if series is None: return None
    s = pd.to_numeric(series, errors="coerce").dropna().tail(n)
    if len(s) < n: return None
    return float(s.mean())

def _rsi14(eod: Optional[pd.DataFrame]) -> Optional[float]:
    if eod is None or eod.empty or "close" not in eod.columns: return None
    c = pd.to_numeric(eod["close"], errors="coerce").dropna()
    if len(c) < 15: return None
    d = c.diff()
    gain = d.clip(lower=0.0); loss = -d.clip(upper=0.0)
    ag = gain.rolling(14).mean(); al = loss.rolling(14).mean()
    rs = ag / al.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    v = rsi.iloc[-1]
    return None if pd.isna(v) else float(v)

def _atr14(eod: Optional[pd.DataFrame]) -> Tuple[Optional[float], Optional[float]]:
    if eod is None: return None, None
    if not all(c in eod.columns for c in ("high","low","close")): return None, None
    df = eod[["high","low","close"]].dropna().copy()
    if len(df) < 15: return None, None
    pc = df["close"].shift(1)
    tr = pd.concat([df["high"]-df["low"], (df["high"]-pc).abs(), (df["low"]-pc).abs()], axis=1).max(axis=1)
    atr = tr.rolling(14).mean().iloc[-1]
    lc = df["close"].iloc[-1]
    atrpct = (atr / lc) * 100.0 if lc else None
    return float(atr), (None if atrpct is None or pd.isna(atrpct) else float(atrpct))

def _new_high_low_flags(eod: Optional[pd.DataFrame], lookback: int, use_high_low: bool = True) -> Tuple[bool, bool]:
    """Return (is_new_high, is_new_low) over 'lookback' using EOD data."""
    if eod is None or eod.empty: return False, False
    cols = ["close"]
    if use_high_low and all(c in eod.columns for c in ("high","low")):
        # strängare: nya max/min räknat på H/L
        hi_series = eod["high"].dropna()
        lo_series = eod["low"].dropna()
        if len(hi_series) < lookback+1 or len(lo_series) < lookback+1:
            return False, False
        last_hi = float(hi_series.iloc[-1]); last_lo = float(lo_series.iloc[-1])
        prev_hi = float(hi_series.iloc[-(lookback+1):-1].max())
        prev_lo = float(lo_series.iloc[-(lookback+1):-1].min())
        return last_hi >= prev_hi, last_lo <= prev_lo
    else:
        c = eod["close"].dropna()
        if len(c) < lookback+1: return False, False
        last = float(c.iloc[-1])
        prev_max = float(c.iloc[-(lookback+1):-1].max())
        prev_min = float(c.iloc[-(lookback+1):-1].min())
        return last >= prev_max, last <= prev_min

def _row_for_symbol(sym: str) -> Dict[str, Any]:
    intra = _read(sym, "5m")
    eod = _read(sym, "EOD")

    last = _last_safe(intra["close"]) if isinstance(intra, pd.DataFrame) and "close" in intra.columns else None
    if last is None:
        last = _last_safe(eod["close"] if isinstance(eod, pd.DataFrame) and "close" in (eod.columns if eod is not None else []) else None)

    prev_close = None
    if isinstance(eod, pd.DataFrame) and "close" in (eod.columns if eod is not None else []) and len(eod["close"].dropna()) >= 2:
        prev_close = float(eod["close"].dropna().iloc[-2])

    chg = None if last is None or prev_close is None else last - prev_close
    chg_pct = _pct(last, prev_close)

    sess = _session(intra)
    sess_vol = float(sess["volume"].sum()) if ("volume" in sess.columns and not sess.empty) else None

    rise5  = _rise(intra, 5)
    rise15 = _rise(intra, 15)

    close_series = eod["close"] if isinstance(eod, pd.DataFrame) and "close" in (eod.columns if eod is not None else []) else None
    ma20 = _sma(close_series, 20); ma50 = _sma(close_series, 50); ma200 = _sma(close_series, 200)
    above20 = (last is not None and ma20 is not None and last >= ma20)
    above50 = (last is not None and ma50 is not None and last >= ma50)
    above200 = (last is not None and ma200 is not None and last >= ma200)

    rsi14 = _rsi14(eod)
    _, atrpct = _atr14(eod)

    nh20, nl20 = _new_high_low_flags(eod, 20, use_high_low=True)
    nh50, nl50 = _new_high_low_flags(eod, 50, use_high_low=True)
    nh52w, nl52w = _new_high_low_flags(eod, 252, use_high_low=True)

    gap_pct = None
    if prev_close is not None and sess is not None and not sess.empty and "open" in sess.columns:
        gap_pct = _pct(float(sess["open"].iloc[0]), prev_close)

    return {
        "Symbol": sym, "Exchange": _ex(sym),
        "Last": last, "PrevClose": prev_close, "ChgPct": chg_pct,
        "SessVol": sess_vol, "Rise5mPct": rise5, "Rise15mPct": rise15,
        "AboveMA20": above20, "AboveMA50": above50, "AboveMA200": above200,
        "RSI14": rsi14, "ATRpct": atrpct,
        "NewHigh20": nh20, "NewLow20": nl20,
        "NewHigh50": nh50, "NewLow50": nl50,
        "NewHigh52w": nh52w, "NewLow52w": nl52w,
        "GapUp": (gap_pct is not None and gap_pct > 0),
        "GapDown": (gap_pct is not None and gap_pct < 0),
        "Rise5mUp": (rise5 is not None and rise5 > 0),
        "Rise15mUp": (rise15 is not None and rise15 > 0),
    }

def _agg_group(df: pd.DataFrame, name: str) -> Dict[str, Any]:
    # boolean -> count True
    def bsum(s: pd.Series) -> float:
        s = s.fillna(False).astype(bool)
        return int(s.sum())

    tickers = len(df)
    adv = int((df["ChgPct"] > 0).sum())
    dec = int((df["ChgPct"] < 0).sum())
    unch = tickers - adv - dec

    up_vol = float(df.loc[df["ChgPct"] > 0, "SessVol"].dropna().sum())
    dn_vol = float(df.loc[df["ChgPct"] < 0, "SessVol"].dropna().sum())
    tot_vol = up_vol + dn_vol if (up_vol or dn_vol) else None

    def pct(n: Optional[float], d: Optional[float]) -> Optional[float]:
        if not n or not d: return None
        return (n / d) * 100.0

    out = {
        "Group": name,
        "Tickers": tickers,
        "Adv": adv, "Dec": dec, "Unch": unch,
        "AdvPct": pct(adv, tickers), "DecPct": pct(dec, tickers),

        "UpVol": up_vol if up_vol else None,
        "DownVol": dn_vol if dn_vol else None,
        "UpVolPct": pct(up_vol, tot_vol),

        "PctAboveMA20": pct(bsum(df["AboveMA20"]), tickers),
        "PctAboveMA50": pct(bsum(df["AboveMA50"]), tickers),
        "PctAboveMA200": pct(bsum(df["AboveMA200"]), tickers),

        "MedianRSI14": float(df["RSI14"].dropna().median()) if df["RSI14"].notna().any() else None,
        "MedianATRpct": float(df["ATRpct"].dropna().median()) if df["ATRpct"].notna().any() else None,

        "NewHigh20": bsum(df["NewHigh20"]), "NewLow20": bsum(df["NewLow20"]),
        "NewHigh50": bsum(df["NewHigh50"]), "NewLow50": bsum(df["NewLow50"]),
        "NewHigh52w": bsum(df["NewHigh52w"]), "NewLow52w": bsum(df["NewLow52w"]),

        "GapUpPct": pct(bsum(df["GapUp"]), tickers),
        "GapDownPct": pct(bsum(df["GapDown"]), tickers),

        "Rise5mPctBreadth": pct(bsum(df["Rise5mUp"]), tickers),
        "Rise15mPctBreadth": pct(bsum(df["Rise15mUp"]), tickers),
    }
    return out

def build_breadth(symbols: List[str]) -> pd.DataFrame:
    rows = [_row_for_symbol(s) for s in symbols]
    raw = pd.DataFrame(rows)
    if raw.empty:
        return pd.DataFrame(columns=["Group"])
    groups = {
        "ALL": raw,
        "US": raw[raw["Exchange"] == "US"],
        "ST": raw[raw["Exchange"] == "ST"],
    }
    aggs = []
    for name, gdf in groups.items():
        if len(gdf) == 0:
            continue
        aggs.append(_agg_group(gdf, name))
    out = pd.DataFrame(aggs)
    out["GeneratedAtUTC"] = pd.Timestamp.utcnow()
    return out

def main(out: Optional[str] = None):
    syms = _read_watchlist_codes()
    if not syms:
        raise SystemExit("No tickers in watchlist.yaml")
    df = build_breadth(syms)

    local_out = DATA_ROOT / "snapshots" / "breadth" / "latest.parquet"
    local_out.parent.mkdir(parents=True, exist_ok=True)
    target = out or str(local_out)

    storage_options = _s3_opts() if str(target).startswith("s3://") else None
    df.to_parquet(target, index=False, storage_options=storage_options)

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=str, default=None, help="Local path or s3://…")
    args = ap.parse_args()
    main(args.out)

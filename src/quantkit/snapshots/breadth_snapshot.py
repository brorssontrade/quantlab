# src/quantkit/snapshots/breadth_snapshot.py
from __future__ import annotations
import os
import sys
from pathlib import Path
import argparse
from typing import Optional, Tuple, List

import pandas as pd
import yaml

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

def _path_candidates_local(symbol: str, interval: str) -> List[Path]:
    return [PARQ_A_DIR / symbol / f"{interval}.parquet",
            PARQ_B_DIR / f"{symbol}__{interval}.parquet"]

def _path_candidates_s3(symbol: str, interval: str) -> List[str]:
    if not S3_PREFIX:
        return []
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

def _pct(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return (a/b - 1.0) * 100.0

def _last_close(intra: Optional[pd.DataFrame], eod: Optional[pd.DataFrame]) -> Optional[float]:
    if isinstance(intra, pd.DataFrame) and "close" in intra.columns and not intra.empty:
        v = intra["close"].iloc[-1]
        return None if pd.isna(v) else float(v)
    if isinstance(eod, pd.DataFrame) and "close" in eod.columns and not eod.empty:
        v = eod["close"].iloc[-1]
        return None if pd.isna(v) else float(v)
    return None

def _prev_close(eod: Optional[pd.DataFrame]) -> Optional[float]:
    if eod is None or eod.empty or "close" not in eod.columns:
        return None
    c = eod["close"].dropna()
    if len(c) < 2:
        return None
    return float(c.iloc[-2])

def _hi_lo_52w(eod: Optional[pd.DataFrame]) -> Tuple[Optional[float], Optional[float]]:
    if eod is None or eod.empty or "close" not in eod.columns:
        return None, None
    tail = pd.to_numeric(eod["close"], errors="coerce").dropna().tail(252)
    if tail.empty:
        return None, None
    return float(tail.max()), float(tail.min())

def build(out_sym: str, out_agg: str) -> int:
    codes = _read_watchlist_codes()
    if not codes:
        print("❌ watchlist.yaml saknas eller tom", file=sys.stderr)
        return 1

    rows = []
    for sym in codes:
        intra = _read_parquet_if_exists(sym, "5m")
        eod   = _read_parquet_if_exists(sym, "EOD")
        last  = _last_close(intra, eod)
        prev  = _prev_close(eod)
        chg   = _pct(last, prev)
        hi52, lo52 = _hi_lo_52w(eod)
        new_hi = (last is not None and hi52 is not None and last >= hi52)
        new_lo = (last is not None and lo52 is not None and last <= lo52)

        rows.append({
            "Symbol": sym,
            "Exchange": _exchange_for(sym),
            "Last": last,
            "PrevClose": prev,
            "Pct": chg,
            "NewHigh52w": bool(new_hi),
            "NewLow52w": bool(new_lo),
        })

    by_symbol = pd.DataFrame(rows)
    storage_opts = _s3_opts() if out_sym.startswith("s3://") else None
    Path(out_sym).parent.mkdir(parents=True, exist_ok=True) if not out_sym.startswith("s3://") else None
    by_symbol.to_parquet(out_sym, index=False, storage_options=storage_opts)

    # aggregate
    def _agg(df: pd.DataFrame) -> dict:
        p = pd.to_numeric(df["Pct"], errors="coerce")
        adv = int((p > 0).sum()); dec = int((p < 0).sum())
        total = len(df); unch = max(total - adv - dec, 0)
        adr = (adv / max(dec, 1)) if (adv or dec) else None
        nh = int(df["NewHigh52w"].sum()); nl = int(df["NewLow52w"].sum())
        return {"Adv": adv, "Dec": dec, "Unch": unch, "Total": total, "ADR": adr, "NewHighs": nh, "NewLows": nl}

    agg_all = _agg(by_symbol)
    agg_rows = [{"Scope": "ALL", **agg_all}]
    for ex, g in by_symbol.groupby("Exchange"):
        agg_rows.append({"Scope": f"EX:{ex}", **_agg(g)})

    agg_df = pd.DataFrame(agg_rows)
    storage_opts2 = _s3_opts() if out_agg.startswith("s3://") else None
    Path(out_agg).parent.mkdir(parents=True, exist_ok=True) if not out_agg.startswith("s3://") else None
    agg_df.to_parquet(out_agg, index=False, storage_options=storage_opts2)

    print(f"✅ breadth snapshots written:\n - {out_sym}\n - {out_agg}")
    return 0

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="breadth_snapshot", description="Build breadth snapshots")
    sub = parser.add_subparsers(dest="cmd")

    p = sub.add_parser("build")
    p.add_argument("--out-sym", required=True, help="by_symbol parquet URI (s3:// or local path)")
    p.add_argument("--out-agg", required=True, help="agg parquet URI (s3:// or local path)")

    # allow calling without subcommand (compat)
    parser.add_argument("--out-sym", help=argparse.SUPPRESS)
    parser.add_argument("--out-agg", help=argparse.SUPPRESS)

    args = parser.parse_args(argv)

    if args.cmd == "build" or (args.out_sym and args.out_agg):
        return build(args.out_sym, args.out_agg)

    parser.print_help()
    return 2

if __name__ == "__main__":
    raise SystemExit(main())

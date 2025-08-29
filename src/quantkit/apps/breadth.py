# src/quantkit/apps/breadth.py
from __future__ import annotations
import os
from pathlib import Path
from typing import Optional, Tuple

import pandas as pd
import streamlit as st
import yaml

TITLE = "📊 Breadth"

DATA_ROOT = Path("storage")
PARQ_A_DIR = DATA_ROOT / "parquet"          # storage/parquet/<SYM>/{5m,EOD}.parquet
PARQ_B_DIR = DATA_ROOT / "cache" / "eodhd"  # storage/cache/eodhd/<SYM>__{5m,EOD}.parquet

S3_BUCKET = os.getenv("S3_BUCKET", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", f"s3://{S3_BUCKET}" if S3_BUCKET else "").rstrip("/")

def _s3_opts() -> dict:
    opts: dict = {}
    region = os.getenv("AWS_REGION")
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
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return []
    items = doc.get("items", []) or doc.get("tickers", [])
    out = []
    for it in items:
        code = it if isinstance(it, str) else (it or {}).get("code")
        if code:
            out.append(str(code).strip())
    return out

def _exchange_for(sym: str) -> str:
    if sym.endswith(".US"): return "US"
    if sym.endswith(".ST"): return "ST"
    return "OTHER"

def _path_candidates_local(symbol: str, interval: str) -> list[Path]:
    return [PARQ_A_DIR / symbol / f"{interval}.parquet",
            PARQ_B_DIR / f"{symbol}__{interval}.parquet"]

def _path_candidates_s3(symbol: str, interval: str) -> list[str]:
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

# ---------------- UI ----------------

st.set_page_config(page_title="Breadth", layout="wide")
st.title(TITLE)
src_label = "S3 (EOD/5m)" if S3_PREFIX else "lokala Parquet (EOD/5m)"
st.caption(f"Datakälla: {src_label} uppdaterade via GitHub Actions eller lokala körningar.")

codes = _read_watchlist_codes()
if not codes:
    st.warning("Ingen `watchlist.yaml` hittad – lägg in dina tickers först.")
    st.stop()

ex_filter = st.sidebar.selectbox("Exchange", ["ALL","US","ST"], index=0)
if ex_filter != "ALL":
    codes = [c for c in codes if _exchange_for(c) == ex_filter]

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
        "New52wHigh": bool(new_hi),
        "New52wLow": bool(new_lo),
    })

df = pd.DataFrame(rows)
if df.empty:
    st.info("Inget att visa.")
    st.stop()

# Breadth-aggregat
def _agg(group: pd.DataFrame) -> dict:
    adv = (pd.to_numeric(group["Pct"], errors="coerce") > 0).sum()
    dec = (pd.to_numeric(group["Pct"], errors="coerce") < 0).sum()
    unch = (pd.to_numeric(group["Pct"], errors="coerce") == 0).sum()
    total = len(group)
    adr = (adv / max(dec,1)) if (adv or dec) else None
    nh  = group["New52wHigh"].sum()
    nl  = group["New52wLow"].sum()
    return {"Adv": adv, "Dec": dec, "Unch": unch, "Total": total, "ADR": adr, "NewHighs": nh, "NewLows": nl}

agg_all = _agg(df)
left, mid, right, right2 = st.columns(4)
left.metric("Advancers", agg_all["Adv"])
mid.metric("Decliners", agg_all["Dec"])
right.metric("A/D-ratio", f"{agg_all['ADR']:.2f}" if agg_all["ADR"] else "–")
right2.metric("New Highs / Lows", f"{agg_all['NewHighs']} / {agg_all['NewLows']}")

# Per-exchange staplar
ex_breadth = df.groupby("Exchange").apply(lambda g: pd.Series(_agg(g))).reset_index()
st.subheader("Breadth per exchange")
st.dataframe(ex_breadth, use_container_width=True)

# Leaders / Laggards
st.subheader("Leaders / Laggards (i % idag)")
pct_series = pd.to_numeric(df["Pct"], errors="coerce")
leaders = df.assign(Pct=pct_series).sort_values("Pct", ascending=False).dropna(subset=["Pct"]).head(15)
laggards = df.assign(Pct=pct_series).sort_values("Pct", ascending=True ).dropna(subset=["Pct"]).head(15)
c1, c2 = st.columns(2)
with c1:
    st.write("**Leaders**")
    st.dataframe(leaders[["Symbol","Exchange","Pct","Last"]].style.format({"Pct": "{:+.2f}%","Last": "{:,.2f}"}), use_container_width=True)
with c2:
    st.write("**Laggards**")
    st.dataframe(laggards[["Symbol","Exchange","Pct","Last"]].style.format({"Pct": "{:+.2f}%","Last": "{:,.2f}"}), use_container_width=True)

st.caption("A/D och new highs/lows baseras på dagens förändring mot gårdagens stängning (EOD) och senaste intradagstik.")

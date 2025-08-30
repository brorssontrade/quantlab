# src/quantkit/apps/breadth.py
from __future__ import annotations
import os
from pathlib import Path
from typing import Optional, Tuple, List

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

# ---------- UI ----------
st.set_page_config(page_title="Breadth", layout="wide")
st.title(TITLE)
src_label = "S3 snapshots" if S3_PREFIX else "lokala snapshots"
st.caption(f"Primärt läses snapshot. Om saknas → fallback till Parquet per symbol.")

st.sidebar.subheader("Uppdatering")
every = st.sidebar.number_input("Auto-refresh (sek)", min_value=0, max_value=600, value=30, step=5)
if every:
    st.autorefresh(interval=int(every) * 1000, key="breadth_autorefresh")

ex_filter = st.sidebar.selectbox("Exchange", ["ALL","US","ST"], index=0)

# ---- Snapshot-first ----
def _cand_by_symbol() -> List[str]:
    c = []
    if S3_PREFIX:
        c.append(f"{S3_PREFIX}/snapshots/breadth/by_symbol.parquet")
    c.append(str(DATA_ROOT / "snapshots" / "breadth" / "by_symbol.parquet"))
    return c

def _cand_agg() -> List[str]:
    c = []
    if S3_PREFIX:
        c.append(f"{S3_PREFIX}/snapshots/breadth/agg.parquet")
    c.append(str(DATA_ROOT / "snapshots" / "breadth" / "agg.parquet"))
    return c

@st.cache_data(ttl=30, show_spinner=False)
def _load_snapshot_first() -> tuple[Optional[pd.DataFrame], Optional[pd.DataFrame]]:
    by_sym = None
    for u in _cand_by_symbol():
        try:
            by_sym = pd.read_parquet(u, storage_options=_s3_opts() if u.startswith("s3://") else None)
            break
        except Exception:
            pass
    agg = None
    for u in _cand_agg():
        try:
            agg = pd.read_parquet(u, storage_options=_s3_opts() if u.startswith("s3://") else None)
            break
        except Exception:
            pass
    return by_sym, agg

by_symbol_df, agg_df = _load_snapshot_first()
if by_symbol_df is not None and not by_symbol_df.empty:
    df = by_symbol_df.copy()
    if ex_filter != "ALL":
        df = df[df["Exchange"] == ex_filter]

    codes = df["Symbol"].tolist()
    pick = st.sidebar.multiselect("Tickers (valfritt)", options=codes, default=[])
    if pick:
        df = df[df["Symbol"].isin(pick)]

    # aggregate on the fly if agg snapshot missing or filtered
    def _agg(group: pd.DataFrame) -> dict:
        p = pd.to_numeric(group["Pct"], errors="coerce")
        adv = int((p > 0).sum()); dec = int((p < 0).sum())
        total = len(group); unch = max(total - adv - dec, 0)
        adr = (adv / max(dec,1)) if (adv or dec) else None
        nh = int(group.get("NewHigh52w", False).astype(bool).sum())
        nl = int(group.get("NewLow52w", False).astype(bool).sum())
        return {"Adv": adv, "Dec": dec, "Unch": unch, "Total": total, "ADR": adr, "NewHighs": nh, "NewLows": nl}

    agg_view = _agg(df)
    left, mid, right, right2 = st.columns(4)
    left.metric("Advancers", agg_view["Adv"])
    mid.metric("Decliners", agg_view["Dec"])
    right.metric("A/D-ratio", f"{agg_view['ADR']:.2f}" if agg_view["ADR"] else "–")
    right2.metric("New Highs / Lows", f"{agg_view['NewHighs']} / {agg_view['NewLows']}")

    ex_breadth = df.groupby("Exchange").apply(lambda g: pd.Series(_agg(g))).reset_index()
    st.subheader("Breadth per exchange")
    st.dataframe(ex_breadth, use_container_width=True)

    st.subheader("Leaders / Laggards (i % idag)")
    pct_series = pd.to_numeric(df["Pct"], errors="coerce")
    leaders  = df.assign(Pct=pct_series).sort_values("Pct", ascending=False).dropna(subset=["Pct"]).head(15)
    laggards = df.assign(Pct=pct_series).sort_values("Pct", ascending=True ).dropna(subset=["Pct"]).head(15)
    c1, c2 = st.columns(2)
    with c1:
        st.write("**Leaders**")
        st.dataframe(leaders[["Symbol","Exchange","Pct","Last"]].style.format({"Pct": "{:+.2f}%","Last": "{:,.2f}"}), use_container_width=True)
    with c2:
        st.write("**Laggards**")
        st.dataframe(laggards[["Symbol","Exchange","Pct","Last"]].style.format({"Pct": "{:+.2f}%","Last": "{:,.2f}"}), use_container_width=True)

    st.caption("Källa: breadth-snapshots (by_symbol/agg).")
    st.stop()

# ---- Fallback (långsammare) ----
st.warning("Ingen breadth-snapshot hittad – visar fallback (kan vara långsamt).")

@st.cache_data(ttl=60, show_spinner=True)
def _compute_rows(symbols: List[str]) -> pd.DataFrame:
    rows = []
    for sym in symbols:
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
    return pd.DataFrame(rows)

codes = _read_watchlist_codes()
if not codes:
    st.warning("Ingen `watchlist.yaml` hittad – lägg in dina tickers först.")
    st.stop()
if ex_filter != "ALL":
    codes = [c for c in codes if _exchange_for(c) == ex_filter]

pick = st.sidebar.multiselect("Tickers (valfritt)", options=codes, default=[])
if pick:
    codes = pick

df = _compute_rows(codes)
if df.empty:
    st.info("Inget att visa.")
    st.stop()

def _agg(group: pd.DataFrame) -> dict:
    p = pd.to_numeric(group["Pct"], errors="coerce")
    adv = int((p > 0).sum()); dec = int((p < 0).sum())
    total = len(group); unch = max(total - adv - dec, 0)
    adr = (adv / max(dec,1)) if (adv or dec) else None
    nh = int(group["New52wHigh"].sum()); nl = int(group["New52wLow"].sum())
    return {"Adv": adv, "Dec": dec, "Unch": unch, "Total": total, "ADR": adr, "NewHighs": nh, "NewLows": nl}

agg_all = _agg(df)
left, mid, right, right2 = st.columns(4)
left.metric("Advancers", agg_all["Adv"])
mid.metric("Decliners", agg_all["Dec"])
right.metric("A/D-ratio", f"{agg_all['ADR']:.2f}" if agg_all["ADR"] else "–")
right2.metric("New Highs / Lows", f"{agg_all['NewHighs']} / {agg_all['NewLows']}")

ex_breadth = df.groupby("Exchange").apply(lambda g: pd.Series(_agg(g))).reset_index()
st.subheader("Breadth per exchange")
st.dataframe(ex_breadth, use_container_width=True)

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

st.caption("Fallback: beräknat från per-symbol Parquet.")

from __future__ import annotations
import os
from pathlib import Path
from typing import Optional, Tuple

import pandas as pd
import streamlit as st
import yaml

TITLE = "📊 Breadth"

DATA_ROOT = Path("storage")
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
    if not p.exists(): return []
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return []
    items = doc.get("items", []) or doc.get("tickers", [])
    out = []
    for it in items:
        code = it if isinstance(it, str) else (it or {}).get("code")
        if code: out.append(str(code).strip())
    return out

def _exchange_for(sym: str) -> str:
    if sym.endswith(".US"): return "US"
    if sym.endswith(".ST"): return "ST"
    return "OTHER"

st.set_page_config(page_title="Breadth", layout="wide")
st.title(TITLE)

st.sidebar.subheader("Uppdatering")
every = st.sidebar.number_input("Auto-refresh (sek)", min_value=0, max_value=600, value=30, step=5)
if every:
    st.autorefresh(interval=int(every) * 1000, key="breadth_autorefresh")

src_label = "S3 snapshots" if S3_PREFIX else "lokala snapshots"
st.caption(f"Primärt läses snapshot (snabbt). Saknas snapshot → visa meddelande.")

# ---- Snapshot först ----
_cands = []
if S3_PREFIX:
    _cands.append(f"{S3_PREFIX}/snapshots/breadth/by_symbol.parquet")
    _cands.append(f"{S3_PREFIX}/snapshots/breadth/agg.parquet")
_local_sym = DATA_ROOT / "snapshots" / "breadth" / "by_symbol.parquet"
_local_agg = DATA_ROOT / "snapshots" / "breadth" / "agg.parquet"

@st.cache_data(ttl=30, show_spinner=False)
def _load_df(uri: str) -> Optional[pd.DataFrame]:
    try:
        return pd.read_parquet(uri, storage_options=_s3_opts() if uri.startswith("s3://") else None)
    except Exception:
        return None

by_symbol = None
agg = None
# S3 försök
if S3_PREFIX:
    by_symbol = _load_df(f"{S3_PREFIX}/snapshots/breadth/by_symbol.parquet")
    agg = _load_df(f"{S3_PREFIX}/snapshots/breadth/agg.parquet")
# Lokal fallback
if by_symbol is None and _local_sym.exists():
    by_symbol = _load_df(str(_local_sym))
if agg is None and _local_agg.exists():
    agg = _load_df(str(_local_agg))

if by_symbol is None or by_symbol.empty:
    st.error("Ingen breadth-snapshot hittad. Kör workflows **breadth_intraday_snapshot**/**breadth_eod_snapshot**.")
    st.stop()

# ---- UI ----
ex_filter = st.sidebar.selectbox("Exchange", ["ALL","US","ST"], index=0)
if ex_filter != "ALL":
    by_symbol = by_symbol[by_symbol["Exchange"] == ex_filter]

# Top-badr & laggards
st.subheader("Leaders / Laggards (i % idag)")
pct = pd.to_numeric(by_symbol["Pct"], errors="coerce")
leaders = by_symbol.assign(Pct=pct).sort_values("Pct", ascending=False).dropna(subset=["Pct"]).head(15)
laggards = by_symbol.assign(Pct=pct).sort_values("Pct", ascending=True).dropna(subset=["Pct"]).head(15)
c1, c2 = st.columns(2)
with c1:
    st.write("**Leaders**")
    st.dataframe(leaders[["Symbol","Exchange","Pct","Last"]].style.format({"Pct": "{:+.2f}%","Last": "{:,.2f}"}), use_container_width=True)
with c2:
    st.write("**Laggards**")
    st.dataframe(laggards[["Symbol","Exchange","Pct","Last"]].style.format({"Pct": "{:+.2f}%","Last": "{:,.2f}"}), use_container_width=True)

# Aggregat (om filen fanns)
if isinstance(agg, pd.DataFrame) and not agg.empty:
    st.subheader("Breadth aggregat")
    st.dataframe(agg, use_container_width=True)

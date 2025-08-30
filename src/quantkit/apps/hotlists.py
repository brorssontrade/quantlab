# src/quantkit/apps/hotlists.py
from __future__ import annotations
import os
from pathlib import Path
import pandas as pd
import streamlit as st
import yaml

TITLE = "🔥 Hot Lists"

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
    if not p.exists():
        return []
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return []
    items = doc.get("items", []) or doc.get("tickers", [])
    out: list[str] = []
    for it in items:
        code = it if isinstance(it, str) else (it or {}).get("code")
        if code:
            out.append(str(code).strip())
    return out

def _exchange_for(sym: str) -> str:
    if sym.endswith(".US"): return "US"
    if sym.endswith(".ST"): return "ST"
    return "OTHER"

st.set_page_config(page_title="Hot Lists", layout="wide")
st.title(TITLE)

st.sidebar.subheader("Uppdatering")
every = st.sidebar.number_input("Auto-refresh (sek)", min_value=0, max_value=600, value=30, step=5)
if every:
    st.autorefresh(interval=int(every) * 1000, key="hotlists_autorefresh")

src_label = "S3 snapshots" if S3_PREFIX else "lokala snapshots"
st.caption(f"Primärt läses snapshot. Om saknas → visa meddelande.")

# --- snapshot first ---
cands = []
if S3_PREFIX:
    cands.append(f"{S3_PREFIX}/snapshots/hotlists/latest.parquet")
cands.append(str(DATA_ROOT / "snapshots" / "hotlists" / "latest.parquet"))

@st.cache_data(ttl=30, show_spinner=False)
def _load_snapshot(cands):
    for u in cands:
        try:
            return pd.read_parquet(u, storage_options=_s3_opts() if u.startswith("s3://") else None)
        except Exception:
            pass
    return None

df = _load_snapshot(cands)
if df is None or df.empty:
    st.error("Ingen Hot Lists-snapshot hittad. Kör workflow **hotlists_snapshot** eller vänta på nästa körning.")
    st.stop()

# ----- UI filters -----
ex_choice = st.sidebar.selectbox("Exchange", ["ALL", "US", "ST"], index=0)
codes = _read_watchlist_codes()
if ex_choice != "ALL":
    codes = [s for s in codes if _exchange_for(s) == ex_choice]
pick = st.sidebar.multiselect("Tickers (valfritt)", options=codes, default=[])
if pick:
    df = df[df["Symbol"].isin(pick)]
if ex_choice != "ALL":
    df = df[df["Exchange"] == ex_choice]

# ----- Activities / ranking -----
ACTIVITIES = {
    "Rapidly Rising (5m %)": ("Rise5mPct", True),
    "Rapidly Falling (5m %)": ("Rise5mPct", False),
    "Rapidly Rising (15m %)": ("Rise15mPct", True),
    "Rapidly Falling (15m %)": ("Rise15mPct", False),
    "Rapidly Rising (30m %)": ("Rise30mPct", True),
    "Rapidly Falling (30m %)": ("Rise30mPct", False),
    "Rapidly Rising (60m %)": ("Rise60mPct", True),
    "Rapidly Falling (60m %)": ("Rise60mPct", False),

    "Today % vs Open": ("FromOpenPct", True),
    "Range Today % (wide first)": ("RangePct", True),
    "Near High (RangePos %)": ("RangePosPct", True),
    "Near Low (RangePos %)": ("RangePosPct", False),
    "Volume Surge % (vs 30d avg)": ("VolSurgePct", True),

    "% Gainers (1 Day)": ("Ret1D", True),
    "% Losers (1 Day)": ("Ret1D", False),
    "% Gainers (5 Days)": ("Ret5D", True),
    "% Losers (5 Days)": ("Ret5D", False),
    "% Gainers (10 Days)": ("Ret10D", True),
    "% Losers (10 Days)": ("Ret10D", False),
    "% Gainers (20 Days)": ("Ret20D", True),
    "% Losers (20 Days)": ("Ret20D", False),
    "% Gainers (30 Days)": ("Ret30D", True),
    "% Losers (30 Days)": ("Ret30D", False),
    "% Gainers (60 Days)": ("Ret60D", True),
    "% Losers (60 Days)": ("Ret60D", False),

    "Gap Up % (vs prev close)": ("GapPct", True),
    "Gap Down % (vs prev close)": ("GapPct", False),

    "Above MA20 %": ("MA20Pct", True),
    "Below MA20 %": ("MA20Pct", False),
    "Above MA50 %": ("MA50Pct", True),
    "Below MA50 %": ("MA50Pct", False),
    "Above MA200 %": ("MA200Pct", True),
    "Below MA200 %": ("MA200Pct", False),
    "RSI(14) Highest": ("RSI14", True),
    "RSI(14) Lowest": ("RSI14", False),
    "ATR% (14) Highest": ("ATRpct", True),
    "ATR% (14) Lowest": ("ATRpct", False),
}

act_label = st.sidebar.selectbox("Activity", list(ACTIVITIES.keys()), index=0)
metric, desc_order = ACTIVITIES[act_label]
topn = int(st.sidebar.slider("Results", min_value=10, max_value=200, value=60, step=5))

# rank, sort, format
sort_series = pd.to_numeric(df.get(metric), errors="coerce")
view = df.assign(_rank_metric=sort_series)
view = view.sort_values("_rank_metric", ascending=not desc_order, na_position="last").head(topn)

view.insert(0, "#", range(1, len(view) + 1))
col_order = [
    "#", "Symbol", metric, "Exchange", "Last", "LastTs", "NetChg", "NetPct",
    "FromOpenPct", "RangePct", "RangePosPct", "VolSurgePct",
    "Open", "High", "Low", "Close", "VolTot", "Trades",
    "Rise5mPct", "Rise15mPct", "Rise30mPct", "Rise60mPct",
    "GapPct",
    "Ret1D", "Ret5D", "Ret10D", "Ret20D", "Ret30D", "Ret60D",
    "MA20Pct", "MA50Pct", "MA200Pct",
    "RSI14", "ATRpct",
]
col_order = [c for c in col_order if c in view.columns]
view = view[col_order]
view = view.loc[:, ~pd.Index(view.columns).duplicated()].reset_index(drop=True)

def _color_posneg(v):
    try:
        x = float(v)
    except Exception:
        return ""
    if pd.isna(x): return ""
    if x > 0: return "color: #0a7d32; font-weight: 600;"
    if x < 0: return "color: #c92a2a; font-weight: 600;"
    return ""

pct_cols = [c for c in view.columns if c.endswith("Pct") or c.startswith("Ret")]
chg_cols = [c for c in ["NetChg"] if c in view.columns]
num_cols = [c for c in ["Last","Open","High","Low","Close"] if c in view.columns]
vol_cols = [c for c in ["VolTot"] if c in view.columns]

styler = view.style
if pct_cols: styler = styler.map(_color_posneg, subset=pd.IndexSlice[:, pct_cols])
if chg_cols: styler = styler.map(_color_posneg, subset=pd.IndexSlice[:, chg_cols])

fmt_map = {}
for c in pct_cols: fmt_map[c] = "{:+.2f}%"
for c in chg_cols: fmt_map[c] = "{:+,.2f}"
for c in num_cols: fmt_map[c] = "{:,.2f}"
for c in vol_cols: fmt_map[c] = "{:,.0f}"
styler = styler.format(fmt_map, na_rep="None")

st.subheader(act_label)
st.dataframe(styler, height=650, use_container_width=True)
st.caption("Källa: hotlists-snapshot. Kör workflow om inget visas.")

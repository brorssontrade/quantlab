import os
import pandas as pd
import streamlit as st
from datetime import timezone

try:
    from streamlit_autorefresh import st_autorefresh
except Exception:
    st_autorefresh = None

st.set_page_config(page_title="Hot Lists", layout="wide")

PATH = os.environ.get("HOTLISTS_PATH", "storage/snapshots/hotlists/latest.parquet")

# Cachea på filens mtime så att cachen invalidieras när parquet skrivs om
@st.cache_data
def _load_df_with_mtime(path: str, mtime: float) -> pd.DataFrame:
    if not os.path.exists(path):
        return pd.DataFrame()
    df = pd.read_parquet(path)
    # normalisera procentkolumner till float
    for c in df.columns:
        if c.endswith("Pct"):
            df[c] = pd.to_numeric(df[c], errors="coerce")
    # tidskolumner med UTC
    for tcol in ("LastTs", "SnapshotAt"):
        if tcol in df.columns:
            df[tcol] = pd.to_datetime(df[tcol], utc=True, errors="coerce")
    return df

mtime = os.path.getmtime(PATH) if os.path.exists(PATH) else 0.0
df = _load_df_with_mtime(PATH, mtime)

def pct_fmt(x):
    return None if pd.isna(x) else f"{x:,.2f}%"

def color_cell(v):
    if pd.isna(v):
        return ""
    try:
        return "color: red" if float(v) < 0 else "color: green"
    except Exception:
        return ""

st.title("Hot Lists")

# ---- Sidebar
with st.sidebar:
    st.header("Filter")

    cols = st.columns([1, 1.2])
    with cols[0]:
        af = st.checkbox("Auto-refresh", value=False)
    with cols[1]:
        interval = st.slider("Intervall (sek)", 5, 120, 15)
    if af and st_autorefresh is not None:
        st_autorefresh(interval=interval * 1000, key="hotlists_autorefresh")

    ex_vals = sorted([x for x in df.get("Exchange", pd.Series(dtype=str)).dropna().unique()])
    ex = st.selectbox("Exchange", options=["ALL"] + ex_vals, index=0)

    symq = st.text_input("Sök symbol", "")

    activities = []
    has = lambda c: c in df.columns
    if has("Rise5mPct"):  activities += ["Rapidly Rising (5m %)", "Rapidly Falling (5m %)"]
    if has("Rise15mPct"): activities += ["Rapidly Rising (15m %)", "Rapidly Falling (15m %)"]
    if has("Rise30mPct"): activities += ["Rapidly Rising (30m %)", "Rapidly Falling (30m %)"]
    if has("Rise60mPct"): activities += ["Rapidly Rising (60m %)", "Rapidly Falling (60m %)"]
    if has("RangePosPct"): activities += ["Near Day High", "Near Day Low"]
    if has("FromOpenPct"): activities += ["From Open Up", "From Open Down"]
    if has("NetPct"):      activities += ["Top Gainers (1D %)", "Top Losers (1D %)"]
    if has("GapPct"):      activities += ["Gap Up (1D %)", "Gap Down (1D %)"]

    act = st.selectbox("Aktivitet", options=["Alla"] + activities, index=0)

    sort_options = [
        "Rise5mPct","Rise15mPct","Rise30mPct","Rise60mPct",
        "RangePosPct","FromOpenPct","NetPct","GapPct","VolTot","Last"
    ]
    sort_options = [c for c in sort_options if c in df.columns]
    sort_by = st.selectbox("Sortera på", options=sort_options, index=0)

    n = st.slider("Antal rader", 10, 200, min(60, max(10, len(df))))

    st.divider()
    with st.expander("Advanced", expanded=False):
        st.caption("Finjustera egna trösklar (tillämpas ovanpå vald aktivitet).")
        enable_adv = st.checkbox("Aktivera Advanced-filter", value=False)
        col1, col2 = st.columns(2)
        with col1:
            thr_up   = st.number_input("Min FromOpen %", value=0.0, step=0.1)
            near_hi  = st.number_input("Near High: minst pos (%)", value=70.0, step=1.0)
        with col2:
            thr_dn   = st.number_input("Max FromOpen %", value=0.0, step=0.1)
            near_lo  = st.number_input("Near Low: max pos (%)",  value=30.0, step=1.0)

# Ingen snapshot?
if df.empty:
    st.info("Ingen snapshot hittades ännu. Kör: `python -m quantkit snapshot-hotlists --timeframe 5m --force`")
    st.stop()

# ---- Filtrering
show = df.copy()

if ex != "ALL" and "Exchange" in show:
    show = show[show["Exchange"] == ex]

if symq.strip() and "Symbol" in show:
    q = symq.strip().upper()
    show = show[show["Symbol"].str.contains(q, case=False, na=False)]

def apply_activity(d: pd.DataFrame) -> pd.DataFrame:
    if act == "Alla":
        return d
    m = d
    if act == "Rapidly Rising (5m %)":    m = m.sort_values("Rise5mPct", ascending=False)
    elif act == "Rapidly Falling (5m %)": m = m.sort_values("Rise5mPct", ascending=True)
    elif act == "Rapidly Rising (15m %)": m = m.sort_values("Rise15mPct", ascending=False)
    elif act == "Rapidly Falling (15m %)":m = m.sort_values("Rise15mPct", ascending=True)
    elif act == "Rapidly Rising (30m %)": m = m.sort_values("Rise30mPct", ascending=False)
    elif act == "Rapidly Falling (30m %)":m = m.sort_values("Rise30mPct", ascending=True)
    elif act == "Rapidly Rising (60m %)": m = m.sort_values("Rise60mPct", ascending=False)
    elif act == "Rapidly Falling (60m %)":m = m.sort_values("Rise60mPct", ascending=True)
    elif act == "Near Day High":          m = m.sort_values("RangePosPct", ascending=False)
    elif act == "Near Day Low":           m = m.sort_values("RangePosPct", ascending=True)
    elif act == "From Open Up":           m = m.sort_values("FromOpenPct", ascending=False)
    elif act == "From Open Down":         m = m.sort_values("FromOpenPct", ascending=True)
    elif act == "Top Gainers (1D %)":     m = m.sort_values("NetPct", ascending=False)
    elif act == "Top Losers (1D %)":      m = m.sort_values("NetPct", ascending=True)
    elif act == "Gap Up (1D %)":          m = m.sort_values("GapPct", ascending=False)
    elif act == "Gap Down (1D %)":        m = m.sort_values("GapPct", ascending=True)
    return m

show = apply_activity(show)

# Advanced-filter ovanpå aktivitet
if 'enable_adv' in st.session_state and st.session_state.enable_adv:
    if "FromOpenPct" in show and thr_up != 0.0:
        show = show[show["FromOpenPct"] >= thr_up]
    if "FromOpenPct" in show and thr_dn != 0.0:
        show = show[show["FromOpenPct"] <= thr_dn]
    if "RangePosPct" in show:
        show = show[(show["RangePosPct"] >= near_hi) | (show["RangePosPct"] <= near_lo)]

# Slutlig sortering & topp N
if sort_by in show:
    show = show.sort_values(sort_by, ascending=False)
show = show.head(n).reset_index(drop=True)

pct_cols = [c for c in show.columns if c.endswith("Pct")]
fmt = {c: pct_fmt for c in pct_cols}

last_snap = None
if "SnapshotAt" in show and not show["SnapshotAt"].isna().all():
    try:
        last_snap = pd.to_datetime(show["SnapshotAt"], utc=True).max().tz_convert("UTC")
    except Exception:
        last_snap = None

stamp = (last_snap.strftime("%Y-%m-%d %H:%M:%S UTC")
         if last_snap else pd.Timestamp.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"))
st.caption(f"Rows={len(show)} · Senast: {stamp}")

try:
    styler = show.style.format(fmt).map(color_cell, subset=pd.IndexSlice[:, pct_cols])
    st.dataframe(styler, width="stretch")
except Exception:
    st.dataframe(show, width="stretch")

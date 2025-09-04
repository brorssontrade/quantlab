# src/quantkit/apps/breadth.py
import os
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Breadth", layout="wide")

AGG = "storage/snapshots/breadth/latest.parquet"
SYM = "storage/snapshots/breadth/symbols/latest.parquet"

st.title("Breadth")

if not os.path.exists(AGG):
    st.info("Ingen breadth-snapshot hittades ännu.")
    st.stop()

agg = pd.read_parquet(AGG)
if agg.empty:
    st.warning("Agg-breadth är tom.")
    st.stop()

agg = agg.copy()
for c in ["PctAdv","PctDec","PctAboveMA20","PctAboveMA50","PctAboveMA200"]:
    if c in agg.columns:
        agg[c] = pd.to_numeric(agg[c], errors="coerce")

with st.sidebar:
    st.header("Filter")
    exch = sorted(agg["Exchange"].fillna("").unique().tolist()) if "Exchange" in agg.columns else []
    exch_sel = st.multiselect("Exchange", exch, default=[])
    try:
        from streamlit_autorefresh import st_autorefresh
        if st.checkbox("Auto-refresh (30s)", False):
            st_autorefresh(interval=30_000, key="breadth_autoref")
    except Exception:
        pass

flt = agg.copy()
if exch_sel and "Exchange" in flt.columns:
    flt = flt[flt["Exchange"].isin(exch_sel)]

st.subheader("Aggregat")
cols = [c for c in ["Ts","Exchange","Advancing","Declining","Unchanged","PctAdv","PctDec","ADLine","PctAboveMA20","PctAboveMA50","PctAboveMA200"] if c in flt.columns]
show = flt[cols].sort_values("Ts").copy()

fmt = {c: "{:.1f}%" for c in ["PctAdv","PctDec","PctAboveMA20","PctAboveMA50","PctAboveMA200"] if c in show.columns}
st.dataframe(show.style.format(fmt), width="stretch")

# Enkel trend/ADLine-plot
if {"Ts","ADLine"}.issubset(show.columns):
    st.subheader("ADLine")
    chart = show.set_index("Ts")[["ADLine"]]
    st.line_chart(chart)

# Per-symbol (om finns)
if os.path.exists(SYM):
    sym = pd.read_parquet(SYM)
    if not sym.empty:
        st.subheader("Per symbol – snabblista")
        keep = [c for c in ["Ts","Symbol","Exchange","Ret1D","MA20Pct","MA50Pct","MA200Pct","RSI14"] if c in sym.columns]
        st.dataframe(sym[keep].head(200), width="stretch")

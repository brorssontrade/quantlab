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

# Normalisera numeriska procentkolumner
agg = agg.copy()
for c in ["PctAdv","PctDec","PctAboveMA20","PctAboveMA50","PctAboveMA200"]:
    if c in agg.columns:
        agg[c] = pd.to_numeric(agg[c], errors="coerce")

with st.sidebar:
    st.header("Filter")
    exch = sorted(agg["Exchange"].dropna().unique().tolist()) if "Exchange" in agg.columns else []
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
cols = [c for c in ["Ts","Exchange","Adv","Dec","Unch","N","PctAdv","PctDec","ADLine","PctAboveMA20","PctAboveMA50","PctAboveMA200"] if c in flt.columns]
show = flt[cols].sort_values("Ts").copy()

fmt = {c: "{:.1f}%" for c in ["PctAdv","PctDec","PctAboveMA20","PctAboveMA50","PctAboveMA200"] if c in show.columns}
st.dataframe(show.style.format(fmt), use_container_width=True)

# Liten ADLine-graf om finns
if {"Ts","ADLine"}.issubset(show.columns):
    st.subheader("ADLine")
    st.line_chart(show.set_index("Ts")[["ADLine"]])

# Per-symbol-del (om finns)
if os.path.exists(SYM):
    sym = pd.read_parquet(SYM)
    if not sym.empty:
        st.subheader("Per symbol – snabblista")
        keep = [c for c in ["Ts","Symbol","Exchange","ChangePct","State","RSI14","MA20Pct","MA50Pct","MA200Pct"] if c in sym.columns]
        st.dataframe(sym[keep].sort_values("Ts", ascending=False), use_container_width=True)

# --- Stale-markering (SE) under öppettid om >15 min gammalt + As-of
def _is_se_open_local(ts):
    dow = ts.weekday() + 1  # 1=Mon ... 7=Sun
    hm  = int(ts.strftime("%H%M"))
    return (1 <= dow <= 5) and (900 <= hm <= 1735)

try:
    if "Ts" in show.columns and not show["Ts"].isna().all():
        last_utc   = pd.to_datetime(show["Ts"], utc=True).max()
        last_local = last_utc.tz_convert("Europe/Stockholm")
        now_local  = pd.Timestamp.now(tz="Europe/Stockholm")
        age_min    = (now_local - last_local).total_seconds() / 60.0
        if _is_se_open_local(now_local) and age_min > 15:
            st.warning(f"SE-data kan vara gammal ({age_min:.0f} min bakom).", icon="⏱️")
        st.caption(f"As of {last_local:%Y-%m-%d %H:%M} (local)")
except Exception:
    pass


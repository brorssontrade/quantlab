import os
import pandas as pd
import streamlit as st

try:
    from streamlit_autorefresh import st_autorefresh
except Exception:
    st_autorefresh = None

st.set_page_config(page_title="Movers", layout="wide")

PATH = "storage/snapshots/movers/latest.parquet"
st.title("Movers")

# Sidebar: auto-refresh
with st.sidebar:
    st.header("Uppdatering")
    do_ar = st.checkbox("Auto-refresh", value=False)
    ar_sec = st.slider("Intervall (sek)", 10, 120, 30)
    if do_ar and st_autorefresh is not None:
        st_autorefresh(interval=ar_sec * 1000, key="movers_autorefresh")

# Ingen snapshot?
if not os.path.exists(PATH):
    st.info("Ingen movers-snapshot hittades ännu. Kör: `python -m quantkit snapshot-movers --force`")
    st.stop()

df = pd.read_parquet(PATH)

# Sidebar: filter
with st.sidebar:
    side = st.selectbox("Lista", ["Top","Bottom"], index=0)
    ex_vals = sorted(df.get("Exchange", pd.Series(dtype=str)).dropna().unique().tolist()) if "Exchange" in df.columns else []
    ex = st.selectbox("Exchange", ["ALL"] + ex_vals, index=0)
    n = st.slider("Antal rader", 10, 100, 50)
    with st.expander("Advanced", expanded=False):
        min_vol = st.number_input("Min VolTot", value=0.0, step=1000.0)
        min_metric = st.number_input("Min % (Top) / Max % (Bottom)", value=0.0, step=0.1)

# Filter + sort
show = df[df.get("Side", "Top") == side].copy()
if ex != "ALL" and "Exchange" in show:
    show = show[show["Exchange"] == ex]
if "VolTot" in show and min_vol > 0:
    show = show[show["VolTot"] >= min_vol]
if "Metric" in show and min_metric != 0:
    if side == "Top":
        show = show[show["Metric"] >= min_metric]
    else:
        show = show[show["Metric"] <= -abs(min_metric)]

fmt = {"Metric": (lambda x: f"{x:,.2f}%")}
st.dataframe(show.head(n).style.format(fmt), use_container_width=True)

# --- As-of + stale-varningar (SE/US) ---
def _guess_last_ts_utc(d: pd.DataFrame) -> pd.Timestamp:
    for c in ("SnapshotAt","LastTs","Ts"):
        if c in d.columns:
            s = pd.to_datetime(d[c], utc=True, errors="coerce")
            if s.notna().any():
                return s.max()
    return pd.Timestamp.now(tz="UTC")

def _is_se_open_local(ts):
    dow = ts.weekday() + 1
    hm  = int(ts.strftime("%H%M"))
    return (1 <= dow <= 5) and (900 <= hm <= 1735)

def _is_us_open_local(ts):
    dow = ts.weekday() + 1
    hm  = int(ts.strftime("%H%M"))
    return (1 <= dow <= 5) and (1530 <= hm <= 2205)

try:
    last_utc   = _guess_last_ts_utc(df)
    last_local = last_utc.tz_convert("Europe/Stockholm")
    now_local  = pd.Timestamp.now(tz="Europe/Stockholm")
    age_min    = (now_local - last_local).total_seconds()/60.0

    if _is_se_open_local(now_local) and age_min > 15:
        st.warning(f"SE-data kan vara gammal ({age_min:.0f} min bakom).", icon="⏱️")
    if _is_us_open_local(now_local) and age_min > 5:
        st.warning(f"US-data kan vara gammal ({age_min:.0f} min bakom).", icon="⏱️")

    st.caption(f"As of {last_local:%Y-%m-%d %H:%M} (local)")
except Exception:
    pass


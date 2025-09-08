import os
import pandas as pd
import streamlit as st

try:
    from streamlit_autorefresh import st_autorefresh
except Exception:
    st_autorefresh = None

st.set_page_config(page_title="Signals", layout="wide")

PATH = os.environ.get("SIGNALS_PATH", "storage/snapshots/signals/latest.parquet")

@st.cache_data(ttl=30)
def load_df(path):
    if not os.path.exists(path):
        return pd.DataFrame()
    df = pd.read_parquet(path)
    for c in ["RSI14","MA50","MA200","Price"]:
        if c in df: df[c] = pd.to_numeric(df[c], errors="coerce")
    if {"Price","MA50"}.issubset(df.columns):
        df["MA50DistPct"]  = (df["Price"] - df["MA50"]) / df["MA50"] * 100.0
    if {"Price","MA200"}.issubset(df.columns):
        df["MA200DistPct"] = (df["Price"] - df["MA200"]) / df["MA200"] * 100.0
    if {"MA50","MA200"}.issubset(df.columns):
        df["MATrend"] = (df["MA50"] > df["MA200"]).map({True:"Bull", False:"Bear"})
    return df

def pct_fmt(x): return None if pd.isna(x) else f"{x:,.2f}%"
def color_pct(s: pd.Series):
    return s.map(lambda v: ("color: red" if (pd.notna(v) and v < 0) else ("color: green" if pd.notna(v) else "")))

df = load_df(PATH)
st.title("Signals")

# Sidebar: auto-refresh
with st.sidebar:
    st.header("Uppdatering")
    do_ar = st.checkbox("Auto-refresh", value=False)
    ar_sec = st.slider("Intervall (sek)", 10, 120, 30)
    if do_ar and st_autorefresh is not None:
        st_autorefresh(interval=ar_sec * 1000, key="signals_autorefresh")

if df.empty:
    st.info("Ingen signals-snapshot hittades ännu. Kör snapshot först.")
    st.stop()

# Sidebar: filter
with st.sidebar:
    st.header("Filter")
    q  = st.text_input("Sök symbol", "")
    sig = st.selectbox("Signaltyp", options=["Alla","RSI_Oversold","RSI_Overbought","Above_MA50","Below_MA50","Above_MA200","Below_MA200"])
    active_only = st.checkbox("Endast aktiva (ej 'None')", value=True)

    st.divider()
    with st.expander("Advanced", expanded=False):
        enable_adv = st.checkbox("Aktivera Advanced-filter", value=False, key="adv")
        col1,col2 = st.columns(2)
        with col1:
            min_rsi = st.number_input("Min RSI", value=0.0, step=1.0)
            min_ma50 = st.number_input("Min MA50-dist (%)", value=-999.0, step=0.5)
        with col2:
            max_rsi = st.number_input("Max RSI", value=100.0, step=1.0)
            max_ma50 = st.number_input("Max MA50-dist (%)", value=999.0, step=0.5)

    sort_by = st.selectbox("Sortera på", options=[c for c in ["Strength","RSI14","MA50DistPct","MA200DistPct","Symbol"] if c in df.columns], index=0)
    n = st.slider("Antal rader", 10, 200, 24)

# Data -> visning
show = df.copy()
if q.strip() and "Symbol" in show:
    show = show[show["Symbol"].str.contains(q.strip(), case=False, na=False)]
if active_only and "Signal" in show:
    show = show[show["Signal"].fillna("None") != "None"]
if sig != "Alla" and "Signal" in show:
    show = show[show["Signal"] == sig]
if st.session_state.get("adv", False):
    if "RSI14" in show:
        show = show[(show["RSI14"] >= min_rsi) & (show["RSI14"] <= max_rsi)]
    if "MA50DistPct" in show:
        show = show[(show["MA50DistPct"] >= min_ma50) & (show["MA50DistPct"] <= max_ma50)]
if sort_by in show:
    show = show.sort_values(sort_by, ascending=False)
show = show.head(n).reset_index(drop=True)

pct_cols = [c for c in show.columns if c.endswith("Pct")]
fmt = {c: pct_fmt for c in pct_cols}
st.dataframe(show.style.format(fmt).map(color_pct, subset=pd.IndexSlice[:, pct_cols]), use_container_width=True)

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


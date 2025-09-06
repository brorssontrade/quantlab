import os, pandas as pd, streamlit as st
st.set_page_config(page_title="Movers", layout="wide")

PATH = "storage/snapshots/movers/latest.parquet"
if not os.path.exists(PATH):
    st.title("Movers")
    st.info("Ingen movers-snapshot hittades ännu. Kör: `python -m quantkit snapshot-movers --force`")
    st.stop()

df = pd.read_parquet(PATH)
st.title("Movers")

with st.sidebar:
    side = st.selectbox("Lista", ["Top","Bottom"], index=0)
    ex = st.selectbox("Exchange", ["ALL"] + sorted(df["Exchange"].dropna().unique().tolist()), index=0)
    n = st.slider("Antal rader", 10, 100, 50)
    with st.expander("Advanced", expanded=False):
        min_vol = st.number_input("Min VolTot", value=0.0, step=1000.0)
        min_metric = st.number_input("Min % (Top) / Max % (Bottom)", value=0.0, step=0.1)

show = df[df["Side"] == side].copy()
if ex != "ALL":
    show = show[show["Exchange"] == ex]
if "VolTot" in show and min_vol > 0:
    show = show[show["VolTot"] >= min_vol]
if "Metric" in show and min_metric != 0:
    if side == "Top":
        show = show[show["Metric"] >= min_metric]
    else:
        show = show[show["Metric"] <= -abs(min_metric)]

fmt = {"Metric": (lambda x: f"{x:,.2f}%")}
st.dataframe(show.head(n).style.format(fmt), width="stretch")

# streamlit_app.py (byt ut mittenblocket till detta)
import os, pandas as pd, streamlit as st

st.title("Quantlab")
st.caption("Huvudsidan laddar inga tunga moduler – apparna bor i src/quantkit/apps/.")

path = "storage/snapshots/hotlists/latest.parquet"
if os.path.exists(path):
    try:
        df = pd.read_parquet(path)
        if not df.empty:
            st.dataframe(df.head(50), width='stretch')
        else:
            st.info("Hotlists-snapshot finns men är tom. Kör snapshot under öppettid eller kontrollera tickers.")
    except Exception as e:
        st.error(f"Kunde inte läsa {path}: {e}")
else:
    st.info("Kör:  python -m quantkit snapshot-hotlists --timeframe 5m  så dyker tabellen upp här.")

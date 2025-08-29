# streamlit_app.py
import streamlit as st

st.set_page_config(page_title="QuantLab", page_icon="📈", layout="wide")
st.title("QuantLab")

st.write("Välj app:")
st.page_link("pages/01_Hot_Lists.py", label="🔥 Hot Lists", icon="🔥")
st.page_link("pages/02_Breadth.py", label="📊 Breadth", icon="📊")

st.caption("Tips: lägga denna fil som Main file path när du deployar i Streamlit Cloud.")

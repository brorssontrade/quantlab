#!/usr/bin/env python3
import os, json, pathlib
import pandas as pd
import requests
from dotenv import load_dotenv


load_dotenv()
EODHD_TOKEN = os.getenv("EODHD_TOKEN", "")
DATA_DIR = os.getenv("DATA_DIR", "./storage/parquet")
ROOT_RAW = pathlib.Path(DATA_DIR) / "fundamentals" / "raw"
ROOT_TTM = pathlib.Path(DATA_DIR) / "fundamentals" / "ttm"
ROOT_RAW.mkdir(parents=True, exist_ok=True)
ROOT_TTM.mkdir(parents=True, exist_ok=True)


# --- Hjälpare för att extrahera kvartalsserier och TTM ---


def _qtable(js: dict, sec: str, key: str) -> pd.DataFrame:
try:
arr = js[sec][key]
except Exception:
return pd.DataFrame()
df = pd.DataFrame(arr)
# Vanliga fältnamn: date, Revenue, EBITDA, EBIT, netIncome, operatingCashFlow, capitalExpenditure, weightedAverageShsOut
if "date" in df.columns:
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df = df.sort_values("date")
return df




def _ttm(df: pd.DataFrame, cols: list[str]) -> pd.Series:
if df.empty:
return pd.Series(dtype=float)
last4 = df.tail(4)
out = {}
for c in cols:
if c in last4.columns:
main(args.symbols)
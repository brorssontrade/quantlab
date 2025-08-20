import os, json, time
import pandas as pd
import requests
from zoneinfo import ZoneInfo


EODHD_TOKEN = os.getenv("EODHD_TOKEN", "")
TZ = ZoneInfo("Europe/Stockholm")


class EODHDClient:
def __init__(self, token: str | None = None):
self.token = token or EODHD_TOKEN


def intraday_1m(self, symbol: str, range_: str = "5d") -> pd.DataFrame:
url = (
f"https://eodhd.com/api/intraday/{symbol}"
f"?interval=1m&range={range_}&api_token={self.token}&fmt=json"
)
r = requests.get(url, timeout=30)
r.raise_for_status()
j = r.json()
df = pd.DataFrame(j)
if df.empty:
return df
df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
df = df.set_index("datetime").sort_index()
# Enligt EODHD är timestamps UTC; konvertera till lokal tid för kalenderlogik
df.index = df.index.tz_convert(TZ)
return df[["open", "high", "low", "close", "volume"]]
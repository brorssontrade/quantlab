from __future__ import annotations
import pandas as pd

def _hm(ts) -> int:
    return int(pd.Timestamp(ts).strftime("%H%M"))

def is_open_stockholm(ts: pd.Timestamp | None = None) -> bool:
    now_local = (ts or pd.Timestamp.now(tz="Europe/Stockholm")).tz_convert("Europe/Stockholm")
    dow = now_local.weekday() + 1
    return (1 <= dow <= 5) and (900 <= _hm(now_local) <= 1735)

def is_open_us(ts: pd.Timestamp | None = None) -> bool:
    now_local = (ts or pd.Timestamp.now(tz="Europe/Stockholm")).tz_convert("Europe/Stockholm")
    dow = now_local.weekday() + 1
    return (1 <= dow <= 5) and (1530 <= _hm(now_local) <= 2205)

# src/quantkit/data/market_hours.py
from __future__ import annotations
from datetime import time
from zoneinfo import ZoneInfo
import datetime as dt

def _is_weekday(ts: dt.datetime) -> bool:
    return ts.weekday() < 5

def is_open_stockholm(now: dt.datetime | None = None) -> bool:
    tz = ZoneInfo("Europe/Stockholm")
    t = (now or dt.datetime.now(tz)).astimezone(tz)
    if not _is_weekday(t): return False
    # enkel heuristik: 09:00–17:30 (lokal)
    return time(9,0) <= t.time() <= time(17,30)

def is_open_us(now: dt.datetime | None = None) -> bool:
    tz = ZoneInfo("America/New_York")
    t = (now or dt.datetime.now(tz)).astimezone(tz)
    if not _is_weekday(t): return False
    # enkel heuristik: 09:30–16:00 (lokal)
    return time(9,30) <= t.time() <= time(16,0)

# src/quantkit/data/market_hours.py
from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

WEEKDAYS = {0, 1, 2, 3, 4}  # Mon-Fri


def _now_in_tz(tz_name: str, now: datetime | None = None) -> datetime:
    """Get a timezone-aware datetime in tz_name."""
    n = now or datetime.utcnow().replace(tzinfo=ZoneInfo("UTC"))
    if n.tzinfo is None:
        n = n.replace(tzinfo=ZoneInfo("UTC"))
    return n.astimezone(ZoneInfo(tz_name))


def _is_open(tz_name: str, start: time, end: time, now: datetime | None = None) -> bool:
    """Generic market-hours window check (no holiday calendar)."""
    local = _now_in_tz(tz_name, now)
    if local.weekday() not in WEEKDAYS:
        return False
    t = local.time()
    return start <= t <= end


def is_open_stockholm(now: datetime | None = None) -> bool:
    """
    Nasdaq Stockholm continuous trading hours: 09:00–17:30 local time.
    (No holiday handling here; this is a simple gate.)
    """
    return _is_open("Europe/Stockholm", time(9, 0), time(17, 30), now)


def is_open_us(now: datetime | None = None) -> bool:
    """
    NYSE/Nasdaq regular session: 09:30–16:00 US/Eastern.
    (No holiday handling here; this is a simple gate.)
    """
    return _is_open("America/New_York", time(9, 30), time(16, 0), now)


__all__ = ["is_open_stockholm", "is_open_us"]

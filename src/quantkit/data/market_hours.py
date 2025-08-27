# src/quantkit/data/market_hours.py
from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Tuple, Optional
from zoneinfo import ZoneInfo

WEEKDAYS = {0, 1, 2, 3, 4}  # Mon–Fri

_ST_TZ = "Europe/Stockholm"
_US_TZ = "America/New_York"

_ST_HOURS = (time(9, 0), time(17, 30))   # 09:00–17:30
_US_HOURS = (time(9, 30), time(16, 0))   # 09:30–16:00


def _now_in_tz(tz_name: str, now: Optional[datetime] = None) -> datetime:
    """Returnera now i given tidszon (timezone-aware)."""
    n = now or datetime.utcnow().replace(tzinfo=ZoneInfo("UTC"))
    if n.tzinfo is None:
        n = n.replace(tzinfo=ZoneInfo("UTC"))
    return n.astimezone(ZoneInfo(tz_name))


def _is_open(tz_name: str, start: time, end: time, now: Optional[datetime] = None) -> bool:
    """Enkel öppettidskontroll (ingen helgdagskalender)."""
    local = _now_in_tz(tz_name, now)
    if local.weekday() not in WEEKDAYS:
        return False
    t = local.time()
    return start <= t <= end


def is_open_stockholm(now: Optional[datetime] = None) -> bool:
    """Nasdaq Stockholm kontinuerlig handel 09:00–17:30 (lokal tid)."""
    return _is_open(_ST_TZ, *_ST_HOURS, now=now)


def is_open_us(now: Optional[datetime] = None) -> bool:
    """NYSE/Nasdaq regular session 09:30–16:00 (US/Eastern)."""
    return _is_open(_US_TZ, *_US_HOURS, now=now)


# ---------- API som andra moduler förväntar sig ----------

def is_market_open(symbol: Optional[str] = None, now: Optional[datetime] = None) -> bool:
    """
    Grov marknadsgate:
      - '.ST' -> Stockholm
      - '.US' -> US/Eastern
      - annars: anta öppet (dvs. ingen gating)
    """
    if isinstance(symbol, str):
        s = symbol.upper()
        if s.endswith(".ST"):
            return is_open_stockholm(now)
        if s.endswith(".US"):
            return is_open_us(now)
    # okänd suffix => inga begränsningar
    return True


def _next_session_bounds(
    tz_name: str, start: time, end: time, now: Optional[datetime] = None
) -> Tuple[datetime, datetime]:
    """
    Beräkna nästa (open, close) i UTC för en enkel vardagskalender.
    Om marknaden är öppen returneras dagens (open, close).
    """
    local = _now_in_tz(tz_name, now)
    # hitta nästa vardag (inkl. idag)
    cur = local
    if cur.weekday() not in WEEKDAYS:
        # hoppa fram till nästa måndag
        days = (7 - cur.weekday()) % 7
        days = 1 if days == 0 else days
        cur = (cur + timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)

    open_dt = cur.replace(hour=start.hour, minute=start.minute, second=0, microsecond=0)
    close_dt = cur.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)

    # om innan öppning => använd dagens fönster
    if local.time() < start and local.weekday() in WEEKDAYS:
        pass
    # om under öppethus => behåll dagens fönster
    elif start <= local.time() <= end and local.weekday() in WEEKDAYS:
        pass
    else:
        # efter stängning eller helg -> rulla till nästa vardag
        nxt = cur + timedelta(days=1)
        while nxt.weekday() not in WEEKDAYS:
            nxt += timedelta(days=1)
        open_dt = nxt.replace(hour=start.hour, minute=start.minute, second=0, microsecond=0)
        close_dt = nxt.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)

    # returnera i UTC
    return open_dt.astimezone(ZoneInfo("UTC")), close_dt.astimezone(ZoneInfo("UTC"))


def next_open_close_utc(symbol: Optional[str] = None, now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    """
    Nästa (open, close) i UTC för given marknad baserat på symbol-suffix.
    Om symbol ej ges -> anta US.
    """
    if isinstance(symbol, str) and symbol.upper().endswith(".ST"):
        return _next_session_bounds(_ST_TZ, *_ST_HOURS, now=now)
    # defaulta till US (även för .US)
    return _next_session_bounds(_US_TZ, *_US_HOURS, now=now)


__all__ = [
    "is_open_stockholm",
    "is_open_us",
    "is_market_open",
    "next_open_close_utc",
]

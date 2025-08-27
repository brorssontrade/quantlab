from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from typing import Optional, Tuple
from zoneinfo import ZoneInfo


# ------------------------------------------------------------
# Marknadstider – enkel, robust gating för US/SE
#  - Helger filtreras bort
#  - Helgdagar hanteras ej (kan läggas till senare)
#  - Suffix-baserad exchange-detektering: *.US, *.ST
#  - Returvärden i UTC för tydlighet
# ------------------------------------------------------------

@dataclass(frozen=True)
class MarketSpec:
    name: str
    tz: str
    open: time
    close: time


US_EQUITIES = MarketSpec(
    name="US",
    tz="America/New_York",
    open=time(9, 30),
    close=time(16, 0),
)

SE_EQ = MarketSpec(
    name="SE",
    tz="Europe/Stockholm",
    open=time(9, 0),
    close=time(17, 30),
)

_DEFAULT_BY_SUFFIX = {
    ".US": US_EQUITIES,
    ".ST": SE_EQ,
}


def _detect_market(symbol: str) -> MarketSpec:
    s = symbol.upper()
    for suf, spec in _DEFAULT_BY_SUFFIX.items():
        if s.endswith(suf):
            return spec
    # fallback: US
    return US_EQUITIES


def _is_weekend(d_local: datetime) -> bool:
    # Monday=0 .. Sunday=6
    return d_local.weekday() >= 5


def session_bounds_utc(symbol: str, day_utc: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    """
    Sessionens öppnings- och stängningstid för 'symbol' för den aktuella kalenderdagen
    mätt i dess lokala timezone, returnerad i UTC.
    """
    spec = _detect_market(symbol)

    if day_utc is None:
        day_utc = datetime.now(timezone.utc)
    if day_utc.tzinfo is None:
        day_utc = day_utc.replace(tzinfo=timezone.utc)

    tz = ZoneInfo(spec.tz)
    # lokalt datum
    local_now = day_utc.astimezone(tz)
    local_day = local_now.date()

    # bygg lokala öppnings/stängnings-dttm
    local_open = datetime.combine(local_day, spec.open, tzinfo=tz)
    local_close = datetime.combine(local_day, spec.close, tzinfo=tz)

    # till UTC
    return local_open.astimezone(timezone.utc), local_close.astimezone(timezone.utc)


def is_market_open(
    symbol: str,
    when_utc: Optional[datetime] = None,
    *,
    grace_before: int = 0,
    grace_after: int = 0,
) -> bool:
    """
    True om marknaden är öppen för 'symbol' vid 'when_utc' (UTC).
    grace_* = sekunders marginal före öppning/efter stängning.
    """
    spec = _detect_market(symbol)
    tz = ZoneInfo(spec.tz)

    if when_utc is None:
        when_utc = datetime.now(timezone.utc)
    if when_utc.tzinfo is None:
        when_utc = when_utc.replace(tzinfo=timezone.utc)

    local = when_utc.astimezone(tz)
    if _is_weekend(local):
        return False

    open_utc, close_utc = session_bounds_utc(symbol, when_utc)
    open_utc = open_utc - timedelta(seconds=grace_before)
    close_utc = close_utc + timedelta(seconds=grace_after)
    return open_utc <= when_utc <= close_utc


def next_open_close_utc(symbol: str, after_utc: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    """
    Nästa öppnings- och stängningstid i UTC efter 'after_utc'.
    Skippar helger. (Helgdagar stöds ej ännu.)
    """
    if after_utc is None:
        after_utc = datetime.now(timezone.utc)
    if after_utc.tzinfo is None:
        after_utc = after_utc.replace(tzinfo=timezone.utc)

    # sök maximalt 14 dagar framåt
    for i in range(14):
        candidate = after_utc + timedelta(days=i)
        open_utc, close_utc = session_bounds_utc(symbol, candidate)
        # om dagen är helg i lokal tid → hoppa
        spec = _detect_market(symbol)
        local = open_utc.astimezone(ZoneInfo(spec.tz))
        if _is_weekend(local):
            continue
        if close_utc <= after_utc:
            continue
        if open_utc <= after_utc <= close_utc:
            # redan öppen – returnera dagens
            return open_utc, close_utc
        if open_utc > after_utc:
            return open_utc, close_utc

    # nödfall
    return session_bounds_utc(symbol, after_utc + timedelta(days=1))


def filter_open_symbols(symbols: list[str], *, grace_before: int = 0, grace_after: int = 0) -> list[str]:
    """
    Filtrera en lista tickers till de som är öppna just nu.
    """
    now = datetime.now(timezone.utc)
    out = []
    for s in symbols:
        if is_market_open(s, now, grace_before=grace_before, grace_after=grace_after):
            out.append(s)
    return out

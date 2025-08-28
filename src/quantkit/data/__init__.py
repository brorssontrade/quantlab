# src/quantkit/data/__init__.py
from __future__ import annotations

# Publika exports
__all__ = [
    "load_bars",
    "is_open_stockholm",
    "is_open_us",
    "is_market_open",
    "next_open_close_utc",
]

# Importera marknadstider
from .market_hours import (
    is_open_stockholm,
    is_open_us,
    is_market_open,
    next_open_close_utc,
)

# Importera den riktiga loadern
from .eodhd_loader import load_bars as _load_bars  # type: ignore


def load_bars(
    symbol: str,
    interval: str = "EOD",
    days: int = 10,
    debug: bool = False,
    **kwargs,
):
    """
    Tunn wrapper som gör API:t bakåtkompatibelt: vi accepterar
    (och ignorerar) borttagna/okända kwargs (t.ex. 'cached').
    """
    kwargs.pop("cached", None)  # lugna gamla anrop
    # Ignorera övriga okända kwargs utan att krascha:
    # kwargs kan innehålla framtida parametrar – vi skickar dem inte vidare.
    return _load_bars(symbol, interval=interval, days=days, debug=debug)

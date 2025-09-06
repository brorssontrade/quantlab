from __future__ import annotations

__all__ = ["load_bars"]

def load_bars(*args, **kwargs):
    # Lazy import för att undvika import-time beroenden i runner/lokalt
    from .eodhd_loader import load_bars as _load_bars
    return _load_bars(*args, **kwargs)

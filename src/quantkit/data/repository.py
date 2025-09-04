from __future__ import annotations
import pandas as pd
from typing import Literal
from ..config import Settings
from .eodhd_client import fetch_timeseries

def get_timeseries(symbol: str, timeframe: Literal['5m','1h','1d'], settings: Settings, force: bool=False) -> pd.DataFrame:
    return fetch_timeseries(symbol, timeframe=timeframe, api_key=settings.eodhd_api_key, force=force)

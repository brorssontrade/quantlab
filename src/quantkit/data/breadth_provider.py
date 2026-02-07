# src/quantkit/data/breadth_provider.py
"""
BreadthProvider: Historical market breadth data for ADR/ADL/ADR_B indicators.

Breadth data represents the number of advancing and declining stocks in a market
(e.g., NYSE, NASDAQ, or combined US markets) for each trading day.

TradingView uses this data for:
- ADR (Advance/Decline Ratio): advances / declines per bar
- ADR_B (Advance/Decline Ratio Bars): rolling sum of advances / rolling sum of declines
- ADL (Advance/Decline Line): cumulative sum of (advances - declines)

Data Format:
    BreadthBar { time: datetime, advances: int, declines: int, unchanged: int? }

Market Keys:
    - "US": Combined NYSE + NASDAQ (TradingView default for US stocks)
    - "NYSE": NYSE only
    - "NASDAQ": NASDAQ only
"""
from __future__ import annotations

import os
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional, Literal

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# Path to breadth data storage
BREADTH_DATA_DIR = Path("storage/breadth")
BREADTH_CACHE: Dict[str, pd.DataFrame] = {}


class BreadthBar:
    """Single breadth data point."""
    def __init__(self, time: datetime, advances: int, declines: int, unchanged: int = 0):
        self.time = time
        self.advances = advances
        self.declines = declines
        self.unchanged = unchanged
    
    def to_dict(self) -> dict:
        return {
            "time": self.time.isoformat() if isinstance(self.time, datetime) else str(self.time),
            "advances": self.advances,
            "declines": self.declines,
            "unchanged": self.unchanged,
        }


def get_market_key_for_symbol(symbol: str) -> str:
    """
    Determine the market key for a symbol.
    
    TradingView behavior (needs verification):
    - Most US stocks use a combined US market breadth
    - Could be exchange-specific (NYSE vs NASDAQ)
    
    For now, we use "US" for all US symbols.
    """
    # Normalize symbol
    sym = symbol.upper().strip()
    
    # Check suffix
    if sym.endswith(".US") or sym.endswith(".NYSE") or sym.endswith(".NASDAQ"):
        return "US"
    
    # Swedish stocks
    if sym.endswith(".ST"):
        return "SE"
    
    # Default to US
    return "US"


def load_breadth_series(
    market_key: str,
    timeframe: str = "1d",
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> pd.DataFrame:
    """
    Load historical breadth data for a market.
    
    Returns DataFrame with columns: time (UTC), advances, declines, unchanged
    
    Data sources (in priority order):
    1. Cached parquet file: storage/breadth/{market_key}_{timeframe}.parquet
    2. Computed from historical constituent data (expensive)
    3. Empty DataFrame if no data available
    
    Note: ADL requires historical seed value for parity. If data starts partway
    through history, ADL values won't match TradingView.
    """
    cache_key = f"{market_key}_{timeframe}"
    
    # Check cache
    if cache_key in BREADTH_CACHE:
        df = BREADTH_CACHE[cache_key].copy()
        return _filter_date_range(df, start, end)
    
    # Try to load from parquet
    parquet_path = BREADTH_DATA_DIR / f"{market_key}_{timeframe}.parquet"
    if parquet_path.exists():
        try:
            df = pd.read_parquet(parquet_path)
            if "time" in df.columns:
                df["time"] = pd.to_datetime(df["time"], utc=True)
            BREADTH_CACHE[cache_key] = df
            return _filter_date_range(df.copy(), start, end)
        except Exception as e:
            logger.warning(f"Failed to load breadth data from {parquet_path}: {e}")
    
    # No data available
    logger.info(f"No breadth data available for {market_key}_{timeframe}")
    return pd.DataFrame(columns=["time", "advances", "declines", "unchanged"])


def _filter_date_range(df: pd.DataFrame, start: Optional[datetime], end: Optional[datetime]) -> pd.DataFrame:
    """Filter DataFrame by date range."""
    if df.empty:
        return df
    
    if "time" not in df.columns:
        return df
    
    if start is not None:
        start_utc = start if start.tzinfo else start.replace(tzinfo=timezone.utc)
        df = df[df["time"] >= start_utc]
    
    if end is not None:
        end_utc = end if end.tzinfo else end.replace(tzinfo=timezone.utc)
        df = df[df["time"] <= end_utc]
    
    return df.reset_index(drop=True)


def compute_adl_seed(market_key: str, as_of_date: Optional[date] = None) -> int:
    """
    Get the ADL seed value (cumulative sum up to a date).
    
    TradingView's ADL has a specific historical starting point. Without knowing
    their exact seed, our ADL values will differ in absolute level (but shape
    should match if we have the same advances/declines data).
    
    For parity, we need to either:
    1. Match TV's historical seed exactly (requires knowing their starting point)
    2. Use relative ADL (reset at some anchor point)
    
    Returns 0 for now - will need calibration against TV reference.
    """
    # TODO: Calibrate seed against TradingView reference values
    # For now, start at 0 (relative mode)
    return 0


def save_breadth_series(
    market_key: str,
    timeframe: str,
    df: pd.DataFrame,
) -> Path:
    """Save breadth data to parquet for caching."""
    BREADTH_DATA_DIR.mkdir(parents=True, exist_ok=True)
    parquet_path = BREADTH_DATA_DIR / f"{market_key}_{timeframe}.parquet"
    
    # Normalize columns
    if "time" in df.columns:
        df["time"] = pd.to_datetime(df["time"], utc=True)
    
    df.to_parquet(parquet_path, index=False)
    
    # Update cache
    cache_key = f"{market_key}_{timeframe}"
    BREADTH_CACHE[cache_key] = df.copy()
    
    logger.info(f"Saved {len(df)} breadth bars to {parquet_path}")
    return parquet_path


def compute_breadth_from_constituents(
    constituent_ohlcv: Dict[str, pd.DataFrame],
    market_key: str,
) -> pd.DataFrame:
    """
    Compute breadth data from constituent OHLCV data.
    
    For each date, count stocks where:
    - Advancing: close > previous close
    - Declining: close < previous close
    - Unchanged: close == previous close
    
    Args:
        constituent_ohlcv: Dict mapping symbol -> DataFrame with 'ts', 'close' columns
        market_key: Market identifier (e.g., "US", "NYSE", "NASDAQ")
    
    Returns:
        DataFrame with columns: time, advances, declines, unchanged
    """
    if not constituent_ohlcv:
        return pd.DataFrame(columns=["time", "advances", "declines", "unchanged"])
    
    # Collect all unique dates
    all_dates = set()
    for sym, df in constituent_ohlcv.items():
        if "ts" in df.columns:
            dates = pd.to_datetime(df["ts"], utc=True).dt.date.unique()
            all_dates.update(dates)
    
    all_dates = sorted(all_dates)
    
    if not all_dates:
        return pd.DataFrame(columns=["time", "advances", "declines", "unchanged"])
    
    breadth_rows = []
    
    for d in all_dates:
        advances = 0
        declines = 0
        unchanged = 0
        
        for sym, df in constituent_ohlcv.items():
            if df.empty or "ts" not in df.columns or "close" not in df.columns:
                continue
            
            df["date"] = pd.to_datetime(df["ts"], utc=True).dt.date
            
            # Get today's close
            today_rows = df[df["date"] == d]
            if today_rows.empty:
                continue
            today_close = today_rows.iloc[-1]["close"]
            
            # Get previous day's close
            prev_dates = df[df["date"] < d].sort_values("date")
            if prev_dates.empty:
                continue  # No previous close to compare
            prev_close = prev_dates.iloc[-1]["close"]
            
            # Classify
            if today_close > prev_close:
                advances += 1
            elif today_close < prev_close:
                declines += 1
            else:
                unchanged += 1
        
        if advances > 0 or declines > 0 or unchanged > 0:
            breadth_rows.append({
                "time": datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc),
                "advances": advances,
                "declines": declines,
                "unchanged": unchanged,
            })
    
    return pd.DataFrame(breadth_rows)


# Placeholder for future breadth data ingestion
def ingest_breadth_data(
    market_key: str,
    source: Literal["eodhd", "polygon", "computed"] = "computed",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> int:
    """
    Ingest breadth data from a source and save to cache.
    
    This is a placeholder for future implementation. Options:
    1. Fetch from data provider with pre-computed breadth indices
    2. Compute from constituent data (requires fetching all constituent OHLCV)
    
    Returns number of bars ingested.
    """
    logger.warning(f"Breadth data ingestion not yet implemented for {source}")
    return 0

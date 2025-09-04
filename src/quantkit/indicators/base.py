from __future__ import annotations
import pandas as pd

def ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()

def sma(s: pd.Series, window: int) -> pd.Series:
    return s.rolling(window).mean()

def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    d = close.diff()
    gain = (d.clip(lower=0)).rolling(period).mean()
    loss = (-d.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, 1e-9)
    return 100 - (100 / (1 + rs))

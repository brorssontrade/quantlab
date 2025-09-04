from __future__ import annotations
import pandas as pd
from .base import Strategy
from ..indicators.base import ema

class EmaCross(Strategy):
    name = 'ema_cross'
    def __init__(self, fast: int = 10, slow: int = 30):
        assert fast < slow, 'fast EMA must be < slow EMA'
        self.fast = fast
        self.slow = slow
    def generate(self, df: pd.DataFrame) -> pd.Series:
        c = df['close']
        f = ema(c, self.fast)
        s = ema(c, self.slow)
        return (f > s).astype(int) - (f < s).astype(int)

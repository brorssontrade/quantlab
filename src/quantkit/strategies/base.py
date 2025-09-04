from __future__ import annotations
import pandas as pd
from dataclasses import dataclass

@dataclass
class Signal:
    time: pd.Timestamp
    side: str  # 'BUY' or 'SELL'
    strength: float = 1.0

class Strategy:
    name: str = 'base'
    def generate(self, df: pd.DataFrame) -> pd.Series:
        raise NotImplementedError

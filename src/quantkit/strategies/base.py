from __future__ import annotations
import pandas as pd
from dataclasses import dataclass
from typing import Callable, Dict, Any, Optional


@dataclass
class Signal:
    time: pd.Timestamp
    side: str  # 'BUY' or 'SELL'
    strength: float = 1.0


@dataclass
class StrategySpec:
    """Strategy specification for registry."""
    id: str
    name: str
    generate: Optional[Callable[[pd.DataFrame, Dict[str, Any]], pd.Series]] = None
    default_params: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.default_params is None:
            self.default_params = {}

    def generate(self, df: pd.DataFrame) -> pd.Series:
        raise NotImplementedError

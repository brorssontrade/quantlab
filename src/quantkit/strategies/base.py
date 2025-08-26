from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Dict

import pandas as pd

@dataclass
class StrategySpec:
    id: str
    name: str
    direction: str                    # "long" eller "short"
    defaults: Dict[str, object] = field(default_factory=dict)
    description: str = ""
    # sätts av registret:
    generate: Callable[[pd.DataFrame, Dict[str, object]], dict] | None = None

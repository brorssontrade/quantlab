from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, Optional, Sequence, Tuple

@dataclass
class IndicatorSpec:
    id: str
    name: str
    inputs: Sequence[str] = field(default_factory=tuple)     # t.ex. ("close",) eller ("high","low","close")
    params: Dict[str, object] = field(default_factory=dict)
    outputs: Optional[Sequence[str]] = None                  # None = en Serie; annars DataFrame med kolumnnamn
    description: str = ""
    # sätts av registret när modulen laddas
    compute: Optional[Callable] = None

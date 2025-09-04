from __future__ import annotations
from pathlib import Path
def ensure_parent(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)

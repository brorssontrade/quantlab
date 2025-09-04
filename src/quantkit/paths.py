# src/quantkit/paths.py
from __future__ import annotations
from pathlib import Path

def _project_root() -> Path:
    here = Path(__file__).resolve()
    # Försök hitta repo-roten (som innehåller "storage/")
    for p in [here.parents[3], here.parents[2], here.parents[1], Path.cwd()]:
        try:
            if (p / "storage").exists():
                return p
        except Exception:
            pass
    return Path.cwd()

PROJECT_ROOT = _project_root()

STORAGE_DIR     = PROJECT_ROOT / "storage"
CACHE_EODHD_DIR = STORAGE_DIR / "cache" / "eodhd"
SHARDS_DIR      = STORAGE_DIR / "shards"
SNAPSHOTS_DIR   = STORAGE_DIR / "snapshots"

# se till att katalogerna finns
for d in [CACHE_EODHD_DIR, SHARDS_DIR, SNAPSHOTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

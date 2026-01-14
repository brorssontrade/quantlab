"""Optional parquet reading utilities."""
from pathlib import Path
from typing import Optional
import pandas as pd


def read_parquet_optional(path: Path) -> Optional[pd.DataFrame]:
    """Read parquet file if it exists and is valid.
    
    Returns DataFrame or None if file doesn't exist or can't be read.
    """
    try:
        if not path.exists():
            return None
        return pd.read_parquet(path)
    except Exception:
        return None

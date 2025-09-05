from __future__ import annotations

from pathlib import Path
import pandas as pd

try:
    import pyarrow as pa  # noqa: F401
    import pyarrow.parquet as pq
except Exception as exc:  # pragma: no cover
    pq = None
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


def _ensure_parent(path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def has_file(path: str | Path) -> bool:
    return Path(path).is_file()


def parquet_read(path: str | Path) -> pd.DataFrame:
    if _IMPORT_ERROR is not None:
        raise RuntimeError(f"pyarrow is not available: {_IMPORT_ERROR}")
    p = Path(path)
    if not p.is_file():
        return pd.DataFrame()
    table = pq.read_table(p)
    return table.to_pandas(types_mapper=None)


def parquet_write(df: pd.DataFrame, path: str | Path) -> None:
    if _IMPORT_ERROR is not None:
        raise RuntimeError(f"pyarrow is not available: {_IMPORT_ERROR}")
    p = _ensure_parent(path)
    table = pa.Table.from_pandas(df)
    pq.write_table(table, p)


# ---- Back-compat för äldre moduler som importerar dessa namn
def read_cache(path: str | Path) -> pd.DataFrame:
    return parquet_read(path)


def write_cache(df: pd.DataFrame, path: str | Path) -> None:
    parquet_write(df, path)


def merge_bars(
    df_new: pd.DataFrame,
    path: str | Path,
    key_cols: tuple[str, ...] = ("Date", "Symbol"),
) -> pd.DataFrame:
    """
    Merga nya bar-rader med existerande parquet på `path` via nyckelkolumner.
    Behåller senaste per nyckel.
    """
    if has_file(path):
        df_old = parquet_read(path)
        if not df_old.empty:
            cols = sorted(set(df_old.columns) | set(df_new.columns))
            df_old = df_old.reindex(columns=cols)
            df_new = df_new.reindex(columns=cols)
            out = pd.concat([df_old, df_new], ignore_index=True)
            out = out.drop_duplicates(subset=list(key_cols), keep="last")
            out = out.sort_values(list(key_cols))
            parquet_write(out, path)
            return out
    parquet_write(df_new, path)
    return df_new


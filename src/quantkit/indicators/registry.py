from __future__ import annotations
from dataclasses import replace
from typing import Dict, Any, List, Tuple
import importlib, pkgutil, pathlib
import pandas as pd
from .base import IndicatorSpec

_REGISTRY: Dict[str, IndicatorSpec] = {}
_POPULATED = False

def register(spec: IndicatorSpec, compute_func):
    spec = replace(spec)
    spec.compute = compute_func  # type: ignore[attr-defined]
    _REGISTRY[spec.id] = spec

def _register_alias_from(base: IndicatorSpec, alias_id: str, alias_params: Dict[str, Any],
                         alias_name: str | None, alias_desc: str | None):
    def _compute(df: pd.DataFrame, **kwargs):
        p = {**alias_params, **kwargs}
        return base.compute(df, **p)  # type: ignore[misc]
    alias = IndicatorSpec(
        id=alias_id,
        name=alias_name or alias_id.upper(),
        inputs=base.inputs,
        params={},
        outputs=base.outputs,
        description=alias_desc or f"Alias för {base.id}({alias_params}).",
    )
    alias.compute = _compute  # type: ignore[attr-defined]
    _REGISTRY[alias.id] = alias

def ensure_populated(reset: bool = False) -> None:
    global _POPULATED, _REGISTRY
    if reset:
        _REGISTRY = {}; _POPULATED = False
    if _POPULATED:
        return
    pkg = __package__
    pkg_path = pathlib.Path(__file__).parent
    for m in pkgutil.iter_modules([str(pkg_path)]):
        if m.name in {"__init__", "base", "registry"} or m.name.startswith("_"):
            continue
        mod = importlib.import_module(f"{pkg}.{m.name}")
        spec = getattr(mod, "INDICATOR", None)
        fn   = getattr(mod, "compute", None)
        if spec is not None and callable(fn):
            register(spec, fn)
            aliases: List[Tuple[str, Dict[str, Any], str | None, str | None]] = getattr(mod, "ALIASES", [])
            if aliases:
                base = _REGISTRY.get(spec.id)
                if base:
                    for alias_id, params, name, desc in aliases:
                        _register_alias_from(base, alias_id, params, name, desc)
    _POPULATED = True

def list_indicators(as_df: bool = False):
    ensure_populated()
    items = []
    for k, s in sorted(_REGISTRY.items(), key=lambda kv: kv[0]):
        items.append(dict(id=s.id, name=s.name, inputs=list(s.inputs),
                          default_params=s.params, description=s.description))
    if as_df:
        return pd.DataFrame(items)
    return items

def compute(indicator_id: str, df: pd.DataFrame, **params):
    ensure_populated()
    spec = _REGISTRY[indicator_id]
    p = {**(spec.params or {}), **(params or {})}
    return spec.compute(df, **p)  # type: ignore[misc]

def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalisera OHLCV och *bevara* tidsstämpel.
    Preferera en kolumn 'ts'/'timestamp'/'date' om den finns,
    annars använd datetime-index om möjligt.
    Alltid UTC.
    """
    if df is None or df.empty:
        return pd.DataFrame(columns=["open","high","low","close","volume","ts"])

    # map lowercase -> original name
    cols = {c.lower(): c for c in df.columns}

    out = pd.DataFrame(index=None)  # vi låter bli att ärva index

    # OHLCV
    for want in ("open", "high", "low", "close", "volume"):
        src = cols.get(want) or cols.get(want.capitalize())
        if src is not None:
            out[want] = pd.to_numeric(df[src], errors="coerce")

    # TS-källa (kolumn) i prioriterad ordning
    ts_src = None
    for cand in ("ts", "timestamp", "date", "datetime"):
        if cand in cols:
            ts_src = cols[cand]
            break

    if ts_src is not None:
        ts = pd.to_datetime(df[ts_src], utc=True, errors="coerce")
    elif isinstance(df.index, pd.DatetimeIndex):
        ts = pd.to_datetime(df.index, utc=True)
    else:
        # sista fallback – försök tolka index ändå (kan bli NaT, men bättre än 1970+nanos)
        ts = pd.to_datetime(df.index, utc=True, errors="coerce")

    out["ts"] = ts
    out = out.dropna(subset=["ts"])  # släng rader utan giltig ts
    # valfritt: sortera på tid
    out = out.sort_values("ts").reset_index(drop=True)
    return out


def write_html_catalog(out_path: str | pathlib.Path, reset: bool = False) -> str:
    ensure_populated(reset=reset)
    df = list_indicators(as_df=True)
    out_path = pathlib.Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    html = [
        "<html><head><meta charset='utf-8'><title>Indicators – Catalog</title>",
        "<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;max-width:1100px;margin:24px auto;padding:0 12px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px} th{background:#f7f7f7;text-align:left}</style>",
        "</head><body>",
        "<h1>Indicators – Catalog</h1>",
        "<p>Auto-genererad lista från <code>quantkit.indicators</code>.</p>",
        df.to_html(index=False),
        "</body></html>",
    ]
    out_path.write_text("\n".join(html), encoding="utf-8")
    return str(out_path)

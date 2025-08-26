from __future__ import annotations
import importlib, pkgutil, pathlib
from typing import Dict, Any
import pandas as pd
from .base import StrategySpec

_REGISTRY: Dict[str, StrategySpec] = {}
_POPULATED = False

def _register(spec: StrategySpec, generate):
    spec.generate = generate
    _REGISTRY[spec.id] = spec

def ensure_populated(reset: bool = False) -> None:
    """Autoskanna quantkit.strategies och importera moduler som exponerar STRATEGY + generate."""
    global _POPULATED, _REGISTRY
    if reset:
        _REGISTRY.clear(); _POPULATED = False
    if _POPULATED:
        return
    pkg = importlib.import_module(__name__.rsplit(".", 1)[0])  # quantkit.strategies
    pkg_path = pathlib.Path(pkg.__file__).parent
    skip = {"__init__","init","base","registry","__pycache__","indicators"}
    for m in pkgutil.iter_modules([str(pkg_path)]):
        name = m.name
        if name in skip or name.startswith("_"):
            continue
        mod = importlib.import_module(f"{pkg.__name__}.{name}")
        spec = getattr(mod, "STRATEGY", None)
        gen  = getattr(mod, "generate", None) or getattr(mod, "_generate", None)
        if spec is not None and gen is not None and isinstance(spec, StrategySpec):
            _register(spec, gen)
    _POPULATED = True

def get(key: str) -> StrategySpec:
    ensure_populated()
    return _REGISTRY[key]

def list_strategies(as_df: bool = False):
    ensure_populated()
    if not as_df:
        return list(_REGISTRY.values())
    rows = []
    for spec in _REGISTRY.values():
        rows.append(dict(
            id=spec.id, name=spec.name, direction=spec.direction,
            defaults=spec.defaults, description=spec.description
        ))
    return pd.DataFrame(rows).sort_values("id").reset_index(drop=True)

def generate(key: str, df: pd.DataFrame, params: Dict[str, Any] | None = None) -> dict:
    ensure_populated()
    spec = _REGISTRY[key]
    if spec.generate is None:
        raise RuntimeError(f"Strategi '{key}' saknar generate-funktion")
    return spec.generate(df, params or {})

def write_html_catalog(out_path: str | pathlib.Path, reset: bool = False) -> str:
    ensure_populated(reset=reset)
    df = list_strategies(as_df=True)
    html = [
        "<html><head><meta charset='utf-8'><title>Strategies – Catalog</title>",
        "<style>body{font-family:sans-serif;max-width:1100px;margin:24px auto;} table{width:100%;border-collapse:collapse} th,td{padding:8px;border-bottom:1px solid #ddd} th{text-align:left}</style>",
        "</head><body><h1>Strategies – Catalog</h1>",
        "<p>Auto-genererad lista från <code>quantkit.strategies</code>.</p>",
        df.to_html(index=False, escape=False),
        "</body></html>",
    ]
    out_path = pathlib.Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(html), encoding="utf-8")
    return str(out_path)

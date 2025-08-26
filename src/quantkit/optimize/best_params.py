# src/quantkit/optimize/best_params.py
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, Optional
from functools import lru_cache
import json

try:
    import yaml  # type: ignore
    _HAVE_YAML = True
except Exception:
    _HAVE_YAML = False

ROOT_STD = Path("data/optuna/best").resolve()
ROOT_STD.mkdir(parents=True, exist_ok=True)

def _load_json(p: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None

def _load_yaml(p: Path) -> Optional[Dict[str, Any]]:
    if not _HAVE_YAML: return None
    try:
        return yaml.safe_load(p.read_text(encoding="utf-8"))
    except Exception:
        return None

def _maybe_extract_params(d: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(d, dict): return None
    for k in ("best_params", "params"):
        v = d.get(k)
        if isinstance(v, dict):
            return dict(v)
    if "best" in d and isinstance(d["best"], dict):
        bp = d["best"].get("params")
        if isinstance(bp, dict): 
            return dict(bp)
    return None

def _try_one(p: Path) -> Optional[Dict[str, Any]]:
    if not p.exists(): 
        return None
    if p.suffix.lower() == ".json":
        d = _load_json(p)
    else:
        d = _load_yaml(p)
    return _maybe_extract_params(d or {})

def _exch_from_symbol(symbol: str) -> Optional[str]:
    # ABB.ST -> ST, NVDA.US -> US
    if "." in symbol:
        return symbol.rsplit(".", 1)[-1]
    return None

@lru_cache(maxsize=1024)
def load_best_params(symbol: str, strategy: str) -> Optional[Dict[str, Any]]:
    """
    Hämta bästa parametrar i följande ordning:
      1) data/optuna/best/{symbol}__{strategy}.json|yaml
      2) data/optuna/best/{EXCH}__{strategy}.json|yaml   (EXCH = ST/US/…)
      3) data/optuna/best/_ALL__{strategy}.json|yaml
      4) reports/optuna/<symbol>/<strategy>/{best.json|best.yaml|result.json}
    """
    candidates = []
    exch = _exch_from_symbol(symbol)
    # standardplats
    for ext in (".json", ".yaml", ".yml"):
        candidates.append(ROOT_STD / f"{symbol}__{strategy}{ext}")
        if exch:
            candidates.append(ROOT_STD / f"{exch}__{strategy}{ext}")
        candidates.append(ROOT_STD / f"_ALL__{strategy}{ext}")

    # gamla/externa resultat
    base = Path("reports/optuna") / symbol / strategy
    for ext in (".json", ".yaml", ".yml"):
        for nm in ("best", "best_params", "result"):
            candidates.append(base / f"{nm}{ext}")

    for p in candidates:
        params = _try_one(p)
        if params:
            return params
    return None

def save_best_params(symbol: str, strategy: str, params: Dict[str, Any]) -> Path:
    out = ROOT_STD / f"{symbol}__{strategy}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"best_params": params}, indent=2), encoding="utf-8")
    # clear cache entry
    try:
        load_best_params.cache_clear()  # type: ignore[attr-defined]
    except Exception:
        pass
    return out

def harvest_from_path(result_path: str | Path, symbol: str, strategy: str) -> Optional[Path]:
    p = Path(result_path)
    if not p.exists(): 
        return None

    if p.is_dir():
        for cand in ("best.json","best.yaml","best_params.json","result.json","result.yaml"):
            q = p / cand
            params = _try_one(q)
            if params:
                return save_best_params(symbol, strategy, params)
        # fallback: första json/yaml
        for q in p.iterdir():
            if q.suffix.lower() in {".json",".yml",".yaml"}:
                params = _try_one(q)
                if params:
                    return save_best_params(symbol, strategy, params)
        return None

    params = _try_one(p)
    if params:
        return save_best_params(symbol, strategy, params)
    return None

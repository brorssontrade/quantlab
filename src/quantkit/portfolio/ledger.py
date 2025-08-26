# src/quantkit/portfolio/ledger.py
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict
import json
import pandas as pd

LEDGER = Path("data/portfolio/positions.json")
LEDGER.parent.mkdir(parents=True, exist_ok=True)

def _load() -> Dict[str, Any]:
    return json.loads(LEDGER.read_text(encoding="utf-8")) if LEDGER.exists() else {"positions":[]}

def _save(d: Dict[str, Any]):
    LEDGER.write_text(json.dumps(d, indent=2), encoding="utf-8")

def positions() -> pd.DataFrame:
    d = _load()
    return pd.DataFrame(d["positions"])

def open_position(symbol: str, qty: float, price: float, strategy: str, ts: str | None = None):
    d = _load()
    d["positions"].append(dict(symbol=symbol, qty=float(qty), avg_price=float(price),
                               strategy=strategy, ts=ts or pd.Timestamp.utcnow().isoformat()))
    _save(d)

def close_position(symbol: str, strategy: str | None = None):
    d = _load()
    new = []
    for p in d["positions"]:
        if p["symbol"] == symbol and (strategy is None or p["strategy"] == strategy):
            continue
        new.append(p)
    d["positions"] = new
    _save(d)

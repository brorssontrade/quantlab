# src/quantkit/data/eodhd_search.py
from __future__ import annotations
import os, requests, time
from typing import Optional, List, Dict, Any

EODHD_BASE = os.environ.get("EODHD_BASE", "https://eodhd.com/api")
EODHD_TOKEN = os.environ.get("EODHD_API_TOKEN", "")

def search(query: str, limit: int = 10, exchange: Optional[str] = None) -> List[Dict[str, Any]]:
    if not EODHD_TOKEN:
        raise RuntimeError("EODHD_API_TOKEN saknas")
    url = f"{EODHD_BASE}/search/{query}"
    params = {"api_token": EODHD_TOKEN, "limit": int(limit), "fmt": "json"}
    if exchange:
        params["exchange"] = exchange
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict):
        data = data.get("data", [])
    return data or []

def pick_symbol(candidates: List[Dict[str, Any]], prefs: Optional[list[str]] = None) -> Optional[str]:
    """
    Välj "CODE.EXCHANGE" med enkel prioritering på exchange (t.ex. ['SE','STO','XSTO']).
    Kandidater returneras normalt med fält som code, exchange, name, etc.
    """
    if not candidates:
        return None
    if prefs:
        for p in prefs:
            for c in candidates:
                code = c.get("code") or c.get("symbol")
                exch = c.get("exchangeShortName") or c.get("exchange")
                if code and exch and (exch.upper() == p.upper()):
                    return f"{code}.{exch}"
    # fallback: första rimliga
    c = candidates[0]
    code = c.get("code") or c.get("symbol")
    exch = c.get("exchangeShortName") or c.get("exchange")
    if code and exch:
        return f"{code}.{exch}"
    return None

# src/quantkit/data/eodhd_client.py
from __future__ import annotations
import os, time
from typing import Any, Dict
import requests

BASE_URL = os.getenv("EODHD_BASE_URL", "https://eodhd.com/api")
API_KEY = os.getenv("EODHD_API_KEY", "")

class EODHDError(RuntimeError):
    pass

def http_get(path: str, params: Dict[str, Any] | None = None) -> Any:
    if not API_KEY:
        raise EODHDError("EODHD_API_KEY saknas i miljön.")
    q = {**(params or {})}
    # tillåt 'from_' -> 'from' i URL
    if "from_" in q:
        q["from"] = q.pop("from_")
    q["api_token"] = API_KEY
    q["fmt"] = "json"
    url = f"{BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    r = requests.get(url, params=q, timeout=30)
    if r.status_code == 429:
        # enkel retry
        time.sleep(1.0)
        r = requests.get(url, params=q, timeout=30)
    r.raise_for_status()
    data = r.json()
    # EODHD kan returnera dict med 'errors'
    if isinstance(data, dict) and data.get("errors"):
        raise EODHDError(str(data["errors"]))
    return data

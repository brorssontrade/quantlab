from __future__ import annotations
import io
import os
from pathlib import Path
from typing import Optional

import pandas as pd
import requests


def _safe_name(symbol: str) -> str:
    # Samma filnamnslogik som i eodhd_loader/cache.py
    return symbol.replace("/", "_")


def _local_cache_path(symbol: str, interval: str) -> Path:
    safe = _safe_name(symbol)
    return Path("data/cache/eodhd") / f"{safe}__{interval}.csv"


def load_cached_csv(
    symbol: str,
    interval: str,
    *,
    repo: str = "brorssontrade/quantlab",
    branch: str = "data",
    token: Optional[str] = None,
    prefer_local: bool = True,
) -> pd.DataFrame:
    """
    Läs en cachefil (CSV) för given symbol/interval.
    1) Försök lokalt under data/cache/eodhd/
    2) Om saknas, hämta från GitHub 'data'-branchen (kräver token om repo är privat).
       Stödjer både 'raw' och base64 JSON-respons.

    Kolumnen 'ts' parse:as som UTC datetimestamp om den finns.
    Returnerar tom DataFrame om filen saknas.
    """
    # 1) lokal
    p = _local_cache_path(symbol, interval)
    if prefer_local and p.exists():
        try:
            df = pd.read_csv(p)
            if "ts" in df.columns:
                df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
            return df
        except Exception:
            pass  # fall back to remote

    # 2) remote (GitHub)
    if token is None:
        token = (
            os.getenv("GITHUB_TOKEN")
            or os.getenv("GH_TOKEN")
            or os.getenv("GITHUB_PAT")
        )

    path_in_repo = f"data/cache/eodhd/{_safe_name(symbol)}__{interval}.csv"
    api_url = f"https://api.github.com/repos/{repo}/contents/{path_in_repo}?ref={branch}"

    headers = {"Accept": "application/vnd.github.v3.raw"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        r = requests.get(api_url, headers=headers, timeout=30)
        if r.status_code == 200 and r.headers.get("Content-Type", "").startswith("text/plain"):
            # Raw-innehåll (tack vare Accept: raw)
            df = pd.read_csv(io.StringIO(r.text))
        elif r.status_code == 200:
            # Kan vara JSON med base64-krypterat innehåll
            js = r.json()
            if isinstance(js, dict) and js.get("encoding") == "base64":
                import base64
                content = base64.b64decode(js.get("content", "")).decode("utf-8", errors="replace")
                df = pd.read_csv(io.StringIO(content))
            else:
                return pd.DataFrame()
        elif r.status_code == 404:
            return pd.DataFrame()
        else:
            raise RuntimeError(f"GitHub API {r.status_code}: {r.text[:200]}")
    except Exception as e:
        raise RuntimeError(f"Misslyckades läsa remote cache: {e}") from e

    if "ts" in df.columns:
        df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    return df

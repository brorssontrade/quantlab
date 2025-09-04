# src/quantkit/env.py
from __future__ import annotations
import os
from functools import lru_cache

try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # python-dotenv är optional
    def load_dotenv(*args, **kwargs):  # no-op
        return False

@lru_cache(maxsize=1)
def _load_env() -> None:
    # Ladda .env om den finns – men skriv inte över redan satta env
    load_dotenv(override=False)

def get_eodhd_api_key(strict: bool = False) -> str:
    """
    Hämtar API-nyckeln från EODHD_API_KEY eller EODHD_TOKEN.
    strict=True -> validerar och kastar med tydligt fel om den ser konstig ut.
    """
    _load_env()
    val = (os.getenv("EODHD_API_KEY") or os.getenv("EODHD_TOKEN") or "").strip()
    if strict:
        if (not val) or ("\n" in val) or ("=" in val) or ("API keys" in val):
            raise RuntimeError(
                "EODHD_API_KEY ser fel ut. Sätt variabeln till SJÄLVA tokensträngen (t.ex. 'eod_...')."
            )
    return val

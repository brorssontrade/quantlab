from __future__ import annotations
from pathlib import Path
from typing import List, Optional
import yaml
from pydantic import BaseModel, Field

class AppConfig(BaseModel):
    watchlist: List[str] = Field(default_factory=list)
    # övriga nycklar får finnas, vi bryr oss inte här.

def load_app_config(path: str | Path = "config/settings.yml") -> AppConfig:
    p = Path(path)
    raw = yaml.safe_load(p.read_text(encoding="utf-8")) or {}

    # Migration: om filen har "items: [{name,code}, ...]" i stället för "watchlist: [codes]"
    if not raw.get("watchlist"):
        items = raw.get("items") or []
        if isinstance(items, list):
            raw["watchlist"] = [it.get("code") for it in items if isinstance(it, dict) and it.get("code")]

    # Om även config/watchlist.yml finns – mergar in
    wlp = Path("config/watchlist.yml")
    if wlp.exists():
        wr = yaml.safe_load(wlp.read_text(encoding="utf-8")) or {}
        if isinstance(wr.get("items"), list):
            extra = [it.get("code") for it in wr["items"] if isinstance(it, dict) and it.get("code")]
            raw["watchlist"] = list(dict.fromkeys((raw.get("watchlist") or []) + extra))

    return AppConfig(**raw)

class Settings(BaseModel):
    # bara det vi använder här
    eodhd_api_key: str = Field(default_factory=lambda: (Path(".env").read_text(encoding="utf-8") if Path(".env").exists() else "").strip() or "")

# src/quantkit/config.py
from __future__ import annotations
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    data_dir: Path = Path("storage")
    reports_dir: Path = Path("reports")
    risk_free_rate: float = 0.01
    alpha_vantage_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        case_sensitive=False,
        extra="ignore",     # ignorera okända env-nycklar
    )

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.reports_dir.mkdir(parents=True, exist_ok=True)
    return s

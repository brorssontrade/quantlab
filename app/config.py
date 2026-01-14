from __future__ import annotations
import os
from functools import lru_cache
from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Quantlab Settings: Single source of truth for configuration.
    
    **Precedence** (highest to lowest):
    1. Environment variables (prefixed with QL_, e.g. QL_APP_NAME)
    2. YAML config file (config/settings.yml) — not yet implemented
    3. Hardcoded defaults below
    
    **Required secrets** (validated at startup):
    - EODHD_API_KEY: Required for live data fetch (set via env or .env file)
    
    **Usage**:
    ```python
    from app.config import get_settings
    settings = get_settings()  # Cached singleton
    ```
    """
    
    # Core application
    app_name: str = "QuantLab Local"
    db_url: str = "sqlite:///./artifacts/quantlab.db"
    optuna_out: Path = Path("artifacts/optuna")
    pipeline_config: Path = Path("strategies.json")
    default_prices: Path = Path("storage/ml/symbol_history.parquet")
    default_metric: str = "sharpe"
    default_cost_bps: float = 2.0
    scheduler_timezone: str = "UTC"
    
    # Data provider secrets (required for production)
    eodhd_api_key: str = Field(
        default="",
        description="EODHD API key (required for live data). Set via EODHD_API_KEY env var."
    )
    
    # Alpha Vantage (optional; used for fundamentals scoring)
    alphavantage_api_key: str | None = Field(default=None, env="ALPHAVANTAGE_API_KEY")
    alphavantage_max_calls_per_min: int = Field(default=5, env="ALPHAVANTAGE_MAX_CALLS_PER_MIN")
    alphavantage_cooldown_s: float = Field(default=0.5, env="ALPHAVANTAGE_COOLDOWN_S")
    
    # Frontend (Vite) config
    vite_enable_legacy_tv: str = Field(
        default="false",
        description="Vite flag: enable legacy TradingView widget (false = ChartsPro)"
    )
    
    # Development notes
    llm_note: str = Field(
        default="",
        description="Developer note for LLM context (e.g., current sprint focus)"
    )
    
    # FX base currency
    fx_base: str = "SEK"

    @field_validator("fx_base", mode="before")
    @classmethod
    def _normalize_fx_base(cls, value: str | None) -> str:
        if not value:
            return "SEK"
        return str(value).strip().upper()
    
    @field_validator("eodhd_api_key", mode="after")
    @classmethod
    def _validate_eodhd_key(cls, value: str) -> str:
        """EODHD key loaded from env; empty string allowed (demo mode)."""
        return value.strip() if value else ""

    class Config:
        env_prefix = "QL_"
        case_sensitive = False
        env_file = ".env"  # Auto-load .env if present
        env_file_encoding = "utf-8"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Returns cached Settings singleton.
    
    Precedence: ENV > .env file > defaults.
    Raises: pydantic.ValidationError if required fields invalid.
    """
    return Settings()


def validate_required_secrets() -> None:
    """
    Validates that required secrets are set at startup.
    
    Raises RuntimeError if critical secrets missing.
    Call this during FastAPI lifespan/startup to fail early.
    """
    settings = get_settings()
    
    # EODHD key is not strictly required (app can run in demo mode),
    # but warn if missing in production environments
    if not settings.eodhd_api_key:
        # Check if we're in production (example heuristic: env var QL_ENV=production)
        env = os.getenv("QL_ENV", "development").lower()
        if env == "production":
            raise RuntimeError(
                "EODHD_API_KEY is required in production mode. "
                "Set via environment variable or .env file."
            )
        # Development: just log warning (would need logger here; skip for now)
    
    # Add validation for other required secrets as needed
    # Example: LLM_API_URL if assistant feature required


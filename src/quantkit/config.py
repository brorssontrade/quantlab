from pydantic import BaseModel
from dotenv import load_dotenv
import os

class Settings(BaseModel):
    eodhd_token: str | None = None
    alpha_vantage_api_key: str | None = None
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    slack_webhook_url: str | None = None
    parquet_dir: str = "./storage/parquet"
    duckdb_path: str = "./db/quant.duckdb"
    tz: str = "Europe/Stockholm"

def load_settings() -> Settings:
    load_dotenv(override=False)
    return Settings(
        eodhd_token=os.getenv("EODHD_TOKEN"),
        alpha_vantage_api_key=os.getenv("ALPHA_VANTAGE_API_KEY"),
        telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN"),
        telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID"),
        slack_webhook_url=os.getenv("SLACK_WEBHOOK_URL"),
        parquet_dir=os.getenv("PARQUET_DIR", "./storage/parquet"),
        duckdb_path=os.getenv("DUCKDB_PATH", "./db/quant.duckdb"),
        tz=os.getenv("TZ", "Europe/Stockholm"),
    )


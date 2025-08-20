import os, requests


TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.getenv("TELEGRAM_CHAT_ID", "")


def notify_telegram(text: str):
if not TG_TOKEN or not TG_CHAT:
return False
try:
requests.get(
f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
params={"chat_id": TG_CHAT, "text": text}, timeout=10
)
return True
except Exception:
return False
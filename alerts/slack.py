import os, json, requests


SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")


def notify_slack(text: str):
url = SLACK_WEBHOOK_URL
if not url:
return False
try:
requests.post(url, json={"text": text}, timeout=10)
return True
except Exception:
return False
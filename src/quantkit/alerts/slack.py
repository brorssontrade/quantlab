from __future__ import annotations
import json, requests

def send_slack(webhook_url: str, text: str) -> None:
    if not webhook_url:
        return
    requests.post(webhook_url, data=json.dumps({'text': text}),
                  headers={'Content-Type':'application/json'}, timeout=10)

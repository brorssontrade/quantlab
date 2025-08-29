# src/quantkit/notify.py
from __future__ import annotations

import os
import sys
from typing import Optional

# "requests" finns redan i dina requirements; men faila aldrig hårt på notiser.
try:
    import requests  # type: ignore
except Exception:  # pragma: no cover
    requests = None  # type: ignore


def _run_url() -> str:
    server = os.getenv("GITHUB_SERVER_URL", "https://github.com").rstrip("/")
    repo = os.getenv("GITHUB_REPOSITORY", "").strip("/")
    run_id = os.getenv("GITHUB_RUN_ID", "")
    if repo and run_id:
        return f"{server}/{repo}/actions/runs/{run_id}"
    return ""


def notify(text: str) -> None:
    """
    Skicka enkel text till Slack (SLACK_WEBHOOK_URL) och/eller Telegram
    (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). Tysta fel – aldrig krasch.
    """
    try:
        if requests is None:
            raise RuntimeError("requests saknas")

        sent = False

        hook = os.getenv("SLACK_WEBHOOK_URL", "").strip()
        if hook:
            try:
                requests.post(hook, json={"text": text}, timeout=10)
                sent = True
            except Exception as e:  # pragma: no cover
                print(f"[notify] Slack fel: {e}", file=sys.stderr)

        tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        tg_chat = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        if tg_token and tg_chat:
            try:
                url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                requests.post(url, data={"chat_id": tg_chat, "text": text}, timeout=10)
                sent = True
            except Exception as e:  # pragma: no cover
                print(f"[notify] Telegram fel: {e}", file=sys.stderr)

        # Om inget är konfigurerat gör vi bara ingenting.
    except Exception as e:  # pragma: no cover
        print(f"[notify] generellt fel: {e}", file=sys.stderr)


def notify_signal(
    *,
    symbol: str,
    side: str,                        # "BUY" / "SELL" / "EXIT" / etc
    price: Optional[float] = None,
    ts_iso: Optional[str] = None,     # ISO8601 tid (UTC eller lokalt—du bestämmer)
    strategy: Optional[str] = None,
    note: Optional[str] = None,
    chart_url: Optional[str] = None,
) -> None:
    """
    Bekväm helper för strategisignaler. Använd där du *redan vet* att
    en signal triggat (t.ex. i din engine/backtest/live-handlare).
    """
    parts = []
    if strategy:
        parts.append(f"[{strategy}]")
    parts.append(f"{side} {symbol}")
    if price is not None:
        parts.append(f"@ {price:g}")
    if ts_iso:
        parts.append(f"({ts_iso})")

    head = " ".join(parts)
    lines = [head]

    if note:
        lines.append(note)
    if chart_url:
        lines.append(chart_url)

    run = _run_url()
    if run:
        lines.append(run)

    notify("\n".join(lines))

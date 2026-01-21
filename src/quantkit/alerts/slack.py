from __future__ import annotations
import json
import logging
import requests

logger = logging.getLogger(__name__)


def send_slack(webhook_url: str, text: str) -> bool:
    """Send a message to Slack via webhook.
    
    CI-safe: Returns False if webhook_url is missing or request fails.
    Never raises exceptions.
    
    Args:
        webhook_url: Slack incoming webhook URL
        text: Message text to send
        
    Returns:
        True if message was sent successfully, False otherwise
    """
    if not webhook_url:
        logger.debug("Slack webhook URL not configured, skipping notification")
        return False
    try:
        resp = requests.post(
            webhook_url,
            data=json.dumps({'text': text}),
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        resp.raise_for_status()
        return True
    except requests.RequestException as e:
        logger.warning(f"Slack notification failed: {e}")
        return False

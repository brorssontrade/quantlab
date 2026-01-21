from __future__ import annotations
import logging
import requests

logger = logging.getLogger(__name__)


def send_telegram(bot_token: str, chat_id: str, text: str) -> bool:
    """Send a message to Telegram via Bot API.
    
    CI-safe: Returns False if credentials are missing or request fails.
    Never raises exceptions.
    
    Args:
        bot_token: Telegram bot token
        chat_id: Telegram chat ID to send to
        text: Message text to send
        
    Returns:
        True if message was sent successfully, False otherwise
    """
    if not bot_token or not chat_id:
        logger.debug("Telegram credentials not configured, skipping notification")
        return False
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        resp = requests.post(url, data={'chat_id': chat_id, 'text': text}, timeout=10)
        resp.raise_for_status()
        return True
    except requests.RequestException as e:
        logger.warning(f"Telegram notification failed: {e}")
        return False

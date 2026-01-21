"""
Unified notification router with severity levels, channel routing, and deduplication.

This is the single source of truth for all outbound notifications.
"""
from __future__ import annotations
import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Literal, Optional

from .slack import send_slack
from .telegram import send_telegram

logger = logging.getLogger(__name__)


class NotificationLevel(str, Enum):
    """Notification severity levels."""
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    SIGNAL = "SIGNAL"  # Trading signals (BUY/SELL)


# Default channel routing by level
DEFAULT_ROUTING: dict[NotificationLevel, list[str]] = {
    NotificationLevel.INFO: ["slack"],
    NotificationLevel.WARN: ["slack"],
    NotificationLevel.ERROR: ["slack", "telegram"],
    NotificationLevel.SIGNAL: ["slack", "telegram"],
}


@dataclass
class NotificationConfig:
    """Configuration for notification channels."""
    slack_webhook_url: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    
    @classmethod
    def from_env(cls) -> "NotificationConfig":
        """Load config from environment variables."""
        return cls(
            slack_webhook_url=os.getenv("SLACK_WEBHOOK_URL", ""),
            telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
            telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
        )
    
    def is_configured(self, channel: str) -> bool:
        """Check if a channel is configured."""
        if channel == "slack":
            return bool(self.slack_webhook_url)
        elif channel == "telegram":
            return bool(self.telegram_bot_token and self.telegram_chat_id)
        return False
    
    def any_configured(self) -> bool:
        """Check if any channel is configured."""
        return self.is_configured("slack") or self.is_configured("telegram")


# In-memory dedupe cache (can be replaced with SQLite for persistence)
_dedupe_cache: dict[str, datetime] = {}
_DEDUPE_TTL = timedelta(hours=1)  # Don't repeat same notification within 1 hour


def _make_dedupe_key(text: str, level: NotificationLevel) -> str:
    """Create a deduplication key from message content."""
    content = f"{level.value}:{text}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def make_signal_key(
    symbol: str,
    strategy: str,
    signal: Literal["BUY", "SELL"],
    bar_time: Optional[str] = None
) -> str:
    """Create a deduplication key for trading signals.
    
    Args:
        symbol: Trading symbol (e.g., "AAPL")
        strategy: Strategy name (e.g., "EMA_CROSS")
        signal: Signal type ("BUY" or "SELL")
        bar_time: Optional bar timestamp for time-based dedupe
        
    Returns:
        Dedupe key string
    """
    parts = [symbol.upper(), strategy.upper(), signal.upper()]
    if bar_time:
        parts.append(bar_time)
    return ":".join(parts)


def _is_duplicate(key: str) -> bool:
    """Check if a notification with this key was recently sent."""
    now = datetime.now()
    
    # Clean old entries
    expired = [k for k, v in _dedupe_cache.items() if now - v > _DEDUPE_TTL]
    for k in expired:
        del _dedupe_cache[k]
    
    return key in _dedupe_cache


def _mark_sent(key: str) -> None:
    """Mark a notification key as sent."""
    _dedupe_cache[key] = datetime.now()


def clear_dedupe_cache() -> None:
    """Clear the deduplication cache. Useful for testing."""
    _dedupe_cache.clear()


def notify(
    text: str,
    level: NotificationLevel = NotificationLevel.INFO,
    channels: Optional[list[str]] = None,
    config: Optional[NotificationConfig] = None,
    dedupe_key: Optional[str] = None,
    skip_dedupe: bool = False,
) -> dict[str, bool]:
    """Send a notification to configured channels.
    
    This is the main entry point for all notifications.
    
    Args:
        text: Message text to send
        level: Notification severity level (INFO, WARN, ERROR, SIGNAL)
        channels: Override default channel routing. If None, uses DEFAULT_ROUTING.
        config: Override notification config. If None, loads from environment.
        dedupe_key: Custom deduplication key. If None, generated from text+level.
        skip_dedupe: If True, skip deduplication check.
        
    Returns:
        Dict of channel -> success status (True/False)
        
    Example:
        >>> notify("Server starting", NotificationLevel.INFO)
        {'slack': True}
        
        >>> notify("BUY AAPL", NotificationLevel.SIGNAL, dedupe_key="AAPL:EMA:BUY:2024-01-01")
        {'slack': True, 'telegram': True}
    """
    if config is None:
        config = NotificationConfig.from_env()
    
    if channels is None:
        channels = DEFAULT_ROUTING.get(level, ["slack"])
    
    # Deduplication check
    if not skip_dedupe:
        key = dedupe_key or _make_dedupe_key(text, level)
        if _is_duplicate(key):
            logger.debug(f"Skipping duplicate notification: {key}")
            return {ch: False for ch in channels}
    
    results: dict[str, bool] = {}
    
    # Format message with level prefix for non-SIGNAL levels
    if level != NotificationLevel.SIGNAL:
        formatted_text = f"[{level.value}] {text}"
    else:
        formatted_text = text
    
    for channel in channels:
        if channel == "slack":
            results["slack"] = send_slack(config.slack_webhook_url, formatted_text)
        elif channel == "telegram":
            results["telegram"] = send_telegram(
                config.telegram_bot_token,
                config.telegram_chat_id,
                formatted_text
            )
        else:
            logger.warning(f"Unknown notification channel: {channel}")
            results[channel] = False
    
    # Mark as sent if any channel succeeded
    if not skip_dedupe and any(results.values()):
        key = dedupe_key or _make_dedupe_key(text, level)
        _mark_sent(key)
    
    return results


def notify_signal(
    symbol: str,
    strategy: str,
    signal: Literal["BUY", "SELL"],
    bar_time: Optional[str] = None,
    price: Optional[float] = None,
    config: Optional[NotificationConfig] = None,
) -> dict[str, bool]:
    """Send a trading signal notification with automatic deduplication.
    
    Convenience wrapper for notify() specifically for BUY/SELL signals.
    
    Args:
        symbol: Trading symbol
        strategy: Strategy name that generated the signal
        signal: "BUY" or "SELL"
        bar_time: Bar timestamp (for dedupe)
        price: Optional price level
        config: Override notification config
        
    Returns:
        Dict of channel -> success status
    """
    # Build message
    emoji = "🟢" if signal == "BUY" else "🔴"
    parts = [f"{emoji} {signal} {symbol}"]
    if price is not None:
        parts.append(f"@ {price:.2f}")
    parts.append(f"({strategy})")
    if bar_time:
        parts.append(f"[{bar_time}]")
    
    text = " ".join(parts)
    dedupe_key = make_signal_key(symbol, strategy, signal, bar_time)
    
    return notify(
        text=text,
        level=NotificationLevel.SIGNAL,
        config=config,
        dedupe_key=dedupe_key,
    )


def get_notification_status() -> dict:
    """Get current notification configuration status.
    
    Returns:
        Dict with configuration status for health checks.
    """
    config = NotificationConfig.from_env()
    return {
        "notifications_configured": config.any_configured(),
        "channels": {
            "slack": config.is_configured("slack"),
            "telegram": config.is_configured("telegram"),
        },
        "dedupe_cache_size": len(_dedupe_cache),
    }

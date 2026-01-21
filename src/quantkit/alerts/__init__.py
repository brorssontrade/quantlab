"""
Notification and alerting module.

This module provides unified notification capabilities via Slack and Telegram.

Usage:
    from quantkit.alerts import notify, notify_signal, NotificationLevel
    
    # Simple notification
    notify("Server started", NotificationLevel.INFO)
    
    # Trading signal with auto-dedupe
    notify_signal("AAPL", "EMA_CROSS", "BUY", bar_time="2024-01-01T10:00:00")
"""
from .notify import (
    NotificationConfig,
    NotificationLevel,
    clear_dedupe_cache,
    get_notification_status,
    make_signal_key,
    notify,
    notify_signal,
)
from .slack import send_slack
from .telegram import send_telegram

__all__ = [
    # Main API
    "notify",
    "notify_signal",
    "NotificationLevel",
    "NotificationConfig",
    "get_notification_status",
    # Utilities
    "make_signal_key",
    "clear_dedupe_cache",
    # Low-level (for direct use)
    "send_slack",
    "send_telegram",
]

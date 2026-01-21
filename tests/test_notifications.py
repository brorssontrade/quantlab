"""
Tests for the notification system.

Tests cover:
1. CI-safety: Missing env vars don't crash, return False
2. Channel routing by notification level
3. Deduplication prevents spam
4. Signal formatting
"""
import pytest
from unittest.mock import patch, MagicMock

# Import from quantkit.alerts
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from quantkit.alerts import (
    notify,
    notify_signal,
    NotificationLevel,
    NotificationConfig,
    get_notification_status,
    make_signal_key,
    clear_dedupe_cache,
    send_slack,
    send_telegram,
)


class TestSlackNotifier:
    """Tests for Slack notifier CI-safety."""
    
    def test_missing_webhook_returns_false(self):
        """Missing webhook URL should return False, not crash."""
        result = send_slack("", "test message")
        assert result is False
    
    def test_none_webhook_returns_false(self):
        """None webhook URL should return False."""
        result = send_slack(None, "test message")  # type: ignore
        assert result is False
    
    @patch('quantkit.alerts.slack.requests.post')
    def test_successful_send_returns_true(self, mock_post):
        """Successful send should return True."""
        mock_post.return_value = MagicMock(status_code=200)
        mock_post.return_value.raise_for_status = MagicMock()
        
        result = send_slack("https://hooks.slack.com/test", "test message")
        
        assert result is True
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "https://hooks.slack.com/test" in str(call_args)
        assert "test message" in str(call_args)
    
    @patch('quantkit.alerts.slack.requests.post')
    def test_request_error_returns_false(self, mock_post):
        """Request exception should return False, not raise."""
        import requests
        mock_post.side_effect = requests.RequestException("Connection error")
        
        result = send_slack("https://hooks.slack.com/test", "test message")
        
        assert result is False


class TestTelegramNotifier:
    """Tests for Telegram notifier CI-safety."""
    
    def test_missing_token_returns_false(self):
        """Missing bot token should return False."""
        result = send_telegram("", "chat123", "test message")
        assert result is False
    
    def test_missing_chat_id_returns_false(self):
        """Missing chat ID should return False."""
        result = send_telegram("bot123", "", "test message")
        assert result is False
    
    def test_missing_both_returns_false(self):
        """Missing both credentials should return False."""
        result = send_telegram("", "", "test message")
        assert result is False
    
    @patch('quantkit.alerts.telegram.requests.post')
    def test_successful_send_returns_true(self, mock_post):
        """Successful send should return True."""
        mock_post.return_value = MagicMock(status_code=200)
        mock_post.return_value.raise_for_status = MagicMock()
        
        result = send_telegram("bot123", "chat456", "test message")
        
        assert result is True
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "api.telegram.org" in str(call_args)
        assert "bot123" in str(call_args)
    
    @patch('quantkit.alerts.telegram.requests.post')
    def test_request_error_returns_false(self, mock_post):
        """Request exception should return False, not raise."""
        import requests
        mock_post.side_effect = requests.RequestException("Connection error")
        
        result = send_telegram("bot123", "chat456", "test message")
        
        assert result is False


class TestNotificationRouting:
    """Tests for unified notify() routing."""
    
    def setup_method(self):
        """Clear dedupe cache before each test."""
        clear_dedupe_cache()
    
    def test_info_routes_to_slack_only(self):
        """INFO level should route to Slack only by default."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=False) as mock_slack:
            with patch('quantkit.alerts.notify.send_telegram', return_value=False) as mock_tg:
                notify("test", NotificationLevel.INFO, config=config, skip_dedupe=True)
                
                mock_slack.assert_called_once()
                mock_tg.assert_not_called()
    
    def test_error_routes_to_both(self):
        """ERROR level should route to both Slack and Telegram."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=False) as mock_slack:
            with patch('quantkit.alerts.notify.send_telegram', return_value=False) as mock_tg:
                notify("test", NotificationLevel.ERROR, config=config, skip_dedupe=True)
                
                mock_slack.assert_called_once()
                mock_tg.assert_called_once()
    
    def test_signal_routes_to_both(self):
        """SIGNAL level should route to both Slack and Telegram."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=False) as mock_slack:
            with patch('quantkit.alerts.notify.send_telegram', return_value=False) as mock_tg:
                notify("BUY AAPL", NotificationLevel.SIGNAL, config=config, skip_dedupe=True)
                
                mock_slack.assert_called_once()
                mock_tg.assert_called_once()
    
    def test_custom_channels_override(self):
        """Custom channels parameter should override default routing."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=False) as mock_slack:
            with patch('quantkit.alerts.notify.send_telegram', return_value=False) as mock_tg:
                # INFO normally goes to slack only, but we override to telegram
                notify("test", NotificationLevel.INFO, channels=["telegram"], config=config, skip_dedupe=True)
                
                mock_slack.assert_not_called()
                mock_tg.assert_called_once()


class TestDeduplication:
    """Tests for notification deduplication."""
    
    def setup_method(self):
        """Clear dedupe cache before each test."""
        clear_dedupe_cache()
    
    def test_duplicate_notification_blocked(self):
        """Same notification twice should only send once."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=True) as mock_slack:
            # First call - should send
            result1 = notify("test message", NotificationLevel.INFO, config=config)
            # Second call with same message - should be blocked
            result2 = notify("test message", NotificationLevel.INFO, config=config)
            
            # First succeeded, second was blocked
            assert result1["slack"] is True
            assert result2["slack"] is False
            
            # Only one actual send
            assert mock_slack.call_count == 1
    
    def test_different_messages_not_blocked(self):
        """Different messages should both send."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=True) as mock_slack:
            notify("message 1", NotificationLevel.INFO, config=config)
            notify("message 2", NotificationLevel.INFO, config=config)
            
            assert mock_slack.call_count == 2
    
    def test_custom_dedupe_key(self):
        """Custom dedupe key should be used for deduplication."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=True) as mock_slack:
            # Same dedupe key, different messages
            notify("msg 1", NotificationLevel.INFO, config=config, dedupe_key="same-key")
            notify("msg 2", NotificationLevel.INFO, config=config, dedupe_key="same-key")
            
            # Only first should send
            assert mock_slack.call_count == 1
    
    def test_skip_dedupe_flag(self):
        """skip_dedupe=True should bypass deduplication."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=True) as mock_slack:
            notify("test", NotificationLevel.INFO, config=config, skip_dedupe=True)
            notify("test", NotificationLevel.INFO, config=config, skip_dedupe=True)
            
            # Both should send
            assert mock_slack.call_count == 2


class TestSignalNotification:
    """Tests for trading signal notifications."""
    
    def setup_method(self):
        """Clear dedupe cache before each test."""
        clear_dedupe_cache()
    
    def test_signal_key_format(self):
        """Signal key should be formatted correctly."""
        key = make_signal_key("AAPL", "EMA_CROSS", "BUY", "2024-01-01T10:00")
        assert key == "AAPL:EMA_CROSS:BUY:2024-01-01T10:00"
    
    def test_signal_key_uppercase(self):
        """Signal key should be uppercased."""
        key = make_signal_key("aapl", "ema_cross", "buy")
        assert key == "AAPL:EMA_CROSS:BUY"
    
    def test_notify_signal_formats_message(self):
        """notify_signal should format BUY/SELL messages nicely."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=True) as mock_slack:
            notify_signal("AAPL", "EMA_CROSS", "BUY", price=150.25, config=config)
            
            # Check the message format
            call_args = mock_slack.call_args
            message = call_args[0][1]  # Second positional arg is text
            assert "🟢" in message  # BUY emoji
            assert "BUY" in message
            assert "AAPL" in message
            assert "150.25" in message
            assert "EMA_CROSS" in message
    
    def test_notify_signal_sell_emoji(self):
        """SELL signals should have red emoji."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=True) as mock_slack:
            notify_signal("AAPL", "EMA_CROSS", "SELL", config=config)
            
            call_args = mock_slack.call_args
            message = call_args[0][1]
            assert "🔴" in message  # SELL emoji
    
    def test_notify_signal_dedupe(self):
        """Same signal should be deduplicated."""
        config = NotificationConfig(
            slack_webhook_url="",
            telegram_bot_token="",
            telegram_chat_id=""
        )
        
        with patch('quantkit.alerts.notify.send_slack', return_value=True) as mock_slack:
            notify_signal("AAPL", "EMA", "BUY", bar_time="2024-01-01", config=config)
            notify_signal("AAPL", "EMA", "BUY", bar_time="2024-01-01", config=config)
            
            # Only one send
            assert mock_slack.call_count == 1


class TestNotificationStatus:
    """Tests for notification status reporting."""
    
    def test_status_when_not_configured(self):
        """Status should show unconfigured when no env vars."""
        with patch.dict(os.environ, {}, clear=True):
            # Remove any existing notification env vars
            for key in ['SLACK_WEBHOOK_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']:
                os.environ.pop(key, None)
            
            status = get_notification_status()
            
            assert status["notifications_configured"] is False
            assert status["channels"]["slack"] is False
            assert status["channels"]["telegram"] is False
    
    def test_status_with_slack_configured(self):
        """Status should show slack configured when webhook present."""
        with patch.dict(os.environ, {'SLACK_WEBHOOK_URL': 'https://hooks.slack.com/test'}):
            status = get_notification_status()
            
            assert status["channels"]["slack"] is True


class TestNotificationConfig:
    """Tests for NotificationConfig."""
    
    def test_from_env_loads_values(self):
        """Config should load from environment."""
        with patch.dict(os.environ, {
            'SLACK_WEBHOOK_URL': 'https://slack.test',
            'TELEGRAM_BOT_TOKEN': 'bot123',
            'TELEGRAM_CHAT_ID': 'chat456'
        }):
            config = NotificationConfig.from_env()
            
            assert config.slack_webhook_url == 'https://slack.test'
            assert config.telegram_bot_token == 'bot123'
            assert config.telegram_chat_id == 'chat456'
    
    def test_is_configured_slack(self):
        """is_configured should check webhook URL for slack."""
        config = NotificationConfig(slack_webhook_url="https://test")
        assert config.is_configured("slack") is True
        
        config = NotificationConfig(slack_webhook_url="")
        assert config.is_configured("slack") is False
    
    def test_is_configured_telegram_needs_both(self):
        """is_configured should require both token and chat_id for telegram."""
        config = NotificationConfig(telegram_bot_token="token", telegram_chat_id="chat")
        assert config.is_configured("telegram") is True
        
        config = NotificationConfig(telegram_bot_token="token", telegram_chat_id="")
        assert config.is_configured("telegram") is False
        
        config = NotificationConfig(telegram_bot_token="", telegram_chat_id="chat")
        assert config.is_configured("telegram") is False

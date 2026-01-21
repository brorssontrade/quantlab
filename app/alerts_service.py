"""
Alerts service module - evaluates price alerts and triggers notifications.

Day 8: Wired to notify_signal() for BUY/SELL notifications via Slack/Telegram.

Flow:
1. eval_alerts_job() fetches enabled alerts
2. For each alert, fetch current price data
3. Check if price crossed the alert level
4. If triggered: log to DB, call notify_signal(), disable if one-shot
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlmodel import select

from .db import get_session
from .models import Alert, AlertDirection, AlertLog, AlertType

# Try to import notifier, gracefully handle if not available
try:
    from quantkit.alerts import notify_signal
    HAS_NOTIFIER = True
except ImportError:
    HAS_NOTIFIER = False
    def notify_signal(*args, **kwargs):
        """Stub when notifier not available."""
        pass


def eval_alerts_job() -> Dict[str, Any]:
    """
    Evaluate all enabled alerts against current prices.
    
    Returns:
        Dict with evaluation summary.
    """
    results = {
        "evaluated": 0,
        "triggered": 0,
        "errors": 0,
        "has_notifier": HAS_NOTIFIER,
    }
    
    try:
        with get_session() as session:
            # Get all enabled alerts
            statement = select(Alert).where(Alert.enabled == True)
            alerts = session.exec(statement).all()
            results["evaluated"] = len(alerts)
            
            for alert in alerts:
                try:
                    triggered = _evaluate_single_alert(session, alert)
                    if triggered:
                        results["triggered"] += 1
                except Exception as e:
                    results["errors"] += 1
                    print(f"[AlertsService] Error evaluating alert {alert.id}: {e}")
    except Exception as e:
        results["error"] = str(e)
    
    return results


def _evaluate_single_alert(session, alert: Alert) -> bool:
    """
    Evaluate a single alert. Returns True if triggered.
    
    Note: This is a minimal implementation. In production, you would:
    - Fetch latest price from market data API
    - Compare with alert geometry (hline price, trendline interpolation, etc.)
    - Check cooldown period
    """
    # Skip if in cooldown
    if alert.last_triggered_at and alert.cooldown_min > 0:
        cooldown_end = alert.last_triggered_at + timedelta(minutes=alert.cooldown_min)
        if datetime.now(timezone.utc) < cooldown_end:
            return False
    
    # TODO: In a full implementation, fetch current price and check crossing
    # For now, this is a stub that doesn't auto-trigger
    # Alerts are triggered manually via the UI or external signal
    
    return False


def trigger_alert(alert_id: int, price: float, close: float, direction: str) -> Dict[str, Any]:
    """
    Manually trigger an alert (called from external signal or scheduler).
    
    Args:
        alert_id: Alert ID to trigger
        price: Price that triggered the alert
        close: Close price at trigger time  
        direction: "cross_up" or "cross_down"
        
    Returns:
        Dict with trigger result
    """
    result = {"ok": False, "alert_id": alert_id}
    
    try:
        with get_session() as session:
            alert = session.get(Alert, alert_id)
            if not alert:
                result["error"] = "Alert not found"
                return result
            
            if not alert.enabled:
                result["error"] = "Alert is disabled"
                return result
            
            now = datetime.now(timezone.utc)
            
            # Create log entry
            log = AlertLog(
                alert_id=alert_id,
                triggered_at=now,
                direction=AlertDirection(direction),
                price=price,
                close=close,
                note=f"Triggered via API at {price}",
            )
            session.add(log)
            
            # Update alert
            alert.last_triggered_at = now
            alert.last_triggered_close = close
            alert.last_triggered_direction = direction
            
            # Disable if one-shot
            if alert.one_shot:
                alert.enabled = False
            
            session.commit()
            
            # Send notification
            if HAS_NOTIFIER:
                signal = "BUY" if direction == "cross_up" else "SELL"
                strategy = alert.paper_strategy or "PRICE_ALERT"
                notify_signal(
                    symbol=alert.symbol,
                    strategy=strategy,
                    signal=signal,
                    price=price,
                    bar_time=now.isoformat(),
                )
            
            result["ok"] = True
            result["notified"] = HAS_NOTIFIER
            result["disabled"] = alert.one_shot
            
    except Exception as e:
        result["error"] = str(e)
    
    return result


def normalize_bar(bar: str) -> str:
    """Normalize a bar timeframe string."""
    if not bar:
        return "D"
    bar = bar.strip().upper()
    # Map common variations
    mapping = {
        "1D": "D", "DAILY": "D", "DAY": "D",
        "1H": "1h", "60M": "1h", "HOUR": "1h",
        "15M": "15m", "15MIN": "15m",
        "5M": "5m", "5MIN": "5m",
        "1M": "1m", "1MIN": "1m",
        "1W": "W", "WEEKLY": "W", "WEEK": "W",
    }
    return mapping.get(bar, bar)


def normalize_geometry(alert_type: "AlertType", geometry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize geometry dict, ensuring consistent structure.
    
    Args:
        alert_type: The type of alert (price, indicator, trendline)
        geometry: The geometry dict from the request
        
    Returns:
        Normalized geometry dict
    """
    if not geometry or not isinstance(geometry, dict):
        return {}
    
    # For price alerts (hline), require 'price' field
    if alert_type.value == "price":
        if "price" not in geometry:
            raise ValueError("price alert requires 'price' in geometry")
        return {"price": float(geometry["price"])}
    
    # For trendline alerts, require start/end points
    if alert_type.value == "trendline":
        if "start" not in geometry or "end" not in geometry:
            raise ValueError("trendline alert requires 'start' and 'end' in geometry")
        return geometry
    
    return geometry


def normalize_symbol(symbol: str) -> str:
    """Normalize symbol string."""
    if not symbol:
        return ""
    return symbol.strip().upper()

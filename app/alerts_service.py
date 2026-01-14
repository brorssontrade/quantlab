"""Alerts service module - stub."""
from typing import Any, Dict


def eval_alerts_job():
    """Evaluate alerts job."""
    pass


def normalize_bar(bar: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a bar."""
    return bar


def normalize_geometry(geometry: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize geometry."""
    return geometry


def normalize_symbol(symbol: str) -> str:
    """Normalize symbol."""
    return symbol.strip().upper()

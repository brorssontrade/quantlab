"""Fundamentals service module - stub."""
from typing import Any, Dict, List


def get_metrics(symbol: str) -> Dict[str, Any]:
    """Get fundamental metrics for a symbol."""
    return {}


def sanitize_symbol(symbol: str) -> str:
    """Sanitize symbol string."""
    return symbol.strip().upper()


def score_symbols(symbols: List[str], **kwargs) -> Dict[str, Any]:
    """Score a list of symbols based on fundamentals."""
    return {s: 0.0 for s in symbols}

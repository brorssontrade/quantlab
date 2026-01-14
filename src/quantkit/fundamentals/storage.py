"""Fundamentals storage module."""
from typing import Dict, Any


def metrics_to_dict(metrics) -> Dict[str, Any]:
    """Convert metrics object to dictionary."""
    if hasattr(metrics, '__dict__'):
        return metrics.__dict__
    if isinstance(metrics, dict):
        return metrics
    return {}

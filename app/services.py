"""Services module - stub."""
from typing import Any, Dict, List, Optional
from pathlib import Path


def generate_latest_signals_from_workdir(workdir: Path) -> List[Dict[str, Any]]:
    """Generate signals from workdir."""
    return []


def run_optuna(symbol: str, **kwargs) -> Dict[str, Any]:
    """Run Optuna optimization."""
    return {"best_params": {}}


def run_pipeline_daily(symbols: List[str], **kwargs) -> Dict[str, Any]:
    """Run daily pipeline."""
    return {"status": "completed"}

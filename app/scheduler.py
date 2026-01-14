"""Scheduler module - stub."""
from typing import Any, Dict, Optional


def preview_schedule(job_name: str) -> Dict[str, Any]:
    """Preview a scheduled job."""
    return {"job": job_name, "next_run": None}


def remove_live_job(job_id: int) -> bool:
    """Remove a live job."""
    return True


def schedule_live_job(job_name: str, **kwargs) -> Optional[int]:
    """Schedule a live job."""
    return None


def start_scheduler():
    """Start the scheduler."""
    pass


def shutdown_scheduler():
    """Shutdown the scheduler."""
    pass

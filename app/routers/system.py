"""
System routes: health checks and root redirect.

**Purpose**:
- Provides root redirect to API documentation
- Exposes health check endpoints for monitoring and ChartsPro integration

**Contracts**:
- GET / → RedirectResponse to /docs
- GET /health → {"status": "ok", "time": ISO timestamp}
- GET /api/health → {"status": "ok", "timestamp": ISO timestamp}

**Dependencies**:
- fastapi.responses.RedirectResponse (root redirect)
- datetime (timestamp generation)
"""
from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from datetime import datetime

router = APIRouter()


@router.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@router.get("/api/health")
def api_health() -> dict[str, str]:
    """Health check for ChartsPro dataClient (TV-3)"""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

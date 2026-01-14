"""Assistant router - stub."""
from fastapi import APIRouter

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/")
def assistant_root():
    """Assistant root endpoint."""
    return {"status": "ok"}

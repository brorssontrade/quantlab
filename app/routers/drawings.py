"""Drawings CRUD router for ChartsPro drawings persistence (T-013).

This module provides REST endpoints for persisting chart drawings to the backend.
Each drawing is stored with its full state including position, style, z-order,
lock/hidden status, and pattern-specific fields.

Endpoints:
- GET /api/drawings/{symbol}/{tf} - List all drawings for a symbol/timeframe
- PUT /api/drawings/{symbol}/{tf} - Bulk save drawings (replaces all)
- DELETE /api/drawings/{symbol}/{tf} - Delete all drawings for a symbol/timeframe
- DELETE /api/drawings/{symbol}/{tf}/{drawing_id} - Delete a specific drawing

The schema version is stored to enable future migrations.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select, delete

from ..db import get_session
from ..models import ChartDrawing

logger = logging.getLogger("quantlab.routers.drawings")

router = APIRouter(prefix="/api/drawings", tags=["drawings"])


# =============================================================================
# Pydantic Schemas for API
# =============================================================================

class TrendPoint(BaseModel):
    """A point in time/price space."""
    timeMs: int
    price: float


class DrawingStyle(BaseModel):
    """Drawing style configuration."""
    color: str = "#ffffff"
    width: int = 2
    dash: Optional[List[int]] = None
    opacity: Optional[float] = 1.0


class DrawingPayload(BaseModel):
    """Complete drawing payload for API.
    
    This is a flexible schema that accepts all drawing types.
    Type-specific fields (p1, p2, p3, etc.) are stored in the `data` field.
    """
    id: str
    kind: str
    symbol: str
    tf: str
    z: int = 0
    createdAt: Optional[int] = None
    updatedAt: Optional[int] = None
    locked: bool = False
    hidden: bool = False
    label: Optional[str] = None
    style: Optional[DrawingStyle] = None
    # All additional type-specific fields stored as JSON
    data: Dict[str, Any] = Field(default_factory=dict)


class DrawingsResponse(BaseModel):
    """Response for listing drawings."""
    version: str = "v1"
    symbol: str
    tf: str
    drawings: List[DrawingPayload]
    count: int


class BulkSaveRequest(BaseModel):
    """Request body for bulk saving drawings."""
    version: str = "v1"
    drawings: List[DrawingPayload]


class BulkSaveResponse(BaseModel):
    """Response for bulk save operation."""
    success: bool
    saved: int
    symbol: str
    tf: str


# =============================================================================
# Helper Functions
# =============================================================================

def drawing_model_to_payload(model: ChartDrawing) -> DrawingPayload:
    """Convert SQLModel to API payload."""
    data = model.data or {}
    return DrawingPayload(
        id=model.drawing_id,
        kind=model.kind,
        symbol=model.symbol,
        tf=model.tf,
        z=model.z,
        createdAt=model.created_at_ms,
        updatedAt=model.updated_at_ms,
        locked=model.locked,
        hidden=model.hidden,
        label=model.label,
        style=DrawingStyle(**model.style) if model.style else None,
        data=data,
    )


def payload_to_drawing_model(
    payload: DrawingPayload,
    existing: Optional[ChartDrawing] = None
) -> ChartDrawing:
    """Convert API payload to SQLModel."""
    now_ms = int(datetime.utcnow().timestamp() * 1000)
    
    if existing:
        existing.kind = payload.kind
        existing.z = payload.z
        existing.updated_at_ms = now_ms
        existing.locked = payload.locked
        existing.hidden = payload.hidden
        existing.label = payload.label
        existing.style = payload.style.model_dump() if payload.style else None
        existing.data = payload.data
        return existing
    
    return ChartDrawing(
        drawing_id=payload.id,
        symbol=payload.symbol,
        tf=payload.tf,
        kind=payload.kind,
        z=payload.z,
        created_at_ms=payload.createdAt or now_ms,
        updated_at_ms=now_ms,
        locked=payload.locked,
        hidden=payload.hidden,
        label=payload.label,
        style=payload.style.model_dump() if payload.style else None,
        data=payload.data,
        schema_version="v1",
    )


# =============================================================================
# API Endpoints
# =============================================================================

@router.get("/{symbol}/{tf}", response_model=DrawingsResponse)
def list_drawings(symbol: str, tf: str):
    """List all drawings for a symbol/timeframe pair.
    
    Returns drawings sorted by z-order (ascending).
    """
    with get_session() as session:
        stmt = (
            select(ChartDrawing)
            .where(ChartDrawing.symbol == symbol)
            .where(ChartDrawing.tf == tf)
            .order_by(ChartDrawing.z)
        )
        results = session.exec(stmt).all()
        drawings = [drawing_model_to_payload(d) for d in results]
        
        return DrawingsResponse(
            symbol=symbol,
            tf=tf,
            drawings=drawings,
            count=len(drawings),
        )


@router.put("/{symbol}/{tf}", response_model=BulkSaveResponse)
def bulk_save_drawings(symbol: str, tf: str, request: BulkSaveRequest):
    """Bulk save drawings for a symbol/timeframe pair.
    
    This replaces ALL drawings for the given symbol/tf combination.
    Existing drawings not in the request will be deleted.
    
    This is the primary endpoint for syncing frontend state to backend.
    """
    with get_session() as session:
        # Get existing drawings by ID for update vs insert decisions
        existing_stmt = (
            select(ChartDrawing)
            .where(ChartDrawing.symbol == symbol)
            .where(ChartDrawing.tf == tf)
        )
        existing_map = {d.drawing_id: d for d in session.exec(existing_stmt).all()}
        
        incoming_ids = {d.id for d in request.drawings}
        
        # Delete drawings not in incoming set
        for drawing_id, model in existing_map.items():
            if drawing_id not in incoming_ids:
                session.delete(model)
        
        # Upsert incoming drawings
        for payload in request.drawings:
            # Ensure symbol/tf match the URL
            payload.symbol = symbol
            payload.tf = tf
            
            existing = existing_map.get(payload.id)
            model = payload_to_drawing_model(payload, existing)
            session.add(model)
        
        session.commit()
        
        logger.info(f"Saved {len(request.drawings)} drawings for {symbol}/{tf}")
        
        return BulkSaveResponse(
            success=True,
            saved=len(request.drawings),
            symbol=symbol,
            tf=tf,
        )


@router.delete("/{symbol}/{tf}", response_model=dict)
def delete_all_drawings(symbol: str, tf: str):
    """Delete all drawings for a symbol/timeframe pair."""
    with get_session() as session:
        stmt = (
            delete(ChartDrawing)
            .where(ChartDrawing.symbol == symbol)
            .where(ChartDrawing.tf == tf)
        )
        result = session.exec(stmt)
        session.commit()
        
        deleted = result.rowcount if hasattr(result, 'rowcount') else 0
        logger.info(f"Deleted {deleted} drawings for {symbol}/{tf}")
        
        return {"success": True, "deleted": deleted, "symbol": symbol, "tf": tf}


@router.delete("/{symbol}/{tf}/{drawing_id}", response_model=dict)
def delete_drawing(symbol: str, tf: str, drawing_id: str):
    """Delete a specific drawing by ID."""
    with get_session() as session:
        stmt = (
            select(ChartDrawing)
            .where(ChartDrawing.symbol == symbol)
            .where(ChartDrawing.tf == tf)
            .where(ChartDrawing.drawing_id == drawing_id)
        )
        drawing = session.exec(stmt).first()
        
        if not drawing:
            raise HTTPException(status_code=404, detail=f"Drawing {drawing_id} not found")
        
        session.delete(drawing)
        session.commit()
        
        return {"success": True, "deleted": drawing_id}

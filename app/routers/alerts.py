"""
Alerts routes: Price alert CRUD + evaluation.

**Purpose**:
- Create, read, update, delete price alerts (horizontal, trendline, channel)
- Trigger immediate alert evaluation (check-now)
- Query alert logs (historical trigger events)
- Support paper-trading integration (qty, side, strategy metadata)

**Contracts**:
- GET /alerts → List all alerts (optionally filter by enabled/disabled)
- POST /alerts → Create new alert (AlertCreate model)
- PATCH /alerts/{id} → Update alert fields (AlertUpdate model)
- DELETE /alerts/{id} → Delete alert by ID
- GET /alerts/logs → Query alert logs (symbol, alert_id, date range filters)
- POST /alerts/check-now → Immediate evaluation (force check outside scheduler)

**Models**:
- AlertBase (base schema: label, symbol, bar, type, direction, geometry, tolerances, paper trading)
- AlertCreate (extends AlertBase for POST /alerts)
- AlertUpdate (partial update schema for PATCH /alerts/{id})

**Helpers**:
- _dt_to_iso() → ISO 8601 timestamp serialization (UTC)
- _serialize_alert() → Alert model → JSON dict (includes serialized geometry)
- _serialize_alert_log() → AlertLog model → JSON dict

**Dependencies**:
- app.db (get_session context manager for SQLModel transactions)
- app.models (Alert, AlertLog, AlertType, AlertDirection enums)
- app.alerts_service (eval_alerts_job, normalize_symbol, normalize_bar, normalize_geometry)
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlmodel import select

from ..db import get_session
from ..models import Alert, AlertDirection, AlertLog, AlertType
from ..alerts_service import eval_alerts_job, normalize_bar, normalize_geometry, normalize_symbol

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ============================================================================
# Pydantic Models
# ============================================================================

class AlertBase(BaseModel):
    label: Optional[str] = None
    symbol: str
    bar: str
    type: AlertType
    direction: AlertDirection = AlertDirection.cross_any
    geometry: dict
    tol_bps: float = Field(default=0.0, ge=0.0)
    enabled: bool = True
    one_shot: bool = False
    cooldown_min: int = Field(default=0, ge=0)
    note: Optional[str] = None
    paper_qty: Optional[float] = None
    paper_sek_per_trade: Optional[float] = None
    paper_side: Optional[str] = None
    paper_strategy: Optional[str] = None

    @field_validator("label", "symbol", "bar", "note", "paper_side", "paper_strategy", mode="before")
    @classmethod
    def _strip_strings(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return str(value)

    @field_validator("paper_qty", "paper_sek_per_trade", mode="before")
    @classmethod
    def _validate_positive(cls, value):
        if value in (None, ""):
            return None
        try:
            numeric = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("paper sizing values must be numeric") from exc
        if numeric < 0:
            raise ValueError("paper sizing values must be >= 0")
        return numeric

    @model_validator(mode="after")
    def _validate_geometry_and_sizing(self) -> "AlertBase":
        if not isinstance(self.geometry, dict) or not self.geometry:
            raise ValueError("geometry must be a non-empty object")
        qty = self.paper_qty or 0.0
        sek = self.paper_sek_per_trade or 0.0
        if qty > 0 and sek > 0:
            raise ValueError("provide either paper_qty or paper_sek_per_trade, not both")
        return self


class AlertCreate(AlertBase):
    pass


class AlertUpdate(BaseModel):
    label: Optional[str] = None
    symbol: Optional[str] = None
    bar: Optional[str] = None
    type: Optional[AlertType] = None
    direction: Optional[AlertDirection] = None
    geometry: Optional[dict] = None
    tol_bps: Optional[float] = Field(default=None, ge=0.0)
    enabled: Optional[bool] = None
    one_shot: Optional[bool] = None
    cooldown_min: Optional[int] = Field(default=None, ge=0)
    note: Optional[str] = None
    paper_qty: Optional[float] = None
    paper_sek_per_trade: Optional[float] = None
    paper_side: Optional[str] = None
    paper_strategy: Optional[str] = None

    @field_validator("label", "symbol", "bar", "note", "paper_side", "paper_strategy", mode="before")
    @classmethod
    def _strip_strings(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return str(value)

    @field_validator("paper_qty", "paper_sek_per_trade", "tol_bps", mode="before")
    @classmethod
    def _validate_numeric(cls, value):
        if value in (None, ""):
            return None
        try:
            numeric = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("numeric field must be numeric") from exc
        if numeric < 0:
            raise ValueError("numeric field must be >= 0")
        return numeric

    @model_validator(mode="after")
    def _validate_sizing(self) -> "AlertUpdate":
        qty = self.paper_qty or 0.0
        sek = self.paper_sek_per_trade or 0.0
        if qty > 0 and sek > 0:
            raise ValueError("provide either paper_qty or paper_sek_per_trade, not both")
        return self


# ============================================================================
# Helper Functions
# ============================================================================

def _dt_to_iso(value: datetime | None) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _serialize_alert(alert: Alert) -> dict[str, Any]:
    data = alert.model_dump()
    data["type"] = alert.type.value
    data["direction"] = alert.direction.value
    data["created_at"] = _dt_to_iso(alert.created_at)
    data["updated_at"] = _dt_to_iso(alert.updated_at)
    data["last_triggered_at"] = _dt_to_iso(alert.last_triggered_at)
    data["paper_side"] = alert.paper_side
    return data


def _serialize_alert_log(log: AlertLog) -> dict[str, Any]:
    data = log.model_dump()
    data["type"] = log.type.value
    data["direction"] = log.direction.value
    data["triggered_at"] = _dt_to_iso(log.triggered_at)
    return data


# ============================================================================
# Routes
# ============================================================================

@router.get("")
def list_alerts(
    symbol: str | None = Query(None, description="Filter alerts by symbol"),
    bar: str | None = Query(None, description="Filter alerts by bar"),
    enabled: bool | None = Query(None, description="Filter on enabled state"),
    limit: int = Query(200, ge=1, le=500),
) -> dict[str, Any]:
    statement = select(Alert)
    if symbol:
        try:
            statement = statement.where(Alert.symbol == normalize_symbol(symbol))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if bar:
        try:
            statement = statement.where(Alert.bar == normalize_bar(bar))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if enabled is not None:
        statement = statement.where(Alert.enabled == enabled)
    statement = statement.order_by(Alert.created_at.desc()).limit(limit)
    with get_session() as session:
        alerts = session.exec(statement).all()
        items = [_serialize_alert(alert) for alert in alerts]
    return {"items": items}


@router.post("")
def create_alert(payload: AlertCreate) -> dict[str, Any]:
    try:
        symbol = normalize_symbol(payload.symbol)
        bar = normalize_bar(payload.bar)
        geometry = normalize_geometry(payload.type, payload.geometry)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    now = datetime.now(timezone.utc)
    alert = Alert(
        label=payload.label,
        symbol=symbol,
        bar=bar,
        type=payload.type,
        direction=payload.direction,
        geometry=geometry,
        tol_bps=payload.tol_bps or 0.0,
        enabled=payload.enabled,
        one_shot=payload.one_shot,
        cooldown_min=payload.cooldown_min or 0,
        note=payload.note,
        paper_qty=payload.paper_qty if payload.paper_qty and payload.paper_qty > 0 else None,
        paper_sek_per_trade=(
            payload.paper_sek_per_trade if payload.paper_sek_per_trade and payload.paper_sek_per_trade > 0 else None
        ),
        paper_side=(payload.paper_side.upper() if payload.paper_side else None),
        paper_strategy=payload.paper_strategy,
        created_at=now,
        updated_at=now,
        last_triggered_at=None,
        last_triggered_price=None,
        last_triggered_close=None,
        last_triggered_direction=None,
    )

    with get_session() as session:
        session.add(alert)
        session.flush()
        session.refresh(alert)
        return {"ok": True, "alert": _serialize_alert(alert)}


@router.patch("/{alert_id}")
def update_alert(alert_id: int, payload: AlertUpdate) -> dict[str, Any]:
    with get_session() as session:
        alert = session.get(Alert, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail=f"alert {alert_id} not found")
        try:
            if payload.symbol is not None:
                alert.symbol = normalize_symbol(payload.symbol)
            if payload.bar is not None:
                alert.bar = normalize_bar(payload.bar)
            if payload.type is not None:
                alert.type = payload.type
            if payload.direction is not None:
                alert.direction = payload.direction
            if payload.geometry is not None:
                geom_type = payload.type or alert.type
                alert.geometry = normalize_geometry(geom_type, payload.geometry)
            if payload.label is not None:
                alert.label = payload.label
            if payload.tol_bps is not None:
                alert.tol_bps = payload.tol_bps
            if payload.enabled is not None:
                alert.enabled = payload.enabled
            if payload.one_shot is not None:
                alert.one_shot = payload.one_shot
            if payload.cooldown_min is not None:
                alert.cooldown_min = payload.cooldown_min
            if payload.note is not None:
                alert.note = payload.note
            if payload.paper_qty is not None:
                alert.paper_qty = payload.paper_qty if payload.paper_qty > 0 else None
            if payload.paper_sek_per_trade is not None:
                alert.paper_sek_per_trade = payload.paper_sek_per_trade if payload.paper_sek_per_trade > 0 else None
            if payload.paper_side is not None:
                alert.paper_side = payload.paper_side.upper() if payload.paper_side else None
            if payload.paper_strategy is not None:
                alert.paper_strategy = payload.paper_strategy
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        alert.updated_at = datetime.now(timezone.utc)
        session.add(alert)
        session.flush()
        session.refresh(alert)
        return {"ok": True, "alert": _serialize_alert(alert)}


@router.delete("/{alert_id}")
def delete_alert(alert_id: int) -> dict[str, Any]:
    with get_session() as session:
        alert = session.get(Alert, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail=f"alert {alert_id} not found")
        session.delete(alert)
        session.flush()
    return {"ok": True}


@router.get("/logs")
def list_alert_logs(
    alert_id: int | None = Query(None, description="Filter logs for a specific alert id"),
    symbol: str | None = Query(None, description="Filter logs by symbol"),
    bar: str | None = Query(None, description="Filter logs by bar"),
    limit: int = Query(200, ge=1, le=1000),
) -> dict[str, Any]:
    statement = select(AlertLog).order_by(AlertLog.triggered_at.desc())
    if alert_id is not None:
        statement = statement.where(AlertLog.alert_id == alert_id)
    if symbol:
        try:
            statement = statement.where(AlertLog.symbol == normalize_symbol(symbol))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if bar:
        try:
            statement = statement.where(AlertLog.bar == normalize_bar(bar))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    statement = statement.limit(limit)
    with get_session() as session:
        logs = session.exec(statement).all()
        items = [_serialize_alert_log(log) for log in logs]
    return {"items": items}


@router.post("/check-now")
def alerts_check_now() -> dict[str, Any]:
    result = eval_alerts_job()
    return {"ok": True, "result": result}

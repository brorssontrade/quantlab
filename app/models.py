"""Database models for QuantLab.

This module contains SQLModel table definitions for database persistence
and Pydantic schemas for API request/response validation.

SQLModel tables (table=True):
- Alert: Price alert storage
- AlertLog: Alert trigger history
- Run: Backtest run metadata
- Trade: Trade execution records
- Strategy: Strategy definitions
- LiveJob: Live trading job status
- ChartDrawing: ChartsPro drawings persistence (T-013)

Pydantic enums (shared):
- AlertDirection: cross_any, cross_up, cross_down, long, short, both
- AlertType: price, indicator, trendline
- RunStatus: pending, running, completed, failed
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from pydantic import BaseModel


# =============================================================================
# Enums (shared by both SQLModel tables and Pydantic schemas)
# =============================================================================

class AlertDirection(str, Enum):
    LONG = "long"
    SHORT = "short"
    BOTH = "both"
    cross_any = "cross_any"
    cross_up = "cross_up"
    cross_down = "cross_down"


class AlertType(str, Enum):
    PRICE = "price"
    INDICATOR = "indicator"
    TRENDLINE = "trendline"


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# =============================================================================
# SQLModel Tables (for database persistence)
# =============================================================================

class Alert(SQLModel, table=True):
    """SQLModel table for price alerts."""
    __tablename__ = "alerts"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    label: Optional[str] = None
    symbol: str
    bar: str = "D"
    type: AlertType = AlertType.PRICE
    direction: AlertDirection = AlertDirection.cross_any
    geometry: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    tol_bps: float = 0.0
    enabled: bool = True
    one_shot: bool = False
    cooldown_min: int = 0
    note: Optional[str] = None
    paper_qty: Optional[float] = None
    paper_sek_per_trade: Optional[float] = None
    paper_side: Optional[str] = None
    paper_strategy: Optional[str] = None
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    last_triggered_at: Optional[datetime] = None
    last_triggered_price: Optional[float] = None
    last_triggered_close: Optional[float] = None
    last_triggered_direction: Optional[str] = None


class AlertLog(SQLModel, table=True):
    """SQLModel table for alert trigger history."""
    __tablename__ = "alert_logs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    alert_id: int
    symbol: str
    bar: str
    type: AlertType
    direction: AlertDirection
    triggered_at: datetime
    price: float
    close: float
    message: Optional[str] = None


# =============================================================================
# SQLModel Tables (backtest runs, trades, strategies, live jobs)
# =============================================================================

class Run(SQLModel, table=True):
    """SQLModel table for backtest runs."""
    __tablename__ = "runs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    status: RunStatus = Field(default=RunStatus.PENDING)
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    workdir: Optional[str] = None
    notes: Optional[str] = None  # JSON metadata field
    
    def dict(self) -> dict:
        """Compatibility method for code expecting .dict()"""
        return {
            "id": self.id,
            "symbol": self.symbol,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "workdir": self.workdir,
            "notes": self.notes,
        }


class Trade(SQLModel, table=True):
    """SQLModel table for trades."""
    __tablename__ = "trades"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: Optional[int] = Field(default=None, foreign_key="runs.id", index=True)
    symbol: str = Field(index=True)
    side: str  # "buy" or "sell"
    price: float
    quantity: float
    timestamp: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    def dict(self) -> dict:
        """Compatibility method for code expecting .dict()"""
        return {
            "id": self.id,
            "run_id": self.run_id,
            "symbol": self.symbol,
            "side": self.side,
            "price": self.price,
            "quantity": self.quantity,
            "timestamp": self.timestamp,
        }


class Strategy(SQLModel, table=True):
    """SQLModel table for strategies."""
    __tablename__ = "strategies"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    params: str = Field(default="{}", sa_column=Column(JSON))  # JSON string
    
    def dict(self) -> dict:
        """Compatibility method for code expecting .dict()"""
        return {
            "id": self.id,
            "name": self.name,
            "params": self.params,
        }


class LiveJob(SQLModel, table=True):
    """SQLModel table for live trading jobs."""
    __tablename__ = "live_jobs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    symbol: str = Field(index=True)
    status: str = Field(default="pending")
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    def dict(self) -> dict:
        """Compatibility method for code expecting .dict()"""
        return {
            "id": self.id,
            "name": self.name,
            "symbol": self.symbol,
            "status": self.status,
            "created_at": self.created_at,
        }


class ChartDrawing(SQLModel, table=True):
    """SQLModel table for ChartsPro drawings persistence (T-013).
    
    Each drawing is uniquely identified by (symbol, tf, drawing_id).
    The `data` field stores type-specific fields as JSON (p1, p2, etc.).
    """
    __tablename__ = "chart_drawings"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    drawing_id: str = Field(index=True)  # Frontend-generated UUID
    symbol: str = Field(index=True)
    tf: str = Field(index=True)  # Timeframe: 1m, 5m, 15m, 1h, 4h, 1D, 1W
    kind: str  # Drawing type: hline, vline, trend, elliottWave, etc.
    z: int = Field(default=0)  # Z-order (higher = on top)
    created_at_ms: int = Field(default=0)  # Client timestamp in ms
    updated_at_ms: int = Field(default=0)  # Client timestamp in ms
    locked: bool = Field(default=False)
    hidden: bool = Field(default=False)
    label: Optional[str] = None
    style: Optional[dict] = Field(default=None, sa_column=Column(JSON))  # {color, width, opacity, dash}
    data: Optional[dict] = Field(default=None, sa_column=Column(JSON))  # Type-specific: {p1, p2, ...}
    schema_version: str = Field(default="v1")  # For future migrations



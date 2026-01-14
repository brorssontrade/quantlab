"""Database models - stub."""
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel


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


class Alert(BaseModel):
    id: Optional[int] = None
    symbol: str
    alert_type: AlertType
    direction: AlertDirection
    created_at: Optional[datetime] = None


class AlertLog(BaseModel):
    id: Optional[int] = None
    alert_id: int
    triggered_at: datetime
    message: str


class LiveJob(BaseModel):
    id: Optional[int] = None
    name: str
    symbol: str
    status: str = "pending"


class Run(BaseModel):
    id: Optional[int] = None
    symbol: str
    status: RunStatus = RunStatus.PENDING
    created_at: Optional[datetime] = None


class Strategy(BaseModel):
    id: Optional[int] = None
    name: str
    params: dict = {}


class Trade(BaseModel):
    id: Optional[int] = None
    symbol: str
    side: str
    price: float
    quantity: float
    timestamp: Optional[datetime] = None

"""
Fundamentals routes: Metrics, scoring, watchlists.

**Purpose**:
- Fetch fundamental metrics from Alpha Vantage (P/E, ROE, etc.)
- Score symbols using multi-factor models with configurable weights
- Manage watchlist templates and refresh scoring jobs
- Provide health checks for fundamentals ingestion status

**Contracts**:
- GET /fundamentals/{symbol} → FundamentalMetrics + raw JSON
- POST /fundamentals/score → Scored symbols with buy/sell signals
- GET /fundamentals/watchlists → Watchlist templates list
- GET /fundamentals/health → Ingestion status + cache metadata
- GET /fundamentals/scores/latest → Latest scores for all symbols
- GET /fundamentals/scores/history → Historical scores for one symbol
- POST /fundamentals/watchlists/{id}/refresh → Trigger watchlist scoring job

**Models**:
- FundamentalsScoreThresholds (buy/sell cutoffs)
- FundamentalsScoreRequest (symbols, weights, thresholds, force flag)

**Dependencies**:
- app.fundamentals_service (fetch_fundamental_metrics, fundamentals_score_symbols)
- app.fundamentals_tasks (load_latest_scores, load_score_history, refresh_watchlist_scores, etc.)
- quantkit.data.alphavantage_client (AlphaVantageError exception)
- quantkit.fundamentals.storage (metrics_to_dict serialization)
"""
from __future__ import annotations
import logging
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from quantkit.data.alphavantage_client import AlphaVantageError
from quantkit.fundamentals.storage import metrics_to_dict

from ..fundamentals_service import (
    get_metrics as fetch_fundamental_metrics,
    score_symbols as fundamentals_score_symbols,
)
from ..fundamentals_tasks import (
    fundamentals_history_health,
    load_latest_scores,
    load_score_history,
    load_watchlist_templates,
    refresh_watchlist_scores,
)

logger = logging.getLogger("quantlab.app.routers.fundamentals")
router = APIRouter(prefix="/fundamentals", tags=["fundamentals"])


class FundamentalsScoreThresholds(BaseModel):
    buy: float = 70.0
    sell: float = 30.0


class FundamentalsScoreRequest(BaseModel):
    symbols: List[str]
    weights: Dict[str, Dict[str, float]]
    thresholds: FundamentalsScoreThresholds = FundamentalsScoreThresholds()
    force: bool = False


@router.get("/{symbol}")
def get_fundamentals(symbol: str, force: bool = Query(False, description="Force refresh from Alpha Vantage")) -> dict[str, Any]:
    try:
        metrics, raw = fetch_fundamental_metrics(symbol, force=force, include_raw=True)
    except AlphaVantageError as exc:
        raise HTTPException(status_code=429, detail=f"Alpha Vantage error: {exc}") from exc
    if metrics is None:
        raise HTTPException(status_code=404, detail=f"No fundamentals available for {symbol}")

    metrics_dict = metrics_to_dict(metrics)
    fx_meta = metrics.metadata.get("fx", {})
    fx_info = {
        "base": fx_meta.get("base", metrics.currency),
        "quote": fx_meta.get("quote", metrics.fx_quote),
        "rate": fx_meta.get("rate", metrics.fx_rate),
        "asof": fx_meta.get("asof", metrics_dict.get("asof")),
        "source": fx_meta.get("source", "Alpha Vantage"),
    }
    exclude_keys = {"symbol", "currency", "fx_rate", "fx_quote", "asof", "metadata"}
    metrics_payload = {k: v for k, v in metrics_dict.items() if k not in exclude_keys}
    score = metrics.metadata.get("scorecard") if isinstance(metrics.metadata, dict) else None

    return {
        "symbol": metrics.symbol,
        "currency": metrics.currency,
        "asof": metrics_dict.get("asof"),
        "fx": fx_info,
        "metrics": metrics_payload,
        "metadata": metrics.metadata,
        "score": score,
        "raw": raw,
    }


@router.post("/score")
def score_fundamentals(request: FundamentalsScoreRequest) -> dict[str, Any]:
    if not request.symbols:
        raise HTTPException(status_code=400, detail="symbols is required")
    if not request.weights:
        raise HTTPException(status_code=400, detail="weights is required")

    result = fundamentals_score_symbols(
        request.symbols,
        request.weights,
        buy_threshold=request.thresholds.buy,
        sell_threshold=request.thresholds.sell,
        force=request.force,
    )
    return result


@router.get("/watchlists")
def get_watchlists() -> dict[str, Any]:
    templates = load_watchlist_templates()
    return {"templates": templates}


@router.get("/health")
def get_health() -> dict[str, Any]:
    return fundamentals_history_health()


@router.get("/scores/latest")
def get_scores_latest(
    force: bool = Query(False, description="Refresh watchlist before returning"),
) -> dict[str, Any]:
    if force:
        return refresh_watchlist_scores(force=True)
    data = load_latest_scores()
    if data.get("scores"):
        return data
    try:
        return refresh_watchlist_scores(force=False)
    except Exception as exc:  # noqa: BLE001
        logger.warning("fundamentals scores refresh failed: %s", exc)
        return data


@router.get("/scores/history")
def get_scores_history(
    limit: int = Query(200, ge=1, le=1000),
    symbol: str | None = Query(None, description="Filter history to a specific symbol"),
) -> dict[str, Any]:
    items = load_score_history(limit=limit)
    if symbol:
        upper = symbol.strip().upper()
        items = [item for item in items if str(item.get("Symbol", "")).upper() == upper]
    return {"items": items}

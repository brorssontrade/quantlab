from __future__ import annotations
import ast
import json
import importlib
import logging
import os
import time
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import shutil
from collections import defaultdict, deque
from functools import lru_cache
from typing import Any, Dict, List, Literal, Optional, Tuple

from app.utils.lazy import lazy_pandas
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlmodel import select, delete
from quantkit.reporting.ts_report import build_report, load_backtest
from quantkit.data.alphavantage_client import AlphaVantageError
from quantkit.data.eodhd_client import fetch_timeseries
from quantkit.io.parquet_optional import read_parquet_optional
from quantkit.paths import snapshot_path, eodhd_cache_path
from quantkit.strategies import registry as strategy_registry
from quantkit.indicators import registry as indicator_registry
from quantkit.fundamentals.storage import metrics_to_dict
import yaml

from quantkit.env import get_eodhd_api_key
from .fundamentals_service import (
    get_metrics as fetch_fundamental_metrics,
    sanitize_symbol as sanitize_fundamental_symbol,
    score_symbols as fundamentals_score_symbols,
)
from .fundamentals_tasks import (
    fundamentals_history_health,
    load_latest_scores,
    load_score_history,
    load_watchlist_templates,
    refresh_watchlist_scores,
)

from .config import get_settings
from .db import create_db_and_tables, get_session
from .models import Alert, AlertDirection, AlertLog, AlertType, LiveJob, Run, RunStatus, Strategy, Trade
from .scheduler import (
    preview_schedule,
    remove_live_job,
    schedule_live_job,
    start_scheduler,
    shutdown_scheduler,
)
from .services import generate_latest_signals_from_workdir, run_optuna, run_pipeline_daily
from .assistant import router as assistant_router
from .alerts_service import eval_alerts_job, normalize_bar, normalize_geometry, normalize_symbol

pd = lazy_pandas()

# ============================================================================
# Settings & Initialization
# ============================================================================

settings = get_settings()
logger = logging.getLogger("quantlab.app")

_eodhd_key = get_eodhd_api_key()
if _eodhd_key:
    if not os.getenv("EODHD_API_KEY"):
        os.environ["EODHD_API_KEY"] = _eodhd_key
else:
    logger.warning("EODHD_API_KEY is not configured; live EODHD refresh will fail until the token is set.")

# ============================================================================
# FastAPI App & Middleware
# ============================================================================

app = FastAPI(title=settings.app_name)

# TV-3: Explicit CORS for local dev (preview + vite dev)
# In production, use reverse proxy and specific origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:3000",  # Streamlit
        "http://localhost:3000",
        "*",  # Fallback for other ports during dev
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Router Includes
# ============================================================================

# Router imports (PR2: Backend Routes Extraction)
from .routers import system, fundamentals, alerts

# Include routers
app.include_router(system.router)
app.include_router(fundamentals.router)
app.include_router(alerts.router)
app.include_router(assistant_router)

# ============================================================================
# Lifecycle Hooks & Scheduler
# ============================================================================

@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown() -> None:
    shutdown_scheduler()

# ============================================================================
# Constants
# ============================================================================

DEFAULT_FX_RATE = 10.0
EPSILON = 1e-9
META_CACHE_TTL = 300
_META_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
FUNDAMENTALS_CACHE_TTL = timedelta(hours=24)

# ============================================================================
# Helper Functions
# ============================================================================


def _run_metadata(run: Run) -> dict[str, Any]:
    if not run.notes:
        return {}
    try:
        data = json.loads(run.notes) if isinstance(run.notes, str) else run.notes
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}

def _read_snapshot_df(*parts: str) -> pd.DataFrame | None:
    path = snapshot_path(*parts)
    try:
        return pd.read_parquet(path)
    except FileNotFoundError:
        return None
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to load {path}: {exc}") from exc

# ============================================================================
# Request/Response Models
# ============================================================================


class OptimizeRequest(BaseModel):
    strategy: str
    n_trials: int = 30
    metric: Optional[str] = None
    symbols: Optional[List[str]] = None
    prices: Optional[str] = None
    start_date: Optional[date] = Field(default=None, alias="date_start")
    end_date: Optional[date] = Field(default=None, alias="date_end")
    bar: Optional[str] = "daily"

    initial_capital_sek: Optional[float] = None
    commission_sek_per_trade: Optional[float] = None
    commission_pct: Optional[float] = None
    slippage_pct: Optional[float] = None
    slippage_bps: Optional[float] = None

    trade_sizing_mode: Literal["sek_per_trade", "fixed_units"] = "sek_per_trade"
    sek_per_trade: Optional[float] = None
    units_per_trade: Optional[float] = Field(default=None, alias="fixed_units")
    fx_sek_per_usd: Optional[float] = Field(default=None, alias="fx_sek_per_usd")
    legacy_usd_per_trade: Optional[float] = Field(default=None, exclude=True)

    model_config = {"populate_by_name": True, "extra": "ignore"}


    @field_validator("symbols", mode="before")
    @classmethod
    def _normalize_symbols(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            return [s.strip() for s in value.split(",") if s.strip()]
        return value

    @field_validator("bar", mode="before")
    @classmethod
    def _normalize_bar(cls, value):
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        lowered = text.lower()
        alias = {
            "d": "daily",
            "day": "daily",
            "1d": "daily",
            "daily": "daily",
            "5": "5m",
            "5m": "5m",
            "5min": "5m",
            "15": "15m",
            "15m": "15m",
            "15min": "15m",
            "1h": "1h",
            "1": "1h",
            "60": "1h",
            "60m": "1h",
            "1hour": "1h",
            "h1": "1h",
        }
        normalized = alias.get(lowered, lowered)
        allowed = {"daily", "5m", "15m", "1h"}
        if normalized not in allowed:
            raise ValueError("bar must be one of: D, 5m, 15m, 1h")
        return normalized

    @model_validator(mode="before")
    @classmethod
    def _normalize_trade_mode(cls, data):
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        mode = payload.get("trade_sizing_mode")
        legacy_raw = payload.pop("usd_per_trade", None)
        legacy_float = None
        if legacy_raw not in (None, ""):
            try:
                legacy_float = float(legacy_raw)
            except (TypeError, ValueError):
                legacy_float = None
        if isinstance(mode, str) and mode.lower() == "usd_per_trade":
            payload["trade_sizing_mode"] = "sek_per_trade"
        if legacy_float is not None:
            payload["legacy_usd_per_trade"] = legacy_float
            if payload.get("sek_per_trade") in (None, ""):
                fx = payload.get("fx_sek_per_usd")
                try:
                    fx_float = float(fx) if fx is not None else DEFAULT_FX_RATE
                except (TypeError, ValueError):
                    fx_float = DEFAULT_FX_RATE
                payload["sek_per_trade"] = legacy_float * fx_float
        else:
            payload.setdefault("legacy_usd_per_trade", None)
        return payload

    @model_validator(mode="after")
    def _validate_sizing_values(self) -> "OptimizeRequest":
        if self.trade_sizing_mode == "sek_per_trade":
            value = self.sek_per_trade
            if value in (None, ""):
                raise ValueError("sek_per_trade must be > 0 when trade_sizing_mode='sek_per_trade'")
            try:
                numeric = float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError("sek_per_trade must be numeric") from exc
            if numeric <= 0:
                raise ValueError("sek_per_trade must be > 0 when trade_sizing_mode='sek_per_trade'")
            self.sek_per_trade = numeric
        elif self.trade_sizing_mode == "fixed_units":
            value = self.units_per_trade
            if value in (None, ""):
                raise ValueError("fixed_units must be > 0 when trade_sizing_mode='fixed_units'")
            try:
                numeric = float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError("fixed_units must be numeric") from exc
            if numeric <= 0:
                raise ValueError("fixed_units must be > 0 when trade_sizing_mode='fixed_units'")
            self.units_per_trade = numeric
        return self



class OptimizeResponse(BaseModel):
    ok: bool
    run_id: int
    workdir: Optional[str] = None
    stdout_tail: Optional[str] = None


class SignalsRequest(BaseModel):
    strategy: str
    workdir: Path
    prices: Optional[Path] = None


class SignalsLatestViewRequest(BaseModel):
    workdir: Path
    top: int = Field(default=10, ge=1, le=500)
    threshold: float = Field(default=0.0, ge=0.0)
    strategy: Optional[str] = None


class PipelineRequest(BaseModel):
    config: Optional[Path] = None


class RunUpdateRequest(BaseModel):
    display_name: Optional[str] = None

    @field_validator("display_name", mode="before")
    @classmethod
    def _normalise_name(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return str(value)




class LiveJobCreate(BaseModel):
    strategy: str
    schedule: str
    workdir: Path
    prices: Optional[Path] = None
    symbols: list[str] = Field(default_factory=list)
    params: dict = Field(default_factory=dict)
    threshold: Optional[float] = None
    top: Optional[int] = None
    description: Optional[str] = None


class PreviewScheduleRequest(BaseModel):
    schedule: str
    n: int = Field(default=5, ge=1, le=25)


class TradeCreate(BaseModel):
    ts: datetime
    symbol: str
    side: str
    quantity: float
    price: float
    strategy_id: Optional[str] = None
    run_id: Optional[int] = None
    pnl: Optional[float] = None
    note: Optional[str] = None

# ============================================================================
# Route Handlers & Business Logic
# ============================================================================


def compute_cost_bps_from_sek(*, commission_sek_per_trade: float = 0.0, commission_pct: float = 0.0, slippage_pct: float = 0.0, slippage_bps: float = 0.0, sek_per_trade: float = 0.0, fx_rate: float = DEFAULT_FX_RATE) -> float:
    fx = fx_rate if fx_rate and fx_rate > 0 else DEFAULT_FX_RATE
    trade_sek = abs(sek_per_trade) if sek_per_trade else 0.0
    trade_usd = trade_sek / fx if trade_sek and fx > 0 else 0.0
    bps = 0.0
    if commission_sek_per_trade > 0 and trade_usd > 0:
        commission_usd = abs(commission_sek_per_trade) / fx
        bps += (commission_usd / trade_usd) * 10000.0
    if commission_pct:
        bps += float(commission_pct) * 100.0
    if slippage_pct:
        bps += float(slippage_pct) * 100.0
    if slippage_bps:
        bps += float(slippage_bps)
    return round(bps, 4)


def compute_effective_cost_bps(req: OptimizeRequest) -> float:
    sek_trade = float(req.sek_per_trade or 0.0)
    fx = float(req.fx_sek_per_usd or DEFAULT_FX_RATE)
    if fx <= 0:
        fx = DEFAULT_FX_RATE
    return compute_cost_bps_from_sek(
        commission_sek_per_trade=float(req.commission_sek_per_trade or 0.0),
        commission_pct=float(req.commission_pct or 0.0),
        slippage_pct=float(req.slippage_pct or 0.0),
        slippage_bps=float(req.slippage_bps or 0.0),
        sek_per_trade=sek_trade,
        fx_rate=fx,
    )


@app.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest) -> OptimizeResponse:
    metric = req.metric or settings.default_metric
    prices_path = Path(req.prices) if req.prices else settings.default_prices
    out_dir = settings.optuna_out
    cost_bps = compute_effective_cost_bps(req)
    fx_rate = float(req.fx_sek_per_usd or DEFAULT_FX_RATE)
    symbols = [s for s in (req.symbols or []) if s]
    bar = req.bar
    if bar:
        lowered = bar.lower()
        if lowered in {"d", "daily"}:
            bar = "daily"
    metadata = {
        "cost_bps": cost_bps,
        "fx_sek_per_usd": fx_rate,
        "trade_sizing_mode": req.trade_sizing_mode,
        "sek_per_trade": req.sek_per_trade,
        "units_per_trade": req.units_per_trade,
        "initial_capital_sek": req.initial_capital_sek,
        "n_trials": req.n_trials,
        "symbols": symbols,
        "start_date": req.start_date.isoformat() if req.start_date else None,
        "end_date": req.end_date.isoformat() if req.end_date else None,
        "bar": bar,
    }
    metadata = {k: v for k, v in metadata.items() if v not in (None, [], {})}

    with get_session() as session:
        strategy = session.get(Strategy, req.strategy)
        if not strategy:
            strategy = Strategy(id=req.strategy, name=req.strategy)
            session.add(strategy)
        run = Run(
            strategy_id=req.strategy,
            status=RunStatus.pending,
            started_at=datetime.utcnow(),
            metric_name=metric,
            notes=json.dumps(metadata, default=str),
        )
        session.add(run)
        session.flush()
        run_id = run.id

    log_payload = {
        "strategy": req.strategy,
        "run_id": run_id,
        "symbols": symbols,
        "date_start": metadata.get("start_date"),
        "date_end": metadata.get("end_date"),
        "bar": bar,
        "initial_capital_sek": req.initial_capital_sek,
        "trade_sizing_mode": req.trade_sizing_mode,
        "sek_per_trade": req.sek_per_trade,
        "fixed_units": req.units_per_trade,
        "commission_sek_per_trade": req.commission_sek_per_trade,
        "commission_pct": req.commission_pct,
        "slippage_pct": req.slippage_pct,
        "slippage_bps": req.slippage_bps,
        "fx_sek_per_usd": fx_rate,
        "legacy_usd_per_trade": req.legacy_usd_per_trade,
        "n_trials": req.n_trials,
        "prices": prices_path.as_posix(),
        "cost_bps": cost_bps,
    }
    log_payload = {k: v for k, v in log_payload.items() if v is not None}
    logger.info("optimize request (SEK): %s", log_payload)

    normalized_sek = float(req.sek_per_trade or 0.0)
    if req.legacy_usd_per_trade is not None:
        logger.info("optimize legacy sizing normalized: strategy=%s run_id=%s usd_per_trade=%.4f -> sek_per_trade=%.4f (fx=%.4f)",
                    req.strategy, run_id, req.legacy_usd_per_trade, normalized_sek, fx_rate)
    else:
        logger.info("optimize sizing: strategy=%s run_id=%s mode=%s sek_per_trade=%.4f fx=%.4f cost_bps=%.4f",
                    req.strategy, run_id, req.trade_sizing_mode, normalized_sek, fx_rate, cost_bps)

    usd_per_trade = None
    if req.trade_sizing_mode == "sek_per_trade" and req.sek_per_trade:
        divisor = fx_rate if fx_rate > 0 else DEFAULT_FX_RATE
        usd_per_trade = req.sek_per_trade / divisor if divisor else None

    result = run_optuna(
        req.strategy,
        n_trials=req.n_trials,
        metric=metric,
        out_dir=out_dir,
        prices=prices_path,
        symbols=symbols or None,
        start_date=req.start_date,
        end_date=req.end_date,
        bar=bar,
        initial_capital=req.initial_capital_sek,
        cost_bps=cost_bps,
        sizing_mode=req.trade_sizing_mode,
        usd_per_trade=usd_per_trade,
        units_per_trade=req.units_per_trade,
    )
    finished_at = datetime.utcnow()

    with get_session() as session:
        run = session.get(Run, run_id)
        if run:
            run.finished_at = finished_at
            run.stdout = result.stdout
            run.stderr = result.stderr
            if result.ok:
                run.status = RunStatus.success
                run.workdir = result.workdir.as_posix() if result.workdir else None
            else:
                run.status = RunStatus.failed

    if not result.ok:
        raise HTTPException(status_code=500, detail={"stdout": result.stdout, "stderr": result.stderr})

    stdout_tail = result.stdout.splitlines()[-1] if result.stdout else None
    return OptimizeResponse(
        ok=True,
        run_id=run_id,
        workdir=result.workdir.as_posix() if result.workdir else None,
        stdout_tail=stdout_tail,
    )


@app.post("/signals/latest")
def signals_latest(req: SignalsRequest) -> dict[str, object]:
    try:
        result = generate_latest_signals_from_workdir(
            req.strategy, req.workdir, req.prices or settings.default_prices
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"ok": True, **result}


def _load_signals_latest(workdir: Path, top: int, threshold: float) -> dict[str, object]:
    parquet_path = workdir / "signals_latest.parquet"
    if not parquet_path.exists():
        raise HTTPException(status_code=404, detail=f"{parquet_path.as_posix()} not found")
    df = pd.read_parquet(parquet_path)
    if "score" in df.columns and threshold > 0:
        df = df[pd.to_numeric(df["score"], errors="coerce") >= threshold]
    if "score" in df.columns:
        df = df.sort_values("score", ascending=False)
    items = df.head(top).to_dict(orient="records")
    return {"items": items, "rows": len(items)}


@app.post("/signals/latest/view")
def signals_latest_view_post(req: SignalsLatestViewRequest) -> dict[str, object]:
    return _load_signals_latest(req.workdir, req.top, req.threshold)


@app.get("/signals/latest/view")
def signals_latest_view(
    workdir: str = Query(..., description="Optuna workdir"),
    top: int = Query(10, ge=1, le=500),
    threshold: float = Query(0.0, ge=0.0),
) -> dict[str, object]:
    return _load_signals_latest(Path(workdir), top, threshold)


@app.post("/pipeline/daily")
def pipeline_daily(req: PipelineRequest) -> dict[str, object]:
    result = run_pipeline_daily(req.config or settings.pipeline_config)
    if not result.ok:
        raise HTTPException(status_code=500, detail={"stdout": result.stdout, "stderr": result.stderr})
    return {"ok": True, "stdout": result.stdout}


def _find_report_json(workdir_path: Path) -> Optional[Path]:
    candidates = [
        workdir_path / "report.json",
        workdir_path / "report" / "report.json",
        workdir_path / "reports" / "report.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _load_trades_like(workdir_path: Path) -> list[dict[str, Any]]:
    candidates = [
        workdir_path / "trades.parquet",
        workdir_path / "trades.json",
        workdir_path / "trades.csv",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            if path.suffix == ".parquet":
                df = pd.read_parquet(path)
                return df.to_dict(orient="records")
            if path.suffix == ".json":
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    return data
            if path.suffix == ".csv":
                df = pd.read_csv(path)
                return df.to_dict(orient="records")
        except Exception:
            continue
    return []



@lru_cache(maxsize=128)
def _discover_strategy_indicators(strategy_id: str) -> list[str]:
    try:
        module = importlib.import_module(f"quantkit.strategies.{strategy_id}")
    except Exception:
        return []
    file_path = Path(getattr(module, "__file__", ""))
    if not file_path or not file_path.exists():
        return []
    try:
        source = file_path.read_text(encoding="utf-8")
    except OSError:
        return []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    module_paths: set[str] = set()
    helper_names: list[str] = []

    class _Visitor(ast.NodeVisitor):
        def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
            module_name = node.module or ""
            if module_name.startswith("quantkit.indicators"):
                if module_name.endswith(".registry"):
                    return
                if module_name == "quantkit.indicators":
                    for alias in node.names:
                        helper_names.append(alias.name)
                else:
                    module_paths.add(module_name)
            self.generic_visit(node)

    _Visitor().visit(tree)

    indicator_names: list[str] = []
    try:
        from quantkit.indicators import registry as indicator_registry
        indicator_registry.ensure_populated()
    except Exception:
        indicator_registry = None  # type: ignore

    for module_name in sorted(module_paths):
        try:
            mod = importlib.import_module(module_name)
        except Exception:
            continue
        spec = getattr(mod, "INDICATOR", None)
        if spec is not None:
            name = getattr(spec, "name", None) or getattr(spec, "id", None) or module_name.split(".")[-1]
            indicator_names.append(str(name))
        else:
            indicator_names.append(module_name.split(".")[-1])

    for func in helper_names:
        pretty = func.replace("_", " ").title()
        indicator_names.append(pretty)

    seen: set[str] = set()
    ordered: list[str] = []
    for name in indicator_names:
        label = str(name).strip()
        if not label or label in seen:
            continue
        seen.add(label)
        ordered.append(label)
    return ordered


def _materialise_report_json(run_info: dict[str, Any], workdir_path: Path, run_id: int) -> Path:
    backtest_path = workdir_path / "backtest.parquet"
    if not backtest_path.exists():
        raise HTTPException(status_code=404, detail=f"{backtest_path.as_posix()} not found")

    try:
        equity, _, turnover = load_backtest(backtest_path.as_posix())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to load backtest: {exc}") from exc

    metadata = run_info.get("metadata") if isinstance(run_info.get("metadata"), dict) else {}
    init_capital_val = metadata.get("initial_capital_sek") or metadata.get("initial_capital") or run_info.get("initial_capital_sek") or 100_000.0
    try:
        init_capital = float(init_capital_val)
    except (TypeError, ValueError):
        init_capital = 100_000.0

    bars = pd.DataFrame({
        "ts": equity.index,
        "high": equity.values,
        "low": equity.values,
        "open": equity.values,
        "close": equity.values,
    })
    bars["ts"] = pd.to_datetime(bars["ts"], utc=True, errors="coerce").dt.tz_convert(None)

    trades_like = _load_trades_like(workdir_path)

    avg_turnover = None
    if turnover is not None:
        to_series = pd.to_numeric(turnover, errors="coerce").dropna()
        if not to_series.empty:
            avg_turnover = float(to_series.mean())

    strategy_id = str(run_info.get("strategy_id", "strategy"))
    strategy_spec = None
    strategy_defaults: dict[str, Any] = {}
    strategy_display_name = strategy_id
    try:
        strategy_registry.ensure_populated()
        strategy_spec = strategy_registry.get(strategy_id)
    except KeyError:
        strategy_spec = None
    if strategy_spec:
        if getattr(strategy_spec, "name", None):
            strategy_display_name = str(strategy_spec.name)
        if isinstance(strategy_spec.defaults, dict):
            strategy_defaults = strategy_spec.defaults
    strategy_indicators = list(getattr(strategy_spec, "indicators", []) or _discover_strategy_indicators(strategy_id))

    if isinstance(metadata, dict):
        metadata.setdefault("strategy_id", strategy_id)
        metadata.setdefault("strategy_name", strategy_display_name)
        if strategy_defaults:
            metadata.setdefault("strategy_defaults", strategy_defaults)
        if strategy_indicators:
            metadata.setdefault("strategy_indicators", strategy_indicators)

    strategy_params: dict[str, Any] = {}
    best_params_path = workdir_path / "best_params.json"
    if best_params_path.exists():
        try:
            meta = json.loads(best_params_path.read_text(encoding="utf-8"))
            if isinstance(meta, dict):
                strategy_params = meta.get("params", meta)
        except json.JSONDecodeError:
            strategy_params = {}

    if isinstance(metadata, dict) and strategy_params:
        metadata.setdefault("optimized_params", strategy_params)

    commission_total = metadata.get("commission_total") or 0.0
    bps_total = metadata.get("bps_fees_total") or 0.0
    slippage_total = metadata.get("slippage_total") or 0.0
    try:
        commission_total = float(commission_total)
    except (TypeError, ValueError):
        commission_total = 0.0
    try:
        bps_total = float(bps_total)
    except (TypeError, ValueError):
        bps_total = 0.0
    try:
        slippage_total = float(slippage_total)
    except (TypeError, ValueError):
        slippage_total = 0.0

    out_path = build_report(
        bars=bars,
        equity=equity,
        trades_like=trades_like,
        symbol=strategy_id,
        run_id=str(run_id),
        out_dir=workdir_path,
        strategy_name=strategy_display_name,
        strategy_id=strategy_id,
        strategy_params=strategy_params,
        strategy_defaults=strategy_defaults,
        strategy_indicators=strategy_indicators,
        avg_turnover=avg_turnover,
        init_capital=init_capital,
        commission_total=commission_total,
        bps_fees_total=bps_total,
        slippage_total=slippage_total,
        run_metadata=metadata,
    )
    json_path = out_path.with_suffix('.json')
    if not json_path.exists():
        raise HTTPException(status_code=500, detail="Failed to materialise report.json")
    return json_path


@app.get("/runs")
def list_runs(limit: int = 25) -> dict[str, object]:
    with get_session() as session:
        statement = select(Run).order_by(Run.started_at.desc()).limit(limit)
        runs = session.exec(statement).all()
        items: list[dict[str, object]] = []
        for run in runs:
            data = run.dict()
            metadata = _run_metadata(run)
            if metadata:
                display_name = metadata.get("display_name")
                if isinstance(display_name, str):
                    data["display_name"] = display_name
            items.append(data)
        return {"items": items}


@app.patch("/runs/{run_id}")
def update_run(run_id: int, req: RunUpdateRequest) -> dict[str, object]:
    with get_session() as session:
        run = session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        metadata = _run_metadata(run)
        name = req.display_name
        if name:
            metadata["display_name"] = name
        else:
            metadata.pop("display_name", None)
        run.notes = json.dumps(metadata, default=str) if metadata else None
        session.add(run)
        session.commit()
        session.refresh(run)
        payload = run.dict()
        if name:
            payload["display_name"] = name
        return {"ok": True, "run": payload}


@app.delete("/runs/{run_id}")
def delete_run(run_id: int, purge: bool = Query(False, description="Also delete run workdir from disk")) -> dict[str, object]:
    workdir_path: Optional[Path] = None
    with get_session() as session:
        run = session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        if run.workdir:
            workdir_path = Path(run.workdir)
        session.exec(delete(Trade).where(Trade.run_id == run_id))
        session.delete(run)
        session.commit()
    purged = False
    warning = None
    if purge and workdir_path and workdir_path.exists():
        try:
            shutil.rmtree(workdir_path)
            purged = True
        except Exception as exc:  # noqa: BLE001
            warning = str(exc)
            logger.warning("failed to purge workdir for run %s: %s", run_id, exc)
    response: dict[str, object] = {"ok": True, "deleted": True, "purged": purged}
    if warning:
        response["warning"] = warning
    return response




@app.get("/runs/{run_id}/report")
def get_run_report(run_id: int) -> dict[str, object]:
    with get_session() as session:
        run = session.get(Run, run_id)
        if not run or not run.workdir:
            raise HTTPException(status_code=404, detail="Run not found")
        metadata = _run_metadata(run)
        run_info = {
            "strategy_id": run.strategy_id,
            "metadata": metadata,
            "initial_capital_sek": metadata.get("initial_capital_sek"),
        }
        workdir_path = Path(run.workdir)
        report_path = _materialise_report_json(run_info, workdir_path, run_id)
    data = json.loads(report_path.read_text(encoding="utf-8"))
    return data


@app.get("/live")
def list_live_jobs() -> dict[str, object]:
    with get_session() as session:
        jobs = session.exec(select(LiveJob)).all()
        return {"items": [job.dict() for job in jobs]}


def _preview_schedule_response(schedule: str, n: int) -> dict[str, object]:
    try:
        upcoming = preview_schedule(schedule, n)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"next": upcoming}


@app.post("/live/preview-schedule")
def live_preview_schedule_post(req: PreviewScheduleRequest) -> dict[str, object]:
    return _preview_schedule_response(req.schedule, req.n)


@app.get("/live/preview-schedule")
def live_preview_schedule(expr: str, n: int = 5) -> dict[str, object]:
    return _preview_schedule_response(expr, n)


@app.post("/live/start")
def create_live_job(req: LiveJobCreate) -> dict[str, object]:
    params = dict(req.params)
    params.setdefault("workdir", req.workdir.as_posix())
    if req.prices:
        params.setdefault("prices", req.prices.as_posix())

    with get_session() as session:
        strategy = session.get(Strategy, req.strategy)
        if not strategy:
            strategy = Strategy(id=req.strategy, name=req.strategy)
            session.add(strategy)
        job = LiveJob(
            strategy_id=req.strategy,
            schedule=req.schedule,
            symbols=req.symbols,
            params=params,
            threshold=req.threshold,
            top=req.top,
            description=req.description,
        )
        session.add(job)
        session.flush()
        job_id = job.id

    with get_session() as session:
        job = session.get(LiveJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Live job not found after creation")
        schedule_live_job(job)
        return job.dict()


@app.delete("/live/{job_id}")
def delete_live_job(job_id: int) -> dict[str, object]:
    with get_session() as session:
        job = session.get(LiveJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Live job not found")
        job.enabled = False
    remove_live_job(job_id)
    return {"ok": True}




def _signed_quantity(trade: Trade) -> float:
    qty = float(trade.quantity or 0.0)
    if qty == 0:
        return 0.0
    side = (trade.side or "").strip().lower()
    if side in {"sell", "short"}:
        return -abs(qty)
    if side in {"buy", "long", "cover"}:
        return abs(qty)
    return qty



def _analyse_trades(trades: List[Trade]):
    positions: dict[str, deque[dict[str, object]]] = defaultdict(deque)
    realized_pnl = 0.0
    closed_trade_pnls: list[float] = []
    equity: list[dict[str, object]] = []
    running = 0.0
    for trade in trades:
        qty = float(trade.quantity or 0.0)
        if abs(qty) <= EPSILON:
            continue
        signed_qty = _signed_quantity(trade)
        if abs(signed_qty) <= EPSILON:
            continue
        price = float(trade.price or 0.0)
        symbol = trade.symbol
        lots = positions[symbol]
        remaining = signed_qty
        closed_qty = 0.0
        trade_pnl = 0.0
        while lots and remaining and lots[0]["quantity"] * remaining < 0:
            lot = lots[0]
            direction = 1.0 if lot["quantity"] > 0 else -1.0
            match_qty = min(abs(lot["quantity"]), abs(remaining))
            pnl = (price - float(lot["price"])) * match_qty * direction
            trade_pnl += pnl
            realized_pnl += pnl
            running += pnl
            lot["quantity"] -= match_qty * direction
            remaining += match_qty * direction
            closed_qty += match_qty
            if abs(lot["quantity"]) <= EPSILON:
                lots.popleft()
        if abs(remaining) > EPSILON:
            lots.append({"quantity": remaining, "price": price, "ts": trade.ts})
        if closed_qty > EPSILON:
            closed_trade_pnls.append(trade_pnl)
            stamp = trade.ts.isoformat()
            equity.append({"ts": stamp, "equity": running, "Ts": stamp, "Equity": running})
    return {
        "positions": positions,
        "realized_pnl": realized_pnl,
        "closed_trade_pnls": closed_trade_pnls,
        "equity": equity,
    }


def _frame_to_records(df: pd.DataFrame, *, limit: Optional[int] = None) -> list[Dict[str, Any]]:
    if limit is not None and limit >= 0:
        df = df.head(limit)
    records: list[Dict[str, Any]] = []
    for entry in df.to_dict(orient="records"):
        cleaned: Dict[str, Any] = {}
        for key, value in entry.items():
            if isinstance(value, pd.Timestamp):
                ts = value
                if value.tzinfo is None:
                    ts = value.tz_localize('UTC')
                else:
                    ts = value.tz_convert('UTC')
                cleaned[key] = ts.isoformat()
            elif isinstance(value, (pd.Series, pd.Index)):
                cleaned[key] = value.tolist()
            elif isinstance(value, float) and pd.isna(value):
                cleaned[key] = None
            else:
                cleaned[key] = value
        records.append(cleaned)
    return records




@app.get("/trades")
def list_trades(limit: int = 200) -> dict[str, object]:
    with get_session() as session:
        trades = session.exec(select(Trade).order_by(Trade.ts.desc()).limit(limit)).all()
        return {"items": [t.dict() for t in trades]}


@app.post("/trades")
def create_trade(trade: TradeCreate) -> dict[str, object]:
    with get_session() as session:
        db_trade = Trade(**trade.dict())
        session.add(db_trade)
        session.flush()
        return {"ok": True, "id": db_trade.id}


@app.get("/trades/summary")
def trades_summary() -> dict[str, object]:
    with get_session() as session:
        trades = session.exec(select(Trade).order_by(Trade.ts)).all()
    trade_count = len(trades)
    if trade_count == 0:
        return {
            "trade_count": 0,
            "num_trades": 0,
            "realized_pnl": 0.0,
            "unrealized_pnl": 0.0,
            "win_rate": 0.0,
            "avg_win": 0.0,
            "avg_loss": 0.0,
            "closed_trades": 0,
            "equity": [],
        }

    analysis = _analyse_trades(trades)
    closed_pnls = analysis["closed_trade_pnls"]
    wins = [p for p in closed_pnls if p > 0]
    losses = [p for p in closed_pnls if p < 0]
    closed_count = len(closed_pnls)
    win_rate = (len(wins) / closed_count) if closed_count else 0.0
    avg_win = sum(wins) / len(wins) if wins else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 0.0

    summary = {
        "trade_count": trade_count,
        "num_trades": trade_count,
        "realized_pnl": round(analysis["realized_pnl"], 4),
        "unrealized_pnl": 0.0,
        "win_rate": round(win_rate, 4),
        "avg_win": round(avg_win, 4),
        "avg_loss": round(avg_loss, 4),
        "closed_trades": closed_count,
        "equity": analysis["equity"],
    }
    return summary


@app.get("/positions/open")
def positions_open() -> dict[str, object]:
    with get_session() as session:
        trades = session.exec(select(Trade).order_by(Trade.ts)).all()
    analysis = _analyse_trades(trades)
    items: list[dict[str, object]] = []
    for symbol, lots in analysis["positions"].items():
        for lot in lots:
            items.append({
                "symbol": symbol,
                "direction": "long" if lot["quantity"] > 0 else "short",
                "quantity": round(lot["quantity"], 6),
                "entry_price": round(float(lot["price"]), 4),
                "entry_ts": lot["ts"].isoformat(),
            })
    items.sort(key=lambda row: (row["symbol"], row["entry_ts"]))
    return {"items": items}


@app.get("/meta/strategies")
def meta_strategies() -> dict[str, List[str]]:
    now = time.time()
    cached = _META_CACHE.get("strategies")
    if cached and now - cached[0] < META_CACHE_TTL:
        return cached[1]

    items: list[str] = []
    try:
        strategy_registry.ensure_populated()
        specs = strategy_registry.list_strategies()
        items = sorted({spec.id for spec in specs})
    except Exception as exc:  # noqa: BLE001
        logger.warning("meta strategies refresh failed: %s", exc)
        items = []
    result = {"items": items}
    _META_CACHE["strategies"] = (now, result)
    logger.info("meta strategies refresh: count=%d", len(items))
    return result


@app.get("/debug/app-file")
def debug_app_file() -> dict[str, str]:
    return {"file": __file__}



@app.get("/meta/symbols")
def meta_symbols() -> dict[str, List[Dict[str, str]]]:
    now = time.time()
    cached = _META_CACHE.get("symbols")
    if cached and now - cached[0] < META_CACHE_TTL:
        return cached[1]

    items: list[dict[str, str]] = []
    seen: set[str] = set()
    watchlist_paths = [
        Path("watchlist.yaml"),
        Path("watchlist.yml"),
        Path("config/watchlist.yml"),
        Path("config/watchlist.yaml"),
    ]
    for path_w in watchlist_paths:
        if not path_w.exists():
            continue
        try:
            data = yaml.safe_load(path_w.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("meta symbols watchlist parse failed (%s): %s", path_w, exc)
            continue
        if isinstance(data, dict):
            entries = data.get("items", []) or []
        elif isinstance(data, list):
            entries = data
        else:
            entries = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            code = str(entry.get("code") or "").strip()
            name = str(entry.get("name") or code).strip()
            if not code:
                continue
            if code in seen:
                continue
            seen.add(code)
            items.append({"code": code, "name": name or code})
        if items:
            break
    if not items:
        tickers_file = Path("config/tickers.txt")
        if tickers_file.exists():
            for line in tickers_file.read_text(encoding="utf-8").splitlines():
                code = line.strip()
                if not code or code in seen:
                    continue
                items.append({"code": code, "name": code})
                seen.add(code)
    result = {"items": items}
    _META_CACHE["symbols"] = (now, result)
    logger.info("meta symbols refresh: count=%d", len(items))
    return result




_CHART_ALLOWED_BARS = {
    "1m": "1m",
    "min": "1m",
    "1min": "1m",
    "60s": "1m",
    "5m": "5m",
    "5min": "5m",
    "15m": "15m",
    "15min": "15m",
    "1h": "1h",
    "60m": "1h",
    "1hour": "1h",
    "4h": "4h",
    "240m": "4h",
    "d": "D",
    "1d": "D",
    "day": "D",
    "daily": "D",
    "1w": "1W",
    "week": "1W",
    "weekly": "1W",
    "7d": "1W",
}

_CHART_FETCH_PLAN: dict[str, list[tuple[str, str | None]]] = {
    "1m": [("1m", None)],
    "5m": [("5m", None)],
    "15m": [("5m", "15m")],
    "1h": [("1h", None), ("5m", "1h")],
    "4h": [("1h", "4h"), ("5m", "4h")],
    "D": [("1d", None)],
    "1W": [("1d", "1w")],
}

_CHART_MAX_LIMIT = 5000
_CHART_MIN_LIMIT = 100


_CHART_CACHE_TTL = 300
_CHART_CACHE: dict[tuple[str, str, str | None, str | None, int], tuple[float, "ChartOHLCVResponse"]] = {}


@lru_cache(maxsize=4)
def _cached_price_frame(path: str, mtime: float) -> pd.DataFrame:
    df = pd.read_parquet(path)
    if "Symbol" in df.columns:
        df["Symbol"] = df["Symbol"].astype(str)
    ts_col = None
    for cand in ("Ts", "ts", "Date", "date", "Datetime", "datetime"):
        if cand in df.columns:
            ts_col = cand
            break
    if ts_col is None:
        raise RuntimeError("prices parquet saknar tidskolumn")
    df[ts_col] = pd.to_datetime(df[ts_col], utc=True, errors="coerce")
    if ts_col != "Ts":
        df = df.rename(columns={ts_col: "Ts"})
    for col in ("Open", "High", "Low", "Close", "AdjClose", "Volume"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.sort_values(["Symbol", "Ts"]).reset_index(drop=True)


def _load_price_frame() -> pd.DataFrame:
    prices_path = settings.default_prices
    if not prices_path.exists():
        raise HTTPException(status_code=404, detail=f"Prices file {prices_path} not found")
    stat = prices_path.stat()
    cached = _cached_price_frame(prices_path.as_posix(), stat.st_mtime)
    return cached.copy()


def _normalize_chart_bar(value: str) -> str:
    if not value:
        raise HTTPException(status_code=422, detail="bar is required")
    text_val = value.strip().lower()
    if text_val not in _CHART_ALLOWED_BARS:
        allowed = sorted(set(_CHART_ALLOWED_BARS.values()))
        raise HTTPException(status_code=400, detail=f"bar must be one of {allowed}")
    return _CHART_ALLOWED_BARS[text_val]


def _parse_chart_ts(value: str | None) -> pd.Timestamp | None:
    if not value:
        return None
    try:
        ts = pd.to_datetime(value, utc=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid timestamp '{value}'") from exc
    if pd.isna(ts):
        raise HTTPException(status_code=400, detail=f"Invalid timestamp '{value}'")
    return ts


def _downsample_candles(df: pd.DataFrame, limit: int) -> pd.DataFrame:
    if len(df) <= limit:
        return df
    if limit <= 0:
        raise ValueError("limit must be positive")
    bucket = math.ceil(len(df) / limit)
    records: list[dict[str, object]] = []
    for start in range(0, len(df), bucket):
        chunk = df.iloc[start:start + bucket]
        if chunk.empty:
            continue
        first = chunk.iloc[0]
        last = chunk.iloc[-1]
        records.append({
            "Ts": first["Ts"],
            "Open": float(first["Open"]),
            "High": float(chunk["High"].max()),
            "Low": float(chunk["Low"].min()),
            "Close": float(last["Close"]),
            "Volume": float(chunk["Volume"].sum()) if "Volume" in chunk.columns else 0.0,
        })
        if len(records) >= limit:
            break

    return pd.DataFrame.from_records(records)


def _synthesise_intraday(df: pd.DataFrame, bar: str) -> pd.DataFrame:
    bar_lower = bar.lower()
    segments = {"4h": 2, "1h": 6, "15m": 26, "5m": 78, "1m": 390}
    count = segments.get(bar_lower)
    if not count:
        raise HTTPException(status_code=400, detail=f"Bar '{bar}' not available for symbol")
    session_minutes = 390
    step_minutes = max(session_minutes // count, 1)
    records: list[dict[str, object]] = []
    for row in df.sort_values("Ts").itertuples(index=False):
        start_ts = getattr(row, "Ts")
        if pd.isna(start_ts):
            continue
        start = pd.Timestamp(start_ts)
        if pd.isna(start):
            continue
        if start.tzinfo is None:
            start = start.tz_localize("UTC")
        else:
            start = start.tz_convert("UTC")
        open_price = float(getattr(row, "Open"))
        close_price = float(getattr(row, "Close"))
        high_price = float(getattr(row, "High"))
        low_price = float(getattr(row, "Low"))
        volume = float(getattr(row, "Volume", 0.0))
        symbol_value = getattr(row, "Symbol", "")
        for idx in range(count):
            progress = idx / max(count - 1, 1)
            price = open_price + (close_price - open_price) * progress
            candle_high = max(high_price, price)
            candle_low = min(low_price, price)
            ts = start + pd.to_timedelta(idx * step_minutes, unit="m")
            records.append({
                "Ts": ts,
                "Open": price,
                "High": candle_high,
                "Low": candle_low,
                "Close": price,
                "Volume": volume / count if count else volume,
                "Symbol": symbol_value,
            })
    if not records:
        raise HTTPException(status_code=404, detail="No price data available for requested timeframe")
    return pd.DataFrame.from_records(records)





def _load_cached_eodhd(symbol: str, timeframe: str) -> pd.DataFrame:
    candidates = [
        eodhd_cache_path(symbol, timeframe),
        eodhd_cache_path(symbol.upper(), timeframe),
        eodhd_cache_path(symbol.lower(), timeframe),
    ]
    seen: set[Path] = set()
    for path in candidates:
        normalized = Path(path)
        if normalized in seen or not normalized.exists():
            continue
        seen.add(normalized)
        df = read_parquet_optional(normalized)
        if df is not None and not df.empty:
            return df
    return pd.DataFrame()


_COLUMN_NAME_MAP = {
    "ts": "Ts",
    "timestamp": "Ts",
    "date": "Ts",
    "open": "Open",
    "high": "High",
    "low": "Low",
    "close": "Close",
    "adjclose": "AdjClose",
    "adj_close": "AdjClose",
    "adj close": "AdjClose",
    "volume": "Volume",
    "symbol": "Symbol",
}


def _normalize_ohlcv(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame(columns=["Ts", "Open", "High", "Low", "Close", "Volume"])
    out = df.copy()
    rename: dict[str, str] = {}
    for col in out.columns:
        mapped = _COLUMN_NAME_MAP.get(col.lower())
        if mapped:
            rename[col] = mapped
    if rename:
        out = out.rename(columns=rename)
    if "Ts" in out.columns:
        out["Ts"] = pd.to_datetime(out["Ts"], utc=True, errors="coerce")
    else:
        for candidate in ("ts", "timestamp", "date"):
            if candidate in out.columns:
                out["Ts"] = pd.to_datetime(out[candidate], utc=True, errors="coerce")
                break
    for col in ("Open", "High", "Low", "Close", "Volume"):
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")
    if "Volume" not in out.columns:
        out["Volume"] = 0.0
    if "Symbol" not in out.columns:
        out["Symbol"] = symbol
    out = out.dropna(subset=["Ts", "Open", "High", "Low", "Close"])
    out = out.sort_values("Ts").reset_index(drop=True)
    out["Volume"] = out["Volume"].fillna(0.0)
    return out


def _resample_from_base(df: pd.DataFrame, target_bar: str, symbol: str) -> pd.DataFrame:
    freq_map = {
        "1h": "1H",
        "4h": "4H",
        "15m": "15min",
        "30m": "30min",
        "1w": "W-FRI",
    }
    key = target_bar.lower()
    freq = freq_map.get(key)
    if not freq or df.empty:
        return pd.DataFrame()
    working = df.copy()
    working["Ts"] = pd.to_datetime(working["Ts"], utc=True, errors="coerce")
    working = working.dropna(subset=["Ts", "Open", "High", "Low", "Close"]).set_index("Ts")
    if working.empty:
        return working.reset_index()
    agg = working.resample(freq, label="right", closed="right").agg({
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum",
    })
    agg = agg.dropna(subset=["Open", "High", "Low", "Close"]).reset_index()
    if agg.empty:
        return agg
    if "Symbol" in working.columns and not working["Symbol"].dropna().empty:
        agg["Symbol"] = working["Symbol"].dropna().iloc[0]
    else:
        agg["Symbol"] = symbol
    return agg


def _load_chart_dataset(
    symbol: str,
    bar: str,
    *,
    force_refresh: bool = False,
) -> tuple[pd.DataFrame, str, bool]:
    symbol_norm = symbol.upper()
    fallback = False
    source = "eodhd"

    def _ensure_data(df_raw: pd.DataFrame) -> pd.DataFrame:
        return _normalize_ohlcv(df_raw, symbol_norm)

    def _fetch_remote(tf: str) -> pd.DataFrame:
        try:
            return fetch_timeseries(symbol_norm, tf, force=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("chart ohlcv: fetch_timeseries failed for %s %s: %s", symbol_norm, tf, exc)
            return pd.DataFrame()

    def _load_source(tf: str) -> pd.DataFrame:
        if not force_refresh:
            cached = _load_cached_eodhd(symbol_norm, tf)
            if not cached.empty:
                return cached
        return _fetch_remote(tf)

    plan = _CHART_FETCH_PLAN.get(bar, [("1d", None)])
    for fetch_tf, resample_target in plan:
        df_raw = _load_source(fetch_tf)
        if df_raw.empty:
            continue
        df_norm = _ensure_data(df_raw)
        if resample_target:
            df_norm = _resample_from_base(df_norm, resample_target, symbol_norm)
        if not df_norm.empty:
            return df_norm, source, False

    base = _load_price_frame()
    mask = base.get("Symbol")
    if mask is not None:
        base = base[base["Symbol"].astype(str).str.casefold() == symbol.casefold()]
    if base.empty:
        return pd.DataFrame(), "fallback", True
    base_norm = _ensure_data(base)
    if bar == "1W":
        fallback = True
        weekly = _resample_from_base(base_norm, "1w", symbol_norm)
        if weekly.empty:
            return pd.DataFrame(), "fallback", True
        return weekly, "storage", True
    if bar != "D":
        fallback = True
        df_fallback = _synthesise_intraday(base_norm, bar)
        df_norm = _ensure_data(df_fallback)
        return df_norm, "fallback", True
    return base_norm, "storage", True
    bar_lower = bar.lower()
    segments = {"1h": 6, "15m": 26, "5m": 78}
    count = segments.get(bar_lower)
    if not count:
        raise HTTPException(status_code=400, detail=f"Bar '{bar}' not available for symbol")
    session_minutes = 390  # 6.5 trading hours
    step_minutes = max(session_minutes // count, 1)
    records: list[dict[str, object]] = []
    for row in df.sort_values("Ts").itertuples(index=False):
        start_ts = getattr(row, "Ts")
        if pd.isna(start_ts):
            continue
        start = pd.Timestamp(start_ts)
        if pd.isna(start):
            continue
        if start.tzinfo is None:
            start = start.tz_localize("UTC")
        else:
            start = start.tz_convert("UTC")
        open_price = float(getattr(row, "Open"))
        close_price = float(getattr(row, "Close"))
        high_price = float(getattr(row, "High"))
        low_price = float(getattr(row, "Low"))
        volume = float(getattr(row, "Volume", 0.0))
        for idx in range(count):
            progress = idx / max(count - 1, 1)
            price = open_price + (close_price - open_price) * progress
            candle_high = max(high_price, price)
            candle_low = min(low_price, price)
            ts = start + pd.to_timedelta(idx * step_minutes, unit="m")
            records.append({
                "Ts": ts,
                "Open": price,
                "High": candle_high,
                "Low": candle_low,
                "Close": price,
                "Volume": volume / count if count else volume,
                "Symbol": getattr(row, "Symbol"),
            })
    if not records:
        raise HTTPException(status_code=404, detail="No price data available for requested timeframe")
    return pd.DataFrame.from_records(records)


class ChartOHLCVRow(BaseModel):
    t: str
    o: float
    h: float
    l: float
    c: float
    v: float


class ChartOHLCVMeta(BaseModel):
    symbol: str
    bar: str
    tz: str = "UTC"
    source: str
    fallback: bool


class ChartOHLCVResponse(BaseModel):
    symbol: str
    bar: str
    tz: str = "UTC"
    source: str
    fallback: bool
    rows: List[ChartOHLCVRow]
    meta: ChartOHLCVMeta
    error: str | None = None


@app.get("/chart/ohlcv", response_model=ChartOHLCVResponse)
def chart_ohlcv(
    response: Response,
    symbol: str = Query(..., description="Symbol, e.g. AAPL.US"),
    bar: str = Query("D", description="Bar size: D, 1h, 15m, 5m"),
    start: str | None = Query(None, description="ISO start timestamp"),
    end: str | None = Query(None, description="ISO end timestamp"),
    limit: int = Query(2000, description="Maximum number of candles to return (<=5000)"),
) -> ChartOHLCVResponse:
    clean_symbol = symbol.strip()
    if not clean_symbol:
        raise HTTPException(status_code=422, detail="symbol is required")
    norm_bar = _normalize_chart_bar(bar)
    capped_limit = max(_CHART_MIN_LIMIT, min(int(limit or _CHART_MAX_LIMIT), _CHART_MAX_LIMIT))

    start_ts = _parse_chart_ts(start)
    end_ts = _parse_chart_ts(end)
    cache_key = (
        clean_symbol.upper(),
        norm_bar,
        start_ts.isoformat() if start_ts is not None else None,
        end_ts.isoformat() if end_ts is not None else None,
        capped_limit,
    )
    now = time.time()
    cached = _CHART_CACHE.get(cache_key)
    if cached and now - cached[0] < _CHART_CACHE_TTL:
        payload = cached[1]
        response.headers["X-Cache"] = "hit"
        response.headers["X-Data-Source"] = payload.source
        response.headers["X-Data-Fallback"] = "true" if payload.fallback else "false"
        return payload

    force_next = False
    has_forced = False
    range_fallback = False
    error_detail: str | None = None

    try:
        while True:
            df, source, fallback = _load_chart_dataset(clean_symbol, norm_bar, force_refresh=force_next)
            forced_this_round = force_next
            has_forced = has_forced or forced_this_round
            force_next = False

            if df.empty:
                if forced_this_round or fallback:
                    detail = f"No price data for symbol '{clean_symbol}'"
                    if forced_this_round and not fallback:
                        detail += " (refresh from EODHD failed; verify API key and ingestion status)"
                    raise HTTPException(status_code=404, detail=detail)
                force_next = True
                continue

            working = df
            if start_ts is not None:
                working = working[working["Ts"] >= start_ts]
            if end_ts is not None:
                working = working[working["Ts"] <= end_ts]
            if working.empty:
                range_fallback = True
                previous_window = df[df["Ts"] < start_ts] if start_ts is not None else pd.DataFrame()
                if not previous_window.empty:
                    working = previous_window.tail(capped_limit)
            df = working
            break

        df = df.sort_values("Ts").reset_index(drop=True)
        df = df[["Ts", "Open", "High", "Low", "Close", "Volume"]]
        df = _downsample_candles(df, capped_limit)
        if df.empty:
            raise HTTPException(status_code=404, detail="No candles available for the requested range")

        rows: list[ChartOHLCVRow] = []
        for row in df.itertuples(index=False):
            ts = pd.Timestamp(row.Ts)
            if ts.tzinfo is None:
                ts = ts.tz_localize("UTC")
            else:
                ts = ts.tz_convert("UTC")
            rows.append(ChartOHLCVRow(
                t=ts.isoformat().replace("+00:00", "Z"),
                o=float(row.Open),
                h=float(row.High),
                l=float(row.Low),
                c=float(row.Close),
                v=float(row.Volume),
            ))

        meta = ChartOHLCVMeta(symbol=clean_symbol, bar=norm_bar, tz="UTC", source=source, fallback=fallback)
        payload = ChartOHLCVResponse(
            symbol=clean_symbol,
            bar=norm_bar,
            tz="UTC",
            source=source,
            fallback=fallback,
            rows=rows,
            meta=meta,
        )
        response.headers["X-Cache"] = "miss"
        response.headers["X-Data-Source"] = source
        response.headers["X-Data-Fallback"] = "true" if fallback else "false"
        response.headers["X-Data-Refreshed"] = "true" if has_forced else "false"
        if range_fallback:
            response.headers["X-Data-RangeFallback"] = "true"
            response.headers["X-Data-RangeFallback-Ts"] = rows[-1].t if rows else ""
        _CHART_CACHE[cache_key] = (now, payload)
        return payload
    except HTTPException as exc:
        error_detail = str(exc.detail or exc)
    except Exception as exc:
        logger.warning("chart ohlcv: unexpected failure for %s %s: %s", clean_symbol, norm_bar, exc, exc_info=True)
        error_detail = str(exc)

    meta = ChartOHLCVMeta(symbol=clean_symbol, bar=norm_bar, tz="UTC", source="unavailable", fallback=True)
    payload = ChartOHLCVResponse(
        symbol=clean_symbol,
        bar=norm_bar,
        tz="UTC",
        source="unavailable",
        fallback=True,
        rows=[],
        meta=meta,
        error=error_detail,
    )
    response.headers["X-Cache"] = "miss"
    response.headers["X-Data-Source"] = "unavailable"
    response.headers["X-Data-Fallback"] = "true"
    if error_detail:
        response.headers["X-Data-Error"] = error_detail
    return payload

def _format_indicator_description(payload: dict[str, object]) -> str:
    pieces: list[str] = []
    description = str(payload.get("description") or "").strip()
    if description:
        pieces.append(description if description.endswith((".", "!", "?")) else f"{description}.")
    inputs = [str(v) for v in (payload.get("inputs") or []) if v]
    outputs = [str(v) for v in (payload.get("outputs") or []) if v]
    if inputs:
        pieces.append(f"Inputs: {", ".join(inputs)}.")
    if outputs:
        pieces.append(f"Outputs: {", ".join(outputs)}.")
    params = payload.get("default_params")
    if isinstance(params, dict) and params and not description:
        formatted = ", ".join(f"{key}={params[key]}" for key in sorted(params))
        pieces.append(f"Defaults: {formatted}.")
    return " ".join(pieces).strip()

@app.get("/meta/library")
def meta_library(refresh: bool = Query(False, description="Bypass metadata cache")) -> dict[str, object]:
    now = time.time()
    if refresh:
        _META_CACHE.pop("library", None)
    else:
        cached = _META_CACHE.get("library")
        if cached and now - cached[0] < META_CACHE_TTL:
            return cached[1]

    strategies: list[dict[str, object]] = []
    try:
        strategy_registry.ensure_populated()
        specs = strategy_registry.list_strategies()
    except Exception as exc:  # noqa: BLE001
        logger.warning("meta library: failed to load strategies: %s", exc)
        specs = []

    def _normalize_mapping(data: dict[str, object]) -> dict[str, object]:
        clean: dict[str, object] = {}
        for key, value in data.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                clean[key] = value
            elif isinstance(value, (list, tuple)):
                clean[key] = list(value)
            elif isinstance(value, dict):
                clean[key] = _normalize_mapping(value)
            else:
                clean[key] = str(value)
        return clean

    for spec in specs or []:
        defaults = spec.defaults if isinstance(spec.defaults, dict) else {}
        defaults_clean = _normalize_mapping(defaults) if defaults else {}
        try:
            optuna_spec = strategy_registry.get_spec(spec.id)
            has_optuna = optuna_spec is not None
        except Exception:
            has_optuna = False
        indicators = list(getattr(spec, "indicators", []) or _discover_strategy_indicators(spec.id))
        strategies.append({
            "id": spec.id,
            "name": spec.name,
            "description": getattr(spec, "description", ""),
            "direction": getattr(spec, "direction", "both"),
            "defaults": defaults_clean,
            "indicators": indicators,
            "optuna": has_optuna,
        })
    strategies.sort(key=lambda item: str(item.get("name", "")).lower())

    indicators: list[dict[str, object]] = []
    try:
        indicator_registry.ensure_populated()
        indicator_specs = indicator_registry.list_indicators()
    except Exception as exc:  # noqa: BLE001
        logger.warning("meta library: failed to load indicators: %s", exc)
        indicator_specs = []
    for ind in indicator_specs or []:
        if isinstance(ind, dict):
            entry: dict[str, object] = {
                "id": ind.get("id"),
                "name": ind.get("name"),
                "inputs": ind.get("inputs"),
                "outputs": ind.get("outputs"),
                "params": ind.get("default_params"),
            }
            entry["description"] = _format_indicator_description({
                "description": ind.get("description"),
                "inputs": entry.get("inputs"),
                "outputs": entry.get("outputs"),
                "default_params": entry.get("params"),
            })
            indicators.append(entry)
    indicators.sort(key=lambda item: str(item.get("name") or item.get("id") or "").lower())

    result = {"strategies": strategies, "indicators": indicators}
    if strategies or indicators:
        _META_CACHE["library"] = (now, result)
    else:
        _META_CACHE.pop("library", None)
    logger.info("meta library refresh: strategies=%d indicators=%d", len(strategies), len(indicators))
    return result


@app.get("/breadth")
def breadth_snapshot(limit_symbols: int = 200) -> dict[str, Any]:
    aggregates: list[Dict[str, Any]] = []
    symbols: list[Dict[str, Any]] = []
    agg_df = _read_snapshot_df("breadth", "latest.parquet")
    if agg_df is not None:
        aggregates = _frame_to_records(agg_df)

    sym_df = _read_snapshot_df("breadth", "symbols", "latest.parquet")
    if sym_df is not None:
        symbols = _frame_to_records(sym_df.sort_values("Ts", ascending=False), limit=limit_symbols)

    if not aggregates and not symbols:
        now = datetime.utcnow().isoformat() + "Z"
        aggregates = [{"Ts": now, "Exchange": "US", "PctAdv": 55.0, "PctDec": 45.0, "N": 100}]
    return {"aggregates": aggregates, "symbols": symbols}


@app.get("/movers")
def market_movers(top: int = 25, period: str = "1d") -> dict[str, Any]:
    top = max(1, min(top, 200))
    metric_map = {
        "1d": "NetPct",
        "5m": "Rise5mPct",
        "15m": "Rise15mPct",
        "30m": "Rise30mPct",
        "60m": "Rise60mPct",
    }
    column = metric_map.get(period.lower(), "NetPct")
    df = _read_snapshot_df("hotlists", "latest.parquet")
    if df is not None and not df.empty:
        if column not in df.columns:
            column = "NetPct" if "NetPct" in df.columns else df.columns[0]
        movers_df = df.sort_values(column, ascending=False).head(top)
        items = _frame_to_records(movers_df)
        return {"items": items, "metric": column}
    sample = [
        {"Symbol": "AAPL.US", "Exchange": "US", "NetPct": 1.25, "Rise5mPct": 0.2, "SnapshotAt": datetime.utcnow().isoformat() + "Z"},
        {"Symbol": "MSFT.US", "Exchange": "US", "NetPct": 0.95, "Rise5mPct": 0.15, "SnapshotAt": datetime.utcnow().isoformat() + "Z"},
    ]
    return {"items": sample, "metric": column, "fallback": True}


@app.get("/hotlists/{name}")
def hotlists(name: str, top: int = 50) -> dict[str, Any]:
    top = max(1, min(top, 500))
    name_lower = name.lower()
    df = _read_snapshot_df("hotlists", "latest.parquet")
    if df is not None and not df.empty:
        if name_lower in {"gainers", "winners"} and "NetPct" in df.columns:
            df = df.sort_values("NetPct", ascending=False)
        elif name_lower in {"losers", "decliners"} and "NetPct" in df.columns:
            df = df.sort_values("NetPct", ascending=True)
        items = _frame_to_records(df.head(top))
        return {"name": name, "items": items}
    sample = [{"Symbol": "SAMPLE", "Exchange": "US", "NetPct": 0.0, "SnapshotAt": datetime.utcnow().isoformat() + "Z"}]
    return {"name": name, "items": sample, "fallback": True}


class PostMessage(BaseModel):
    message: str


@app.post("/post")
def post_message(payload: PostMessage) -> dict[str, Any]:
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message required")
    return {"ok": True, "message": message, "received_at": datetime.utcnow().isoformat() + "Z"}


def _dt_to_iso(value: datetime | None) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


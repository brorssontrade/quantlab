"""
API routers for Quantlab backend.

Router structure (extracted from app/main.py for modularity):
- system: Health checks, root redirect
- optimize: Optuna optimization endpoints
- signals: Signal generation endpoints
- pipeline: Daily pipeline execution
- runs: Backtest run CRUD
- live: Live trading job scheduling
- trades: Manual trade logging
- positions: Position tracking
- meta: Strategy/indicator/symbol metadata
- chart: OHLCV chart data
- market: Breadth, movers, hotlists
- posts: Generic POST endpoint (legacy)
- fundamentals: Fundamentals data + scoring
- alerts: Price alert CRUD + evaluation
"""

import typer, logging
from .logging_conf import setup_logging
from .config import load_settings

app = typer.Typer(no_args_is_help=True)

@app.callback()
def main(verbose: bool = typer.Option(False, "--verbose", "-v", help="Mer logg")):
    setup_logging(logging.DEBUG if verbose else logging.INFO)

@app.command()
def ingest():
    """Kör nightly-ingest (placeholder)."""
    s = load_settings()
    logging.info("Ingest start – PARQUET_DIR=%s DUCKDB_PATH=%s", s.parquet_dir, s.duckdb_path)
    # TODO: anropa din riktiga ingest
    logging.info("Ingest klar.")

@app.command()
def live():
    """Kör live-loop (placeholder)."""
    s = load_settings()
    logging.info("Live start – använder EODHD=%s, ALPHA=%s",
                 bool(s.eodhd_token), bool(s.alpha_vantage_api_key))
    # TODO: anropa din riktiga live
    logging.info("Live körning klar.")

@app.command()
def backtest():
    """Kör enkel backtest (placeholder)."""
    import numpy as np
    from .backtest.engine import BacktestEngine
    prices = np.array([[100, 101, 99, 102]], dtype=float)  # 1 asset, 4 dagar
    weights = np.ones((1, 4))                              # full invest
    res = BacktestEngine().run(prices, weights)
    logging.info("Sharpe=%.3f MDD=%.2f%% Final=%.4f",
                 res.stats["sharpe"], 100*res.stats["max_drawdown"], res.stats["final_equity"])

if __name__ == "__main__":
    app()

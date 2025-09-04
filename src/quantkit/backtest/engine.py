from __future__ import annotations
import pandas as pd
from dataclasses import dataclass

@dataclass
class BacktestResult:
    equity: pd.Series
    trades: pd.DataFrame
    metrics: dict

def backtest_prices(signals: pd.Series, prices: pd.Series, fee_per_trade: float = 0.0) -> BacktestResult:
    sig = signals.reindex(prices.index).fillna(0).astype(int)
    pos = sig.clip(lower=0)
    rets = prices.pct_change().fillna(0) * pos.shift(1).fillna(0)
    equity = (1 + rets).cumprod()
    changes = pos.diff().fillna(pos)
    entries = changes[changes != 0]
    trades = pd.DataFrame({'pos': entries})
    trades['price'] = prices.reindex(trades.index)
    trades['fee'] = fee_per_trade
    dd = (equity / equity.cummax() - 1).min()
    cagr = equity.iloc[-1] ** (252/len(equity)) - 1 if len(equity) > 1 else 0
    vol = rets.std() * (252 ** 0.5)
    sharpe = (rets.mean() * 252) / (vol + 1e-9)
    return BacktestResult(equity=equity, trades=trades, metrics={'dd': float(dd), 'cagr': float(cagr), 'sharpe': float(sharpe)})

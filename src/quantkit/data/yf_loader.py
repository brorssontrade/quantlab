from __future__ import annotations
from typing import Literal
import re
import pandas as pd

def _flatten_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Platta alltid kolumnerna till strängar 'Open_AAPL' osv."""
    if not isinstance(df.columns, pd.MultiIndex):
        df2 = df.copy()
        df2.columns = [str(c) for c in df2.columns]
        return df2

    parts = []
    for tpl in df.columns:
        if not isinstance(tpl, tuple):
            parts.append(str(tpl))
            continue
        items = [str(x) for x in tpl if x is not None and str(x) != ""]
        parts.append("_".join(items))
    df2 = df.copy()
    df2.columns = parts
    return df2

def _pick(colnames: list[str], field: str, symbol: str) -> str | None:
    """
    Plocka kolumnnamn för önskat fält. Preferera sådant som innehåller symbolen.
    field i {'open','high','low','close','volume'}
    """
    f = field.lower()
    # kandidater (alla sätt YF kan skriva)
    patt = re.compile(rf"(?:^|[_\W]){f}(?:[_\W]|$)", re.IGNORECASE)
    cands = [c for c in colnames if patt.search(c)]
    if not cands:
        return None

    # preferera de som matchar symbol
    sym = re.sub(r"[\W_]+", "", symbol).lower()
    sym_cands = [c for c in cands if sym in re.sub(r"[\W_]+", "", c).lower()]
    if sym_cands:
        cands = sym_cands

    # om flera – ta den kortaste (minst "skräp")
    return sorted(cands, key=len)[0]

def load_bars_or_synth(symbol: str, *, days: int = 750, interval: Literal["1d","1h","1wk"]="1d") -> pd.DataFrame:
    """
    Hämtar OHLCV från yfinance och returnerar ALLTID en platt DF med:
    kolumner: ts, open, high, low, close, volume
    """
    try:
        import yfinance as yf
    except Exception:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"])

    df = yf.download(
        symbol,
        period=f"{max(int(days*1.4), days)}d",
        interval=interval,
        auto_adjust=False,   # explicit
        progress=False,
        threads=False,
    )

    if df is None or len(df) == 0:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"])

    # Platta kolumner → välj fält
    flat = _flatten_columns(df)
    cols = list(flat.columns)

    open_col   = _pick(cols, "open",   symbol)
    high_col   = _pick(cols, "high",   symbol)
    low_col    = _pick(cols, "low",    symbol)
    close_col  = _pick(cols, "close",  symbol)
    volume_col = _pick(cols, "volume", symbol)

    # Sista utväg om "Close" saknas: prova "Adj Close"
    if close_col is None:
        ac = _pick(cols, "adj close", symbol)
        close_col = ac

    needed = [open_col, high_col, low_col, close_col, volume_col]
    if any(x is None for x in needed):
        # kunde inte mappa -> returnera tom DF istället för att krascha
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"])

    out = pd.DataFrame({
        "ts":     pd.to_datetime(flat.index),
        "open":   pd.to_numeric(flat[open_col], errors="coerce"),
        "high":   pd.to_numeric(flat[high_col], errors="coerce"),
        "low":    pd.to_numeric(flat[low_col], errors="coerce"),
        "close":  pd.to_numeric(flat[close_col], errors="coerce"),
        "volume": pd.to_numeric(flat[volume_col], errors="coerce"),
    })

    out = out.dropna(subset=["ts","open","high","low","close"]).reset_index(drop=True)
    if len(out) > days:
        out = out.iloc[-days:].reset_index(drop=True)
    return out

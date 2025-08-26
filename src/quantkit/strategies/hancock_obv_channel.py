from __future__ import annotations
import math
import numpy as np
import pandas as pd
from .base import StrategySpec

# ==================== Hjälpare (MA-typer som i Pine) ====================

def _sma(s: pd.Series, n: int) -> pd.Series:
    n = max(1, int(n))
    return pd.to_numeric(s, errors="coerce").rolling(n, min_periods=n).mean()

def _ema(s: pd.Series, n: int) -> pd.Series:
    n = max(1, int(n))
    return pd.to_numeric(s, errors="coerce").ewm(span=n, adjust=False).mean()

def _wma(s: pd.Series, n: int) -> pd.Series:
    n = max(1, int(n))
    x = pd.to_numeric(s, errors="coerce")
    weights = np.arange(1, n + 1, dtype=float)
    # rullande viktad medel: (sum(w*val))/sum(w)
    return x.rolling(n, min_periods=n).apply(lambda a: np.dot(a, weights) / weights.sum(), raw=True)

def _rma_wilder(s: pd.Series, n: int) -> pd.Series:
    # Wilder-RMA = EMA med alpha = 1/n
    n = max(1, int(n))
    return pd.to_numeric(s, errors="coerce").ewm(alpha=1.0 / n, adjust=False).mean()

def _vwma(price: pd.Series, vol: pd.Series, n: int) -> pd.Series:
    n = max(1, int(n))
    p = pd.to_numeric(price, errors="coerce")
    v = pd.to_numeric(vol, errors="coerce").fillna(0.0)
    pv = (p * v).rolling(n, min_periods=n).sum()
    vv = v.rolling(n, min_periods=n).sum().replace(0, np.nan)
    return pv / vv

def _hma(s: pd.Series, n: int) -> pd.Series:
    n = max(1, int(n))
    if n == 1:
        return s.copy()
    wma_half = _wma(s, n // 2)
    wma_full = _wma(s, n)
    diff = 2 * wma_half - wma_full
    return _wma(diff, int(math.sqrt(n)) or 1)

def _alma(s: pd.Series, n: int, offset: float = 0.85, sigma: int = 10) -> pd.Series:
    # enkel ALMA-implementation (fönsterlängd = n)
    n = max(1, int(n))
    x = pd.to_numeric(s, errors="coerce")
    m = offset * (n - 1)
    w = np.array([math.exp(-((i - m) ** 2) / (2 * (n / sigma) ** 2)) for i in range(n)], dtype=float)
    w_sum = w.sum()
    def _alma_win(arr):
        return float(np.dot(arr, w) / w_sum)
    return x.rolling(n, min_periods=n).apply(_alma_win, raw=True)

def _get_average(values: pd.Series, length: int, typ: str, vol: pd.Series | None = None,
                 alma_offset: float = 0.85, alma_sigma: int = 10) -> pd.Series:
    t = (typ or "WMA").strip().upper()
    if t == "SMA":
        return _sma(values, length)
    if t == "EMA":
        return _ema(values, length)
    if t == "WMA":
        return _wma(values, length)
    if t == "HMA":
        return _hma(values, length)
    if t == "VWMA":
        v = pd.Series(0.0, index=values.index) if vol is None else vol
        return _vwma(values, v, length)
    if t == "RMA":
        return _rma_wilder(values, length)
    if t == "ALMA":
        return _alma(values, length, alma_offset, alma_sigma)
    # fallback
    return _wma(values, length)

# ==================== Donchian-kanaler ====================

def _donchian(high: pd.Series, low: pd.Series, n: int) -> tuple[pd.Series, pd.Series, pd.Series]:
    n = max(1, int(n))
    top = pd.to_numeric(high, errors="coerce").rolling(n, min_periods=n).max()
    bot = pd.to_numeric(low,  errors="coerce").rolling(n, min_periods=n).min()
    mid = bot + (top - bot) / 2.0
    return top, mid, bot

# ==================== OBV med volymfilter + oscillator ====================

def _filtered_obv(src: pd.Series, vol: pd.Series, vol_len: int, vol_mult: float, use_filter: bool) -> pd.Series:
    c  = pd.to_numeric(src, errors="coerce")
    v  = pd.to_numeric(vol, errors="coerce").fillna(0.0)
    ch = c.diff().fillna(0.0)
    step = np.sign(ch) * v

    # Pine: threshold = abs( avg(volume,L) - (stdev(volume,L) * mult) )
    ma = v.rolling(vol_len, min_periods=vol_len).mean()
    sd = v.rolling(vol_len, min_periods=vol_len).std()
    thr = (ma - sd * float(vol_mult)).abs()

    obv = pd.Series(np.nan, index=c.index)
    prev = 0.0
    for i in range(len(c)):
        if use_filter and v.iat[i] < (thr.iat[i] if not np.isnan(thr.iat[i]) else 0.0):
            obv.iat[i] = prev
        else:
            prev = (prev if not np.isnan(prev) else 0.0) + step.iat[i]
            obv.iat[i] = prev
    return obv

# ==================== Strategi ====================

DEFAULTS = dict(
    # OBV/Volym
    source="close",
    use_vol_filter=True,
    vol_filter_length=50,
    vol_filter_multiplier=2.5,
    # Oscillator (OBV - MA(OBV, L))
    use_osc=True,
    osc_length=50,
    osc_type="WMA",              # SMA/EMA/WMA/HMA/VWMA/RMA/ALMA
    alma_offset=0.85,
    alma_sigma=10,
    # Kanaler
    channel_length=125,
    channel_percent=35,          # fast_len = channel_length * percent / 100
    # Sides & risk
    side="long",                 # "long" eller "short"
    sl_pct=None, tp_pct=None, max_bars=None
)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}

    c = pd.to_numeric(df.get(p["source"], df["close"]), errors="coerce")
    h = pd.to_numeric(df.get("high",  c), errors="coerce")
    l = pd.to_numeric(df.get("low",   c), errors="coerce")
    v = pd.to_numeric(df.get("volume", pd.Series(index=c.index, data=0.0))), 
    v = v[0].fillna(0.0)  # unpack tuple from above line

    # 1) OBV (med volymfilter)
    obv = _filtered_obv(c, v,
                        int(p["vol_filter_length"]),
                        float(p["vol_filter_multiplier"]),
                        bool(p["use_vol_filter"]))

    # 2) Välj oscillator eller rå OBV
    if bool(p["use_osc"]):
        obv_avg = _get_average(obv, int(p["osc_length"]), str(p["osc_type"]), vol=v,
                               alma_offset=float(p["alma_offset"]), alma_sigma=int(p["alma_sigma"]))
        obv_sig = obv - obv_avg
    else:
        obv_sig = obv.copy()

    # 3) Donchian-kanaler på pris (slow/fast) och på OBV-signal (slow/fast)
    slow_len = int(p["channel_length"])
    fast_len = max(1, int(round(slow_len * float(p["channel_percent"]) / 100.0)))

    slow_top_price, _, slow_bot_price = _donchian(h, l, slow_len)
    fast_top_price, _, fast_bot_price = _donchian(h, l, fast_len)

    # Donchian på OBV: i Pine körs get_dc(obv, obv, ...)
    slow_top_obv, _, slow_bot_obv = _donchian(obv_sig, obv_sig, slow_len)
    fast_top_obv, _, fast_bot_obv = _donchian(obv_sig, obv_sig, fast_len)

    # Pine jämför mot föregående bar [1]
    sTopP = slow_top_price.shift(1)
    sBotP = slow_bot_price.shift(1)
    fTopP = fast_top_price.shift(1)
    fBotP = fast_bot_price.shift(1)

    sTopO = slow_top_obv.shift(1)
    sBotO = slow_bot_obv.shift(1)
    fTopO = fast_top_obv.shift(1)
    fBotO = fast_bot_obv.shift(1)

    # 4) Villkor (trogna Pine)
    enter_long_price  = h > sTopP
    enter_short_price = l < sBotP
    exit_long_price   = l < fBotP
    exit_short_price  = h > fTopP

    if bool(p["use_osc"]):
        enter_long_obv  = (obv_sig > sTopO) & (obv_sig > 0)
        enter_short_obv = (obv_sig < sBotO) & (obv_sig < 0)
    else:
        enter_long_obv  = (obv_sig > sTopO)
        enter_short_obv = (obv_sig < sBotO)

    exit_long_obv   = (obv_sig < fBotO)
    exit_short_obv  = (obv_sig > fTopO)

    enter_long_condition  = enter_long_obv  & enter_long_price
    exit_long_condition   = exit_long_obv   & exit_long_price

    enter_short_condition = enter_short_obv & enter_short_price
    exit_short_condition  = exit_short_obv  & exit_short_price

    side = str(p.get("side", "long")).lower()
    if side == "short":
        entry = enter_short_condition
        exit_rule = exit_short_condition
    else:
        entry = enter_long_condition
        exit_rule = exit_long_condition

    meta = dict(
        sl_pct=p.get("sl_pct"),
        tp_pct=p.get("tp_pct"),
        max_bars=p.get("max_bars"),
        side=side,
        notes="Trail i Pine approxim. via snabba kanal-exits (fast)."
    )

    return {
        "entry": entry.fillna(False),
        "exit":  exit_rule.fillna(False),
        "meta":  meta,
    }

STRATEGY = StrategySpec(
    id="hancock_obv",
    name="Hancock – Filtered Volume OBV OSC (kanaler)",
    direction="long",
    defaults=DEFAULTS,
    description=(
        "Trogen portning: OBV med volymfilter, valfri oscillator (OBV - MA), "
        "pris- & OBV-Donchian (slow/fast). Entry: pris & OBV bryter slow-top/bot. "
        "Exit: pris & OBV bryter fast-bot/top. Trail i Pine approximeras av fast-kanal-exits."
    ),
    generate=_generate,
)

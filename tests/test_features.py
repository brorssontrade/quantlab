# tests/test_features.py
import numpy as np
import pandas as pd

from engine.features import add_common

def _make_df(n=400):
    # Tidsaxel (Stockholmstid)
    ts = (
        pd.date_range("2024-01-01", periods=n, freq="H", tz="UTC")
        .tz_convert("Europe/Stockholm")
    )
    rng = np.random.default_rng(0)
    close = 100 + np.cumsum(rng.normal(0, 0.5, size=n))
    high  = close + np.abs(rng.normal(0, 0.3, size=n))
    low   = close - np.abs(rng.normal(0, 0.3, size=n))
    open_ = close + rng.normal(0, 0.2, size=n)
    vol   = rng.integers(1_000, 10_000, size=n)

    return pd.DataFrame({
        "ts": ts, "open": open_, "high": high, "low": low, "close": close, "volume": vol
    })

def test_expected_columns_present():
    df = _make_df(300)
    out = add_common(df)

    expected = {
        "ema_fast","ema_slow","rsi","atr","second_hour",
        "atr14","atr5","rsi14","rsi2",
        "macd","macd_signal","macd_hist",
        "adx14","plus_di14","minus_di14",
        "adr20","updownvolratio20",
        "donchianhigh20","donchianlow20","donchianmid20",
        "ibs","vwma20",
        "bb_basis20","bb_upper20_2","bb_lower20_2",
        "keltner_mid_ema20","keltner_upper","keltner_lower",
        "stochk14","stochd3","cci20","willr14",
        "sma20","sma50","sma200","ema5","ema12","ema26","ema63",
    }
    missing = expected - set(out.columns)
    assert not missing, f"Saknade kolumner: {missing}"

def test_indicator_ranges_and_relations():
    df = _make_df(400)
    out = add_common(df).copy()

    # Ta bort warmup-NaNs
    cols = [
        "rsi14","rsi2","stochk14","stochd3","willr14",
        "bb_basis20","bb_upper20_2","bb_lower20_2",
        "donchianhigh20","donchianlow20","donchianmid20",
        "keltner_mid_ema20","keltner_upper","keltner_lower",
        "macd","macd_signal","macd_hist","adr20","atr14","atr5","vwma20",
    ]
    ok = out.dropna(subset=cols)

    # [0,100]-intervall
    assert ((ok["rsi14"]   >= 0) & (ok["rsi14"]   <= 100)).all()
    assert ((ok["rsi2"]    >= 0) & (ok["rsi2"]    <= 100)).all()
    assert ((ok["stochk14"]>= 0) & (ok["stochk14"]<= 100)).all()
    assert ((ok["stochd3"] >= 0) & (ok["stochd3"] <= 100)).all()
    assert ((ok["willr14"]<= 0) & (ok["willr14"]>= -100)).all()

    # Bollinger- och Donchian-relationer
    assert (ok["bb_upper20_2"] >= ok["bb_basis20"]).all()
    assert (ok["bb_basis20"]   >= ok["bb_lower20_2"]).all()

    assert (ok["donchianhigh20"] >= ok["donchianmid20"]).all()
    assert (ok["donchianmid20"]  >= ok["donchianlow20"]).all()

    # Keltner-relationer
    assert (ok["keltner_upper"] >= ok["keltner_mid_ema20"]).all()
    assert (ok["keltner_mid_ema20"] >= ok["keltner_lower"]).all()

    # MACD-hist ≈ macd - signal
    diff = (ok["macd"] - ok["macd_signal"] - ok["macd_hist"]).abs()
    assert (diff < 1e-10).all()

    # ADR20 ≈ mean(high-low, 20)
    adr_calc = (out["high"] - out["low"]).rolling(20, min_periods=20).mean()
    # jämför sista 50 icke-NaN
    a = ok["adr20"].tail(50).to_numpy()
    b = adr_calc.reindex(ok.index).tail(50).to_numpy()
    np.testing.assert_allclose(a, b, rtol=1e-10, atol=1e-10)

    # Up/Down Volume Ratio (icke-negativ och konsistent)
    prev_c = out["close"].shift(1)
    up_mask = out["close"] > prev_c
    down_mask = out["close"] < prev_c
    up_vol = out["volume"].where(up_mask, 0).rolling(20, min_periods=20).sum()
    down_vol = out["volume"].where(down_mask, 0).rolling(20, min_periods=20).sum()
    ratio = up_vol / down_vol.replace(0, np.nan)
    r = ratio.reindex(ok.index).to_numpy()
    r2 = ok["updownvolratio20"].to_numpy()
    # de kan vara NaN om down_vol==0; jämför där båda är finite
    m = np.isfinite(r) & np.isfinite(r2)
    np.testing.assert_allclose(r[m], r2[m], rtol=1e-10, atol=1e-10)
    assert (ok["updownvolratio20"].dropna() >= 0).all()

    # ATR > 0 efter warmup
    assert (ok["atr14"] > 0).all()
    assert (ok["atr5"]  > 0).all()

def test_types_and_warmup():
    df = _make_df(250)
    out = add_common(df)
    # några centrala kolumner ska ha < 50% NaN (dvs. fyllas efter warmup)
    for c in ["ema20","ema50","sma20","sma50","ema12","ema26","macd","macd_signal","rsi14","atr14"]:
        col = c if c in out.columns else {"ema20":"ema_fast","ema50":"ema_slow"}[c]
        frac_nan = out[col].isna().mean()
        assert frac_nan < 0.5, f"För mycket NaN i {col}: {frac_nan:.2%}"

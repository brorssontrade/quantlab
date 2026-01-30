# Indicator Library Backlog

> TradingView-style indicators split into implementable batches
> 
> **Last updated:** 2026-01-30

---

## ✅ Already Implemented (17 indicators)

| ID | Name | Category | Pane | Status |
|----|------|----------|------|--------|
| sma | Simple Moving Average | moving-average | overlay | ✅ Done |
| ema | Exponential Moving Average | moving-average | overlay | ✅ Done |
| smma | Smoothed Moving Average | moving-average | overlay | ✅ Done |
| wma | Weighted Moving Average | moving-average | overlay | ✅ Done |
| dema | Double EMA | moving-average | overlay | ✅ Done |
| tema | Triple EMA | moving-average | overlay | ✅ Done |
| hma | Hull Moving Average | moving-average | overlay | ✅ Done |
| kama | Kaufman Adaptive MA | moving-average | overlay | ✅ Done |
| vwma | Volume Weighted MA | moving-average | overlay | ✅ Done |
| mcginley | McGinley Dynamic | moving-average | overlay | ✅ Done |
| rsi | Relative Strength Index | momentum | separate | ✅ Done |
| macd | MACD | momentum | separate | ✅ Done |
| adx | Average Directional Index | momentum | separate | ✅ Done |
| bb | Bollinger Bands | volatility | overlay | ✅ Done |
| atr | Average True Range | volatility | separate | ✅ Done |
| vwap | Volume Weighted Avg Price | volume | overlay | ✅ Done |
| obv | On Balance Volume | volume | separate | ✅ Done |

---

## 📊 Category A: Indicators (OHLCV Compute)

These are true indicators calculated from OHLCV data.

### Batch 1: Moving Averages (Overlay) - HIGH PRIORITY

| ID | Name | TV Defaults | Notes |
|----|------|-------------|-------|
| smma | Smoothed MA (SMMA/RMA) | Blue #2962FF, width 2 | Wilder's smoothing |
| wma | Weighted MA | Orange #FF6D00, width 2 | Linear weights |
| dema | Double EMA | Purple #9C27B0, width 2 | 2*EMA - EMA(EMA) |
| tema | Triple EMA | Teal #00BCD4, width 2 | 3*EMA - 3*EMA(EMA) + EMA(EMA(EMA)) |
| hma | Hull MA | Green #26A69A, width 2 | WMA of difference |
| kama | Kaufman Adaptive MA | Pink #E91E63, width 2 | Efficiency ratio adaptive |
| vwma | Volume Weighted MA | Purple #9C27B0, width 2 | Volume-weighted SMA |
| mcginley | McGinley Dynamic | Orange #FF6D00, width 2 | Self-adjusting MA |

### Batch 2: Momentum (Separate Pane)

| ID | Name | TV Defaults | Notes |
|----|------|-------------|-------|
| stoch | Stochastic | %K blue, %D orange | Overbought/oversold zones |
| stochrsi | Stochastic RSI | %K purple, %D orange | RSI into Stoch formula |
| cci | Commodity Channel Index | Teal #00BCD4 | Mean deviation based |
| roc | Rate of Change | Blue #2962FF | Percentage change |
| mom | Momentum | Blue #2962FF | Price difference |
| willr | Williams %R | Purple #9C27B0 | Inverted stochastic |
| ppo | Percentage Price Osc | Blue line, orange signal | MACD as percentage |
| trix | TRIX | Teal #00BCD4 | Triple smoothed ROC |
| tsi | True Strength Index | Blue line, orange signal | Double smoothed momentum |
| uo | Ultimate Oscillator | Purple #9C27B0 | Weighted multi-period |
| rvi | Relative Vigor Index | Green line, red signal | Close vs range |
| chop | Choppiness Index | Teal #00BCD4 | Trend vs sideways |

### Batch 3: Volatility/Trend (Mixed Panes)

| ID | Name | Pane | TV Defaults | Notes |
|----|------|------|-------------|-------|
| dc | Donchian Channels | overlay | Blue upper/lower | Highest high / lowest low |
| kc | Keltner Channels | overlay | Blue upper/lower | ATR-based bands |
| env | Envelope | overlay | Blue bands | % deviation from MA |
| supertrend | SuperTrend | overlay | Green up, red down | ATR-based trend |
| psar | Parabolic SAR | overlay | Dots green/red | Trailing stop dots |
| chandelier | Chandelier Exit | overlay | Green long, red short | ATR-based exit |
| vstop | Volatility Stop | overlay | Green/red dots | ATR trailing stop |
| ichimoku | Ichimoku Cloud | overlay | Multiple colors | Full cloud system |

### Batch 4: Volume (Separate Pane)

| ID | Name | TV Defaults | Notes |
|----|------|-------------|-------|
| ad | Accumulation/Distribution | Teal line | Close location value |
| cmf | Chaikin Money Flow | Teal line | AD in fixed period |
| cho | Chaikin Oscillator | Blue line, red zones | EMA difference of AD |
| efi | Elder Force Index | Blue histogram | Price * volume change |
| emv | Ease of Movement | Teal line | Volume-normalized move |
| pvt | Price Volume Trend | Teal line | % change * volume |
| nvi | Negative Volume Index | Blue line | Down-volume tracking |
| pvi | Positive Volume Index | Orange line | Up-volume tracking |
| updown | Up/Down Volume | Green/red histogram | Directional volume |
| netvol | Net Volume | Green/red histogram | Up - down volume |

---

## 🎨 Category B: Drawing / Auto Tools (DEFERRED)

> These require different render paths (annotations, shapes, not line series).
> Will be implemented in a separate PRIO after indicator library is complete.

| Tool | Type | Notes |
|------|------|-------|
| Auto Fib Extension | drawing | Requires swing detection |
| Auto Fib Retracement | drawing | Requires swing detection |
| Auto Pitchfork | drawing | Requires 3 pivot points |
| Auto Trendline | drawing | Line regression / pivots |
| Linear Regression Channel | drawing | Band around regression |
| Pivot Points (Standard/Fib/etc) | levels | Daily/weekly pivots |
| Volume Profile | special | Horizontal histogram |
| VWAP Bands | indicator | Can do after VWAP ✅ |

---

## 📋 Quality Checklist (Every Indicator Must Pass)

```markdown
- [ ] Manifest entry with correct panePolicy (overlay/separate)
- [ ] TV-default colors and lineWidths
- [ ] All inputs defined with proper min/max/step
- [ ] All outputs defined with style (line/histogram/area/band)
- [ ] Compute function in compute.ts
- [ ] Worker integration (indicatorWorker.ts)
- [ ] Golden test in compute.test.ts
- [ ] Renders correctly with mock data
- [ ] Style tab allows per-output customization
- [ ] Legend shows name + params + live values
```

---

## 🎯 Implementation Order

1. **Batch 1 (NOW):** Moving Averages - Easy to validate, overlay on price
2. **Batch 2 (NEXT):** Momentum - Most popular oscillators
3. **Batch 3 (THEN):** Volatility/Trend - Channels and trend-following
4. **Batch 4 (LAST):** Volume - Requires volume data validation

---

## 📈 Progress Tracker

| Batch | Total | Done | Progress |
|-------|-------|------|----------|
| Already Implemented | 17 | 17 | ✅ 100% |
| Batch 1: Moving Averages | 8 | 8 | ✅ 100% |
| Batch 2: Momentum | 12 | 0 | ⏳ 0% |
| Batch 3: Volatility/Trend | 8 | 0 | ⏳ 0% |
| Batch 4: Volume | 10 | 0 | ⏳ 0% |
| **Total Indicators** | **47** | **17** | **36%** |

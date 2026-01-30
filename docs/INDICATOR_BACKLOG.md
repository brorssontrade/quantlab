# Indicator Library Backlog

> TradingView-style indicators split into implementable batches
> 
> **Last updated:** 2026-01-30

---

## ✅ Already Implemented (23 indicators)

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
| stoch | Stochastic | momentum | separate | ✅ Done (Batch 2) |
| stochrsi | Stochastic RSI | momentum | separate | ✅ Done (Batch 2) |
| cci | Commodity Channel Index | momentum | separate | ✅ Done (Batch 2) |
| roc | Rate of Change | momentum | separate | ✅ Done (Batch 2) |
| mom | Momentum | momentum | separate | ✅ Done (Batch 2) |
| willr | Williams %R | momentum | separate | ✅ Done (Batch 2) |
| bb | Bollinger Bands | volatility | overlay | ✅ Done |
| atr | Average True Range | volatility | separate | ✅ Done |
| vwap | Volume Weighted Avg Price | volume | overlay | ✅ Done |
| obv | On Balance Volume | volume | separate | ✅ Done |

### TradingView Parity Verified ✅
- **RSI:** Uses Wilder's smoothing (RMA)
- **ATR:** Uses Wilder's smoothing (RMA)
- **ADX:** Uses Wilder's smoothing for DI/DX calculations
- **VWAP:** Uses UTC for deterministic session anchors
- **Test coverage:** 71 golden tests in compute.test.ts

---

## 📊 Category A: Remaining Indicators (OHLCV Compute)

### ~~Batch 1: Moving Averages (Overlay)~~ ✅ COMPLETE

### ~~Batch 2: Momentum (Separate Pane)~~ ✅ COMPLETE

### Batch 3: Momentum Continued (Separate Pane) - NEXT

| ID | Name | TV Defaults | Notes | Status |
|----|------|-------------|-------|--------|
| ppo | Percentage Price Osc | Blue line, orange signal | MACD as percentage | 🔲 Todo |
| trix | TRIX | Teal #00BCD4 | Triple smoothed ROC | 🔲 Todo |
| tsi | True Strength Index | Blue line, orange signal | Double smoothed momentum | 🔲 Todo |
| uo | Ultimate Oscillator | Purple #9C27B0 | Weighted multi-period | 🔲 Todo |
| rvi | Relative Vigor Index | Green line, red signal | Close vs range | 🔲 Todo |
| chop | Choppiness Index | Teal #00BCD4 | Trend vs sideways | 🔲 Todo |

### Batch 4: Volatility/Trend (Mixed Panes)

| ID | Name | Pane | TV Defaults | Notes | Status |
|----|------|------|-------------|-------|--------|
| dc | Donchian Channels | overlay | Blue upper/lower | Highest high / lowest low | 🔲 Todo |
| kc | Keltner Channels | overlay | Blue upper/lower | ATR-based bands | 🔲 Todo |
| env | Envelope | overlay | Blue bands | % deviation from MA | 🔲 Todo |
| supertrend | SuperTrend | overlay | Green up, red down | ATR-based trend | 🔲 Todo |
| psar | Parabolic SAR | overlay | Dots green/red | Trailing stop dots | 🔲 Todo |
| chandelier | Chandelier Exit | overlay | Green long, red short | ATR-based exit | 🔲 Todo |
| vstop | Volatility Stop | overlay | Green/red dots | ATR trailing stop | 🔲 Todo |
| ichimoku | Ichimoku Cloud | overlay | Multiple colors | Full cloud system | 🔲 Todo |

### Batch 5: Volume (Separate Pane)

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

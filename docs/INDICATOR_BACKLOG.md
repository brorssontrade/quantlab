# Indicator Library Backlog

> Complete 82-indicator backlog: one row per manifest entry  
> Auto-sync against `indicatorManifest.ts` via `scripts/indicatorInventory.ts`
> 
> **Last updated:** 2025-02-07

---

## 📊 Complete Indicator Inventory (82 total)

| # | ID | Name | Category | Pane | Status | Notes |
|---|-----|------|----------|------|--------|-------|
| 1 | sma | Simple Moving Average | moving-average | overlay | ✅ Done | |
| 2 | ema | Exponential Moving Average | moving-average | overlay | ✅ Done | |
| 3 | smma | Smoothed Moving Average | moving-average | overlay | ✅ Done | RMA/Wilder |
| 4 | wma | Weighted Moving Average | moving-average | overlay | ✅ Done | |
| 5 | dema | Double EMA | moving-average | overlay | ✅ Done | |
| 6 | tema | Triple EMA | moving-average | overlay | ✅ Done | |
| 7 | hma | Hull Moving Average | moving-average | overlay | ✅ Done | |
| 8 | kama | Kaufman Adaptive MA | moving-average | overlay | ✅ Done | |
| 9 | vwma | Volume Weighted MA | moving-average | overlay | ✅ Done | |
| 10 | mcginley | McGinley Dynamic | moving-average | overlay | ✅ Done | |
| 11 | alma | Arnaud Legoux MA | moving-average | overlay | ✅ Done | |
| 12 | lsma | Least Squares MA | moving-average | overlay | ✅ Done | Linear Regression |
| 13 | maribbon | MA Ribbon (8) | moving-average | overlay | ✅ Done | 8 EMAs |
| 14 | maribbon4 | MA Ribbon (4) | moving-average | overlay | ✅ Done | 4 MAs |
| 15 | median | Median Line | moving-average | overlay | ✅ Done | |
| 16 | linreg | Linear Regression | moving-average | overlay | ✅ Done | |
| 17 | sar | Parabolic SAR | trend | overlay | ✅ Done | Dots |
| 18 | supertrend | SuperTrend | trend | overlay | ✅ Done | ATR-based |
| 19 | ichimoku | Ichimoku Cloud | trend | overlay | ✅ Done | Full cloud |
| 20 | zigzag | ZigZag | trend | overlay | ✅ Done | Swing detection |
| 21 | williamsAlligator | Williams Alligator | trend | overlay | ✅ Done | 3 SMAs |
| 22 | williamsFractals | Williams Fractals | trend | overlay | ✅ Done | Up/down markers |
| 23 | rsi | Relative Strength Index | momentum | separate | ✅ Done | Wilder smoothing |
| 24 | macd | MACD | momentum | separate | ✅ Done | EMA-based |
| 25 | ao | Awesome Oscillator | momentum | separate | ✅ Done | Histogram |
| 26 | adx | Average Directional Index | momentum | separate | ✅ Done | Wilder smoothing |
| 27 | dmi | Directional Movement Index | momentum | separate | ✅ Done | +DI/-DI |
| 28 | vortex | Vortex Indicator | momentum | separate | ✅ Done | VI+/VI- |
| 29 | aroon | Aroon | momentum | separate | ✅ Done | Up/Down |
| 30 | aroonosc | Aroon Oscillator | momentum | separate | ✅ Done | Difference |
| 31 | trix | TRIX | momentum | separate | ✅ Done | Triple smoothed |
| 32 | tsi | True Strength Index | momentum | separate | ✅ Done | Double smoothed |
| 33 | smii | SMI Ergodic Indicator | momentum | separate | ✅ Done | |
| 34 | smio | SMI Ergodic Oscillator | momentum | separate | ✅ Done | |
| 35 | coppock | Coppock Curve | momentum | separate | ✅ Done | |
| 36 | cmo | Chande Momentum Osc | momentum | separate | ✅ Done | |
| 37 | uo | Ultimate Oscillator | momentum | separate | ✅ Done | Multi-period |
| 38 | stoch | Stochastic | momentum | separate | ✅ Done | %K/%D |
| 39 | stochrsi | Stochastic RSI | momentum | separate | ✅ Done | RSI + Stoch |
| 40 | cci | Commodity Channel Index | momentum | separate | ✅ Done | |
| 41 | roc | Rate of Change | momentum | separate | ✅ Done | |
| 42 | mom | Momentum | momentum | separate | ✅ Done | |
| 43 | willr | Williams %R | momentum | separate | ✅ Done | Inverted scale |
| 44 | fisher | Fisher Transform | momentum | separate | ✅ Done | |
| 45 | bb | Bollinger Bands | volatility | overlay | ✅ Done | ±2σ bands |
| 46 | atr | Average True Range | volatility | separate | ✅ Done | Wilder smoothing |
| 47 | dc | Donchian Channels | volatility | overlay | ✅ Done | High/Low channels |
| 48 | kc | Keltner Channels | volatility | overlay | ✅ Done | ATR-based bands |
| 49 | vstop | Volatility Stop | volatility | overlay | ✅ Done | Trailing stop |
| 50 | chop | Choppiness Index | volatility | separate | ✅ Done | Trend/chop |
| 51 | hv | Historical Volatility | volatility | separate | ✅ Done | Annualized σ |
| 52 | bbw | Bollinger Bands Width | volatility | separate | ✅ Done | |
| 53 | bbtrend | BB Trend Indicator | volatility | separate | ✅ Done | |
| 54 | ulcer | Ulcer Index | volatility | separate | ✅ Done | Drawdown |
| 55 | cvi | Chaikin Volatility | volatility | separate | ✅ Done | EMA of HL range |
| 56 | env | Envelope | volatility | overlay | ✅ Done | % bands |
| 57 | vwap | VWAP | volume | overlay | ✅ Done | UTC anchored |
| 58 | avwap | Anchored VWAP | volume | overlay | ✅ Done | Manual anchor |
| 59 | obv | On Balance Volume | volume | separate | ✅ Done | Cumulative |
| 60 | mfi | Money Flow Index | volume | separate | ✅ Done | Volume-weighted RSI |
| 61 | cmf | Chaikin Money Flow | volume | separate | ✅ Done | |
| 62 | pvt | Price Volume Trend | volume | separate | ✅ Done | |
| 63 | pvi | Positive Volume Index | volume | separate | ✅ Done | |
| 64 | nvi | Negative Volume Index | volume | separate | ✅ Done | |
| 65 | relvol | Relative Volume | volume | separate | ✅ Done | Lookback ratio |
| 66 | klinger | Klinger Oscillator | volume | separate | ✅ Done | |
| 67 | volumeDelta | Volume Delta | volume | separate | ✅ Done | Intraday only |
| 68 | cvd | Cumulative Volume Delta | volume | separate | ✅ Done | |
| 69 | rsiDivergence | RSI Divergence | divergence | separate+overlay | ✅ Done | Markers + RSI |
| 70 | knoxvilleDivergence | Knoxville Divergence | divergence | separate+overlay | ✅ Done | MOM + histogram |
| 71 | pivotPointsStandard | Standard Pivot Points | pivot | overlay | ✅ Done | PP/R1-3/S1-3 |
| 72 | pivotPointsHighLow | High/Low Pivot Points | pivot | overlay | ✅ Done | Swing pivots |
| 73 | autoFib | Auto Fibonacci | pivot | overlay | ✅ Done | Auto levels |
| 74 | adrb | Advance/Decline Ratio Bars | breadth | separate | ✅ Done | close > close[1] |
| 75 | adr | Advance/Decline Ratio | breadth | separate | ⚠️ Needs data | Breadth provider |
| 76 | adl | Advance/Decline Line | breadth | separate | ⚠️ Needs data | Breadth provider |
| 77 | vrvp | Visible Range Vol Profile | volume-profile | overlay | 🚧 WIP | EPIC-VP |
| 78 | vpfr | Fixed Range Vol Profile | volume-profile | overlay | 🚧 WIP | EPIC-VP |
| 79 | aavp | Auto Anchored Vol Profile | volume-profile | overlay | 🚧 WIP | EPIC-VP |
| 80 | svp | Session Volume Profile | volume-profile | overlay | 🚧 WIP | EPIC-VP |
| 81 | svphd | Session Volume Profile HD | volume-profile | overlay | 🚧 WIP | EPIC-VP |
| 82 | pvp | Periodic Volume Profile | volume-profile | overlay | 🚧 WIP | EPIC-VP |

---

## 📈 Progress Summary

| Status | Count | % |
|--------|-------|---|
| ✅ Done | 74 | 90.2% |
| ⚠️ Needs data | 2 | 2.4% |
| 🚧 WIP (VP suite) | 6 | 7.3% |
| **Total** | **82** | **100%** |

---

## 🚧 Volume Profile Suite (WIP — Paused)

> **Status:** Under development, paused for parity audit.  
> **Epic:** EPIC-VP in LLM_TASKS.md  
> **Remaining work:** VP-1 through VP-13 in LLM_TASKS.md

| ID | Status | Blocker |
|----|--------|---------|
| vrvp | 🚧 WIP | LTF data aggregation, histogram alignment |
| vpfr | 🚧 WIP | Same as VRVP + range selection |
| aavp | 🚧 WIP | Same as VRVP + auto-anchor detection |
| svp | 🚧 WIP | Session boundary detection |
| svphd | 🚧 WIP | Session boundaries + HD resolution |
| pvp | 🚧 WIP | Periodic boundaries |

---

## ⚠️ Needs External Data Provider

| ID | Name | Required Data | Status |
|----|------|---------------|--------|
| adr | Advance/Decline Ratio | Market breadth (advances/declines) | ⚠️ Deferred |
| adl | Advance/Decline Line | Market breadth (advances/declines) | ⚠️ Deferred |

> These indicators require a breadth data source (e.g., NYSE advance/decline counts).  
> Currently not available via EODHD or OpenBB. Will revisit when provider is added.

---

## ✅ Category Breakdown

### Moving Averages (16 indicators)
sma, ema, smma, wma, dema, tema, hma, kama, vwma, mcginley, alma, lsma, maribbon, maribbon4, median, linreg

### Trend/Direction (6 indicators)
sar, supertrend, ichimoku, zigzag, williamsAlligator, williamsFractals

### Momentum (22 indicators)
rsi, macd, ao, adx, dmi, vortex, aroon, aroonosc, trix, tsi, smii, smio, coppock, cmo, uo, stoch, stochrsi, cci, roc, mom, willr, fisher

### Volatility (12 indicators)
bb, atr, dc, kc, vstop, chop, hv, bbw, bbtrend, ulcer, cvi, env

### Volume (12 indicators)
vwap, avwap, obv, mfi, cmf, pvt, pvi, nvi, relvol, klinger, volumeDelta, cvd

### Divergence (2 indicators)
rsiDivergence, knoxvilleDivergence

### Pivot/Levels (3 indicators)
pivotPointsStandard, pivotPointsHighLow, autoFib

### Market Breadth (3 indicators)
adrb (✅), adr (⚠️), adl (⚠️)

### Volume Profile (6 indicators — WIP)
vrvp, vpfr, aavp, svp, svphd, pvp

---

## 📋 Quality Checklist (Every Indicator Must Pass)

```markdown
- [ ] Manifest entry with correct panePolicy (overlay/separate)
- [ ] TV-default colors and lineWidths
- [ ] All inputs defined with proper min/max/step
- [ ] All outputs defined with style (line/histogram/area/band)
- [ ] Compute function in compute.ts
- [ ] Registry entry in registryV2.ts (82 cases)
- [ ] Golden test in compute.test.ts or compute.golden.test.ts
- [ ] Renders correctly with mock data
- [ ] Style tab allows per-output customization
- [ ] Legend shows name + params + live values
```

---

## 🔗 Related Documentation

- [INDICATOR_PARITY_MATRIX.md](./INDICATOR_PARITY_MATRIX.md) — TradingView parity audit status
- [LLM_TASKS.md](./LLM_TASKS.md) — EPIC-VP task breakdown (VP-1 to VP-13)
- [LLM.md](./LLM.md) — Section 3: Compute Engine Architecture

---

## 📦 Inventory Validation

Run the inventory check to validate sync with manifest:

```powershell
cd quantlab-ui
npx tsx scripts/indicatorInventory.ts
```

Expected output:
```
✅ Manifest: 82 indicators
✅ Registry: 82 cases  
✅ Docs synced
```

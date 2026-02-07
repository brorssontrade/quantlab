# Indicator Parity Matrix

> Systematic TradingView parity audit for all 82 indicators.
>
> **Status Key:**
> - ✅ OK — Visual, compute, and settings parity verified
> - ⚠️ Needs Fix — Known issues documented
> - 🚧 WIP — Under development, not release-ready
> - 📊 Needs Data — Requires external data provider (breadth, fundamentals, etc.)
> - 🔲 Untested — Not yet audited
>
> **Last updated:** 2026-02-07

---

## Parity Audit Process

### Per-Indicator Checklist

For each indicator, verify:

1. **Compute Parity** — Values match TradingView with same inputs
   - Compare last value in status line
   - Spot-check 2-3 historical values
   - Known edge cases (first bars, gaps, zero volume)

2. **Visual Parity** — Rendering matches TradingView
   - Line colors/widths
   - Histogram colors (up/down)
   - Bands/fills/opacity
   - Labels/markers/offsets

3. **Settings Parity** — Inputs/defaults match TradingView
   - Input names and order
   - Default values
   - Min/max/step constraints
   - Style toggles

4. **Robustness** — Works across conditions
   - Multiple symbol types (equity, crypto, FX)
   - Multiple timeframes (1D, 1H, 5m)
   - Edge cases (missing volume, gaps, short history)

### Test Set (Minimum per Indicator)

| Symbol | Type | Exchange |
|--------|------|----------|
| META | Equity | NASDAQ |
| BTCUSD | Crypto | Binance |
| EURUSD | FX | OANDA |

| Timeframe | Range |
|-----------|-------|
| 1D | 1Y |
| 1H | 1M |
| 5m | 1W |

---

## Parity Matrix

### Volume Profile Suite (🚧 WIP — Paused)

> **Epic:** EPIC-VP in LLM_TASKS.md
> **Status:** Under development. Paused pending full parity audit.

| ID | Name | Type | Status | Compute | Visual | Settings | Gaps | Notes |
|----|------|------|--------|---------|--------|----------|------|-------|
| vrvp | Visible Range Volume Profile | overlay | 🚧 WIP | ⚠️ | ⚠️ | ⚠️ | POC/VAH/VAL parity, row sizing | See VP-1..VP-13 in LLM_TASKS |
| vpfr | Fixed Range Volume Profile | overlay | 🚧 WIP | ⚠️ | ⚠️ | ⚠️ | Anchor interaction, persistence | Two-click state machine |
| aavp | Auto Anchored Volume Profile | overlay | 🚧 WIP | ⚠️ | ⚠️ | ⚠️ | Anchor modes, Auto logic | TV parity TBD |
| svp | Session Volume Profile | overlay | 🚧 WIP | ⚠️ | ⚠️ | ⚠️ | Session logic, RTH/ETH | Exchange timezone handling |
| svphd | Session Volume Profile HD | overlay | 🚧 WIP | ⚠️ | ⚠️ | ⚠️ | Two-pass rendering | Perf optimization needed |
| pvp | Periodic Volume Profile | overlay | 🚧 WIP | ⚠️ | ⚠️ | ⚠️ | Period boundaries | Zoom persistence |

---

### Moving Averages (Overlay)

| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |
|----|------|------|--------|---------|--------|----------|--------|------|
| sma | Simple Moving Average | overlay | 🔲 | | | | | |
| ema | Exponential Moving Average | overlay | 🔲 | | | | | |
| smma | Smoothed Moving Average | overlay | 🔲 | | | | | |
| wma | Weighted Moving Average | overlay | 🔲 | | | | | |
| dema | Double EMA | overlay | 🔲 | | | | | |
| tema | Triple EMA | overlay | 🔲 | | | | | |
| hma | Hull Moving Average | overlay | 🔲 | | | | | |
| kama | Kaufman Adaptive MA | overlay | 🔲 | | | | | |
| vwma | Volume Weighted MA | overlay | 🔲 | | | | | |
| mcginley | McGinley Dynamic | overlay | 🔲 | | | | | |
| alma | Arnaud Legoux MA | overlay | 🔲 | | | | | |
| lsma | Least Squares MA | overlay | 🔲 | | | | | |
| linreg | Linear Regression | overlay | 🔲 | | | | | |
| median | Median | overlay | 🔲 | | | | | |
| maribbon | MA Ribbon | overlay | 🔲 | | | | | |
| maribbon4 | MA Ribbon 4 | overlay | 🔲 | | | | | |

---

### Momentum (Separate Pane)

| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |
|----|------|------|--------|---------|--------|----------|--------|------|
| rsi | Relative Strength Index | separate | 🔲 | | | | | |
| macd | MACD | separate | 🔲 | | | | | |
| stoch | Stochastic | separate | 🔲 | | | | | |
| stochrsi | Stochastic RSI | separate | 🔲 | | | | | |
| cci | Commodity Channel Index | separate | 🔲 | | | | | |
| roc | Rate of Change | separate | 🔲 | | | | | |
| mom | Momentum | separate | 🔲 | | | | | |
| willr | Williams %R | separate | 🔲 | | | | | |
| trix | TRIX | separate | 🔲 | | | | | |
| tsi | True Strength Index | separate | 🔲 | | | | | |
| uo | Ultimate Oscillator | separate | 🔲 | | | | | |
| cmo | Chande Momentum Osc | separate | 🔲 | | | | | |
| coppock | Coppock Curve | separate | 🔲 | | | | | |
| ao | Awesome Oscillator | separate | 🔲 | | | | | |
| fisher | Fisher Transform | separate | 🔲 | | | | | |
| smii | SMI Indicator | separate | 🔲 | | | | | |
| smio | SMI Oscillator | separate | 🔲 | | | | | |
| ulcer | Ulcer Index | separate | 🔲 | | | | | |

---

### Trend/Direction (Mixed Panes)

| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |
|----|------|------|--------|---------|--------|----------|--------|------|
| adx | Average Directional Index | separate | 🔲 | | | | | |
| dmi | Directional Movement Index | separate | 🔲 | | | | | |
| vortex | Vortex Indicator | separate | 🔲 | | | | | |
| aroon | Aroon | separate | 🔲 | | | | | |
| aroonosc | Aroon Oscillator | separate | 🔲 | | | | | |
| supertrend | SuperTrend | overlay | 🔲 | | | | | |
| sar | Parabolic SAR | overlay | 🔲 | | | | | |
| ichimoku | Ichimoku Cloud | overlay | 🔲 | | | | | |
| williamsAlligator | Williams Alligator | overlay | 🔲 | | | | | |
| williamsFractals | Williams Fractals | overlay | 🔲 | | | | | |
| zigzag | ZigZag | overlay | 🔲 | | | | | |
| chop | Choppiness Index | separate | 🔲 | | | | | |

---

### Volatility (Mixed Panes)

| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |
|----|------|------|--------|---------|--------|----------|--------|------|
| atr | Average True Range | separate | 🔲 | | | | | |
| bb | Bollinger Bands | overlay | 🔲 | | | | | |
| bbw | Bollinger Band Width | separate | 🔲 | | | | | |
| bbtrend | Bollinger Bands Trend | separate | 🔲 | | | | | |
| dc | Donchian Channels | overlay | 🔲 | | | | | |
| kc | Keltner Channels | overlay | 🔲 | | | | | |
| env | Envelope | overlay | 🔲 | | | | | |
| vstop | Volatility Stop | overlay | 🔲 | | | | | |
| hv | Historical Volatility | separate | 🔲 | | | | | |
| cvi | Chaikin Volatility Index | separate | 🔲 | | | | | |

---

### Volume (Separate Pane)

| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |
|----|------|------|--------|---------|--------|----------|--------|------|
| vwap | Volume Weighted Avg Price | overlay | 🔲 | | | | | |
| avwap | Anchored VWAP | overlay | 🔲 | | | | | |
| obv | On Balance Volume | separate | 🔲 | | | | | |
| pvt | Price Volume Trend | separate | 🔲 | | | | | |
| cmf | Chaikin Money Flow | separate | 🔲 | | | | | |
| mfi | Money Flow Index | separate | 🔲 | | | | | |
| klinger | Klinger Oscillator | separate | 🔲 | | | | | |
| cvd | Cumulative Volume Delta | separate | 🔲 | | | | | |
| volumeDelta | Volume Delta | separate | 🔲 | | | | | |
| pvi | Positive Volume Index | separate | 🔲 | | | | | |
| nvi | Negative Volume Index | separate | 🔲 | | | | | |
| relvol | Relative Volume | separate | 🔲 | | | | | |

---

### Divergence (Special)

| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |
|----|------|------|--------|---------|--------|----------|--------|------|
| rsiDivergence | RSI Divergence | separate | 🔲 | | | | | |
| knoxvilleDivergence | Knoxville Divergence | overlay | 🔲 | | | | | |

---

### Pivot/Levels (Overlay)

| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |
|----|------|------|--------|---------|--------|----------|--------|------|
| pivotPointsStandard | Pivot Points (Standard) | overlay | 🔲 | | | | | |
| pivotPointsHighLow | Pivot Points (High/Low) | overlay | 🔲 | | | | | |
| autoFib | Auto Fibonacci | overlay | 🔲 | | | | | |

---

### Market Breadth (📊 Needs Data Provider)

> These require real exchange breadth data (advancing/declining stocks per day).

| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |
|----|------|------|--------|---------|--------|----------|--------|------|
| adl | Advance/Decline Line | separate | 📊 | | | | | Needs breadth data |
| adr | Advance/Decline Ratio | separate | 📊 | | | | | Needs breadth data |
| adrb | Advance/Decline Ratio Bars | separate | ✅ | ✅ | ✅ | ✅ | META 1D | Uses chart bars (complete) |

---

## Automation Plan

### Playwright Baseline Tests

```typescript
// For each indicator, create baseline screenshot test:
test(`${indicatorId} baseline screenshot`, async ({ page }) => {
  await page.goto(`/?mock=1&symbol=META.US&tf=1d`);
  await addIndicator(page, indicatorId);
  await expect(page.locator('.chart-container')).toHaveScreenshot(`${indicatorId}-baseline.png`);
});
```

### Golden Value Unit Tests

```typescript
// For each indicator, create golden value test:
describe(indicatorId, () => {
  it('matches TV reference value at 2024-01-02', () => {
    const result = computeIndicator(mockOHLCV, defaultParams);
    expect(result[result.length - 1].value).toBeCloseTo(TV_REFERENCE_VALUE, 2);
  });
});
```

---

## Epics for External Data

### EPIC-BREADTH: Market Breadth Data Provider

**Indicators:** ADL, ADR (ADR_B already complete)
**Requirement:** Daily advancing/declining stocks per exchange
**Status:** Infrastructure ready, awaiting data source

### EPIC-FUNDAMENTALS: Fundamentals Data Provider

**Indicators:** (TBD if any use fundamentals)
**Requirement:** Earnings, dividends, financial ratios
**Status:** EODHD fundamentals available

### EPIC-CONSTITUENTS: Index Constituents

**Indicators:** (TBD)
**Requirement:** S&P 500, NASDAQ 100 constituents with weights
**Status:** Needs EODHD constituents API integration

---

## Progress Summary

| Category | Total | ✅ OK | ⚠️ Fix | 🚧 WIP | 📊 Data | 🔲 Untested |
|----------|-------|-------|--------|--------|---------|-------------|
| Volume Profile | 6 | 0 | 0 | 6 | 0 | 0 |
| Moving Averages | 16 | 0 | 0 | 0 | 0 | 16 |
| Momentum | 18 | 0 | 0 | 0 | 0 | 18 |
| Trend/Direction | 12 | 0 | 0 | 0 | 0 | 12 |
| Volatility | 10 | 0 | 0 | 0 | 0 | 10 |
| Volume | 12 | 0 | 0 | 0 | 0 | 12 |
| Divergence | 2 | 0 | 0 | 0 | 0 | 2 |
| Pivot/Levels | 3 | 0 | 0 | 0 | 0 | 3 |
| Market Breadth | 3 | 1 | 0 | 0 | 2 | 0 |
| **TOTAL** | **82** | **1** | **0** | **6** | **2** | **73** |

---

## Next Steps

1. **Start with high-impact indicators:** RSI, MACD, Bollinger Bands, ATR, VWAP
2. **Document gaps as found** — update this matrix with specific issues
3. **Create Playwright baseline screenshots** for regression testing
4. **Create golden value tests** for compute validation
5. **Resume VP suite** after completing initial parity pass on core indicators

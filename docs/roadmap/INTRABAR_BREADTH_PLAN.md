# Volume Delta/CVD/CVI - TradingView Parity Implementation Plan

## Overview

This document outlines the steps needed to achieve TradingView parity for:
- **Volume Delta**: Requires intrabar (lower timeframe) data
- **CVD (Cumulative Volume Delta)**: Requires intrabar data + anchor period logic
- **CVI (Cumulative Volume Index)**: Requires exchange-level breadth data

---

## Current State

### Volume Delta & CVD
- ✅ Compute functions implemented (`computeVolumeDelta`, `computeCVD`)
- ✅ Auto-timeframe logic implemented (`getAutoIntrabarTimeframe`)
- ✅ Intrabar classification logic implemented (`classifyIntrabarVolume`)
- ✅ **Backend endpoint**: `/chart/intrabars` (fetches 5m/1h data from EODHD)
- ✅ **Frontend hook**: `useIntrabarData` (caches, buckets intrabars to chart bars)
- ✅ **Registry integration**: `computeIndicator` accepts optional `intrabars` param
- ⚠️ **PENDING**: Wire hook to IndicatorPane for live parity (UI integration)

### CVI
- ✅ Compute function implemented (`computeCVI`)
- ⚠️ **LIMITATION**: Using mock breadth data (placeholder)
- ⚠️ **Result**: Values differ by orders of magnitude from TV

---

## Phase 1: Intrabar Fetching for Volume Delta & CVD ✅ COMPLETE

### 1.1 Backend API Enhancement ✅

**Endpoint: `GET /chart/intrabars`**

```python
@app.get("/chart/intrabars")
def chart_intrabars(
    symbol: str,          # e.g., META.US
    chartTf: str,         # Chart timeframe, e.g., "D"
    intrabarTf: str,      # Intrabar timeframe, e.g., "5m" (auto or explicit)
    start: str,           # ISO timestamp of chart bar start
    end: str,             # ISO timestamp of chart bar end
    limit: int = 500,     # Max intrabars per request
):
    """
    Fetch intrabar data for a specific chart bar range.
    Returns OHLCV at the lower timeframe for Volume Delta calculation.
    """
```

**Implementation notes:**
- Reuse existing `_CHART_FETCH_PLAN` for 5m, 15m, 1h, 4h data
- Filter intrabars by the chart bar's time range
- Cache aggressively (intrabar data is historical, rarely changes)

### 1.2 Frontend Data Fetching

**New hook: `useIntrabarData`**

```typescript
export function useIntrabarData(
  symbol: string,
  chartTimeframe: string,
  chartBars: ComputeBar[],
  options?: { enabled?: boolean; intrabarTf?: string }
): {
  intrabars: Map<number, IntrabarPoint[]>;  // chartTime => intrabars
  isLoading: boolean;
  error: string | null;
}
```

**Implementation notes:**
- Batch-fetch intrabars for visible chart range
- Cache by (symbol, chartTf, intrabarTf, dateRange)
- Support progressive loading for large ranges

### 1.3 Registry Integration

Update `registryV2.ts` Volume Delta & CVD cases:

```typescript
case "volumeDelta": {
  // NEW: Fetch intrabars if available
  const intrabars = await fetchIntrabarData(symbol, chartTimeframe, data);
  
  if (intrabars && intrabars.size > 0) {
    // Use real intrabar computation
    return computeVolumeDelta(data, intrabars, { ... });
  } else {
    // Fallback to chart-bar approximation (current behavior)
    return computeVolumeDeltaFromChartBars(data, { ... });
  }
}
```

### 1.4 TradingView Auto-Timeframe Rules (Reference)

| Chart TF     | Intrabar TF | Notes                    |
|--------------|-------------|--------------------------|
| Seconds (S)  | 1S          | Tick-level data          |
| 1-59m        | 1m          | 1-minute bars            |
| 1-4H         | 1m          | 1-minute bars            |
| Daily (D)    | 5m          | 5-minute bars            |
| Weekly (W)   | 60m         | 1-hour bars              |
| Monthly (M)  | 60m         | 1-hour bars              |

---

## Phase 2: Breadth API for CVI

### 2.1 Data Source Research

CVI requires exchange-level advancing/declining volume:
- **Advancing volume**: Total volume of stocks with close > prev close
- **Declining volume**: Total volume of stocks with close < prev close

**Potential data sources:**
1. **EOD Historical Data** - May have breadth data (needs verification)
2. **Quandl/Nasdaq Data Link** - Has market breadth indicators
3. **Alpha Vantage** - Limited breadth coverage
4. **Custom calculation** - Aggregate from individual stock data (expensive)

### 2.2 Backend Breadth Endpoint

**New endpoint: `GET /market/breadth`**

```python
@app.get("/market/breadth")
def market_breadth(
    exchange: str,        # NYSE, NASDAQ, AMEX, ARCX, etc.
    start: str | None,    # ISO timestamp
    end: str | None,      # ISO timestamp
    limit: int = 500,
):
    """
    Fetch market breadth data (advancing/declining volume).
    Returns timeseries of { date, advancingVolume, decliningVolume }.
    """
```

### 2.3 CVI Compute Integration

```typescript
case "cvi": {
  const exchange = getExchangeFromSymbol(symbol);  // e.g., "NYSE"
  const breadth = await fetchBreadthData(exchange, dateRange);
  
  if (breadth && breadth.length > 0) {
    return computeCVI(data, breadth, { ... });
  } else {
    // Mark as unavailable instead of showing wrong values
    return { cvi: [], error: "Breadth data unavailable" };
  }
}
```

---

## Phase 3: UI/UX Improvements

### 3.1 Data Source Indicators
- Show "(intrabar)" or "(LTF)" badge when using real intrabar data
- Show "(chart)" or "(approx)" when using fallback
- Show "(breadth unavailable)" for CVI when no data

### 3.2 Settings Panel
- Allow users to select intrabar timeframe (Auto / 1m / 5m / etc.)
- Show data source in indicator tooltip

---

## Implementation Priority

| Task                           | Priority | Effort  | Dependency     |
|--------------------------------|----------|---------|----------------|
| Backend /chart/intrabars       | P1       | Medium  | None           |
| Frontend useIntrabarData hook  | P1       | Medium  | Backend API    |
| Volume Delta with intrabars    | P1       | Low     | Data hook      |
| CVD with intrabars             | P1       | Low     | Volume Delta   |
| Backend /market/breadth        | P2       | High    | Data source    |
| CVI with breadth               | P2       | Low     | Breadth API    |
| UI data source badges          | P3       | Low     | Any            |

---

## Verification Criteria

### Volume Delta Parity Test
1. Load META.US on Daily chart
2. Add Volume Delta indicator
3. Compare last 20 bars with TradingView
4. **Pass**: Values within 5% of TV for same dates

### CVD Parity Test
1. Load META.US on Daily chart with Session anchor
2. Add CVD indicator
3. Compare accumulation pattern with TradingView
4. **Pass**: Anchor resets match, values within 5%

### CVI Parity Test
1. Load NYSE:CVI or similar in TradingView
2. Add CVI indicator with NYSE exchange
3. Compare cumulative values
4. **Pass**: Values within 5% of TV

---

## Notes

- EODHD API already supports 5m/15m/1h timeframes for many symbols
- Intrabar data volume: ~78 bars per daily bar (5min in 6.5hr session)
- Consider chunked/streaming for large date ranges
- Cache invalidation: Only latest bar needs refresh

---

## Deferred

- **Second-level (1S) intrabar data**: Not available from EODHD
- **Real-time intrabar updates**: Requires WebSocket integration
- **Custom exchange breadth**: Would need all constituent symbols

---

*Last updated: 2026-02-06*
*Author: Claude (AI assistant)*

/**
 * REGRESSION Golden Tests for Indicator Compute Functions
 * 
 * ⚠️ IMPORTANT: This is a REGRESSION test suite, NOT a TradingView parity proof.
 * 
 * These tests use values generated from our own compute functions to detect
 * unintended changes. They answer: "Did we accidentally break something?"
 * 
 * For TradingView PARITY verification (external baseline), see:
 * - compute.tvparity.test.ts (values from TradingView)
 * - __fixtures__/tv-parity-baselines.json (external reference data)
 * 
 * Golden values are stored in __fixtures__/*.json with category: "regression".
 */

import { describe, it, expect } from "vitest";
import metaFixture from "./__fixtures__/META.US.1d.json";

// Import test helpers
import {
  extractSeries,
  getLastValidValue,
  filterValid,
} from "./__tests__/testHelpers";

// Import compute functions
import {
  computeSMA,
  computeEMA,
  computeRSI,
  computeATR,
  computeMACD,
  computeBollingerBands,
  computeStochastic,
  computeADX,
  computeWilliamsR,
  computeCCI,
  computeOBV,
} from "./compute";

// ============================================================================
// Types
// ============================================================================

interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LinePoint {
  time: number;
  value: number | null;
}

// ============================================================================
// Fixture Setup
// ============================================================================

const bars: OHLCVBar[] = metaFixture.bars;
const golden = metaFixture.goldenValues;

// Legacy helper (kept for backwards compatibility, prefer extractSeries + getLastValidValue)
function getLastValue(series: LinePoint[]): number | null {
  return getLastValidValue(series as any);
}

// ============================================================================
// REGRESSION Tests - Moving Averages
// ============================================================================

describe("Regression: Moving Averages", () => {
  it("SMA(9) matches regression baseline", () => {
    const result = computeSMA(bars, 9, "close");
    const lastValue = getLastValue(result);
    
    expect(lastValue).toBeCloseTo(golden.sma9, 1);
  });
  
  it("EMA(9) matches regression baseline", () => {
    const result = computeEMA(bars, 9, "close");
    const lastValue = getLastValue(result);
    
    expect(lastValue).toBeCloseTo(golden.ema9, 1);
  });
  
  it("SMA returns correct length (data - period + 1)", () => {
    const result = computeSMA(bars, 9, "close");
    expect(result.length).toBe(bars.length - 9 + 1);
    expect(result[0].value).not.toBeNaN();
  });
});

// ============================================================================
// REGRESSION Tests - RSI
// ============================================================================

describe("Regression: RSI", () => {
  it("RSI(14) matches regression baseline", () => {
    const result = computeRSI(bars, 14, "close");
    const lastValue = getLastValidValue(extractSeries(result, "rsi"));
    
    expect(lastValue).toBeCloseTo(golden.rsi14, 1);
  });
  
  it("RSI is bounded 0-100", () => {
    const result = computeRSI(bars, 14, "close");
    const validValues = filterValid(extractSeries(result, "rsi"));
    
    for (const point of validValues) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });
  
  it("RSI warmup period has NaN for first (period-1) bars", () => {
    const result = computeRSI(bars, 14, "close");
    const rsiSeries = extractSeries(result, "rsi");
    
    // First 13 bars (period-1) should be NaN
    for (let i = 0; i < 13; i++) {
      expect(rsiSeries[i].value).toBeNaN();
    }
  });
});

// ============================================================================
// REGRESSION Tests - ATR
// ============================================================================

describe("Regression: ATR", () => {
  it("ATR(14) matches regression baseline", () => {
    const result = computeATR(bars, 14);
    const lastValue = getLastValidValue(result as any);
    
    expect(lastValue).toBeCloseTo(golden.atr14, 1);
  });
  
  it("ATR is always positive", () => {
    const result = computeATR(bars, 14);
    const validValues = filterValid(result as any);
    
    for (const point of validValues) {
      expect(point.value).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// REGRESSION Tests - MACD
// ============================================================================

describe("Regression: MACD", () => {
  it("MACD line matches regression baseline", () => {
    const result = computeMACD(bars, 12, 26, 9);
    const lastValue = getLastValidValue(extractSeries(result, "macd"));
    
    expect(lastValue).toBeCloseTo(golden.macd_macd, 1);
  });
  
  it("MACD signal matches regression baseline", () => {
    const result = computeMACD(bars, 12, 26, 9);
    const lastValue = getLastValidValue(extractSeries(result, "signal"));
    
    expect(lastValue).toBeCloseTo(golden.macd_signal, 1);
  });
  
  it("MACD histogram matches regression baseline", () => {
    const result = computeMACD(bars, 12, 26, 9);
    const histValues = result.histogram.filter(p => p.value !== null && !isNaN(p.value));
    const lastValue = histValues.length > 0 ? histValues[histValues.length - 1].value : null;
    
    expect(lastValue).toBeCloseTo(golden.macd_histogram, 1);
  });
});

// ============================================================================
// REGRESSION Tests - Bollinger Bands
// ============================================================================

describe("Regression: Bollinger Bands", () => {
  it("BB upper matches regression baseline", () => {
    const result = computeBollingerBands(bars, 20, 2, "close");
    const lastValue = getLastValidValue(extractSeries(result, "upper"));
    
    expect(lastValue).toBeCloseTo(golden.bb_upper, 1);
  });
  
  it("BB middle matches regression baseline", () => {
    const result = computeBollingerBands(bars, 20, 2, "close");
    const lastValue = getLastValidValue(extractSeries(result, "middle"));
    
    expect(lastValue).toBeCloseTo(golden.bb_middle, 1);
  });
  
  it("BB lower matches regression baseline", () => {
    const result = computeBollingerBands(bars, 20, 2, "close");
    const lastValue = getLastValidValue(extractSeries(result, "lower"));
    
    expect(lastValue).toBeCloseTo(golden.bb_lower, 1);
  });
  
  it("BB bands are symmetric around middle", () => {
    const result = computeBollingerBands(bars, 20, 2, "close");
    
    const lastUpper = getLastValidValue(extractSeries(result, "upper"));
    const lastMiddle = getLastValidValue(extractSeries(result, "middle"));
    const lastLower = getLastValidValue(extractSeries(result, "lower"));
    
    if (lastUpper !== null && lastMiddle !== null && lastLower !== null) {
      const upperDiff = lastUpper - lastMiddle;
      const lowerDiff = lastMiddle - lastLower;
      expect(upperDiff).toBeCloseTo(lowerDiff, 2);
    }
  });
});

// ============================================================================
// REGRESSION Tests - Stochastic
// ============================================================================

describe("Regression: Stochastic", () => {
  it("Stoch %K matches regression baseline", () => {
    const result = computeStochastic(bars, 14, 3, 3);
    const lastValue = getLastValidValue(extractSeries(result, "k"));
    
    expect(lastValue).toBeCloseTo(golden.stoch_k, 1);
  });
  
  it("Stoch %D matches regression baseline", () => {
    const result = computeStochastic(bars, 14, 3, 3);
    const lastValue = getLastValidValue(extractSeries(result, "d"));
    
    expect(lastValue).toBeCloseTo(golden.stoch_d, 1);
  });
  
  it("Stochastic is bounded 0-100", () => {
    const result = computeStochastic(bars, 14, 3, 3);
    
    for (const point of filterValid(extractSeries(result, "k"))) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================================
// REGRESSION Tests - Williams %R
// ============================================================================

describe("Regression: Williams %R", () => {
  it("Williams %R matches regression baseline", () => {
    const result = computeWilliamsR(bars, 14);
    const lastValue = getLastValidValue(result as any);
    
    expect(lastValue).toBeCloseTo(golden.willr, 1);
  });
  
  it("Williams %R is bounded -100 to 0", () => {
    const result = computeWilliamsR(bars, 14);
    
    for (const point of filterValid(result as any)) {
      expect(point.value).toBeGreaterThanOrEqual(-100);
      expect(point.value).toBeLessThanOrEqual(0);
    }
  });
});

// ============================================================================
// REGRESSION Tests - CCI
// ============================================================================

describe("Regression: CCI", () => {
  it("CCI(20) matches regression baseline", () => {
    const result = computeCCI(bars, 20, "hlc3");
    const lastValue = getLastValidValue(extractSeries(result, "cci"));
    
    expect(lastValue).toBeCloseTo(golden.cci, 1);
  });
});

// ============================================================================
// REGRESSION Tests - ADX
// ============================================================================

describe("Regression: ADX", () => {
  it("ADX(14) matches regression baseline", () => {
    const result = computeADX(bars, 14);
    const lastValue = getLastValidValue(extractSeries(result, "adx"));
    
    expect(lastValue).toBeCloseTo(golden.adx, 1);
  });
  
  it("ADX is bounded 0-100", () => {
    const result = computeADX(bars, 14);
    
    for (const point of filterValid(extractSeries(result, "adx"))) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================================
// REGRESSION Tests - OBV
// ============================================================================

describe("Regression: OBV", () => {
  it("OBV matches regression baseline magnitude", () => {
    const result = computeOBV(bars);
    const lastValue = getLastValidValue(result as any);
    
    expect(lastValue).not.toBeNull();
    if (lastValue !== null) {
      expect(Math.abs(lastValue)).toBeGreaterThan(golden.obv * 0.5);
      expect(Math.abs(lastValue)).toBeLessThan(golden.obv * 2);
    }
  });
  
  it("OBV is cumulative (increasing in uptrend)", () => {
    const result = computeOBV(bars);
    const values = filterValid(result as any).map(p => p.value);
    
    expect(values[values.length - 1]).toBeGreaterThan(values[0]);
  });
});

// ============================================================================
// Edge Cases (Unit Tests)
// ============================================================================

describe("Edge Cases", () => {
  it("Empty data returns empty array", () => {
    expect(computeSMA([], 9, "close")).toEqual([]);
    const rsiResult = computeRSI([], 14);
    expect(rsiResult.rsi).toEqual([]);
    expect(computeATR([], 14)).toEqual([]);
  });
  
  it("Single bar with period > 1 returns empty array", () => {
    const singleBar = [bars[0]];
    const result = computeSMA(singleBar, 9, "close");
    expect(result).toHaveLength(0);
  });
  
  it("Zero volume bars handled gracefully", () => {
    const zeroVolBars = bars.map(b => ({ ...b, volume: 0 }));
    const result = computeOBV(zeroVolBars);
    expect(result).toHaveLength(zeroVolBars.length);
  });
});


/**
 * TradingView PARITY Tests for Indicator Compute Functions
 * 
 * ⚠️ IMPORTANT: This is an EXTERNAL PARITY verification, NOT regression.
 * 
 * These tests use values manually extracted from TradingView to verify
 * our compute functions produce matching results. They answer:
 * "Does our indicator match what TradingView shows?"
 * 
 * For REGRESSION tests (engine-derived baselines), see:
 * - compute.golden.test.ts
 * 
 * ARCHITECTURE:
 * - Baselines stored in __fixtures__/tv-parity-baselines.json
 * - Tests are DATA-DRIVEN: loop through baselines, dispatch to correct compute fn
 * - Pending baselines skip (not fail) with clear console output
 * - Ready baselines run assertions and fail if values don't match
 * 
 * BASELINE LIFECYCLE:
 * 1. Create baseline entry with status: "pending"
 * 2. Extract values from TradingView (see extractionProtocol in JSON)
 * 3. Set status: "ready", verified: true, fill values
 * 4. Test automatically runs on next CI
 * 
 * ⚠️ NEVER update baseline values to match compute output!
 *    Baseline values must come from TradingView only.
 */

import { describe, it, expect } from "vitest";

// Import compute functions
import {
  computeRSI,
  computeMACD,
  computeBollingerBands,
  computeATR,
  computeADX,
  computeSMA,
  computeEMA,
  computeStochastic,
  computeCCI,
  computeOBV,
  computeWilliamsR,
  computeVWAP,
} from "./compute";

// Import test helpers
import {
  extractSeries,
  getLastValidValue,
  findBarIndexByTime,
  getValueAtTime,
  checkParityTolerance,
  PARITY_TOLERANCES,
} from "./__tests__/testHelpers";

// Import baselines  
import tvBaselines from "./__fixtures__/tv-parity-baselines.json";

// Import fixtures for parity tests
import metaFixture from "./__fixtures__/META.US.1d.json";
import meta1hFixture from "./__fixtures__/meta.us.1h.json";
import meta5mFixture from "./__fixtures__/meta.us.5m.json";
import spy5mFixture from "./__fixtures__/spy.us.5m.json";
import btcusd1dFixture from "./__fixtures__/btc-usd.1d.json";
import eurusd1dFixture from "./__fixtures__/eurusd.1d.json";

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

interface BaselineValue {
  date?: string;
  time?: string;
  barTime?: number;
  field?: string;
  value: number | null;
  note?: string;
}

interface Baseline {
  id: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  indicator: string;
  params: Record<string, any>;
  dateRange: { start: string; end: string };
  values: BaselineValue[];
  status: "pending" | "ready";
  verified: boolean;
  extractionMethod?: string;
  extractionDate?: string | null;
}

// ============================================================================
// Timeframe Normalization
// ============================================================================

/**
 * Normalize timeframe string to canonical format.
 * Canonical: 1D, 1H, 5m, 1m (uppercase D/H, lowercase m)
 */
function normalizeTimeframe(tf: string): string {
  const upper = tf.toUpperCase();
  if (upper.endsWith('D')) return upper;  // 1D
  if (upper.endsWith('H')) return upper;  // 1H, 4H
  if (upper.endsWith('M') && !upper.endsWith('MIN')) {
    // Convert M to m for minutes: 5M → 5m, 1M → 1m
    return tf.replace(/M$/i, 'm');
  }
  return tf;  // Unknown format, return as-is
}

// ============================================================================
// Fixture Registry (maps symbol+timeframe to fixture data)
// ============================================================================

const fixtures: Record<string, OHLCVBar[]> = {
  // AUDIT-01: META Daily
  "META.US-1D": metaFixture.bars,
  
  // AUDIT-02a: META 1H
  "META.US-1H": meta1hFixture.bars,
  
  // AUDIT-02b: META 5m
  "META.US-5m": meta5mFixture.bars,
  
  // SPY 5m (for VWAP)
  "SPY.US-5m": spy5mFixture.bars,
  
  // AUDIT-02c: BTCUSD Daily
  "BTC-USD.CC-1D": btcusd1dFixture.bars,
  
  // AUDIT-02d: EURUSD Daily
  "EURUSD.FOREX-1D": eurusd1dFixture.bars,
};

function getFixture(symbol: string, timeframe: string): OHLCVBar[] | null {
  // Normalize symbol (remove .US suffix if present for lookup)
  const normalizedSymbol = symbol.replace(".US", "");
  // Normalize timeframe
  const normalizedTf = normalizeTimeframe(timeframe);
  
  const key = `${symbol}-${normalizedTf}`;
  const altKey = `${normalizedSymbol}-${normalizedTf}`;
  
  return fixtures[key] ?? fixtures[altKey] ?? null;
}

// ============================================================================
// Baseline Helpers
// ============================================================================

const baselines = tvBaselines.baselines as Baseline[];

function isBaselineReady(baseline: Baseline): boolean {
  if (baseline.status !== "ready") return false;
  if (!baseline.values?.length) return false;
  return baseline.values.some(v => v.value !== null);
}

function getBaselineValue(baseline: Baseline, field?: string): number | null {
  if (!baseline.values?.length) return null;
  
  if (field) {
    const entry = baseline.values.find(v => v.field === field);
    return entry?.value ?? null;
  }
  
  // Return first non-null value without field specification
  const entry = baseline.values.find(v => v.value !== null && !v.field);
  return entry?.value ?? baseline.values.find(v => v.value !== null)?.value ?? null;
}

// ============================================================================
// Compute Dispatcher - Maps indicator type to compute function call
// Returns full series for bar-aligned extraction
// ============================================================================

interface LinePoint {
  time: number;
  value: number;
}

type ComputeResult = { 
  series: Record<string, LinePoint[]>;  // Full series for bar-aligned extraction
};

function computeForBaseline(bars: OHLCVBar[], baseline: Baseline): ComputeResult | null {
  const { indicator, params } = baseline;
  
  switch (indicator) {
    case "RSI": {
      const period = params.period ?? 14;
      const source = params.source ?? "close";
      const result = computeRSI(bars, period, source);
      return {
        series: {
          rsi: extractSeries(result, "rsi"),
        }
      };
    }
    
    case "MACD": {
      const fast = params.fast ?? 12;
      const slow = params.slow ?? 26;
      const signal = params.signal ?? 9;
      const result = computeMACD(bars, fast, slow, signal);
      return {
        series: {
          macd: extractSeries(result, "macd"),
          signal: extractSeries(result, "signal"),
          histogram: result.histogram as LinePoint[],
        }
      };
    }
    
    case "Bollinger Bands": {
      const period = params.period ?? 20;
      const stdDev = params.stdDev ?? 2;
      const source = params.source ?? "close";
      const result = computeBollingerBands(bars, period, stdDev, source);
      return {
        series: {
          upper: extractSeries(result, "upper"),
          middle: extractSeries(result, "middle"),
          lower: extractSeries(result, "lower"),
        }
      };
    }
    
    case "ATR": {
      const period = params.period ?? 14;
      const smoothing = params.smoothing ?? "rma";
      const result = computeATR(bars, period, smoothing);
      return {
        series: {
          atr: result as LinePoint[],
        }
      };
    }
    
    case "ADX/DMI": {
      const diPeriod = params.diPeriod ?? params.period ?? 14;
      const adxSmoothing = params.adxPeriod ?? params.adxSmoothing ?? 14;
      const result = computeADX(bars, diPeriod, adxSmoothing);
      return {
        series: {
          adx: extractSeries(result, "adx"),
          plusDI: extractSeries(result, "plusDI"),
          minusDI: extractSeries(result, "minusDI"),
        }
      };
    }
    
    case "SMA": {
      const period = params.period ?? 20;
      const source = params.source ?? "close";
      const result = computeSMA(bars, period, source);
      return {
        series: {
          sma: result as LinePoint[],
        }
      };
    }
    
    case "EMA": {
      const period = params.period ?? 20;
      const source = params.source ?? "close";
      const result = computeEMA(bars, period, source);
      return {
        series: {
          ema: result as LinePoint[],
        }
      };
    }
    
    case "Stochastic": {
      const kPeriod = params.kPeriod ?? 14;
      const kSmoothing = params.kSmoothing ?? 3;
      const dSmoothing = params.dSmoothing ?? 3;
      const result = computeStochastic(bars, kPeriod, kSmoothing, dSmoothing);
      return {
        series: {
          k: extractSeries(result, "k"),
          d: extractSeries(result, "d"),
        }
      };
    }
    
    case "CCI": {
      const period = params.period ?? 20;
      const result = computeCCI(bars, period, "hlc3");
      return {
        series: {
          cci: extractSeries(result, "cci"),
        }
      };
    }
    
    case "OBV": {
      const result = computeOBV(bars);
      return {
        series: {
          obv: result as LinePoint[],
        }
      };
    }
    
    case "Williams %R": {
      const period = params.period ?? 14;
      const result = computeWilliamsR(bars, period);
      return {
        series: {
          willr: result as LinePoint[],
        }
      };
    }
    
    case "VWAP": {
      // VWAP: Use session anchor with RTH start (14:30 UTC = 09:30 EST for US equities)
      // TradingView Session VWAP resets at RTH open, not UTC midnight
      const anchor = params.anchor ?? "session";
      const source = params.source ?? "hlc3";
      const sessionStartUtcHour = 14; // 14:30 UTC = 09:30 EST (RTH open)
      
      const result = computeVWAP(
        bars,
        anchor,
        [1.0, 2.0, 3.0],  // Default band multipliers
        [false, false, false],  // No bands for basic VWAP test
        "stdev",
        source,
        sessionStartUtcHour
      );
      
      return {
        series: {
          vwap: result.vwap,
        }
      };
    }
    
    default:
      console.warn(`⚠️  Unknown indicator type: ${indicator}`);
      return null;
  }
}

// ============================================================================
// Bar-Aligned Parity Assertion
// ============================================================================

function assertBarAlignedParity(
  bars: OHLCVBar[],
  series: LinePoint[],
  baseline: Baseline,
  expectedValue: BaselineValue,
  indicator: string
): void {
  // Determine target time from baseline value
  const targetTime = expectedValue.barTime ?? null;
  
  if (targetTime === null) {
    // Fallback to last value if no barTime specified (legacy support)
    console.warn(`⚠️  ${baseline.id}: No barTime specified, using last value (less accurate)`);
    const computedValue = getLastValidValue(series);
    const tvValue = expectedValue.value;
    
    if (tvValue === null) {
      throw new Error(`Expected value is null (baseline not populated)`);
    }
    if (computedValue === null) {
      throw new Error(`Computed value is null`);
    }
    
    const check = checkParityTolerance(computedValue, tvValue, indicator);
    if (!check.matches) {
      throw new Error(
        `PARITY MISMATCH (last value)\n` +
        `  Computed: ${computedValue.toFixed(6)}\n` +
        `  Expected: ${tvValue.toFixed(6)} (from TradingView)\n` +
        `  Diff: ${check.diff.toFixed(6)} (tolerance: ${check.tolerance})`
      );
    }
    return;
  }
  
  // Bar-aligned comparison (correct approach)
  // Find bar in original data to confirm it exists
  const barIndex = findBarIndexByTime(bars, targetTime);
  
  if (barIndex < 0) {
    throw new Error(
      `Bar not found for time ${targetTime} (${new Date(targetTime * 1000).toISOString()})\n` +
      `  Available range: ${bars[0]?.time} to ${bars[bars.length - 1]?.time}`
    );
  }
  
  // Find matching value in series by time (handles warmup offset)
  const seriesPoint = series.find(p => p.time === targetTime);
  
  if (!seriesPoint) {
    throw new Error(
      `Series value not found for time ${targetTime} (${new Date(targetTime * 1000).toISOString()})\n` +
      `  Series has ${series.length} values, first time: ${series[0]?.time}, last time: ${series[series.length - 1]?.time}\n` +
      `  This may indicate insufficient warmup period in fixture for ${indicator}`
    );
  }
  
  const computedValue = seriesPoint.value;
  const tvValue = expectedValue.value;
  
  if (tvValue === null) {
    throw new Error(`Expected value is null (baseline not populated for ${expectedValue.date ?? targetTime})`);
  }
  
  if (computedValue === null || !Number.isFinite(computedValue)) {
    throw new Error(
      `Computed value is null/NaN at bar ${barIndex} (time: ${targetTime})\n` +
      `  This may indicate insufficient warmup period in fixture`
    );
  }
  
  const check = checkParityTolerance(computedValue, tvValue, indicator);
  if (!check.matches) {
    throw new Error(
      `PARITY MISMATCH at bar ${barIndex} (${expectedValue.date ?? new Date(targetTime * 1000).toISOString()})\n` +
      `  Computed: ${computedValue.toFixed(6)}\n` +
      `  Expected: ${tvValue.toFixed(6)} (from TradingView)\n` +
      `  Diff: ${check.diff.toFixed(6)} (tolerance: ${check.tolerance})`
    );
  }
}

// ============================================================================
// DATA-DRIVEN PARITY TESTS (Bar-Aligned)
// ============================================================================

describe("TV Parity: Data-Driven Tests", () => {
  // Filter out protocol objects (they have _comment or extractionProtocol but no id)
  const actualBaselines = baselines.filter(b => b.id !== undefined);
  
  // Group baselines by indicator for organized output
  const dailyBaselines = actualBaselines.filter(b => b.timeframe === "1D");
  const intradayBaselines = actualBaselines.filter(b => b.timeframe !== "1D");
  
  describe("Daily Indicators (1D)", () => {
    for (const baseline of dailyBaselines) {
      const testName = `${baseline.indicator} (${baseline.id})`;
      
      it(testName, () => {
        // Check fixture availability
        const bars = getFixture(baseline.symbol, baseline.timeframe);
        if (!bars) {
          console.log(`⏭️  SKIPPED: ${testName} (no fixture for ${baseline.symbol} ${baseline.timeframe})`);
          return;
        }
        
        // Check baseline status
        if (!isBaselineReady(baseline)) {
          console.log(`⏭️  SKIPPED: ${testName} (baseline status: ${baseline.status})`);
          return;
        }
        
        // Compute indicator (returns full series for bar-aligned extraction)
        const result = computeForBaseline(bars, baseline);
        if (!result) {
          console.log(`⏭️  SKIPPED: ${testName} (compute not implemented)`);
          return;
        }
        
        // Compare each field in baseline values using bar-aligned assertion
        for (const expectedValue of baseline.values) {
          if (expectedValue.value === null) continue;
          
          // Determine which series to use
          const field = expectedValue.field;
          let series: LinePoint[];
          
          if (field && result.series[field]) {
            series = result.series[field];
          } else {
            // Use first available series if no field specified
            const firstKey = Object.keys(result.series)[0];
            series = result.series[firstKey];
          }
          
          // Bar-aligned comparison
          assertBarAlignedParity(bars, series, baseline, expectedValue, baseline.indicator);
        }
        
        // If we get here, all fields passed
        console.log(`✅ PASSED: ${testName}`);
      });
    }
  });
  
  describe("Intraday Indicators", () => {
    for (const baseline of intradayBaselines) {
      const testName = `${baseline.indicator} (${baseline.id})`;
      
      it(testName, () => {
        // Check fixture availability
        const bars = getFixture(baseline.symbol, baseline.timeframe);
        if (!bars) {
          console.log(`⏭️  SKIPPED: ${testName} (no fixture for ${baseline.symbol} ${baseline.timeframe})`);
          return;
        }
        
        // Check baseline status
        if (!isBaselineReady(baseline)) {
          console.log(`⏭️  SKIPPED: ${testName} (baseline status: ${baseline.status})`);
          return;
        }
        
        // Compute and compare using bar-aligned assertion
        const result = computeForBaseline(bars, baseline);
        if (!result) {
          console.log(`⏭️  SKIPPED: ${testName} (compute not implemented)`);
          return;
        }
        
        for (const expectedValue of baseline.values) {
          if (expectedValue.value === null) continue;
          
          const field = expectedValue.field;
          let series: LinePoint[];
          
          if (field && result.series[field]) {
            series = result.series[field];
          } else {
            const firstKey = Object.keys(result.series)[0];
            series = result.series[firstKey];
          }
          
          assertBarAlignedParity(bars, series, baseline, expectedValue, baseline.indicator);
        }
        
        console.log(`✅ PASSED: ${testName}`);
      });
    }
  });
});

// ============================================================================
// BASELINE STATUS REPORT
// ============================================================================

describe("TV Parity Baseline Status", () => {
  it("reports comprehensive baseline status", () => {
    // Filter out protocol objects (they have _comment or extractionProtocol but no id)
    const actualBaselines = baselines.filter(b => b.id !== undefined);
    
    const ready = actualBaselines.filter(b => b.status === "ready");
    const pending = actualBaselines.filter(b => b.status === "pending");
    const verified = actualBaselines.filter(b => b.verified);
    const withFixture = actualBaselines.filter(b => getFixture(b.symbol, b.timeframe) !== null);
    const missingFixture = actualBaselines.filter(b => getFixture(b.symbol, b.timeframe) === null);
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 TV PARITY BASELINE STATUS REPORT`);
    console.log(`${"=".repeat(60)}`);
    console.log(`\nTotal Baselines: ${actualBaselines.length}`);
    console.log(`  ✅ Ready:    ${ready.length}`);
    console.log(`  ⏳ Pending:  ${pending.length}`);
    console.log(`  ✓ Verified: ${verified.length}`);
    console.log(`\nFixture Coverage:`);
    console.log(`  📁 Have fixture: ${withFixture.length}`);
    console.log(`  ❌ Missing fixture: ${missingFixture.length}`);
    
    if (pending.length > 0) {
      console.log(`\n⚠️  PENDING BASELINES (need TV values):`);
      pending.forEach(b => {
        const hasFixture = getFixture(b.symbol, b.timeframe) ? "✓" : "❌";
        console.log(`   ${hasFixture} ${b.id}: ${b.indicator} on ${b.symbol}`);
      });
    }
    
    if (missingFixture.length > 0) {
      console.log(`\n❌ MISSING FIXTURES:`);
      const uniqueMissing = [...new Set(missingFixture.map(b => `${b.symbol}-${b.timeframe}`))];
      uniqueMissing.forEach(key => console.log(`   - ${key}`));
    }
    
    if (ready.length > 0) {
      console.log(`\n✅ READY BASELINES:`);
      ready.forEach(b => console.log(`   - ${b.id}: ${b.indicator}${b.verified ? " (verified)" : ""}`));
    }
    
    console.log(`\n${"=".repeat(60)}\n`);
    
    // Informational - always passes
    expect(true).toBe(true);
  });
});

// ============================================================================
// FEED ALIGNMENT PREFLIGHT (Run before extracting TV values)
// ============================================================================

describe("Feed Alignment Preflight", () => {
  it("displays expected OHLC for each target bar (compare to TV Data Window)", () => {
    // Extract protocol objects from baselines
    const protocols = tvBaselines.baselines.filter(
      (b: any) => b.extractionProtocol !== undefined
    );
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔍 FEED ALIGNMENT PREFLIGHT`);
    console.log(`${"=".repeat(60)}`);
    console.log(`\nBefore extracting TV indicator values, verify OHLC matches:\n`);
    
    for (const p of protocols) {
      const proto = (p as any).extractionProtocol;
      if (!proto?.expectedOHLC) continue;
      
      const ohlc = proto.expectedOHLC;
      console.log(`📊 ${proto.pack}: ${proto.symbol} ${proto.timeframe}`);
      console.log(`   Bar: ${proto.barHumanReadable || proto.barUtcIso}`);
      console.log(`   Expected OHLC from EODHD fixture:`);
      console.log(`     O: ${ohlc.open}`);
      console.log(`     H: ${ohlc.high}`);
      console.log(`     L: ${ohlc.low}`);
      console.log(`     C: ${ohlc.close}`);
      console.log(`     V: ${ohlc.volume}`);
      if (ohlc.feedValidation) {
        console.log(`   ⚠️  ${ohlc.feedValidation}`);
      }
      console.log("");
    }
    
    console.log(`${"=".repeat(60)}`);
    console.log(`\n📝 EXTRACTION STEPS:`);
    console.log(`1. Open TradingView chart for each symbol`);
    console.log(`2. Navigate to the exact bar (use Data Window, D key)`);
    console.log(`3. Compare TV OHLC to expected values above`);
    console.log(`4. If OHLC matches: extract indicator values`);
    console.log(`5. If OHLC mismatch > threshold: try different TV symbol`);
    console.log(`   - Equities: should match exactly (same exchange feed)`);
    console.log(`   - Crypto: try INDEX:BTCUSD or COINBASE:BTCUSD if BITSTAMP differs`);
    console.log(`   - Forex: try OANDA:EURUSD if FX:EURUSD differs`);
    console.log(`\n${"=".repeat(60)}\n`);
    
    expect(true).toBe(true);
  });
});

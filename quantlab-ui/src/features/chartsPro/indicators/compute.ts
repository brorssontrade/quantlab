/**
 * PRIO 3: Indicator Compute Functions
 * 
 * Pure compute functions for all indicators.
 * Each function takes normalized bars + inputs, returns output arrays.
 */

import type { UTCTimestamp } from "@/lib/lightweightCharts";

export interface ComputeBar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LinePoint {
  time: UTCTimestamp;
  value: number;
}

// ============================================================================
// Source Helpers
// ============================================================================

type SourceType = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4";

function getSource(bar: ComputeBar, source: SourceType): number {
  switch (source) {
    case "close": return bar.close;
    case "open": return bar.open;
    case "high": return bar.high;
    case "low": return bar.low;
    case "hl2": return (bar.high + bar.low) / 2;
    case "hlc3": return (bar.high + bar.low + bar.close) / 3;
    case "ohlc4": return (bar.open + bar.high + bar.low + bar.close) / 4;
    case "hlcc4": return (bar.high + bar.low + bar.close + bar.close) / 4;
    default: return bar.close;
  }
}

// ============================================================================
// Offset Shift Helper (for BB, Ichimoku, etc.)
// ============================================================================

/**
 * Shift a series by N bars (offset).
 * 
 * offset > 0: shift forward in time → need future timestamps
 * offset < 0: shift backward in time → early values become WhitespaceData
 * offset = 0: no change
 * 
 * Uses WhitespaceData ({ time }) for missing values.
 * For offset > 0, extrapolates future timestamps based on average bar spacing.
 * 
 * @param values - Array of LinePoint values
 * @param bars - OHLCV bars for time reference
 * @param offset - Number of bars to shift (positive = forward)
 * @returns Shifted values with same length, using WhitespaceData for gaps
 */
export function shiftSeriesByBars(
  values: LinePoint[],
  bars: ComputeBar[],
  offset: number
): Array<{ time: UTCTimestamp; value?: number }> {
  if (offset === 0 || values.length === 0 || bars.length === 0) {
    return values;
  }
  
  // Build time-indexed map of values
  const valueMap = new Map<number, number>();
  values.forEach(p => {
    if (Number.isFinite(p.value)) {
      valueMap.set(p.time as number, p.value);
    }
  });
  
  // Calculate average bar spacing for future time extrapolation
  let avgSpacing = 86400; // Default 1 day in seconds
  if (bars.length >= 2) {
    const totalSpan = (bars[bars.length - 1].time as number) - (bars[0].time as number);
    avgSpacing = totalSpan / (bars.length - 1);
  }
  
  // Build output array with shifted times
  const result: Array<{ time: UTCTimestamp; value?: number }> = [];
  
  if (offset > 0) {
    // Shift forward: need future timestamps
    // Create extended time array with extrapolated future times
    const times: number[] = bars.map(b => b.time as number);
    const lastTime = times[times.length - 1];
    for (let i = 1; i <= offset; i++) {
      times.push(lastTime + avgSpacing * i);
    }
    
    // For each output time, look back by offset to get value
    for (let i = 0; i < times.length; i++) {
      const outputTime = times[i] as UTCTimestamp;
      
      if (i < offset) {
        // Early bars get values from original data at position i
        const sourceTime = bars[i]?.time as number;
        const val = valueMap.get(sourceTime);
        if (val !== undefined) {
          result.push({ time: outputTime, value: val });
        } else {
          result.push({ time: outputTime });
        }
      } else {
        // Shifted position - get value from offset bars earlier
        const sourceIdx = i - offset;
        if (sourceIdx >= 0 && sourceIdx < bars.length) {
          const sourceTime = bars[sourceIdx].time as number;
          const val = valueMap.get(sourceTime);
          if (val !== undefined) {
            result.push({ time: outputTime, value: val });
          } else {
            result.push({ time: outputTime });
          }
        } else {
          result.push({ time: outputTime });
        }
      }
    }
  } else {
    // Shift backward: offset < 0
    const absOffset = Math.abs(offset);
    
    for (let i = 0; i < bars.length; i++) {
      const outputTime = bars[i].time;
      
      // Get value from offset bars ahead
      const sourceIdx = i + absOffset;
      if (sourceIdx < bars.length) {
        const sourceTime = bars[sourceIdx].time as number;
        const val = valueMap.get(sourceTime);
        if (val !== undefined) {
          result.push({ time: outputTime, value: val });
        } else {
          result.push({ time: outputTime });
        }
      } else {
        // Beyond data - WhitespaceData
        result.push({ time: outputTime });
      }
    }
  }
  
  return result;
}

// ============================================================================
// RMA - Wilder's Smoothing (Running Moving Average)
// Used by RSI, ATR, ADX for TradingView parity
// Formula: RMA = (prev * (period - 1) + current) / period
// ============================================================================

/**
 * Compute RMA (Wilder's Smoothing) on an array of numbers.
 * This is the foundation for RSI, ATR, and ADX calculations in TradingView.
 * @param values - Input values array
 * @param period - Smoothing period
 * @returns Smoothed values array
 */
export function computeRMAValues(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  
  const result: number[] = [];
  
  // First value: simple average of first N values
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let rma = sum / period;
  result.push(rma);
  
  // Subsequent values: Wilder's smoothing
  for (let i = period; i < values.length; i++) {
    rma = (rma * (period - 1) + values[i]) / period;
    result.push(rma);
  }
  
  return result;
}

// ============================================================================
// SMA - Simple Moving Average
// ============================================================================

export function computeSMA(
  data: ComputeBar[],
  period: number,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length < period) return result;
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += getSource(data[i], source);
  }
  result.push({ time: data[period - 1].time, value: sum / period });
  
  for (let i = period; i < data.length; i++) {
    sum = sum - getSource(data[i - period], source) + getSource(data[i], source);
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

// ============================================================================
// SMA Advanced - TV-style with offset, smoothing, and Bollinger Bands
// ============================================================================

/** Smoothing type for SMA (matches TradingView dropdown) */
export type SMASmoothingType = "none" | "sma" | "sma_bb" | "ema" | "smma" | "wma" | "vwma";

/** Result structure for advanced SMA computation */
export interface SMAResult {
  /** Main SMA line */
  sma: LinePoint[];
  /** Smoothing MA on SMA (when smoothingType != none) */
  smoothing: LinePoint[];
  /** BB Upper band (when smoothingType == sma_bb) */
  bbUpper: LinePoint[];
  /** BB Lower band (when smoothingType == sma_bb) */
  bbLower: LinePoint[];
}

/**
 * Compute SMA with TradingView-style features:
 * - Source selection (close, open, high, low, hl2, hlc3, ohlc4)
 * - Offset (shift series in time)
 * - Smoothing MA on SMA values (None, SMA, EMA, SMMA, WMA, VWMA, SMA+BB)
 * - Bollinger Bands on SMA when smoothingType = sma_bb
 * 
 * @param data - OHLCV bars
 * @param length - SMA period (default 9)
 * @param source - Price source (default close)
 * @param offset - Bar offset (positive = forward, negative = backward)
 * @param smoothingType - Type of smoothing MA
 * @param smoothingLength - Length for smoothing MA (default 14)
 * @param bbStdDev - BB standard deviation multiplier (default 2)
 */
export function computeSMAAdvanced(
  data: ComputeBar[],
  length: number = 9,
  source: SourceType = "close",
  offset: number = 0,
  smoothingType: SMASmoothingType = "none",
  smoothingLength: number = 14,
  bbStdDev: number = 2
): SMAResult {
  const sma: LinePoint[] = [];
  const smoothing: LinePoint[] = [];
  const bbUpper: LinePoint[] = [];
  const bbLower: LinePoint[] = [];
  
  if (length <= 0 || data.length === 0) {
    return { sma, smoothing, bbUpper, bbLower };
  }
  
  // ========================================================================
  // Step 1: Compute base SMA (full length with NaN warmup)
  // ========================================================================
  const smaRaw: number[] = [];
  let sum = 0;
  
  for (let i = 0; i < data.length; i++) {
    const srcVal = getSource(data[i], source);
    
    if (i < length - 1) {
      // Warmup period: accumulate but output NaN
      sum += srcVal;
      smaRaw.push(NaN);
    } else if (i === length - 1) {
      // First valid SMA value
      sum += srcVal;
      smaRaw.push(sum / length);
    } else {
      // Subsequent values: rolling sum
      sum = sum - getSource(data[i - length], source) + srcVal;
      smaRaw.push(sum / length);
    }
  }
  
  // Build LinePoint array for SMA
  for (let i = 0; i < data.length; i++) {
    sma.push({ time: data[i].time, value: smaRaw[i] });
  }
  
  // ========================================================================
  // Step 2: Compute Smoothing MA on SMA (if enabled)
  // ========================================================================
  if (smoothingType !== "none" && smoothingLength > 0) {
    const maType = smoothingType === "sma_bb" ? "sma" : smoothingType;
    
    for (let i = 0; i < data.length; i++) {
      const bar = data[i];
      
      // Need enough valid SMA values for smoothing MA
      // Count how many valid SMA values we have up to this point
      let validCount = 0;
      for (let j = Math.max(0, i - smoothingLength + 1); j <= i; j++) {
        if (Number.isFinite(smaRaw[j])) validCount++;
      }
      
      if (validCount < smoothingLength || i < length - 1 + smoothingLength - 1) {
        smoothing.push({ time: bar.time, value: NaN });
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
        continue;
      }
      
      // Get SMA values for smoothing window (most recent first)
      const smaWindow: number[] = [];
      for (let j = 0; j < smoothingLength; j++) {
        const idx = i - j;
        if (idx >= 0 && Number.isFinite(smaRaw[idx])) {
          smaWindow.push(smaRaw[idx]);
        }
      }
      
      if (smaWindow.length < smoothingLength) {
        smoothing.push({ time: bar.time, value: NaN });
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
        continue;
      }
      
      let maValue: number;
      
      switch (maType) {
        case "sma":
          maValue = smaWindow.reduce((a, b) => a + b, 0) / smoothingLength;
          break;
        case "ema": {
          const k = 2 / (smoothingLength + 1);
          const reversed = [...smaWindow].reverse();
          maValue = reversed[0];
          for (let w = 1; w < reversed.length; w++) {
            maValue = (reversed[w] - maValue) * k + maValue;
          }
          break;
        }
        case "smma": {
          const alpha = 1 / smoothingLength;
          const reversed = [...smaWindow].reverse();
          maValue = reversed.reduce((a, b) => a + b, 0) / smoothingLength;
          for (let w = 1; w < reversed.length; w++) {
            maValue = maValue * (1 - alpha) + reversed[w] * alpha;
          }
          break;
        }
        case "wma": {
          let weightSum = 0;
          let valueSum = 0;
          for (let w = 0; w < smoothingLength; w++) {
            const weight = smoothingLength - w;
            valueSum += smaWindow[w] * weight;
            weightSum += weight;
          }
          maValue = valueSum / weightSum;
          break;
        }
        case "vwma": {
          let sumPV = 0;
          let sumV = 0;
          for (let w = 0; w < smoothingLength; w++) {
            const volume = data[i - w].volume;
            sumPV += smaWindow[w] * volume;
            sumV += volume;
          }
          maValue = sumV === 0 ? smaWindow[0] : sumPV / sumV;
          break;
        }
        default:
          maValue = smaWindow.reduce((a, b) => a + b, 0) / smoothingLength;
      }
      
      smoothing.push({ time: bar.time, value: maValue });
      
      // BB on SMA if sma_bb mode
      if (smoothingType === "sma_bb") {
        const mean = smaWindow.reduce((a, b) => a + b, 0) / smoothingLength;
        const variance = smaWindow.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / smoothingLength;
        const stdDev = Math.sqrt(variance);
        
        bbUpper.push({ time: bar.time, value: maValue + bbStdDev * stdDev });
        bbLower.push({ time: bar.time, value: maValue - bbStdDev * stdDev });
      } else {
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
      }
    }
  }
  
  // ========================================================================
  // Step 3: Apply offset if != 0
  // ========================================================================
  if (offset !== 0) {
    const shiftedSma = shiftSeriesByBars(sma, data, offset);
    const shiftedSmoothing = smoothingType !== "none" ? shiftSeriesByBars(smoothing, data, offset) : [];
    const shiftedBBUpper = smoothingType === "sma_bb" ? shiftSeriesByBars(bbUpper, data, offset) : [];
    const shiftedBBLower = smoothingType === "sma_bb" ? shiftSeriesByBars(bbLower, data, offset) : [];
    
    return {
      sma: shiftedSma.map(p => ({ time: p.time, value: p.value ?? NaN })),
      smoothing: shiftedSmoothing.map(p => ({ time: p.time, value: p.value ?? NaN })),
      bbUpper: shiftedBBUpper.map(p => ({ time: p.time, value: p.value ?? NaN })),
      bbLower: shiftedBBLower.map(p => ({ time: p.time, value: p.value ?? NaN })),
    };
  }
  
  return { sma, smoothing, bbUpper, bbLower };
}

// ============================================================================
// EMA - Exponential Moving Average
// ============================================================================

export function computeEMA(
  data: ComputeBar[],
  period: number,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length === 0) return result;
  
  const multiplier = 2 / (period + 1);
  let ema = getSource(data[0], source);
  result.push({ time: data[0].time, value: ema });
  
  for (let i = 1; i < data.length; i++) {
    const price = getSource(data[i], source);
    ema = (price - ema) * multiplier + ema;
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

/** EMA from pre-computed values (for chained indicators) */
export function emaFromValues(values: LinePoint[], period: number): LinePoint[] {
  if (period <= 0 || values.length === 0) return [];
  const result: LinePoint[] = [];
  const multiplier = 2 / (period + 1);
  let ema = values[0].value;
  result.push({ time: values[0].time, value: ema });
  for (let i = 1; i < values.length; i++) {
    ema = (values[i].value - ema) * multiplier + ema;
    result.push({ time: values[i].time, value: ema });
  }
  return result;
}

// ============================================================================
// EMA Advanced - TV-style with offset, smoothing, and Bollinger Bands
// ============================================================================

/** Smoothing type for EMA (matches TradingView dropdown) */
export type EMASmoothingType = "none" | "sma" | "sma_bb" | "ema" | "smma" | "wma" | "vwma";

/** Result structure for advanced EMA computation */
export interface EMAResult {
  /** Main EMA line */
  ema: LinePoint[];
  /** Smoothing MA on EMA (when smoothingType != none) */
  smoothing: LinePoint[];
  /** BB Upper band (when smoothingType == sma_bb) */
  bbUpper: LinePoint[];
  /** BB Lower band (when smoothingType == sma_bb) */
  bbLower: LinePoint[];
}

/**
 * Compute EMA with TradingView-style features:
 * - Source selection (close, open, high, low, hl2, hlc3, ohlc4)
 * - Offset (shift series in time)
 * - Smoothing MA on EMA values (None, SMA, EMA, SMMA, WMA, VWMA, SMA+BB)
 * - Bollinger Bands on EMA when smoothingType = sma_bb
 * 
 * @param data - OHLCV bars
 * @param length - EMA period (default 9)
 * @param source - Price source (default close)
 * @param offset - Bar offset (positive = forward, negative = backward)
 * @param smoothingType - Type of smoothing MA
 * @param smoothingLength - Length for smoothing MA (default 14)
 * @param bbStdDev - BB standard deviation multiplier (default 2)
 */
export function computeEMAAdvanced(
  data: ComputeBar[],
  length: number = 9,
  source: SourceType = "close",
  offset: number = 0,
  smoothingType: EMASmoothingType = "none",
  smoothingLength: number = 14,
  bbStdDev: number = 2
): EMAResult {
  const ema: LinePoint[] = [];
  const smoothing: LinePoint[] = [];
  const bbUpper: LinePoint[] = [];
  const bbLower: LinePoint[] = [];
  
  if (length <= 0 || data.length === 0) {
    return { ema, smoothing, bbUpper, bbLower };
  }
  
  // ========================================================================
  // Step 1: Compute base EMA
  // ========================================================================
  const multiplier = 2 / (length + 1);
  let currentEma = getSource(data[0], source);
  const emaRaw: number[] = [currentEma];
  
  for (let i = 1; i < data.length; i++) {
    const price = getSource(data[i], source);
    currentEma = (price - currentEma) * multiplier + currentEma;
    emaRaw.push(currentEma);
  }
  
  // Build LinePoint array for EMA (full length from bar 0)
  for (let i = 0; i < data.length; i++) {
    ema.push({ time: data[i].time, value: emaRaw[i] });
  }
  
  // ========================================================================
  // Step 2: Compute Smoothing MA on EMA (if enabled)
  // ========================================================================
  if (smoothingType !== "none" && smoothingLength > 0) {
    const maType = smoothingType === "sma_bb" ? "sma" : smoothingType;
    
    for (let i = 0; i < data.length; i++) {
      const bar = data[i];
      
      // Need enough EMA values for smoothing MA
      if (i < smoothingLength - 1) {
        smoothing.push({ time: bar.time, value: NaN });
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
        continue;
      }
      
      // Get EMA values for smoothing window (most recent first)
      const emaWindow: number[] = [];
      for (let j = 0; j < smoothingLength; j++) {
        emaWindow.push(emaRaw[i - j]);
      }
      
      let maValue: number;
      
      switch (maType) {
        case "sma":
          maValue = emaWindow.reduce((a, b) => a + b, 0) / smoothingLength;
          break;
        case "ema": {
          // EMA on EMA values - use proper recursive EMA
          const k = 2 / (smoothingLength + 1);
          // For proper EMA, we need to accumulate from oldest to newest
          const reversed = [...emaWindow].reverse();
          maValue = reversed[0];
          for (let w = 1; w < reversed.length; w++) {
            maValue = (reversed[w] - maValue) * k + maValue;
          }
          break;
        }
        case "smma": {
          // SMMA (RMA) - Wilder's smoothing
          const alpha = 1 / smoothingLength;
          const reversed = [...emaWindow].reverse();
          // First value: SMA
          maValue = reversed.reduce((a, b) => a + b, 0) / smoothingLength;
          // Then apply Wilder's smoothing
          for (let w = 1; w < reversed.length; w++) {
            maValue = maValue * (1 - alpha) + reversed[w] * alpha;
          }
          break;
        }
        case "wma": {
          // Weighted MA - most recent has highest weight
          let weightSum = 0;
          let valueSum = 0;
          for (let w = 0; w < smoothingLength; w++) {
            const weight = smoothingLength - w;
            valueSum += emaWindow[w] * weight;
            weightSum += weight;
          }
          maValue = valueSum / weightSum;
          break;
        }
        case "vwma": {
          // VWMA - volume weighted MA of EMA values
          let sumPV = 0;
          let sumV = 0;
          for (let w = 0; w < smoothingLength; w++) {
            const volume = data[i - w].volume;
            sumPV += emaWindow[w] * volume;
            sumV += volume;
          }
          maValue = sumV === 0 ? emaWindow[0] : sumPV / sumV;
          break;
        }
        default:
          maValue = emaWindow.reduce((a, b) => a + b, 0) / smoothingLength;
      }
      
      smoothing.push({ time: bar.time, value: maValue });
      
      // BB on EMA if sma_bb mode
      if (smoothingType === "sma_bb") {
        // Standard deviation of EMA values
        const mean = emaWindow.reduce((a, b) => a + b, 0) / smoothingLength;
        const variance = emaWindow.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / smoothingLength;
        const stdDev = Math.sqrt(variance);
        
        bbUpper.push({ time: bar.time, value: maValue + bbStdDev * stdDev });
        bbLower.push({ time: bar.time, value: maValue - bbStdDev * stdDev });
      } else {
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
      }
    }
  }
  
  // ========================================================================
  // Step 3: Apply offset if != 0
  // ========================================================================
  if (offset !== 0) {
    const shiftedEma = shiftSeriesByBars(ema, data, offset);
    const shiftedSmoothing = smoothingType !== "none" ? shiftSeriesByBars(smoothing, data, offset) : [];
    const shiftedBBUpper = smoothingType === "sma_bb" ? shiftSeriesByBars(bbUpper, data, offset) : [];
    const shiftedBBLower = smoothingType === "sma_bb" ? shiftSeriesByBars(bbLower, data, offset) : [];
    
    // Replace arrays with shifted versions
    return {
      ema: shiftedEma.map(p => ({ time: p.time, value: p.value ?? NaN })),
      smoothing: shiftedSmoothing.map(p => ({ time: p.time, value: p.value ?? NaN })),
      bbUpper: shiftedBBUpper.map(p => ({ time: p.time, value: p.value ?? NaN })),
      bbLower: shiftedBBLower.map(p => ({ time: p.time, value: p.value ?? NaN })),
    };
  }
  
  return { ema, smoothing, bbUpper, bbLower };
}

// ============================================================================
// SMMA - Smoothed Moving Average (Wilder's Smoothing / RMA)
// ============================================================================

export function computeSMMA(
  data: ComputeBar[],
  period: number,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length < period) return result;
  
  // First value: SMA of first N bars
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += getSource(data[i], source);
  }
  let smma = sum / period;
  result.push({ time: data[period - 1].time, value: smma });
  
  // Subsequent values: Wilder's smoothing
  for (let i = period; i < data.length; i++) {
    smma = (smma * (period - 1) + getSource(data[i], source)) / period;
    result.push({ time: data[i].time, value: smma });
  }
  return result;
}

// ============================================================================
// WMA - Weighted Moving Average
// ============================================================================

export function computeWMA(
  data: ComputeBar[],
  period: number,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length < period) return result;
  
  // Weight divisor: 1 + 2 + 3 + ... + period = period * (period + 1) / 2
  const divisor = (period * (period + 1)) / 2;
  
  for (let i = period - 1; i < data.length; i++) {
    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      // Weight: 1 for oldest, period for newest
      weightedSum += getSource(data[i - period + 1 + j], source) * (j + 1);
    }
    result.push({ time: data[i].time, value: weightedSum / divisor });
  }
  return result;
}

// ============================================================================
// DEMA - Double Exponential Moving Average
// ============================================================================

export function computeDEMA(
  data: ComputeBar[],
  period: number,
  source: SourceType = "close"
): LinePoint[] {
  if (period <= 0 || data.length === 0) return [];
  
  const ema1 = computeEMA(data, period, source);
  const ema2 = emaFromValues(ema1, period);
  
  // Build map for ema2 lookup
  const ema2Map = new Map<number, number>();
  ema2.forEach(p => ema2Map.set(p.time as number, p.value));
  
  // DEMA = 2 * EMA - EMA(EMA)
  const result: LinePoint[] = [];
  ema1.forEach(p => {
    const e2 = ema2Map.get(p.time as number);
    if (e2 !== undefined) {
      result.push({ time: p.time, value: 2 * p.value - e2 });
    }
  });
  
  return result;
}

// ============================================================================
// TEMA - Triple Exponential Moving Average
// ============================================================================

export function computeTEMA(
  data: ComputeBar[],
  period: number,
  source: SourceType = "close"
): LinePoint[] {
  if (period <= 0 || data.length === 0) return [];
  
  const ema1 = computeEMA(data, period, source);
  const ema2 = emaFromValues(ema1, period);
  const ema3 = emaFromValues(ema2, period);
  
  // Build maps for lookup
  const ema2Map = new Map<number, number>();
  const ema3Map = new Map<number, number>();
  ema2.forEach(p => ema2Map.set(p.time as number, p.value));
  ema3.forEach(p => ema3Map.set(p.time as number, p.value));
  
  // TEMA = 3 * EMA - 3 * EMA(EMA) + EMA(EMA(EMA))
  const result: LinePoint[] = [];
  ema1.forEach(p => {
    const e2 = ema2Map.get(p.time as number);
    const e3 = ema3Map.get(p.time as number);
    if (e2 !== undefined && e3 !== undefined) {
      result.push({ time: p.time, value: 3 * p.value - 3 * e2 + e3 });
    }
  });
  
  return result;
}

// ============================================================================
// HMA - Hull Moving Average
// ============================================================================

export function computeHMA(
  data: ComputeBar[],
  period: number,
  source: SourceType = "close"
): LinePoint[] {
  if (period <= 0 || data.length < period) return [];
  
  const halfPeriod = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(period)));
  
  const wmaHalf = computeWMA(data, halfPeriod, source);
  const wmaFull = computeWMA(data, period, source);
  
  // Build map for wmaFull lookup
  const wmaFullMap = new Map<number, number>();
  wmaFull.forEach(p => wmaFullMap.set(p.time as number, p.value));
  
  // Calculate 2 * WMA(half) - WMA(full)
  const rawHull: LinePoint[] = [];
  wmaHalf.forEach(p => {
    const full = wmaFullMap.get(p.time as number);
    if (full !== undefined) {
      rawHull.push({ time: p.time, value: 2 * p.value - full });
    }
  });
  
  // Final WMA of the raw values
  if (rawHull.length < sqrtPeriod) return [];
  
  // Apply WMA to rawHull values
  const divisor = (sqrtPeriod * (sqrtPeriod + 1)) / 2;
  const result: LinePoint[] = [];
  
  for (let i = sqrtPeriod - 1; i < rawHull.length; i++) {
    let weightedSum = 0;
    for (let j = 0; j < sqrtPeriod; j++) {
      weightedSum += rawHull[i - sqrtPeriod + 1 + j].value * (j + 1);
    }
    result.push({ time: rawHull[i].time, value: weightedSum / divisor });
  }
  
  return result;
}

// ============================================================================
// KAMA - Kaufman Adaptive Moving Average
// ============================================================================

export function computeKAMA(
  data: ComputeBar[],
  period: number = 10,
  fastPeriod: number = 2,
  slowPeriod: number = 30,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length <= period) return result;
  
  const fastSC = 2 / (fastPeriod + 1);
  const slowSC = 2 / (slowPeriod + 1);
  
  // Start KAMA with first valid value
  let kama = getSource(data[period], source);
  result.push({ time: data[period].time, value: kama });
  
  for (let i = period + 1; i < data.length; i++) {
    // Change = absolute price change over period
    const change = Math.abs(getSource(data[i], source) - getSource(data[i - period], source));
    
    // Volatility = sum of absolute changes
    let volatility = 0;
    for (let j = 0; j < period; j++) {
      volatility += Math.abs(getSource(data[i - j], source) - getSource(data[i - j - 1], source));
    }
    
    // Efficiency Ratio (0 to 1)
    const er = volatility === 0 ? 0 : change / volatility;
    
    // Smoothing Constant
    const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
    
    // KAMA
    const price = getSource(data[i], source);
    kama = kama + sc * (price - kama);
    result.push({ time: data[i].time, value: kama });
  }
  
  return result;
}

// ============================================================================
// VWMA - Volume Weighted Moving Average
// ============================================================================

export function computeVWMA(
  data: ComputeBar[],
  period: number,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length < period) return result;
  
  for (let i = period - 1; i < data.length; i++) {
    let sumPV = 0; // Price * Volume
    let sumV = 0;  // Volume
    
    for (let j = 0; j < period; j++) {
      const price = getSource(data[i - j], source);
      const volume = data[i - j].volume;
      sumPV += price * volume;
      sumV += volume;
    }
    
    const vwma = sumV === 0 ? getSource(data[i], source) : sumPV / sumV;
    result.push({ time: data[i].time, value: vwma });
  }
  
  return result;
}

// ============================================================================
// McGinley Dynamic
// ============================================================================

/**
 * McGinley Dynamic - self-adjusting moving average
 * Formula: MD[i] = MD[i-1] + (Price - MD[i-1]) / (N * (Price / MD[i-1])^4)
 * 
 * Guards against NaN:
 * - Seed with first valid price
 * - Guard division by zero (md === 0)
 * - Guard non-finite ratio/result
 * - Never output NaN values
 */
export function computeMcGinley(
  data: ComputeBar[],
  period: number = 14,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length === 0) return result;
  
  // Find first valid (finite, positive) price for seeding
  let startIdx = 0;
  let md = 0;
  for (let i = 0; i < data.length; i++) {
    const price = getSource(data[i], source);
    if (Number.isFinite(price) && price > 0) {
      md = price;
      startIdx = i;
      break;
    }
  }
  
  // If no valid seed found, return empty
  if (md === 0) return result;
  
  // Push seed value
  result.push({ time: data[startIdx].time, value: md });
  
  // Compute subsequent values with guards
  for (let i = startIdx + 1; i < data.length; i++) {
    const price = getSource(data[i], source);
    
    // Skip invalid prices
    if (!Number.isFinite(price) || price <= 0) {
      // Carry forward previous MD value
      result.push({ time: data[i].time, value: md });
      continue;
    }
    
    // Guard: if md is zero or non-finite, reset to current price
    if (!Number.isFinite(md) || md <= 0) {
      md = price;
      result.push({ time: data[i].time, value: md });
      continue;
    }
    
    // McGinley Dynamic formula with guards
    const ratio = price / md;
    
    // Guard: ratio must be positive and finite
    const safeRatio = (Number.isFinite(ratio) && ratio > 0) ? ratio : 1;
    
    // Compute: MD = MD + (Price - MD) / (N * ratio^4)
    const divisor = period * Math.pow(safeRatio, 4);
    
    // Guard: divisor must be positive and finite
    if (!Number.isFinite(divisor) || divisor <= 0) {
      // Fallback: just use previous MD
      result.push({ time: data[i].time, value: md });
      continue;
    }
    
    const nextMd = md + (price - md) / divisor;
    
    // Guard: result must be finite
    md = Number.isFinite(nextMd) ? nextMd : md;
    result.push({ time: data[i].time, value: md });
  }
  
  return result;
}

// ============================================================================
// ALMA - Arnaud Legoux Moving Average
// ============================================================================

/**
 * ALMA - Gaussian-weighted moving average with adjustable offset and sigma
 * 
 * Formula:
 *   m = floor(offset * (period - 1))
 *   s = period / sigma
 *   w[j] = exp(-((j - m)^2) / (2 * s^2))
 *   ALMA[i] = Σ(w[j] * price[i-period+1+j]) / Σ(w[j])
 * 
 * TradingView defaults: period=9, offset=0.85, sigma=6
 */
export function computeALMA(
  data: ComputeBar[],
  period: number = 9,
  offset: number = 0.85,
  sigma: number = 6,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length < period) return result;
  
  // Precompute Gaussian weights once for efficiency
  const m = Math.floor(offset * (period - 1));
  const s = period / sigma;
  const weights: number[] = [];
  let weightSum = 0;
  
  for (let j = 0; j < period; j++) {
    const w = Math.exp(-((j - m) ** 2) / (2 * s * s));
    weights.push(w);
    weightSum += w;
  }
  
  // Normalize weights
  for (let j = 0; j < period; j++) {
    weights[j] /= weightSum;
  }
  
  // Compute ALMA for each bar starting at period-1
  for (let i = period - 1; i < data.length; i++) {
    let alma = 0;
    for (let j = 0; j < period; j++) {
      const price = getSource(data[i - period + 1 + j], source);
      alma += weights[j] * price;
    }
    
    // Guard: ensure finite output
    if (Number.isFinite(alma)) {
      result.push({ time: data[i].time, value: alma });
    }
  }
  
  return result;
}

// ============================================================================
// LSMA - Least Squares Moving Average
// ============================================================================

/**
 * Least Squares Moving Average (Linear Regression Line)
 * Fits a linear regression to a rolling window and returns the endpoint value.
 * 
 * Formula:
 *   x = 0, 1, 2, ..., n-1 (bar indices in window)
 *   y = price values
 *   slope = (n * Σ(xy) - Σx * Σy) / (n * Σ(x²) - (Σx)²)
 *   intercept = (Σy - slope * Σx) / n
 *   LSMA = intercept + slope * (n - 1)  // value at last x in window
 * 
 * TradingView defaults: length=25, offset=0, source=close
 * Offset shifts the output forward/backward (0 = no shift)
 */
export function computeLSMA(
  data: ComputeBar[],
  length: number = 25,
  offset: number = 0,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  const n = length;
  
  if (n < 2 || data.length < n) return result;
  
  // Precompute constants for x = 0, 1, ..., n-1
  // Σx = n*(n-1)/2
  // Σx² = n*(n-1)*(2n-1)/6
  const sumX = (n * (n - 1)) / 2;
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const denom = n * sumX2 - sumX * sumX;
  
  // Guard: avoid division by zero (only happens if n=1, already guarded)
  if (denom === 0) return result;
  
  // Compute LSMA for each bar starting at n-1
  for (let i = n - 1; i < data.length; i++) {
    let sumY = 0;
    let sumXY = 0;
    
    // Window: data[i-n+1] ... data[i]
    for (let j = 0; j < n; j++) {
      const price = getSource(data[i - n + 1 + j], source);
      sumY += price;
      sumXY += j * price;
    }
    
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const lsma = intercept + slope * (n - 1);
    
    // Apply offset: shift output index
    // Offset > 0 shifts right (future), offset < 0 shifts left (past)
    const outputIdx = i + offset;
    
    // Guard: ensure finite output and valid index
    if (Number.isFinite(lsma) && outputIdx >= 0 && outputIdx < data.length) {
      result.push({ time: data[outputIdx].time, value: lsma });
    } else if (Number.isFinite(lsma) && offset === 0) {
      // No offset, output at current bar
      result.push({ time: data[i].time, value: lsma });
    }
  }
  
  return result;
}

// ============================================================================
// RSI - Relative Strength Index (TradingView Parity)
// ============================================================================

/** RSI Smoothing types (for RSI-based MA) */
export type RSISmoothingType = "sma" | "ema" | "rma" | "wma" | "vwma";

export interface RSIResult {
  rsi: LinePoint[];
  rsiMa: LinePoint[];
  /** Constant line at upper band value (e.g., 70) */
  upperBand: LinePoint[];
  /** Constant line at middle band value (e.g., 50) */
  middleBand: LinePoint[];
  /** Constant line at lower band value (e.g., 30) */
  lowerBand: LinePoint[];
}

/**
 * Compute RSI with TradingView parity
 * 
 * Features:
 * - Source selection (close, open, high, low, hl2, hlc3, ohlc4)
 * - RSI-based MA (smoothing) with multiple MA types
 * - Band lines as constant values across all bars
 * - Full-length output with NaN for warmup period
 * 
 * @param data - OHLCV bars
 * @param period - RSI period (default 14)
 * @param source - Price source (default "close")
 * @param smoothingType - MA type for RSI smoothing (default "sma")
 * @param smoothingLength - Smoothing period (default 14)
 * @param upperBandValue - Overbought level (default 70)
 * @param middleBandValue - Middle level (default 50)
 * @param lowerBandValue - Oversold level (default 30)
 */
export function computeRSI(
  data: ComputeBar[],
  period: number = 14,
  source: SourceType = "close",
  smoothingType: RSISmoothingType = "sma",
  smoothingLength: number = 14,
  upperBandValue: number = 70,
  middleBandValue: number = 50,
  lowerBandValue: number = 30
): RSIResult {
  const rsi: LinePoint[] = [];
  const rsiMa: LinePoint[] = [];
  const upperBand: LinePoint[] = [];
  const middleBand: LinePoint[] = [];
  const lowerBand: LinePoint[] = [];
  
  if (period <= 0 || data.length === 0) {
    return { rsi, rsiMa, upperBand, middleBand, lowerBand };
  }
  
  // Calculate RSI with full-length output (NaN for warmup)
  const rsiValues: (number | null)[] = new Array(data.length).fill(null);
  
  if (data.length > period) {
    let avgGain = 0;
    let avgLoss = 0;
    
    // First period: simple average of gains/losses
    for (let i = 1; i <= period; i++) {
      const change = getSource(data[i], source) - getSource(data[i - 1], source);
      if (change >= 0) avgGain += change;
      else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;
    
    // First RSI value
    const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues[period] = 100 - 100 / (1 + firstRS);
    
    // Subsequent values using Wilder's smoothing (RMA)
    for (let i = period + 1; i < data.length; i++) {
      const change = getSource(data[i], source) - getSource(data[i - 1], source);
      if (change >= 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - change) / period;
      }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsiValues[i] = 100 - 100 / (1 + rs);
    }
  }
  
  // Build output arrays (NaN values will be converted to WhitespaceData in registry)
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    const rsiVal = rsiValues[i];
    
    // RSI line
    if (rsiVal !== null) {
      rsi.push({ time, value: rsiVal });
    } else {
      // NaN placeholder - will be converted to WhitespaceData
      rsi.push({ time, value: NaN });
    }
    
    // Band lines (constant values for all bars)
    upperBand.push({ time, value: upperBandValue });
    middleBand.push({ time, value: middleBandValue });
    lowerBand.push({ time, value: lowerBandValue });
  }
  
  // Calculate RSI-based MA (smoothing)
  // Only calculate over valid RSI values
  const validRsiPoints = rsi.filter(p => Number.isFinite(p.value));
  
  if (validRsiPoints.length >= smoothingLength) {
    let maValues: LinePoint[] = [];
    
    switch (smoothingType) {
      case "ema": {
        const multiplier = 2 / (smoothingLength + 1);
        let ema = validRsiPoints[0].value;
        maValues.push({ time: validRsiPoints[0].time, value: ema });
        for (let i = 1; i < validRsiPoints.length; i++) {
          ema = (validRsiPoints[i].value - ema) * multiplier + ema;
          maValues.push({ time: validRsiPoints[i].time, value: ema });
        }
        break;
      }
      case "rma": {
        // Wilder's smoothing (RMA)
        let sum = 0;
        for (let i = 0; i < smoothingLength && i < validRsiPoints.length; i++) {
          sum += validRsiPoints[i].value;
        }
        let rma = sum / Math.min(smoothingLength, validRsiPoints.length);
        if (validRsiPoints.length >= smoothingLength) {
          maValues.push({ time: validRsiPoints[smoothingLength - 1].time, value: rma });
        }
        for (let i = smoothingLength; i < validRsiPoints.length; i++) {
          rma = (rma * (smoothingLength - 1) + validRsiPoints[i].value) / smoothingLength;
          maValues.push({ time: validRsiPoints[i].time, value: rma });
        }
        break;
      }
      case "wma": {
        const divisor = (smoothingLength * (smoothingLength + 1)) / 2;
        for (let i = smoothingLength - 1; i < validRsiPoints.length; i++) {
          let weightedSum = 0;
          for (let j = 0; j < smoothingLength; j++) {
            weightedSum += validRsiPoints[i - smoothingLength + 1 + j].value * (j + 1);
          }
          maValues.push({ time: validRsiPoints[i].time, value: weightedSum / divisor });
        }
        break;
      }
      case "sma":
      default: {
        let sum = 0;
        for (let i = 0; i < smoothingLength && i < validRsiPoints.length; i++) {
          sum += validRsiPoints[i].value;
        }
        if (validRsiPoints.length >= smoothingLength) {
          maValues.push({ time: validRsiPoints[smoothingLength - 1].time, value: sum / smoothingLength });
        }
        for (let i = smoothingLength; i < validRsiPoints.length; i++) {
          sum = sum - validRsiPoints[i - smoothingLength].value + validRsiPoints[i].value;
          maValues.push({ time: validRsiPoints[i].time, value: sum / smoothingLength });
        }
        break;
      }
    }
    
    // Build full-length RSI MA array with NaN placeholders
    const maMap = new Map<number, number>();
    maValues.forEach(p => maMap.set(p.time as number, p.value));
    
    for (let i = 0; i < data.length; i++) {
      const time = data[i].time;
      const maVal = maMap.get(time as number);
      if (maVal !== undefined) {
        rsiMa.push({ time, value: maVal });
      } else {
        rsiMa.push({ time, value: NaN });
      }
    }
  } else {
    // Not enough data for MA - fill with NaN
    for (let i = 0; i < data.length; i++) {
      rsiMa.push({ time: data[i].time, value: NaN });
    }
  }
  
  return { rsi, rsiMa, upperBand, middleBand, lowerBand };
}

// ============================================================================
// MACD - Moving Average Convergence Divergence
// ============================================================================

/** SMA from pre-computed values (for chained indicators like MACD) */
function smaFromValues(values: LinePoint[], period: number): LinePoint[] {
  if (period <= 0 || values.length < period) return [];
  const result: LinePoint[] = [];
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i].value;
  }
  result.push({ time: values[period - 1].time, value: sum / period });
  
  for (let i = period; i < values.length; i++) {
    sum = sum - values[i - period].value + values[i].value;
    result.push({ time: values[i].time, value: sum / period });
  }
  return result;
}

export type MAType = "ema" | "sma";

export interface HistogramPoint {
  time: UTCTimestamp;
  value: number;
  color: string;
}

export interface MACDResult {
  macd: LinePoint[];
  signal: LinePoint[];
  histogram: HistogramPoint[];
}

// TradingView MACD histogram colors (4-color scheme)
const MACD_HIST_COLORS = {
  // Positive & rising (above zero, higher than previous)
  bullStrong: "#26A69A",   // Strong teal/green
  // Positive & falling (above zero, lower than previous)  
  bullWeak: "#B2DFDB",     // Light teal
  // Negative & rising (below zero, higher than previous - recovering)
  bearWeak: "#FFCDD2",     // Light red/pink
  // Negative & falling (below zero, lower than previous)
  bearStrong: "#EF5350",   // Strong red
};

/**
 * Compute MACD with TradingView parity
 * 
 * @param data - OHLCV bars
 * @param fast - Fast MA period (default 12)
 * @param slow - Slow MA period (default 26)
 * @param signalPeriod - Signal line period (default 9)
 * @param source - Price source (default "close")
 * @param oscMAType - MA type for oscillator (default "ema")
 * @param signalMAType - MA type for signal line (default "ema")
 * @param histColors - Custom histogram colors (optional)
 */
export function computeMACD(
  data: ComputeBar[],
  fast: number,
  slow: number,
  signalPeriod: number,
  source: SourceType = "close",
  oscMAType: MAType = "ema",
  signalMAType: MAType = "ema",
  histColors?: { bullStrong: string; bullWeak: string; bearWeak: string; bearStrong: string }
): MACDResult {
  const colors = histColors ?? MACD_HIST_COLORS;
  
  // Compute fast and slow MAs based on type
  let fastMA: LinePoint[];
  let slowMA: LinePoint[];
  
  if (oscMAType === "sma") {
    fastMA = computeSMA(data, fast, source);
    slowMA = computeSMA(data, slow, source);
  } else {
    fastMA = computeEMA(data, fast, source);
    slowMA = computeEMA(data, slow, source);
  }
  
  // Build MACD line (fast - slow)
  const slowMap = new Map<number, number>();
  slowMA.forEach(p => slowMap.set(p.time as number, p.value));
  
  const macdLine: LinePoint[] = [];
  fastMA.forEach(p => {
    const slowVal = slowMap.get(p.time as number);
    if (slowVal !== undefined) {
      macdLine.push({ time: p.time, value: p.value - slowVal });
    }
  });
  
  // Signal line (MA of MACD based on signalMAType)
  const signalLine = signalMAType === "sma" 
    ? smaFromValues(macdLine, signalPeriod)
    : emaFromValues(macdLine, signalPeriod);
  
  // Histogram (MACD - Signal) with 4-color scheme
  const signalMap = new Map<number, number>();
  signalLine.forEach(p => signalMap.set(p.time as number, p.value));
  
  const histogram: HistogramPoint[] = [];
  let prevHist: number | null = null;
  
  macdLine.forEach(p => {
    const sigVal = signalMap.get(p.time as number);
    if (sigVal !== undefined) {
      const hist = p.value - sigVal;
      
      // Determine color based on TV rules:
      // hist >= 0 && hist >= prevHist → bullStrong (positive & rising)
      // hist >= 0 && hist < prevHist  → bullWeak (positive & falling)
      // hist < 0 && hist >= prevHist  → bearWeak (negative & rising/recovering)
      // hist < 0 && hist < prevHist   → bearStrong (negative & falling)
      let color: string;
      if (hist >= 0) {
        color = (prevHist === null || hist >= prevHist) ? colors.bullStrong : colors.bullWeak;
      } else {
        color = (prevHist === null || hist >= prevHist) ? colors.bearWeak : colors.bearStrong;
      }
      
      histogram.push({ time: p.time, value: hist, color });
      prevHist = hist;
    }
  });
  
  return { macd: macdLine, signal: signalLine, histogram };
}

// ============================================================================
// Awesome Oscillator (TradingView Parity)
// ============================================================================

export interface AOResult {
  histogram: HistogramPoint[];
}

// TradingView AO colors (2-color scheme based on rising/falling)
const AO_COLORS = {
  growing: "#089981",  // TV green (AO rising)
  falling: "#F23645",  // TV red (AO falling)
};

/**
 * Compute Awesome Oscillator with TradingView parity
 * 
 * AO = SMA(HL2, 5) - SMA(HL2, 34)
 * Color: green if AO[i] > AO[i-1] (growing), red if falling
 * 
 * @param data - OHLCV bars
 * @param fastLength - Fast SMA period (default 5)
 * @param slowLength - Slow SMA period (default 34)
 * @param colors - Custom colors (optional)
 */
export function computeAO(
  data: ComputeBar[],
  fastLength: number = 5,
  slowLength: number = 34,
  colors?: { growing: string; falling: string }
): AOResult {
  const aoColors = colors ?? AO_COLORS;
  
  // Compute SMA on HL2 (median price)
  const fastSMA = computeSMA(data, fastLength, "hl2");
  const slowSMA = computeSMA(data, slowLength, "hl2");
  
  // Build slow SMA lookup map
  const slowMap = new Map<number, number>();
  slowSMA.forEach(p => slowMap.set(p.time as number, p.value));
  
  // Calculate AO = fast - slow
  const histogram: HistogramPoint[] = [];
  let prevAO: number | null = null;
  
  fastSMA.forEach(p => {
    const slowVal = slowMap.get(p.time as number);
    if (slowVal !== undefined) {
      const ao = p.value - slowVal;
      
      // Color based on rising/falling (not above/below zero)
      // Green if AO is rising (current > previous), red if falling
      const color = (prevAO === null || ao >= prevAO) 
        ? aoColors.growing 
        : aoColors.falling;
      
      histogram.push({ time: p.time, value: ao, color });
      prevAO = ao;
    }
  });
  
  return { histogram };
}

// ============================================================================
// Bollinger Bands (TradingView Parity)
// ============================================================================

export interface BollingerResult {
  upper: LinePoint[];
  middle: LinePoint[];
  lower: LinePoint[];
}

/** Bollinger Bands MA types matching TradingView */
export type BBMaType = "sma" | "ema" | "smma" | "wma" | "vwma";

/**
 * Generic MA helper for BB basis calculation
 * Returns values array (numbers) for source data
 */
function computeMAValues(
  data: ComputeBar[],
  period: number,
  maType: BBMaType,
  source: SourceType
): Map<number, number> {
  const result = new Map<number, number>();
  
  switch (maType) {
    case "sma": {
      const sma = computeSMA(data, period, source);
      sma.forEach(p => result.set(p.time as number, p.value));
      break;
    }
    case "ema": {
      const ema = computeEMA(data, period, source);
      ema.forEach(p => result.set(p.time as number, p.value));
      break;
    }
    case "smma": {
      const smma = computeSMMA(data, period, source);
      smma.forEach(p => result.set(p.time as number, p.value));
      break;
    }
    case "wma": {
      const wma = computeWMA(data, period, source);
      wma.forEach(p => result.set(p.time as number, p.value));
      break;
    }
    case "vwma": {
      const vwma = computeVWMA(data, period, source);
      vwma.forEach(p => result.set(p.time as number, p.value));
      break;
    }
  }
  
  return result;
}

/**
 * Compute Bollinger Bands with TradingView parity
 * 
 * Features:
 * - Basis MA type selection: SMA (default), EMA, SMMA (RMA), WMA, VWMA
 * - Standard deviation calculation always based on SMA (TV behavior)
 * - Full-length output (values + NaN for warmup)
 * 
 * @param data - OHLCV bars
 * @param period - BB period (default 20)
 * @param stdDev - Standard deviation multiplier (default 2)
 * @param source - Price source (default "close")
 * @param maType - MA type for basis (default "sma")
 */
export function computeBollingerBands(
  data: ComputeBar[],
  period: number = 20,
  stdDev: number = 2,
  source: SourceType = "close",
  maType: BBMaType = "sma"
): BollingerResult {
  const upper: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const lower: LinePoint[] = [];
  
  if (period <= 0 || data.length === 0) {
    return { upper, middle, lower };
  }
  
  // Get basis MA values
  const basisMap = computeMAValues(data, period, maType, source);
  
  // For standard deviation, always use SMA of source (TV behavior)
  // Build rolling std calculation
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Check if we have enough data for this bar
    if (i < period - 1) {
      // Warmup period - output NaN
      upper.push({ time, value: NaN });
      middle.push({ time, value: NaN });
      lower.push({ time, value: NaN });
      continue;
    }
    
    // Get basis value for this time
    const basis = basisMap.get(time as number);
    if (basis === undefined) {
      // MA hasn't converged yet
      upper.push({ time, value: NaN });
      middle.push({ time, value: NaN });
      lower.push({ time, value: NaN });
      continue;
    }
    
    // Calculate SMA for std deviation (TV always uses SMA for std)
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += getSource(data[i - j], source);
    }
    const smaForStd = sum / period;
    
    // Calculate standard deviation
    let sqSum = 0;
    for (let j = 0; j < period; j++) {
      const diff = getSource(data[i - j], source) - smaForStd;
      sqSum += diff * diff;
    }
    const std = Math.sqrt(sqSum / period);
    
    middle.push({ time, value: basis });
    upper.push({ time, value: basis + stdDev * std });
    lower.push({ time, value: basis - stdDev * std });
  }
  
  return { upper, middle, lower };
}

// ============================================================================
// ATR - Average True Range (TradingView Parity)
// ============================================================================

/** ATR Smoothing types matching TradingView */
export type ATRSmoothingType = "rma" | "sma" | "ema" | "wma";

/**
 * Compute ATR with TradingView parity
 * 
 * Features:
 * - Smoothing type selection (RMA default, SMA, EMA, WMA)
 * - Full-length output with NaN for warmup period
 * - TR calculation: i=0: H-L, i>0: max(H-L, |H-prevC|, |L-prevC|)
 * 
 * Warmup behavior (TradingView):
 * - For i < length-1: output NaN
 * - At i == length-1: firstATR = SMA(TR[0..length-1])
 * - After that: apply smoothing method
 * 
 * @param data - OHLCV bars
 * @param period - ATR period (default 14)
 * @param smoothing - Smoothing type (default "rma")
 */
export function computeATR(
  data: ComputeBar[],
  period: number = 14,
  smoothing: ATRSmoothingType = "rma"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length === 0) return result;
  
  // Calculate True Range for each bar
  const trueRanges: number[] = [];
  
  // i=0: TR = high - low
  trueRanges.push(data[0].high - data[0].low);
  
  // i>0: TR = max(high-low, |high-prevClose|, |low-prevClose|)
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Build full-length output with NaN for warmup
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      // Warmup period: NaN (will be converted to WhitespaceData)
      result.push({ time: data[i].time, value: NaN });
    } else if (i === period - 1) {
      // First ATR: SMA of first N true ranges
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += trueRanges[j];
      }
      result.push({ time: data[i].time, value: sum / period });
    } else {
      // Subsequent values: apply smoothing
      const prevATR = result[i - 1].value;
      let atrValue: number;
      
      switch (smoothing) {
        case "ema": {
          // EMA: alpha = 2/(length+1)
          const alpha = 2 / (period + 1);
          atrValue = prevATR + alpha * (trueRanges[i] - prevATR);
          break;
        }
        case "sma": {
          // SMA: simple average of last N true ranges
          let sum = 0;
          for (let j = i - period + 1; j <= i; j++) {
            sum += trueRanges[j];
          }
          atrValue = sum / period;
          break;
        }
        case "wma": {
          // WMA: weighted moving average of last N true ranges
          const divisor = (period * (period + 1)) / 2;
          let weightedSum = 0;
          for (let j = 0; j < period; j++) {
            weightedSum += trueRanges[i - period + 1 + j] * (j + 1);
          }
          atrValue = weightedSum / divisor;
          break;
        }
        case "rma":
        default: {
          // RMA (Wilder's smoothing): atr = (prevATR*(length-1) + TR) / length
          atrValue = (prevATR * (period - 1) + trueRanges[i]) / period;
          break;
        }
      }
      
      result.push({ time: data[i].time, value: atrValue });
    }
  }
  
  return result;
}

// ============================================================================
// ADX - Average Directional Index
// ============================================================================

export interface ADXResult {
  adx: LinePoint[];
  plusDI: LinePoint[];
  minusDI: LinePoint[];
}

export function computeADX(
  data: ComputeBar[],
  period: number,
  smoothing: number = 14
): ADXResult {
  const adx: LinePoint[] = [];
  const plusDI: LinePoint[] = [];
  const minusDI: LinePoint[] = [];
  
  if (period <= 0 || data.length < period + smoothing) {
    return { adx, plusDI, minusDI };
  }
  
  // Calculate +DM, -DM, TR for each bar
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  const trueRanges: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevHigh = data[i - 1].high;
    const prevLow = data[i - 1].low;
    const prevClose = data[i - 1].close;
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Smooth DM and TR using Wilder's method
  const smoothDmPlus: number[] = [];
  const smoothDmMinus: number[] = [];
  const smoothTr: number[] = [];
  
  // Initial sums
  let sumDmPlus = 0, sumDmMinus = 0, sumTr = 0;
  for (let i = 0; i < period; i++) {
    sumDmPlus += dmPlus[i];
    sumDmMinus += dmMinus[i];
    sumTr += trueRanges[i];
  }
  smoothDmPlus.push(sumDmPlus);
  smoothDmMinus.push(sumDmMinus);
  smoothTr.push(sumTr);
  
  // Wilder's smoothing
  for (let i = period; i < dmPlus.length; i++) {
    const prevDmPlus = smoothDmPlus[smoothDmPlus.length - 1];
    const prevDmMinus = smoothDmMinus[smoothDmMinus.length - 1];
    const prevTr = smoothTr[smoothTr.length - 1];
    
    smoothDmPlus.push(prevDmPlus - prevDmPlus / period + dmPlus[i]);
    smoothDmMinus.push(prevDmMinus - prevDmMinus / period + dmMinus[i]);
    smoothTr.push(prevTr - prevTr / period + trueRanges[i]);
  }
  
  // Calculate +DI, -DI, DX
  const dxValues: number[] = [];
  
  for (let i = 0; i < smoothTr.length; i++) {
    const tr = smoothTr[i];
    if (tr === 0) {
      plusDI.push({ time: data[i + period].time, value: 0 });
      minusDI.push({ time: data[i + period].time, value: 0 });
      dxValues.push(0);
      continue;
    }
    
    const pdi = (smoothDmPlus[i] / tr) * 100;
    const mdi = (smoothDmMinus[i] / tr) * 100;
    
    plusDI.push({ time: data[i + period].time, value: pdi });
    minusDI.push({ time: data[i + period].time, value: mdi });
    
    const diSum = pdi + mdi;
    const dx = diSum === 0 ? 0 : (Math.abs(pdi - mdi) / diSum) * 100;
    dxValues.push(dx);
  }
  
  // Calculate ADX (smoothed DX)
  if (dxValues.length >= smoothing) {
    let adxSum = 0;
    for (let i = 0; i < smoothing; i++) {
      adxSum += dxValues[i];
    }
    let adxValue = adxSum / smoothing;
    adx.push({ time: data[period + smoothing - 1].time, value: adxValue });
    
    for (let i = smoothing; i < dxValues.length; i++) {
      adxValue = (adxValue * (smoothing - 1) + dxValues[i]) / smoothing;
      adx.push({ time: data[period + i].time, value: adxValue });
    }
  }
  
  return { adx, plusDI, minusDI };
}

// ============================================================================
// DMI - Directional Movement Index
// TradingView parity: Same as ADX but with DMI naming convention
// Inputs: ADX Smoothing (default 14), DI Length (default 14)
// Outputs: ADX, +DI, -DI
// ============================================================================

export interface DMIResult {
  adx: LinePoint[];
  plusDI: LinePoint[];
  minusDI: LinePoint[];
}

/**
 * Compute DMI (Directional Movement Index)
 * This is the same as ADX but uses TradingView's DMI naming convention.
 * 
 * TradingView inputs:
 * - ADX Smoothing: smoothing period for ADX (default 14)
 * - DI Length: period for +DI and -DI calculation (default 14)
 * 
 * @param data - OHLCV bars
 * @param adxSmoothing - ADX smoothing period (default 14)
 * @param diLength - DI calculation period (default 14)
 * @returns { adx, plusDI, minusDI }
 */
export function computeDMI(
  data: ComputeBar[],
  adxSmoothing: number = 14,
  diLength: number = 14
): DMIResult {
  // DMI uses the same calculation as ADX
  // diLength is the period for DM/TR smoothing
  // adxSmoothing is the smoothing for ADX
  return computeADX(data, diLength, adxSmoothing);
}

// ============================================================================
// Vortex Indicator (VI)
// TradingView parity: VI+ and VI- based on VM+/VM- and True Range
// ============================================================================

export interface VortexResult {
  viPlus: LinePoint[];
  viMinus: LinePoint[];
}

/**
 * Compute Vortex Indicator
 * 
 * TradingView formula:
 * - VM+ = abs(High - Low[1])
 * - VM- = abs(Low - High[1])
 * - TR = max(High - Low, abs(High - Close[1]), abs(Low - Close[1]))
 * - VI+ = sum(VM+, length) / sum(TR, length)
 * - VI- = sum(VM-, length) / sum(TR, length)
 * 
 * @param data - OHLCV bars
 * @param length - Period for sums (default 14)
 * @returns { viPlus, viMinus }
 */
export function computeVortex(
  data: ComputeBar[],
  length: number = 14
): VortexResult {
  const viPlus: LinePoint[] = [];
  const viMinus: LinePoint[] = [];
  
  if (length <= 0 || data.length < length + 1) {
    return { viPlus, viMinus };
  }
  
  // Calculate VM+, VM-, and TR for each bar (starting from i=1)
  const vmPlus: number[] = [];
  const vmMinus: number[] = [];
  const trueRanges: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevHigh = data[i - 1].high;
    const prevLow = data[i - 1].low;
    const prevClose = data[i - 1].close;
    
    // VM+ = |High - prevLow|
    vmPlus.push(Math.abs(high - prevLow));
    // VM- = |Low - prevHigh|
    vmMinus.push(Math.abs(low - prevHigh));
    
    // True Range (same as ADX/ATR)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Calculate VI+ and VI- using rolling sums
  // VI starts at bar index 'length' (i.e., we need 'length' bars of VM/TR data)
  for (let i = length - 1; i < vmPlus.length; i++) {
    let sumVmPlus = 0;
    let sumVmMinus = 0;
    let sumTr = 0;
    
    for (let j = i - length + 1; j <= i; j++) {
      sumVmPlus += vmPlus[j];
      sumVmMinus += vmMinus[j];
      sumTr += trueRanges[j];
    }
    
    // Avoid division by zero
    const viPlusValue = sumTr > 0 ? sumVmPlus / sumTr : 0;
    const viMinusValue = sumTr > 0 ? sumVmMinus / sumTr : 0;
    
    // Bar index in original data: i + 1 (because vmPlus starts at data[1])
    viPlus.push({ time: data[i + 1].time, value: viPlusValue });
    viMinus.push({ time: data[i + 1].time, value: viMinusValue });
  }
  
  return { viPlus, viMinus };
}

// ============================================================================
// Aroon Indicator
// TradingView parity: Aroon Up and Aroon Down
// Note: TV uses (Length + 1) bars for lookback per documentation
// ============================================================================

export interface AroonResult {
  aroonUp: LinePoint[];
  aroonDown: LinePoint[];
}

/**
 * Compute Aroon Indicator
 * 
 * TradingView formula (per documentation):
 * - Lookback window is (Length + 1) bars
 * - barsSinceHighestHigh = number of bars since highest high in window
 * - barsSinceLowestLow = number of bars since lowest low in window
 * - Aroon Up = 100 * (Length - barsSinceHighestHigh) / Length
 * - Aroon Down = 100 * (Length - barsSinceLowestLow) / Length
 * 
 * @param data - OHLCV bars
 * @param length - Period (default 14)
 * @returns { aroonUp, aroonDown }
 */
export function computeAroon(
  data: ComputeBar[],
  length: number = 14
): AroonResult {
  const aroonUp: LinePoint[] = [];
  const aroonDown: LinePoint[] = [];
  
  if (length <= 0 || data.length < length + 1) {
    return { aroonUp, aroonDown };
  }
  
  // Per TradingView documentation: lookback is (length + 1) bars
  const lookback = length + 1;
  
  for (let i = lookback - 1; i < data.length; i++) {
    // Find highest high and lowest low in the lookback window
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    let barsSinceHighestHigh = 0;
    let barsSinceLowestLow = 0;
    
    // Look back from current bar
    for (let j = 0; j < lookback; j++) {
      const barIdx = i - j;
      const high = data[barIdx].high;
      const low = data[barIdx].low;
      
      if (high >= highestHigh) {
        highestHigh = high;
        barsSinceHighestHigh = j;
      }
      if (low <= lowestLow) {
        lowestLow = low;
        barsSinceLowestLow = j;
      }
    }
    
    // Calculate Aroon values
    const aroonUpValue = 100 * (length - barsSinceHighestHigh) / length;
    const aroonDownValue = 100 * (length - barsSinceLowestLow) / length;
    
    aroonUp.push({ time: data[i].time, value: aroonUpValue });
    aroonDown.push({ time: data[i].time, value: aroonDownValue });
  }
  
  return { aroonUp, aroonDown };
}

// ============================================================================
// Aroon Oscillator
// TradingView parity: Aroon Up - Aroon Down with levels and fill
// ============================================================================

export interface AroonOscResult {
  oscillator: LinePoint[];
}

/**
 * Compute Aroon Oscillator
 * 
 * Formula: Aroon Oscillator = Aroon Up - Aroon Down
 * Range: [-100, +100]
 * 
 * TradingView defaults:
 * - Level lines at -90, 0, +90
 * - Fill: green above 0, red below 0
 * 
 * @param data - OHLCV bars
 * @param length - Period (default 14)
 * @returns { oscillator }
 */
export function computeAroonOsc(
  data: ComputeBar[],
  length: number = 14
): AroonOscResult {
  const oscillator: LinePoint[] = [];
  
  // Use computeAroon for the underlying calculation
  const aroon = computeAroon(data, length);
  
  // Calculate oscillator: AroonUp - AroonDown
  for (let i = 0; i < aroon.aroonUp.length; i++) {
    const up = aroon.aroonUp[i];
    const down = aroon.aroonDown[i];
    oscillator.push({
      time: up.time,
      value: up.value - down.value,
    });
  }
  
  return { oscillator };
}

// ============================================================================
// VWAP - Volume Weighted Average Price (with Standard Deviation Bands)
// TradingView parity: VWAP line + up to 3 pairs of standard deviation bands
// ============================================================================

export type VwapAnchorPeriod = "session" | "week" | "month" | "quarter" | "year";

export interface VwapResult {
  vwap: LinePoint[];
  upper1: LinePoint[];
  lower1: LinePoint[];
  upper2: LinePoint[];
  lower2: LinePoint[];
  upper3: LinePoint[];
  lower3: LinePoint[];
}

export type VwapBandsMode = "stdev" | "percentage";
export type VwapSourceType = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4" | "hlcc4";

/**
 * Get source price value for VWAP calculation
 */
function getVwapSource(bar: ComputeBar, source: VwapSourceType): number {
  switch (source) {
    case "open": return bar.open;
    case "high": return bar.high;
    case "low": return bar.low;
    case "close": return bar.close;
    case "hl2": return (bar.high + bar.low) / 2;
    case "hlc3": return (bar.high + bar.low + bar.close) / 3;
    case "ohlc4": return (bar.open + bar.high + bar.low + bar.close) / 4;
    case "hlcc4": return (bar.high + bar.low + bar.close + bar.close) / 4;
    default: return (bar.high + bar.low + bar.close) / 3; // Default HLC3
  }
}

/**
 * Get anchor timestamp for VWAP reset periods.
 * 
 * IMPORTANT FOR TV PARITY:
 * - For "session" with US equities: TradingView resets at RTH open (09:30 ET)
 * - Use sessionStartUtcHour=14 for EST, sessionStartUtcHour=13 for EDT
 * - For crypto/forex: Leave sessionStartUtcHour=0 (UTC midnight)
 * 
 * @param timestamp - Unix timestamp in seconds
 * @param anchorPeriod - Reset period type
 * @param sessionStartUtcHour - Hour in UTC when session starts (default 0 = UTC midnight)
 */
function getVwapAnchor(
  timestamp: number, 
  anchorPeriod: VwapAnchorPeriod,
  sessionStartUtcHour: number = 0
): number {
  const date = new Date(timestamp * 1000);
  
  switch (anchorPeriod) {
    case "session": {
      // Reset at session start (configured hour in UTC)
      // For US RTH: 09:30 ET = 14:30 UTC (EST) or 13:30 UTC (EDT)
      const hourInUtc = date.getUTCHours();
      const minuteInUtc = date.getUTCMinutes();
      const currentTimeInMinutes = hourInUtc * 60 + minuteInUtc;
      const sessionStartInMinutes = sessionStartUtcHour * 60 + 30; // +30 for proper session start (e.g., 09:30)
      
      // If before session start, use previous day's anchor
      if (currentTimeInMinutes < sessionStartInMinutes) {
        const prevDay = new Date(date);
        prevDay.setUTCDate(date.getUTCDate() - 1);
        return Date.UTC(prevDay.getUTCFullYear(), prevDay.getUTCMonth(), prevDay.getUTCDate(), sessionStartUtcHour, 30);
      }
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), sessionStartUtcHour, 30);
    }
    
    case "week": {
      // Reset weekly (UTC, Sunday = 0)
      const dayOfWeek = date.getUTCDay();
      const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      weekStart.setUTCDate(date.getUTCDate() - dayOfWeek);
      return Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate());
    }
    
    case "month":
      // Reset monthly (UTC)
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    
    case "quarter": {
      // Reset quarterly (UTC)
      const quarter = Math.floor(date.getUTCMonth() / 3);
      return Date.UTC(date.getUTCFullYear(), quarter * 3, 1);
    }
    
    case "year":
      // Reset yearly (UTC)
      return Date.UTC(date.getUTCFullYear(), 0, 1);
    
    default:
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
}

/**
 * Compute VWAP with standard deviation or percentage bands.
 * TradingView defaults:
 * - Source: HLC3
 * - Band Mode: Standard Deviation
 * - Band 1 multiplier: 1.0
 * - Band 2 multiplier: 2.0
 * - Band 3 multiplier: 3.0
 * 
 * Implements anchor breaks: inserts NaN at period boundaries to avoid 
 * rectangular/vertical spikes when VWAP resets.
 * 
 * @param data - OHLCV bars
 * @param anchorPeriod - Reset period (session/week/month/quarter/year)
 * @param bandMultipliers - [band1, band2, band3] multipliers
 * @param bandsEnabled - [band1Enabled, band2Enabled, band3Enabled]
 * @param bandsMode - "stdev" for standard deviation, "percentage" for percentage bands
 * @param source - Price source for VWAP calculation
 * @param sessionStartUtcHour - For "session" anchor: hour in UTC when session starts
 *                              US equities RTH: 14 (EST) or 13 (EDT) for 09:30 ET
 *                              Crypto/Forex: 0 (UTC midnight)
 */
export function computeVWAP(
  data: ComputeBar[],
  anchorPeriod: VwapAnchorPeriod = "session",
  bandMultipliers: [number, number, number] = [1.0, 2.0, 3.0],
  bandsEnabled: [boolean, boolean, boolean] = [true, true, true],
  bandsMode: VwapBandsMode = "stdev",
  source: VwapSourceType = "hlc3",
  sessionStartUtcHour: number = 14  // Default to 14:30 UTC (09:30 EST) for US equities RTH
): VwapResult {
  const result: VwapResult = {
    vwap: [],
    upper1: [],
    lower1: [],
    upper2: [],
    lower2: [],
    upper3: [],
    lower3: [],
  };
  
  if (data.length === 0) return result;
  
  let cumulativeTPV = 0;        // Cumulative(Source Price × Volume)
  let cumulativeVolume = 0;     // Cumulative(Volume)
  let cumulativeTP2V = 0;       // Cumulative(SourcePrice² × Volume) for std dev
  let lastAnchor: number | null = null;
  
  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const currentAnchor = getVwapAnchor(bar.time, anchorPeriod, sessionStartUtcHour);
    
    // Anchor break: insert NaN at previous bar when anchor changes
    // This prevents rectangular/vertical connecting lines between periods
    if (lastAnchor !== null && lastAnchor !== currentAnchor && result.vwap.length > 0) {
      // Mark the previous point as a break (set to NaN)
      const prevIdx = result.vwap.length - 1;
      result.vwap[prevIdx] = { time: result.vwap[prevIdx].time, value: NaN };
      result.upper1[prevIdx] = { time: result.upper1[prevIdx].time, value: NaN };
      result.lower1[prevIdx] = { time: result.lower1[prevIdx].time, value: NaN };
      result.upper2[prevIdx] = { time: result.upper2[prevIdx].time, value: NaN };
      result.lower2[prevIdx] = { time: result.lower2[prevIdx].time, value: NaN };
      result.upper3[prevIdx] = { time: result.upper3[prevIdx].time, value: NaN };
      result.lower3[prevIdx] = { time: result.lower3[prevIdx].time, value: NaN };
    }
    
    // Reset on new anchor period
    if (lastAnchor !== currentAnchor) {
      cumulativeTPV = 0;
      cumulativeVolume = 0;
      cumulativeTP2V = 0;
      lastAnchor = currentAnchor;
    }
    
    // Get source price
    const sourcePrice = getVwapSource(bar, source);
    
    // Accumulate
    cumulativeTPV += sourcePrice * bar.volume;
    cumulativeVolume += bar.volume;
    cumulativeTP2V += sourcePrice * sourcePrice * bar.volume;
    
    // VWAP = Cumulative(Source × V) / Cumulative(V)
    const vwap = cumulativeVolume === 0 ? sourcePrice : cumulativeTPV / cumulativeVolume;
    result.vwap.push({ time: bar.time, value: vwap });
    
    // Calculate bands based on mode
    if (bandsMode === "percentage") {
      // Percentage mode: band = vwap * (1 ± multiplier/100)
      const upper1Val = bandsEnabled[0] ? vwap * (1 + bandMultipliers[0] / 100) : NaN;
      const lower1Val = bandsEnabled[0] ? vwap * (1 - bandMultipliers[0] / 100) : NaN;
      const upper2Val = bandsEnabled[1] ? vwap * (1 + bandMultipliers[1] / 100) : NaN;
      const lower2Val = bandsEnabled[1] ? vwap * (1 - bandMultipliers[1] / 100) : NaN;
      const upper3Val = bandsEnabled[2] ? vwap * (1 + bandMultipliers[2] / 100) : NaN;
      const lower3Val = bandsEnabled[2] ? vwap * (1 - bandMultipliers[2] / 100) : NaN;
      
      result.upper1.push({ time: bar.time, value: upper1Val });
      result.lower1.push({ time: bar.time, value: lower1Val });
      result.upper2.push({ time: bar.time, value: upper2Val });
      result.lower2.push({ time: bar.time, value: lower2Val });
      result.upper3.push({ time: bar.time, value: upper3Val });
      result.lower3.push({ time: bar.time, value: lower3Val });
    } else {
      // Standard deviation mode (default)
      if (cumulativeVolume > 0) {
        // Variance = E[X²] - E[X]²
        // StdDev = sqrt(Cumulative(Source² × V) / Cumulative(V) - VWAP²)
        const variance = (cumulativeTP2V / cumulativeVolume) - (vwap * vwap);
        const stdDev = variance > 0 ? Math.sqrt(variance) : 0;
        
        const upper1Val = bandsEnabled[0] ? vwap + stdDev * bandMultipliers[0] : NaN;
        const lower1Val = bandsEnabled[0] ? vwap - stdDev * bandMultipliers[0] : NaN;
        const upper2Val = bandsEnabled[1] ? vwap + stdDev * bandMultipliers[1] : NaN;
        const lower2Val = bandsEnabled[1] ? vwap - stdDev * bandMultipliers[1] : NaN;
        const upper3Val = bandsEnabled[2] ? vwap + stdDev * bandMultipliers[2] : NaN;
        const lower3Val = bandsEnabled[2] ? vwap - stdDev * bandMultipliers[2] : NaN;
        
        result.upper1.push({ time: bar.time, value: upper1Val });
        result.lower1.push({ time: bar.time, value: lower1Val });
        result.upper2.push({ time: bar.time, value: upper2Val });
        result.lower2.push({ time: bar.time, value: lower2Val });
        result.upper3.push({ time: bar.time, value: upper3Val });
        result.lower3.push({ time: bar.time, value: lower3Val });
      } else {
        // No volume yet - push NaN
        result.upper1.push({ time: bar.time, value: NaN });
        result.lower1.push({ time: bar.time, value: NaN });
        result.upper2.push({ time: bar.time, value: NaN });
        result.lower2.push({ time: bar.time, value: NaN });
        result.upper3.push({ time: bar.time, value: NaN });
        result.lower3.push({ time: bar.time, value: NaN });
      }
    }
  }
  
  return result;
}

/**
 * Simplified VWAP that returns only the VWAP line (backwards compatibility).
 */
export function computeVWAPLine(
  data: ComputeBar[],
  anchorPeriod: VwapAnchorPeriod = "session"
): LinePoint[] {
  return computeVWAP(data, anchorPeriod, [1, 2, 3], [true, true, true], "stdev", "hlc3").vwap;
}

// ============================================================================
// Anchored VWAP - User-defined anchor point (no periodic reset)
// TradingView: "Anchored Volume Weighted Average Price"
// ============================================================================

export interface AnchoredVwapResult {
  vwap: LinePoint[];
  upper1: LinePoint[];
  lower1: LinePoint[];
  upper2: LinePoint[];
  lower2: LinePoint[];
  upper3: LinePoint[];
  lower3: LinePoint[];
}

/**
 * Compute Anchored VWAP starting from a specific timestamp.
 * Unlike regular VWAP, Anchored VWAP never resets - it accumulates from the anchor point.
 * 
 * @param data - OHLCV bars
 * @param anchorTimestamp - UTC timestamp (seconds) to start VWAP calculation
 * @param bandMultipliers - [band1, band2, band3] standard deviation multipliers
 * @param showBands - Whether to calculate bands
 */
export function computeAnchoredVWAP(
  data: ComputeBar[],
  anchorTimestamp: number,
  bandMultipliers: [number, number, number] = [1.0, 2.0, 3.0],
  showBands: boolean = true
): AnchoredVwapResult {
  const result: AnchoredVwapResult = {
    vwap: [],
    upper1: [],
    lower1: [],
    upper2: [],
    lower2: [],
    upper3: [],
    lower3: [],
  };
  
  if (data.length === 0) return result;
  
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  let cumulativeTP2V = 0;
  let hasStarted = false;
  
  for (const bar of data) {
    // Before anchor: output NaN (WhitespaceData)
    if (bar.time < anchorTimestamp) {
      result.vwap.push({ time: bar.time, value: NaN });
      result.upper1.push({ time: bar.time, value: NaN });
      result.lower1.push({ time: bar.time, value: NaN });
      result.upper2.push({ time: bar.time, value: NaN });
      result.lower2.push({ time: bar.time, value: NaN });
      result.upper3.push({ time: bar.time, value: NaN });
      result.lower3.push({ time: bar.time, value: NaN });
      continue;
    }
    
    // First bar at or after anchor: start accumulating
    if (!hasStarted) {
      hasStarted = true;
    }
    
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
    cumulativeTP2V += typicalPrice * typicalPrice * bar.volume;
    
    const vwap = cumulativeVolume === 0 ? typicalPrice : cumulativeTPV / cumulativeVolume;
    result.vwap.push({ time: bar.time, value: vwap });
    
    if (showBands && cumulativeVolume > 0) {
      const variance = (cumulativeTP2V / cumulativeVolume) - (vwap * vwap);
      const stdDev = variance > 0 ? Math.sqrt(variance) : 0;
      
      result.upper1.push({ time: bar.time, value: vwap + stdDev * bandMultipliers[0] });
      result.lower1.push({ time: bar.time, value: vwap - stdDev * bandMultipliers[0] });
      result.upper2.push({ time: bar.time, value: vwap + stdDev * bandMultipliers[1] });
      result.lower2.push({ time: bar.time, value: vwap - stdDev * bandMultipliers[1] });
      result.upper3.push({ time: bar.time, value: vwap + stdDev * bandMultipliers[2] });
      result.lower3.push({ time: bar.time, value: vwap - stdDev * bandMultipliers[2] });
    } else {
      result.upper1.push({ time: bar.time, value: NaN });
      result.lower1.push({ time: bar.time, value: NaN });
      result.upper2.push({ time: bar.time, value: NaN });
      result.lower2.push({ time: bar.time, value: NaN });
      result.upper3.push({ time: bar.time, value: NaN });
      result.lower3.push({ time: bar.time, value: NaN });
    }
  }
  
  return result;
}

// ============================================================================
// OBV - On Balance Volume
// ============================================================================

export function computeOBV(data: ComputeBar[]): LinePoint[] {
  const result: LinePoint[] = [];
  if (data.length === 0) return result;
  
  let obv = 0;
  result.push({ time: data[0].time, value: obv });
  
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) {
      obv += data[i].volume;
    } else if (data[i].close < data[i - 1].close) {
      obv -= data[i].volume;
    }
    // If close === prevClose, OBV stays the same
    result.push({ time: data[i].time, value: obv });
  }
  
  return result;
}

// ============================================================================
// OBV Advanced - With Smoothing + Optional Bollinger Bands
// ============================================================================

export type OBVSmoothingType = "none" | "sma" | "sma_bb" | "ema" | "smma" | "wma" | "vwma";

export interface OBVAdvancedResult {
  obv: LinePoint[];
  smoothing: LinePoint[];
  bbUpper: LinePoint[];
  bbLower: LinePoint[];
}

export function computeOBVAdvanced(
  data: ComputeBar[],
  smoothingType: OBVSmoothingType = "none",
  smoothingLength: number = 14,
  bbStdDev: number = 2
): OBVAdvancedResult {
  const obv: LinePoint[] = [];
  const smoothing: LinePoint[] = [];
  const bbUpper: LinePoint[] = [];
  const bbLower: LinePoint[] = [];

  if (data.length === 0) {
    return { obv, smoothing, bbUpper, bbLower };
  }

  // ========================================================================
  // Step 1: Compute base OBV
  // ========================================================================
  const obvRaw: number[] = [];
  let cumObv = 0;
  obvRaw.push(cumObv);
  obv.push({ time: data[0].time, value: cumObv });

  for (let i = 1; i < data.length; i++) {
    // Handle NaN/missing volume as 0
    const vol = Number.isFinite(data[i].volume) ? data[i].volume : 0;
    
    if (data[i].close > data[i - 1].close) {
      cumObv += vol;
    } else if (data[i].close < data[i - 1].close) {
      cumObv -= vol;
    }
    // If close === prevClose, OBV stays the same
    obvRaw.push(cumObv);
    obv.push({ time: data[i].time, value: cumObv });
  }

  // ========================================================================
  // Step 2: Compute Smoothing MA on OBV (if enabled)
  // ========================================================================
  if (smoothingType !== "none" && smoothingLength > 0 && data.length >= smoothingLength) {
    const maType = smoothingType === "sma_bb" ? "sma" : smoothingType;

    for (let i = 0; i < data.length; i++) {
      const bar = data[i];

      // Need enough OBV values for smoothing window
      if (i < smoothingLength - 1) {
        smoothing.push({ time: bar.time, value: NaN });
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
        continue;
      }

      // Get OBV values for smoothing window (most recent first)
      const obvWindow: number[] = [];
      for (let j = 0; j < smoothingLength; j++) {
        const idx = i - j;
        if (idx >= 0) {
          obvWindow.push(obvRaw[idx]);
        }
      }

      if (obvWindow.length < smoothingLength) {
        smoothing.push({ time: bar.time, value: NaN });
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
        continue;
      }

      let maValue: number;

      switch (maType) {
        case "sma":
          maValue = obvWindow.reduce((a, b) => a + b, 0) / smoothingLength;
          break;
        case "ema": {
          const k = 2 / (smoothingLength + 1);
          const reversed = [...obvWindow].reverse();
          maValue = reversed[0];
          for (let w = 1; w < reversed.length; w++) {
            maValue = (reversed[w] - maValue) * k + maValue;
          }
          break;
        }
        case "smma": {
          const alpha = 1 / smoothingLength;
          const reversed = [...obvWindow].reverse();
          maValue = reversed.reduce((a, b) => a + b, 0) / smoothingLength;
          for (let w = 1; w < reversed.length; w++) {
            maValue = maValue * (1 - alpha) + reversed[w] * alpha;
          }
          break;
        }
        case "wma": {
          let weightSum = 0;
          let valueSum = 0;
          for (let w = 0; w < smoothingLength; w++) {
            const weight = smoothingLength - w;
            valueSum += obvWindow[w] * weight;
            weightSum += weight;
          }
          maValue = valueSum / weightSum;
          break;
        }
        case "vwma": {
          // VWMA uses volume-weighted average of OBV values
          let sumPV = 0;
          let sumV = 0;
          for (let w = 0; w < smoothingLength; w++) {
            const vol = data[i - w].volume;
            sumPV += obvWindow[w] * vol;
            sumV += vol;
          }
          maValue = sumV === 0 ? obvWindow[0] : sumPV / sumV;
          break;
        }
        default:
          maValue = obvWindow.reduce((a, b) => a + b, 0) / smoothingLength;
      }

      smoothing.push({ time: bar.time, value: maValue });

      // BB on smoothing if sma_bb mode
      if (smoothingType === "sma_bb") {
        const mean = obvWindow.reduce((a, b) => a + b, 0) / smoothingLength;
        const variance =
          obvWindow.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / smoothingLength;
        const stdDev = Math.sqrt(variance);

        bbUpper.push({ time: bar.time, value: maValue + bbStdDev * stdDev });
        bbLower.push({ time: bar.time, value: maValue - bbStdDev * stdDev });
      } else {
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
      }
    }
  }

  return { obv, smoothing, bbUpper, bbLower };
}

// ============================================================================
// MFI - Money Flow Index
// TradingView Parity Formula:
//   Typical Price (TP) = (high + low + close) / 3
//   Raw Money Flow (RMF) = TP * volume
//   Positive MF = sum of RMF when TP > TP[1]
//   Negative MF = sum of RMF when TP < TP[1]
//   Money Flow Ratio = Positive MF / Negative MF
//   MFI = 100 - (100 / (1 + Ratio))
// 
// Edge cases:
//   - First `length` bars are warmup (NaN)
//   - If negSum === 0 && posSum === 0: MFI = 50 (neutral)
//   - If negSum === 0: MFI = 100 (all buying)
//   - If posSum === 0: MFI = 0 (all selling)
//   - Missing/NaN volume: treat as 0
// ============================================================================

export interface MFIResult {
  mfi: LinePoint[];
  overbought: LinePoint[];
  middle: LinePoint[];
  oversold: LinePoint[];
}

/**
 * Compute Money Flow Index (MFI)
 * Volume-weighted RSI measuring buying and selling pressure (0-100)
 */
export function computeMFI(
  data: ComputeBar[],
  length: number = 14,
  overboughtValue: number = 80,
  middleValue: number = 50,
  oversoldValue: number = 20
): MFIResult {
  const mfi: LinePoint[] = [];
  const overbought: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const oversold: LinePoint[] = [];
  
  if (data.length === 0 || length <= 0) {
    return { mfi, overbought, middle, oversold };
  }
  
  // Calculate Typical Price and Raw Money Flow for each bar
  const tp: number[] = [];
  const rmf: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    tp.push(typicalPrice);
    
    // Handle missing/NaN volume as 0
    const vol = Number.isFinite(bar.volume) ? bar.volume : 0;
    rmf.push(typicalPrice * vol);
  }
  
  // Calculate positive/negative money flow direction
  // Direction: 1 = positive (tp > tp[1]), -1 = negative (tp < tp[1]), 0 = neutral
  const direction: number[] = [0]; // First bar has no previous
  for (let i = 1; i < data.length; i++) {
    if (tp[i] > tp[i - 1]) {
      direction.push(1);
    } else if (tp[i] < tp[i - 1]) {
      direction.push(-1);
    } else {
      direction.push(0);
    }
  }
  
  // Build output
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Add constant band lines for all bars
    overbought.push({ time, value: overboughtValue });
    middle.push({ time, value: middleValue });
    oversold.push({ time, value: oversoldValue });
    
    // Warmup period: need at least `length` bars
    // MFI is defined starting at bar index (length)
    if (i < length) {
      mfi.push({ time, value: NaN });
      continue;
    }
    
    // Sum positive and negative money flows over the lookback period
    let posSum = 0;
    let negSum = 0;
    
    for (let j = i - length + 1; j <= i; j++) {
      if (direction[j] === 1) {
        posSum += rmf[j];
      } else if (direction[j] === -1) {
        negSum += rmf[j];
      }
      // direction === 0: neither positive nor negative flow
    }
    
    // Calculate MFI
    let mfiValue: number;
    
    if (posSum === 0 && negSum === 0) {
      // No money flow in either direction - neutral
      mfiValue = 50;
    } else if (negSum === 0) {
      // All buying pressure
      mfiValue = 100;
    } else if (posSum === 0) {
      // All selling pressure
      mfiValue = 0;
    } else {
      // Normal case: calculate ratio and MFI
      const ratio = posSum / negSum;
      mfiValue = 100 - (100 / (1 + ratio));
    }
    
    // Clamp to 0-100 (should already be in range, but safety)
    mfiValue = Math.max(0, Math.min(100, mfiValue));
    
    mfi.push({ time, value: mfiValue });
  }
  
  return { mfi, overbought, middle, oversold };
}

// ============================================================================
// TRIX - Triple Exponential Average
// ============================================================================

export interface TRIXResult {
  trix: LinePoint[];
  zero: LinePoint[];
}

/**
 * Compute TRIX (Triple Exponential Average)
 * 
 * TradingView formula:
 * 1. Single EMA = EMA(close, length)
 * 2. Double EMA = EMA(Single EMA, length)
 * 3. Triple EMA = EMA(Double EMA, length)
 * 4. TRIX = 100 × (Triple EMA[t] - Triple EMA[t-1]) / Triple EMA[t-1]
 * 
 * Default length = 18
 */
export function computeTRIX(
  data: ComputeBar[],
  length: number = 18,
  zeroValue: number = 0
): TRIXResult {
  const trix: LinePoint[] = [];
  const zero: LinePoint[] = [];
  
  if (data.length === 0 || length <= 0) {
    return { trix, zero };
  }
  
  // Step 1: Calculate Single EMA (EMA of close)
  const multiplier = 2 / (length + 1);
  const ema1: number[] = [];
  
  // Initialize first EMA1 value
  ema1.push(data[0].close);
  for (let i = 1; i < data.length; i++) {
    const prev = ema1[i - 1];
    const curr = (data[i].close - prev) * multiplier + prev;
    ema1.push(curr);
  }
  
  // Step 2: Calculate Double EMA (EMA of EMA1)
  const ema2: number[] = [];
  ema2.push(ema1[0]);
  for (let i = 1; i < ema1.length; i++) {
    const prev = ema2[i - 1];
    const curr = (ema1[i] - prev) * multiplier + prev;
    ema2.push(curr);
  }
  
  // Step 3: Calculate Triple EMA (EMA of EMA2)
  const ema3: number[] = [];
  ema3.push(ema2[0]);
  for (let i = 1; i < ema2.length; i++) {
    const prev = ema3[i - 1];
    const curr = (ema2[i] - prev) * multiplier + prev;
    ema3.push(curr);
  }
  
  // Step 4: Calculate TRIX as 1-period percent change of triple EMA
  // TRIX = 100 × (EMA3[t] - EMA3[t-1]) / EMA3[t-1]
  // First TRIX value is NaN (no previous bar)
  // Additional warmup: first few bars are still converging
  // TradingView shows NaN for approximately 3*length bars for proper convergence
  
  // Calculate warmup period: need enough bars for triple EMA to stabilize
  // Conservative: 3 EMAs need roughly 3 * length bars to fully converge
  // For TV-parity, we use ~2*length as warmup (EMA2 and EMA3 need time)
  const warmup = length; // First TRIX value at index 1, but stable after length
  
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Add constant zero line for all bars
    zero.push({ time, value: zeroValue });
    
    // First bar: no previous EMA3 to calculate percent change
    if (i === 0) {
      trix.push({ time, value: NaN });
      continue;
    }
    
    // Calculate percent change
    const ema3Prev = ema3[i - 1];
    const ema3Curr = ema3[i];
    
    // Edge case: division by zero or invalid previous value
    if (!Number.isFinite(ema3Prev) || ema3Prev === 0) {
      trix.push({ time, value: NaN });
      continue;
    }
    
    const trixValue = 100 * (ema3Curr - ema3Prev) / ema3Prev;
    
    // Check for NaN/Infinity
    if (!Number.isFinite(trixValue)) {
      trix.push({ time, value: NaN });
      continue;
    }
    
    trix.push({ time, value: trixValue });
  }
  
  return { trix, zero };
}

// ============================================================================
// TSI - True Strength Index
// ============================================================================

export interface TSIResult {
  tsi: LinePoint[];
  signal: LinePoint[];
  zero: LinePoint[];
}

/**
 * Compute True Strength Index (TSI)
 * 
 * TradingView formula:
 * 1. m[t] = close[t] - close[t-1] (momentum/price change)
 * 2. absM[t] = abs(m[t])
 * 3. Double smooth: num = EMA(EMA(m, longLen), shortLen)
 * 4. Double smooth: den = EMA(EMA(absM, longLen), shortLen)
 * 5. TSI = 100 × (num / den)
 * 6. Signal = EMA(TSI, signalLen)
 * 
 * Default: longLength=25, shortLength=13, signalLength=13
 */
export function computeTSI(
  data: ComputeBar[],
  longLength: number = 25,
  shortLength: number = 13,
  signalLength: number = 13,
  zeroValue: number = 0
): TSIResult {
  const tsi: LinePoint[] = [];
  const signal: LinePoint[] = [];
  const zero: LinePoint[] = [];
  
  if (data.length < 2 || longLength <= 0 || shortLength <= 0 || signalLength <= 0) {
    return { tsi, signal, zero };
  }
  
  // Step 1: Calculate momentum (price change) and absolute momentum
  const m: number[] = [0]; // First bar has no previous, use 0
  const absM: number[] = [0];
  
  for (let i = 1; i < data.length; i++) {
    const momentum = data[i].close - data[i - 1].close;
    m.push(momentum);
    absM.push(Math.abs(momentum));
  }
  
  // Step 2: Double smooth the momentum - EMA(EMA(m, longLen), shortLen)
  // First EMA of momentum with long length
  const longMultiplier = 2 / (longLength + 1);
  const emaM1: number[] = [];
  emaM1.push(m[0]);
  for (let i = 1; i < m.length; i++) {
    const prev = emaM1[i - 1];
    emaM1.push((m[i] - prev) * longMultiplier + prev);
  }
  
  // Second EMA of momentum with short length
  const shortMultiplier = 2 / (shortLength + 1);
  const emaM2: number[] = [];
  emaM2.push(emaM1[0]);
  for (let i = 1; i < emaM1.length; i++) {
    const prev = emaM2[i - 1];
    emaM2.push((emaM1[i] - prev) * shortMultiplier + prev);
  }
  
  // Step 3: Double smooth the absolute momentum - EMA(EMA(absM, longLen), shortLen)
  const emaAbsM1: number[] = [];
  emaAbsM1.push(absM[0]);
  for (let i = 1; i < absM.length; i++) {
    const prev = emaAbsM1[i - 1];
    emaAbsM1.push((absM[i] - prev) * longMultiplier + prev);
  }
  
  const emaAbsM2: number[] = [];
  emaAbsM2.push(emaAbsM1[0]);
  for (let i = 1; i < emaAbsM1.length; i++) {
    const prev = emaAbsM2[i - 1];
    emaAbsM2.push((emaAbsM1[i] - prev) * shortMultiplier + prev);
  }
  
  // Step 4: Calculate TSI = 100 × (num / den)
  // Warmup: need enough bars for double EMA to stabilize
  // Conservative warmup period
  const warmup = Math.max(longLength, shortLength);
  
  const tsiValues: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const num = emaM2[i];
    const den = emaAbsM2[i];
    
    // Edge case: division by zero
    if (den === 0 || !Number.isFinite(den)) {
      tsiValues.push(NaN);
    } else {
      const tsiVal = 100 * (num / den);
      // Clamp to reasonable range (should be -100 to 100 by definition)
      if (Number.isFinite(tsiVal)) {
        tsiValues.push(Math.max(-100, Math.min(100, tsiVal)));
      } else {
        tsiValues.push(NaN);
      }
    }
  }
  
  // Step 5: Calculate Signal = EMA(TSI, signalLen)
  const signalMultiplier = 2 / (signalLength + 1);
  const signalValues: number[] = [];
  
  // Find first valid TSI value for signal initialization
  let firstValidIdx = -1;
  for (let i = 0; i < tsiValues.length; i++) {
    if (Number.isFinite(tsiValues[i])) {
      firstValidIdx = i;
      break;
    }
  }
  
  if (firstValidIdx >= 0) {
    // Fill NaN up to first valid
    for (let i = 0; i < firstValidIdx; i++) {
      signalValues.push(NaN);
    }
    // Initialize signal with first valid TSI
    signalValues.push(tsiValues[firstValidIdx]);
    // Calculate remaining signal values
    for (let i = firstValidIdx + 1; i < tsiValues.length; i++) {
      const prevSignal = signalValues[i - 1];
      const currTsi = tsiValues[i];
      if (Number.isFinite(currTsi) && Number.isFinite(prevSignal)) {
        signalValues.push((currTsi - prevSignal) * signalMultiplier + prevSignal);
      } else if (Number.isFinite(currTsi)) {
        signalValues.push(currTsi);
      } else {
        signalValues.push(prevSignal);
      }
    }
  } else {
    // All TSI values are NaN
    for (let i = 0; i < tsiValues.length; i++) {
      signalValues.push(NaN);
    }
  }
  
  // Step 6: Build output arrays
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Add constant zero line for all bars
    zero.push({ time, value: zeroValue });
    
    // Apply warmup - first bars are whitespace
    if (i < warmup) {
      tsi.push({ time, value: NaN });
      signal.push({ time, value: NaN });
    } else {
      const tsiVal = tsiValues[i];
      const sigVal = signalValues[i];
      
      tsi.push({ time, value: Number.isFinite(tsiVal) ? tsiVal : NaN });
      signal.push({ time, value: Number.isFinite(sigVal) ? sigVal : NaN });
    }
  }
  
  return { tsi, signal, zero };
}

// ============================================================================
// SMI Ergodic Indicator (SMII)
// ============================================================================

export interface SMIIResult {
  smi: LinePoint[];
  signal: LinePoint[];
}

/**
 * Compute SMI Ergodic Indicator (SMII)
 * 
 * TradingView formula (from TV support):
 * 1. change = close - close[1]
 * 2. absChange = |change|
 * 3. tempChange = EMA(EMA(change, shortLen), longLen)
 * 4. tempAbs = EMA(EMA(absChange, shortLen), longLen)
 * 5. SMI = tempChange / tempAbs (NO ×100 - unscaled, typically ~[-1, +1])
 * 6. Signal = EMA(SMI, signalLen)
 * 
 * Default: longLength=20, shortLength=5, signalLength=5
 * 
 * Key difference from TSI: NO multiplication by 100, values typically in range ~[-1, +1]
 */
export function computeSMII(
  data: ComputeBar[],
  longLength: number = 20,
  shortLength: number = 5,
  signalLength: number = 5
): SMIIResult {
  const smi: LinePoint[] = [];
  const signal: LinePoint[] = [];
  
  if (data.length < 2 || longLength <= 0 || shortLength <= 0 || signalLength <= 0) {
    return { smi, signal };
  }
  
  // Step 1: Calculate change (price momentum) and absolute change
  const change: number[] = [0]; // First bar has no previous
  const absChange: number[] = [0];
  
  for (let i = 1; i < data.length; i++) {
    const c = data[i].close - data[i - 1].close;
    change.push(c);
    absChange.push(Math.abs(c));
  }
  
  // Step 2: Double smooth the change: EMA(EMA(change, shortLen), longLen)
  // First EMA with short length
  const shortMultiplier = 2 / (shortLength + 1);
  const emaChange1: number[] = [];
  emaChange1.push(change[0]);
  for (let i = 1; i < change.length; i++) {
    const prev = emaChange1[i - 1];
    emaChange1.push((change[i] - prev) * shortMultiplier + prev);
  }
  
  // Second EMA with long length
  const longMultiplier = 2 / (longLength + 1);
  const emaChange2: number[] = [];
  emaChange2.push(emaChange1[0]);
  for (let i = 1; i < emaChange1.length; i++) {
    const prev = emaChange2[i - 1];
    emaChange2.push((emaChange1[i] - prev) * longMultiplier + prev);
  }
  
  // Step 3: Double smooth the absolute change: EMA(EMA(absChange, shortLen), longLen)
  const emaAbs1: number[] = [];
  emaAbs1.push(absChange[0]);
  for (let i = 1; i < absChange.length; i++) {
    const prev = emaAbs1[i - 1];
    emaAbs1.push((absChange[i] - prev) * shortMultiplier + prev);
  }
  
  const emaAbs2: number[] = [];
  emaAbs2.push(emaAbs1[0]);
  for (let i = 1; i < emaAbs1.length; i++) {
    const prev = emaAbs2[i - 1];
    emaAbs2.push((emaAbs1[i] - prev) * longMultiplier + prev);
  }
  
  // Step 4: Calculate SMI = tempChange / tempAbs (NO ×100!)
  // Warmup: need enough bars for double EMA to stabilize
  const warmup = Math.max(longLength, shortLength);
  
  const smiValues: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const num = emaChange2[i];
    const den = emaAbs2[i];
    
    // Edge case: division by zero (no price movement)
    if (den === 0 || !Number.isFinite(den)) {
      smiValues.push(NaN);
    } else {
      const smiVal = num / den;
      // Check for NaN/Infinity
      if (Number.isFinite(smiVal)) {
        smiValues.push(smiVal);
      } else {
        smiValues.push(NaN);
      }
    }
  }
  
  // Step 5: Calculate Signal = EMA(SMI, signalLen)
  const signalMultiplier = 2 / (signalLength + 1);
  const signalValues: number[] = [];
  
  // Find first valid SMI value for signal initialization
  let firstValidIdx = -1;
  for (let i = 0; i < smiValues.length; i++) {
    if (Number.isFinite(smiValues[i])) {
      firstValidIdx = i;
      break;
    }
  }
  
  if (firstValidIdx >= 0) {
    // Fill NaN up to first valid
    for (let i = 0; i < firstValidIdx; i++) {
      signalValues.push(NaN);
    }
    // Initialize signal with first valid SMI
    signalValues.push(smiValues[firstValidIdx]);
    // Calculate remaining signal values
    for (let i = firstValidIdx + 1; i < smiValues.length; i++) {
      const prevSignal = signalValues[i - 1];
      const currSmi = smiValues[i];
      if (Number.isFinite(currSmi) && Number.isFinite(prevSignal)) {
        signalValues.push((currSmi - prevSignal) * signalMultiplier + prevSignal);
      } else if (Number.isFinite(currSmi)) {
        signalValues.push(currSmi);
      } else {
        signalValues.push(prevSignal);
      }
    }
  } else {
    // All SMI values are NaN
    for (let i = 0; i < smiValues.length; i++) {
      signalValues.push(NaN);
    }
  }
  
  // Step 6: Build output arrays
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Apply warmup - first bars are whitespace
    if (i < warmup) {
      smi.push({ time, value: NaN });
      signal.push({ time, value: NaN });
    } else {
      const smiVal = smiValues[i];
      const sigVal = signalValues[i];
      
      smi.push({ time, value: Number.isFinite(smiVal) ? smiVal : NaN });
      signal.push({ time, value: Number.isFinite(sigVal) ? sigVal : NaN });
    }
  }
  
  return { smi, signal };
}

// ============================================================================
// SMI Ergodic Oscillator (SMIO)
// ============================================================================
// SMIO is the difference between SMI and its Signal line: SMIO = SMI - Signal
// This oscillator shows momentum divergence as a histogram around zero.
// Values are unscaled (typically ~[-0.5, +0.5] on daily charts).

export interface SMIOResult {
  oscillator: LinePoint[];
}

/**
 * Compute SMI Ergodic Oscillator
 * 
 * @param data - OHLCV bars
 * @param longLength - Long smoothing period (default 20)
 * @param shortLength - Short smoothing period (default 5)
 * @param signalLength - Signal line smoothing period (default 5)
 * @returns oscillator values (SMI - Signal)
 * 
 * TradingView formula:
 *   SMI, Signal = computeSMII(...)
 *   SMIO = SMI - Signal
 * 
 * No ×100 scaling - values are in the same small range as SMII.
 */
export function computeSMIO(
  data: ComputeBar[],
  longLength: number = 20,
  shortLength: number = 5,
  signalLength: number = 5
): SMIOResult {
  // Reuse SMII calculation to ensure exact same SMI and Signal values
  const smiiResult = computeSMII(data, longLength, shortLength, signalLength);
  
  const oscillator: LinePoint[] = [];
  
  // Calculate oscillator = SMI - Signal
  for (let i = 0; i < smiiResult.smi.length; i++) {
    const smiPoint = smiiResult.smi[i];
    const signalPoint = smiiResult.signal[i];
    const time = smiPoint.time;
    
    const smiVal = smiPoint.value;
    const sigVal = signalPoint.value;
    
    // If either value is NaN, oscillator is NaN
    if (!Number.isFinite(smiVal) || !Number.isFinite(sigVal)) {
      oscillator.push({ time, value: NaN });
    } else {
      oscillator.push({ time, value: smiVal - sigVal });
    }
  }
  
  return { oscillator };
}

// ============================================================================
// Coppock Curve
// ============================================================================
// Long-term momentum oscillator developed by Edwin Coppock.
// Formula: WMA(ROC(long) + ROC(short), wmaLength)
// TradingView defaults: WMA=10, Long ROC=14, Short ROC=11

export interface CoppockResult {
  coppock: LinePoint[];
}

/**
 * Compute Coppock Curve
 * 
 * @param data - OHLCV bars
 * @param wmaLength - WMA smoothing period (default 10)
 * @param longRocLength - Long ROC period (default 14)
 * @param shortRocLength - Short ROC period (default 11)
 * @returns coppock curve values
 * 
 * TradingView formula:
 *   rocLong = ROC(close, longRocLength)
 *   rocShort = ROC(close, shortRocLength)
 *   sum = rocLong + rocShort
 *   coppock = WMA(sum, wmaLength)
 * 
 * ROC = 100 * (close / close[n] - 1) = ((close - close[n]) / close[n]) * 100
 */
export function computeCoppockCurve(
  data: ComputeBar[],
  wmaLength: number = 10,
  longRocLength: number = 14,
  shortRocLength: number = 11
): CoppockResult {
  const coppock: LinePoint[] = [];
  
  if (data.length === 0 || wmaLength <= 0 || longRocLength <= 0 || shortRocLength <= 0) {
    return { coppock };
  }
  
  // Calculate the maximum ROC lookback
  const maxRocLength = Math.max(longRocLength, shortRocLength);
  
  // First valid ROC bar is at index = maxRocLength
  // First valid WMA of ROC sum is at index = maxRocLength + wmaLength - 1
  const firstValidIndex = maxRocLength + wmaLength - 1;
  
  if (data.length <= firstValidIndex) {
    // Not enough data - return empty
    return { coppock };
  }
  
  // Step 1: Calculate ROC values for all bars where we have enough lookback
  // ROC = 100 * (close / close[n] - 1)
  const rocSums: { time: any; value: number }[] = [];
  
  for (let i = maxRocLength; i < data.length; i++) {
    const closeCurrent = data[i].close;
    const closeLongAgo = data[i - longRocLength].close;
    const closeShortAgo = data[i - shortRocLength].close;
    
    // Calculate ROC values
    let rocLong: number;
    let rocShort: number;
    
    if (closeLongAgo === 0 || closeShortAgo === 0) {
      rocLong = NaN;
      rocShort = NaN;
    } else {
      rocLong = ((closeCurrent - closeLongAgo) / closeLongAgo) * 100;
      rocShort = ((closeCurrent - closeShortAgo) / closeShortAgo) * 100;
    }
    
    const sum = rocLong + rocShort;
    rocSums.push({ time: data[i].time, value: sum });
  }
  
  // Step 2: Apply WMA to the ROC sums
  // WMA weight: 1 for oldest, wmaLength for newest
  const divisor = (wmaLength * (wmaLength + 1)) / 2;
  
  for (let i = 0; i < rocSums.length; i++) {
    if (i < wmaLength - 1) {
      // Not enough ROC values for WMA yet - output NaN
      coppock.push({ time: rocSums[i].time, value: NaN });
    } else {
      // Calculate WMA
      let weightedSum = 0;
      let hasNaN = false;
      
      for (let j = 0; j < wmaLength; j++) {
        const rocVal = rocSums[i - wmaLength + 1 + j].value;
        if (!Number.isFinite(rocVal)) {
          hasNaN = true;
          break;
        }
        // Weight: 1 for oldest, wmaLength for newest
        weightedSum += rocVal * (j + 1);
      }
      
      if (hasNaN) {
        coppock.push({ time: rocSums[i].time, value: NaN });
      } else {
        coppock.push({ time: rocSums[i].time, value: weightedSum / divisor });
      }
    }
  }
  
  return { coppock };
}

// ============================================================================
// Chande Momentum Oscillator (CMO)
// Formula: CMO = 100 * (UpSum - DownSum) / (UpSum + DownSum)
// Where: Up = max(delta, 0), Down = max(-delta, 0), delta = src[i] - src[i-1]
// Bounded: -100 to +100
// ============================================================================

export interface CMOResult {
  cmo: LinePoint[];
}

export function computeCMO(
  data: ComputeBar[],
  length: number = 9,
  source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4" = "close"
): CMOResult {
  const cmo: LinePoint[] = [];
  
  if (data.length === 0 || length <= 0) {
    return { cmo };
  }
  
  // Get source values based on source parameter
  const getSrcValue = (bar: ComputeBar): number => {
    switch (source) {
      case "open": return bar.open;
      case "high": return bar.high;
      case "low": return bar.low;
      case "hl2": return (bar.high + bar.low) / 2;
      case "hlc3": return (bar.high + bar.low + bar.close) / 3;
      case "ohlc4": return (bar.open + bar.high + bar.low + bar.close) / 4;
      case "hlcc4": return (bar.high + bar.low + bar.close + bar.close) / 4;
      case "close":
      default: return bar.close;
    }
  };
  
  // Calculate deltas (src[i] - src[i-1])
  // First bar has no delta
  const deltas: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      deltas.push(0); // No previous bar
    } else {
      deltas.push(getSrcValue(data[i]) - getSrcValue(data[i - 1]));
    }
  }
  
  // Calculate CMO for each bar
  // CMO = 100 * (UpSum - DownSum) / (UpSum + DownSum)
  // We need at least 'length' periods of deltas, which means length+1 bars total
  // The first delta is at index 1, so we need i >= length to have 'length' deltas
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Need at least 'length' deltas, starting from index 1
    // At index i, we can sum deltas from (i - length + 1) to i
    if (i < length) {
      // Not enough data - use whitespace (omit value)
      cmo.push({ time });
      continue;
    }
    
    // Sum ups and downs over the length period
    let upSum = 0;
    let downSum = 0;
    
    for (let j = i - length + 1; j <= i; j++) {
      const delta = deltas[j];
      if (delta > 0) {
        upSum += delta;
      } else {
        downSum += Math.abs(delta);
      }
    }
    
    const denom = upSum + downSum;
    
    if (denom === 0) {
      // No movement - CMO is 0
      cmo.push({ time, value: 0 });
    } else {
      const cmoValue = 100 * (upSum - downSum) / denom;
      cmo.push({ time, value: cmoValue });
    }
  }
  
  return { cmo };
}

// ============================================================================
// Ultimate Oscillator (UO)
// Multi-timeframe momentum oscillator using weighted average of 3 periods
// Formula: UO = 100 * (4*avg1 + 2*avg2 + 1*avg3) / 7
// Where: avgN = SUM(BP, lenN) / SUM(TR, lenN)
//        BP (Buying Pressure) = close - min(low, prevClose)
//        TR (True Range) = max(high, prevClose) - min(low, prevClose)
// Bounded: 0 to 100
// ============================================================================

export interface UOResult {
  uo: LinePoint[];
}

export function computeUO(
  data: ComputeBar[],
  fastLength: number = 7,
  middleLength: number = 14,
  slowLength: number = 28
): UOResult {
  const uo: LinePoint[] = [];
  
  if (data.length === 0 || fastLength <= 0 || middleLength <= 0 || slowLength <= 0) {
    return { uo };
  }
  
  // Calculate BP (Buying Pressure) and TR (True Range) for each bar
  const bp: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const close = data[i].close;
    const high = data[i].high;
    const low = data[i].low;
    
    // For first bar, use current close as prevClose (TradingView behavior)
    const prevClose = i > 0 ? data[i - 1].close : close;
    
    // BP = close - min(low, prevClose)
    const minLowOrPrevClose = Math.min(low, prevClose);
    const bpValue = close - minLowOrPrevClose;
    
    // TR = max(high, prevClose) - min(low, prevClose)
    const maxHighOrPrevClose = Math.max(high, prevClose);
    const trValue = maxHighOrPrevClose - minLowOrPrevClose;
    
    bp.push(bpValue);
    tr.push(trValue);
  }
  
  // Calculate UO for each bar
  // Need at least slowLength bars for valid calculation
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Warmup: need slowLength bars
    if (i < slowLength - 1) {
      uo.push({ time });
      continue;
    }
    
    // Calculate rolling sums for each period
    // Sum from (i - len + 1) to i inclusive
    
    // Fast (len1)
    let bpSumFast = 0;
    let trSumFast = 0;
    for (let j = i - fastLength + 1; j <= i; j++) {
      bpSumFast += bp[j];
      trSumFast += tr[j];
    }
    
    // Middle (len2)
    let bpSumMiddle = 0;
    let trSumMiddle = 0;
    for (let j = i - middleLength + 1; j <= i; j++) {
      bpSumMiddle += bp[j];
      trSumMiddle += tr[j];
    }
    
    // Slow (len3)
    let bpSumSlow = 0;
    let trSumSlow = 0;
    for (let j = i - slowLength + 1; j <= i; j++) {
      bpSumSlow += bp[j];
      trSumSlow += tr[j];
    }
    
    // Calculate averages (handle division by zero)
    if (trSumFast === 0 || trSumMiddle === 0 || trSumSlow === 0) {
      uo.push({ time });
      continue;
    }
    
    const avg1 = bpSumFast / trSumFast;
    const avg2 = bpSumMiddle / trSumMiddle;
    const avg3 = bpSumSlow / trSumSlow;
    
    // UO = 100 * (4*avg1 + 2*avg2 + 1*avg3) / 7
    const uoValue = 100 * (4 * avg1 + 2 * avg2 + 1 * avg3) / 7;
    
    uo.push({ time, value: uoValue });
  }
  
  return { uo };
}

// ============================================================================
// Keltner Channels (KC)
// Volatility channels using EMA/SMA basis with ATR/TR/Range bands
// Formula:
//   basis = EMA(src, length) or SMA(src, length)
//   rangema = ATR(atrLength) | TR | RMA(high-low, length)
//   upper = basis + rangema * multiplier
//   lower = basis - rangema * multiplier
// ============================================================================

export type KCBandsStyle = "atr" | "tr" | "range";

export interface KeltnerChannelsResult {
  upper: LinePoint[];
  basis: LinePoint[];
  lower: LinePoint[];
}

export function computeKeltnerChannels(
  data: ComputeBar[],
  length: number = 20,
  multiplier: number = 2,
  source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4" = "close",
  useExp: boolean = true,
  bandsStyle: KCBandsStyle = "atr",
  atrLength: number = 10
): KeltnerChannelsResult {
  const upper: LinePoint[] = [];
  const basis: LinePoint[] = [];
  const lower: LinePoint[] = [];
  
  if (data.length === 0 || length <= 0 || atrLength <= 0) {
    return { upper, basis, lower };
  }
  
  // Get source values
  const getSrcValue = (bar: ComputeBar): number => {
    switch (source) {
      case "open": return bar.open;
      case "high": return bar.high;
      case "low": return bar.low;
      case "hl2": return (bar.high + bar.low) / 2;
      case "hlc3": return (bar.high + bar.low + bar.close) / 3;
      case "ohlc4": return (bar.open + bar.high + bar.low + bar.close) / 4;
      case "hlcc4": return (bar.high + bar.low + bar.close + bar.close) / 4;
      case "close":
      default: return bar.close;
    }
  };
  
  const srcValues: number[] = data.map(getSrcValue);
  
  // Calculate True Range for each bar (used by ATR and TR modes)
  const trueRanges: number[] = [];
  trueRanges.push(data[0].high - data[0].low); // First bar: high - low
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  
  // Calculate simple range (high - low) for Range mode
  const ranges: number[] = data.map(d => d.high - d.low);
  
  // Calculate basis (EMA or SMA of source)
  const basisValues: number[] = [];
  
  if (useExp) {
    // EMA: alpha = 2 / (length + 1)
    const alpha = 2 / (length + 1);
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        basisValues.push(srcValues[0]);
      } else {
        basisValues.push(basisValues[i - 1] + alpha * (srcValues[i] - basisValues[i - 1]));
      }
    }
  } else {
    // SMA
    for (let i = 0; i < data.length; i++) {
      if (i < length - 1) {
        basisValues.push(NaN);
      } else {
        let sum = 0;
        for (let j = i - length + 1; j <= i; j++) {
          sum += srcValues[j];
        }
        basisValues.push(sum / length);
      }
    }
  }
  
  // Calculate rangema based on bandsStyle
  const rangemaValues: number[] = [];
  
  if (bandsStyle === "atr") {
    // Average True Range: RMA of TR over atrLength
    for (let i = 0; i < data.length; i++) {
      if (i < atrLength - 1) {
        rangemaValues.push(NaN);
      } else if (i === atrLength - 1) {
        // First ATR: SMA of first atrLength TRs
        let sum = 0;
        for (let j = 0; j < atrLength; j++) {
          sum += trueRanges[j];
        }
        rangemaValues.push(sum / atrLength);
      } else {
        // RMA: (prev * (len-1) + current) / len
        const prev = rangemaValues[i - 1];
        rangemaValues.push((prev * (atrLength - 1) + trueRanges[i]) / atrLength);
      }
    }
  } else if (bandsStyle === "tr") {
    // True Range: just use TR directly (no smoothing)
    for (let i = 0; i < data.length; i++) {
      rangemaValues.push(trueRanges[i]);
    }
  } else {
    // Range: RMA of (high - low) over LENGTH (not atrLength!)
    for (let i = 0; i < data.length; i++) {
      if (i < length - 1) {
        rangemaValues.push(NaN);
      } else if (i === length - 1) {
        // First value: SMA of first length ranges
        let sum = 0;
        for (let j = 0; j < length; j++) {
          sum += ranges[j];
        }
        rangemaValues.push(sum / length);
      } else {
        // RMA: (prev * (len-1) + current) / len
        const prev = rangemaValues[i - 1];
        rangemaValues.push((prev * (length - 1) + ranges[i]) / length);
      }
    }
  }
  
  // Determine warmup based on mode
  let warmupLength: number;
  if (bandsStyle === "atr") {
    warmupLength = Math.max(length, atrLength);
  } else if (bandsStyle === "tr") {
    warmupLength = useExp ? 1 : length; // TR mode has no smoothing, so just basis warmup
  } else {
    warmupLength = length; // Range uses length for RMA
  }
  
  // Build output arrays
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    const basisVal = basisValues[i];
    const rangemaVal = rangemaValues[i];
    
    if (!Number.isFinite(basisVal) || !Number.isFinite(rangemaVal)) {
      upper.push({ time });
      basis.push({ time });
      lower.push({ time });
    } else {
      const upperVal = basisVal + rangemaVal * multiplier;
      const lowerVal = basisVal - rangemaVal * multiplier;
      
      upper.push({ time, value: upperVal });
      basis.push({ time, value: basisVal });
      lower.push({ time, value: lowerVal });
    }
  }
  
  return { upper, basis, lower };
}

// ============================================================================
// Volatility Stop (VStop) - TradingView Parity
// ============================================================================

export interface VStopPoint {
  time: UTCTimestamp;
  value: number;
  isUpTrend: boolean;
}

export interface VolatilityStopResult {
  points: VStopPoint[];
}

/**
 * Compute Volatility Stop (TradingView Exact Parity)
 * 
 * TradingView Pine Script logic (stateful, trend-flipping):
 *   atr_ = ATR(length)  // RMA-smoothed True Range
 *   
 *   max_ = max(max_[1], src)
 *   min_ = min(min_[1], src)
 *   
 *   isUpPrev = nz(isUp[1], true)
 *   stop = isUpPrev ? max_ - mult * atr_ : min_ + mult * atr_
 *   vstopPrev = nz(vstop[1])
 *   vstop1 = isUpPrev ? max(vstopPrev, stop) : min(vstopPrev, stop)
 *   isUp = (src - vstop1) >= 0
 *   
 *   trendChanged = isUp != isUpPrev
 *   max_ := trendChanged ? src : max_
 *   min_ := trendChanged ? src : min_
 *   vstop := trendChanged ? (isUp ? max_ - mult * atr_ : min_ + mult * atr_) : vstop1
 * 
 * @param data - OHLCV bars
 * @param length - ATR period (default 20)
 * @param multiplier - ATR multiplier (default 2)
 * @param source - Price source (default "close")
 * @returns Array of VStop points with trend direction
 */
export function computeVolatilityStop(
  data: ComputeBar[],
  length: number = 20,
  multiplier: number = 2,
  source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4" = "close"
): VolatilityStopResult {
  const points: VStopPoint[] = [];
  
  if (data.length === 0 || length <= 0) {
    return { points };
  }
  
  // Get source value for each bar
  const getSrcValue = (bar: ComputeBar): number => {
    switch (source) {
      case "open": return bar.open;
      case "high": return bar.high;
      case "low": return bar.low;
      case "hl2": return (bar.high + bar.low) / 2;
      case "hlc3": return (bar.high + bar.low + bar.close) / 3;
      case "ohlc4": return (bar.open + bar.high + bar.low + bar.close) / 4;
      case "hlcc4": return (bar.high + bar.low + bar.close + bar.close) / 4;
      case "close":
      default: return bar.close;
    }
  };
  
  // Calculate True Range for each bar
  const trueRanges: number[] = [];
  trueRanges.push(data[0].high - data[0].low); // First bar: high - low
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  
  // Calculate ATR using RMA (Wilder's Smoothing)
  const atrValues: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < length - 1) {
      atrValues.push(NaN);
    } else if (i === length - 1) {
      // First ATR: SMA of first `length` True Ranges
      let sum = 0;
      for (let j = 0; j < length; j++) {
        sum += trueRanges[j];
      }
      atrValues.push(sum / length);
    } else {
      // RMA: (prev * (len-1) + current) / len
      const prev = atrValues[i - 1];
      atrValues.push((prev * (length - 1) + trueRanges[i]) / length);
    }
  }
  
  // State variables for Volatility Stop
  let max_ = 0;
  let min_ = 0;
  let isUp = true;
  let vstop = 0;
  
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    const atr = atrValues[i];
    const src = getSrcValue(data[i]);
    
    // Warmup period: need valid ATR
    if (!Number.isFinite(atr)) {
      // Push whitespace equivalent - will be filtered to NaN
      points.push({ time, value: NaN, isUpTrend: true });
      continue;
    }
    
    // Initialize state on first valid bar
    if (i === length - 1) {
      // Start in uptrend, initialize max/min to current source
      max_ = src;
      min_ = src;
      isUp = true;
      vstop = max_ - multiplier * atr;
      points.push({ time, value: vstop, isUpTrend: isUp });
      continue;
    }
    
    // Calculate Volatility Stop for current bar
    const isUpPrev = isUp;
    const vstopPrev = vstop;
    
    // Update running max/min from previous bar
    const max1 = Math.max(max_, src);
    const min1 = Math.min(min_, src);
    
    // Calculate stop level based on previous trend
    const stop = isUpPrev ? max1 - multiplier * atr : min1 + multiplier * atr;
    
    // Apply trailing logic: only move stop in trend direction
    const vstop1 = isUpPrev ? Math.max(vstopPrev, stop) : Math.min(vstopPrev, stop);
    
    // Determine current trend: uptrend if source >= vstop1
    const isUpNew = (src - vstop1) >= 0;
    
    // Check for trend change
    const trendChanged = isUpNew !== isUpPrev;
    
    if (trendChanged) {
      // Reset max/min to current source on trend flip
      max_ = src;
      min_ = src;
      isUp = isUpNew;
      // Recalculate vstop with new trend direction
      vstop = isUp ? max_ - multiplier * atr : min_ + multiplier * atr;
    } else {
      // Continue trend, update max/min
      max_ = max1;
      min_ = min1;
      isUp = isUpNew;
      vstop = vstop1;
    }
    
    points.push({ time, value: vstop, isUpTrend: isUp });
  }
  
  return { points };
}

// ============================================================================
// BATCH 2: MOMENTUM INDICATORS
// ============================================================================

// ============================================================================
// Stochastic Oscillator
// ============================================================================

export interface StochasticResult {
  k: LinePoint[];
  d: LinePoint[];
}

export function computeStochastic(
  data: ComputeBar[],
  kPeriod: number = 14,
  kSmooth: number = 1,
  dSmooth: number = 3
): StochasticResult {
  const k: LinePoint[] = [];
  const d: LinePoint[] = [];
  
  if (kPeriod <= 0 || data.length < kPeriod) {
    return { k, d };
  }
  
  // Calculate raw %K
  const rawK: number[] = [];
  for (let i = kPeriod - 1; i < data.length; i++) {
    let highest = data[i].high;
    let lowest = data[i].low;
    for (let j = 1; j < kPeriod; j++) {
      highest = Math.max(highest, data[i - j].high);
      lowest = Math.min(lowest, data[i - j].low);
    }
    const range = highest - lowest;
    const stochK = range === 0 ? 50 : ((data[i].close - lowest) / range) * 100;
    rawK.push(stochK);
  }
  
  // Smooth %K (if kSmooth > 1)
  const smoothedK: number[] = [];
  if (kSmooth <= 1) {
    smoothedK.push(...rawK);
  } else {
    for (let i = kSmooth - 1; i < rawK.length; i++) {
      let sum = 0;
      for (let j = 0; j < kSmooth; j++) {
        sum += rawK[i - j];
      }
      smoothedK.push(sum / kSmooth);
    }
  }
  
  // Build %K line points
  const kOffset = kPeriod - 1 + (kSmooth > 1 ? kSmooth - 1 : 0);
  for (let i = 0; i < smoothedK.length; i++) {
    k.push({ time: data[i + kOffset].time, value: smoothedK[i] });
  }
  
  // Calculate %D (SMA of smoothed %K)
  if (smoothedK.length >= dSmooth) {
    for (let i = dSmooth - 1; i < smoothedK.length; i++) {
      let sum = 0;
      for (let j = 0; j < dSmooth; j++) {
        sum += smoothedK[i - j];
      }
      d.push({ time: data[i + kOffset].time, value: sum / dSmooth });
    }
  }
  
  return { k, d };
}

// ============================================================================
// Stochastic RSI
// ============================================================================

export interface StochRSIResult {
  k: LinePoint[];
  d: LinePoint[];
}

export function computeStochRSI(
  data: ComputeBar[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
  kSmooth: number = 3,
  dSmooth: number = 3,
  source: SourceType = "close"
): StochRSIResult {
  const k: LinePoint[] = [];
  const d: LinePoint[] = [];
  
  // First calculate RSI with the specified source
  const rsiResult = computeRSI(data, rsiPeriod, source);
  // Filter out NaN values from RSI for stochastic calculation
  const rsiValues = rsiResult.rsi.filter(p => Number.isFinite(p.value));
  
  if (rsiValues.length < stochPeriod) {
    return { k, d };
  }
  
  // Apply Stochastic to RSI values
  // stochRSI = (RSI - lowest(RSI, stochPeriod)) / (highest(RSI, stochPeriod) - lowest(RSI, stochPeriod)) * 100
  const rawK: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    let highest = rsiValues[i].value;
    let lowest = rsiValues[i].value;
    for (let j = 1; j < stochPeriod; j++) {
      highest = Math.max(highest, rsiValues[i - j].value);
      lowest = Math.min(lowest, rsiValues[i - j].value);
    }
    const range = highest - lowest;
    // TV behavior: when range is 0, set stochK to 0 (not 50)
    const stochK = range === 0 ? 0 : ((rsiValues[i].value - lowest) / range) * 100;
    rawK.push(stochK);
  }
  
  // Smooth %K with SMA
  const smoothedK: number[] = [];
  if (kSmooth <= 1) {
    smoothedK.push(...rawK);
  } else {
    for (let i = kSmooth - 1; i < rawK.length; i++) {
      let sum = 0;
      for (let j = 0; j < kSmooth; j++) {
        sum += rawK[i - j];
      }
      smoothedK.push(sum / kSmooth);
    }
  }
  
  // Build %K line with proper time alignment
  const kOffset = stochPeriod - 1 + (kSmooth > 1 ? kSmooth - 1 : 0);
  for (let i = 0; i < smoothedK.length; i++) {
    const rsiIdx = i + kOffset;
    if (rsiIdx < rsiValues.length) {
      k.push({ time: rsiValues[rsiIdx].time, value: smoothedK[i] });
    }
  }
  
  // Calculate %D (SMA of %K)
  if (smoothedK.length >= dSmooth) {
    for (let i = dSmooth - 1; i < smoothedK.length; i++) {
      let sum = 0;
      for (let j = 0; j < dSmooth; j++) {
        sum += smoothedK[i - j];
      }
      const rsiIdx = i + kOffset;
      if (rsiIdx < rsiValues.length) {
        d.push({ time: rsiValues[rsiIdx].time, value: sum / dSmooth });
      }
    }
  }
  
  return { k, d };
}

// ============================================================================
// CCI - Commodity Channel Index (TradingView Parity)
// ============================================================================

/**
 * CCI smoothing type
 * - none: No smoothing (CCI-MA is empty)
 * - sma/ema/smma/wma/vwma: Apply MA to CCI values
 * - sma_bb: SMA + Bollinger Bands on CCI
 */
export type CCISmoothingType = "none" | "sma" | "ema" | "smma" | "wma" | "vwma" | "sma_bb";

/**
 * CCI result with all TV-style outputs
 */
export interface CCIResult {
  cci: LinePoint[];
  cciMa: LinePoint[];
  bbUpper: LinePoint[];
  bbLower: LinePoint[];
  upperBand: LinePoint[];
  middleBand: LinePoint[];
  lowerBand: LinePoint[];
}

/**
 * Compute CCI with TradingView parity
 * 
 * Formula:
 * - TP = Source value (default HLC3 = (H+L+C)/3)
 * - SMA_TP = SMA(TP, length)
 * - MeanDev = SMA(|TP - SMA_TP|, length)
 * - CCI = (TP - SMA_TP) / (0.015 * MeanDev)
 * 
 * Features:
 * - Source selection (close, open, high, low, hl2, hlc3, ohlc4)
 * - Smoothing MA: None, SMA, EMA, SMMA (RMA), WMA, VWMA, SMA+BB
 * - Static bands: +100, 0, -100 (configurable)
 * - Full-length output with NaN for warmup
 * 
 * @param data - OHLCV bars
 * @param length - CCI period (default 20)
 * @param source - Price source (default hlc3)
 * @param smoothingType - Smoothing type for CCI-MA
 * @param smoothingLength - Length for smoothing MA
 * @param bbStdDev - BB standard deviation multiplier
 * @param upperBandValue - Upper band level (default 100)
 * @param middleBandValue - Middle band level (default 0)
 * @param lowerBandValue - Lower band level (default -100)
 */
export function computeCCI(
  data: ComputeBar[],
  length: number = 20,
  source: SourceType = "hlc3",
  smoothingType: CCISmoothingType = "none",
  smoothingLength: number = 14,
  bbStdDev: number = 2,
  upperBandValue: number = 100,
  middleBandValue: number = 0,
  lowerBandValue: number = -100
): CCIResult {
  const cci: LinePoint[] = [];
  const cciMa: LinePoint[] = [];
  const bbUpper: LinePoint[] = [];
  const bbLower: LinePoint[] = [];
  const upperBand: LinePoint[] = [];
  const middleBand: LinePoint[] = [];
  const lowerBand: LinePoint[] = [];
  
  if (length <= 0 || data.length === 0) {
    return { cci, cciMa, bbUpper, bbLower, upperBand, middleBand, lowerBand };
  }
  
  const constant = 0.015; // Lambert's constant
  
  // Build raw CCI values with full-length output
  const cciRaw: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    
    // Static bands (constant for all bars)
    upperBand.push({ time: bar.time, value: upperBandValue });
    middleBand.push({ time: bar.time, value: middleBandValue });
    lowerBand.push({ time: bar.time, value: lowerBandValue });
    
    // CCI calculation needs enough warmup
    if (i < length - 1) {
      cci.push({ time: bar.time, value: NaN });
      cciRaw.push(NaN);
      continue;
    }
    
    // Get source values for the period
    const sourceValues: number[] = [];
    for (let j = 0; j < length; j++) {
      const b = data[i - j];
      sourceValues.push(getSource(b, source));
    }
    
    // SMA of source (Typical Price for hlc3)
    const smaSource = sourceValues.reduce((a, b) => a + b, 0) / length;
    
    // Mean Deviation
    const meanDev = sourceValues.reduce((sum, val) => sum + Math.abs(val - smaSource), 0) / length;
    
    // CCI
    const currentSource = sourceValues[0];
    const cciValue = meanDev === 0 ? 0 : (currentSource - smaSource) / (constant * meanDev);
    
    cci.push({ time: bar.time, value: cciValue });
    cciRaw.push(cciValue);
  }
  
  // Compute CCI-MA if smoothing is enabled
  if (smoothingType !== "none" && smoothingLength > 0) {
    const maType = smoothingType === "sma_bb" ? "sma" : smoothingType;
    
    // Apply MA to CCI values
    for (let i = 0; i < data.length; i++) {
      const bar = data[i];
      
      // Need enough CCI values for MA
      if (i < length - 1 + smoothingLength - 1) {
        cciMa.push({ time: bar.time, value: NaN });
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
        continue;
      }
      
      // Get CCI values for smoothing window
      const cciWindow: number[] = [];
      for (let j = 0; j < smoothingLength; j++) {
        const idx = i - j;
        if (idx >= 0 && Number.isFinite(cciRaw[idx])) {
          cciWindow.push(cciRaw[idx]);
        }
      }
      
      if (cciWindow.length < smoothingLength) {
        cciMa.push({ time: bar.time, value: NaN });
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
        continue;
      }
      
      let maValue: number;
      
      switch (maType) {
        case "sma":
          maValue = cciWindow.reduce((a, b) => a + b, 0) / smoothingLength;
          break;
        case "ema": {
          // For EMA on CCI values, use recursive approach starting from beginning
          const k = 2 / (smoothingLength + 1);
          maValue = cciWindow.reduceRight((prev, curr) => curr * k + prev * (1 - k));
          break;
        }
        case "smma": {
          // SMMA (RMA) - similar to Wilder's smoothing
          const alpha = 1 / smoothingLength;
          maValue = cciWindow.reduceRight((prev, curr) => curr * alpha + prev * (1 - alpha));
          break;
        }
        case "wma": {
          // Weighted MA - most recent has highest weight
          let weightSum = 0;
          let valueSum = 0;
          for (let w = 0; w < smoothingLength; w++) {
            const weight = smoothingLength - w;
            valueSum += cciWindow[w] * weight;
            weightSum += weight;
          }
          maValue = valueSum / weightSum;
          break;
        }
        case "vwma":
          // VWMA not applicable to CCI (no volume), fall back to SMA
          maValue = cciWindow.reduce((a, b) => a + b, 0) / smoothingLength;
          break;
        default:
          maValue = cciWindow.reduce((a, b) => a + b, 0) / smoothingLength;
      }
      
      cciMa.push({ time: bar.time, value: maValue });
      
      // BB on CCI if sma_bb mode
      if (smoothingType === "sma_bb") {
        // Standard deviation of CCI values
        const mean = cciWindow.reduce((a, b) => a + b, 0) / smoothingLength;
        const variance = cciWindow.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / smoothingLength;
        const stdDev = Math.sqrt(variance);
        
        bbUpper.push({ time: bar.time, value: maValue + bbStdDev * stdDev });
        bbLower.push({ time: bar.time, value: maValue - bbStdDev * stdDev });
      } else {
        bbUpper.push({ time: bar.time, value: NaN });
        bbLower.push({ time: bar.time, value: NaN });
      }
    }
  } else {
    // No smoothing - fill with NaN/whitespace
    for (let i = 0; i < data.length; i++) {
      cciMa.push({ time: data[i].time, value: NaN });
      bbUpper.push({ time: data[i].time, value: NaN });
      bbLower.push({ time: data[i].time, value: NaN });
    }
  }
  
  return { cci, cciMa, bbUpper, bbLower, upperBand, middleBand, lowerBand };
}

// ============================================================================
// Parabolic SAR (TradingView-style)
// Wilder's Parabolic Stop and Reverse (SAR)
// ============================================================================

/** SAR plot style (TradingView dropdown options) */
export type SARPlotStyle = 
  | "circles" 
  | "line" 
  | "lineWithBreaks" 
  | "stepLine" 
  | "stepLineWithBreaks" 
  | "cross" 
  | "columns";

/** SAR point with trend info for line break detection */
export interface SARPoint {
  time: UTCTimestamp;
  value: number;
  /** true = uptrend (SAR below price), false = downtrend (SAR above price) */
  isUpTrend: boolean;
}

/** Result structure for SAR computation */
export interface SARResult {
  /** SAR values with trend info */
  points: SARPoint[];
}

/**
 * Compute Parabolic SAR (Stop and Reverse)
 * Returns SAR values with trend direction for each bar.
 * Trend direction is needed to break lines at reversal points.
 * 
 * @param data - OHLC bars
 * @param start - Initial acceleration factor (default: 0.02)
 * @param increment - AF increment on new extreme (default: 0.02)
 * @param maxValue - Maximum AF cap (default: 0.2)
 * @returns SARResult with points array containing value and trend
 */
export function computeSAR(
  data: ComputeBar[],
  start: number = 0.02,
  increment: number = 0.02,
  maxValue: number = 0.2
): SARResult {
  const points: SARPoint[] = [];
  if (data.length < 2) return { points };

  // Guard: Ensure positive parameters
  start = Math.max(0.001, start);
  increment = Math.max(0.001, increment);
  maxValue = Math.max(increment, maxValue);

  // Determine initial trend from first two bars
  let isUpTrend = data[1].close >= data[0].close;
  let af = start;
  let ep = isUpTrend ? data[0].high : data[0].low;
  let sar = isUpTrend ? data[0].low : data[0].high;

  // First bar: output initial SAR
  points.push({ time: data[0].time, value: sar, isUpTrend });

  for (let i = 1; i < data.length; i++) {
    const bar = data[i];
    const prevBar = data[i - 1];

    // Calculate new SAR
    let newSar = sar + af * (ep - sar);
    let newIsUpTrend = isUpTrend;

    if (isUpTrend) {
      // In uptrend: SAR must not be above prior two lows
      newSar = Math.min(newSar, prevBar.low);
      if (i > 1) {
        newSar = Math.min(newSar, data[i - 2].low);
      }

      // Check for reversal: price crosses below SAR
      if (bar.low < newSar) {
        // Reverse to downtrend
        newIsUpTrend = false;
        newSar = ep; // SAR becomes previous EP
        ep = bar.low;
        af = start;
      } else {
        // Update EP and AF if new high
        if (bar.high > ep) {
          ep = bar.high;
          af = Math.min(af + increment, maxValue);
        }
      }
    } else {
      // In downtrend: SAR must not be below prior two highs
      newSar = Math.max(newSar, prevBar.high);
      if (i > 1) {
        newSar = Math.max(newSar, data[i - 2].high);
      }

      // Check for reversal: price crosses above SAR
      if (bar.high > newSar) {
        // Reverse to uptrend
        newIsUpTrend = true;
        newSar = ep; // SAR becomes previous EP
        ep = bar.high;
        af = start;
      } else {
        // Update EP and AF if new low
        if (bar.low < ep) {
          ep = bar.low;
          af = Math.min(af + increment, maxValue);
        }
      }
    }

    // Guard against NaN/Infinity
    if (!Number.isFinite(newSar)) {
      newSar = sar; // Fallback to previous SAR
    }

    sar = newSar;
    isUpTrend = newIsUpTrend;
    points.push({ time: bar.time, value: sar, isUpTrend });
  }

  return { points };
}

/**
 * Legacy computePSAR - wrapper for backward compatibility
 * @deprecated Use computeSAR instead
 */
export function computePSAR(
  data: ComputeBar[],
  start: number = 0.02,
  increment: number = 0.02,
  maximum: number = 0.2
): LinePoint[] {
  const result = computeSAR(data, start, increment, maximum);
  return result.points.map(p => ({ time: p.time, value: p.value }));
}

// ============================================================================
// Supertrend
// ATR-based trend following indicator (TradingView-style)
// ============================================================================

export interface SupertrendResult {
  up: LinePoint[];    // Uptrend line (green, with nulls for downtrend periods)
  down: LinePoint[];  // Downtrend line (red, with nulls for uptrend periods)
}

/**
 * Compute Supertrend indicator
 * @param data - OHLC bars
 * @param atrLength - ATR period (default: 10)
 * @param factor - Multiplier for ATR bands (default: 3.0)
 * @returns SupertrendResult with up and down line arrays (same length as input data)
 */
export function computeSupertrend(
  data: ComputeBar[],
  atrLength: number = 10,
  factor: number = 3.0
): SupertrendResult {
  const up: LinePoint[] = [];
  const down: LinePoint[] = [];
  
  if (data.length === 0) {
    return { up, down };
  }

  // Guard: Ensure positive parameters
  atrLength = Math.max(1, Math.floor(atrLength));
  factor = Math.max(0.1, factor);

  // Calculate True Range for each bar
  const tr: number[] = [];
  tr.push(data[0].high - data[0].low); // First bar: just H-L
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);
  }

  // Calculate ATR using Wilder's RMA
  const atr: number[] = new Array(data.length).fill(NaN);
  
  if (data.length >= atrLength) {
    // First ATR: SMA of first atrLength TRs
    let atrSum = 0;
    for (let i = 0; i < atrLength; i++) {
      atrSum += tr[i];
    }
    atr[atrLength - 1] = atrSum / atrLength;
    
    // Subsequent ATRs: Wilder's smoothing
    for (let i = atrLength; i < data.length; i++) {
      const prevAtr = atr[i - 1];
      atr[i] = (prevAtr * (atrLength - 1) + tr[i]) / atrLength;
    }
  }

  // Calculate Supertrend - FULL LENGTH output (same as input data)
  // Warmup period gets NaN values
  let prevFinalUpperBand = 0;
  let prevFinalLowerBand = 0;
  let prevSupertrend = 0;
  let isUptrend = true;
  const startIdx = atrLength - 1; // First valid ATR index

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    
    // Warmup period: no valid ATR yet
    if (i < startIdx || !Number.isFinite(atr[i])) {
      up.push({ time: bar.time, value: NaN });
      down.push({ time: bar.time, value: NaN });
      continue;
    }
    
    const currentAtr = atr[i];
    
    // HL/2 (typical price / source)
    const hl2 = (bar.high + bar.low) / 2;
    
    // Basic bands
    const basicUpperBand = hl2 + (factor * currentAtr);
    const basicLowerBand = hl2 - (factor * currentAtr);
    
    // Final bands with trend persistence
    let finalUpperBand: number;
    let finalLowerBand: number;
    
    if (i === startIdx) {
      // First bar: use basic bands
      finalUpperBand = basicUpperBand;
      finalLowerBand = basicLowerBand;
      // Initial trend: assume uptrend if close > hl2
      isUptrend = bar.close >= hl2;
      prevSupertrend = isUptrend ? finalLowerBand : finalUpperBand;
    } else {
      const prevClose = data[i - 1].close;
      
      // Final upper band: can only go down (tighten) unless broken
      if (basicUpperBand < prevFinalUpperBand || prevClose > prevFinalUpperBand) {
        finalUpperBand = basicUpperBand;
      } else {
        finalUpperBand = prevFinalUpperBand;
      }
      
      // Final lower band: can only go up (tighten) unless broken
      if (basicLowerBand > prevFinalLowerBand || prevClose < prevFinalLowerBand) {
        finalLowerBand = basicLowerBand;
      } else {
        finalLowerBand = prevFinalLowerBand;
      }
      
      // Determine trend direction
      if (prevSupertrend === prevFinalUpperBand) {
        // Was in downtrend
        if (bar.close > finalUpperBand) {
          isUptrend = true;
        } else {
          isUptrend = false;
        }
      } else {
        // Was in uptrend
        if (bar.close < finalLowerBand) {
          isUptrend = false;
        } else {
          isUptrend = true;
        }
      }
    }
    
    // Current supertrend value
    const supertrend = isUptrend ? finalLowerBand : finalUpperBand;
    
    // Guard against NaN/Infinity
    const safeValue = Number.isFinite(supertrend) ? supertrend : prevSupertrend;
    
    // Output with nulls for inactive line
    if (isUptrend) {
      up.push({ time: bar.time, value: safeValue });
      down.push({ time: bar.time, value: NaN }); // Will be filtered to null
    } else {
      up.push({ time: bar.time, value: NaN }); // Will be filtered to null
      down.push({ time: bar.time, value: safeValue });
    }
    
    // Store for next iteration
    prevFinalUpperBand = finalUpperBand;
    prevFinalLowerBand = finalLowerBand;
    prevSupertrend = supertrend;
  }

  return { up, down };
}

// ============================================================================
// ROC - Rate of Change
// ============================================================================

export function computeROC(
  data: ComputeBar[],
  period: number = 9,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length <= period) return result;
  
  for (let i = period; i < data.length; i++) {
    const current = getSource(data[i], source);
    const past = getSource(data[i - period], source);
    const roc = past === 0 ? 0 : ((current - past) / past) * 100;
    result.push({ time: data[i].time, value: roc });
  }
  
  return result;
}

// ============================================================================
// Momentum
// ============================================================================

export function computeMomentum(
  data: ComputeBar[],
  period: number = 10,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length <= period) return result;
  
  for (let i = period; i < data.length; i++) {
    const current = getSource(data[i], source);
    const past = getSource(data[i - period], source);
    result.push({ time: data[i].time, value: current - past });
  }
  
  return result;
}

// ============================================================================
// Williams %R
// ============================================================================

export function computeWilliamsR(
  data: ComputeBar[],
  period: number = 14
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length < period) return result;
  
  for (let i = period - 1; i < data.length; i++) {
    let highest = data[i].high;
    let lowest = data[i].low;
    for (let j = 1; j < period; j++) {
      highest = Math.max(highest, data[i - j].high);
      lowest = Math.min(lowest, data[i - j].low);
    }
    const range = highest - lowest;
    // Williams %R is inverted (0 to -100)
    const willR = range === 0 ? -50 : ((highest - data[i].close) / range) * -100;
    result.push({ time: data[i].time, value: willR });
  }
  
  return result;
}

// ============================================================================
// Moving Average Ribbon
// ============================================================================

/** MA type for ribbon */
export type MARibbonType = "ema" | "sma";

/** Result containing all 8 MA lines for the ribbon */
export interface MARibbonResult {
  ma1: LinePoint[];
  ma2: LinePoint[];
  ma3: LinePoint[];
  ma4: LinePoint[];
  ma5: LinePoint[];
  ma6: LinePoint[];
  ma7: LinePoint[];
  ma8: LinePoint[];
}

/** Result containing 4 MA lines for the TV-style ribbon */
export interface MARibbon4Result {
  ma1: LinePoint[];
  ma2: LinePoint[];
  ma3: LinePoint[];
  ma4: LinePoint[];
}

/**
 * Generic MA computation helper - computes multiple MAs with arbitrary periods
 * @param data - OHLCV bar data
 * @param maType - Type of moving average ("ema" or "sma")
 * @param periods - Array of periods to compute
 * @param source - Price source (default "close")
 * @returns Array of LinePoint arrays, one per period
 */
function computeMultipleMAs(
  data: ComputeBar[],
  maType: MARibbonType,
  periods: number[],
  source: SourceType
): LinePoint[][] {
  const computeMA = maType === "ema" 
    ? (period: number) => computeEMA(data, period, source)
    : (period: number) => computeSMA(data, period, source);
  
  return periods.map(period => computeMA(period));
}

/**
 * Computes Moving Average Ribbon - 8 MAs with sequential periods
 * Default: EMA with periods 20, 25, 30, 35, 40, 45, 50, 55
 * Creates a "ribbon" effect showing trend strength and direction
 * 
 * When MAs are:
 * - Stacked in order (short on top in uptrend): Strong trend
 * - Interweaving/crossing: Weak trend or reversal
 * - Wide spread: Strong momentum
 * - Tight/compressed: Consolidation
 * 
 * @param data - OHLCV bar data
 * @param maType - Type of moving average ("ema" or "sma")
 * @param basePeriod - Starting period for shortest MA (default 20)
 * @param periodStep - Step between each MA period (default 5)
 * @param source - Price source (default "close")
 * @returns 8 MA lines as MARibbonResult
 */
export function computeMARibbon(
  data: ComputeBar[],
  maType: MARibbonType = "ema",
  basePeriod: number = 20,
  periodStep: number = 5,
  source: SourceType = "close"
): MARibbonResult {
  // Calculate 8 periods: 20, 25, 30, 35, 40, 45, 50, 55 (with defaults)
  const periods = Array.from({ length: 8 }, (_, i) => basePeriod + i * periodStep);
  const mas = computeMultipleMAs(data, maType, periods, source);
  
  return {
    ma1: mas[0],
    ma2: mas[1],
    ma3: mas[2],
    ma4: mas[3],
    ma5: mas[4],
    ma6: mas[5],
    ma7: mas[6],
    ma8: mas[7],
  };
}

/**
 * Computes MA Ribbon (4) - TV-style with custom periods per line
 * Default: EMA with periods 20, 50, 100, 200 (classic TV multi-MA setup)
 * 
 * Allows exact period control per MA line, matching TradingView's flexibility.
 * 
 * @param data - OHLCV bar data
 * @param maType - Type of moving average ("ema" or "sma")
 * @param len1 - Period for MA 1 (default 20)
 * @param len2 - Period for MA 2 (default 50)
 * @param len3 - Period for MA 3 (default 100)
 * @param len4 - Period for MA 4 (default 200)
 * @param source - Price source (default "close")
 * @returns 4 MA lines as MARibbon4Result
 */
export function computeMARibbon4(
  data: ComputeBar[],
  maType: MARibbonType = "ema",
  len1: number = 20,
  len2: number = 50,
  len3: number = 100,
  len4: number = 200,
  source: SourceType = "close"
): MARibbon4Result {
  const periods = [len1, len2, len3, len4];
  const mas = computeMultipleMAs(data, maType, periods, source);
  
  return {
    ma1: mas[0],
    ma2: mas[1],
    ma3: mas[2],
    ma4: mas[3],
  };
}

// ============================================================================
// Ichimoku Cloud (Ichimoku Kinko Hyo)
// ============================================================================

/** Result containing all Ichimoku components */
export interface IchimokuResult {
  /** Tenkan-sen (Conversion Line) - no shift */
  tenkan: LinePoint[];
  /** Kijun-sen (Base Line) - no shift */
  kijun: LinePoint[];
  /** Senkou Span A (Leading Span A) - shifted forward by displacement */
  senkouA: LinePoint[];
  /** Senkou Span B (Leading Span B) - shifted forward by displacement */
  senkouB: LinePoint[];
  /** Chikou Span (Lagging Span) - shifted backward by displacement */
  chikou: LinePoint[];
}

/**
 * Helper: Calculate Donchian midpoint (highest high + lowest low) / 2 over N bars
 */
function donchianMidpoint(data: ComputeBar[], index: number, period: number): number {
  let highest = -Infinity;
  let lowest = Infinity;
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    highest = Math.max(highest, data[i].high);
    lowest = Math.min(lowest, data[i].low);
  }
  return (highest + lowest) / 2;
}

/**
 * Computes Ichimoku Cloud (Ichimoku Kinko Hyo)
 * 
 * The Ichimoku indicator consists of five lines:
 * - Tenkan-sen (Conversion Line): 9-period Donchian midpoint
 * - Kijun-sen (Base Line): 26-period Donchian midpoint
 * - Senkou Span A: (Tenkan + Kijun) / 2, plotted 26 periods ahead
 * - Senkou Span B: 52-period Donchian midpoint, plotted 26 periods ahead
 * - Chikou Span: Close price, plotted 26 periods behind
 * 
 * The Cloud (Kumo) is the area between Senkou Span A and B.
 * 
 * @param data - OHLCV bar data
 * @param tenkanPeriod - Conversion line period (default 9)
 * @param kijunPeriod - Base line period (default 26)
 * @param senkouBPeriod - Senkou Span B period (default 52)
 * @param displacement - Forward/backward shift for spans (default 26)
 * @returns Ichimoku lines with proper shifts applied
 */
export function computeIchimoku(
  data: ComputeBar[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouBPeriod: number = 52,
  displacement: number = 26
): IchimokuResult {
  const tenkan: LinePoint[] = [];
  const kijun: LinePoint[] = [];
  const senkouA: LinePoint[] = [];
  const senkouB: LinePoint[] = [];
  const chikou: LinePoint[] = [];
  
  if (data.length === 0) {
    return { tenkan, kijun, senkouA, senkouB, chikou };
  }
  
  // Calculate Tenkan and Kijun for each bar
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Tenkan-sen: 9-period Donchian midpoint
    if (i >= tenkanPeriod - 1) {
      tenkan.push({ time, value: donchianMidpoint(data, i, tenkanPeriod) });
    } else {
      tenkan.push({ time, value: NaN }); // Warmup period
    }
    
    // Kijun-sen: 26-period Donchian midpoint
    if (i >= kijunPeriod - 1) {
      kijun.push({ time, value: donchianMidpoint(data, i, kijunPeriod) });
    } else {
      kijun.push({ time, value: NaN }); // Warmup period
    }
  }
  
  // Calculate Senkou Span A and B (need to shift forward by displacement)
  // These are calculated from current values but plotted ahead
  // We need to extend the time axis forward for the leading spans
  
  // First, calculate the raw values at each bar
  const rawSenkouA: { time: UTCTimestamp; value: number }[] = [];
  const rawSenkouB: { time: UTCTimestamp; value: number }[] = [];
  
  for (let i = 0; i < data.length; i++) {
    // Senkou Span A = (Tenkan + Kijun) / 2
    const tenkanVal = tenkan[i]?.value;
    const kijunVal = kijun[i]?.value;
    if (Number.isFinite(tenkanVal) && Number.isFinite(kijunVal)) {
      rawSenkouA.push({ time: data[i].time, value: (tenkanVal + kijunVal) / 2 });
    } else {
      rawSenkouA.push({ time: data[i].time, value: NaN });
    }
    
    // Senkou Span B = 52-period Donchian midpoint
    if (i >= senkouBPeriod - 1) {
      rawSenkouB.push({ time: data[i].time, value: donchianMidpoint(data, i, senkouBPeriod) });
    } else {
      rawSenkouB.push({ time: data[i].time, value: NaN });
    }
  }
  
  // Shift Senkou spans forward by displacement periods
  // The value calculated at bar i is plotted at bar i + displacement
  // For future bars beyond data, we need to extrapolate time
  const lastTime = data[data.length - 1].time;
  const timeStep = data.length > 1 ? (data[data.length - 1].time - data[data.length - 2].time) : 86400; // Default to 1 day
  
  // Create shifted Senkou spans
  // Fill initial displacement bars with NaN (no data to shift here yet)
  for (let i = 0; i < displacement; i++) {
    senkouA.push({ time: data[i].time, value: NaN });
    senkouB.push({ time: data[i].time, value: NaN });
  }
  
  // Map values: data[i] -> position i + displacement
  for (let i = 0; i < data.length; i++) {
    const targetIndex = i + displacement;
    let targetTime: UTCTimestamp;
    
    if (targetIndex < data.length) {
      targetTime = data[targetIndex].time;
    } else {
      // Extrapolate future time
      const futureOffset = targetIndex - data.length + 1;
      targetTime = (lastTime + futureOffset * timeStep) as UTCTimestamp;
    }
    
    senkouA.push({ time: targetTime, value: rawSenkouA[i].value });
    senkouB.push({ time: targetTime, value: rawSenkouB[i].value });
  }
  
  // Calculate Chikou Span (close shifted backward by displacement)
  // Value at bar i is plotted at bar i - displacement
  // This means we have valid Chikou from bar 0 but it represents data from bar +displacement
  for (let i = 0; i < data.length; i++) {
    const sourceIndex = i + displacement;
    if (sourceIndex < data.length) {
      chikou.push({ time: data[i].time, value: data[sourceIndex].close });
    } else {
      chikou.push({ time: data[i].time, value: NaN }); // No future data
    }
  }
  
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

// ============================================================================
// Donchian Channels (TradingView Parity)
// ============================================================================

export interface DonchianChannelsResult {
  upper: LinePoint[];
  basis: LinePoint[];
  lower: LinePoint[];
}

/**
 * Compute Donchian Channels
 * 
 * TradingView parity:
 * - Upper = Highest High over N periods
 * - Lower = Lowest Low over N periods
 * - Basis = (Upper + Lower) / 2
 * 
 * Warmup: First (length-1) bars have NaN values
 * 
 * @param data - OHLCV bars
 * @param length - Lookback period (default 20)
 * @returns Upper, Lower, and Basis line points
 */
export function computeDonchianChannels(
  data: ComputeBar[],
  length: number = 20
): DonchianChannelsResult {
  const upper: LinePoint[] = [];
  const basis: LinePoint[] = [];
  const lower: LinePoint[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Warmup period: need `length` bars to calculate
    if (i < length - 1) {
      upper.push({ time, value: NaN });
      basis.push({ time, value: NaN });
      lower.push({ time, value: NaN });
      continue;
    }
    
    // Calculate highest high and lowest low over the lookback window
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    
    for (let j = i - length + 1; j <= i; j++) {
      const bar = data[j];
      if (bar.high > highestHigh) highestHigh = bar.high;
      if (bar.low < lowestLow) lowestLow = bar.low;
    }
    
    const basisValue = (highestHigh + lowestLow) / 2;
    
    upper.push({ time, value: highestHigh });
    basis.push({ time, value: basisValue });
    lower.push({ time, value: lowestLow });
  }
  
  return { upper, basis, lower };
}

// ============================================================================
// Fisher Transform (TradingView Parity)
// ============================================================================

export interface FisherTransformResult {
  fisher: LinePoint[];
  trigger: LinePoint[];
}

/**
 * Compute Fisher Transform (TradingView/Ehlers Exact Parity)
 * 
 * TradingView Pine Script formula:
 *   hl2 = (high + low) / 2
 *   highestHl2 = ta.highest(hl2, length)
 *   lowestHl2 = ta.lowest(hl2, length)
 *   value := 0.33 * 2 * ((hl2 - lowestHl2) / (highestHl2 - lowestHl2) - 0.5) + 0.67 * nz(value[1])
 *   value := math.max(math.min(value, 0.999), -0.999)
 *   fisher := 0.5 * math.log((1 + value) / (1 - value)) + 0.5 * nz(fisher[1])
 *   trigger := fisher[1]
 * 
 * Key points:
 * - Coefficients are 0.33*2=0.66 for new value and 0.67 for previous (total ~1.33 intentional EMA-like)
 * - BUT the input is ((ratio) - 0.5) which ranges [-0.5, 0.5], NOT [-1, 1]
 * - So: 0.66 * (ratio - 0.5) + 0.67 * prev where ratio = (hl2-low)/(high-low) in [0,1]
 * 
 * @param data - OHLCV bars
 * @param length - Lookback period (default 9)
 * @returns Fisher and Trigger line points
 */
export function computeFisherTransform(
  data: ComputeBar[],
  length: number = 9
): FisherTransformResult {
  const fisher: LinePoint[] = [];
  const trigger: LinePoint[] = [];
  
  if (data.length === 0) {
    return { fisher, trigger };
  }
  
  // Calculate HL2 for all bars
  const hl2Values: number[] = data.map(bar => (bar.high + bar.low) / 2);
  
  // Running state (like nz(value[1]) and nz(fisher[1]) in Pine)
  let value = 0;      // Normalized & smoothed value
  let fish = 0;       // Fisher Transform output
  let prevFish = 0;   // Previous Fisher (for trigger)
  
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Warmup period: need `length` bars for highest/lowest
    if (i < length - 1) {
      fisher.push({ time, value: NaN });
      trigger.push({ time, value: NaN });
      continue;
    }
    
    // Find highest and lowest HL2 over lookback period
    let highestHl2 = -Infinity;
    let lowestHl2 = Infinity;
    
    for (let j = i - length + 1; j <= i; j++) {
      if (hl2Values[j] > highestHl2) highestHl2 = hl2Values[j];
      if (hl2Values[j] < lowestHl2) lowestHl2 = hl2Values[j];
    }
    
    // Calculate normalized ratio [0, 1] -> then shift to [-0.5, 0.5]
    // Handle division by zero (when high == low)
    let ratio: number;
    if (highestHl2 === lowestHl2) {
      // When range is zero, keep previous value (nz behavior)
      ratio = 0.5; // Neutral position
    } else {
      ratio = (hl2Values[i] - lowestHl2) / (highestHl2 - lowestHl2);
    }
    
    // TradingView formula: value := 0.33 * 2 * (ratio - 0.5) + 0.67 * nz(value[1])
    // Simplifies to: value = 0.66 * (ratio - 0.5) + 0.67 * value
    value = 0.66 * (ratio - 0.5) + 0.67 * value;
    
    // Clamp to prevent ln(0) or ln(negative)
    if (value > 0.999) value = 0.999;
    if (value < -0.999) value = -0.999;
    
    // Fisher Transform: 0.5 * ln((1 + value) / (1 - value)) + 0.5 * fish[1]
    fish = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * fish;
    
    fisher.push({ time, value: fish });
    
    // Trigger = Fisher[1] (previous bar's Fisher value)
    // On first valid bar (i == length - 1), trigger is NaN (no previous)
    if (i === length - 1) {
      trigger.push({ time, value: NaN });
    } else {
      trigger.push({ time, value: prevFish });
    }
    
    // Store for next iteration
    prevFish = fish;
  }
  
  return { fisher, trigger };
}

// ============================================================================
// Choppiness Index (CHOP) - TradingView Parity
// ============================================================================

export interface ChopResult {
  chop: LinePoint[];
  upperBand: LinePoint[];
  middleBand: LinePoint[];
  lowerBand: LinePoint[];
}

/**
 * Compute Choppiness Index (CHOP) - TradingView Parity
 * 
 * Formula: CHOP = 100 * log10(SUM(TR, n) / (HH - LL)) / log10(n)
 * 
 * Where:
 * - TR = True Range = max(high - low, abs(high - prevClose), abs(low - prevClose))
 * - SUM(TR, n) = Sum of True Range over n periods
 * - HH = Highest High over n periods
 * - LL = Lowest Low over n periods
 * 
 * The indicator measures how "choppy" vs "trendy" the market is:
 * - High values (near 61.8+) = choppy/ranging market
 * - Low values (near 38.2-) = trending market
 * 
 * Output is bounded [0, 100] but typically stays in [38.2, 61.8] range.
 */
export function computeChoppinessIndex(
  data: ComputeBar[],
  length: number = 14,
  offset: number = 0,
  upperBandValue: number = 61.8,
  middleBandValue: number = 50,
  lowerBandValue: number = 38.2
): ChopResult {
  const chop: LinePoint[] = [];
  const upperBand: LinePoint[] = [];
  const middleBand: LinePoint[] = [];
  const lowerBand: LinePoint[] = [];
  
  if (data.length === 0 || length <= 0) {
    return { chop, upperBand, middleBand, lowerBand };
  }
  
  // Precompute True Range for all bars
  const tr: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    if (i === 0) {
      // First bar: TR = high - low
      tr.push(bar.high - bar.low);
    } else {
      const prevClose = data[i - 1].close;
      const trValue = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - prevClose),
        Math.abs(bar.low - prevClose)
      );
      tr.push(trValue);
    }
  }
  
  // Precompute log10(length) for denominator
  const log10Length = Math.log10(length);
  
  // Calculate CHOP for each bar
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Add constant band lines for all bars
    upperBand.push({ time, value: upperBandValue });
    middleBand.push({ time, value: middleBandValue });
    lowerBand.push({ time, value: lowerBandValue });
    
    // Warmup period: need at least `length` bars
    if (i < length - 1) {
      chop.push({ time, value: NaN });
      continue;
    }
    
    // Calculate SUM(TR, length) over lookback period
    let sumTR = 0;
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    
    for (let j = i - length + 1; j <= i; j++) {
      sumTR += tr[j];
      if (data[j].high > highestHigh) highestHigh = data[j].high;
      if (data[j].low < lowestLow) lowestLow = data[j].low;
    }
    
    // Calculate range (HH - LL)
    const range = highestHigh - lowestLow;
    
    // Handle edge cases to avoid NaN/Infinity
    let chopValue: number;
    if (range <= 0 || sumTR <= 0 || log10Length <= 0) {
      // Edge case: no price movement or invalid data
      // TradingView behavior: emit neutral value or previous
      chopValue = NaN;
    } else {
      // CHOP = 100 * log10(sumTR / range) / log10(length)
      const ratio = sumTR / range;
      
      // Guard against log10 of very small numbers
      if (ratio <= 0) {
        chopValue = NaN;
      } else {
        chopValue = 100 * Math.log10(ratio) / log10Length;
        
        // Clamp to [0, 100] for safety (should naturally stay in range)
        chopValue = Math.max(0, Math.min(100, chopValue));
      }
    }
    
    chop.push({ time, value: chopValue });
  }
  
  // Apply offset if needed (shifts plotted series only)
  if (offset !== 0) {
    const shiftedChop = shiftSeriesByBars(chop, data, offset);
    // Convert back to LinePoint format
    const finalChop: LinePoint[] = shiftedChop.map(pt => ({
      time: pt.time,
      value: pt.value !== undefined ? pt.value : NaN,
    }));
    return { chop: finalChop, upperBand, middleBand, lowerBand };
  }
  
  return { chop, upperBand, middleBand, lowerBand };
}

// ============================================================================
// Historical Volatility (HV) - TradingView Parity
// ============================================================================

export interface HVResult {
  hv: LinePoint[];
}

/**
 * Compute Historical Volatility (HV) - TradingView Parity
 * 
 * Historical Volatility measures the annualized standard deviation of logarithmic returns.
 * 
 * Formula:
 * 1. Log Returns: r[t] = ln(close[t] / close[t-1])
 * 2. Standard Deviation: σ = stdev(r, length) with sample variance (N-1)
 * 3. Annualized HV: HV = 100 × σ × sqrt(periodsPerYear)
 * 
 * TradingView parity note:
 * Observed that TV shows ~14% higher than with 252 trading days.
 * Empirical testing shows 329 gives best match (sqrt(329/252) = 1.143).
 * This may be a TV-specific annualization factor.
 * 
 * Warmup: Need (length + 1) bars to have enough log returns for stdev.
 */
export function computeHistoricalVolatility(
  data: ComputeBar[],
  length: number = 10,
  periodsPerYear: number = 329 // Empirical TV parity value (not standard 252)
): HVResult {
  const hv: LinePoint[] = [];
  
  if (data.length === 0 || length <= 0) {
    return { hv };
  }
  
  // Step 1: Calculate log returns for all bars
  // r[t] = ln(close[t] / close[t-1])
  const logReturns: number[] = [];
  logReturns.push(NaN); // First bar has no previous, so no return
  
  for (let i = 1; i < data.length; i++) {
    const prevClose = data[i - 1].close;
    const currClose = data[i].close;
    
    // Guard against invalid prices
    if (prevClose <= 0 || currClose <= 0 || !Number.isFinite(prevClose) || !Number.isFinite(currClose)) {
      logReturns.push(NaN);
    } else {
      logReturns.push(Math.log(currClose / prevClose));
    }
  }
  
  // Precompute sqrt of periods per year for annualization
  const sqrtPeriods = Math.sqrt(periodsPerYear);
  
  // Step 2: Calculate rolling standard deviation and annualize
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Warmup period: need at least (length) log returns
    // Log returns start at index 1, so we need to be at index >= length
    if (i < length) {
      hv.push({ time, value: NaN });
      continue;
    }
    
    // Collect log returns for the window [i - length + 1, i]
    const windowReturns: number[] = [];
    let hasNaN = false;
    
    for (let j = i - length + 1; j <= i; j++) {
      if (!Number.isFinite(logReturns[j])) {
        hasNaN = true;
        break;
      }
      windowReturns.push(logReturns[j]);
    }
    
    // If any NaN in window, skip this bar
    if (hasNaN || windowReturns.length < length) {
      hv.push({ time, value: NaN });
      continue;
    }
    
    // Calculate mean of log returns
    let sum = 0;
    for (const r of windowReturns) {
      sum += r;
    }
    const mean = sum / length;
    
    // Calculate variance using SAMPLE stdev (N-1) to match TradingView's built-in HV indicator
    // Note: TradingView's ta.stdev() defaults to biased=true (population, N), but their 
    // built-in "Historical Volatility" indicator uses the sample stdev formula (N-1).
    // This was verified by comparing output values with TradingView Nov 2025.
    let sumSquaredDiff = 0;
    for (const r of windowReturns) {
      const diff = r - mean;
      sumSquaredDiff += diff * diff;
    }
    // Use N-1 (sample variance) for TradingView built-in HV indicator parity  
    const variance = sumSquaredDiff / (length - 1);
    const stdev = Math.sqrt(variance);
    
    // Annualize and convert to percentage
    // HV = 100 × stdev × sqrt(periodsPerYear)
    const hvValue = 100 * stdev * sqrtPeriods;
    
    // Guard against NaN/Infinity
    if (!Number.isFinite(hvValue)) {
      hv.push({ time, value: NaN });
    } else {
      hv.push({ time, value: hvValue });
    }
  }
  
  return { hv };
}

// ============================================================================
// BBW - Bollinger BandWidth (TradingView Parity)
// ============================================================================

/**
 * Result type for BBW (Bollinger BandWidth) indicator.
 */
export interface BBWResult {
  /** BBW line: (upper - lower) / middle × 100 */
  bbw: LinePoint[];
  /** Rolling highest of BBW over highestExpansionLength */
  highestExpansion: LinePoint[];
  /** Rolling lowest of BBW over lowestContractionLength */
  lowestContraction: LinePoint[];
}

/**
 * Compute Bollinger BandWidth with TradingView parity.
 *
 * Formula (TradingView):
 *   Middle = SMA(source, length)
 *   Upper = Middle + stdDev × stdev(source, length)
 *   Lower = Middle - stdDev × stdev(source, length)
 *   BBW = (Upper - Lower) / Middle × 100
 *   Highest Expansion = highest(BBW, highestExpansionLength)
 *   Lowest Contraction = lowest(BBW, lowestContractionLength)
 *
 * Warmup: First (length - 1) bars output NaN (no BB values yet).
 *
 * @param data - OHLCV bars
 * @param length - BB period (default 20)
 * @param source - Price source (default "close")
 * @param stdDev - Standard deviation multiplier (default 2.0)
 * @param highestExpansionLength - Lookback for highest BBW (default 125)
 * @param lowestContractionLength - Lookback for lowest BBW (default 125)
 */
export function computeBBW(
  data: ComputeBar[],
  length: number = 20,
  source: SourceType = "close",
  stdDev: number = 2.0,
  highestExpansionLength: number = 125,
  lowestContractionLength: number = 125
): BBWResult {
  const bbw: LinePoint[] = [];
  const highestExpansion: LinePoint[] = [];
  const lowestContraction: LinePoint[] = [];

  if (length <= 0 || data.length === 0) {
    return { bbw, highestExpansion, lowestContraction };
  }

  // First, compute raw BBW values (may be NaN for warmup)
  const bbwValues: number[] = [];

  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;

    // Warmup period: not enough bars for SMA/stdev
    if (i < length - 1) {
      bbw.push({ time, value: NaN });
      bbwValues.push(NaN);
      continue;
    }

    // Calculate SMA (middle band)
    let sum = 0;
    for (let j = 0; j < length; j++) {
      sum += getSource(data[i - j], source);
    }
    const middle = sum / length;

    // Calculate population stdev (TradingView ta.stdev uses N, not N-1 for BB)
    let sqSum = 0;
    for (let j = 0; j < length; j++) {
      const diff = getSource(data[i - j], source) - middle;
      sqSum += diff * diff;
    }
    const std = Math.sqrt(sqSum / length);

    const upper = middle + stdDev * std;
    const lower = middle - stdDev * std;

    // BBW = (upper - lower) / middle × 100
    // Guard against division by zero
    const bbwValue = middle !== 0 ? ((upper - lower) / middle) * 100 : NaN;

    if (!Number.isFinite(bbwValue)) {
      bbw.push({ time, value: NaN });
      bbwValues.push(NaN);
    } else {
      bbw.push({ time, value: bbwValue });
      bbwValues.push(bbwValue);
    }
  }

  // Compute rolling highest (Highest Expansion)
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    const currentBbw = bbwValues[i];

    if (!Number.isFinite(currentBbw)) {
      highestExpansion.push({ time, value: NaN });
      continue;
    }

    // Find highest BBW in lookback window
    let highest = -Infinity;
    const lookbackStart = Math.max(0, i - highestExpansionLength + 1);
    let hasValidValue = false;

    for (let j = lookbackStart; j <= i; j++) {
      const val = bbwValues[j];
      if (Number.isFinite(val)) {
        highest = Math.max(highest, val);
        hasValidValue = true;
      }
    }

    if (hasValidValue && Number.isFinite(highest)) {
      highestExpansion.push({ time, value: highest });
    } else {
      highestExpansion.push({ time, value: NaN });
    }
  }

  // Compute rolling lowest (Lowest Contraction)
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    const currentBbw = bbwValues[i];

    if (!Number.isFinite(currentBbw)) {
      lowestContraction.push({ time, value: NaN });
      continue;
    }

    // Find lowest BBW in lookback window
    let lowest = Infinity;
    const lookbackStart = Math.max(0, i - lowestContractionLength + 1);
    let hasValidValue = false;

    for (let j = lookbackStart; j <= i; j++) {
      const val = bbwValues[j];
      if (Number.isFinite(val)) {
        lowest = Math.min(lowest, val);
        hasValidValue = true;
      }
    }

    if (hasValidValue && Number.isFinite(lowest)) {
      lowestContraction.push({ time, value: lowest });
    } else {
      lowestContraction.push({ time, value: NaN });
    }
  }

  return { bbw, highestExpansion, lowestContraction };
}

// ============================================================================
// BBTrend - Bollinger Bands Trend (TradingView Parity)
// ============================================================================

/**
 * Result type for BBTrend indicator.
 */
export interface BBTrendResult {
  /** BBTrend histogram values */
  bbtrend: LinePoint[];
}

/**
 * Compute BBTrend with TradingView parity.
 *
 * Formula (from TradingView support documentation):
 *   shortMiddle = SMA(source, shortLength)
 *   shortStd = stdDev × stdev(source, shortLength)
 *   shortUpper = shortMiddle + shortStd
 *   shortLower = shortMiddle - shortStd
 *   
 *   longMiddle = SMA(source, longLength)
 *   longStd = stdDev × stdev(source, longLength)
 *   longUpper = longMiddle + longStd
 *   longLower = longMiddle - longStd
 *   
 *   BBTrend = (abs(shortLower - longLower) - abs(shortUpper - longUpper)) / shortMiddle × 100
 *
 * Warmup: Need max(shortLength, longLength) bars for both BB calculations.
 *
 * @param data - OHLCV bars
 * @param shortLength - Short BB period (default 20)
 * @param longLength - Long BB period (default 50)
 * @param stdDev - Standard deviation multiplier (default 2.0)
 * @param source - Price source (default "close")
 */
export function computeBBTrend(
  data: ComputeBar[],
  shortLength: number = 20,
  longLength: number = 50,
  stdDev: number = 2.0,
  source: SourceType = "close"
): BBTrendResult {
  const bbtrend: LinePoint[] = [];

  if (data.length === 0 || shortLength <= 0 || longLength <= 0) {
    return { bbtrend };
  }

  // Warmup is the max of shortLength and longLength
  const warmupLength = Math.max(shortLength, longLength);

  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;

    // Warmup period: not enough bars for both BB calculations
    if (i < warmupLength - 1) {
      bbtrend.push({ time, value: NaN });
      continue;
    }

    // Calculate Short BB components
    let shortSum = 0;
    for (let j = 0; j < shortLength; j++) {
      shortSum += getSource(data[i - j], source);
    }
    const shortMiddle = shortSum / shortLength;

    // Calculate short stdev (population, TV-style)
    let shortSqSum = 0;
    for (let j = 0; j < shortLength; j++) {
      const diff = getSource(data[i - j], source) - shortMiddle;
      shortSqSum += diff * diff;
    }
    const shortStd = Math.sqrt(shortSqSum / shortLength) * stdDev;

    const shortUpper = shortMiddle + shortStd;
    const shortLower = shortMiddle - shortStd;

    // Calculate Long BB components
    let longSum = 0;
    for (let j = 0; j < longLength; j++) {
      longSum += getSource(data[i - j], source);
    }
    const longMiddle = longSum / longLength;

    // Calculate long stdev (population, TV-style)
    let longSqSum = 0;
    for (let j = 0; j < longLength; j++) {
      const diff = getSource(data[i - j], source) - longMiddle;
      longSqSum += diff * diff;
    }
    const longStd = Math.sqrt(longSqSum / longLength) * stdDev;

    const longUpper = longMiddle + longStd;
    const longLower = longMiddle - longStd;

    // BBTrend formula: (abs(shortLower - longLower) - abs(shortUpper - longUpper)) / shortMiddle × 100
    // Guard against division by zero
    if (shortMiddle === 0) {
      bbtrend.push({ time, value: NaN });
      continue;
    }

    const bbtrendValue = (Math.abs(shortLower - longLower) - Math.abs(shortUpper - longUpper)) / shortMiddle * 100;

    if (!Number.isFinite(bbtrendValue)) {
      bbtrend.push({ time, value: NaN });
    } else {
      bbtrend.push({ time, value: bbtrendValue });
    }
  }

  return { bbtrend };
}

// ============================================================================
// Ulcer Index
// ============================================================================

/**
 * Ulcer Index Result
 * 
 * Contains the ulcer index values and a constant zero line.
 */
export interface UlcerIndexResult {
  /** Ulcer Index values (always >= 0) */
  ulcer: Array<{ time: any; value: number }>;
  /** Constant zero line for reference */
  zero: Array<{ time: any; value: number }>;
}

/**
 * Compute Ulcer Index (TradingView parity)
 * 
 * The Ulcer Index measures downside volatility as the root mean square
 * of percentage drawdowns from the rolling highest price.
 * 
 * Formula (TV-exact):
 *   highest[t] = highest(source, length) - rolling highest ending at bar t
 *   drawdown[t] = 100 × (source[t] - highest[t]) / highest[t]  (≤ 0)
 *   UI[t] = sqrt(SMA(drawdown²[t], length))
 * 
 * Key insight: Each bar has ONE drawdown value calculated from its own rolling highest.
 * Then we take SMA of these squared drawdowns (not recalculating relative to window peak).
 * 
 * The resulting index:
 *   - Lower values = stable/rising prices with minimal drawdowns
 *   - Higher values = larger, more sustained price declines
 * 
 * @param data - OHLCV bar data
 * @param length - Lookback period (default 14)
 * @param source - Price source: "close", "open", "high", "low", "hl2", "hlc3", "ohlc4", "hlcc4" (default "close")
 * @returns UlcerIndexResult with ulcer and zero arrays
 */
export function computeUlcerIndex(
  data: ComputeBar[],
  length: number = 14,
  source: SourceType = "close"
): UlcerIndexResult {
  const ulcer: Array<{ time: any; value: number }> = [];
  const zero: Array<{ time: any; value: number }> = [];

  // Edge case: empty data or invalid length
  if (data.length === 0 || length <= 0) {
    return { ulcer, zero };
  }

  // Extract source values
  const sourceValues = data.map(bar => getSource(bar, source));

  // Step 1: Calculate rolling highest for each bar
  // highest[i] = max(source[i-length+1], ..., source[i])
  const rollingHighest: number[] = new Array(data.length).fill(NaN);
  
  for (let i = 0; i < data.length; i++) {
    if (i < length - 1) {
      // Not enough data for full window - still compute partial highest
      let peak = -Infinity;
      for (let j = 0; j <= i; j++) {
        const val = sourceValues[j];
        if (Number.isFinite(val) && val > peak) {
          peak = val;
        }
      }
      rollingHighest[i] = peak > -Infinity ? peak : NaN;
    } else {
      // Full window available
      let peak = -Infinity;
      for (let j = i - length + 1; j <= i; j++) {
        const val = sourceValues[j];
        if (Number.isFinite(val) && val > peak) {
          peak = val;
        }
      }
      rollingHighest[i] = peak > -Infinity ? peak : NaN;
    }
  }

  // Step 2: Calculate drawdown for each bar (relative to that bar's own rolling highest)
  // drawdown[i] = 100 * (source[i] - highest[i]) / highest[i]
  const drawdowns: number[] = new Array(data.length).fill(NaN);
  
  for (let i = 0; i < data.length; i++) {
    const src = sourceValues[i];
    const peak = rollingHighest[i];
    
    if (Number.isFinite(src) && Number.isFinite(peak) && peak > 0) {
      // Percentage drawdown from rolling peak (always ≤ 0)
      drawdowns[i] = 100 * (src - peak) / peak;
    }
  }

  // Step 3: Calculate squared drawdowns
  const squaredDD: number[] = drawdowns.map(dd => 
    Number.isFinite(dd) ? dd * dd : NaN
  );

  // Step 4: Calculate Ulcer Index = sqrt(SMA(squaredDD, length))
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Always add zero line point
    zero.push({ time, value: 0 });

    // Need at least `length` bars for full SMA
    if (i < length - 1) {
      ulcer.push({ time, value: NaN });
      continue;
    }

    // SMA of squared drawdowns over the last `length` bars
    let sum = 0;
    let count = 0;
    
    for (let j = i - length + 1; j <= i; j++) {
      if (Number.isFinite(squaredDD[j])) {
        sum += squaredDD[j];
        count++;
      }
    }

    if (count === 0) {
      ulcer.push({ time, value: NaN });
    } else {
      // UI = sqrt(average of squared drawdowns)
      // Use full length as divisor (same as SMA behavior)
      const meanSquaredDD = sum / length;
      const ui = Math.sqrt(meanSquaredDD);
      
      if (!Number.isFinite(ui)) {
        ulcer.push({ time, value: NaN });
      } else {
        ulcer.push({ time, value: ui });
      }
    }
  }

  return { ulcer, zero };
}

// ============================================================================
// Chaikin Money Flow (CMF) - TradingView Parity
// ============================================================================

export interface CMFResult {
  cmf: LinePoint[];
  zero: LinePoint[];
}

/**
 * Compute Chaikin Money Flow (CMF)
 * 
 * Measures the amount of Money Flow Volume over a specific period.
 * Values oscillate between -1 and +1:
 * - Positive CMF indicates buying pressure (accumulation)
 * - Negative CMF indicates selling pressure (distribution)
 * 
 * Formula (TradingView-exact):
 * 1. Money Flow Multiplier (MFM) = ((close - low) - (high - close)) / (high - low)
 *    = (2*close - high - low) / (high - low)
 * 2. Money Flow Volume (MFV) = MFM * volume
 * 3. CMF = SUM(MFV, length) / SUM(volume, length)
 * 
 * Edge cases (TV-parity):
 * - If high == low → MFM = 0 (avoid division by zero)
 * - If volume is NaN/undefined → treat as 0
 * - If SUM(volume, length) == 0 → return 0 (not NaN/Infinity)
 * 
 * @param data - OHLCV bars
 * @param length - Lookback period (default: 20)
 * @param zeroValue - Value for zero line (default: 0)
 */
export function computeCMF(
  data: ComputeBar[],
  length: number = 20,
  zeroValue: number = 0
): CMFResult {
  const cmf: LinePoint[] = [];
  const zero: LinePoint[] = [];
  
  if (data.length === 0 || length <= 0) {
    return { cmf, zero };
  }
  
  // Pre-calculate Money Flow Multiplier (MFM) and Money Flow Volume (MFV) for each bar
  const mfm: number[] = [];
  const mfv: number[] = [];
  const volumes: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const high = bar.high;
    const low = bar.low;
    const close = bar.close;
    
    // Handle missing/NaN volume as 0
    const vol = Number.isFinite(bar.volume) ? bar.volume : 0;
    volumes.push(vol);
    
    // Money Flow Multiplier: ((close - low) - (high - close)) / (high - low)
    // Equivalent: (2*close - high - low) / (high - low)
    const hlRange = high - low;
    
    let multiplier: number;
    if (hlRange === 0) {
      // Edge case: high == low → avoid division by zero, set MFM = 0
      multiplier = 0;
    } else {
      multiplier = ((close - low) - (high - close)) / hlRange;
    }
    mfm.push(multiplier);
    
    // Money Flow Volume = MFM * volume
    mfv.push(multiplier * vol);
  }
  
  // Build output
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Always add zero line point
    zero.push({ time, value: zeroValue });
    
    // Warmup period: need at least `length` bars
    // CMF is defined starting at bar index (length - 1)
    if (i < length - 1) {
      cmf.push({ time, value: NaN });
      continue;
    }
    
    // Sum MFV and volume over the lookback period
    let sumMfv = 0;
    let sumVol = 0;
    
    for (let j = i - length + 1; j <= i; j++) {
      sumMfv += mfv[j];
      sumVol += volumes[j];
    }
    
    // Calculate CMF
    let cmfValue: number;
    if (sumVol === 0) {
      // Edge case: no volume in the period → return 0 (not NaN/Infinity)
      cmfValue = 0;
    } else {
      cmfValue = sumMfv / sumVol;
    }
    
    // Defensive: ensure no NaN/Infinity
    if (!Number.isFinite(cmfValue)) {
      cmfValue = 0;
    }
    
    cmf.push({ time, value: cmfValue });
  }
  
  return { cmf, zero };
}

// ============================================================================
// PVT - Price Volume Trend (TradingView Parity)
//
// Formula: PVT[i] = PVT[i-1] + Volume[i] * (Close[i] - Close[i-1]) / Close[i-1]
// 
// Similar to OBV but uses percentage price change instead of binary direction.
// This makes it more sensitive to the magnitude of price changes.
// ============================================================================

export function computePVT(data: ComputeBar[]): LinePoint[] {
  const result: LinePoint[] = [];
  if (data.length === 0) return result;
  
  // First bar: PVT = 0 (TV starts at 0)
  let pvt = 0;
  result.push({ time: data[0].time, value: pvt });
  
  for (let i = 1; i < data.length; i++) {
    const close = data[i].close;
    const prevClose = data[i - 1].close;
    const volume = Number.isFinite(data[i].volume) ? data[i].volume : 0;
    
    // Edge case: if prevClose == 0, contribution is 0 (avoid div0)
    if (prevClose === 0 || !Number.isFinite(prevClose)) {
      // No contribution to PVT
      result.push({ time: data[i].time, value: pvt });
      continue;
    }
    
    // PVT contribution: Volume * (Close - PrevClose) / PrevClose
    const pctChange = (close - prevClose) / prevClose;
    const contribution = volume * pctChange;
    
    // Defensive: ensure no NaN/Infinity
    if (Number.isFinite(contribution)) {
      pvt += contribution;
    }
    
    result.push({ time: data[i].time, value: pvt });
  }
  
  return result;
}

// ============================================================================
// Klinger Oscillator (TradingView Parity)
//
// KO = EMA34(VF) - EMA55(VF)
// VF = V * [2 * ((dm/cm) - 1)] * Trend * 100
// Trend = +1 if (H+L+C) > (prevH+prevL+prevC), else -1
// dm = H - L
// cm = cm[-1] + dm if Trend == prevTrend, else prevDm + dm
// Signal = EMA13(KO)
// ============================================================================

export interface KlingerResult {
  klinger: LinePoint[];
  signal: LinePoint[];
}

export function computeKlingerOscillator(
  data: ComputeBar[],
  fastLength: number = 34,
  slowLength: number = 55,
  signalLength: number = 13
): KlingerResult {
  const klinger: LinePoint[] = [];
  const signal: LinePoint[] = [];
  
  if (data.length === 0) {
    return { klinger, signal };
  }
  
  // Pre-calculate Volume Force (VF) for each bar
  const vf: number[] = [];
  
  let prevHlc = data[0].high + data[0].low + data[0].close;
  let prevTrend: 1 | -1 = 1;
  let prevDm = data[0].high - data[0].low;
  let cm = prevDm; // Initialize cm to first bar's dm
  
  // First bar: VF is 0 (no previous bar to compare)
  vf.push(0);
  
  for (let i = 1; i < data.length; i++) {
    const bar = data[i];
    const hlc = bar.high + bar.low + bar.close;
    
    // Trend: +1 if current HLC > previous HLC, else -1
    const trend: 1 | -1 = hlc > prevHlc ? 1 : -1;
    
    // dm = High - Low (True Range simplified)
    const dm = bar.high - bar.low;
    
    // cm: accumulate if same trend, reset if trend changed
    if (trend === prevTrend) {
      cm = cm + dm;
    } else {
      // Trend changed: cm = previous dm + current dm
      cm = prevDm + dm;
    }
    
    // Volume Force: V * abs(2 * ((dm/cm) - 1)) * Trend
    // TradingView does NOT use the *100 multiplier that MotiveWave docs show
    // Validated against META.US 1D - this produces values in the same scale as TV
    const volume = Number.isFinite(bar.volume) ? bar.volume : 0;
    let vfValue = 0;
    
    if (cm !== 0 && Number.isFinite(cm)) {
      const ratio = dm / cm;
      // Formula: temp = abs(2 * (dm/cm - 1)), VF = V * temp * Trend
      const temp = Math.abs(2 * (ratio - 1));
      vfValue = volume * temp * trend;
    } else {
      // When CM == 0, temp defaults to abs(-2) = 2
      vfValue = volume * 2 * trend;
    }
    
    // Defensive: ensure no NaN/Infinity
    if (!Number.isFinite(vfValue)) {
      vfValue = 0;
    }
    
    vf.push(vfValue);
    
    // Update for next iteration
    prevHlc = hlc;
    prevTrend = trend;
    prevDm = dm;
  }
  
  // Calculate EMAs of VF
  // EMA formula: EMA[i] = alpha * value + (1 - alpha) * EMA[i-1]
  const alphaFast = 2 / (fastLength + 1);
  const alphaSlow = 2 / (slowLength + 1);
  const alphaSignal = 2 / (signalLength + 1);
  
  let emaFast = vf[0];
  let emaSlow = vf[0];
  const koValues: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      // Initialize EMAs with first VF value
      emaFast = vf[0];
      emaSlow = vf[0];
    } else {
      emaFast = alphaFast * vf[i] + (1 - alphaFast) * emaFast;
      emaSlow = alphaSlow * vf[i] + (1 - alphaSlow) * emaSlow;
    }
    
    // KO = EMA_fast - EMA_slow
    const ko = emaFast - emaSlow;
    koValues.push(ko);
    klinger.push({ time: data[i].time, value: ko });
  }
  
  // Calculate Signal line (EMA of KO)
  if (koValues.length > 0) {
    let emaSignal = koValues[0];
    
    for (let i = 0; i < koValues.length; i++) {
      if (i === 0) {
        emaSignal = koValues[0];
      } else {
        emaSignal = alphaSignal * koValues[i] + (1 - alphaSignal) * emaSignal;
      }
      signal.push({ time: data[i].time, value: emaSignal });
    }
  }
  
  return { klinger, signal };
}

// ============================================================================
// Volume Delta - Chart Bar Delta from Intrabar Classification
// ============================================================================

/**
 * Intrabar data point
 */
export interface IntrabarPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Volume Delta candle (OHLC format for candlestick rendering)
 */
export interface VolumeDeltaCandle {
  time: UTCTimestamp;
  open: number;   // Always 0
  high: number;   // Max cumulative delta reached during the bar
  low: number;    // Min cumulative delta reached during the bar
  close: number;  // Final cumulative delta at bar close
}

/**
 * Volume Delta result containing OHLC candles
 */
export interface VolumeDeltaResult {
  candles: VolumeDeltaCandle[];
  /** Zero line points for reference */
  zeroLine: LinePoint[];
}

/**
 * Timeframe mapping for auto-selection of intrabar timeframe.
 * TradingView behavior:
 *   - Seconds chart => 1S intrabar
 *   - Minutes/Hours chart => 1 minute intrabar
 *   - Daily chart => 5 minute intrabar
 *   - Weekly+ chart => 60 minute intrabar
 */
export function getAutoIntrabarTimeframe(chartTimeframe: string): string {
  const tf = chartTimeframe.toUpperCase();
  
  // Seconds-based timeframes
  if (tf.endsWith("S")) {
    return "1S";
  }
  
  // Parse numeric portion for minute-based
  const numMatch = tf.match(/^(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : 0;
  
  // Daily
  if (tf === "D" || tf === "1D" || tf === "DAY") {
    return "5";  // 5 minutes
  }
  
  // Weekly or higher
  if (tf === "W" || tf === "1W" || tf === "WEEK" || tf === "M" || tf === "1M" || tf === "MONTH") {
    return "60";  // 60 minutes
  }
  
  // Hours (e.g., 1H, 4H, 60, 240, etc.)
  if (tf.endsWith("H") || num >= 60) {
    return "1";  // 1 minute
  }
  
  // Default for minute timeframes (1, 5, 15, 30, etc.)
  return "1";  // 1 minute
}

/**
 * Classify an intrabar's volume as buying (+) or selling (-).
 * 
 * TradingView exact rules:
 * 1. If close > open => +volume (buying)
 * 2. If close < open => -volume (selling)
 * 3. If close == open (doji):
 *    a. If close > prevClose => +volume
 *    b. If close < prevClose => -volume
 *    c. If close == prevClose => same sign as previous intrabar
 * 4. First intrabar with no prev: use close > open, or +volume if still tied
 * 
 * @param bar - Current intrabar
 * @param prevClose - Previous intrabar's close (null for first bar)
 * @param prevSign - Previous intrabar's sign (1 or -1, used for carry-forward)
 * @returns Signed volume (+volume for buying, -volume for selling)
 */
export function classifyIntrabarVolume(
  bar: IntrabarPoint,
  prevClose: number | null,
  prevSign: 1 | -1
): { signedVolume: number; sign: 1 | -1 } {
  const volume = Math.abs(bar.volume);
  
  // Rule 1 & 2: Non-doji bars
  if (bar.close > bar.open) {
    return { signedVolume: volume, sign: 1 };
  }
  if (bar.close < bar.open) {
    return { signedVolume: -volume, sign: -1 };
  }
  
  // Rule 3: Doji bar (close == open)
  if (prevClose !== null) {
    // Compare to previous close
    if (bar.close > prevClose) {
      return { signedVolume: volume, sign: 1 };
    }
    if (bar.close < prevClose) {
      return { signedVolume: -volume, sign: -1 };
    }
    // close == prevClose: carry forward previous sign
    return { signedVolume: prevSign * volume, sign: prevSign };
  }
  
  // Rule 4: First bar with no prev, and it's a doji
  // Default to positive (buying pressure)
  return { signedVolume: volume, sign: 1 };
}

/**
 * Group intrabar data by chart bar timestamps.
 * 
 * @param chartBars - The chart-level OHLCV bars (provides timestamps)
 * @param intrabars - The lower-timeframe intrabar data
 * @returns Map from chart bar time to array of intrabars within that bar
 */
export function groupIntrabarsByChartBar(
  chartBars: ComputeBar[],
  intrabars: IntrabarPoint[]
): Map<number, IntrabarPoint[]> {
  const result = new Map<number, IntrabarPoint[]>();
  
  if (chartBars.length === 0 || intrabars.length === 0) {
    return result;
  }
  
  // Sort chart bars by time
  const sortedChartBars = [...chartBars].sort((a, b) => (a.time as number) - (b.time as number));
  
  // Calculate bar boundaries
  // Each chart bar covers [barTime, nextBarTime)
  const barBoundaries: Array<{ time: number; start: number; end: number }> = [];
  
  for (let i = 0; i < sortedChartBars.length; i++) {
    const barTime = sortedChartBars[i].time as number;
    const nextBarTime = i < sortedChartBars.length - 1 
      ? sortedChartBars[i + 1].time as number 
      : barTime + 86400; // Extend last bar by 1 day as fallback
    
    barBoundaries.push({
      time: barTime,
      start: barTime,
      end: nextBarTime,
    });
    result.set(barTime, []);
  }
  
  // Assign intrabars to chart bars
  for (const intrabar of intrabars) {
    const intraTime = intrabar.time;
    
    // Binary search for the containing chart bar
    let left = 0;
    let right = barBoundaries.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const boundary = barBoundaries[mid];
      
      if (intraTime >= boundary.start && intraTime < boundary.end) {
        // Found the containing bar
        result.get(boundary.time)!.push(intrabar);
        break;
      } else if (intraTime < boundary.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
  }
  
  // Sort intrabars within each chart bar by time
  for (const [, intras] of result) {
    intras.sort((a, b) => a.time - b.time);
  }
  
  return result;
}

/**
 * Compute Volume Delta candles from chart bars and their intrabars.
 * 
 * For each chart bar:
 *   - Open = 0 (always)
 *   - Traverse intrabars, computing running cumulative delta
 *   - High = maximum cumulative delta reached
 *   - Low = minimum cumulative delta reached
 *   - Close = final cumulative delta
 * 
 * @param chartBars - The chart-level OHLCV bars
 * @param intrabarsByChartBar - Map from chart bar time to intrabars
 * @param zeroValue - Value for zero line (default 0)
 * @returns VolumeDeltaResult with candles and zero line
 */
export function computeVolumeDelta(
  chartBars: ComputeBar[],
  intrabarsByChartBar: Map<number, IntrabarPoint[]>,
  zeroValue: number = 0
): VolumeDeltaResult {
  const candles: VolumeDeltaCandle[] = [];
  const zeroLine: LinePoint[] = [];
  
  // Track sign from previous intrabar (across chart bars for continuity)
  let globalPrevSign: 1 | -1 = 1;
  let globalPrevClose: number | null = null;
  
  for (const chartBar of chartBars) {
    const time = chartBar.time;
    const intrabars = intrabarsByChartBar.get(time as number) ?? [];
    
    // Always add zero line point
    zeroLine.push({ time, value: zeroValue });
    
    if (intrabars.length === 0) {
      // No intrabar data for this bar - use WhitespaceData pattern
      // Create a flat candle at 0
      candles.push({
        time,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
      });
      continue;
    }
    
    // Compute delta for this chart bar
    let cumDelta = 0;
    let maxDelta = 0;
    let minDelta = 0;
    
    for (const intrabar of intrabars) {
      const { signedVolume, sign } = classifyIntrabarVolume(
        intrabar,
        globalPrevClose,
        globalPrevSign
      );
      
      cumDelta += signedVolume;
      
      // Track running high/low
      maxDelta = Math.max(maxDelta, cumDelta);
      minDelta = Math.min(minDelta, cumDelta);
      
      // Update global state for next intrabar
      globalPrevClose = intrabar.close;
      globalPrevSign = sign;
    }
    
    // Create the Volume Delta candle
    // Defensive: ensure no NaN/Infinity
    candles.push({
      time,
      open: 0,
      high: Number.isFinite(maxDelta) ? maxDelta : 0,
      low: Number.isFinite(minDelta) ? minDelta : 0,
      close: Number.isFinite(cumDelta) ? cumDelta : 0,
    });
  }
  
  return { candles, zeroLine };
}

/**
 * Simplified Volume Delta computation using only chart-level bars.
 * Fallback when intrabar data is unavailable.
 * 
 * Uses chart bar's own OHLC to estimate delta:
 *   - If close > open: delta = +volume
 *   - If close < open: delta = -volume
 *   - If close == open: use previous bar's sign
 * 
 * Note: This is a rough approximation. True Volume Delta requires intrabar data.
 * 
 * @param chartBars - The chart-level OHLCV bars
 * @param zeroValue - Value for zero line
 * @returns VolumeDeltaResult with estimated candles
 */
export function computeVolumeDeltaFromChartBars(
  chartBars: ComputeBar[],
  zeroValue: number = 0
): VolumeDeltaResult {
  const candles: VolumeDeltaCandle[] = [];
  const zeroLine: LinePoint[] = [];
  
  let prevSign: 1 | -1 = 1;
  
  for (const bar of chartBars) {
    const time = bar.time;
    const volume = Math.abs(bar.volume);
    
    zeroLine.push({ time, value: zeroValue });
    
    // Classify direction
    let sign: 1 | -1;
    if (bar.close > bar.open) {
      sign = 1;
    } else if (bar.close < bar.open) {
      sign = -1;
    } else {
      sign = prevSign;
    }
    
    const delta = sign * volume;
    
    // For chart-level estimation, we don't have intrabar granularity
    // So high = delta if positive, 0 otherwise
    // And low = delta if negative, 0 otherwise
    candles.push({
      time,
      open: 0,
      high: delta > 0 ? delta : 0,
      low: delta < 0 ? delta : 0,
      close: delta,
    });
    
    prevSign = sign;
  }
  
  return { candles, zeroLine };
}

// ============================================================================
// Cumulative Volume Delta (CVD)
// 
// TradingView doc: https://www.tradingview.com/support/solutions/43000725058-cumulative-volume-delta/
//
// CVD accumulates Volume Delta across bars within an anchor period.
// At each new anchor period, the accumulation resets.
//
// Candle OHLC for each chart bar:
//   Open = 0 if first bar of anchor period, else previous CVD close
//   Close = Open + bar's delta
//   High = max cumulative delta reached during bar
//   Low = min cumulative delta reached during bar
// ============================================================================

export type CVDAnchorPeriod = 
  | "Session" 
  | "Week" 
  | "Month" 
  | "Year" 
  | "Decade" 
  | "Century"
  | "Earnings"
  | "Dividends"
  | "Splits";

export interface CVDCandle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CVDResult {
  candles: CVDCandle[];
  zeroLine: LinePoint[];
}

/**
 * Detect if a new anchor period started between two timestamps.
 * 
 * @param prevTime - Previous bar's timestamp (seconds since epoch)
 * @param currTime - Current bar's timestamp (seconds since epoch)
 * @param anchorPeriod - The anchor period type
 * @returns true if a new period started
 */
export function isNewAnchorPeriod(
  prevTime: number | null,
  currTime: number,
  anchorPeriod: CVDAnchorPeriod
): boolean {
  if (prevTime === null) {
    // First bar always starts a new period
    return true;
  }
  
  const prevDate = new Date(prevTime * 1000);
  const currDate = new Date(currTime * 1000);
  
  switch (anchorPeriod) {
    case "Session":
      // Session = new trading day (UTC date change)
      return prevDate.getUTCDate() !== currDate.getUTCDate() ||
             prevDate.getUTCMonth() !== currDate.getUTCMonth() ||
             prevDate.getUTCFullYear() !== currDate.getUTCFullYear();
    
    case "Week":
      // ISO week: new week starts on Monday
      const prevWeek = getISOWeek(prevDate);
      const currWeek = getISOWeek(currDate);
      return prevWeek.year !== currWeek.year || prevWeek.week !== currWeek.week;
    
    case "Month":
      return prevDate.getUTCMonth() !== currDate.getUTCMonth() ||
             prevDate.getUTCFullYear() !== currDate.getUTCFullYear();
    
    case "Year":
      return prevDate.getUTCFullYear() !== currDate.getUTCFullYear();
    
    case "Decade":
      return Math.floor(prevDate.getUTCFullYear() / 10) !== 
             Math.floor(currDate.getUTCFullYear() / 10);
    
    case "Century":
      return Math.floor(prevDate.getUTCFullYear() / 100) !== 
             Math.floor(currDate.getUTCFullYear() / 100);
    
    case "Earnings":
    case "Dividends":
    case "Splits":
      // These require event data which we don't have access to
      // Fall back to Session-like behavior
      return prevDate.getUTCDate() !== currDate.getUTCDate() ||
             prevDate.getUTCMonth() !== currDate.getUTCMonth() ||
             prevDate.getUTCFullYear() !== currDate.getUTCFullYear();
    
    default:
      return false;
  }
}

/**
 * Get ISO week number and year for a date.
 */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Monday = 1)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/**
 * Get the auto-selected intrabar timeframe for CVD based on chart timeframe.
 * 
 * TradingView rules:
 *   - Seconds → 1S
 *   - Minutes/Hours → 1 (1 minute)
 *   - Daily → 5 (5 minutes)
 *   - Others (Weekly, Monthly, etc.) → 60 (1 hour)
 * 
 * @param chartTimeframe - The chart timeframe string (e.g., "1", "5", "D", "W")
 * @returns The intrabar timeframe string
 */
export function getAutoIntrabarTimeframeCVD(chartTimeframe: string): string {
  const tf = chartTimeframe.toUpperCase();
  
  // Seconds (e.g., "1S", "5S")
  if (tf.endsWith("S")) {
    return "1S";
  }
  
  // Daily
  if (tf === "D" || tf === "1D") {
    return "5";
  }
  
  // Weekly, Monthly, or longer
  if (tf === "W" || tf === "1W" || tf === "M" || tf === "1M" || 
      tf.includes("W") || tf.includes("M") || tf.includes("Y")) {
    return "60";
  }
  
  // Minutes/Hours (default case)
  return "1";
}

/**
 * Compute Cumulative Volume Delta candles.
 * 
 * Full implementation using intrabar data.
 * 
 * @param chartBars - Chart-level OHLCV bars
 * @param intrabarsByChartBar - Map from chart bar time to intrabars
 * @param anchorPeriod - When to reset accumulation
 * @returns CVDResult with candles and zero line
 */
export function computeCVD(
  chartBars: ComputeBar[],
  intrabarsByChartBar: Map<number, IntrabarPoint[]>,
  anchorPeriod: CVDAnchorPeriod = "Session"
): CVDResult {
  const candles: CVDCandle[] = [];
  const zeroLine: LinePoint[] = [];
  
  // Track cumulative state across bars
  let cumulativeDelta = 0;
  let prevBarTime: number | null = null;
  
  // Track sign from previous intrabar
  let globalPrevSign: 1 | -1 = 1;
  let globalPrevClose: number | null = null;
  
  for (const chartBar of chartBars) {
    const time = chartBar.time;
    const timeNum = time as number;
    
    // Check for anchor period reset
    if (isNewAnchorPeriod(prevBarTime, timeNum, anchorPeriod)) {
      cumulativeDelta = 0;
    }
    
    // Zero line always at 0
    zeroLine.push({ time, value: 0 });
    
    const intrabars = intrabarsByChartBar.get(timeNum) ?? [];
    
    // CVD candle open = cumulative delta at start of bar
    const openDelta = cumulativeDelta;
    
    if (intrabars.length === 0) {
      // No intrabar data - create flat candle at current cumulative level
      candles.push({
        time,
        open: openDelta,
        high: openDelta,
        low: openDelta,
        close: openDelta,
      });
      prevBarTime = timeNum;
      continue;
    }
    
    // Process intrabars
    let runningDelta = openDelta;
    let maxDelta = openDelta;
    let minDelta = openDelta;
    
    for (const intrabar of intrabars) {
      const { signedVolume, sign } = classifyIntrabarVolume(
        intrabar,
        globalPrevClose,
        globalPrevSign
      );
      
      runningDelta += signedVolume;
      
      // Track running high/low
      maxDelta = Math.max(maxDelta, runningDelta);
      minDelta = Math.min(minDelta, runningDelta);
      
      // Update global state
      globalPrevClose = intrabar.close;
      globalPrevSign = sign;
    }
    
    // Create CVD candle
    candles.push({
      time,
      open: Number.isFinite(openDelta) ? openDelta : 0,
      high: Number.isFinite(maxDelta) ? maxDelta : 0,
      low: Number.isFinite(minDelta) ? minDelta : 0,
      close: Number.isFinite(runningDelta) ? runningDelta : 0,
    });
    
    // Update cumulative delta for next bar
    cumulativeDelta = runningDelta;
    prevBarTime = timeNum;
  }
  
  return { candles, zeroLine };
}

/**
 * Simplified CVD computation using only chart-level bars.
 * Fallback when intrabar data is unavailable.
 * 
 * Uses chart bar's own OHLC to estimate delta.
 * 
 * @param chartBars - Chart-level OHLCV bars
 * @param anchorPeriod - When to reset accumulation
 * @returns CVDResult with estimated candles
 */
export function computeCVDFromChartBars(
  chartBars: ComputeBar[],
  anchorPeriod: CVDAnchorPeriod = "Session"
): CVDResult {
  const candles: CVDCandle[] = [];
  const zeroLine: LinePoint[] = [];
  
  let cumulativeDelta = 0;
  let prevSign: 1 | -1 = 1;
  let prevBarTime: number | null = null;
  
  for (const bar of chartBars) {
    const time = bar.time;
    const timeNum = time as number;
    const volume = Math.abs(bar.volume);
    
    // Check for anchor period reset
    if (isNewAnchorPeriod(prevBarTime, timeNum, anchorPeriod)) {
      cumulativeDelta = 0;
    }
    
    zeroLine.push({ time, value: 0 });
    
    // CVD open = cumulative at start of bar
    const openDelta = cumulativeDelta;
    
    // Classify direction
    let sign: 1 | -1;
    if (bar.close > bar.open) {
      sign = 1;
    } else if (bar.close < bar.open) {
      sign = -1;
    } else {
      sign = prevSign;
    }
    
    const barDelta = sign * volume;
    const closeDelta = openDelta + barDelta;
    
    // For chart-level, high/low is simply the extremes of open→close
    const highDelta = Math.max(openDelta, closeDelta);
    const lowDelta = Math.min(openDelta, closeDelta);
    
    candles.push({
      time,
      open: Number.isFinite(openDelta) ? openDelta : 0,
      high: Number.isFinite(highDelta) ? highDelta : 0,
      low: Number.isFinite(lowDelta) ? lowDelta : 0,
      close: Number.isFinite(closeDelta) ? closeDelta : 0,
    });
    
    cumulativeDelta = closeDelta;
    prevSign = sign;
    prevBarTime = timeNum;
  }
  
  return { candles, zeroLine };
}

// ============================================================================
// Cumulative Volume Index (CVI)
// 
// TradingView doc: https://www.tradingview.com/support/solutions/43000589126-cumulative-volume-index-cvi/
//
// CVI = Previous CVI + (Advancing Volume – Declining Volume)
//
// This indicator requires market breadth data (advancing/declining volume)
// which is exchange-specific. We provide:
// 1. A compute function that works with pre-fetched breadth data
// 2. A mock/test harness for unit testing
// ============================================================================

export type CVIExchange = "NYSE" | "NASDAQ" | "AMEX" | "ARCX" | "US Total" | "DJ";

export interface CVIBreadthBar {
  time: UTCTimestamp;
  advancingVolume: number;
  decliningVolume: number;
}

export interface CVIResult {
  line: LinePoint[];
}

/**
 * Compute Cumulative Volume Index from breadth data.
 * 
 * CVI = Previous CVI + (Advancing Volume – Declining Volume)
 * 
 * @param breadthBars - Array of breadth data with advancing/declining volume
 * @returns CVIResult with single line
 */
export function computeCVI(breadthBars: CVIBreadthBar[]): CVIResult {
  const line: LinePoint[] = [];
  
  let cumulativeCVI = 0;
  
  for (const bar of breadthBars) {
    const advVol = Number.isFinite(bar.advancingVolume) ? bar.advancingVolume : 0;
    const decVol = Number.isFinite(bar.decliningVolume) ? bar.decliningVolume : 0;
    
    // CVI calculation
    cumulativeCVI += advVol - decVol;
    
    line.push({
      time: bar.time,
      value: cumulativeCVI,
    });
  }
  
  return { line };
}

/**
 * Generate mock CVI breadth data for testing.
 * Simulates advancing/declining volume based on price action.
 * 
 * @param chartBars - Chart-level OHLCV bars to use as template
 * @param volatility - How much random variation (0-1)
 * @returns Mock breadth data array
 */
export function mockCVIBreadthData(
  chartBars: ComputeBar[],
  volatility: number = 0.3
): CVIBreadthBar[] {
  const result: CVIBreadthBar[] = [];
  
  // Use a seeded random for reproducibility
  let seed = 12345;
  const seededRandom = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  
  for (const bar of chartBars) {
    const baseVolume = bar.volume;
    
    // Estimate advancing/declining split based on bar direction
    let advancingRatio: number;
    if (bar.close > bar.open) {
      // Up bar: more advancing volume
      advancingRatio = 0.6 + seededRandom() * volatility;
    } else if (bar.close < bar.open) {
      // Down bar: more declining volume
      advancingRatio = 0.4 - seededRandom() * volatility;
    } else {
      // Flat: roughly equal
      advancingRatio = 0.5 + (seededRandom() - 0.5) * volatility;
    }
    
    // Clamp ratio
    advancingRatio = Math.max(0, Math.min(1, advancingRatio));
    
    result.push({
      time: bar.time,
      advancingVolume: baseVolume * advancingRatio,
      decliningVolume: baseVolume * (1 - advancingRatio),
    });
  }
  
  return result;
}

/**
 * Compute CVI using chart bars as a proxy (no real breadth data).
 * This is a fallback/mock implementation.
 * 
 * @param chartBars - Chart-level OHLCV bars
 * @returns CVIResult with estimated line
 */
export function computeCVIFromChartBars(chartBars: ComputeBar[]): CVIResult {
  const mockBreadth = mockCVIBreadthData(chartBars, 0.2);
  return computeCVI(mockBreadth);
}

// ============================================================================
// Pivot Points Standard
// 
// TradingView reference: https://www.tradingview.com/support/solutions/43000521824-pivot-points-standard/
//
// The Pivot Points Standard indicator calculates support/resistance levels
// based on the previous period's OHLC data. It supports multiple calculation
// types: Traditional, Fibonacci, Woodie, Classic, DM, Camarilla.
//
// Output: Array of pivot period segments, each containing level values and
// time boundaries for horizontal line rendering.
// ============================================================================

export type PivotPointType = 
  | "traditional"
  | "fibonacci"
  | "woodie"
  | "classic"
  | "dm"
  | "camarilla";

export type PivotTimeframe = 
  | "auto"
  | "1D"
  | "1W"
  | "1M"
  | "3M"   // Quarterly
  | "12M"  // Yearly
  | "24M"  // Biyearly
  | "36M"  // Triyearly
  | "60M"  // Quinquennially
  | "120M"; // Decennially

/**
 * List of level keys based on pivot type.
 * DM only has P, S1, R1.
 * Traditional and Camarilla have S5, R5.
 * Others have up to S4, R4.
 */
export type PivotLevelKey = 
  | "P"
  | "S1" | "S2" | "S3" | "S4" | "S5"
  | "R1" | "R2" | "R3" | "R4" | "R5";

export interface PivotPeriod {
  /** Start timestamp of this pivot period (inclusive) */
  startTime: UTCTimestamp;
  /** End timestamp of this pivot period (exclusive, next period start) */
  endTime: UTCTimestamp;
  /** Pivot levels for this period */
  levels: Partial<Record<PivotLevelKey, number>>;
  /** Previous period OHLC used for calculations (for debugging) */
  prevOHLC?: { open: number; high: number; low: number; close: number };
  /** Current period open (for Woodie) */
  currOpen?: number;
}

export interface PivotPointsStandardResult {
  /** Array of pivot periods with their levels */
  periods: PivotPeriod[];
  /** Which levels are valid for this pivot type */
  validLevels: PivotLevelKey[];
  /** Pivot type used */
  pivotType: PivotPointType;
}

/**
 * Determine the auto pivot timeframe based on chart resolution.
 * TV rules:
 * - ≤15m → 1D
 * - >15m and <1D → 1W
 * - ≥1D → 1M
 * 
 * @param chartResolutionMinutes - Chart resolution in minutes (1440 = 1D)
 */
export function getAutoPivotTimeframe(chartResolutionMinutes: number): PivotTimeframe {
  if (chartResolutionMinutes <= 15) {
    return "1D";
  } else if (chartResolutionMinutes < 1440) {
    return "1W";
  } else {
    return "1M";
  }
}

/**
 * Get the pivot period start/end for a given timestamp.
 * Returns [periodStart, nextPeriodStart].
 */
function getPivotPeriodBoundaries(
  timestamp: number,
  timeframe: PivotTimeframe
): [number, number] {
  const date = new Date(timestamp * 1000);
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth();
  const utcDay = date.getUTCDate();
  
  let startDate: Date;
  let endDate: Date;
  
  switch (timeframe) {
    case "1D": {
      // Daily: midnight to midnight UTC
      startDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0));
      endDate = new Date(Date.UTC(utcYear, utcMonth, utcDay + 1, 0, 0, 0));
      break;
    }
    case "1W": {
      // Weekly: Monday to Sunday (ISO week)
      const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon, ...
      const daysToMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
      startDate = new Date(Date.UTC(utcYear, utcMonth, utcDay - daysToMonday, 0, 0, 0));
      endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    }
    case "1M": {
      // Monthly: first day of month
      startDate = new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(utcYear, utcMonth + 1, 1, 0, 0, 0));
      break;
    }
    case "3M": {
      // Quarterly: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
      const quarter = Math.floor(utcMonth / 3);
      const quarterStartMonth = quarter * 3;
      startDate = new Date(Date.UTC(utcYear, quarterStartMonth, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(utcYear, quarterStartMonth + 3, 1, 0, 0, 0));
      break;
    }
    case "12M": {
      // Yearly
      startDate = new Date(Date.UTC(utcYear, 0, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(utcYear + 1, 0, 1, 0, 0, 0));
      break;
    }
    case "24M": {
      // Biyearly (2 years)
      const biYearStart = Math.floor(utcYear / 2) * 2;
      startDate = new Date(Date.UTC(biYearStart, 0, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(biYearStart + 2, 0, 1, 0, 0, 0));
      break;
    }
    case "36M": {
      // Triyearly (3 years)
      const triYearStart = Math.floor(utcYear / 3) * 3;
      startDate = new Date(Date.UTC(triYearStart, 0, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(triYearStart + 3, 0, 1, 0, 0, 0));
      break;
    }
    case "60M": {
      // Quinquennially (5 years)
      const quinStart = Math.floor(utcYear / 5) * 5;
      startDate = new Date(Date.UTC(quinStart, 0, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(quinStart + 5, 0, 1, 0, 0, 0));
      break;
    }
    case "120M": {
      // Decennially (10 years)
      const decStart = Math.floor(utcYear / 10) * 10;
      startDate = new Date(Date.UTC(decStart, 0, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(decStart + 10, 0, 1, 0, 0, 0));
      break;
    }
    default:
      // Fallback to daily
      startDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0));
      endDate = new Date(Date.UTC(utcYear, utcMonth, utcDay + 1, 0, 0, 0));
  }
  
  return [
    Math.floor(startDate.getTime() / 1000),
    Math.floor(endDate.getTime() / 1000)
  ];
}

/**
 * Calculate pivot levels based on type and previous period OHLC.
 * 
 * @param pivotType - One of the 6 pivot types
 * @param prevOpen - Previous period open
 * @param prevHigh - Previous period high
 * @param prevLow - Previous period low
 * @param prevClose - Previous period close
 * @param currOpen - Current period open (needed for Woodie)
 */
function calculatePivotLevels(
  pivotType: PivotPointType,
  prevOpen: number,
  prevHigh: number,
  prevLow: number,
  prevClose: number,
  currOpen: number
): Partial<Record<PivotLevelKey, number>> {
  const range = prevHigh - prevLow;
  
  switch (pivotType) {
    case "traditional": {
      const P = (prevHigh + prevLow + prevClose) / 3;
      return {
        P,
        R1: P * 2 - prevLow,
        S1: P * 2 - prevHigh,
        R2: P + range,
        S2: P - range,
        R3: P * 2 + (prevHigh - 2 * prevLow),
        S3: P * 2 - (2 * prevHigh - prevLow),
        R4: P * 3 + (prevHigh - 3 * prevLow),
        S4: P * 3 - (3 * prevHigh - prevLow),
        R5: P * 4 + (prevHigh - 4 * prevLow),
        S5: P * 4 - (4 * prevHigh - prevLow),
      };
    }
    
    case "fibonacci": {
      const P = (prevHigh + prevLow + prevClose) / 3;
      return {
        P,
        R1: P + 0.382 * range,
        S1: P - 0.382 * range,
        R2: P + 0.618 * range,
        S2: P - 0.618 * range,
        R3: P + range,
        S3: P - range,
      };
    }
    
    case "woodie": {
      // Woodie uses current period open
      const P = (prevHigh + prevLow + 2 * currOpen) / 4;
      return {
        P,
        R1: 2 * P - prevLow,
        S1: 2 * P - prevHigh,
        R2: P + range,
        S2: P - range,
        R3: prevHigh + 2 * (P - prevLow),
        S3: prevLow - 2 * (prevHigh - P),
        R4: prevHigh + 2 * (P - prevLow) + range,
        S4: prevLow - 2 * (prevHigh - P) - range,
      };
    }
    
    case "classic": {
      const P = (prevHigh + prevLow + prevClose) / 3;
      return {
        P,
        R1: 2 * P - prevLow,
        S1: 2 * P - prevHigh,
        R2: P + range,
        S2: P - range,
        R3: P + 2 * range,
        S3: P - 2 * range,
        R4: P + 3 * range,
        S4: P - 3 * range,
      };
    }
    
    case "dm": {
      // DM (Demark) - X varies based on previous bar direction
      let X: number;
      if (prevOpen === prevClose) {
        X = prevHigh + prevLow + 2 * prevClose;
      } else if (prevClose > prevOpen) {
        X = 2 * prevHigh + prevLow + prevClose;
      } else {
        X = 2 * prevLow + prevHigh + prevClose;
      }
      const P = X / 4;
      return {
        P,
        R1: X / 2 - prevLow,
        S1: X / 2 - prevHigh,
      };
    }
    
    case "camarilla": {
      const P = (prevHigh + prevLow + prevClose) / 3;
      const factor = 1.1 * range;
      const R5 = (prevHigh / prevLow) * prevClose;
      return {
        P,
        R1: prevClose + factor / 12,
        S1: prevClose - factor / 12,
        R2: prevClose + factor / 6,
        S2: prevClose - factor / 6,
        R3: prevClose + factor / 4,
        S3: prevClose - factor / 4,
        R4: prevClose + factor / 2,
        S4: prevClose - factor / 2,
        R5,
        S5: prevClose - (R5 - prevClose),
      };
    }
  }
}

/**
 * Get the valid level keys for a pivot type.
 */
export function getValidPivotLevels(pivotType: PivotPointType): PivotLevelKey[] {
  switch (pivotType) {
    case "traditional":
    case "camarilla":
      return ["P", "S1", "S2", "S3", "S4", "S5", "R1", "R2", "R3", "R4", "R5"];
    case "dm":
      return ["P", "S1", "R1"];
    case "fibonacci":
      return ["P", "S1", "S2", "S3", "R1", "R2", "R3"];
    case "woodie":
    case "classic":
      return ["P", "S1", "S2", "S3", "S4", "R1", "R2", "R3", "R4"];
  }
}

/**
 * Compute Pivot Points Standard.
 * 
 * @param bars - OHLCV chart bars
 * @param pivotType - Pivot calculation type
 * @param timeframe - Pivot timeframe (or "auto")
 * @param chartResolutionMinutes - Chart resolution in minutes (for auto timeframe)
 * @param pivotsBack - Number of pivot periods to show (max 15 by default)
 * @param useDailyBased - Whether to use daily-based values (affects intraday only)
 * @returns PivotPointsStandardResult with pivot periods
 */
export function computePivotPointsStandard(
  bars: ComputeBar[],
  pivotType: PivotPointType = "traditional",
  timeframe: PivotTimeframe = "auto",
  chartResolutionMinutes: number = 1440,
  pivotsBack: number = 15,
  _useDailyBased: boolean = true
): PivotPointsStandardResult {
  if (bars.length === 0) {
    return {
      periods: [],
      validLevels: getValidPivotLevels(pivotType),
      pivotType,
    };
  }
  
  // Resolve auto timeframe
  const resolvedTimeframe = timeframe === "auto" 
    ? getAutoPivotTimeframe(chartResolutionMinutes) 
    : timeframe;
  
  // Group bars by pivot period
  interface PeriodData {
    startTime: number;
    endTime: number;
    bars: ComputeBar[];
  }
  
  const periodMap = new Map<string, PeriodData>();
  
  for (const bar of bars) {
    const ts = bar.time as number;
    const [periodStart, periodEnd] = getPivotPeriodBoundaries(ts, resolvedTimeframe);
    const key = `${periodStart}`;
    
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        startTime: periodStart,
        endTime: periodEnd,
        bars: [],
      });
    }
    periodMap.get(key)!.bars.push(bar);
  }
  
  // Sort periods chronologically
  const sortedPeriods = Array.from(periodMap.values())
    .sort((a, b) => a.startTime - b.startTime);
  
  if (sortedPeriods.length < 2) {
    // Need at least 2 periods (previous + current)
    return {
      periods: [],
      validLevels: getValidPivotLevels(pivotType),
      pivotType,
    };
  }
  
  // Compute OHLC for each period
  const periodOHLC: Array<{
    startTime: number;
    endTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }> = [];
  
  for (const period of sortedPeriods) {
    if (period.bars.length === 0) continue;
    
    // Sort bars within period by time
    period.bars.sort((a, b) => (a.time as number) - (b.time as number));
    
    const openPrice = period.bars[0].open;
    const closePrice = period.bars[period.bars.length - 1].close;
    let highPrice = -Infinity;
    let lowPrice = Infinity;
    
    for (const bar of period.bars) {
      if (bar.high > highPrice) highPrice = bar.high;
      if (bar.low < lowPrice) lowPrice = bar.low;
    }
    
    periodOHLC.push({
      startTime: period.startTime,
      endTime: period.endTime,
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      close: closePrice,
    });
  }
  
  // Calculate pivot levels for each period (using previous period's OHLC)
  const pivotPeriods: PivotPeriod[] = [];
  
  // Limit by TV's 500 lines rule: each period has N levels
  // Traditional/Camarilla: 11 levels = 11 lines per period
  // Max periods = floor(500 / levels_per_type)
  const levelsCount = getValidPivotLevels(pivotType).length;
  const maxPeriodsByLines = Math.floor(500 / levelsCount);
  const effectivePivotsBack = Math.min(pivotsBack, maxPeriodsByLines);
  
  // Start from index 1 (we need prev period)
  for (let i = 1; i < periodOHLC.length; i++) {
    const prevPeriod = periodOHLC[i - 1];
    const currPeriod = periodOHLC[i];
    
    const levels = calculatePivotLevels(
      pivotType,
      prevPeriod.open,
      prevPeriod.high,
      prevPeriod.low,
      prevPeriod.close,
      currPeriod.open
    );
    
    pivotPeriods.push({
      startTime: currPeriod.startTime as UTCTimestamp,
      endTime: currPeriod.endTime as UTCTimestamp,
      levels,
      prevOHLC: {
        open: prevPeriod.open,
        high: prevPeriod.high,
        low: prevPeriod.low,
        close: prevPeriod.close,
      },
      currOpen: currPeriod.open,
    });
  }
  
  // Return only the last N periods
  const resultPeriods = pivotPeriods.slice(-effectivePivotsBack);
  
  return {
    periods: resultPeriods,
    validLevels: getValidPivotLevels(pivotType),
    pivotType,
  };
}

// ============================================================================
// Pivot Points High Low (TradingView Parity)
// 
// Detects swing highs and lows based on left/right bar counts.
// A pivot high occurs when high[i] > all highs on left AND right sides.
// A pivot low occurs when low[i] < all lows on left AND right sides.
// 
// TradingView behavior:
// - Pivot is only "printed" after rightBars have passed (confirmation delay)
// - Labels show price at the pivot bar
// - Uses HL or Close depending on source setting
// ============================================================================

/** A single pivot point (high or low) */
export interface PivotPointHL {
  /** Whether this is a pivot high (true) or pivot low (false) */
  isHigh: boolean;
  /** Price value at the pivot */
  price: number;
  /** Bar index in the data array */
  index: number;
  /** Timestamp of the pivot bar */
  time: number;
}

/** Result from computePivotPointsHighLow */
export interface PivotPointsHighLowResult {
  /** All detected pivot points (highs and lows) sorted by index */
  pivots: PivotPointHL[];
  /** Pivot high label data for overlay rendering */
  highs: PivotPointHL[];
  /** Pivot low label data for overlay rendering */
  lows: PivotPointHL[];
}

/**
 * Check if bar at index i is a pivot high.
 * Pivot high: high[i] is strictly greater than highs on both left and right sides.
 */
function isPivotHighHL(
  bars: ComputeBar[],
  index: number,
  leftBars: number,
  rightBars: number,
  useClose: boolean
): boolean {
  if (index < leftBars || index + rightBars >= bars.length) {
    return false;
  }
  
  const candidateValue = useClose ? bars[index].close : bars[index].high;
  
  // Check left side (must be strictly greater)
  for (let i = 1; i <= leftBars; i++) {
    const leftValue = useClose ? bars[index - i].close : bars[index - i].high;
    if (candidateValue <= leftValue) {
      return false;
    }
  }
  
  // Check right side (must be strictly greater)
  for (let i = 1; i <= rightBars; i++) {
    const rightValue = useClose ? bars[index + i].close : bars[index + i].high;
    if (candidateValue <= rightValue) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if bar at index i is a pivot low.
 * Pivot low: low[i] is strictly less than lows on both left and right sides.
 */
function isPivotLowHL(
  bars: ComputeBar[],
  index: number,
  leftBars: number,
  rightBars: number,
  useClose: boolean
): boolean {
  if (index < leftBars || index + rightBars >= bars.length) {
    return false;
  }
  
  const candidateValue = useClose ? bars[index].close : bars[index].low;
  
  // Check left side (must be strictly less)
  for (let i = 1; i <= leftBars; i++) {
    const leftValue = useClose ? bars[index - i].close : bars[index - i].low;
    if (candidateValue >= leftValue) {
      return false;
    }
  }
  
  // Check right side (must be strictly less)
  for (let i = 1; i <= rightBars; i++) {
    const rightValue = useClose ? bars[index + i].close : bars[index + i].low;
    if (candidateValue >= rightValue) {
      return false;
    }
  }
  
  return true;
}

/**
 * Compute Pivot Points High Low
 * 
 * TradingView parity: "Pivots HL" with configurable left/right bars for both
 * high and low detection.
 * 
 * @param bars - OHLCV chart bars
 * @param highLeftBars - Left bars for pivot high detection (default 10)
 * @param highRightBars - Right bars for pivot high detection (default 10)
 * @param lowLeftBars - Left bars for pivot low detection (default 10)
 * @param lowRightBars - Right bars for pivot low detection (default 10)
 * @param source - "hl" for High/Low, "close" for Close prices (default "hl")
 * @returns PivotPointsHighLowResult with all detected pivots
 */
export function computePivotPointsHighLow(
  bars: ComputeBar[],
  highLeftBars: number = 10,
  highRightBars: number = 10,
  lowLeftBars: number = 10,
  lowRightBars: number = 10,
  source: "hl" | "close" = "hl"
): PivotPointsHighLowResult {
  const pivots: PivotPointHL[] = [];
  const highs: PivotPointHL[] = [];
  const lows: PivotPointHL[] = [];
  
  if (bars.length === 0) {
    return { pivots, highs, lows };
  }
  
  const useClose = source === "close";
  
  // Scan for pivot highs and lows
  for (let i = 0; i < bars.length; i++) {
    // Check for pivot high
    if (isPivotHighHL(bars, i, highLeftBars, highRightBars, useClose)) {
      const pivot: PivotPointHL = {
        isHigh: true,
        price: useClose ? bars[i].close : bars[i].high,
        index: i,
        time: bars[i].time as number,
      };
      pivots.push(pivot);
      highs.push(pivot);
    }
    
    // Check for pivot low
    if (isPivotLowHL(bars, i, lowLeftBars, lowRightBars, useClose)) {
      const pivot: PivotPointHL = {
        isHigh: false,
        price: useClose ? bars[i].close : bars[i].low,
        index: i,
        time: bars[i].time as number,
      };
      pivots.push(pivot);
      lows.push(pivot);
    }
  }
  
  // Sort by index
  pivots.sort((a, b) => a.index - b.index);
  
  return { pivots, highs, lows };
}

// ============================================================================
// Zig Zag (TradingView Parity)
// 
// Swing detection using deviation and depth parameters.
// Creates a zigzag line connecting swing highs and lows.
// 
// TradingView behavior:
// - Last segment "repaints" as new bars form (until confirmed)
// - Extend to last bar option
// - Labels at pivot points with price, change, and cumulative volume
// ============================================================================

/** A single ZigZag swing point */
export interface ZigZagSwing {
  /** Whether this is a swing high (true) or swing low (false) */
  isHigh: boolean;
  /** Price at the swing */
  price: number;
  /** Bar index */
  index: number;
  /** Timestamp */
  time: number;
  /** Price change from previous swing (absolute) */
  priceChange: number;
  /** Percent change from previous swing */
  percentChange: number;
  /** Cumulative volume from previous swing to this one */
  cumulativeVolume: number;
}

/** Result from computeZigZag */
export interface ZigZagResult {
  /** All swing points in chronological order */
  swings: ZigZagSwing[];
  /** Line segments connecting swing points (for rendering) */
  lines: Array<{
    startTime: number;
    startPrice: number;
    endTime: number;
    endPrice: number;
    isUp: boolean;
  }>;
}

/**
 * Compute Zig Zag indicator
 * 
 * TradingView parity implementation using deviation/depth algorithm.
 * 
 * @param bars - OHLCV chart bars
 * @param deviation - Price deviation threshold for reversals (percentage, e.g., 5 = 5%)
 * @param depth - Minimum bars between pivots (pivot legs)
 * @param extendToLastBar - Whether the last segment extends to the final bar
 * @returns ZigZagResult with swing points and line segments
 */
export function computeZigZag(
  bars: ComputeBar[],
  deviation: number = 5,
  depth: number = 10,
  extendToLastBar: boolean = true
): ZigZagResult {
  const swings: ZigZagSwing[] = [];
  const lines: ZigZagResult["lines"] = [];
  
  if (bars.length < 2) {
    return { swings, lines };
  }
  
  // Track current state
  let isUptrend: boolean | null = null;
  let currentExtreme: { isHigh: boolean; price: number; index: number; time: number } | null = null;
  let lastConfirmedSwing: { isHigh: boolean; price: number; index: number; time: number } | null = null;
  let barsSinceLastSwing = 0;
  
  // Helper to calculate deviation percentage
  const getDeviation = (from: number, to: number): number => {
    if (from === 0) return 0;
    return Math.abs((to - from) / from) * 100;
  };
  
  // Tentative extremes for initial direction determination
  let tentativeHigh = { price: bars[0].high, index: 0, time: bars[0].time as number };
  let tentativeLow = { price: bars[0].low, index: 0, time: bars[0].time as number };
  
  // Process bars
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const high = bar.high;
    const low = bar.low;
    barsSinceLastSwing++;
    
    // Update tentative extremes if direction not established
    if (isUptrend === null) {
      if (high > tentativeHigh.price) {
        tentativeHigh = { price: high, index: i, time: bar.time as number };
      }
      if (low < tentativeLow.price) {
        tentativeLow = { price: low, index: i, time: bar.time as number };
      }
      
      // Check if we can establish initial direction
      const upDeviation = getDeviation(tentativeLow.price, tentativeHigh.price);
      const downDeviation = getDeviation(tentativeHigh.price, tentativeLow.price);
      
      if (upDeviation >= deviation || downDeviation >= deviation) {
        if (tentativeHigh.index < tentativeLow.index) {
          // High came first → downtrend
          isUptrend = false;
          swings.push({
            isHigh: true,
            price: tentativeHigh.price,
            index: tentativeHigh.index,
            time: tentativeHigh.time,
            priceChange: 0,
            percentChange: 0,
            cumulativeVolume: 0,
          });
          lastConfirmedSwing = { isHigh: true, ...tentativeHigh };
          currentExtreme = { isHigh: false, ...tentativeLow };
          barsSinceLastSwing = i - tentativeLow.index;
        } else {
          // Low came first → uptrend
          isUptrend = true;
          swings.push({
            isHigh: false,
            price: tentativeLow.price,
            index: tentativeLow.index,
            time: tentativeLow.time,
            priceChange: 0,
            percentChange: 0,
            cumulativeVolume: 0,
          });
          lastConfirmedSwing = { isHigh: false, ...tentativeLow };
          currentExtreme = { isHigh: true, ...tentativeHigh };
          barsSinceLastSwing = i - tentativeHigh.index;
        }
      }
      continue;
    }
    
    // Direction established - process swing logic
    if (isUptrend) {
      if (high > currentExtreme!.price) {
        currentExtreme = { isHigh: true, price: high, index: i, time: bar.time as number };
        barsSinceLastSwing = 0;
      } else {
        const deviationFromHigh = getDeviation(currentExtreme!.price, low);
        if (deviationFromHigh >= deviation && barsSinceLastSwing >= depth) {
          // Confirm swing high and reverse to downtrend
          const prevSwing = swings[swings.length - 1];
          const cumVol = calculateCumulativeVolume(bars, prevSwing?.index ?? 0, currentExtreme!.index);
          const priceChange = currentExtreme!.price - (prevSwing?.price ?? currentExtreme!.price);
          const percentChange = prevSwing ? (priceChange / prevSwing.price) * 100 : 0;
          
          swings.push({
            isHigh: true,
            price: currentExtreme!.price,
            index: currentExtreme!.index,
            time: currentExtreme!.time,
            priceChange,
            percentChange,
            cumulativeVolume: cumVol,
          });
          lastConfirmedSwing = currentExtreme;
          isUptrend = false;
          currentExtreme = { isHigh: false, price: low, index: i, time: bar.time as number };
          barsSinceLastSwing = 0;
        }
      }
    } else {
      if (low < currentExtreme!.price) {
        currentExtreme = { isHigh: false, price: low, index: i, time: bar.time as number };
        barsSinceLastSwing = 0;
      } else {
        const deviationFromLow = getDeviation(currentExtreme!.price, high);
        if (deviationFromLow >= deviation && barsSinceLastSwing >= depth) {
          // Confirm swing low and reverse to uptrend
          const prevSwing = swings[swings.length - 1];
          const cumVol = calculateCumulativeVolume(bars, prevSwing?.index ?? 0, currentExtreme!.index);
          const priceChange = currentExtreme!.price - (prevSwing?.price ?? currentExtreme!.price);
          const percentChange = prevSwing ? (priceChange / prevSwing.price) * 100 : 0;
          
          swings.push({
            isHigh: false,
            price: currentExtreme!.price,
            index: currentExtreme!.index,
            time: currentExtreme!.time,
            priceChange,
            percentChange,
            cumulativeVolume: cumVol,
          });
          lastConfirmedSwing = currentExtreme;
          isUptrend = true;
          currentExtreme = { isHigh: true, price: high, index: i, time: bar.time as number };
          barsSinceLastSwing = 0;
        }
      }
    }
  }
  
  // Handle last swing / extend to last bar
  if (extendToLastBar && currentExtreme && swings.length > 0) {
    const lastBar = bars[bars.length - 1];
    const prevSwing = swings[swings.length - 1];
    
    // Extend current extreme to the last bar's extreme in same direction
    let finalPrice = currentExtreme.price;
    let finalIndex = currentExtreme.index;
    let finalTime = currentExtreme.time;
    
    // Update to last bar if extending
    if (currentExtreme.index < bars.length - 1) {
      finalIndex = bars.length - 1;
      finalTime = lastBar.time as number;
      finalPrice = currentExtreme.isHigh 
        ? Math.max(currentExtreme.price, lastBar.high)
        : Math.min(currentExtreme.price, lastBar.low);
    }
    
    const cumVol = calculateCumulativeVolume(bars, prevSwing.index, finalIndex);
    const priceChange = finalPrice - prevSwing.price;
    const percentChange = prevSwing.price !== 0 ? (priceChange / prevSwing.price) * 100 : 0;
    
    swings.push({
      isHigh: currentExtreme.isHigh,
      price: finalPrice,
      index: finalIndex,
      time: finalTime,
      priceChange,
      percentChange,
      cumulativeVolume: cumVol,
    });
  }
  
  // Build line segments
  for (let i = 1; i < swings.length; i++) {
    const prev = swings[i - 1];
    const curr = swings[i];
    lines.push({
      startTime: prev.time,
      startPrice: prev.price,
      endTime: curr.time,
      endPrice: curr.price,
      isUp: curr.price > prev.price,
    });
  }
  
  return { swings, lines };
}

/** Helper to calculate cumulative volume between two bar indices */
function calculateCumulativeVolume(
  bars: ComputeBar[],
  startIndex: number,
  endIndex: number
): number {
  let volume = 0;
  const start = Math.max(0, startIndex);
  const end = Math.min(bars.length - 1, endIndex);
  for (let i = start; i <= end; i++) {
    volume += bars[i].volume || 0;
  }
  return volume;
}

// ============================================================================
// Auto Fib Retracement (TradingView Parity)
// 
// Automatically draws Fibonacci retracement levels based on detected swings.
// Uses the same swing detection algorithm as ZigZag.
// ============================================================================

/** Standard Fibonacci retracement levels */
export const FIB_LEVELS = {
  "0": 0,
  "0.236": 0.236,
  "0.382": 0.382,
  "0.5": 0.5,
  "0.618": 0.618,
  "0.786": 0.786,
  "1": 1.0,
  "1.618": 1.618,
  "2.618": 2.618,
  "3.618": 3.618,
  "4.236": 4.236,
} as const;

export type FibLevelKey = keyof typeof FIB_LEVELS;

/** A single Fib level with calculated price */
export interface FibLevel {
  /** Level key (e.g., "0.618") */
  key: FibLevelKey;
  /** Level ratio */
  ratio: number;
  /** Calculated price at this level */
  price: number;
  /** Whether this level is visible */
  visible: boolean;
  /** Color for this level */
  color: string;
}

/** Result from computeAutoFibRetracement */
export interface AutoFibResult {
  /** Start anchor point (swing) */
  startPoint: { price: number; time: number; index: number } | null;
  /** End anchor point (swing) */
  endPoint: { price: number; time: number; index: number } | null;
  /** Calculated Fib levels */
  levels: FibLevel[];
  /** Whether the fib is drawn from low to high (true) or high to low (false) */
  isUpward: boolean;
}

/** Default Fib level colors (TradingView palette) */
export const DEFAULT_FIB_COLORS: Record<FibLevelKey, string> = {
  "0": "#787B86",
  "0.236": "#F23645",
  "0.382": "#FF9800",
  "0.5": "#4CAF50",
  "0.618": "#2196F3",
  "0.786": "#9C27B0",
  "1": "#787B86",
  "1.618": "#00BCD4",
  "2.618": "#FFEB3B",
  "3.618": "#FF5722",
  "4.236": "#795548",
};

/** Default Fib level visibility */
export const DEFAULT_FIB_VISIBILITY: Record<FibLevelKey, boolean> = {
  "0": true,
  "0.236": true,
  "0.382": true,
  "0.5": true,
  "0.618": true,
  "0.786": true,
  "1": true,
  "1.618": true,
  "2.618": true,
  "3.618": true,
  "4.236": true,
};

/**
 * Compute Auto Fib Retracement
 * 
 * TradingView parity: Uses deviation/depth to find swings, then draws
 * Fibonacci retracement levels between the last confirmed swing pair.
 * 
 * @param bars - OHLCV chart bars
 * @param deviation - Price deviation for swing detection (default 3)
 * @param depth - Minimum bars between swings (default 10)
 * @param reverse - Reverse the fib direction (default false)
 * @param levelVisibility - Which levels to show
 * @param levelColors - Colors for each level
 * @returns AutoFibResult with anchor points and calculated levels
 */
export function computeAutoFibRetracement(
  bars: ComputeBar[],
  deviation: number = 3,
  depth: number = 10,
  reverse: boolean = false,
  levelVisibility: Partial<Record<FibLevelKey, boolean>> = {},
  levelColors: Partial<Record<FibLevelKey, string>> = {}
): AutoFibResult {
  // Get swings using ZigZag algorithm
  const zigzag = computeZigZag(bars, deviation, depth, true);
  
  if (zigzag.swings.length < 2) {
    return {
      startPoint: null,
      endPoint: null,
      levels: [],
      isUpward: false,
    };
  }
  
  // Use the last two swings as anchor points
  const start = zigzag.swings[zigzag.swings.length - 2];
  const end = zigzag.swings[zigzag.swings.length - 1];
  
  let fromPrice = start.price;
  let toPrice = end.price;
  
  // Apply reverse if needed
  if (reverse) {
    [fromPrice, toPrice] = [toPrice, fromPrice];
  }
  
  const range = toPrice - fromPrice;
  const isUpward = toPrice > fromPrice;
  
  // Calculate levels
  const levels: FibLevel[] = [];
  for (const [key, ratio] of Object.entries(FIB_LEVELS)) {
    const levelKey = key as FibLevelKey;
    // Fib levels are drawn from the end (1.0) back toward start (0)
    const price = toPrice - range * ratio;
    
    levels.push({
      key: levelKey,
      ratio,
      price,
      visible: levelVisibility[levelKey] ?? DEFAULT_FIB_VISIBILITY[levelKey],
      color: levelColors[levelKey] ?? DEFAULT_FIB_COLORS[levelKey],
    });
  }
  
  return {
    startPoint: { price: fromPrice, time: start.time, index: start.index },
    endPoint: { price: toPrice, time: end.time, index: end.index },
    levels,
    isUpward,
  };
}

// ============================================================================
// Envelope (ENV) - TradingView Parity
// Upper = basis + (basis * percent/100)
// Lower = basis - (basis * percent/100)
// basis = MA(source, length) - SMA by default, EMA if exponential flag is set
// ============================================================================

export interface EnvelopeResult {
  basis: LinePoint[];
  upper: LinePoint[];
  lower: LinePoint[];
}

/**
 * Compute Envelope indicator with TradingView parity.
 * 
 * @param data - OHLCV bars
 * @param length - MA period (default 20)
 * @param percent - Percent offset for upper/lower bands (default 10)
 * @param source - Price source (default "close")
 * @param exponential - Use EMA instead of SMA (default false)
 * @returns EnvelopeResult with basis, upper, and lower series
 */
export function computeEnvelope(
  data: ComputeBar[],
  length: number = 20,
  percent: number = 10,
  source: SourceType = "close",
  exponential: boolean = false
): EnvelopeResult {
  const basis: LinePoint[] = [];
  const upper: LinePoint[] = [];
  const lower: LinePoint[] = [];
  
  if (data.length === 0 || length <= 0) {
    return { basis, upper, lower };
  }
  
  const multiplier = percent / 100;
  
  if (exponential) {
    // EMA-based envelope
    const emaMultiplier = 2 / (length + 1);
    let ema = getSource(data[0], source);
    
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        ema = getSource(data[0], source);
      } else {
        const price = getSource(data[i], source);
        ema = (price - ema) * emaMultiplier + ema;
      }
      
      basis.push({ time: data[i].time, value: ema });
      upper.push({ time: data[i].time, value: ema + ema * multiplier });
      lower.push({ time: data[i].time, value: ema - ema * multiplier });
    }
  } else {
    // SMA-based envelope
    let sum = 0;
    
    for (let i = 0; i < data.length; i++) {
      const srcVal = getSource(data[i], source);
      
      if (i < length - 1) {
        // Warmup period - accumulate but output NaN
        sum += srcVal;
        basis.push({ time: data[i].time, value: NaN });
        upper.push({ time: data[i].time, value: NaN });
        lower.push({ time: data[i].time, value: NaN });
      } else if (i === length - 1) {
        // First valid SMA value
        sum += srcVal;
        const sma = sum / length;
        basis.push({ time: data[i].time, value: sma });
        upper.push({ time: data[i].time, value: sma + sma * multiplier });
        lower.push({ time: data[i].time, value: sma - sma * multiplier });
      } else {
        // Subsequent values: rolling sum
        sum = sum - getSource(data[i - length], source) + srcVal;
        const sma = sum / length;
        basis.push({ time: data[i].time, value: sma });
        upper.push({ time: data[i].time, value: sma + sma * multiplier });
        lower.push({ time: data[i].time, value: sma - sma * multiplier });
      }
    }
  }
  
  return { basis, upper, lower };
}

// ============================================================================
// Rolling Median Helper
// ============================================================================

/**
 * Compute rolling median of a source value over a specified length.
 * Uses standard median calculation: middle value for odd length,
 * average of two middle values for even length.
 * 
 * @param values - Array of source values
 * @param length - Window size for median calculation
 * @returns Array of median values (NaN for warmup period)
 */
function computeRollingMedian(values: number[], length: number): number[] {
  const result: number[] = [];
  
  if (length <= 0 || values.length === 0) {
    return result;
  }
  
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      // Warmup period
      result.push(NaN);
    } else {
      // Get window values and sort
      const window: number[] = [];
      for (let j = i - length + 1; j <= i; j++) {
        window.push(values[j]);
      }
      window.sort((a, b) => a - b);
      
      // Calculate median
      const mid = Math.floor(window.length / 2);
      if (window.length % 2 === 0) {
        // Even length: average of two middle values
        result.push((window[mid - 1] + window[mid]) / 2);
      } else {
        // Odd length: middle value
        result.push(window[mid]);
      }
    }
  }
  
  return result;
}

// ============================================================================
// Median Indicator - TradingView Parity
// ============================================================================

export interface MedianIndicatorResult {
  median: LinePoint[];
  medianEma: LinePoint[];
  upper: LinePoint[];
  lower: LinePoint[];
  /** ATR values for reference */
  atr: LinePoint[];
}

/**
 * Compute Median indicator with TradingView parity.
 * 
 * Features:
 * - Rolling median of source over medianLength
 * - EMA of the median (same length as median)
 * - ATR-based upper/lower bands
 * - Cloud fill between median and EMA (direction-aware colors)
 * 
 * @param data - OHLCV bars
 * @param medianLength - Period for median calculation (default 3)
 * @param atrLength - Period for ATR calculation (default 14)
 * @param atrMultiplier - Multiplier for ATR bands (default 2)
 * @param source - Price source (default "hl2")
 * @returns MedianIndicatorResult with median, medianEma, upper, lower, atr
 */
export function computeMedianIndicator(
  data: ComputeBar[],
  medianLength: number = 3,
  atrLength: number = 14,
  atrMultiplier: number = 2,
  source: SourceType = "hl2"
): MedianIndicatorResult {
  const median: LinePoint[] = [];
  const medianEma: LinePoint[] = [];
  const upper: LinePoint[] = [];
  const lower: LinePoint[] = [];
  const atr: LinePoint[] = [];
  
  if (data.length === 0 || medianLength <= 0 || atrLength <= 0) {
    return { median, medianEma, upper, lower, atr };
  }
  
  // Step 1: Get source values
  const sourceValues: number[] = data.map(bar => getSource(bar, source));
  
  // Step 2: Compute rolling median
  const medianValues = computeRollingMedian(sourceValues, medianLength);
  
  // Step 3: Compute EMA of median values (using same length as median)
  // EMA uses Wilder-style alpha for smooth result
  const emaMultiplier = 2 / (medianLength + 1);
  const emaValues: number[] = [];
  
  // Find first valid median value for EMA seed
  let firstValidIdx = -1;
  for (let i = 0; i < medianValues.length; i++) {
    if (Number.isFinite(medianValues[i])) {
      firstValidIdx = i;
      break;
    }
  }
  
  for (let i = 0; i < medianValues.length; i++) {
    if (i < firstValidIdx || !Number.isFinite(medianValues[i])) {
      emaValues.push(NaN);
    } else if (i === firstValidIdx) {
      // Seed EMA with first valid median value
      emaValues.push(medianValues[i]);
    } else {
      // Standard EMA calculation
      const prevEma = emaValues[i - 1];
      if (Number.isFinite(prevEma)) {
        emaValues.push((medianValues[i] - prevEma) * emaMultiplier + prevEma);
      } else {
        emaValues.push(medianValues[i]);
      }
    }
  }
  
  // Step 4: Compute ATR (using RMA/Wilder smoothing for TradingView parity)
  const trueRanges: number[] = [];
  trueRanges.push(data[0].high - data[0].low);
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  
  // RMA (Wilder's smoothing) for ATR
  const atrValues: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < atrLength - 1) {
      atrValues.push(NaN);
    } else if (i === atrLength - 1) {
      // First ATR: simple average of first atrLength TR values
      let sum = 0;
      for (let j = 0; j < atrLength; j++) {
        sum += trueRanges[j];
      }
      atrValues.push(sum / atrLength);
    } else {
      // Wilder's smoothing: RMA = (prevRMA * (period - 1) + currentTR) / period
      const prevAtr = atrValues[i - 1];
      if (Number.isFinite(prevAtr)) {
        atrValues.push((prevAtr * (atrLength - 1) + trueRanges[i]) / atrLength);
      } else {
        atrValues.push(NaN);
      }
    }
  }
  
  // Step 5: Build output arrays
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    const medVal = medianValues[i];
    const emaVal = emaValues[i];
    const atrVal = atrValues[i];
    
    median.push({ time, value: medVal });
    medianEma.push({ time, value: emaVal });
    atr.push({ time, value: atrVal });
    
    // Upper/Lower bands = Median +/- ATR * multiplier
    if (Number.isFinite(medVal) && Number.isFinite(atrVal)) {
      upper.push({ time, value: medVal + atrVal * atrMultiplier });
      lower.push({ time, value: medVal - atrVal * atrMultiplier });
    } else {
      upper.push({ time, value: NaN });
      lower.push({ time, value: NaN });
    }
  }
  
  return { median, medianEma, upper, lower, atr };
}

// ============================================================================
// Linear Regression Channel
// ============================================================================

/**
 * Compute Linear Regression Channel with deviation bands and Pearson's R.
 * 
 * TradingView defaults:
 * - count: 100 (lookback length)
 * - source: close
 * - upperDeviation: 2
 * - lowerDeviation: 2
 * - showPearsonsR: true
 * 
 * Returns:
 * - linreg: The regression line value at each point
 * - upper: Upper deviation band (linreg + stdDev * upperDev)
 * - lower: Lower deviation band (linreg - stdDev * lowerDev)
 * - pearsonsR: Pearson correlation coefficient at each point
 */
export function computeLinearRegression(
  data: OHLCV[],
  count: number,
  upperDeviation: number,
  lowerDeviation: number,
  source: SourceType
): {
  linreg: LWLineData[];
  upper: LWLineData[];
  lower: LWLineData[];
  pearsonsR: LWLineData[];
} {
  const linreg: LWLineData[] = [];
  const upper: LWLineData[] = [];
  const lower: LWLineData[] = [];
  const pearsonsR: LWLineData[] = [];
  
  if (!data || data.length === 0 || count < 2) {
    return { linreg, upper, lower, pearsonsR };
  }
  
  // Get source values
  const srcValues: number[] = data.map(bar => getSource(bar, source));
  
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    if (i < count - 1) {
      // Not enough data for regression
      linreg.push({ time, value: NaN });
      upper.push({ time, value: NaN });
      lower.push({ time, value: NaN });
      pearsonsR.push({ time, value: NaN });
      continue;
    }
    
    // Get window of values
    const startIdx = i - count + 1;
    const windowValues: number[] = [];
    for (let j = startIdx; j <= i; j++) {
      windowValues.push(srcValues[j]);
    }
    
    // Linear regression using least squares
    // x values are 0, 1, 2, ..., count-1
    // y values are the source prices
    const n = count;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    
    for (let j = 0; j < n; j++) {
      const x = j;
      const y = windowValues[j];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    
    // Mean values
    const meanX = sumX / n;
    const meanY = sumY / n;
    
    // Slope (m) and intercept (b)
    const denominator = sumX2 - n * meanX * meanX;
    const slope = denominator !== 0 ? (sumXY - n * meanX * meanY) / denominator : 0;
    const intercept = meanY - slope * meanX;
    
    // Regression value at the current point (last point in window, x = n-1)
    const regValue = slope * (n - 1) + intercept;
    
    // Calculate standard deviation of residuals
    let sumResidualsSquared = 0;
    for (let j = 0; j < n; j++) {
      const x = j;
      const predicted = slope * x + intercept;
      const residual = windowValues[j] - predicted;
      sumResidualsSquared += residual * residual;
    }
    const stdDev = Math.sqrt(sumResidualsSquared / n);
    
    // Pearson's R correlation coefficient
    // R = (n*sumXY - sumX*sumY) / sqrt((n*sumX2 - sumX^2) * (n*sumY2 - sumY^2))
    const numeratorR = n * sumXY - sumX * sumY;
    const denomXR = n * sumX2 - sumX * sumX;
    const denomYR = n * sumY2 - sumY * sumY;
    const denomR = Math.sqrt(denomXR * denomYR);
    const r = denomR !== 0 ? numeratorR / denomR : 0;
    
    // Store values
    linreg.push({ time, value: regValue });
    upper.push({ time, value: regValue + stdDev * upperDeviation });
    lower.push({ time, value: regValue - stdDev * lowerDeviation });
    pearsonsR.push({ time, value: r });
  }
  
  return { linreg, upper, lower, pearsonsR };
}

// ============================================================================
// PVI - Positive Volume Index
// ============================================================================
// TradingView definition: Cumulative series that only updates when volume increases
// compared to the previous bar. Start value = 1000. Includes EMA smoothing.

export interface PVIResult {
  pvi: LinePoint[];
  pviEma: LinePoint[];
}

export function computePVI(
  data: ComputeBar[],
  emaLength: number = 255
): PVIResult {
  const pvi: LinePoint[] = [];
  const pviEma: LinePoint[] = [];

  if (data.length === 0) {
    return { pvi, pviEma };
  }

  // Build raw PVI values
  const pviValues: number[] = [];
  let currentPvi = 1000; // Start value per TV spec
  pviValues.push(currentPvi);
  pvi.push({ time: data[0].time, value: currentPvi });

  for (let i = 1; i < data.length; i++) {
    const vol = Number.isFinite(data[i].volume) ? data[i].volume : 0;
    const prevVol = Number.isFinite(data[i - 1].volume) ? data[i - 1].volume : 0;

    // PVI updates only when volume increases
    if (vol > prevVol) {
      const prevClose = data[i - 1].close;
      // Guard: prevent division by zero
      const pct = prevClose !== 0 ? (data[i].close - prevClose) / prevClose : 0;
      currentPvi = currentPvi + currentPvi * pct; // == currentPvi * (1 + pct)
    }
    // If volume doesn't increase, PVI stays the same

    pviValues.push(currentPvi);
    pvi.push({ time: data[i].time, value: currentPvi });
  }

  // Compute EMA of PVI
  if (emaLength > 0 && data.length >= emaLength) {
    const k = 2 / (emaLength + 1);
    
    // Initialize EMA with SMA of first emaLength values
    let ema = 0;
    for (let i = 0; i < emaLength && i < pviValues.length; i++) {
      ema += pviValues[i];
    }
    ema /= Math.min(emaLength, pviValues.length);

    for (let i = 0; i < data.length; i++) {
      if (i < emaLength - 1) {
        pviEma.push({ time: data[i].time, value: NaN });
      } else if (i === emaLength - 1) {
        // First valid EMA point (SMA)
        let sum = 0;
        for (let j = 0; j < emaLength; j++) {
          sum += pviValues[j];
        }
        ema = sum / emaLength;
        pviEma.push({ time: data[i].time, value: ema });
      } else {
        // Standard EMA formula
        ema = (pviValues[i] - ema) * k + ema;
        pviEma.push({ time: data[i].time, value: ema });
      }
    }
  } else {
    // Not enough data for EMA
    for (let i = 0; i < data.length; i++) {
      pviEma.push({ time: data[i].time, value: NaN });
    }
  }

  return { pvi, pviEma };
}

// ============================================================================
// NVI - Negative Volume Index
// ============================================================================
// TradingView definition: Cumulative series that only updates when volume decreases
// compared to the previous bar. Start value = 1000. Includes EMA smoothing.

export interface NVIResult {
  nvi: LinePoint[];
  nviEma: LinePoint[];
}

export function computeNVI(
  data: ComputeBar[],
  emaLength: number = 255
): NVIResult {
  const nvi: LinePoint[] = [];
  const nviEma: LinePoint[] = [];

  if (data.length === 0) {
    return { nvi, nviEma };
  }

  // Build raw NVI values
  const nviValues: number[] = [];
  let currentNvi = 1000; // Start value per TV spec
  nviValues.push(currentNvi);
  nvi.push({ time: data[0].time, value: currentNvi });

  for (let i = 1; i < data.length; i++) {
    const vol = Number.isFinite(data[i].volume) ? data[i].volume : 0;
    const prevVol = Number.isFinite(data[i - 1].volume) ? data[i - 1].volume : 0;

    // NVI updates only when volume decreases
    if (vol < prevVol) {
      const prevClose = data[i - 1].close;
      // Guard: prevent division by zero
      const pct = prevClose !== 0 ? (data[i].close - prevClose) / prevClose : 0;
      currentNvi = currentNvi + currentNvi * pct; // == currentNvi * (1 + pct)
    }
    // If volume doesn't decrease, NVI stays the same

    nviValues.push(currentNvi);
    nvi.push({ time: data[i].time, value: currentNvi });
  }

  // Compute EMA of NVI
  if (emaLength > 0 && data.length >= emaLength) {
    const k = 2 / (emaLength + 1);
    
    // Initialize EMA with SMA of first emaLength values
    let ema = 0;
    for (let i = 0; i < emaLength && i < nviValues.length; i++) {
      ema += nviValues[i];
    }
    ema /= Math.min(emaLength, nviValues.length);

    for (let i = 0; i < data.length; i++) {
      if (i < emaLength - 1) {
        nviEma.push({ time: data[i].time, value: NaN });
      } else if (i === emaLength - 1) {
        // First valid EMA point (SMA)
        let sum = 0;
        for (let j = 0; j < emaLength; j++) {
          sum += nviValues[j];
        }
        ema = sum / emaLength;
        nviEma.push({ time: data[i].time, value: ema });
      } else {
        // Standard EMA formula
        ema = (nviValues[i] - ema) * k + ema;
        nviEma.push({ time: data[i].time, value: ema });
      }
    }
  } else {
    // Not enough data for EMA
    for (let i = 0; i < data.length; i++) {
      nviEma.push({ time: data[i].time, value: NaN });
    }
  }

  return { nvi, nviEma };
}

// ============================================================================
// RelVol - Relative Volume at Time
// ============================================================================
// TradingView definition: Compares current volume to historical average at the
// same time offset within the anchor period.
//
// Source: https://www.tradingview.com/support/solutions/43000705489-relative-volume-at-time/

export type RelVolAnchorTimeframe = "session" | "week" | "month" | "year" | "1D" | "1W" | "1M";
export type RelVolCalculationMode = "cumulative" | "regular";

export interface RelVolResult {
  relVol: LinePoint[];
}

/**
 * Get the anchor start timestamp for a given time.
 * For daily anchor, returns the start of the day.
 * For weekly, returns start of week, etc.
 */
function getAnchorStart(timestamp: number, anchorTf: RelVolAnchorTimeframe): number {
  const date = new Date(timestamp * 1000);
  
  switch (anchorTf) {
    case "session":
    case "1D": {
      // Start of day (UTC)
      return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
    }
    case "week":
    case "1W": {
      // Start of week (Sunday = 0, want Monday = 1)
      const day = date.getUTCDay();
      const diffToMonday = (day === 0 ? 6 : day - 1);
      const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diffToMonday));
      return Math.floor(monday.getTime() / 1000);
    }
    case "month":
    case "1M": {
      // Start of month
      return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
    }
    case "year": {
      // Start of year
      return Math.floor(Date.UTC(date.getUTCFullYear(), 0, 1) / 1000);
    }
    default:
      // Default to daily
      return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
  }
}

/**
 * Get the anchor period duration in seconds.
 */
function getAnchorDuration(anchorTf: RelVolAnchorTimeframe): number {
  switch (anchorTf) {
    case "session":
    case "1D":
      return 24 * 60 * 60; // 1 day
    case "week":
    case "1W":
      return 7 * 24 * 60 * 60; // 1 week
    case "month":
    case "1M":
      return 30 * 24 * 60 * 60; // ~1 month (approximate)
    case "year":
      return 365 * 24 * 60 * 60; // ~1 year (approximate)
    default:
      return 24 * 60 * 60;
  }
}

/**
 * Compute Relative Volume at Time (RelVol)
 * 
 * For each bar, calculates the ratio of current volume to historical average volume
 * at the same offset within the anchor period.
 * 
 * @param data - OHLCV data
 * @param anchorTf - Anchor timeframe (session, week, month, year, 1D, 1W, 1M)
 * @param length - Number of historical periods to average (default 10)
 * @param calcMode - "cumulative" (sum from anchor start) or "regular" (single bar volume)
 */
export function computeRelVolAtTime(
  data: ComputeBar[],
  anchorTf: RelVolAnchorTimeframe = "1D",
  length: number = 10,
  calcMode: RelVolCalculationMode = "cumulative"
): RelVolResult {
  const relVol: LinePoint[] = [];

  if (data.length === 0 || length < 1) {
    return { relVol };
  }

  // Pre-compute anchor starts and offsets for all bars
  const anchorStarts: number[] = [];
  const offsets: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time as number;
    const anchorStart = getAnchorStart(time, anchorTf);
    anchorStarts.push(anchorStart);
    offsets.push(time - anchorStart);
  }

  // Get anchor period duration
  const anchorDuration = getAnchorDuration(anchorTf);

  // For each bar, find historical bars at same offset and compute ratio
  for (let i = 0; i < data.length; i++) {
    const currentTime = data[i].time as number;
    const currentAnchor = anchorStarts[i];
    const currentOffset = offsets[i];
    
    // Special case: If anchor timeframe <= chart timeframe, degenerate to "last N bars"
    // This is for TV parity - when using 1D anchor on 1D chart, relVol is just vol / avg(last N vols)
    const chartTfSeconds = i > 0 
      ? (data[i].time as number) - (data[i - 1].time as number)
      : anchorDuration; // Assume daily if we can't determine
    
    const isDegenerateCase = anchorDuration <= chartTfSeconds;
    
    // Compute current value
    let currentValue: number;
    if (calcMode === "cumulative" && !isDegenerateCase) {
      // Sum volume from anchor start to current bar
      currentValue = 0;
      for (let j = i; j >= 0; j--) {
        if (anchorStarts[j] === currentAnchor) {
          currentValue += Number.isFinite(data[j].volume) ? data[j].volume : 0;
        } else {
          break; // Different anchor period
        }
      }
    } else {
      // Regular mode or degenerate case: just current bar's volume
      currentValue = Number.isFinite(data[i].volume) ? data[i].volume : 0;
    }

    // Find historical periods and their values at same offset
    const historicalValues: number[] = [];
    
    if (isDegenerateCase) {
      // Degenerate case: just use last N bars' volumes
      for (let k = 1; k <= length && i - k >= 0; k++) {
        const vol = Number.isFinite(data[i - k].volume) ? data[i - k].volume : 0;
        historicalValues.push(vol);
      }
    } else {
      // Normal case: find bars at same offset in previous anchor periods
      for (let k = 1; k <= length; k++) {
        // Target anchor start is k periods back
        const targetAnchorStart = currentAnchor - k * anchorDuration;
        
        // Find the bar with offset <= currentOffset in this historical period
        // We need to find the last bar before/at the offset point
        let bestIdx = -1;
        let bestOffset = -1;
        
        for (let j = 0; j < data.length; j++) {
          const barAnchor = anchorStarts[j];
          // Check if bar is in the target period
          if (barAnchor >= targetAnchorStart && barAnchor < targetAnchorStart + anchorDuration) {
            const barOffset = offsets[j];
            if (barOffset <= currentOffset && barOffset > bestOffset) {
              bestIdx = j;
              bestOffset = barOffset;
            }
          }
        }
        
        if (bestIdx >= 0) {
          if (calcMode === "cumulative") {
            // Sum from anchor start to bestIdx
            let cumVol = 0;
            const targetPeriodStart = anchorStarts[bestIdx];
            for (let j = bestIdx; j >= 0; j--) {
              if (anchorStarts[j] === targetPeriodStart) {
                cumVol += Number.isFinite(data[j].volume) ? data[j].volume : 0;
              } else {
                break;
              }
            }
            historicalValues.push(cumVol);
          } else {
            // Regular: just the volume at that bar
            historicalValues.push(Number.isFinite(data[bestIdx].volume) ? data[bestIdx].volume : 0);
          }
        }
      }
    }

    // Compute average and ratio
    if (historicalValues.length > 0) {
      const avg = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
      if (avg > 0) {
        relVol.push({ time: data[i].time, value: currentValue / avg });
      } else {
        relVol.push({ time: data[i].time, value: NaN }); // Avoid division by zero
      }
    } else {
      // Not enough history
      relVol.push({ time: data[i].time, value: NaN });
    }
  }

  return { relVol };
}

// ============================================================================
// Williams Alligator
// 
// Uses SMMA (Smoothed Moving Average) on hl2 with forward shifts.
// TV Reference: https://www.tradingview.com/support/solutions/43000592305-williams-alligator/
// 
// Jaw: SMMA(hl2, 13), offset 8 forward (blue)
// Teeth: SMMA(hl2, 8), offset 5 forward (pink)
// Lips: SMMA(hl2, 5), offset 3 forward (green)
// ============================================================================

export interface WilliamsAlligatorResult {
  /** Jaw line (blue, slowest, SMMA 13 shifted +8) */
  jaw: Array<{ time: UTCTimestamp; value?: number }>;
  /** Teeth line (pink, medium, SMMA 8 shifted +5) */
  teeth: Array<{ time: UTCTimestamp; value?: number }>;
  /** Lips line (green, fastest, SMMA 5 shifted +3) */
  lips: Array<{ time: UTCTimestamp; value?: number }>;
  /** Raw (unshifted) jaw values for status line */
  jawRaw: LinePoint[];
  /** Raw (unshifted) teeth values for status line */
  teethRaw: LinePoint[];
  /** Raw (unshifted) lips values for status line */
  lipsRaw: LinePoint[];
}

/**
 * Compute Williams Alligator indicator with TradingView parity.
 * 
 * Uses SMMA (Wilder's smoothing) on hl2, with forward offsets.
 * The SMMA formula: smma[i] = na(smma[i-1]) ? sma(src, len) : (smma[i-1] * (len - 1) + src) / len
 * 
 * @param data - OHLCV bars
 * @param jawLength - Jaw period (default 13)
 * @param teethLength - Teeth period (default 8)
 * @param lipsLength - Lips period (default 5)
 * @param jawOffset - Jaw forward offset (default 8)
 * @param teethOffset - Teeth forward offset (default 5)
 * @param lipsOffset - Lips forward offset (default 3)
 */
export function computeWilliamsAlligator(
  data: ComputeBar[],
  jawLength: number = 13,
  teethLength: number = 8,
  lipsLength: number = 5,
  jawOffset: number = 8,
  teethOffset: number = 5,
  lipsOffset: number = 3
): WilliamsAlligatorResult {
  const jaw: Array<{ time: UTCTimestamp; value?: number }> = [];
  const teeth: Array<{ time: UTCTimestamp; value?: number }> = [];
  const lips: Array<{ time: UTCTimestamp; value?: number }> = [];
  const jawRaw: LinePoint[] = [];
  const teethRaw: LinePoint[] = [];
  const lipsRaw: LinePoint[] = [];

  if (data.length === 0) {
    return { jaw, teeth, lips, jawRaw, teethRaw, lipsRaw };
  }

  // Compute SMMA on hl2 for each line
  const jawSMMA = computeSMMA(data, jawLength, "hl2");
  const teethSMMA = computeSMMA(data, teethLength, "hl2");
  const lipsSMMA = computeSMMA(data, lipsLength, "hl2");

  // Store raw values for status line (unshifted)
  jawRaw.push(...jawSMMA);
  teethRaw.push(...teethSMMA);
  lipsRaw.push(...lipsSMMA);

  // Apply forward shifts using shiftSeriesByBars
  const jawShifted = shiftSeriesByBars(jawSMMA, data, jawOffset);
  const teethShifted = shiftSeriesByBars(teethSMMA, data, teethOffset);
  const lipsShifted = shiftSeriesByBars(lipsSMMA, data, lipsOffset);

  jaw.push(...jawShifted);
  teeth.push(...teethShifted);
  lips.push(...lipsShifted);

  return { jaw, teeth, lips, jawRaw, teethRaw, lipsRaw };
}

// ============================================================================
// Williams Fractals
// 
// Identifies pivot highs and lows using a window of 2p+1 bars.
// TV Reference: https://www.tradingview.com/support/solutions/43000591663-williams-fractal/
// 
// A fractal high: middle bar's high is highest in window
// A fractal low: middle bar's low is lowest in window
// Plotted at the pivot candle (with -periods offset from confirmation)
// ============================================================================

export interface WilliamsFractalPoint {
  time: UTCTimestamp;
  price: number;
  index: number;
  isHigh: boolean;
}

export interface WilliamsFractalsResult {
  /** Fractal high points (down triangles) */
  highs: WilliamsFractalPoint[];
  /** Fractal low points (up triangles) */
  lows: WilliamsFractalPoint[];
}

/**
 * Compute Williams Fractals indicator.
 * 
 * A fractal high occurs when the middle bar's high is the highest among 2*periods+1 bars.
 * A fractal low occurs when the middle bar's low is the lowest among 2*periods+1 bars.
 * 
 * @param data - OHLCV bars
 * @param periods - Number of bars on each side (default 2)
 */
export function computeWilliamsFractals(
  data: ComputeBar[],
  periods: number = 2
): WilliamsFractalsResult {
  const highs: WilliamsFractalPoint[] = [];
  const lows: WilliamsFractalPoint[] = [];

  if (data.length < 2 * periods + 1) {
    return { highs, lows };
  }

  // Check each potential pivot point (needs periods bars on each side)
  for (let i = periods; i < data.length - periods; i++) {
    const midHigh = data[i].high;
    const midLow = data[i].low;
    let isHighest = true;
    let isLowest = true;

    // Check left side
    for (let j = 1; j <= periods; j++) {
      if (data[i - j].high >= midHigh) isHighest = false;
      if (data[i - j].low <= midLow) isLowest = false;
    }

    // Check right side
    for (let j = 1; j <= periods; j++) {
      if (data[i + j].high >= midHigh) isHighest = false;
      if (data[i + j].low <= midLow) isLowest = false;
    }

    if (isHighest) {
      highs.push({
        time: data[i].time,
        price: midHigh,
        index: i,
        isHigh: true,
      });
    }

    if (isLowest) {
      lows.push({
        time: data[i].time,
        price: midLow,
        index: i,
        isHigh: false,
      });
    }
  }

  return { highs, lows };
}

// ============================================================================
// RSI Divergence Indicator
// 
// Detects regular and hidden divergences between RSI and price.
// TV Reference: https://www.tradingview.com/support/solutions/43000589127-divergence/
// ============================================================================

export interface RSIDivergenceSignal {
  type: "bullish" | "hiddenBullish" | "bearish" | "hiddenBearish";
  pivotBarIndex: number;
  pivotTime: UTCTimestamp;
  pivotRsi: number;
  pivotPrice: number;
  priorPivotBarIndex: number;
  priorPivotTime: UTCTimestamp;
  priorPivotRsi: number;
  priorPivotPrice: number;
}

export interface RSIDivergenceResult {
  /** RSI line values */
  rsi: LinePoint[];
  /** Upper band (overbought) */
  upperBand: LinePoint[];
  /** Middle band */
  middleBand: LinePoint[];
  /** Lower band (oversold) */
  lowerBand: LinePoint[];
  /** Detected divergence signals */
  signals: RSIDivergenceSignal[];
  /** Pivot high indices on RSI */
  pivotHighs: Array<{ index: number; time: UTCTimestamp; rsi: number; price: number }>;
  /** Pivot low indices on RSI */
  pivotLows: Array<{ index: number; time: UTCTimestamp; rsi: number; price: number }>;
}

/**
 * Compute RSI Divergence indicator.
 * 
 * Detects regular and hidden divergences using pivot detection on RSI.
 * 
 * @param data - OHLCV bars
 * @param rsiPeriod - RSI period (default 14)
 * @param source - RSI source (default "close")
 * @param lbL - Pivot lookback left (default 5)
 * @param lbR - Pivot lookback right (default 5)
 * @param rangeMax - Max lookback range for divergence (default 60)
 * @param rangeMin - Min lookback range for divergence (default 5)
 * @param plotBullish - Show regular bullish (default true)
 * @param plotHiddenBullish - Show hidden bullish (default false)
 * @param plotBearish - Show regular bearish (default true)
 * @param plotHiddenBearish - Show hidden bearish (default false)
 */
export function computeRSIDivergence(
  data: ComputeBar[],
  rsiPeriod: number = 14,
  source: SourceType = "close",
  lbL: number = 5,
  lbR: number = 5,
  rangeMax: number = 60,
  rangeMin: number = 5,
  plotBullish: boolean = true,
  plotHiddenBullish: boolean = false,
  plotBearish: boolean = true,
  plotHiddenBearish: boolean = false
): RSIDivergenceResult {
  const rsi: LinePoint[] = [];
  const upperBand: LinePoint[] = [];
  const middleBand: LinePoint[] = [];
  const lowerBand: LinePoint[] = [];
  const signals: RSIDivergenceSignal[] = [];
  const pivotHighs: Array<{ index: number; time: UTCTimestamp; rsi: number; price: number }> = [];
  const pivotLows: Array<{ index: number; time: UTCTimestamp; rsi: number; price: number }> = [];

  if (data.length === 0) {
    return { rsi, upperBand, middleBand, lowerBand, signals, pivotHighs, pivotLows };
  }

  // Compute RSI
  const rsiResult = computeRSI(data, rsiPeriod, source);
  rsi.push(...rsiResult.rsi);
  upperBand.push(...rsiResult.upperBand);
  middleBand.push(...rsiResult.middleBand);
  lowerBand.push(...rsiResult.lowerBand);

  // Build rsi values array aligned with data
  const rsiValues: (number | undefined)[] = new Array(data.length).fill(undefined);
  for (const pt of rsiResult.rsi) {
    const idx = data.findIndex(b => b.time === pt.time);
    if (idx >= 0 && Number.isFinite(pt.value)) {
      rsiValues[idx] = pt.value;
    }
  }

  // Find pivot highs and lows on RSI
  for (let i = lbL; i < data.length - lbR; i++) {
    const rsiVal = rsiValues[i];
    if (rsiVal === undefined) continue;

    // Check for pivot high on RSI
    let isPivotHigh = true;
    for (let j = 1; j <= lbL; j++) {
      const leftVal = rsiValues[i - j];
      if (leftVal !== undefined && leftVal >= rsiVal) {
        isPivotHigh = false;
        break;
      }
    }
    if (isPivotHigh) {
      for (let j = 1; j <= lbR; j++) {
        const rightVal = rsiValues[i + j];
        if (rightVal !== undefined && rightVal >= rsiVal) {
          isPivotHigh = false;
          break;
        }
      }
    }

    // Check for pivot low on RSI
    let isPivotLow = true;
    for (let j = 1; j <= lbL; j++) {
      const leftVal = rsiValues[i - j];
      if (leftVal !== undefined && leftVal <= rsiVal) {
        isPivotLow = false;
        break;
      }
    }
    if (isPivotLow) {
      for (let j = 1; j <= lbR; j++) {
        const rightVal = rsiValues[i + j];
        if (rightVal !== undefined && rightVal <= rsiVal) {
          isPivotLow = false;
          break;
        }
      }
    }

    if (isPivotHigh) {
      pivotHighs.push({
        index: i,
        time: data[i].time,
        rsi: rsiVal,
        price: data[i].high,
      });
    }

    if (isPivotLow) {
      pivotLows.push({
        index: i,
        time: data[i].time,
        rsi: rsiVal,
        price: data[i].low,
      });
    }
  }

  // Detect divergences
  // For each pivot, look back to find prior pivot within range
  
  // Bullish divergence: price makes lower low, RSI makes higher low (pivot lows)
  if (plotBullish || plotHiddenBullish) {
    for (let i = 1; i < pivotLows.length; i++) {
      const current = pivotLows[i];
      const barsSince = current.index - pivotLows[i - 1].index;
      
      if (barsSince < rangeMin || barsSince > rangeMax) continue;

      const prior = pivotLows[i - 1];

      // Regular bullish: price lower low, RSI higher low
      if (plotBullish && current.price < prior.price && current.rsi > prior.rsi) {
        signals.push({
          type: "bullish",
          pivotBarIndex: current.index,
          pivotTime: current.time,
          pivotRsi: current.rsi,
          pivotPrice: current.price,
          priorPivotBarIndex: prior.index,
          priorPivotTime: prior.time,
          priorPivotRsi: prior.rsi,
          priorPivotPrice: prior.price,
        });
      }

      // Hidden bullish: price higher low, RSI lower low
      if (plotHiddenBullish && current.price > prior.price && current.rsi < prior.rsi) {
        signals.push({
          type: "hiddenBullish",
          pivotBarIndex: current.index,
          pivotTime: current.time,
          pivotRsi: current.rsi,
          pivotPrice: current.price,
          priorPivotBarIndex: prior.index,
          priorPivotTime: prior.time,
          priorPivotRsi: prior.rsi,
          priorPivotPrice: prior.price,
        });
      }
    }
  }

  // Bearish divergence: price makes higher high, RSI makes lower high (pivot highs)
  if (plotBearish || plotHiddenBearish) {
    for (let i = 1; i < pivotHighs.length; i++) {
      const current = pivotHighs[i];
      const barsSince = current.index - pivotHighs[i - 1].index;
      
      if (barsSince < rangeMin || barsSince > rangeMax) continue;

      const prior = pivotHighs[i - 1];

      // Regular bearish: price higher high, RSI lower high
      if (plotBearish && current.price > prior.price && current.rsi < prior.rsi) {
        signals.push({
          type: "bearish",
          pivotBarIndex: current.index,
          pivotTime: current.time,
          pivotRsi: current.rsi,
          pivotPrice: current.price,
          priorPivotBarIndex: prior.index,
          priorPivotTime: prior.time,
          priorPivotRsi: prior.rsi,
          priorPivotPrice: prior.price,
        });
      }

      // Hidden bearish: price lower high, RSI higher high
      if (plotHiddenBearish && current.price < prior.price && current.rsi > prior.rsi) {
        signals.push({
          type: "hiddenBearish",
          pivotBarIndex: current.index,
          pivotTime: current.time,
          pivotRsi: current.rsi,
          pivotPrice: current.price,
          priorPivotBarIndex: prior.index,
          priorPivotTime: prior.time,
          priorPivotRsi: prior.rsi,
          priorPivotPrice: prior.price,
        });
      }
    }
  }

  return { rsi, upperBand, middleBand, lowerBand, signals, pivotHighs, pivotLows };
}

// ============================================================================
// Knoxville Divergence (Rob Booker)
// 
// Momentum divergence with RSI OB/OS gate.
// TV Reference: https://www.tradingview.com/support/solutions/43000591336-rob-booker-knoxville-divergence/
// ============================================================================

export interface KnoxvilleDivergenceSignal {
  type: "bullish" | "bearish";
  barIndex: number;
  time: UTCTimestamp;
  price: number;
  /** Start bar index for divergence line */
  startBarIndex: number;
  /** Start time for divergence line */
  startTime: UTCTimestamp;
  /** Start price (high for bearish, low for bullish) */
  startPrice: number;
}

export interface KnoxvilleDivergenceResult {
  /** Bullish (+KD) signals */
  bullish: KnoxvilleDivergenceSignal[];
  /** Bearish (-KD) signals */
  bearish: KnoxvilleDivergenceSignal[];
}

/**
 * Compute Knoxville Divergence (Rob Booker) indicator.
 * 
 * Logic:
 * - Compute momentum = close - close[momPeriod]
 * - Compute RSI
 * - For bearish: find bar where mom[0] < mom[i] (divergence up), with RSI OB, and new high
 * - For bullish: find bar where mom[0] > mom[i] (divergence down), with RSI OS, and new low
 * 
 * @param data - OHLCV bars
 * @param lookback - Bars to look back (default 150)
 * @param rsiPeriod - RSI period (default 21)
 * @param momPeriod - Momentum period (default 20)
 */
export function computeKnoxvilleDivergence(
  data: ComputeBar[],
  lookback: number = 150,
  rsiPeriod: number = 21,
  momPeriod: number = 20
): KnoxvilleDivergenceResult {
  const bullish: KnoxvilleDivergenceSignal[] = [];
  const bearish: KnoxvilleDivergenceSignal[] = [];

  if (data.length < Math.max(momPeriod, rsiPeriod) + 1) {
    return { bullish, bearish };
  }

  // Compute momentum: mom[i] = close[i] - close[i - momPeriod]
  const mom: (number | undefined)[] = new Array(data.length).fill(undefined);
  for (let i = momPeriod; i < data.length; i++) {
    mom[i] = data[i].close - data[i - momPeriod].close;
  }

  // Compute RSI
  const rsiResult = computeRSI(data, rsiPeriod, "close");
  const rsiValues: (number | undefined)[] = new Array(data.length).fill(undefined);
  for (const pt of rsiResult.rsi) {
    const idx = data.findIndex(b => b.time === pt.time);
    if (idx >= 0 && Number.isFinite(pt.value)) {
      rsiValues[idx] = pt.value;
    }
  }

  const OB = 70;
  const OS = 30;
  const MIN_DIVERGENCE_BARS = 5;

  // Process each bar
  for (let i = lookback; i < data.length; i++) {
    const currentMom = mom[i];
    if (currentMom === undefined) continue;

    const currentHigh = data[i].high;
    const currentLow = data[i].low;
    const effectiveLookback = Math.min(lookback, i);

    // Find highest high and lowest low in lookback window
    let highestHigh = currentHigh;
    let lowestLow = currentLow;
    for (let j = 1; j <= effectiveLookback; j++) {
      if (data[i - j].high > highestHigh) highestHigh = data[i - j].high;
      if (data[i - j].low < lowestLow) lowestLow = data[i - j].low;
    }

    // === Bearish KD (-KD) ===
    // Find last bar in [5..lookback] where mom[0] < mom[that_bar]
    let barUp = 0;
    for (let j = MIN_DIVERGENCE_BARS; j <= effectiveLookback; j++) {
      const pastMom = mom[i - j];
      if (pastMom !== undefined && currentMom < pastMom) {
        barUp = j;
      }
    }

    if (barUp > 0) {
      // Check RSI overbought gate: any RSI > OB in range [0..barUp+1]
      let rsiOb = false;
      for (let j = 0; j <= barUp + 1 && i - j >= 0; j++) {
        const rsiVal = rsiValues[i - j];
        if (rsiVal !== undefined && rsiVal > OB) {
          rsiOb = true;
          break;
        }
      }

      // Check if current high > high at barUp and >= highest in lookback
      if (rsiOb && currentHigh > data[i - barUp].high && currentHigh >= highestHigh) {
        bearish.push({
          type: "bearish",
          barIndex: i,
          time: data[i].time,
          price: currentHigh,
          startBarIndex: i - barUp,
          startTime: data[i - barUp].time,
          startPrice: data[i - barUp].high,
        });
      }
    }

    // === Bullish KD (+KD) ===
    // Find last bar in [5..lookback] where mom[0] > mom[that_bar]
    let barDown = 0;
    for (let j = MIN_DIVERGENCE_BARS; j <= effectiveLookback; j++) {
      const pastMom = mom[i - j];
      if (pastMom !== undefined && currentMom > pastMom) {
        barDown = j;
      }
    }

    if (barDown > 0) {
      // Check RSI oversold gate: any RSI < OS in range [0..barDown+1]
      let rsiOs = false;
      for (let j = 0; j <= barDown + 1 && i - j >= 0; j++) {
        const rsiVal = rsiValues[i - j];
        if (rsiVal !== undefined && rsiVal < OS) {
          rsiOs = true;
          break;
        }
      }

      // Check if current low < low at barDown and <= lowest in lookback
      if (rsiOs && currentLow < data[i - barDown].low && currentLow <= lowestLow) {
        bullish.push({
          type: "bullish",
          barIndex: i,
          time: data[i].time,
          price: currentLow,
          startBarIndex: i - barDown,
          startTime: data[i - barDown].time,
          startPrice: data[i - barDown].low,
        });
      }
    }
  }

  return { bullish, bearish };
}

// ============================================================================
// Market Breadth Indicators
// TradingView parity: ADL, ADR, ADR_B (Bars)
// ============================================================================

/**
 * Advance/Decline Ratio (Bars) - ADR_B
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000644914-advance-decline-ratio-bars/
 * 
 * Counts bars that "closed higher" vs "closed lower" over the last N bars:
 *   ratio = upCount / downCount
 * 
 * IMPORTANT: TradingView defines:
 * - "Closed higher" = close > close[1] (current close > previous bar's close)
 * - "Closed lower" = close < close[1] (current close < previous bar's close)
 * - "Unchanged" = close == close[1] (not counted in either numerator or denominator)
 * 
 * This is NOT candle color (close vs open). It's close vs previous close.
 * 
 * Edge cases:
 * - downCount == 0: returns NaN (line breaks, TradingView behavior)
 * - upCount == 0: returns 0
 * - First bar has no previous close: classified as unchanged (not counted)
 * 
 * @param data - OHLCV bar data
 * @param length - Rolling window length (default 9)
 * @returns ADR_B result with ratio array and equality line at y=1
 */
export interface ADRBarsResult {
  ratio: LinePoint[];
  equalityLine: LinePoint[];
}

export function computeAdvanceDeclineRatioBars(
  data: ComputeBar[],
  length: number = 9
): ADRBarsResult {
  const ratio: LinePoint[] = [];
  const equalityLine: LinePoint[] = [];

  if (data.length === 0 || length <= 0) {
    return { ratio, equalityLine };
  }

  // Classify each bar: 1 = closed higher (close > close[1]), -1 = closed lower (close < close[1]), 0 = unchanged
  // Note: First bar (i=0) has no previous close, so it's classified as unchanged (0)
  const barClass: number[] = data.map((bar, i) => {
    if (i === 0) return 0; // No previous bar to compare
    const prevClose = data[i - 1].close;
    if (bar.close > prevClose) return 1;  // Closed higher
    if (bar.close < prevClose) return -1; // Closed lower
    return 0; // Unchanged
  });

  // Rolling count
  for (let i = 0; i < data.length; i++) {
    const time = data[i].time;
    
    // Always add equality line at 1
    equalityLine.push({ time, value: 1 });

    // Not enough bars for full window yet
    if (i < length - 1) {
      ratio.push({ time, value: NaN });
      continue;
    }

    // Count up and down in window [i - length + 1, i]
    let upCount = 0;
    let downCount = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const cls = barClass[j];
      if (cls === 1) upCount++;
      else if (cls === -1) downCount++;
      // Unchanged (0) not counted
    }

    // Calculate ratio
    if (downCount === 0) {
      // Division by zero - TradingView shows NaN/undefined (line breaks)
      ratio.push({ time, value: NaN });
    } else {
      ratio.push({ time, value: upCount / downCount });
    }
  }

  return { ratio, equalityLine };
}

/**
 * Advance/Decline Ratio (Breadth) - ADR
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000589093-advance-decline-ratio/
 * 
 * Based on market breadth data (advances/declines):
 *   ratio = advances / declines
 * 
 * Edge cases:
 * - declines == 0: returns NaN (line breaks)
 * - advances == 0: returns 0
 * 
 * @param advances - Array of advancing issues count per bar
 * @param declines - Array of declining issues count per bar
 * @param times - Timestamps for each bar
 * @returns ADR result with ratio array
 */
export interface ADRBreadthResult {
  ratio: LinePoint[];
}

export function computeAdvanceDeclineRatioBreadth(
  advances: number[],
  declines: number[],
  times: UTCTimestamp[]
): ADRBreadthResult {
  const ratio: LinePoint[] = [];

  const len = Math.min(advances.length, declines.length, times.length);
  if (len === 0) {
    return { ratio };
  }

  for (let i = 0; i < len; i++) {
    const time = times[i];
    const adv = advances[i];
    const dec = declines[i];

    if (!Number.isFinite(adv) || !Number.isFinite(dec)) {
      ratio.push({ time, value: NaN });
    } else if (dec === 0) {
      // Division by zero - NaN
      ratio.push({ time, value: NaN });
    } else {
      ratio.push({ time, value: adv / dec });
    }
  }

  return { ratio };
}

/**
 * Advance/Decline Line (Breadth) - ADL
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000589092-advance-decline-line/
 * 
 * Cumulative sum of net advances:
 *   netAdv = advances - declines
 *   ADL[t] = ADL[t-1] + netAdv[t]
 * 
 * IMPORTANT: ADL is cumulative. For TradingView parity, the initial seed/offset
 * should match TV's calculation point. If only partial history is available,
 * consider providing a seed offset.
 * 
 * @param advances - Array of advancing issues count per bar
 * @param declines - Array of declining issues count per bar
 * @param times - Timestamps for each bar
 * @param seed - Initial ADL value (default 0, for parity may need historical seed)
 * @returns ADL result with cumulative line
 */
export interface ADLBreadthResult {
  adl: LinePoint[];
}

export function computeAdvanceDeclineLineBreadth(
  advances: number[],
  declines: number[],
  times: UTCTimestamp[],
  seed: number = 0
): ADLBreadthResult {
  const adl: LinePoint[] = [];

  const len = Math.min(advances.length, declines.length, times.length);
  if (len === 0) {
    return { adl };
  }

  let cumulative = seed;

  for (let i = 0; i < len; i++) {
    const time = times[i];
    const adv = advances[i];
    const dec = declines[i];

    if (!Number.isFinite(adv) || !Number.isFinite(dec)) {
      // Missing breadth data - carry forward previous value
      adl.push({ time, value: cumulative });
    } else {
      const netAdv = adv - dec;
      cumulative += netAdv;
      adl.push({ time, value: cumulative });
    }
  }

  return { adl };
}

/**
 * Generate mock breadth data for ADR/ADL from chart bars.
 * 
 * This is a fallback implementation when real breadth data is not available.
 * It simulates market breadth based on the chart's price movement:
 * - Up bar (close > open): more advances than declines
 * - Down bar (close < open): more declines than advances
 * - Flat bar: roughly equal
 * 
 * Uses a base of ~500 stocks (approximating S&P 500 constituent count)
 * with variation based on bar direction and volatility.
 * 
 * @param chartBars - Chart-level OHLCV bars to use as template
 * @param volatility - How much random variation (0-1), default 0.2
 * @returns Mock breadth data (advances, declines, times arrays)
 */
export function mockBreadthDataFromChartBars(
  chartBars: ComputeBar[],
  volatility: number = 0.2
): { advances: number[]; declines: number[]; times: UTCTimestamp[] } {
  const advances: number[] = [];
  const declines: number[] = [];
  const times: UTCTimestamp[] = [];
  
  const baseCount = 500; // Approximate S&P 500 size
  
  // Use a seeded random for reproducibility
  let seed = 54321;
  const seededRandom = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  
  for (let i = 0; i < chartBars.length; i++) {
    const bar = chartBars[i];
    times.push(bar.time);
    
    // Determine base advancing ratio from bar direction
    let advancingRatio: number;
    if (bar.close > bar.open) {
      // Up bar: more advancing stocks (55-70%)
      advancingRatio = 0.55 + seededRandom() * 0.15;
    } else if (bar.close < bar.open) {
      // Down bar: fewer advancing stocks (30-45%)
      advancingRatio = 0.30 + seededRandom() * 0.15;
    } else {
      // Flat: roughly equal (45-55%)
      advancingRatio = 0.45 + seededRandom() * 0.10;
    }
    
    // Add volatility noise
    advancingRatio += (seededRandom() - 0.5) * volatility;
    advancingRatio = Math.max(0.1, Math.min(0.9, advancingRatio));
    
    // Calculate counts (integers)
    const adv = Math.round(baseCount * advancingRatio);
    const dec = baseCount - adv;
    
    advances.push(adv);
    declines.push(dec);
  }
  
  return { advances, declines, times };
}

/**
 * Compute ADR using chart bars as a proxy (mock breadth data).
 * This is a fallback implementation when real breadth data is not available.
 * 
 * @param chartBars - Chart-level OHLCV bars
 * @returns ADRBreadthResult with ratio array
 */
export function computeADRFromChartBars(chartBars: ComputeBar[]): ADRBreadthResult {
  const { advances, declines, times } = mockBreadthDataFromChartBars(chartBars);
  return computeAdvanceDeclineRatioBreadth(advances, declines, times);
}

/**
 * Compute ADL using chart bars as a proxy (mock breadth data).
 * This is a fallback implementation when real breadth data is not available.
 * 
 * @param chartBars - Chart-level OHLCV bars
 * @param seed - Initial ADL value (default 0)
 * @returns ADLBreadthResult with cumulative ADL line
 */
export function computeADLFromChartBars(chartBars: ComputeBar[], seed: number = 0): ADLBreadthResult {
  const { advances, declines, times } = mockBreadthDataFromChartBars(chartBars);
  return computeAdvanceDeclineLineBreadth(advances, declines, times, seed);
}
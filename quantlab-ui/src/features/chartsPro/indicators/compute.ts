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

type SourceType = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";

function getSource(bar: ComputeBar, source: SourceType): number {
  switch (source) {
    case "close": return bar.close;
    case "open": return bar.open;
    case "high": return bar.high;
    case "low": return bar.low;
    case "hl2": return (bar.high + bar.low) / 2;
    case "hlc3": return (bar.high + bar.low + bar.close) / 3;
    case "ohlc4": return (bar.open + bar.high + bar.low + bar.close) / 4;
    default: return bar.close;
  }
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

export function computeMcGinley(
  data: ComputeBar[],
  period: number = 14,
  source: SourceType = "close"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length === 0) return result;
  
  // Start with first price
  let md = getSource(data[0], source);
  result.push({ time: data[0].time, value: md });
  
  for (let i = 1; i < data.length; i++) {
    const price = getSource(data[i], source);
    // McGinley Dynamic formula
    const ratio = price / md;
    md = md + (price - md) / (period * Math.pow(ratio, 4));
    result.push({ time: data[i].time, value: md });
  }
  
  return result;
}

// ============================================================================
// RSI - Relative Strength Index
// ============================================================================

export function computeRSI(data: ComputeBar[], period: number): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length <= period) return result;
  
  let avgGain = 0;
  let avgLoss = 0;
  
  // First period: simple average
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  
  // First RSI value
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({ time: data[period].time, value: 100 - 100 / (1 + firstRS) });
  
  // Subsequent values using Wilder's smoothing
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: data[i].time, value: 100 - 100 / (1 + rs) });
  }
  return result;
}

// ============================================================================
// MACD - Moving Average Convergence Divergence
// ============================================================================

export interface MACDResult {
  macd: LinePoint[];
  signal: LinePoint[];
  histogram: LinePoint[];
}

export function computeMACD(
  data: ComputeBar[],
  fast: number,
  slow: number,
  signalPeriod: number
): MACDResult {
  const fastEma = computeEMA(data, fast);
  const slowEma = computeEMA(data, slow);
  
  // Build MACD line (fast - slow)
  const slowMap = new Map<number, number>();
  slowEma.forEach(p => slowMap.set(p.time as number, p.value));
  
  const macdLine: LinePoint[] = [];
  fastEma.forEach(p => {
    const slowVal = slowMap.get(p.time as number);
    if (slowVal !== undefined) {
      macdLine.push({ time: p.time, value: p.value - slowVal });
    }
  });
  
  // Signal line (EMA of MACD)
  const signalLine = emaFromValues(macdLine, signalPeriod);
  
  // Histogram (MACD - Signal)
  const signalMap = new Map<number, number>();
  signalLine.forEach(p => signalMap.set(p.time as number, p.value));
  
  const histogram: LinePoint[] = [];
  macdLine.forEach(p => {
    const sigVal = signalMap.get(p.time as number);
    if (sigVal !== undefined) {
      histogram.push({ time: p.time, value: p.value - sigVal });
    }
  });
  
  return { macd: macdLine, signal: signalLine, histogram };
}

// ============================================================================
// Bollinger Bands
// ============================================================================

export interface BollingerResult {
  upper: LinePoint[];
  middle: LinePoint[];
  lower: LinePoint[];
}

export function computeBollingerBands(
  data: ComputeBar[],
  period: number,
  stdDev: number,
  source: SourceType = "close"
): BollingerResult {
  const upper: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const lower: LinePoint[] = [];
  
  if (period <= 0 || data.length < period) {
    return { upper, middle, lower };
  }
  
  for (let i = period - 1; i < data.length; i++) {
    // Calculate SMA
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += getSource(data[i - j], source);
    }
    const sma = sum / period;
    
    // Calculate standard deviation
    let sqSum = 0;
    for (let j = 0; j < period; j++) {
      const diff = getSource(data[i - j], source) - sma;
      sqSum += diff * diff;
    }
    const std = Math.sqrt(sqSum / period);
    
    const time = data[i].time;
    middle.push({ time, value: sma });
    upper.push({ time, value: sma + stdDev * std });
    lower.push({ time, value: sma - stdDev * std });
  }
  
  return { upper, middle, lower };
}

// ============================================================================
// ATR - Average True Range
// ============================================================================

export function computeATR(data: ComputeBar[], period: number): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length < 2) return result;
  
  // Calculate True Range for each bar
  const trueRanges: number[] = [];
  trueRanges.push(data[0].high - data[0].low); // First bar: just H-L
  
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
  
  if (trueRanges.length < period) return result;
  
  // First ATR: simple average of first N true ranges
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
  }
  atr /= period;
  result.push({ time: data[period - 1].time, value: atr });
  
  // Subsequent ATRs using Wilder's smoothing
  for (let i = period; i < data.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push({ time: data[i].time, value: atr });
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
// VWAP - Volume Weighted Average Price
// ============================================================================

export function computeVWAP(
  data: ComputeBar[],
  anchorPeriod: "session" | "week" | "month" = "session"
): LinePoint[] {
  const result: LinePoint[] = [];
  if (data.length === 0) return result;
  
  let cumulativeTPV = 0; // Typical Price * Volume
  let cumulativeVolume = 0;
  let lastAnchor: number | null = null;
  
  for (const bar of data) {
    const date = new Date(bar.time * 1000);
    let currentAnchor: number;
    
    // Use UTC methods for deterministic anchor calculations
    switch (anchorPeriod) {
      case "session":
        // Reset daily (UTC)
        currentAnchor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        break;
      case "week":
        // Reset weekly (UTC, Sunday = 0)
        const dayOfWeek = date.getUTCDay();
        const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        weekStart.setUTCDate(date.getUTCDate() - dayOfWeek);
        currentAnchor = Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate());
        break;
      case "month":
        // Reset monthly (UTC)
        currentAnchor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
        break;
    }
    
    // Reset on new anchor period
    if (lastAnchor !== currentAnchor) {
      cumulativeTPV = 0;
      cumulativeVolume = 0;
      lastAnchor = currentAnchor;
    }
    
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
    
    const vwap = cumulativeVolume === 0 ? typicalPrice : cumulativeTPV / cumulativeVolume;
    result.push({ time: bar.time, value: vwap });
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
  dSmooth: number = 3
): StochRSIResult {
  const k: LinePoint[] = [];
  const d: LinePoint[] = [];
  
  // First calculate RSI
  const rsiValues = computeRSI(data, rsiPeriod);
  if (rsiValues.length < stochPeriod) {
    return { k, d };
  }
  
  // Apply Stochastic to RSI values
  const rawK: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    let highest = rsiValues[i].value;
    let lowest = rsiValues[i].value;
    for (let j = 1; j < stochPeriod; j++) {
      highest = Math.max(highest, rsiValues[i - j].value);
      lowest = Math.min(lowest, rsiValues[i - j].value);
    }
    const range = highest - lowest;
    const stochK = range === 0 ? 50 : ((rsiValues[i].value - lowest) / range) * 100;
    rawK.push(stochK);
  }
  
  // Smooth %K
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
  
  // Build %K line
  const kOffset = stochPeriod - 1 + (kSmooth > 1 ? kSmooth - 1 : 0);
  for (let i = 0; i < smoothedK.length; i++) {
    const rsiIdx = i + kOffset;
    if (rsiIdx < rsiValues.length) {
      k.push({ time: rsiValues[rsiIdx].time, value: smoothedK[i] });
    }
  }
  
  // Calculate %D
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
// CCI - Commodity Channel Index
// ============================================================================

export function computeCCI(
  data: ComputeBar[],
  period: number = 20
): LinePoint[] {
  const result: LinePoint[] = [];
  if (period <= 0 || data.length < period) return result;
  
  const constant = 0.015; // Lambert's constant
  
  for (let i = period - 1; i < data.length; i++) {
    // Typical Price
    const tp: number[] = [];
    for (let j = 0; j < period; j++) {
      const bar = data[i - j];
      tp.push((bar.high + bar.low + bar.close) / 3);
    }
    
    // Simple Moving Average of TP
    const smaTP = tp.reduce((a, b) => a + b, 0) / period;
    
    // Mean Deviation
    const meanDev = tp.reduce((sum, val) => sum + Math.abs(val - smaTP), 0) / period;
    
    // CCI
    const currentTP = tp[0];
    const cci = meanDev === 0 ? 0 : (currentTP - smaTP) / (constant * meanDev);
    
    result.push({ time: data[i].time, value: cci });
  }
  
  return result;
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

/**
 * PRIO 3: Indicator Registry - Unified compute interface
 * 
 * Combines manifest definitions with compute functions.
 * Provides caching layer for performance.
 */

import type { UTCTimestamp } from "@/lib/lightweightCharts";
import type { IndicatorManifest, PanePolicy } from "./indicatorManifest";
import { getIndicatorManifest, TV_COLORS } from "./indicatorManifest";
import {
  computeSMA,
  computeEMA,
  computeSMMA,
  computeWMA,
  computeDEMA,
  computeTEMA,
  computeHMA,
  computeKAMA,
  computeVWMA,
  computeMcGinley,
  computeRSI,
  computeMACD,
  computeBollingerBands,
  computeATR,
  computeADX,
  computeVWAP,
  computeOBV,
  computeStochastic,
  computeStochRSI,
  computeCCI,
  computeROC,
  computeMomentum,
  computeWilliamsR,
  type ComputeBar,
  type LinePoint,
} from "./compute";

// ============================================================================
// Types
// ============================================================================

export type IndicatorKind = 
  | "sma" | "ema" | "smma" | "wma" | "dema" | "tema" | "hma" | "kama" | "vwma" | "mcginley"
  | "rsi" | "macd" | "stoch" | "stochrsi" | "cci" | "roc" | "mom" | "willr"
  | "bb" | "atr" | "adx" | "vwap" | "obv";

export type IndicatorPane = "price" | "separate";

export interface IndicatorLineResult {
  id: string;
  label: string;
  pane: IndicatorPane;
  values: LinePoint[];
  color: string;
  style: "line" | "histogram";
  lineWidth: number;
}

export interface IndicatorWorkerResponse {
  id: string;
  kind: IndicatorKind;
  lines: IndicatorLineResult[];
  error?: string;
}

export interface IndicatorInstance {
  id: string;
  kind: IndicatorKind;
  pane: IndicatorPane;
  color: string;
  hidden?: boolean;
  params: Record<string, number | string>;
}

// ============================================================================
// Compute Cache
// ============================================================================

interface CacheKey {
  indicatorId: string;
  kind: IndicatorKind;
  paramsHash: string;
  dataHash: string;
}

interface CacheEntry {
  key: CacheKey;
  result: IndicatorWorkerResponse;
  timestamp: number;
}

const computeCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function hashParams(params: Record<string, number | string>): string {
  return JSON.stringify(params);
}

function hashData(data: ComputeBar[]): string {
  if (data.length === 0) return "empty";
  // Use length + first/last bar times as lightweight hash
  const first = data[0];
  const last = data[data.length - 1];
  return `${data.length}:${first.time}:${last.time}:${last.close}`;
}

function makeCacheKey(key: CacheKey): string {
  return `${key.indicatorId}|${key.kind}|${key.paramsHash}|${key.dataHash}`;
}

function getCached(key: CacheKey): IndicatorWorkerResponse | null {
  const cacheKey = makeCacheKey(key);
  const entry = computeCache.get(cacheKey);
  if (!entry) return null;
  
  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    computeCache.delete(cacheKey);
    return null;
  }
  
  return entry.result;
}

function setCache(key: CacheKey, result: IndicatorWorkerResponse): void {
  const cacheKey = makeCacheKey(key);
  
  // Evict oldest if at max size
  if (computeCache.size >= MAX_CACHE_SIZE) {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of computeCache) {
      if (v.timestamp < oldestTime) {
        oldest = k;
        oldestTime = v.timestamp;
      }
    }
    if (oldest) computeCache.delete(oldest);
  }
  
  computeCache.set(cacheKey, {
    key,
    result,
    timestamp: Date.now(),
  });
}

export function clearIndicatorCache(): void {
  computeCache.clear();
}

// ============================================================================
// Unified Compute Function
// ============================================================================

interface ComputeOptions {
  indicator: IndicatorInstance;
  data: ComputeBar[];
}

export function computeIndicator({ indicator, data }: ComputeOptions): IndicatorWorkerResponse {
  // Check cache
  const cacheKey: CacheKey = {
    indicatorId: indicator.id,
    kind: indicator.kind,
    paramsHash: hashParams(indicator.params),
    dataHash: hashData(data),
  };
  
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Compute
  const result = doCompute(indicator, data);
  
  // Cache result
  setCache(cacheKey, result);
  
  return result;
}

function doCompute(indicator: IndicatorInstance, data: ComputeBar[]): IndicatorWorkerResponse {
  const manifest = getIndicatorManifest(indicator.kind);
  const pane: IndicatorPane = manifest?.panePolicy === "overlay" ? "price" : "separate";
  
  try {
    switch (indicator.kind) {
      case "sma": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeSMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "sma",
            label: `SMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.blue,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "ema": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeEMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "ema",
            label: `EMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.orange,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "smma": {
        const period = Number(indicator.params.period) || 14;
        const source = (indicator.params.source as string) || "close";
        const values = computeSMMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "smma",
            label: `SMMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.blue,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "wma": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeWMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "wma",
            label: `WMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "dema": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeDEMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "dema",
            label: `DEMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.teal,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "tema": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeTEMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "tema",
            label: `TEMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.pink,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "hma": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeHMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "hma",
            label: `HMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.green,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "kama": {
        const period = Number(indicator.params.period) || 10;
        const fast = Number(indicator.params.fast) || 2;
        const slow = Number(indicator.params.slow) || 30;
        const source = (indicator.params.source as string) || "close";
        const values = computeKAMA(data, period, fast, slow, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "kama",
            label: `KAMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.orange,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "vwma": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeVWMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "vwma",
            label: `VWMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "mcginley": {
        const period = Number(indicator.params.period) || 14;
        const source = (indicator.params.source as string) || "close";
        const values = computeMcGinley(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "mcginley",
            label: `McGinley(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.teal,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "rsi": {
        const period = Number(indicator.params.period) || 14;
        const values = computeRSI(data, period);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "rsi",
            label: `RSI(${period})`,
            pane: "separate",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "macd": {
        const fast = Number(indicator.params.fast) || 12;
        const slow = Number(indicator.params.slow) || 26;
        const signal = Number(indicator.params.signal) || 9;
        const result = computeMACD(data, fast, slow, signal);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "macd",
              label: `MACD(${fast},${slow})`,
              pane: "separate",
              color: indicator.color || TV_COLORS.blue,
              style: "line",
              lineWidth: 2,
              values: result.macd,
            },
            {
              id: "signal",
              label: `Signal(${signal})`,
              pane: "separate",
              color: lightenColor(indicator.color || TV_COLORS.blue, 0.4),
              style: "line",
              lineWidth: 1,
              values: result.signal,
            },
            {
              id: "histogram",
              label: "Histogram",
              pane: "separate",
              color: TV_COLORS.teal,
              style: "histogram",
              lineWidth: 1,
              values: result.histogram,
            },
          ],
        };
      }
      
      case "bb": {
        const period = Number(indicator.params.period) || 20;
        const stdDev = Number(indicator.params.stdDev) || 2;
        const source = (indicator.params.source as string) || "close";
        const result = computeBollingerBands(data, period, stdDev, source as any);
        const baseColor = indicator.color || TV_COLORS.blue;
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "upper",
              label: "Upper",
              pane: "price",
              color: baseColor,
              style: "line",
              lineWidth: 1,
              values: result.upper,
            },
            {
              id: "middle",
              label: `BB(${period},${stdDev})`,
              pane: "price",
              color: baseColor,
              style: "line",
              lineWidth: 2,
              values: result.middle,
            },
            {
              id: "lower",
              label: "Lower",
              pane: "price",
              color: baseColor,
              style: "line",
              lineWidth: 1,
              values: result.lower,
            },
          ],
        };
      }
      
      case "atr": {
        const period = Number(indicator.params.period) || 14;
        const values = computeATR(data, period);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "atr",
            label: `ATR(${period})`,
            pane: "separate",
            color: indicator.color || TV_COLORS.teal,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "adx": {
        const period = Number(indicator.params.period) || 14;
        const smoothing = Number(indicator.params.smoothing) || 14;
        const result = computeADX(data, period, smoothing);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "adx",
              label: `ADX(${period})`,
              pane: "separate",
              color: indicator.color || TV_COLORS.blue,
              style: "line",
              lineWidth: 2,
              values: result.adx,
            },
            {
              id: "plusDI",
              label: "+DI",
              pane: "separate",
              color: TV_COLORS.green,
              style: "line",
              lineWidth: 1,
              values: result.plusDI,
            },
            {
              id: "minusDI",
              label: "-DI",
              pane: "separate",
              color: TV_COLORS.red,
              style: "line",
              lineWidth: 1,
              values: result.minusDI,
            },
          ],
        };
      }
      
      case "vwap": {
        const anchor = (indicator.params.anchorPeriod as "session" | "week" | "month") || "session";
        const values = computeVWAP(data, anchor);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "vwap",
            label: "VWAP",
            pane: "price",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "obv": {
        const values = computeOBV(data);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "obv",
            label: "OBV",
            pane: "separate",
            color: indicator.color || TV_COLORS.teal,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }

      // ── Batch 2: Momentum Indicators ──────────────────────────────────
      
      case "stoch": {
        const kPeriod = Number(indicator.params.kPeriod) || 14;
        const kSmooth = Number(indicator.params.kSmooth) || 1;
        const dSmooth = Number(indicator.params.dSmooth) || 3;
        const result = computeStochastic(data, kPeriod, kSmooth, dSmooth);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "k",
              label: "%K",
              pane: "separate",
              color: indicator.params.kColor as string || TV_COLORS.blue,
              style: "line",
              lineWidth: 1,
              values: result.k,
            },
            {
              id: "d",
              label: "%D",
              pane: "separate",
              color: indicator.params.dColor as string || TV_COLORS.orange,
              style: "line",
              lineWidth: 1,
              values: result.d,
            },
          ],
        };
      }
      
      case "stochrsi": {
        const rsiPeriod = Number(indicator.params.rsiPeriod) || 14;
        const stochPeriod = Number(indicator.params.stochPeriod) || 14;
        const kSmooth = Number(indicator.params.kSmooth) || 3;
        const dSmooth = Number(indicator.params.dSmooth) || 3;
        const result = computeStochRSI(data, rsiPeriod, stochPeriod, kSmooth, dSmooth);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "k",
              label: "%K",
              pane: "separate",
              color: indicator.params.kColor as string || TV_COLORS.blue,
              style: "line",
              lineWidth: 1,
              values: result.k,
            },
            {
              id: "d",
              label: "%D",
              pane: "separate",
              color: indicator.params.dColor as string || TV_COLORS.orange,
              style: "line",
              lineWidth: 1,
              values: result.d,
            },
          ],
        };
      }
      
      case "cci": {
        const period = Number(indicator.params.period) || 20;
        const values = computeCCI(data, period);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "cci",
            label: `CCI(${period})`,
            pane: "separate",
            color: indicator.color || TV_COLORS.teal,
            style: "line",
            lineWidth: 1,
            values,
          }],
        };
      }
      
      case "roc": {
        const period = Number(indicator.params.period) || 9;
        const source = (indicator.params.source as string) || "close";
        const values = computeROC(data, period, source);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "roc",
            label: `ROC(${period})`,
            pane: "separate",
            color: indicator.color || TV_COLORS.blue,
            style: "line",
            lineWidth: 1,
            values,
          }],
        };
      }
      
      case "mom": {
        const period = Number(indicator.params.period) || 10;
        const source = (indicator.params.source as string) || "close";
        const values = computeMomentum(data, period, source);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "mom",
            label: `MOM(${period})`,
            pane: "separate",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 1,
            values,
          }],
        };
      }
      
      case "willr": {
        const period = Number(indicator.params.period) || 14;
        const values = computeWilliamsR(data, period);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "willr",
            label: `%R(${period})`,
            pane: "separate",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 1,
            values,
          }],
        };
      }
      
      default:
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [],
          error: `Unknown indicator kind: ${indicator.kind}`,
        };
    }
  } catch (error) {
    return {
      id: indicator.id,
      kind: indicator.kind,
      lines: [],
      error: error instanceof Error ? error.message : "Compute failed",
    };
  }
}

// ============================================================================
// Color Helpers
// ============================================================================

function lightenColor(hex: string, amount: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const amt = Math.max(0, Math.min(1, amount));
  const num = Number.parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const lerp = (channel: number) => Math.round(channel + (255 - channel) * amt);
  return `rgb(${lerp(r)}, ${lerp(g)}, ${lerp(b)})`;
}

// ============================================================================
// Default Params Helper
// ============================================================================

export function getDefaultParams(kind: IndicatorKind): Record<string, number | string> {
  const manifest = getIndicatorManifest(kind);
  if (!manifest) {
    // Fallback for legacy kinds
    switch (kind) {
      case "sma": return { period: 20, source: "close" };
      case "ema": return { period: 20, source: "close" };
      case "smma": return { period: 14, source: "close" };
      case "wma": return { period: 20, source: "close" };
      case "dema": return { period: 20, source: "close" };
      case "tema": return { period: 20, source: "close" };
      case "hma": return { period: 20, source: "close" };
      case "kama": return { period: 10, fast: 2, slow: 30, source: "close" };
      case "vwma": return { period: 20, source: "close" };
      case "mcginley": return { period: 14, source: "close" };
      case "rsi": return { period: 14 };
      case "macd": return { fast: 12, slow: 26, signal: 9 };
      case "bb": return { period: 20, stdDev: 2, source: "close" };
      case "atr": return { period: 14 };
      case "adx": return { period: 14, smoothing: 14 };
      case "vwap": return { anchorPeriod: "session" };
      case "obv": return {};
      // Batch 2: Momentum fallbacks
      case "stoch": return { kPeriod: 14, kSmooth: 1, dSmooth: 3 };
      case "stochrsi": return { rsiPeriod: 14, stochPeriod: 14, kSmooth: 3, dSmooth: 3 };
      case "cci": return { period: 20 };
      case "roc": return { period: 9, source: "close" };
      case "mom": return { period: 10, source: "close" };
      case "willr": return { period: 14 };
      default: return {};
    }
  }
  const result: Record<string, number | string> = {};
  for (const input of manifest.inputs) {
    result[input.key] = input.default;
  }
  return result;
}

export function getDefaultColor(kind: IndicatorKind): string {
  const manifest = getIndicatorManifest(kind);
  if (manifest && manifest.outputs.length > 0) {
    return manifest.outputs[0].defaultColor;
  }
  return TV_COLORS.blue;
}

export function getDefaultPane(kind: IndicatorKind): IndicatorPane {
  const manifest = getIndicatorManifest(kind);
  return manifest?.panePolicy === "overlay" ? "price" : "separate";
}

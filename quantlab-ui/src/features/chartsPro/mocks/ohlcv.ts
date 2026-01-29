import type { NormalizedBar, RawOhlcvRow, Tf } from "../types";
import { normalizeRows } from "../types";

interface FixtureConfig {
  symbol: string;
  timeframe: Tf;
  intervalMinutes: number;
  basePrice: number;
  count: number;
}

const MINUTE = 60 * 1000;
// Start from a date that allows YTD to have meaningful data
const START_TS = Date.UTC(2025, 0, 2, 9, 30, 0); // Jan 2, 2025, 9:30 AM

/**
 * TV-37.2 Mock Data Configuration
 * 
 * Density requirements per timeframe:
 * - 1m: ~390 bars/trading day → 5D = 1950 bars, 1M = ~8000 bars
 * - 5m: ~78 bars/trading day → 5D = 390 bars, 1M = ~1600 bars
 * - 15m: ~26 bars/trading day → 5D = 130 bars, 1M = ~520 bars
 * - 1h: ~6.5 bars/trading day → 5D = 33 bars, 1M = ~130 bars
 * - 4h: ~1.6 bars/trading day → 5D = 8 bars, 1M = ~32 bars
 * - 1D: 1 bar/trading day → YTD = ~20 bars (Jan), 1Y = ~252 bars
 * 
 * For simplicity in tests, we use calendar time (not trading hours).
 */
const FIXTURE_CONFIGS: FixtureConfig[] = [
  // AAPL.US - Full coverage for all timeframes
  { symbol: "AAPL.US", timeframe: "1m", intervalMinutes: 1, basePrice: 180, count: 2000 },   // ~5D of 1m data
  { symbol: "AAPL.US", timeframe: "5m", intervalMinutes: 5, basePrice: 181, count: 500 },    // ~5D of 5m data
  { symbol: "AAPL.US", timeframe: "15m", intervalMinutes: 15, basePrice: 182, count: 200 },  // ~5D of 15m data
  { symbol: "AAPL.US", timeframe: "1h", intervalMinutes: 60, basePrice: 183, count: 200 },   // ~8D of 1h data
  { symbol: "AAPL.US", timeframe: "4h", intervalMinutes: 240, basePrice: 184, count: 100 },  // ~16D of 4h data
  { symbol: "AAPL.US", timeframe: "D", intervalMinutes: 1440, basePrice: 185, count: 365 },  // 1Y of daily
  { symbol: "AAPL.US", timeframe: "1D", intervalMinutes: 1440, basePrice: 185, count: 365 }, // 1Y of daily
  { symbol: "AAPL.US", timeframe: "1W", intervalMinutes: 10080, basePrice: 186, count: 104 },// 2Y of weekly
  
  // META.US - Full coverage
  { symbol: "META.US", timeframe: "1m", intervalMinutes: 1, basePrice: 500, count: 2000 },
  { symbol: "META.US", timeframe: "5m", intervalMinutes: 5, basePrice: 501, count: 500 },
  { symbol: "META.US", timeframe: "15m", intervalMinutes: 15, basePrice: 502, count: 200 },
  { symbol: "META.US", timeframe: "1h", intervalMinutes: 60, basePrice: 503, count: 200 },
  { symbol: "META.US", timeframe: "4h", intervalMinutes: 240, basePrice: 504, count: 100 },
  { symbol: "META.US", timeframe: "D", intervalMinutes: 1440, basePrice: 505, count: 365 },
  { symbol: "META.US", timeframe: "1D", intervalMinutes: 1440, basePrice: 505, count: 365 },
  { symbol: "META.US", timeframe: "1W", intervalMinutes: 10080, basePrice: 506, count: 104 },
  
  // Additional symbols with basic coverage
  { symbol: "MSFT.US", timeframe: "1h", intervalMinutes: 60, basePrice: 250, count: 200 },
  { symbol: "MSFT.US", timeframe: "D", intervalMinutes: 1440, basePrice: 251, count: 365 },
  { symbol: "MSFT.US", timeframe: "1D", intervalMinutes: 1440, basePrice: 251, count: 365 },
  { symbol: "GOOG.US", timeframe: "1h", intervalMinutes: 60, basePrice: 140, count: 200 },
  { symbol: "GOOG.US", timeframe: "D", intervalMinutes: 1440, basePrice: 141, count: 365 },
  { symbol: "GOOG.US", timeframe: "1D", intervalMinutes: 1440, basePrice: 141, count: 365 },
  { symbol: "IBM.US", timeframe: "1h", intervalMinutes: 60, basePrice: 120, count: 200 },
  { symbol: "TSLA.US", timeframe: "1h", intervalMinutes: 60, basePrice: 200, count: 200 },
];

const rawStore = new Map<string, RawOhlcvRow[]>();
const normalizedStore = new Map<string, NormalizedBar[]>();

function makeKey(symbol: string, timeframe: string) {
  return `${symbol.trim().toUpperCase()}__${timeframe}`;
}

function buildRows(config: FixtureConfig): RawOhlcvRow[] {
  const rows: RawOhlcvRow[] = [];
  for (let i = 0; i < config.count; i += 1) {
    const ts = new Date(START_TS + i * config.intervalMinutes * MINUTE).toISOString();
    // Create realistic-looking price movement with some noise
    const noise = Math.sin(i * 0.1) * 2 + Math.cos(i * 0.05) * 1;
    const trend = i * 0.02; // Slight upward trend
    const close = Number((config.basePrice + trend + noise).toFixed(2));
    const volatility = Math.max(0.5, Math.abs(noise) * 0.3);
    rows.push({
      t: ts,
      o: Number((close - volatility * 0.5 + Math.random() * volatility * 0.2).toFixed(2)),
      h: Number((close + volatility).toFixed(2)),
      l: Number((close - volatility).toFixed(2)),
      c: close,
      v: Math.floor(1_000_000 + Math.random() * 500_000 + i * 100),
    });
  }
  return rows;
}

FIXTURE_CONFIGS.forEach((cfg) => {
  rawStore.set(makeKey(cfg.symbol, cfg.timeframe), buildRows(cfg));
});

function ensureNormalized(symbol: string, timeframe: string): NormalizedBar[] {
  const key = makeKey(symbol, timeframe);
  const existing = normalizedStore.get(key);
  if (existing) return existing;
  const raw = rawStore.get(key);
  if (!raw) return [];
  const normalized = normalizeRows(raw);
  normalizedStore.set(key, normalized);
  return normalized;
}

export function getMockOhlcv(symbol: string, timeframe: Tf): NormalizedBar[] {
  return ensureNormalized(symbol, timeframe);
}

export function getMockOhlcvRaw(symbol: string, timeframe: string): RawOhlcvRow[] {
  const key = makeKey(symbol, timeframe);
  return rawStore.get(key) ?? [];
}

export function listMockKeys() {
  return Array.from(rawStore.keys());
}

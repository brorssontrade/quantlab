import type { NormalizedBar, RawOhlcvRow, Tf } from "../types";
import { normalizeRows } from "../types";

interface FixtureConfig {
  symbol: string;
  timeframe: Tf;
  intervalHours: number;
  basePrice: number;
  count: number;
}

const HOUR = 60 * 60 * 1000;
const START_TS = Date.UTC(2024, 0, 2, 10, 0, 0);

const FIXTURE_CONFIGS: FixtureConfig[] = [
  { symbol: "AAPL.US", timeframe: "1h", intervalHours: 1, basePrice: 180, count: 12 },
  { symbol: "AAPL.US", timeframe: "4h", intervalHours: 4, basePrice: 181, count: 12 },
  { symbol: "META.US", timeframe: "1h", intervalHours: 1, basePrice: 300, count: 12 },
  { symbol: "META.US", timeframe: "4h", intervalHours: 4, basePrice: 302, count: 12 },
  { symbol: "MSFT.US", timeframe: "1h", intervalHours: 1, basePrice: 250, count: 12 },
  { symbol: "MSFT.US", timeframe: "4h", intervalHours: 4, basePrice: 251, count: 12 },
  { symbol: "GOOG.US", timeframe: "1h", intervalHours: 1, basePrice: 140, count: 12 },
  { symbol: "IBM.US", timeframe: "1h", intervalHours: 1, basePrice: 120, count: 12 },
  { symbol: "TSLA.US", timeframe: "1h", intervalHours: 1, basePrice: 200, count: 12 },
];

const rawStore = new Map<string, RawOhlcvRow[]>();
const normalizedStore = new Map<string, NormalizedBar[]>();

function makeKey(symbol: string, timeframe: string) {
  return `${symbol.trim().toUpperCase()}__${timeframe}`;
}

function buildRows(config: FixtureConfig): RawOhlcvRow[] {
  const rows: RawOhlcvRow[] = [];
  for (let i = 0; i < config.count; i += 1) {
    const ts = new Date(START_TS + i * config.intervalHours * HOUR).toISOString();
    const close = Number((config.basePrice + i * 0.75).toFixed(2));
    rows.push({
      t: ts,
      o: close - 0.5,
      h: close + 1,
      l: close - 1,
      c: close,
      v: 1_000 + i * 25,
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

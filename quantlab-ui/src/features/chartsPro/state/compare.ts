import type { NormalizedBar, Tf } from "../types";
import { TIMEFRAME_OPTIONS } from "./controls";

export type CompareMode = "percent" | "indexed" | "price";
export type CompareAddMode = "samePercent" | "newPriceScale" | "newPane";

export const compareCache = new Map<string, NormalizedBar[]>(); // key = `${symbol}__${bar}`
export const cacheKey = (sym: string, bar: string) => `${sym.toUpperCase()}__${bar}`;
export const SYMBOL_PATTERN = /^[A-Z0-9]+\.[A-Z]{2,}$/;

/**
 * Canonical ID encoder for symbols/objects (exact TradingView parity).
 * Transforms raw symbol (e.g. "META.US", "NASDAQ:AAPL", "DEU40/XETR") to safe [a-z0-9-] only.
 * 
 * Exact mapping (in order):
 * 1. Trim whitespace
 * 2. A–Z → lowercase (a–z)
 * 3. a–z → kept
 * 4. 0–9 → kept
 * 5. . : / \ (space) _ + → '-'
 * 6. All other chars → '-'
 * 7. Collapse --+ to single '-'
 * 8. Trim '-' from start/end
 * 9. If empty → 'x'
 * 
 * Examples:
 *   "META.US" → "meta-us"
 *   "NASDAQ:AAPL" → "nasdaq-aapl"
 *   "DEU40/XETR" → "deu40-xetr"
 *   "SPY_100+" → "spy-100"
 *   "SPCFD" → "spcfd"
 *   "" → "x"
 */
export function encodeId(raw: string): string {
  // 1. Trim whitespace
  let s = (raw ?? "").trim();
  if (s.length === 0) return "x";
  
  // 2-6. Transform to safe chars
  const result = s
    .split("")
    .map((ch) => {
      // Lowercase A-Z
      if (/[A-Z]/.test(ch)) return ch.toLowerCase();
      // Keep a-z and 0-9
      if (/[a-z0-9]/.test(ch)) return ch;
      // Map these to '-'
      if (/[.:\/\\ _+]/.test(ch)) return "-";
      // Everything else → '-'
      return "-";
    })
    .join("");
  
  // 7. Collapse multiple '-' to single '-'
  const collapsed = result.replace(/-+/g, "-");
  
  // 8. Trim '-' from start/end
  const trimmed = collapsed.replace(/^-+|-+$/g, "");
  
  // 9. If empty, return 'x'
  return trimmed.length === 0 ? "x" : trimmed;
}

/**
 * Safe object ID for compare series: "compare-" + encoded symbol
 */
export function encodeCompareId(symbol: string): string {
  return `compare-${encodeId(symbol)}`;
}

/**
 * Attempt to find a compare symbol from an encoded compare-id.
 * Since encoding is lossy (multi-char → single-char), we need to search
 * through existing compares to find the best match.
 * 
 * This is used when UI events reference compare-meta-us and we need to find
 * the original symbol like "META.US" or "META-US" or "METAUS" etc.
 */
export function decodeCompareId(id: string, compareSymbols: string[]): string | null {
  if (!id.startsWith("compare-")) return null;
  
  const encodedPart = id.slice(8); // Remove "compare-" prefix
  
  // Try exact match first
  for (const sym of compareSymbols) {
    if (encodeId(sym) === encodedPart) {
      return sym;
    }
  }
  
  // No exact match found
  return null;
}

export type PersistedCompare = { symbol: string; mode: CompareMode; timeframe: Tf; addMode?: CompareAddMode };
export type OverlayState = { sma: number[]; ema: number[] };
const COMPARE_KEYS = ["cp.compares", "chartsPro/compares"] as const;
const MODE_KEYS = ["cp.compareMode", "ql/chartsPro/compareMode"] as const;
const TF_KEYS = ["cp.timeframe", "ql/chartsPro/compareTf"] as const;
const OVERLAY_KEY = "cp.overlays";

export function loadPersisted(): PersistedCompare[] {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return [];
    for (const key of COMPARE_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      if (key !== COMPARE_KEYS[0]) {
        window.localStorage.setItem(COMPARE_KEYS[0], raw);
        window.localStorage.removeItem(key);
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.items) ? (parsed.items as PersistedCompare[]) : [];
    }
    return [];
  } catch {
    return [];
  }
}

export function savePersisted(items: PersistedCompare[]) {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
    window.localStorage.setItem(COMPARE_KEYS[0], JSON.stringify({ items }));
  } catch {
    // ignore quota errors
  }
}

const COMPARE_COLORS = ["#2962ff", "#9333ea", "#0ea5e9", "#10b981"];
const compareColorAssignments = new Map<string, string>();
let compareColorIndex = 0;

export function colorFor(key: string) {
  const normalized = key.trim().toUpperCase();
  const existing = compareColorAssignments.get(normalized);
  if (existing) return existing;
  const color = COMPARE_COLORS[compareColorIndex % COMPARE_COLORS.length];
  compareColorAssignments.set(normalized, color);
  compareColorIndex += 1;
  return color;
}

export function loadPreferredCompareMode(defaultMode: CompareMode = "percent"): CompareMode {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return defaultMode;
    for (const key of MODE_KEYS) {
      const stored = window.localStorage.getItem(key);
      if (!stored) continue;
      if (key !== MODE_KEYS[0]) {
        window.localStorage.setItem(MODE_KEYS[0], stored);
        window.localStorage.removeItem(key);
      }
      if (stored === "percent" || stored === "indexed" || stored === "price") return stored;
      return defaultMode;
    }
    return defaultMode;
  } catch {
    return defaultMode;
  }
}

export function savePreferredCompareMode(mode: CompareMode) {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
    window.localStorage.setItem(MODE_KEYS[0], mode);
  } catch {
    // ignore
  }
}

const TF_VALUES = new Set<Tf>(TIMEFRAME_OPTIONS.map((option) => option.value));

export function loadPreferredCompareTimeframe(fallback: Tf): Tf {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return fallback;
    for (const key of TF_KEYS) {
      const stored = window.localStorage.getItem(key);
      if (!stored) continue;
      if (key !== TF_KEYS[0]) {
        window.localStorage.setItem(TF_KEYS[0], stored);
        window.localStorage.removeItem(key);
      }
      if (TF_VALUES.has(stored as Tf)) {
        return stored as Tf;
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function savePreferredCompareTimeframe(tf: Tf) {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
    window.localStorage.setItem(TF_KEYS[0], tf);
  } catch {
    // ignore
  }
}

export function loadOverlayState(): OverlayState {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return { sma: [], ema: [] };
    }
    const raw = window.localStorage.getItem(OVERLAY_KEY);
    if (!raw) return { sma: [], ema: [] };
    const parsed = JSON.parse(raw) as Partial<OverlayState>;
    return {
      sma: sanitizeOverlayArray(parsed?.sma),
      ema: sanitizeOverlayArray(parsed?.ema),
    };
  } catch {
    return { sma: [], ema: [] };
  }
}

export function saveOverlayState(state: OverlayState) {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
    window.localStorage.setItem(
      OVERLAY_KEY,
      JSON.stringify({
        sma: sanitizeOverlayArray(state.sma),
        ema: sanitizeOverlayArray(state.ema),
      }),
    );
  } catch {
    // ignore
  }
}

function sanitizeOverlayArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<number>();
  value.forEach((item) => {
    if (typeof item === "number" && Number.isFinite(item) && item > 0) {
      set.add(Math.floor(item));
    }
  });
  return Array.from(set).sort((a, b) => a - b);
}

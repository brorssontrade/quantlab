/**
 * hoverPipeline.ts
 *
 * Canonical source of truth for hover state management.
 * Exports:
 * - resolveHoverWhere: Maps HoverTarget (string/number) to timeKey deterministically
 * - applyHoverSnapshot: Takes timeKey and builds full HoverSnapshot
 * - buildFallbackHoverSnapshot: Minimal snapshot when data is sparse
 *
 * QA Primitives:
 * - window.__lwcharts._qaHoverLastResolve: Debug info from resolveHoverWhere
 * - window.__lwcharts._qaApplyHover: Debug info from applyHoverSnapshot
 * - window.__lwcharts._qaClearHover: Flag when hover cleared
 */

import type { HoverTarget, HoverSnapshot, NormalizedBar } from "../types";

export interface HoverResolveResult {
  timeKey: number | null;
  reason: string;
}

/**
 * Canonical resolver: maps HoverTarget (alias or numeric) to timeKey.
 * Uses only baseRows for deterministic, testable behavior.
 *
 * Deterministic rules:
 * - "left" | "first" → index 0
 * - "center" | "mid" → index floor(baseLen / 2)
 * - "right" | "last" → index baseLen - 1
 * - "anchor" → percentAnchorRef.current?.index ?? floor(baseLen / 2)
 * - numeric n in [0, 1) → fraction of range
 * - numeric n >= 1 → direct index (clamped to [0..baseLen-1])
 * - undefined → returns null with reason "UNDEFINED_TARGET"
 *
 * QA instrumentation: sets window.__lwcharts._qaHoverLastResolve
 */
export const resolveHoverWhere = (
  where: HoverTarget | undefined,
  baseRows: NormalizedBar[],
  percentAnchorIndex?: number | null,
): HoverResolveResult => {
  const baseLen = baseRows.length;

  // Initialize QA debug info
  let qaResolve: any = { where, baseLen, reason: "" };

  // Fail fast if no data
  if (baseLen === 0) {
    qaResolve.reason = "NO_BASE_ROWS";
    if (typeof window !== "undefined") {
      (window as any).__lwcharts = (window as any).__lwcharts || {};
      (window as any).__lwcharts._qaHoverLastResolve = qaResolve;
    }
    return { timeKey: null, reason: "NO_BASE_ROWS" };
  }

  let targetIndex: number | null = null;

  if (typeof where === "number") {
    // Numeric: treat as index or fraction
    if (where >= 0 && where < 1) {
      // Fraction [0..1) of baseRows
      targetIndex = Math.floor(where * Math.max(1, baseLen - 1));
    } else if (where >= 1) {
      // Direct index, clamp to [0..baseLen-1]
      targetIndex = Math.min(Math.max(Math.floor(where), 0), baseLen - 1);
    } else {
      // Negative number: invalid
      qaResolve.reason = "INVALID_NUMERIC";
      if (typeof window !== "undefined") {
        (window as any).__lwcharts._qaHoverLastResolve = qaResolve;
      }
      return { timeKey: null, reason: "INVALID_NUMERIC" };
    }
  } else if (where === undefined) {
    // undefined → return null (let caller decide what to do)
    qaResolve.reason = "UNDEFINED_TARGET";
    if (typeof window !== "undefined") {
      (window as any).__lwcharts._qaHoverLastResolve = qaResolve;
    }
    return { timeKey: null, reason: "UNDEFINED_TARGET" };
  } else {
    const str = String(where).toLowerCase().trim();

    // All position and named aliases use baseRows (deterministic)
    if (str === "left" || str === "first") {
      targetIndex = 0;
    } else if (str === "center" || str === "mid") {
      targetIndex = Math.floor(baseLen / 2);
    } else if (str === "right" || str === "last") {
      targetIndex = baseLen - 1;
    } else if (str === "anchor") {
      // Percent-anchor if exists, else center
      targetIndex = percentAnchorIndex ?? Math.floor(baseLen / 2);
    } else {
      // Unknown alias, fallback to center
      targetIndex = Math.floor(baseLen / 2);
      qaResolve.reason = `UNKNOWN_ALIAS:${str}`;
    }
  }

  // Clamp index to valid range
  if (targetIndex === null) {
    qaResolve.reason = "INDEX_NULL";
    if (typeof window !== "undefined") {
      (window as any).__lwcharts._qaHoverLastResolve = qaResolve;
    }
    return { timeKey: null, reason: "INDEX_NULL" };
  }

  targetIndex = Math.max(0, Math.min(targetIndex, baseLen - 1));

  // Extract timeKey from base row
  const row = baseRows[targetIndex];
  const timeKey = row ? Number(row.time) : null;

  if (timeKey === null || !Number.isFinite(timeKey)) {
    qaResolve.reason = "TIMEKEY_INVALID";
    qaResolve.timeKeyValue = timeKey;
    if (typeof window !== "undefined") {
      (window as any).__lwcharts._qaHoverLastResolve = qaResolve;
    }
    return { timeKey: null, reason: "TIMEKEY_INVALID" };
  }

  qaResolve.reason = "OK";
  qaResolve.selectedIndex = targetIndex;
  qaResolve.timeKey = timeKey;
  if (typeof window !== "undefined") {
    (window as any).__lwcharts._qaHoverLastResolve = qaResolve;
  }

  return { timeKey, reason: "OK" };
};

/**
 * Builds a minimal fallback snapshot when hover data is unavailable.
 * Used when timeKey is null or bar not found in mainBarByTime.
 */
export const buildFallbackHoverSnapshot = (): HoverSnapshot => {
  return {
    time: null,
    x: null,
    y: null,
    timeLabel: "",
    priceLabel: "",
    base: {
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      percent: 0,
    },
    compares: {},
    overlayValues: {},
    ohlcDisplay: {
      symbol: "",
      open: "—",
      high: "—",
      low: "—",
      close: "—",
      change: "—",
    },
    compareDisplays: {},
  };
};

/**
 * Applies hover snapshot by updating refs and QA instrumentation.
 * This is a wrapper that will be implemented in ChartViewport
 * since it needs access to many refs and formatting functions.
 *
 * Returns the snapshot that was applied, or null if no snapshot.
 */
export type ApplyHoverSnapshotFn = (timeKey: number | null) => HoverSnapshot | null;

/**
 * QA instrumentation helpers
 */
export const setQaApplyHover = (info: any) => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaApplyHover = info;
};

export const setQaClearHover = () => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaClearHover = true;
};

/**
 * CrosshairOverlayLayer - Performance-isolated crosshair rendering
 * 
 * TV-38.1: This component owns its crosshair subscription and state,
 * completely decoupled from ChartViewport's render cycle.
 * 
 * Key optimizations:
 * - RAF-throttled to max 1 commit per frame
 * - Bail early if timeKey unchanged (same bar)
 * - Cached date formatters (module-level)
 * - Isolated state - crosshair updates don't trigger ChartViewport re-render
 * - Tracks active handler count for regression detection
 */
import { useEffect, useRef, useState, memo, useCallback } from "react";
import type { IChartApi, MouseEventParams, Time } from "@/lib/lightweightCharts";
import { CrosshairOverlay, type CrosshairPosition } from "./CrosshairOverlay";
import type { ChartsTheme } from "../theme";
import type { NormalizedBar, Tf } from "../types";

// ========== PERFORMANCE: Cached date formatters (module-level singletons) ==========
const DATE_FORMATTER_DAILY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const DATE_FORMATTER_INTRADAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Format time efficiently using cached formatters */
function formatCrosshairTime(timestamp: number, isDaily: boolean): string {
  const date = new Date(timestamp * 1000);
  return isDaily ? DATE_FORMATTER_DAILY.format(date) : DATE_FORMATTER_INTRADAY.format(date);
}

/** Normalize time to number (handles both number and string times) */
function normalizeTimeKey(time: Time): number | null {
  if (typeof time === "number") return time;
  if (typeof time === "string") {
    const d = new Date(time);
    return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
  }
  return null;
}

// ========== PERFORMANCE: Perf tracking types ==========
export interface CrosshairPerfMetrics {
  crosshairRawEvents: number;
  crosshairFrameCommits: number;
  crosshairBailouts: number;
  lastHandlerMs: number;
  applyHoverSnapshotCalls: number;
  applyHoverSnapshotMs: number;
  activeCrosshairHandlers: number; // TV-38.1: Track for double-subscription detection
}

// ========== Module-level singleton for perf metrics ==========
// This is global so dump() can access it without needing component ref
let globalPerfMetrics: CrosshairPerfMetrics = {
  crosshairRawEvents: 0,
  crosshairFrameCommits: 0,
  crosshairBailouts: 0,
  lastHandlerMs: 0,
  applyHoverSnapshotCalls: 0,
  applyHoverSnapshotMs: 0,
  activeCrosshairHandlers: 0,
};

/** Get current perf metrics (for dump() and _perf API) */
export function getCrosshairPerfMetrics(): CrosshairPerfMetrics {
  return { ...globalPerfMetrics };
}

/** Reset perf metrics (for _perf.reset()) */
export function resetCrosshairPerfMetrics(): void {
  globalPerfMetrics = {
    crosshairRawEvents: 0,
    crosshairFrameCommits: 0,
    crosshairBailouts: 0,
    lastHandlerMs: 0,
    applyHoverSnapshotCalls: 0,
    applyHoverSnapshotMs: 0,
    activeCrosshairHandlers: globalPerfMetrics.activeCrosshairHandlers, // Preserve handler count
  };
}

export interface CrosshairOverlayLayerProps {
  /** Ref to the lightweight-charts IChartApi instance */
  chartRef: React.RefObject<IChartApi | null>;
  /** Whether the chart is ready */
  chartReady: boolean;
  /** Theme for styling */
  theme: ChartsTheme;
  /** Container ref for dimensions */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current timeframe (for date formatting) */
  timeframe: Tf;
  /** Map of timeKey -> bar data for price lookup */
  barByTime: Map<number, NormalizedBar>;
  /** Whether crosshair is visible */
  showCrosshair: boolean;
  /** Callback when hover snapshot should be applied (for legend/OHLC updates) */
  onHoverSnapshot?: (timeKey: number | null) => void;
}

/**
 * Performance-isolated crosshair overlay layer.
 * This component owns its own subscription and state - crosshair updates
 * don't cause the parent ChartViewport to re-render.
 */
export const CrosshairOverlayLayer = memo(function CrosshairOverlayLayer({
  chartRef,
  chartReady,
  theme,
  containerRef,
  timeframe,
  barByTime,
  showCrosshair,
  onHoverSnapshot,
}: CrosshairOverlayLayerProps) {
  // Local state - isolated from parent render cycle
  const [position, setPosition] = useState<CrosshairPosition>({
    x: 0,
    y: 0,
    price: null,
    time: null,
    visible: false,
  });

  // Refs for RAF throttling
  const lastTimeKeyRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  
  // Stable callback ref for onHoverSnapshot
  const onHoverSnapshotRef = useRef(onHoverSnapshot);
  onHoverSnapshotRef.current = onHoverSnapshot;

  // Stable ref for barByTime (changes frequently, but we read from ref)
  const barByTimeRef = useRef(barByTime);
  barByTimeRef.current = barByTime;

  // Stable ref for timeframe
  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    // Track active handlers (TV-38.1)
    globalPerfMetrics.activeCrosshairHandlers++;

    // Pending RAF state (closure-local)
    let pendingParam: MouseEventParams<Time> | null = null;
    let rafScheduled = false;

    const processFrame = () => {
      rafScheduled = false;
      const param = pendingParam;
      if (!param) return;

      const startMs = performance.now();

      // Handle mouse-out (no time/point)
      if (!param.time || !param.point) {
        if (lastTimeKeyRef.current !== null) {
          onHoverSnapshotRef.current?.(null);
          lastTimeKeyRef.current = null;
        }
        setPosition({ x: 0, y: 0, price: null, time: null, visible: false });
        globalPerfMetrics.crosshairFrameCommits++;
        globalPerfMetrics.lastHandlerMs = performance.now() - startMs;
        return;
      }

      const timeKey = normalizeTimeKey(param.time);

      // BAIL EARLY: If timeKey unchanged (within same bar), only update pixel position
      if (timeKey === lastTimeKeyRef.current) {
        globalPerfMetrics.crosshairBailouts++;
        // Still update x/y position but skip heavy work
        setPosition((prev) => ({
          ...prev,
          x: param.point!.x,
          y: param.point!.y,
          visible: true,
        }));
        globalPerfMetrics.lastHandlerMs = performance.now() - startMs;
        return;
      }

      // TimeKey changed: do full update
      lastTimeKeyRef.current = timeKey;

      const hoverStart = performance.now();
      onHoverSnapshotRef.current?.(timeKey ?? null);
      globalPerfMetrics.applyHoverSnapshotCalls++;
      globalPerfMetrics.applyHoverSnapshotMs = performance.now() - hoverStart;

      // Track crosshair position for overlay
      const bar = timeKey != null ? barByTimeRef.current.get(timeKey) : null;
      const price = bar?.close ?? null;

      // Format time using cached formatters (PERF: no toLocaleString per event)
      let timeStr: string | null = null;
      if (typeof param.time === "number") {
        const tf = timeframeRef.current;
        const isDaily = tf === "1d" || tf === "1D" || tf === "1w" || tf === "1W" || tf === "1M";
        timeStr = formatCrosshairTime(param.time, isDaily);
      }

      setPosition({
        x: param.point.x,
        y: param.point.y,
        price,
        time: timeStr,
        visible: true,
      });

      globalPerfMetrics.crosshairFrameCommits++;
      globalPerfMetrics.lastHandlerMs = performance.now() - startMs;
    };

    const handler = (param: MouseEventParams<Time>) => {
      globalPerfMetrics.crosshairRawEvents++;
      pendingParam = param;

      // Schedule RAF if not already scheduled
      if (!rafScheduled) {
        rafScheduled = true;
        rafIdRef.current = requestAnimationFrame(processFrame);
      }
    };

    chart.subscribeCrosshairMove(handler);

    return () => {
      chart.unsubscribeCrosshairMove(handler);
      globalPerfMetrics.activeCrosshairHandlers--;
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [chartReady, chartRef]);

  if (!showCrosshair) {
    return null;
  }

  return (
    <CrosshairOverlay
      position={position}
      theme={theme}
      chartWidth={containerRef.current?.clientWidth ?? 0}
      chartHeight={containerRef.current?.clientHeight ?? 0}
      priceScaleWidth={80}
      timeScaleHeight={30}
    />
  );
});

export default CrosshairOverlayLayer;

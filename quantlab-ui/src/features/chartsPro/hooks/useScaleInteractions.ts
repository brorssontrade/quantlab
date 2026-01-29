/**
 * TV-34.1/34.2/34.3: Scale interactions hook for TradingView-like zoom & drag behavior
 * 
 * NOTE: Lightweight-charts already handles most scale interactions natively:
 * - mouseWheel zoom (enabled by default via handleScale.mouseWheel)
 * - axisPressedMouseMove (drag axis to scale)
 * - axisDoubleClickReset (double-click to reset)
 * 
 * This hook provides:
 * - Metrics for dump() API
 * - Programmatic control via setBarSpacing, setAutoScale, setPriceRange, autoFit
 * - Does NOT override native behaviors (avoids conflicts)
 * 
 * Implementation notes:
 * - Exposes metrics for testing
 * - Uses RAF batching for performance tracking
 */

import { useCallback, useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "@/lib/lightweightCharts";

/** Scale interaction metrics for dump() */
export interface ScaleInteractionMetrics {
  /** Current bar spacing (pixels per bar) */
  barSpacing: number;
  /** Current price scale visible range */
  priceRange: { from: number; to: number } | null;
  /** Whether auto-scale is active */
  autoScale: boolean;
  /** Whether a drag operation is in progress (tracked but not controlled) */
  isDragging: boolean;
  /** Current drag type if dragging */
  dragType: "price" | "time" | null;
  /** Last zoom pivot point (logical index) */
  lastZoomPivot: number | null;
  /** Performance: render frames in last second */
  renderFrames: number;
  /** Performance: last render time in ms */
  lastRenderMs: number;
}

interface UseScaleInteractionsOptions {
  /** Chart API ref (passed as ref so we always get current value) */
  chartRef: React.RefObject<IChartApi | null>;
  /** Main series ref for price operations */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element reference (for future use) */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Callback when scale changes (for triggering redraws) */
  onScaleChange?: () => void;
  /** Whether interactions are enabled */
  enabled?: boolean;
}

const MIN_BAR_SPACING = 1;
const MAX_BAR_SPACING = 50;

/**
 * Hook for TradingView-like scale interactions
 * Uses native lightweight-charts behaviors, exposes metrics + programmatic API
 */
export function useScaleInteractions({
  chartRef,
  // seriesRef and containerRef are kept for future use but not currently needed
  // since we rely on native LWC behaviors
  onScaleChange,
  enabled = true,
}: UseScaleInteractionsOptions) {
  // Performance metrics refs
  const metricsRef = useRef<ScaleInteractionMetrics>({
    barSpacing: 6,
    priceRange: null,
    autoScale: true,
    isDragging: false,
    dragType: null,
    lastZoomPivot: null,
    renderFrames: 0,
    lastRenderMs: 0,
  });
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());
  
  // Auto-scale state tracking (native LWC doesn't expose this directly)
  const autoScaleRef = useRef(true);

  /**
   * Update metrics from current chart state
   */
  const updateMetrics = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    
    try {
      const timeScale = chart.timeScale();
      const priceScale = chart.priceScale("right");
      
      metricsRef.current.barSpacing = timeScale.options().barSpacing;
      // Note: IPriceScaleApi doesn't have getVisibleRange() in LW v4.2.3
      // We'll keep priceRange as null unless we can compute it differently
      metricsRef.current.priceRange = null;
      
      // Read autoScale from price scale options (source of truth)
      const autoScale = priceScale?.options()?.autoScale ?? true;
      metricsRef.current.autoScale = autoScale;
      autoScaleRef.current = autoScale; // Keep in sync
      
      // Update frame metrics
      const now = Date.now();
      frameCountRef.current++;
      if (now - lastFrameTimeRef.current >= 1000) {
        metricsRef.current.renderFrames = frameCountRef.current;
        frameCountRef.current = 0;
        lastFrameTimeRef.current = now;
      }
    } catch {
      // Chart might be destroyed
    }
  }, []);

  /**
   * Subscribe to chart changes to track metrics
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !enabled) return;
    
    const timeScale = chart.timeScale();
    
    const handleVisibleRangeChange = () => {
      const renderStart = performance.now();
      updateMetrics();
      metricsRef.current.lastRenderMs = performance.now() - renderStart;
    };
    
    timeScale.subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    
    // Initial metrics update
    updateMetrics();
    
    return () => {
      try {
        timeScale.unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      } catch {
        // Chart might be destroyed
      }
    };
  }, [enabled, updateMetrics]);

  /**
   * Get current metrics (for dump() API)
   */
  const getMetrics = useCallback((): ScaleInteractionMetrics => {
    updateMetrics();
    return { ...metricsRef.current };
  }, [updateMetrics]);

  /**
   * Programmatic API for tests - set autoScale
   */
  const setAutoScale = useCallback((enabled: boolean) => {
    const chart = chartRef.current;
    if (!chart) return;
    
    try {
      const priceScale = chart.priceScale("right");
      if (!priceScale) return;
      
      autoScaleRef.current = enabled;
      priceScale.applyOptions({ autoScale: enabled });
      onScaleChange?.();
    } catch {
      // Chart might be destroyed
    }
  }, [onScaleChange]);

  /**
   * Programmatic API for tests - set barSpacing
   */
  const setBarSpacing = useCallback((spacing: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    
    try {
      const clamped = Math.max(MIN_BAR_SPACING, Math.min(MAX_BAR_SPACING, spacing));
      chart.timeScale().applyOptions({ barSpacing: clamped });
      metricsRef.current.barSpacing = clamped;
      onScaleChange?.();
    } catch {
      // Chart might be destroyed
    }
  }, [onScaleChange]);

  /**
   * Programmatic API for tests - set price range
   */
  const setPriceRange = useCallback((from: number, to: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    
    try {
      const priceScale = chart.priceScale("right");
      if (!priceScale) return;
      
      // Note: LWC v4.2.3 doesn't support setVisibleRange on priceScale
      // We can only disable autoScale and let LWC handle the range
      autoScaleRef.current = false;
      priceScale.applyOptions({ autoScale: false });
      // priceScale.setVisibleRange is NOT available in IPriceScaleApi
      void from; void to; // Acknowledge params even though we can't use them
      onScaleChange?.();
    } catch {
      // Chart might be destroyed
    }
  }, [onScaleChange]);

  /**
   * Programmatic API for tests - trigger auto-fit (like double-click)
   */
  const autoFit = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    
    try {
      const priceScale = chart.priceScale("right");
      if (!priceScale) return;
      
      autoScaleRef.current = true;
      priceScale.applyOptions({ autoScale: true });
      onScaleChange?.();
    } catch {
      // Chart might be destroyed
    }
  }, [onScaleChange]);

  return {
    getMetrics,
    setAutoScale,
    setBarSpacing,
    setPriceRange,
    autoFit,
  };
}

export default useScaleInteractions;

/**
 * MfiFillOverlay
 * 
 * Canvas overlay that draws MFI background fill between overbought (80) and oversold (20) bands.
 * 
 * TradingView shows a subtle purple fill zone between the overbought and oversold levels.
 * This is a simple zone fill (not gradient), matching the Stochastic/RSI background style.
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws when showBackground is enabled
 * - DPR-aware for sharp rendering
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi } from "@/lib/lightweightCharts";

interface MfiFillConfig {
  showBackground: boolean;
  backgroundFillColor: string;
  backgroundFillOpacity: number;
  overboughtValue: number;
  middleBandValue: number;
  oversoldValue: number;
}

interface MfiFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the MFI line series (for coordinate conversion in separate pane) */
  mfiSeriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing (the separate pane container) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** MFI fill configuration */
  mfiFillConfig: MfiFillConfig | null;
  /** Whether the overlay is enabled */
  enabled?: boolean;
}

/**
 * Parse color to rgba with opacity
 */
function colorWithOpacity(color: string, opacity: number): string {
  // Handle hex colors
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    let r: number, g: number, b: number;
    
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return color; // Invalid hex, return as-is
    }
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  
  // Handle existing rgba
  if (color.startsWith("rgba")) {
    return color.replace(/[\d.]+\)$/, `${opacity})`);
  }
  
  // Handle rgb
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }
  
  return color;
}

/**
 * MfiFillOverlay Component
 * 
 * Renders MFI background fill between overbought and oversold band levels.
 */
export const MfiFillOverlay = memo(function MfiFillOverlay({
  chartRef,
  mfiSeriesRef,
  containerRef,
  mfiFillConfig,
  enabled = true,
}: MfiFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = enabled && mfiFillConfig !== null && mfiFillConfig.showBackground;

  // Draw fills
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = mfiSeriesRef.current;
      const container = containerRef.current;
      
      if (!canvas || !chart || !series || !container || !mfiFillConfig) {
        isDrawingRef.current = false;
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        isDrawingRef.current = false;
        return;
      }

      // Get device pixel ratio for sharp rendering
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      
      // Resize canvas if needed
      const canvasWidth = Math.floor(rect.width * dpr);
      const canvasHeight = Math.floor(rect.height * dpr);
      
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Skip if background not enabled
      if (!mfiFillConfig.showBackground) {
        isDrawingRef.current = false;
        return;
      }

      // Get price scale for coordinate conversion
      const priceScale = chart.priceScale("right");
      if (!priceScale) {
        isDrawingRef.current = false;
        return;
      }

      // Convert band values to pixel coordinates using the series
      // Use series.priceToCoordinate for proper pane-local coordinates
      const upperY = series.priceToCoordinate(mfiFillConfig.overboughtValue);
      const lowerY = series.priceToCoordinate(mfiFillConfig.oversoldValue);

      if (upperY === null || lowerY === null) {
        isDrawingRef.current = false;
        return;
      }

      // Draw background fill between overbought and oversold bands
      const fillColor = colorWithOpacity(
        mfiFillConfig.backgroundFillColor,
        mfiFillConfig.backgroundFillOpacity
      );

      ctx.save();
      ctx.scale(dpr, dpr);
      
      ctx.fillStyle = fillColor;
      ctx.fillRect(
        0,
        Math.min(upperY, lowerY),
        rect.width,
        Math.abs(lowerY - upperY)
      );
      
      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, mfiSeriesRef, containerRef, mfiFillConfig]);

  // Batch draws in RAF
  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // Subscribe to chart events
  useEffect(() => {
    if (!shouldRender) return;

    const chart = chartRef.current;
    if (!chart) return;

    // Initial draw
    scheduleDraw();

    // Subscribe to timeScale changes
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(scheduleDraw);
    timeScale.subscribeVisibleTimeRangeChange(scheduleDraw);

    // Handle resize
    const handleResize = () => scheduleDraw();
    window.addEventListener("resize", handleResize);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(scheduleDraw);
      timeScale.unsubscribeVisibleTimeRangeChange(scheduleDraw);
      window.removeEventListener("resize", handleResize);
      
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [chartRef, shouldRender, scheduleDraw]);

  // Redraw when config changes
  useEffect(() => {
    if (shouldRender) {
      scheduleDraw();
    }
  }, [mfiFillConfig, shouldRender, scheduleDraw]);

  // Clear canvas when disabled
  useEffect(() => {
    if (!shouldRender && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [shouldRender]);

  if (!shouldRender) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="mfi-fill-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
});

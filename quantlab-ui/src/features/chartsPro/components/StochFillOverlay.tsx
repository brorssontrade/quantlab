/**
 * StochFillOverlay
 * 
 * Canvas overlay that draws Stochastic background fill between upper (80) and lower (20) bands.
 * 
 * TradingView shows a subtle blue fill zone between the overbought (80) and oversold (20) levels.
 * This is a simple zone fill (not gradient like RSI), similar to how CCI background fill works.
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws when showBackground is enabled
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi } from "@/lib/lightweightCharts";

interface StochFillConfig {
  showBackground: boolean;
  backgroundFillColor: string;
  backgroundFillOpacity: number;
  upperBandValue: number;
  middleBandValue: number;
  lowerBandValue: number;
}

interface StochFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the Stochastic K line series (for coordinate conversion in separate pane) */
  stochSeriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing (the separate pane container) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Stochastic fill configuration */
  stochFillConfig: StochFillConfig | null;
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
 * StochFillOverlay Component
 * 
 * Renders Stochastic background fill between upper and lower band levels.
 */
export const StochFillOverlay = memo(function StochFillOverlay({
  chartRef,
  stochSeriesRef,
  containerRef,
  stochFillConfig,
  enabled = true,
}: StochFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = enabled && stochFillConfig !== null && stochFillConfig.showBackground;

  // Draw fills
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = stochSeriesRef.current;
      const container = containerRef.current;
      
      if (!canvas || !chart || !series || !container || !stochFillConfig) {
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
      if (!stochFillConfig.showBackground) {
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
      const upperY = series.priceToCoordinate(stochFillConfig.upperBandValue);
      const lowerY = series.priceToCoordinate(stochFillConfig.lowerBandValue);

      if (upperY === null || lowerY === null) {
        isDrawingRef.current = false;
        return;
      }

      // Draw background fill between upper and lower bands
      const fillColor = colorWithOpacity(
        stochFillConfig.backgroundFillColor,
        stochFillConfig.backgroundFillOpacity
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
  }, [chartRef, stochSeriesRef, containerRef, stochFillConfig]);

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
  }, [stochFillConfig, shouldRender, scheduleDraw]);

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
      data-testid="stoch-fill-overlay"
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

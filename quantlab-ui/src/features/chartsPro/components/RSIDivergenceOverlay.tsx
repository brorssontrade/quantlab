/**
 * RSIDivergenceOverlay
 * 
 * Canvas overlay for RSI Divergence Indicator in separate pane.
 * 
 * TradingView-parity features:
 * - Background fill between oversold (30) and overbought (70) - light blue
 * - Dotted level lines at 70/50/30 - grey
 * - Divergence lines connecting RSI pivots - green/red
 * - "Bull" / "Bear" labels at divergence signal points
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Uses indicator pane's priceScale for y-coordinate conversion
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi } from "@/lib/lightweightCharts";
import type { RSIDivergenceSignal } from "../indicators/compute";

// Props interface
interface RSIDivergenceData {
  /** Raw RSI data for bar time lookup */
  rsiData: Array<{ time: number; value: number }>;
  /** Divergence signals */
  signals: RSIDivergenceSignal[];
  /** Level values */
  upperLevel: number;
  middleLevel: number;
  lowerLevel: number;
  /** Show toggles */
  showBackground: boolean;
  showLevels: boolean;
  showBullish: boolean;
  showBearish: boolean;
  showHiddenBullish: boolean;
  showHiddenBearish: boolean;
  showBullLabel: boolean;
  showBearLabel: boolean;
  /** Colors */
  bullColor: string;
  bearColor: string;
  backgroundFillColor: string;
  levelColor: string;
}

interface RSIDivergenceOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the RSI line series (for y-coordinate conversion) */
  rsiSeriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** RSI Divergence configuration data */
  rsiDivData: RSIDivergenceData;
}

// Style constants
const LABEL_FONT = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
const LABEL_PADDING_H = 4;
const LABEL_PADDING_V = 2;
const LABEL_RADIUS = 3;
const LABEL_OFFSET_Y = 8;
const LINE_WIDTH = 1;
const DASH_PATTERN = [4, 4];

/**
 * RSIDivergenceOverlay Component
 * 
 * Renders RSI Divergence visual elements:
 * - Background band between OB/OS levels
 * - Level lines (dotted)
 * - Divergence lines
 * - Bull/Bear labels
 */
export const RSIDivergenceOverlay = memo(function RSIDivergenceOverlay({
  chartRef,
  rsiSeriesRef,
  containerRef,
  rsiDivData,
}: RSIDivergenceOverlayProps) {
  // Destructure rsiDivData
  const {
    rsiData,
    signals,
    upperLevel,
    middleLevel,
    lowerLevel,
    showBackground,
    showLevels,
    showBullish,
    showBearish,
    showHiddenBullish,
    showHiddenBearish,
    showBullLabel,
    showBearLabel,
    bullColor,
    bearColor,
    backgroundFillColor,
    levelColor,
  } = rsiDivData;
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // Draw all
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = rsiSeriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container) {
        const ctx = canvas?.getContext("2d");
        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // High-DPI support
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const cssWidth = rect.width;
      const cssHeight = rect.height;
      const pixelWidth = Math.floor(cssWidth * dpr);
      const pixelHeight = Math.floor(cssHeight * dpr);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Clear canvas
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const timeScale = chart.timeScale();
      
      // Get coordinate bounds
      const yUpper = series.priceToCoordinate(upperLevel);
      const yMiddle = series.priceToCoordinate(middleLevel);
      const yLower = series.priceToCoordinate(lowerLevel);
      
      // === Draw background fill between OS and OB ===
      if (showBackground && yUpper !== null && yLower !== null) {
        ctx.fillStyle = backgroundFillColor;
        const fillTop = Math.min(yUpper, yLower);
        const fillHeight = Math.abs(yLower - yUpper);
        ctx.fillRect(0, fillTop, cssWidth, fillHeight);
      }
      
      // === Draw level lines (dotted) ===
      if (showLevels) {
        ctx.strokeStyle = levelColor;
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_PATTERN);
        
        // Upper level (70)
        if (yUpper !== null) {
          ctx.beginPath();
          ctx.moveTo(0, yUpper);
          ctx.lineTo(cssWidth, yUpper);
          ctx.stroke();
        }
        
        // Middle level (50)
        if (yMiddle !== null) {
          ctx.beginPath();
          ctx.moveTo(0, yMiddle);
          ctx.lineTo(cssWidth, yMiddle);
          ctx.stroke();
        }
        
        // Lower level (30)
        if (yLower !== null) {
          ctx.beginPath();
          ctx.moveTo(0, yLower);
          ctx.lineTo(cssWidth, yLower);
          ctx.stroke();
        }
        
        ctx.setLineDash([]); // Reset to solid
      }
      
      // === Draw divergence lines and labels ===
      ctx.lineWidth = LINE_WIDTH;
      ctx.setLineDash([]);
      
      for (const signal of signals) {
        // Filter by type
        const isBull = signal.type === "bullish";
        const isBear = signal.type === "bearish";
        const isHiddenBull = signal.type === "hiddenBullish";
        const isHiddenBear = signal.type === "hiddenBearish";
        
        if (isBull && !showBullish) continue;
        if (isBear && !showBearish) continue;
        if (isHiddenBull && !showHiddenBullish) continue;
        if (isHiddenBear && !showHiddenBearish) continue;
        
        const color = (isBull || isHiddenBull) ? bullColor : bearColor;
        
        // Get coordinates for divergence line (on RSI, not price)
        const x1 = timeScale.timeToCoordinate(signal.priorPivotTime as any);
        const y1 = series.priceToCoordinate(signal.priorPivotRsi);
        const x2 = timeScale.timeToCoordinate(signal.pivotTime as any);
        const y2 = series.priceToCoordinate(signal.pivotRsi);
        
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
        
        // Draw divergence line
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // Draw label at the end point (current pivot)
        const shouldShowLabel = (isBull && showBullLabel) || 
                                (isBear && showBearLabel) ||
                                (isHiddenBull && showBullLabel) ||
                                (isHiddenBear && showBearLabel);
        
        if (shouldShowLabel) {
          let labelText: string;
          if (isBull) labelText = "Bull";
          else if (isBear) labelText = "Bear";
          else if (isHiddenBull) labelText = "H Bull";
          else labelText = "H Bear";
          
          drawLabel(ctx, labelText, x2, y2, color);
        }
      }
    } finally {
      isDrawingRef.current = false;
    }
  }, [
    chartRef, rsiSeriesRef, containerRef, rsiData, signals,
    upperLevel, middleLevel, lowerLevel,
    showBackground, showLevels, showBullish, showBearish,
    showHiddenBullish, showHiddenBearish, showBullLabel, showBearLabel,
    bullColor, bearColor, backgroundFillColor, levelColor
  ]);

  // Schedule draw
  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // Setup subscriptions
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const timeScale = chart.timeScale();
    
    const unsubVisible = timeScale.subscribeVisibleLogicalRangeChange(scheduleDraw);
    const unsubTimeScale = timeScale.subscribeSizeChange(scheduleDraw);

    // Initial draw
    scheduleDraw();

    return () => {
      unsubVisible();
      unsubTimeScale();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [chartRef, scheduleDraw]);

  // Redraw on data change
  useEffect(() => {
    scheduleDraw();
  }, [signals, rsiData, showBackground, showLevels, scheduleDraw]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="rsidivergence-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 5, // Below indicator lines but above grid
      }}
    />
  );
});

/**
 * Draw a rounded label with background
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bgColor: string
) {
  ctx.font = LABEL_FONT;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = 10; // Font size approximation
  
  const boxWidth = textWidth + LABEL_PADDING_H * 2;
  const boxHeight = textHeight + LABEL_PADDING_V * 2;
  const boxX = x - boxWidth / 2;
  const boxY = y - LABEL_OFFSET_Y - boxHeight;
  
  // Draw rounded rectangle background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, LABEL_RADIUS);
  ctx.fill();
  
  // Draw text
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, boxY + boxHeight / 2);
}

export default RSIDivergenceOverlay;

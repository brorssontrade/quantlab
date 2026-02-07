/**
 * VolumeProfileOverlay
 * 
 * Canvas overlay that renders Volume Profile histogram:
 * 1. Horizontal histogram bars at each price level
 * 2. POC (Point of Control) line
 * 3. VAH (Value Area High) and VAL (Value Area Low) lines
 * 4. Value Area shading between VAH and VAL
 * 
 * Why canvas overlay:
 * - LWC doesn't support horizontal histograms
 * - Need to draw across price levels, not time
 * - TradingView-style rendering with up/down volume split
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Supports multiple profiles (for SVP/PVP)
 * 
 * Safety:
 * - Guards against NaN/Infinity coordinates
 * - Never fills solid background (canvas always transparent)
 * - Wraps draw in try-catch to prevent crashes
 */

import { useEffect, useRef, useCallback, memo, Component, type ReactNode } from "react";
import type { IChartApi, ISeriesApi } from "@/lib/lightweightCharts";
import type { VolumeProfile } from "../indicators/volumeProfileEngine";

// ============================================================================
// Error Boundary for VP Overlay
// ============================================================================

interface VPErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class VPErrorBoundary extends Component<{ children: ReactNode }, VPErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): VPErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[VolumeProfileOverlay] Error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Render nothing - don't crash the whole chart
      console.warn("[VolumeProfileOverlay] Rendering fallback due to error:", this.state.error?.message);
      return null;
    }
    return this.props.children;
  }
}

// ============================================================================
// Coordinate validation helper
// ============================================================================

function isValidCoord(val: number | null | undefined): val is number {
  return val !== null && val !== undefined && Number.isFinite(val);
}

// ============================================================================
// Types
// ============================================================================

export interface VPStyleConfig {
  // Histogram colors
  upColor: string;
  downColor: string;
  // POC/VA lines
  pocColor: string;
  vahColor: string;
  valColor: string;
  pocWidth: number;
  vaWidth: number;
  // Value Area shading
  showValueArea: boolean;
  valueAreaColor: string;
  valueAreaOpacity: number;
  // Histogram style
  widthPercent: number;     // Width as % of chart area (default 70%)
  placement: "Left" | "Right";
  showHistogram: boolean;
  volumeMode: "Up/Down" | "Total" | "Delta";
  // Line visibility
  showPOC: boolean;
  showVALines: boolean;
  extendPOC: boolean;
  extendVA: boolean;
}

export interface VPProfileData {
  profile: VolumeProfile;
  // Time range for this profile (for SVP/PVP multiple profiles)
  startTime?: number;
  endTime?: number;
}

interface VolumeProfileOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the price series (for coordinate conversion) */
  priceSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Array of profiles to render (single for VRVP, multiple for SVP/PVP) */
  profiles: VPProfileData[];
  /** Style configuration */
  style: VPStyleConfig;
  /** Whether the overlay is enabled */
  enabled?: boolean;
}

// ============================================================================
// Color Helpers
// ============================================================================

function parseColor(color: string): { r: number; g: number; b: number } {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  return { r: 128, g: 128, b: 128 }; // fallback gray
}

function colorWithOpacity(color: string, opacity: number): string {
  const { r, g, b } = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ============================================================================
// TV-Style Default Colors
// ============================================================================

export const VP_DEFAULT_STYLE: VPStyleConfig = {
  upColor: "#26A69A",       // TV teal/green
  downColor: "#EF5350",     // TV red
  pocColor: "#FFEB3B",      // TV yellow
  vahColor: "#2962FF",      // TV blue
  valColor: "#2962FF",      // TV blue
  pocWidth: 2,
  vaWidth: 1,
  showValueArea: true,
  valueAreaColor: "#2962FF",
  valueAreaOpacity: 0.1,
  widthPercent: 70,
  placement: "Left",
  showHistogram: true,
  volumeMode: "Up/Down",
  showPOC: true,
  showVALines: true,
  extendPOC: false,
  extendVA: false,
};

// ============================================================================
// Component
// ============================================================================

export const VolumeProfileOverlay = memo(function VolumeProfileOverlay({
  chartRef,
  priceSeriesRef,
  containerRef,
  profiles,
  style,
  enabled = true,
}: VolumeProfileOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Draw Function
  // ─────────────────────────────────────────────────────────────────────────
  
  const draw = useCallback(() => {
    const chart = chartRef.current;
    const series = priceSeriesRef.current;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    
    if (!chart || !series || !container || !canvas || !enabled) {
      return;
    }
    
    if (profiles.length === 0) {
      // Clear canvas if no profiles
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Wrap entire draw in try-catch to prevent crashes
    try {
      // Get container size
      const rect = container.getBoundingClientRect();
      
      // Guard: invalid container size
      if (!isValidCoord(rect.width) || !isValidCoord(rect.height) || rect.width <= 0 || rect.height <= 0) {
        return;
      }
      
      const dpr = window.devicePixelRatio || 1;
      
      // Resize canvas if needed
      const targetWidth = Math.floor(rect.width * dpr);
      const targetHeight = Math.floor(rect.height * dpr);
      
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
        ctx.scale(dpr, dpr);
      }
      
      // Clear canvas (always transparent, never fill with solid color)
      ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Get the price scale for coordinate conversion
    const priceScale = chart.priceScale("right");
    const timeScale = chart.timeScale();
    
    // Draw each profile
    for (const profileData of profiles) {
      const { profile, startTime, endTime } = profileData;
      
      if (profile.bins.length === 0) continue;
      
      // Calculate histogram area
      let histoLeft: number;
      let histoWidth: number;
      
      if (startTime !== undefined && endTime !== undefined) {
        // For SVP/PVP: histogram within period's time range
        const leftCoord = timeScale.timeToCoordinate(startTime as any);
        const rightCoord = timeScale.timeToCoordinate(endTime as any);
        
        // Allow partial visibility: skip only if BOTH coordinates are invalid
        // (one invalid coord means period is partially visible)
        if (!isValidCoord(leftCoord) && !isValidCoord(rightCoord)) continue;
        
        // Use fallback for partially visible periods
        const effectiveLeft = isValidCoord(leftCoord) ? leftCoord : 0;
        const effectiveRight = isValidCoord(rightCoord) ? rightCoord : rect.width;
        
        const periodWidth = effectiveRight - effectiveLeft;
        
        // Guard: skip if period is too narrow after adjustment
        if (!isValidCoord(periodWidth) || periodWidth < 1) continue;
        
        histoWidth = periodWidth * (style.widthPercent / 100);
        histoLeft = style.placement === "Left" ? effectiveLeft : effectiveRight - histoWidth;
      } else {
        // For VRVP: histogram across visible area
        const chartWidth = rect.width;
        histoWidth = chartWidth * (style.widthPercent / 100);
        histoLeft = style.placement === "Left" ? 0 : chartWidth - histoWidth;
      }
      
      // Guard: skip invalid histogram dimensions
      if (!isValidCoord(histoLeft) || !isValidCoord(histoWidth) || histoWidth < 1) continue;
      
      // Find max volume for scaling
      let maxVol = 0;
      for (const bin of profile.bins) {
        maxVol = Math.max(maxVol, bin.totalVolume);
      }
      
      if (maxVol === 0) continue;
      
      // Draw Value Area shading first (behind histogram)
      if (style.showValueArea && profile.valIndex >= 0 && profile.vahIndex >= 0) {
        const valY = series.priceToCoordinate(profile.valPrice);
        const vahY = series.priceToCoordinate(profile.vahPrice);
        
        if (isValidCoord(valY) && isValidCoord(vahY)) {
          ctx.fillStyle = colorWithOpacity(style.valueAreaColor, style.valueAreaOpacity);
          
          // Value area spans full chart width
          const vaTop = Math.min(valY, vahY);
          const vaHeight = Math.abs(vahY - valY);
          
          if (isValidCoord(vaTop) && isValidCoord(vaHeight) && vaHeight > 0) {
            ctx.fillRect(0, vaTop, rect.width, vaHeight);
          }
        }
      }
      
      // Draw histogram bars
      if (style.showHistogram) {
        for (let i = 0; i < profile.bins.length; i++) {
          const bin = profile.bins[i];
          
          // Get Y coordinates for bin edges
          const topY = series.priceToCoordinate(bin.priceEnd);
          const bottomY = series.priceToCoordinate(bin.priceStart);
          
          // Guard: skip if coordinates are invalid or NaN
          if (!isValidCoord(topY) || !isValidCoord(bottomY)) continue;
          
          const binHeight = Math.abs(bottomY - topY);
          const binTop = Math.min(topY, bottomY);
          
          // Guard: skip degenerate bins
          if (!isValidCoord(binHeight) || !isValidCoord(binTop) || binHeight < 0.5) continue;
          
          // Calculate bar width based on volume
          const volRatio = bin.totalVolume / maxVol;
          const barFullWidth = histoWidth * volRatio;
          
          // Guard: skip zero-width bars
          if (!isValidCoord(barFullWidth) || barFullWidth < 0.5) continue;
          
          if (style.volumeMode === "Up/Down") {
            // Split bar into up/down portions
            const upRatio = bin.totalVolume > 0 ? bin.upVolume / bin.totalVolume : 0.5;
            const upWidth = barFullWidth * upRatio;
            const downWidth = barFullWidth * (1 - upRatio);
            
            if (style.placement === "Left") {
              // Draw from left: up portion first, then down
              if (upWidth > 0) {
                ctx.fillStyle = style.upColor;
                ctx.fillRect(histoLeft, binTop, upWidth, binHeight);
              }
              if (downWidth > 0) {
                ctx.fillStyle = style.downColor;
                ctx.fillRect(histoLeft + upWidth, binTop, downWidth, binHeight);
              }
            } else {
              // Draw from right: down portion first (from right edge), then up
              if (downWidth > 0) {
                ctx.fillStyle = style.downColor;
                ctx.fillRect(histoLeft + histoWidth - downWidth, binTop, downWidth, binHeight);
              }
              if (upWidth > 0) {
                ctx.fillStyle = style.upColor;
                ctx.fillRect(histoLeft + histoWidth - barFullWidth, binTop, upWidth, binHeight);
              }
            }
          } else if (style.volumeMode === "Delta") {
            // Single color based on delta
            const deltaColor = bin.deltaVolume >= 0 ? style.upColor : style.downColor;
            ctx.fillStyle = deltaColor;
            
            if (style.placement === "Left") {
              ctx.fillRect(histoLeft, binTop, barFullWidth, binHeight);
            } else {
              ctx.fillRect(histoLeft + histoWidth - barFullWidth, binTop, barFullWidth, binHeight);
            }
          } else {
            // Total - use up color as base
            ctx.fillStyle = style.upColor;
            
            if (style.placement === "Left") {
              ctx.fillRect(histoLeft, binTop, barFullWidth, binHeight);
            } else {
              ctx.fillRect(histoLeft + histoWidth - barFullWidth, binTop, barFullWidth, binHeight);
            }
          }
        }
      }
      
      // Draw POC line
      if (style.showPOC) {
        const pocY = series.priceToCoordinate(profile.pocPrice);
        if (pocY !== null) {
          ctx.strokeStyle = style.pocColor;
          ctx.lineWidth = style.pocWidth;
          ctx.setLineDash([]);
          ctx.beginPath();
          
          if (style.extendPOC) {
            ctx.moveTo(0, pocY);
            ctx.lineTo(rect.width, pocY);
          } else {
            ctx.moveTo(histoLeft, pocY);
            ctx.lineTo(histoLeft + histoWidth, pocY);
          }
          ctx.stroke();
        }
      }
      
      // Draw VA lines
      if (style.showVALines) {
        ctx.strokeStyle = style.vahColor;
        ctx.lineWidth = style.vaWidth;
        ctx.setLineDash([4, 4]); // Dashed for VA lines
        
        const vahY = series.priceToCoordinate(profile.vahPrice);
        if (vahY !== null) {
          ctx.beginPath();
          if (style.extendVA) {
            ctx.moveTo(0, vahY);
            ctx.lineTo(rect.width, vahY);
          } else {
            ctx.moveTo(histoLeft, vahY);
            ctx.lineTo(histoLeft + histoWidth, vahY);
          }
          ctx.stroke();
        }
        
        ctx.strokeStyle = style.valColor;
        const valY = series.priceToCoordinate(profile.valPrice);
        if (valY !== null) {
          ctx.beginPath();
          if (style.extendVA) {
            ctx.moveTo(0, valY);
            ctx.lineTo(rect.width, valY);
          } else {
            ctx.moveTo(histoLeft, valY);
            ctx.lineTo(histoLeft + histoWidth, valY);
          }
          ctx.stroke();
        }
        
        ctx.setLineDash([]); // Reset
      }
    }
    } catch (err) {
      // Catch any draw errors to prevent crash - just log and clear
      console.error("[VolumeProfileOverlay] Draw error:", err);
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch { /* ignore cleanup errors */ }
    }
  }, [chartRef, priceSeriesRef, containerRef, profiles, style, enabled]);

  // ─────────────────────────────────────────────────────────────────────────
  // Schedule Draw (batched in RAF)
  // ─────────────────────────────────────────────────────────────────────────
  
  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      draw();
      rafRef.current = null;
    });
  }, [draw]);

  // ─────────────────────────────────────────────────────────────────────────
  // Create Canvas & Subscribe to Changes
  // ─────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    
    if (!container || !chart) return;
    
    // Create canvas if not exists
    if (!canvasRef.current) {
      const canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "10"; // Above chart, below crosshair
      canvas.style.background = "transparent"; // CRITICAL: Ensure transparent
      canvas.style.backgroundColor = "transparent";
      container.appendChild(canvas);
      canvasRef.current = canvas;
    }
    
    // Subscribe to timeScale changes
    const timeScale = chart.timeScale();
    const handleVisibleRangeChange = () => scheduleDraw();
    const handleLogicalRangeChange = () => scheduleDraw();
    
    timeScale.subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    timeScale.subscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
    
    // Subscribe to crosshair move for price scale updates (handles vertical zoom)
    const handleCrosshairMove = () => scheduleDraw();
    chart.subscribeCrosshairMove(handleCrosshairMove);
    
    // Initial draw
    scheduleDraw();
    
    // Cleanup
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
      timeScale.unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      
      if (canvasRef.current && container.contains(canvasRef.current)) {
        container.removeChild(canvasRef.current);
        canvasRef.current = null;
      }
    };
  }, [containerRef, chartRef, scheduleDraw]);

  // Redraw when profiles or style changes
  useEffect(() => {
    scheduleDraw();
  }, [profiles, style, scheduleDraw]);

  // Redraw on window resize
  useEffect(() => {
    const handleResize = () => scheduleDraw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scheduleDraw]);

  // This component doesn't render any DOM directly
  return null;
});

// Export error boundary for use in ChartViewport
export { VPErrorBoundary };

export default VolumeProfileOverlay;

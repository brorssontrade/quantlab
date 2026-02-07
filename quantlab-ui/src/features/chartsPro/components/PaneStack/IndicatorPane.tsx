/**
 * IndicatorPane - A single indicator pane with its own chart instance
 * 
 * Features:
 * - Own IChartApi instance with indicator series
 * - Synced timeScale with price pane
 * - Legend with actions (visibility, settings, remove)
 * - TV-style theming
 * - Crosshair value sync for hover display
 * - Zero line support (MACD)
 * - RSI fill overlay (background + overbought/oversold fills)
 * - CCI fill overlay (background fill between +100/-100)
 * - Williams %R fill overlay (RSI-style fills)
 * - Stochastic RSI fill overlay (background fill between 80/20)
 */

import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { createChart, type IChartApi, type ISeriesApi, type LineWidth, ColorType, LineStyle, type IPriceLine } from "@/lib/lightweightCharts";
import type { IndicatorInstance } from "../../types";
import type { IndicatorWorkerResponse, IndicatorLineResult } from "../../indicators/registryV2";
import type { ChartsTheme } from "../../theme";
import { indicatorDisplayName, indicatorParamsSummary } from "../../types";
import { getIndicatorManifest } from "../../indicators/indicatorManifest";
import { getSyncController } from "./SyncController";
import { Eye, EyeOff, Settings, Trash2 } from "lucide-react";
import { RsiFillOverlay } from "../RsiFillOverlay";
import { CciFillOverlay } from "../CciFillOverlay";
import { WillrFillOverlay } from "../WillrFillOverlay";
import { StochRsiFillOverlay } from "../StochRsiFillOverlay";
import { StochFillOverlay } from "../StochFillOverlay";
import { MfiFillOverlay } from "../MfiFillOverlay";
import { UlcerFillOverlay } from "../UlcerFillOverlay";
import { AroonOscFillOverlay } from "../AroonOscFillOverlay";
import { RSIDivergenceOverlay } from "../RSIDivergenceOverlay";

// ============================================================================
// Types
// ============================================================================

interface IndicatorPaneProps {
  /** Unique pane ID */
  paneId: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Chart theme */
  theme: ChartsTheme;
  /** Indicators to render in this pane */
  indicators: IndicatorInstance[];
  /** Computed indicator results */
  indicatorResults: Record<string, IndicatorWorkerResponse>;
  /** Whether to show the time axis (only bottom pane) */
  showTimeAxis: boolean;
  /** Callback to update an indicator */
  onUpdateIndicator?: (id: string, patch: Partial<IndicatorInstance>) => void;
  /** Callback to remove an indicator */
  onRemoveIndicator?: (id: string) => void;
  /** Callback to open indicator settings */
  onOpenSettings?: (id: string) => void;
}

/** Crosshair value state for legend display */
interface CrosshairValues {
  [indicatorId: string]: {
    [lineId: string]: { value: number; color: string } | null;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function formatValue(value: number | null | undefined): string {
  if (value == null) return "–";
  if (Math.abs(value) >= 10000) return value.toFixed(0);
  if (Math.abs(value) >= 1000) return value.toFixed(1);
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

/**
 * Format value using compact notation (K/M/B/T) for volume-style indicators
 * Matches TradingView's volume formatting
 */
function formatCompactValue(value: number | null | undefined): string {
  if (value == null) return "–";
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  
  if (absValue >= 1e12) {
    return sign + (absValue / 1e12).toFixed(2) + "T";
  } else if (absValue >= 1e9) {
    return sign + (absValue / 1e9).toFixed(2) + "B";
  } else if (absValue >= 1e6) {
    return sign + (absValue / 1e6).toFixed(2) + "M";
  } else if (absValue >= 1e3) {
    return sign + (absValue / 1e3).toFixed(2) + "K";
  } else {
    return value.toFixed(2);
  }
}

// ============================================================================
// Legend Item
// ============================================================================

interface LegendItemProps {
  indicator: IndicatorInstance;
  result?: IndicatorWorkerResponse;
  /** Crosshair values for this indicator (keyed by line id) */
  crosshairValues?: Record<string, { value: number; color: string } | null>;
  onToggleHidden?: () => void;
  onOpenSettings?: () => void;
  onRemove?: () => void;
}

function LegendItem({ indicator, result, crosshairValues, onToggleHidden, onOpenSettings, onRemove }: LegendItemProps) {
  const manifest = getIndicatorManifest(indicator.kind);
  // Filter out level lines (decorative lines like 90/0/-90 in Aroon Osc)
  const lines = (result?.lines ?? []).filter((line) => !(line as any).isLevelLine);
  const isHidden = indicator.hidden;

  // Theme-adaptive colors using CSS variables with graceful fallbacks
  // In light mode: darker text on light background
  // In dark mode: lighter text on dark background
  return (
    <div
      className="group/legend flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 transition-colors"
      style={{ 
        opacity: isHidden ? 0.5 : 1,
        // Theme-adaptive hover background
        backgroundColor: "transparent",
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--chart-legend-hover, hsl(var(--muted) / 0.5))"}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
      data-testid={`indicator-pane-legend-${indicator.id}`}
    >
      {/* Color dot */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: indicator.color }}
      />
      
      {/* Name - uses theme-adaptive text color */}
      <span 
        className="font-medium" 
        style={{ color: "var(--chart-text, hsl(var(--foreground)))" }}
      >
        {manifest?.shortName ?? indicatorDisplayName(indicator.kind)}
      </span>
      
      {/* Params - muted text color */}
      <span 
        className="text-[10px]" 
        style={{ color: "var(--chart-text-muted, hsl(var(--muted-foreground)))" }}
      >
        {indicatorParamsSummary(indicator)}
      </span>
      
      {/* Live values - show crosshair values if available, else last values */}
      {lines.length > 0 && (
        <span className="flex items-center gap-1 ml-1">
          {lines.slice(0, 3).map((line) => {
            // Prefer crosshair value at cursor position, else use last point
            const crossVal = crosshairValues?.[line.id];
            const lastPoint = line.values[line.values.length - 1];
            const displayValue = crossVal?.value ?? lastPoint?.value;
            const displayColor = crossVal?.color ?? line.color;
            
            // Use compact formatting for volume-style indicators (OBV)
            const useCompact = (result as any)?._compactFormatter === true;
            const formattedValue = useCompact 
              ? formatCompactValue(displayValue) 
              : formatValue(displayValue);
            
            return (
              <span
                key={line.id}
                className="font-mono text-[10px]"
                style={{ color: displayColor }}
              >
                {formattedValue}
              </span>
            );
          })}
        </span>
      )}
      
      {/* Actions - visible on hover, theme-adaptive */}
      <span className="flex items-center ml-auto opacity-0 group-hover/legend:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onToggleHidden}
          title={isHidden ? "Show" : "Hide"}
          className="p-0.5 rounded hover:bg-[hsl(var(--muted))]"
        >
          {isHidden ? (
            <EyeOff className="w-3.5 h-3.5" style={{ color: "var(--chart-text-muted, hsl(var(--muted-foreground)))" }} />
          ) : (
            <Eye className="w-3.5 h-3.5" style={{ color: "var(--chart-text-muted, hsl(var(--muted-foreground)))" }} />
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="p-0.5 rounded hover:bg-[hsl(var(--muted))]"
        >
          <Settings className="w-3.5 h-3.5" style={{ color: "var(--chart-text-muted, hsl(var(--muted-foreground)))" }} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          className="p-0.5 rounded hover:bg-red-500/20"
        >
          <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--chart-text-muted, hsl(var(--muted-foreground)))" }} />
        </button>
      </span>
    </div>
  );
}

// ============================================================================
// IndicatorPane Component
// ============================================================================

export function IndicatorPane({
  paneId,
  width,
  height,
  theme,
  indicators,
  indicatorResults,
  showTimeAxis,
  onUpdateIndicator,
  onRemoveIndicator,
  onOpenSettings,
}: IndicatorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<string, ISeriesApi<"Line"> | ISeriesApi<"Histogram">>>(new Map());
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const cvdCandleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const zeroLineRef = useRef<IPriceLine | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiDivSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cciSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const willrSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochrsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const mfiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ulcerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const aroonOscSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const syncController = getSyncController();
  
  // Crosshair values state for legend display
  const [crosshairValues, setCrosshairValues] = useState<CrosshairValues>({});
  
  // Extract RSI fill config from indicator results
  const rsiFillConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "rsi" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._rsiFill) {
          return result._rsiFill as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);
  
  // Extract CCI fill config from indicator results
  const cciFillConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "cci" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._cciFill) {
          return result._cciFill as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);
  
  // Extract Williams %R fill config from indicator results
  const willrFillConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "willr" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._willrFill) {
          return result._willrFill as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);
  
  // Extract Stochastic RSI fill config from indicator results
  const stochrsiFillConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "stochrsi" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._stochrsiFill) {
          return result._stochrsiFill as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);
  
  // Extract Stochastic fill config from indicator results
  const stochFillConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "stoch" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._stochFill) {
          return result._stochFill as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);

  // Extract MFI fill config from indicator results
  const mfiFillConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "mfi" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._mfiFill) {
          return result._mfiFill as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);

  // Extract Ulcer Index fill config from indicator results
  const ulcerFillConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "ulcer" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._ulcerFill) {
          return result._ulcerFill as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);

  // Extract Aroon Oscillator fill config from indicator results
  const aroonOscFillConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "aroonosc" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._aroonOscFill) {
          return result._aroonOscFill as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);

  // Extract RSI Divergence data for overlay (divergence lines, labels, background, levels)
  const rsiDivData = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "rsiDivergence" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._rsiDivData) {
          return result._rsiDivData as any;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);

  // Extract Volume Delta candle config from indicator results
  const volumeDeltaConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "volumeDelta" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._volumeDeltaCandles) {
          return result._volumeDeltaCandles;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);

  // Extract CVD (Cumulative Volume Delta) candle config from indicator results
  const cvdConfig = useMemo(() => {
    for (const indicator of indicators) {
      if (indicator.kind === "cvd" && !indicator.hidden) {
        const result = indicatorResults[indicator.id];
        if (result?._cvdCandles) {
          return result._cvdCandles;
        }
      }
    }
    return null;
  }, [indicators, indicatorResults]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: theme.canvas.background },
        textColor: theme.text.axis,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: theme.canvas.grid, visible: true },
        horzLines: { color: theme.canvas.grid, visible: true },
      },
      rightPriceScale: {
        borderColor: theme.canvas.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true,
      },
      timeScale: {
        borderColor: theme.canvas.border,
        visible: showTimeAxis,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0, // Normal
        vertLine: {
          color: theme.crosshairTokens.line,
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: theme.crosshairTokens.labelBackground,
        },
        horzLine: {
          color: theme.crosshairTokens.line,
          width: 1,
          style: 2,
          labelBackgroundColor: theme.crosshairTokens.labelBackground,
        },
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;
    
    // Register with sync controller
    syncController.registerPane(paneId, chart);

    return () => {
      // Cleanup
      syncController.unregisterPane(paneId);
      seriesMapRef.current.forEach((series) => {
        try {
          chart.removeSeries(series);
        } catch { /* ignore */ }
      });
      seriesMapRef.current.clear();
      // Cleanup candlestick series
      if (candleSeriesRef.current) {
        try {
          chart.removeSeries(candleSeriesRef.current);
        } catch { /* ignore */ }
        candleSeriesRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
    };
  }, [paneId, syncController]); // Only run on mount/unmount

  // Update chart size
  useEffect(() => {
    if (chartRef.current && width > 0 && height > 0) {
      chartRef.current.resize(width, height);
    }
  }, [width, height]);

  // Update theme
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: theme.canvas.background },
        textColor: theme.text.axis,
      },
      grid: {
        vertLines: { color: theme.canvas.grid },
        horzLines: { color: theme.canvas.grid },
      },
      rightPriceScale: {
        borderColor: theme.canvas.border,
      },
      timeScale: {
        borderColor: theme.canvas.border,
      },
      crosshair: {
        vertLine: {
          color: theme.crosshairTokens.line,
          labelBackgroundColor: theme.crosshairTokens.labelBackground,
        },
        horzLine: {
          color: theme.crosshairTokens.line,
          labelBackgroundColor: theme.crosshairTokens.labelBackground,
        },
      },
    });
  }, [theme]);

  // Update time axis visibility
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({ visible: showTimeAxis });
  }, [showTimeAxis]);

  // Render indicator series
  // Style changes (color, lineWidth, visibility) use applyOptions() - NO recompute
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const activeKeys = new Set<string>();

    indicators.forEach((indicator) => {
      if (indicator.hidden) return;
      
      const result = indicatorResults[indicator.id];
      if (!result?.lines) return;

      result.lines.forEach((line) => {
        const key = `${indicator.id}:${line.id}`;
        activeKeys.add(key);
        
        // Get style from styleByLineId if available, otherwise use computed defaults
        // No hardcoded fallback - color should always come from manifest or instance
        const styleOverride = indicator.styleByLineId?.[line.id];
        const effectiveColor = styleOverride?.color ?? line.color ?? indicator.color;
        const effectiveLineWidth = styleOverride?.lineWidth ?? line.lineWidth ?? 2;
        
        // AroonOsc oscillator line is drawn by canvas overlay - hide LWC series
        // (we still need the series for coordinate conversion + price scale label)
        const isAroonOscLine = indicator.kind === "aroonosc" && line.id === "oscillator";
        const isVisible = isAroonOscLine ? false : (styleOverride?.visible ?? true);
        
        // Map lineStyle string to LWC LineStyle enum
        // Also support lineStyle from line result (for dashed bands)
        const lineStyleValue = styleOverride?.lineStyle ?? (line as any).lineStyle;
        const effectiveLineStyle = lineStyleValue === 2 || lineStyleValue === "dashed" ? LineStyle.Dashed
          : lineStyleValue === 3 || lineStyleValue === "dotted" ? LineStyle.Dotted
          : LineStyle.Solid;
        
        // lastValueVisible for price scale label (TV-style)
        const lastValueVisible = (line as any).lastValueVisible !== false;
        
        // Compact formatter (K/M/B/T) for volume-style indicators (OBV)
        const useCompactFormat = (result as any)._compactFormatter === true;
        const priceFormatOpts = useCompactFormat ? { type: "volume" as const } : undefined;
        
        let series = seriesMapRef.current.get(key);
        
        if (!series) {
          // Create new series
          if (line.style === "histogram") {
            series = chart.addHistogramSeries({
              color: effectiveColor,
              priceLineVisible: false,
              lastValueVisible,
              visible: isVisible,
              ...(priceFormatOpts && { priceFormat: priceFormatOpts }),
            });
          } else {
            series = chart.addLineSeries({
              color: effectiveColor,
              lineWidth: effectiveLineWidth as LineWidth,
              lineStyle: effectiveLineStyle,
              priceLineVisible: false,
              lastValueVisible,
              visible: isVisible,
              ...(priceFormatOpts && { priceFormat: priceFormatOpts }),
            });
          }
          seriesMapRef.current.set(key, series);
        } else {
          // Style change: applyOptions only (NO recompute)
          series.applyOptions({
            color: effectiveColor,
            lineWidth: effectiveLineWidth as LineWidth,
            lineStyle: effectiveLineStyle,
            visible: isVisible,
            ...(priceFormatOpts && { priceFormat: priceFormatOpts }),
          } as any); // Type cast needed for histogram series
        }
        
        // Set data
        series.setData(line.values);
        
        // Track RSI series ref for fill overlay coordinate conversion
        if (indicator.kind === "rsi" && line.id === "rsi") {
          rsiSeriesRef.current = series as ISeriesApi<"Line">;
        }
        
        // Track RSI Divergence series ref for overlay coordinate conversion
        if (indicator.kind === "rsiDivergence" && line.id === "rsi") {
          rsiDivSeriesRef.current = series as ISeriesApi<"Line">;
        }
        
        // Track CCI series ref for fill overlay coordinate conversion
        if (indicator.kind === "cci" && line.id === "cci") {
          cciSeriesRef.current = series as ISeriesApi<"Line">;
        }
        
        // Track Williams %R series ref for fill overlay coordinate conversion
        if (indicator.kind === "willr" && line.id === "willr") {
          willrSeriesRef.current = series as ISeriesApi<"Line">;
        }
        
        // Track Stochastic RSI K series ref for fill overlay coordinate conversion
        if (indicator.kind === "stochrsi" && line.id === "stochRsiK") {
          stochrsiSeriesRef.current = series as ISeriesApi<"Line">;
        }
        
        // Track Stochastic K series ref for fill overlay coordinate conversion
        if (indicator.kind === "stoch" && line.id === "stochK") {
          stochSeriesRef.current = series as ISeriesApi<"Line">;
        }
        
        // Track MFI series ref for fill overlay coordinate conversion
        if (indicator.kind === "mfi" && line.id === "mf") {
          mfiSeriesRef.current = series as ISeriesApi<"Line">;
        }
        
        // Track Ulcer Index series ref for fill overlay coordinate conversion
        if (indicator.kind === "ulcer" && line.id === "ulcer") {
          ulcerSeriesRef.current = series as ISeriesApi<"Line">;
        }
        
        // Track Aroon Oscillator series ref for fill overlay coordinate conversion
        if (indicator.kind === "aroonosc" && line.id === "oscillator") {
          aroonOscSeriesRef.current = series as ISeriesApi<"Line">;
        }
      });
    });

    // Remove stale series
    seriesMapRef.current.forEach((series, key) => {
      if (!activeKeys.has(key)) {
        try {
          chart.removeSeries(series);
        } catch { /* ignore */ }
        seriesMapRef.current.delete(key);
      }
    });
  }, [indicators, indicatorResults]);

  // Volume Delta candlestick series rendering
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    
    if (volumeDeltaConfig && volumeDeltaConfig.candles.length > 0) {
      // Create or update candlestick series
      if (!candleSeriesRef.current) {
        candleSeriesRef.current = chart.addCandlestickSeries({
          upColor: volumeDeltaConfig.upColor,
          downColor: volumeDeltaConfig.downColor,
          wickUpColor: volumeDeltaConfig.wickUpColor,
          wickDownColor: volumeDeltaConfig.wickDownColor,
          borderUpColor: volumeDeltaConfig.borderUpColor,
          borderDownColor: volumeDeltaConfig.borderDownColor,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: "volume" as const },
        });
      } else {
        // Update colors if they changed
        candleSeriesRef.current.applyOptions({
          upColor: volumeDeltaConfig.upColor,
          downColor: volumeDeltaConfig.downColor,
          wickUpColor: volumeDeltaConfig.wickUpColor,
          wickDownColor: volumeDeltaConfig.wickDownColor,
          borderUpColor: volumeDeltaConfig.borderUpColor,
          borderDownColor: volumeDeltaConfig.borderDownColor,
        });
      }
      
      // Set candle data - filter out any candles with all zeros (invalid data)
      const validCandles = volumeDeltaConfig.candles.filter(c => 
        c.high !== 0 || c.low !== 0 || c.close !== 0
      );
      
      if (validCandles.length > 0) {
        candleSeriesRef.current.setData(validCandles as any);
      }
    } else if (candleSeriesRef.current) {
      // Remove candlestick series if no Volume Delta indicator
      try {
        chart.removeSeries(candleSeriesRef.current);
      } catch { /* ignore */ }
      candleSeriesRef.current = null;
    }
  }, [volumeDeltaConfig]);

  // CVD (Cumulative Volume Delta) candlestick series rendering
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    
    if (cvdConfig && cvdConfig.candles.length > 0) {
      // Create or update candlestick series
      if (!cvdCandleSeriesRef.current) {
        cvdCandleSeriesRef.current = chart.addCandlestickSeries({
          upColor: cvdConfig.upColor,
          downColor: cvdConfig.downColor,
          wickUpColor: cvdConfig.wickUpColor,
          wickDownColor: cvdConfig.wickDownColor,
          borderUpColor: cvdConfig.borderUpColor,
          borderDownColor: cvdConfig.borderDownColor,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: "volume" as const },
        });
      } else {
        // Update colors if they changed
        cvdCandleSeriesRef.current.applyOptions({
          upColor: cvdConfig.upColor,
          downColor: cvdConfig.downColor,
          wickUpColor: cvdConfig.wickUpColor,
          wickDownColor: cvdConfig.wickDownColor,
          borderUpColor: cvdConfig.borderUpColor,
          borderDownColor: cvdConfig.borderDownColor,
        });
      }
      
      // Set candle data - filter out invalid candles
      const validCandles = cvdConfig.candles.filter(c => 
        Number.isFinite(c.open) && Number.isFinite(c.high) && 
        Number.isFinite(c.low) && Number.isFinite(c.close)
      );
      
      if (validCandles.length > 0) {
        cvdCandleSeriesRef.current.setData(validCandles as any);
      }
    } else if (cvdCandleSeriesRef.current) {
      // Remove candlestick series if no CVD indicator
      try {
        chart.removeSeries(cvdCandleSeriesRef.current);
      } catch { /* ignore */ }
      cvdCandleSeriesRef.current = null;
    }
  }, [cvdConfig]);

  // Zero line effect (for MACD and other oscillators)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    
    // Check if any indicator needs a zero line
    let needsZeroLine = false;
    let zeroLineConfig: { visible: boolean; color?: string; lineStyle?: string; lineWidth?: number } | null = null;
    
    indicators.forEach((indicator) => {
      const result = indicatorResults[indicator.id];
      if (result?._zeroLine?.visible) {
        needsZeroLine = true;
        zeroLineConfig = result._zeroLine;
      }
    });
    
    // Get any series to attach zero line to (price lines need a series)
    const firstSeries = seriesMapRef.current.values().next().value;
    
    if (needsZeroLine && firstSeries && zeroLineConfig) {
      // Remove existing zero line if any
      if (zeroLineRef.current) {
        try {
          firstSeries.removePriceLine(zeroLineRef.current);
        } catch { /* ignore */ }
      }
      
      // Create zero line
      const lineStyle = zeroLineConfig.lineStyle === "dotted" ? LineStyle.Dotted
        : zeroLineConfig.lineStyle === "dashed" ? LineStyle.Dashed
        : LineStyle.Dashed; // default dashed
        
      zeroLineRef.current = firstSeries.createPriceLine({
        price: 0,
        color: zeroLineConfig.color ?? "#787B86",
        lineWidth: (zeroLineConfig.lineWidth ?? 1) as LineWidth,
        lineStyle,
        axisLabelVisible: false,
      });
    } else if (zeroLineRef.current && firstSeries) {
      // Remove zero line if not needed
      try {
        firstSeries.removePriceLine(zeroLineRef.current);
      } catch { /* ignore */ }
      zeroLineRef.current = null;
    }
  }, [indicators, indicatorResults]);
  
  // Crosshair subscription for live legend values
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    
    const handleCrosshairMove = (param: any) => {
      if (!param?.time) {
        // Mouse left chart - reset to null (will show last values)
        setCrosshairValues({});
        return;
      }
      
      const newValues: CrosshairValues = {};
      
      indicators.forEach((indicator) => {
        if (indicator.hidden) return;
        
        const result = indicatorResults[indicator.id];
        if (!result?.lines) return;
        
        newValues[indicator.id] = {};
        
        result.lines.forEach((line) => {
          const key = `${indicator.id}:${line.id}`;
          const series = seriesMapRef.current.get(key);
          
          if (series && param.seriesData) {
            const data = param.seriesData.get(series);
            if (data?.value !== undefined) {
              // For histogram with per-bar color, use the color from data
              const color = (data as any).color ?? line.color;
              newValues[indicator.id][line.id] = { value: data.value, color };
            } else {
              newValues[indicator.id][line.id] = null;
            }
          }
        });
      });
      
      setCrosshairValues(newValues);
    };
    
    chart.subscribeCrosshairMove(handleCrosshairMove);
    
    return () => {
      try {
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
      } catch { /* ignore */ }
    };
  }, [indicators, indicatorResults]);

  const handleToggleHidden = useCallback(
    (id: string) => {
      const indicator = indicators.find((ind) => ind.id === id);
      if (indicator && onUpdateIndicator) {
        onUpdateIndicator(id, { hidden: !indicator.hidden });
      }
    },
    [indicators, onUpdateIndicator]
  );

  return (
    <div
      className="indicator-pane relative"
      style={{
        width,
        height,
        backgroundColor: theme.canvas.background,
      }}
      data-testid={`indicator-pane-${paneId}`}
    >
      {/* RSI Fill Overlay - renders background fill and overbought/oversold fills */}
      {rsiFillConfig && (
        <RsiFillOverlay
          chartRef={chartRef}
          rsiSeriesRef={rsiSeriesRef}
          containerRef={containerRef}
          rsiFillConfig={rsiFillConfig}
          enabled={true}
        />
      )}
      
      {/* CCI Fill Overlay - renders background fill between +100/-100 */}
      {cciFillConfig && (
        <CciFillOverlay
          chartRef={chartRef}
          cciSeriesRef={cciSeriesRef}
          containerRef={containerRef}
          cciFillConfig={cciFillConfig}
          enabled={true}
        />
      )}
      
      {/* Williams %R Fill Overlay - renders RSI-style fills for overbought/oversold */}
      {willrFillConfig && (
        <WillrFillOverlay
          chartRef={chartRef}
          willrSeriesRef={willrSeriesRef}
          containerRef={containerRef}
          willrFillConfig={willrFillConfig}
          enabled={true}
        />
      )}
      
      {/* Stochastic RSI Fill Overlay - renders background fill between 80/20 bands */}
      {stochrsiFillConfig && (
        <StochRsiFillOverlay
          chartRef={chartRef}
          stochrsiSeriesRef={stochrsiSeriesRef}
          containerRef={containerRef}
          stochrsiFillConfig={stochrsiFillConfig}
          enabled={true}
        />
      )}
      
      {/* Stochastic Fill Overlay - renders background fill between 80/20 bands */}
      {stochFillConfig && (
        <StochFillOverlay
          chartRef={chartRef}
          stochSeriesRef={stochSeriesRef}
          containerRef={containerRef}
          stochFillConfig={stochFillConfig}
          enabled={true}
        />
      )}
      
      {/* MFI Fill Overlay - renders background fill between 80/20 bands */}
      {mfiFillConfig && (
        <MfiFillOverlay
          chartRef={chartRef}
          mfiSeriesRef={mfiSeriesRef}
          containerRef={containerRef}
          mfiFillConfig={mfiFillConfig}
          enabled={true}
        />
      )}
      
      {/* Ulcer Index Fill Overlay - renders background fill between ulcer line and 0 */}
      {ulcerFillConfig && (
        <UlcerFillOverlay
          chartRef={chartRef}
          ulcerSeriesRef={ulcerSeriesRef}
          containerRef={containerRef}
          ulcerFillConfig={ulcerFillConfig}
          enabled={true}
        />
      )}
      
      {/* Aroon Oscillator Fill Overlay - renders sign-based line coloring and fill */}
      {aroonOscFillConfig && (
        <AroonOscFillOverlay
          chartRef={chartRef}
          aroonOscSeriesRef={aroonOscSeriesRef}
          containerRef={containerRef}
          aroonOscFillConfig={aroonOscFillConfig}
          enabled={true}
        />
      )}
      
      {/* RSI Divergence Overlay - renders background fill, dotted levels, divergence lines, Bull/Bear labels */}
      {rsiDivData && (
        <RSIDivergenceOverlay
          chartRef={chartRef}
          rsiSeriesRef={rsiDivSeriesRef}
          containerRef={containerRef}
          rsiDivData={rsiDivData}
        />
      )}
      
      {/* Legend */}
      <div
        className="absolute left-2 top-1 z-10 flex flex-col gap-0.5 max-w-[300px]"
        data-testid={`indicator-pane-legend-container-${paneId}`}
      >
        {indicators.map((indicator) => (
          <LegendItem
            key={indicator.id}
            indicator={indicator}
            result={indicatorResults[indicator.id]}
            crosshairValues={crosshairValues[indicator.id]}
            onToggleHidden={() => handleToggleHidden(indicator.id)}
            onOpenSettings={() => onOpenSettings?.(indicator.id)}
            onRemove={() => onRemoveIndicator?.(indicator.id)}
          />
        ))}
      </div>
      
      {/* Chart container */}
      <div ref={containerRef} style={{ width, height }} />
    </div>
  );
}

export default IndicatorPane;

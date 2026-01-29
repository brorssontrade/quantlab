/**
 * TV-10.3 + TV-23.2 + TV-35.2: Apply Settings to Chart Rendering
 * 
 * Maps AppearanceSettings (Zustand store) to lightweight-charts API options.
 * Ensures idempotent application (can be called repeatedly with same settings).
 * 
 * TV-23.2: Added full appearance settings support (grid style/color, crosshair mode/color, background)
 * TV-35.2: Enhanced typography with theme tokens (font family, sizes, weights)
 */

import type { IChartApi, ISeriesApi, DeepPartial, ChartOptions, SeriesOptionsCommon } from "@/lib/lightweightCharts";
import type { ChartSettings as LegacyChartSettings } from "../components/TopBar/SettingsPanel";
import type { AppearanceSettings, GridStyle, CrosshairMode } from "../state/settings";
import type { ChartType } from "../types";
import type { ChartsTheme } from "../theme";
import { ColorType, LineStyle, CrosshairMode as LwCrosshairMode } from "@/lib/lightweightCharts";

/**
 * Map GridStyle to lwcharts LineStyle
 */
function mapGridStyle(style: GridStyle): LineStyle {
  switch (style) {
    case "solid": return LineStyle.Solid;
    case "dashed": return LineStyle.Dashed;
    case "hidden": return LineStyle.Dotted; // Hidden handled via visible=false
    default: return LineStyle.Solid;
  }
}

/**
 * Map CrosshairMode to lwcharts CrosshairMode
 */
function mapCrosshairMode(mode: CrosshairMode): LwCrosshairMode {
  switch (mode) {
    case "normal": return LwCrosshairMode.Normal;
    case "magnet": return LwCrosshairMode.Magnet;
    case "hidden": return LwCrosshairMode.Hidden;
    default: return LwCrosshairMode.Normal;
  }
}

/**
 * TV-23.2 + TV-35.2: Apply chart-level settings (background, grid, crosshair) from AppearanceSettings
 * Enhanced with typography tokens for TradingView-level text rendering
 */
export function applyAppearanceToChart(
  chart: IChartApi,
  appearance: AppearanceSettings,
  theme: ChartsTheme
): DeepPartial<ChartOptions> {
  const gridVisible = appearance.showGrid && appearance.gridStyle !== "hidden";
  const gridStyle = mapGridStyle(appearance.gridStyle);
  const crosshairMode = mapCrosshairMode(appearance.crosshairMode);

  const options: DeepPartial<ChartOptions> = {
    layout: {
      background: { type: ColorType.Solid, color: appearance.backgroundColor },
      textColor: theme.text.axis,
      fontFamily: theme.typography.fontFamily.axis,
      fontSize: theme.typography.fontSize.sm, // 10px for axis labels
      attributionLogo: false as any,
    },
    grid: {
      horzLines: {
        color: appearance.gridColor,
        style: gridStyle,
        visible: gridVisible,
      },
      vertLines: {
        color: appearance.gridColor,
        style: gridStyle,
        visible: gridVisible,
      },
    },
    crosshair: {
      mode: crosshairMode,
      vertLine: {
        color: appearance.crosshairColor,
        width: theme.crosshairTokens.width as 1 | 2 | 3 | 4,
        style: LineStyle.Dashed,
        labelVisible: true,
        labelBackgroundColor: theme.crosshairTokens.labelBackground,
      },
      horzLine: {
        color: appearance.crosshairColor,
        labelVisible: true,
        labelBackgroundColor: theme.crosshairTokens.labelBackground,
      },
    },
    rightPriceScale: {
      borderColor: theme.canvas.grid,
    },
    timeScale: {
      borderColor: theme.canvas.grid,
    },
  };

  chart.applyOptions(options);
  return options;
}

/**
 * TV-23.2: Apply series-level appearance settings (candle colors)
 */
export function applyAppearanceToSeries(
  series: ISeriesApi<any>,
  chartType: ChartType,
  appearance: AppearanceSettings
): void {
  if (chartType === "candles" || chartType === "bars") {
    series.applyOptions({
      upColor: appearance.upColor,
      downColor: appearance.downColor,
      borderUpColor: appearance.upColor,
      borderDownColor: appearance.downColor,
      wickUpColor: appearance.wickUpColor,
      wickDownColor: appearance.wickDownColor,
      wickVisible: true,
      borderVisible: true,
    } as DeepPartial<SeriesOptionsCommon>);
  } else if (chartType === "line") {
    series.applyOptions({
      color: appearance.upColor,
    } as DeepPartial<SeriesOptionsCommon>);
  } else if (chartType === "area") {
    series.applyOptions({
      topColor: appearance.upColor,
      bottomColor: appearance.downColor,
      lineColor: appearance.upColor,
    } as DeepPartial<SeriesOptionsCommon>);
  }
}

// ─── Legacy Support ───────────────────────────────────────────────────────────
// Keep old functions for backward compatibility until full migration

/**
 * @deprecated Use applyAppearanceToChart instead
 * Apply chart-level settings (background, grid, crosshair)
 */
export function applyChartLevelSettings(
  chart: IChartApi,
  settings: LegacyChartSettings,
  theme: { background: string; grid: string; crosshair: string; crosshairLabelBg: string; axisText: string; fontFamily: string }
): void {
  // Use dark background if toggled on, otherwise use theme default
  const bgColor = settings.appearance.backgroundDark ? "#0a0a0a" : theme.background;
  
  chart.applyOptions({
    layout: {
      background: { type: ColorType.Solid, color: bgColor },
      textColor: theme.axisText,
      fontFamily: theme.fontFamily,
      attributionLogo: false as any,
    },
    grid: {
      horzLines: {
        color: theme.grid,
        style: LineStyle.Dotted,
        visible: settings.appearance.gridVisible,
      },
      vertLines: {
        color: theme.grid,
        style: LineStyle.Dotted,
        visible: settings.appearance.gridVisible,
      },
    },
    crosshair: {
      vertLine: {
        color: theme.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelVisible: true,
        labelBackgroundColor: theme.crosshairLabelBg,
      },
      horzLine: {
        color: theme.crosshair,
        labelVisible: true,
        labelBackgroundColor: theme.crosshairLabelBg,
      },
    },
  } as DeepPartial<ChartOptions>);
}

/**
 * @deprecated Use applyAppearanceToSeries instead
 * Apply series-level settings (colors, borders, wicks) based on chartType.
 * 
 * GUARANTEE: Settings are applied AFTER theme defaults in ChartViewport.useEffect,
 * ensuring user config takes precedence over theme colors. On series type swap,
 * this function is called immediately with the new series instance, preserving
 * user settings without requiring manual reapplication.
 */
export function applySeriesSettings(
  series: ISeriesApi<any>,
  chartType: ChartType,
  settings: LegacyChartSettings,
  theme: {
    candleUp: string;
    candleDown: string;
    candleBorderUp?: string;
    candleBorderDown?: string;
    wickUp: string;
    wickDown: string;
  }
): void {
  const upColor = settings.appearance.candleUpColor || theme.candleUp;
  const downColor = settings.appearance.candleDownColor || theme.candleDown;
  const borderUpColor = theme.candleBorderUp || upColor;
  const borderDownColor = theme.candleBorderDown || downColor;

  if (chartType === "candles" || chartType === "bars") {
    // Candles/Bars: Apply colors + border/wick visibility (all keys are standard lwcharts options).
    // Settings applied AFTER theme defaults to ensure user config wins.
    series.applyOptions({
      upColor,
      downColor,
      borderUpColor: settings.appearance.borderVisible ? borderUpColor : upColor,
      borderDownColor: settings.appearance.borderVisible ? borderDownColor : downColor,
      wickUpColor: settings.appearance.wickVisible ? theme.wickUp : "transparent",
      wickDownColor: settings.appearance.wickVisible ? theme.wickDown : "transparent",
      wickVisible: settings.appearance.wickVisible,
      borderVisible: settings.appearance.borderVisible,
    } as DeepPartial<SeriesOptionsCommon>);
  } else if (chartType === "line") {
    // Line series: single color for line stroke
    series.applyOptions({
      color: upColor,
    } as DeepPartial<SeriesOptionsCommon>);
  } else if (chartType === "area") {
    // Area series: topColor + bottomColor for gradient fill, lineColor for line itself
    series.applyOptions({
      topColor: upColor,       // Upper/bullish area color
      bottomColor: downColor,  // Lower/bearish area color
      lineColor: upColor,      // Line connecting area (uses up color)
    } as DeepPartial<SeriesOptionsCommon>);
  }
}

// ─── Snapshots for Testing ────────────────────────────────────────────────────

/**
 * TV-23.2: Applied appearance snapshot for QA/testing
 * Exposes the actual options applied to the chart (not just stored settings)
 */
export interface AppliedAppearanceSnapshot {
  chartOptions: {
    backgroundColor: string;
    gridVisible: boolean;
    gridStyle: string;
    gridColor: string;
    crosshairMode: string;
    crosshairColor: string;
  };
  seriesOptions: {
    upColor: string;
    downColor: string;
    wickUpColor: string;
    wickDownColor: string;
  } | null;
  appliedAt: number;
}

/**
 * TV-23.2: Create snapshot of applied appearance settings for dump().render
 */
export function createAppearanceSnapshot(
  appearance: AppearanceSettings,
  chartType: ChartType
): AppliedAppearanceSnapshot {
  return {
    chartOptions: {
      backgroundColor: appearance.backgroundColor,
      gridVisible: appearance.showGrid && appearance.gridStyle !== "hidden",
      gridStyle: appearance.gridStyle,
      gridColor: appearance.gridColor,
      crosshairMode: appearance.crosshairMode,
      crosshairColor: appearance.crosshairColor,
    },
    seriesOptions: (chartType === "candles" || chartType === "bars") ? {
      upColor: appearance.upColor,
      downColor: appearance.downColor,
      wickUpColor: appearance.wickUpColor,
      wickDownColor: appearance.wickDownColor,
    } : null,
    appliedAt: Date.now(),
  };
}

/**
 * @deprecated Use createAppearanceSnapshot instead
 * Complete settings snapshot for QA/testing
 */
export interface AppliedSettingsSnapshot {
  appearance: {
    candleUpColor: string | null;
    candleDownColor: string | null;
    wickVisible: boolean;
    borderVisible: boolean;
    gridVisible: boolean;
    backgroundDark: boolean;
  };
  scales: {
    mode: "auto" | "log" | "percent";
  };
  chartType: ChartType;
  appliedAt: number; // timestamp
}

/**
 * @deprecated Use createAppearanceSnapshot instead
 * Create a snapshot of currently applied settings for dump() exposure
 */
export function createAppliedSnapshot(
  settings: LegacyChartSettings,
  chartType: ChartType
): AppliedSettingsSnapshot {
  return {
    appearance: {
      candleUpColor: settings.appearance.candleUpColor,
      candleDownColor: settings.appearance.candleDownColor,
      wickVisible: settings.appearance.wickVisible,
      borderVisible: settings.appearance.borderVisible,
      gridVisible: settings.appearance.gridVisible,
      backgroundDark: settings.appearance.backgroundDark,
    },
    scales: {
      mode: settings.scales.mode,
    },
    chartType,
    appliedAt: Date.now(),
  };
}

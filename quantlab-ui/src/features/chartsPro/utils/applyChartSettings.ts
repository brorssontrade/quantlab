/**
 * TV-10.3: Apply Settings to Chart Rendering
 * 
 * Maps ChartSettings interface to lightweight-charts API options.
 * Ensures idempotent application (can be called repeatedly with same settings).
 */

import type { IChartApi, ISeriesApi, DeepPartial, ChartOptions, SeriesOptionsCommon } from "@/lib/lightweightCharts";
import type { ChartSettings } from "../components/TopBar/SettingsPanel";
import type { ChartType } from "../types";
import { ColorType, LineStyle } from "@/lib/lightweightCharts";

/**
 * Apply chart-level settings (background, grid, crosshair)
 */
export function applyChartLevelSettings(
  chart: IChartApi,
  settings: ChartSettings,
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
  settings: ChartSettings,
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

/**
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
 * Create a snapshot of currently applied settings for dump() exposure
 */
export function createAppliedSnapshot(
  settings: ChartSettings,
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

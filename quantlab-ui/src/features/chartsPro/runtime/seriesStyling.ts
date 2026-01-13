/**
 * seriesStyling.ts
 *
 * Series styling and placement application.
 * Exports:
 * - applySeriesStyle: Maps UI style to LW series options
 * - applySeriesPlacement: Sets pane + scale side
 * - buildSeriesStylesForDump: Creates dump-friendly style objects
 */

import type { ISeriesApi, LineStyle } from "@/lib/lightweightCharts";
import type { SeriesPlacement } from "../types";

export interface SeriesStyle {
  colorHint?: string;
  width?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
}

export interface SeriesPlacementConfig {
  pane?: "main" | "volume";
  scale?: "left" | "right";
}

/**
 * Applies UI style (color, width, line style) to LW series.
 * Converts from our style format to LW API format.
 */
export const applySeriesStyle = (
  series: ISeriesApi,
  style: SeriesStyle,
  colorHint?: string,
): void => {
  if (!series) return;

  const options: any = {};

  // Line/candle color
  if (style.colorHint || colorHint) {
    const color = style.colorHint || colorHint;
    options.color = color;
    // For candle series (OHLC), also set wick color
    if ("setOptions" in series) {
      options.wickColor = color;
    }
  }

  // Line width
  if (typeof style.width === "number") {
    options.lineWidth = Math.max(1, Math.min(5, style.width));
  }

  // Line style
  if (style.lineStyle) {
    const styleMap: Record<string, LineStyle> = {
      solid: "solid" as const,
      dashed: "dashed" as const,
      dotted: "dotted" as const,
    };
    options.lineStyle = styleMap[style.lineStyle] || "solid";
  }

  if (Object.keys(options).length > 0) {
    try {
      (series as any).applyOptions(options);
    } catch {
      // Silently ignore if series doesn't support these options
    }
  }
};

/**
 * Applies placement (pane + scale side) to LW series.
 * Note: In LW, pane changes require chart structure modifications;
 * this is typically done during series creation, not on-the-fly.
 */
export const applySeriesPlacement = (
  series: ISeriesApi,
  placement: SeriesPlacementConfig,
): void => {
  if (!series) return;

  const options: any = {};

  // Scale side (left/right)
  if (placement.scale === "left" || placement.scale === "right") {
    options.priceScaleId = placement.scale === "left" ? "left" : "right";
  }

  if (Object.keys(options).length > 0) {
    try {
      (series as any).applyOptions(options);
    } catch {
      // Silently ignore if series doesn't support these options
    }
  }
};

/**
 * Builds a dump-friendly representation of series styles.
 * Used in dump() to expose style info to tests/inspector.
 */
export const buildSeriesStyleForDump = (
  style: SeriesStyle | undefined,
  placement: SeriesPlacement | undefined,
  colorHint?: string,
): any => {
  const s = style ?? {};
  const p = placement ?? {};
  const scaleSide = p.scale === "left" ? "left" : "right";

  return {
    colorHint: s.colorHint ?? colorHint ?? "#888",
    width: s.width ?? 2,
    lineStyle: s.lineStyle ?? "solid",
    pane: p.pane ?? "main",
    scale: p.scale ?? "right",
    scaleSide,
  };
};

/**
 * QA instrumentation helpers for series styling
 */
export const setQaOpenSeriesSettings = (id: string) => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaOpenSeriesSettings = id;
};

export const setQaSetSeriesStyle = (
  id: string,
  style: { colorHint?: string; width?: number; lineStyle?: string }
) => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaSetSeriesStyle = { id, style };
};

export const setQaSetSeriesPlacement = (
  id: string,
  placement: { pane?: string; scale?: string }
) => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaSetSeriesPlacement = { id, placement };
};

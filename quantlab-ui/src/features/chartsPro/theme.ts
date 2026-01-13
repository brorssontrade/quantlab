import type { ChartThemeName } from "./types";

export interface ChartsTheme {
  name: ChartThemeName;
  background: string;
  panel: string;
  grid: string;
  subtleGrid: string;
  axisText: string;
  crosshair: string;
  candleUp: string;
  candleDown: string;
  candleBorderUp: string;
  candleBorderDown: string;
  wickUp: string;
  wickDown: string;
  volumeUp: string;
  volumeDown: string;
  fontFamily: string;
  crosshairLabelBg: string;
  priceLine: string;
  volumeNeutral: string;
  overlayLine: string;
  overlaySelection: string;
  overlayHandleFill: string;
  overlayHandleStroke: string;
  overlayLabelBg: string;
  overlayLabelText: string;
}

export const chartThemes: Record<ChartThemeName, ChartsTheme> = {
  dark: {
    name: "dark",
    background: "#0b1220",
    panel: "#0f172a",
    grid: "#1f2937",
    subtleGrid: "rgba(31, 41, 55, 0.45)",
    axisText: "#e5e7eb",
    crosshair: "#60a5fa",
    candleUp: "#10b981",
    candleDown: "#f87171",
    candleBorderUp: "#34d399",
    candleBorderDown: "#f87171",
    wickUp: "#34d399",
    wickDown: "#f87171",
    volumeUp: "rgba(38, 166, 154, 0.4)",
    volumeDown: "rgba(239, 83, 80, 0.4)",
    volumeNeutral: "rgba(148, 163, 184, 0.35)",
    fontFamily: "'Inter', 'Satoshi', 'IBM Plex Mono', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    crosshairLabelBg: "#0b1220",
    priceLine: "#94a3b8",
    overlayLine: "#2962ff",
    overlaySelection: "#facc15",
    overlayHandleFill: "#0b1220",
    overlayHandleStroke: "#f8fafc",
    overlayLabelBg: "rgba(15, 23, 42, 0.85)",
    overlayLabelText: "#e2e8f0",
  },
  light: {
    name: "light",
    background: "#ffffff",
    panel: "#f8fafc",
    grid: "#eef2f7",
    subtleGrid: "rgba(148, 163, 184, 0.4)",
    axisText: "#1f2937",
    crosshair: "#0ea5e9",
    candleUp: "#10b981",
    candleDown: "#ef4444",
    candleBorderUp: "#111827",
    candleBorderDown: "#111827",
    wickUp: "#111827",
    wickDown: "#111827",
    volumeUp: "rgba(38, 166, 154, 0.35)",
    volumeDown: "rgba(239, 83, 80, 0.35)",
    volumeNeutral: "rgba(148, 163, 184, 0.3)",
    fontFamily: "'Inter', 'Satoshi', 'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    crosshairLabelBg: "#e2e8f0",
    priceLine: "#64748b",
    overlayLine: "#2962ff",
    overlaySelection: "#0f172a",
    overlayHandleFill: "#ffffff",
    overlayHandleStroke: "#0f172a",
    overlayLabelBg: "rgba(248, 250, 252, 0.95)",
    overlayLabelText: "#0f172a",
  },
};

export function getChartTheme(name: ChartThemeName = "dark"): ChartsTheme {
  return chartThemes[name] ?? chartThemes.dark;
}

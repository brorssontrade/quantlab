import type { ChartThemeName } from "./types";

// =============================================================================
// TV-35.1: Centralized Theme Tokens for Visual Excellence
// =============================================================================

/**
 * Typography tokens - TradingView-inspired font stack
 */
export interface TypographyTokens {
  // Font families
  fontFamily: {
    /** Primary UI font (labels, buttons) */
    primary: string;
    /** Monospace font (prices, OHLC values) */
    mono: string;
    /** Axis labels and numbers */
    axis: string;
  };
  // Font sizes (in px)
  fontSize: {
    /** Extra small (8px) - tooltips, footnotes */
    xs: number;
    /** Small (10px) - axis labels, time axis */
    sm: number;
    /** Medium (11px) - OHLC strip, legend values */
    md: number;
    /** Large (12px) - symbol name, main labels */
    lg: number;
    /** Extra large (13px) - headers, watermark */
    xl: number;
    /** 2XL (14px) - prominent text */
    xxl: number;
  };
  // Font weights
  fontWeight: {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  // Line heights
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

/**
 * Spacing tokens for consistent layout
 */
export interface SpacingTokens {
  /** 2px */
  xs: number;
  /** 4px */
  sm: number;
  /** 8px */
  md: number;
  /** 12px */
  lg: number;
  /** 16px */
  xl: number;
  /** 24px */
  xxl: number;
  /** 32px */
  xxxl: number;
}

/**
 * Canvas/chart tokens
 */
export interface CanvasTokens {
  background: string;
  panel: string;
  grid: string;
  subtleGrid: string;
  border: string;          // TV-41: Axis/scale border (more visible than grid)
  gridOpacity: number;
  vertGridOpacity: number;
  horzGridOpacity: number;
}

/**
 * Text/axis tokens
 */
export interface TextTokens {
  primary: string;
  secondary: string;
  muted: string;
  axis: string;
  legend: string;
  tooltip: string;
}

/**
 * Crosshair tokens
 */
export interface CrosshairTokens {
  line: string;
  labelBackground: string;
  labelText: string;
  width: number;
  style: number; // LWC LineStyle enum
}

/**
 * Candle/bar tokens
 */
export interface CandleTokens {
  upColor: string;
  downColor: string;
  borderUp: string;
  borderDown: string;
  wickUp: string;
  wickDown: string;
}

/**
 * Volume tokens
 */
export interface VolumeTokens {
  up: string;
  down: string;
  neutral: string;
  opacity: number;
}

/**
 * Overlay/UI tokens
 */
export interface OverlayTokens {
  line: string;
  selection: string;
  handleFill: string;
  handleStroke: string;
  labelBg: string;
  labelText: string;
  toolbarBg: string;
  toolbarBorder: string;
  modalBg: string;
  modalBorder: string;
  chipBg: string;
  chipText: string;
  chipBorder: string;
}

/**
 * Watermark tokens
 */
export interface WatermarkTokens {
  color: string;
  fontSize: number;
  fontWeight: number;
  opacity: number;
}

/**
 * Complete theme interface
 */
export interface ChartsTheme {
  name: ChartThemeName;
  // Canvas
  canvas: CanvasTokens;
  // Text
  text: TextTokens;
  // Crosshair (structured)
  crosshairTokens: CrosshairTokens;
  // Candles
  candle: CandleTokens;
  // Volume
  volume: VolumeTokens;
  // Overlays/UI
  overlay: OverlayTokens;
  // Watermark
  watermark: WatermarkTokens;
  // Typography (shared)
  typography: TypographyTokens;
  // Spacing (shared)
  spacing: SpacingTokens;

  // Legacy compatibility properties (deprecated, use structured tokens above)
  /** @deprecated Use canvas.background */
  background: string;
  /** @deprecated Use canvas.panel */
  panel: string;
  /** @deprecated Use canvas.grid */
  grid: string;
  /** @deprecated Use canvas.subtleGrid */
  subtleGrid: string;
  /** @deprecated Use text.axis */
  axisText: string;
  /** @deprecated Use crosshairTokens.line */
  crosshair: string;
  /** @deprecated Use candle.upColor */
  candleUp: string;
  /** @deprecated Use candle.downColor */
  candleDown: string;
  /** @deprecated Use candle.borderUp */
  candleBorderUp: string;
  /** @deprecated Use candle.borderDown */
  candleBorderDown: string;
  /** @deprecated Use candle.wickUp */
  wickUp: string;
  /** @deprecated Use candle.wickDown */
  wickDown: string;
  /** @deprecated Use volume.up */
  volumeUp: string;
  /** @deprecated Use volume.down */
  volumeDown: string;
  /** @deprecated Use volume.neutral */
  volumeNeutral: string;
  /** @deprecated Use typography.fontFamily.primary */
  fontFamily: string;
  /** @deprecated Use crosshair.labelBackground */
  crosshairLabelBg: string;
  /** @deprecated Use crosshair.line */
  priceLine: string;
  /** @deprecated Use overlay.line */
  overlayLine: string;
  /** @deprecated Use overlay.selection */
  overlaySelection: string;
  /** @deprecated Use overlay.handleFill */
  overlayHandleFill: string;
  /** @deprecated Use overlay.handleStroke */
  overlayHandleStroke: string;
  /** @deprecated Use overlay.labelBg */
  overlayLabelBg: string;
  /** @deprecated Use overlay.labelText */
  overlayLabelText: string;
}

// Shared typography tokens (same for both themes)
const sharedTypography: TypographyTokens = {
  fontFamily: {
    primary: "'Inter', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace",
    axis: "'Inter', 'SF Pro Text', -apple-system, sans-serif",
  },
  fontSize: {
    xs: 8,
    sm: 10,
    md: 11,
    lg: 12,
    xl: 13,
    xxl: 14,
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.1,
    normal: 1.4,
    relaxed: 1.6,
  },
};

// Shared spacing tokens
const sharedSpacing: SpacingTokens = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  xxxl: 32,
};

// Dark theme - TradingView Pro inspired
const darkTheme: ChartsTheme = {
  name: "dark",

  // Structured tokens
  canvas: {
    background: "#131722",  // TradingView dark background
    panel: "#1e222d",
    grid: "#2a2e39",
    subtleGrid: "rgba(42, 46, 57, 0.5)",
    border: "#363a45",      // TV-41: Axis border (more visible than grid)
    gridOpacity: 0.6,
    vertGridOpacity: 0.5,
    horzGridOpacity: 0.6,
  },
  text: {
    primary: "#d1d4dc",
    secondary: "#9598a1",
    muted: "#6a6d78",
    axis: "#9598a1",  // TradingView axis text
    legend: "#d1d4dc",
    tooltip: "#d1d4dc",
  },
  crosshairTokens: {
    line: "#758696",  // TradingView grey crosshair
    labelBackground: "#131722",  // Dark pill
    labelText: "#d1d4dc",
    width: 1,
    style: 0, // Solid
  },
  candle: {
    upColor: "#26a69a",  // TradingView teal green
    downColor: "#ef5350",  // TradingView red
    borderUp: "#26a69a",
    borderDown: "#ef5350",
    wickUp: "#26a69a",
    wickDown: "#ef5350",
  },
  volume: {
    up: "rgba(38, 166, 154, 0.35)",
    down: "rgba(239, 83, 80, 0.35)",
    neutral: "rgba(149, 152, 161, 0.25)",
    opacity: 0.35,
  },
  overlay: {
    line: "#2962ff",
    selection: "#ffd54f",  // TradingView yellow selection
    handleFill: "#131722",
    handleStroke: "#d1d4dc",
    labelBg: "rgba(30, 34, 45, 0.9)",
    labelText: "#d1d4dc",
    toolbarBg: "#1e222d",
    toolbarBorder: "#363a45",
    modalBg: "#1e222d",
    modalBorder: "#363a45",
    chipBg: "rgba(41, 98, 255, 0.15)",
    chipText: "#2962ff",
    chipBorder: "rgba(41, 98, 255, 0.3)",
  },
  watermark: {
    color: "#363a45",
    fontSize: 48,
    fontWeight: 700,
    opacity: 0.2,
  },
  typography: sharedTypography,
  spacing: sharedSpacing,

  // Legacy compatibility
  background: "#131722",
  panel: "#1e222d",
  grid: "#2a2e39",
  subtleGrid: "rgba(42, 46, 57, 0.5)",
  axisText: "#9598a1",
  crosshair: "#758696",  // Legacy crosshair color
  candleUp: "#26a69a",
  candleDown: "#ef5350",
  candleBorderUp: "#26a69a",
  candleBorderDown: "#ef5350",
  wickUp: "#26a69a",
  wickDown: "#ef5350",
  volumeUp: "rgba(38, 166, 154, 0.35)",
  volumeDown: "rgba(239, 83, 80, 0.35)",
  volumeNeutral: "rgba(149, 152, 161, 0.25)",
  fontFamily: sharedTypography.fontFamily.primary,
  crosshairLabelBg: "#131722",
  priceLine: "#9598a1",
  overlayLine: "#2962ff",
  overlaySelection: "#ffd54f",
  overlayHandleFill: "#131722",
  overlayHandleStroke: "#d1d4dc",
  overlayLabelBg: "rgba(30, 34, 45, 0.9)",
  overlayLabelText: "#d1d4dc",
};

// Light theme - TradingView Paper exact parity
const lightTheme: ChartsTheme = {
  name: "light",

  // Structured tokens - TradingView exact values
  canvas: {
    background: "#ffffff",      // TradingView: pure white
    panel: "#ffffff",           // TradingView: white panels
    grid: "#f3f3f3",            // TradingView: neutral grey grid (NO blue tint)
    subtleGrid: "rgba(243, 243, 243, 0.6)",
    border: "#e0e3eb",          // TV-41: Axis border (more visible than grid)
    gridOpacity: 0.5,
    vertGridOpacity: 0.4,
    horzGridOpacity: 0.5,
  },
  text: {
    primary: "#131722",         // TradingView: near-black text
    secondary: "#787b86",       // TradingView: muted text
    muted: "#9598a1",
    axis: "#131722",            // TradingView: dark axis text
    legend: "#131722",
    tooltip: "#131722",
  },
  crosshairTokens: {
    line: "#758696",            // TradingView: crosshair grey
    labelBackground: "#e0e3eb", // TradingView light: light grey label background
    labelText: "#131722",       // TradingView light: dark text on light label
    width: 1,
    style: 0, // Solid
  },
  candle: {
    upColor: "#089981",         // TradingView: exact green
    downColor: "#f23645",       // TradingView: exact red
    borderUp: "#089981",
    borderDown: "#f23645",
    wickUp: "#089981",
    wickDown: "#f23645",
  },
  volume: {
    up: "rgba(8, 153, 129, 0.3)",
    down: "rgba(242, 54, 69, 0.3)",
    neutral: "rgba(149, 152, 161, 0.2)",
    opacity: 0.3,
  },
  overlay: {
    line: "#2962ff",
    selection: "#131722",
    handleFill: "#ffffff",
    handleStroke: "#131722",
    labelBg: "rgba(255, 255, 255, 0.95)",
    labelText: "#131722",
    toolbarBg: "#ffffff",
    toolbarBorder: "#e0e3eb",
    modalBg: "#ffffff",
    modalBorder: "#e0e3eb",
    chipBg: "rgba(41, 98, 255, 0.1)",
    chipText: "#2962ff",
    chipBorder: "rgba(41, 98, 255, 0.25)",
  },
  watermark: {
    color: "#d1d4dc",
    fontSize: 48,
    fontWeight: 700,
    opacity: 0.15,
  },
  typography: sharedTypography,
  spacing: sharedSpacing,

  // Legacy compatibility - TradingView exact values
  background: "#ffffff",
  panel: "#ffffff",
  grid: "#f3f3f3",              // TradingView: neutral grey (NO blue tint)
  subtleGrid: "rgba(243, 243, 243, 0.6)",
  axisText: "#131722",          // TradingView: dark axis
  crosshair: "#758696",         // TradingView: crosshair grey
  candleUp: "#089981",          // TradingView: exact green
  candleDown: "#f23645",        // TradingView: exact red
  candleBorderUp: "#089981",
  candleBorderDown: "#f23645",
  wickUp: "#089981",
  wickDown: "#f23645",
  volumeUp: "rgba(8, 153, 129, 0.3)",
  volumeDown: "rgba(242, 54, 69, 0.3)",
  volumeNeutral: "rgba(149, 152, 161, 0.2)",
  fontFamily: sharedTypography.fontFamily.primary,
  crosshairLabelBg: "#e0e3eb",  // TradingView light: light grey label
  priceLine: "#787b86",
  overlayLine: "#2962ff",
  overlaySelection: "#131722",
  overlayHandleFill: "#ffffff",
  overlayHandleStroke: "#131722",
  overlayLabelBg: "rgba(255, 255, 255, 0.95)",
  overlayLabelText: "#131722",
};

export const chartThemes: Record<ChartThemeName, ChartsTheme> = {
  dark: darkTheme,
  light: lightTheme,
};

export function getChartTheme(name: ChartThemeName = "dark"): ChartsTheme {
  return chartThemes[name] ?? chartThemes.dark;
}

/**
 * Helper to get LWC-compatible chart options from theme
 */
export function getLwcChartOptions(theme: ChartsTheme) {
  return {
    layout: {
      background: { color: theme.canvas.background },
      textColor: theme.text.axis,
      fontFamily: theme.typography.fontFamily.axis,
      fontSize: theme.typography.fontSize.sm,
    },
    grid: {
      vertLines: {
        color: theme.canvas.subtleGrid,
        visible: true,
      },
      horzLines: {
        color: theme.canvas.grid,
        visible: true,
      },
    },
    crosshair: {
      vertLine: {
        color: theme.crosshairTokens.line,
        width: theme.crosshairTokens.width as 1 | 2 | 3 | 4,
        labelBackgroundColor: theme.crosshairTokens.labelBackground,
      },
      horzLine: {
        color: theme.crosshairTokens.line,
        width: theme.crosshairTokens.width as 1 | 2 | 3 | 4,
        labelBackgroundColor: theme.crosshairTokens.labelBackground,
      },
    },
    rightPriceScale: {
      borderColor: theme.canvas.border,  // TV-41: Use border token (more visible than grid)
    },
    timeScale: {
      borderColor: theme.canvas.border,  // TV-41: Use border token (more visible than grid)
    },
  };
}

/**
 * Helper to get LWC-compatible candle series options from theme
 */
export function getLwcCandleOptions(theme: ChartsTheme) {
  return {
    upColor: theme.candle.upColor,
    downColor: theme.candle.downColor,
    borderUpColor: theme.candle.borderUp,
    borderDownColor: theme.candle.borderDown,
    wickUpColor: theme.candle.wickUp,
    wickDownColor: theme.candle.wickDown,
  };
}

/**
 * Helper to get LWC-compatible volume series options from theme
 */
export function getLwcVolumeOptions(theme: ChartsTheme, isPositive: boolean) {
  return {
    color: isPositive ? theme.volume.up : theme.volume.down,
    priceFormat: { type: "volume" as const },
  };
}

// =============================================================================
// TV-36.1: CSS Custom Properties from ChartsTheme
// =============================================================================

/**
 * TV-36.1: Generate CSS custom properties object from ChartsTheme tokens.
 * These can be applied to a root element to cascade theme values through CSS.
 * 
 * Usage: Apply returned object to style prop on .chartspro-root element
 * CSS classes can then use var(--cp-bg), var(--cp-grid), etc.
 */
export function getThemeCssVars(theme: ChartsTheme): Record<string, string> {
  return {
    // Canvas
    "--cp-bg": theme.canvas.background,
    "--cp-panel": theme.canvas.panel,
    "--cp-grid": theme.canvas.grid,
    "--cp-grid-subtle": theme.canvas.subtleGrid,
    "--cp-grid-opacity": String(theme.canvas.gridOpacity),
    
    // Text
    "--cp-text-primary": theme.text.primary,
    "--cp-text-secondary": theme.text.secondary,
    "--cp-text-muted": theme.text.muted,
    "--cp-text-axis": theme.text.axis,
    "--cp-text-legend": theme.text.legend,
    "--cp-text-tooltip": theme.text.tooltip,
    
    // Crosshair
    "--cp-crosshair": theme.crosshairTokens.line,
    "--cp-crosshair-label-bg": theme.crosshairTokens.labelBackground,
    "--cp-crosshair-label-text": theme.crosshairTokens.labelText,
    
    // Candle colors
    "--cp-candle-up": theme.candle.upColor,
    "--cp-candle-down": theme.candle.downColor,
    "--cp-candle-border-up": theme.candle.borderUp,
    "--cp-candle-border-down": theme.candle.borderDown,
    "--cp-wick-up": theme.candle.wickUp,
    "--cp-wick-down": theme.candle.wickDown,
    
    // Volume
    "--cp-volume-up": theme.volume.up,
    "--cp-volume-down": theme.volume.down,
    "--cp-volume-neutral": theme.volume.neutral,
    "--cp-volume-opacity": String(theme.volume.opacity),
    
    // Overlay UI
    "--cp-overlay-line": theme.overlay.line,
    "--cp-overlay-selection": theme.overlay.selection,
    "--cp-overlay-handle-fill": theme.overlay.handleFill,
    "--cp-overlay-handle-stroke": theme.overlay.handleStroke,
    "--cp-overlay-label-bg": theme.overlay.labelBg,
    "--cp-overlay-label-text": theme.overlay.labelText,
    "--cp-overlay-toolbar-bg": theme.overlay.toolbarBg,
    "--cp-overlay-toolbar-border": theme.overlay.toolbarBorder,
    "--cp-overlay-modal-bg": theme.overlay.modalBg,
    "--cp-overlay-modal-border": theme.overlay.modalBorder,
    "--cp-overlay-chip-bg": theme.overlay.chipBg,
    "--cp-overlay-chip-text": theme.overlay.chipText,
    "--cp-overlay-chip-border": theme.overlay.chipBorder,
    
    // Watermark
    "--cp-watermark-color": theme.watermark.color,
    "--cp-watermark-opacity": String(theme.watermark.opacity),
    
    // Typography
    "--cp-font-primary": theme.typography.fontFamily.primary,
    "--cp-font-mono": theme.typography.fontFamily.mono,
    "--cp-font-axis": theme.typography.fontFamily.axis,
    "--cp-font-size-xs": `${theme.typography.fontSize.xs}px`,
    "--cp-font-size-sm": `${theme.typography.fontSize.sm}px`,
    "--cp-font-size-md": `${theme.typography.fontSize.md}px`,
    "--cp-font-size-lg": `${theme.typography.fontSize.lg}px`,
    "--cp-font-size-xl": `${theme.typography.fontSize.xl}px`,
    "--cp-font-size-xxl": `${theme.typography.fontSize.xxl}px`,
    "--cp-font-weight-normal": String(theme.typography.fontWeight.normal),
    "--cp-font-weight-medium": String(theme.typography.fontWeight.medium),
    "--cp-font-weight-semibold": String(theme.typography.fontWeight.semibold),
    "--cp-font-weight-bold": String(theme.typography.fontWeight.bold),
    
    // Spacing
    "--cp-space-xs": `${theme.spacing.xs}px`,
    "--cp-space-sm": `${theme.spacing.sm}px`,
    "--cp-space-md": `${theme.spacing.md}px`,
    "--cp-space-lg": `${theme.spacing.lg}px`,
    "--cp-space-xl": `${theme.spacing.xl}px`,
    "--cp-space-xxl": `${theme.spacing.xxl}px`,
    "--cp-space-xxxl": `${theme.spacing.xxxl}px`,
    
    // Border radius (consistent)
    "--cp-radius-sm": "4px",
    "--cp-radius-md": "6px",
    "--cp-radius-lg": "8px",
    
    // Shadows
    "--cp-shadow-sm": "0 2px 4px rgba(0, 0, 0, 0.1)",
    "--cp-shadow-md": "0 4px 12px rgba(0, 0, 0, 0.2)",
    "--cp-shadow-lg": "0 8px 24px rgba(0, 0, 0, 0.3)",
    "--cp-shadow-overlay": theme.name === "dark" 
      ? "0 4px 20px rgba(0, 0, 0, 0.5)"
      : "0 4px 20px rgba(0, 0, 0, 0.15)",
  };
}

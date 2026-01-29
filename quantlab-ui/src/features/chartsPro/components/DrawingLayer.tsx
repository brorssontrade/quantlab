import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BusinessDay, IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from "@/lib/lightweightCharts";

import type { ABCDPattern, DateAndPriceRange, DateRange, Drawing, DrawingKind, ElliottWaveImpulsePattern, FibExtension, FibFan, FibRetracement, HeadAndShouldersPattern, LongPosition, NormalizedBar, PriceRange, ShortPosition, Tf, Trend } from "../types";
import { FIB_LEVELS, FIB_EXTENSION_LEVELS, FIB_FAN_RATIOS } from "../types";
import { describeTrend, tsMsToUtc } from "../types";
import type { Tool } from "../state/controls";
import { useOverlayCanvas } from "./overlayCanvasContext";
import type { ChartsTheme } from "../theme";
import { computeD, isPatternBullish, formatK, solveKFromDraggedD } from "../runtime/abcd";
import { computeHSGeometry, isPatternInverse, formatPatternType } from "../runtime/headAndShoulders";
import { getImpulseDirection, computeElliottWaveHandles, getLabelOffset } from "../runtime/elliottWave";

type ChartPoint = {
  x: number;
  y: number;
  timeMs: number;
  price: number;
  snapped?: boolean;
  snapOrigin?: { timeMs: number; price: number };
};

type DragHandle = "line" | "p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "upper" | "lower" | "hline" | "vline" | "rect_tl" | "rect_tr" | "rect_bl" | "rect_br" | "circle_top" | "circle_right" | "circle_bottom" | "circle_left" | "circle_center" | "ellipse_top" | "ellipse_right" | "ellipse_bottom" | "ellipse_left" | "ellipse_center" | "triangle_p1" | "triangle_p2" | "triangle_p3" | "triangle_center" | "callout_anchor" | "callout_box" | "note_anchor";

type HitResult = { drawing: Drawing; handle: DragHandle };

type UpsertOptions = { transient?: boolean; select?: boolean };

type SnapFeedback = { timeMs: number; price: number; startedAt: number };

interface SegmentGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  path: Path2D;
}

type DrawingGeometry =
  | { kind: "hline"; segment: SegmentGeometry }
  | { kind: "vline"; segment: SegmentGeometry }
  | { kind: "trend"; segment: SegmentGeometry }
  | { kind: "ray"; segment: SegmentGeometry; extendedSegment: SegmentGeometry }
  | { kind: "extendedLine"; segment: SegmentGeometry; extendedSegment: SegmentGeometry }
  | { kind: "channel"; baseline: SegmentGeometry; parallel: SegmentGeometry; midline: SegmentGeometry; p3: { x: number; y: number } }
  | { kind: "pitchfork"; median: SegmentGeometry; leftTine: SegmentGeometry; rightTine: SegmentGeometry; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }
  | { kind: "schiffPitchfork"; median: SegmentGeometry; leftTine: SegmentGeometry; rightTine: SegmentGeometry; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; shiftedP1: { x: number; y: number } }
  | { kind: "modifiedSchiffPitchfork"; median: SegmentGeometry; leftTine: SegmentGeometry; rightTine: SegmentGeometry; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; shiftedP1: { x: number; y: number } }
  | { kind: "flatTopChannel"; trendLine: SegmentGeometry; flatLine: SegmentGeometry; midline: SegmentGeometry; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }
  | { kind: "flatBottomChannel"; trendLine: SegmentGeometry; flatLine: SegmentGeometry; midline: SegmentGeometry; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }
  | { kind: "rectangle"; x: number; y: number; w: number; h: number; path: Path2D }
  | { kind: "circle"; cx: number; cy: number; radius: number; path: Path2D }
  | { kind: "ellipse"; cx: number; cy: number; radiusX: number; radiusY: number; path: Path2D }
  | { kind: "triangle"; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; centroid: { x: number; y: number }; path: Path2D }
  | { kind: "callout"; anchor: { x: number; y: number }; box: { x: number; y: number }; textWidth: number; textHeight: number; content: string }
  | { kind: "note"; anchor: { x: number; y: number }; textWidth: number; textHeight: number; content: string }
  | { kind: "text"; x: number; y: number; width: number; height: number; content: string }
  | { kind: "priceRange"; segment: SegmentGeometry; deltaPrice: number; deltaPercent: number }
  | { kind: "dateRange"; segment: SegmentGeometry; deltaMs: number; barsCount: number }
  | { kind: "dateAndPriceRange"; segment: SegmentGeometry; deltaPrice: number; deltaPercent: number; deltaMs: number; barsCount: number }
  | { kind: "fibRetracement"; segment: SegmentGeometry; levels: Array<{ ratio: number; price: number; y: number }> }
  | { kind: "fibExtension"; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; levels: Array<{ ratio: number; price: number; y: number }> }
  | { kind: "fibFan"; p1: { x: number; y: number }; p2: { x: number; y: number }; rays: Array<{ ratio: number; endX: number; endY: number }> }
  | { kind: "regressionTrend"; midline: SegmentGeometry; upperBand: SegmentGeometry; lowerBand: SegmentGeometry; slope: number; intercept: number; stdev: number }
  | { kind: "longPosition"; entry: { x: number; y: number }; stop: { x: number; y: number }; target: { x: number; y: number }; riskPrice: number; rewardPrice: number; riskPercent: number; rewardPercent: number; ratio: number }
  | { kind: "shortPosition"; entry: { x: number; y: number }; stop: { x: number; y: number }; target: { x: number; y: number }; riskPrice: number; rewardPrice: number; riskPercent: number; rewardPercent: number; ratio: number }
  | { kind: "abcd"; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; p4: { x: number; y: number }; segmentAB: SegmentGeometry; segmentBC: SegmentGeometry; segmentCD: SegmentGeometry; k: number; isBullish: boolean }
  | { kind: "headAndShoulders"; LS: { x: number; y: number }; Head: { x: number; y: number }; RS: { x: number; y: number }; NL1: { x: number; y: number }; NL2: { x: number; y: number }; neckline: SegmentGeometry; segmentLSHead: SegmentGeometry; segmentHeadRS: SegmentGeometry; isInverse: boolean; targetPrice: number; patternHeight: number }
  | { kind: "elliottWave"; points: Array<{ x: number; y: number }>; segments: SegmentGeometry[]; direction: "bullish" | "bearish" };

type PointerState =
  | { mode: "idle" }
  | { mode: "drawing"; id: string; kind: DrawingKind; phase?: number } // phase for multi-click tools (channel: 1=baseline, 2=offset)
  | { mode: "drag"; id: string; handle: DragHandle };

const COLORS: Record<Drawing["kind"], string> = {
  hline: "#f97316",
  vline: "#0ea5e9",
  trend: "#0ea5e9",
  ray: "#14b8a6", // teal for ray
  extendedLine: "#8b5cf6", // violet for extended line
  channel: "#a855f7",
  pitchfork: "#ec4899", // pink for pitchfork tools
  schiffPitchfork: "#ec4899", // pink for pitchfork tools
  modifiedSchiffPitchfork: "#ec4899", // pink for pitchfork tools
  flatTopChannel: "#a855f7", // purple like channel
  flatBottomChannel: "#a855f7", // purple like channel
  rectangle: "#22c55e",
  circle: "#22c55e", // green like rectangle
  ellipse: "#22c55e", // green like rectangle
  triangle: "#22c55e", // green like rectangle/circle/ellipse
  callout: "#eab308", // yellow like text
  note: "#fef08a", // light yellow for sticky note
  text: "#eab308",
  priceRange: "#06b6d4", // cyan for measure tools
  dateRange: "#06b6d4", // cyan for measure tools
  dateAndPriceRange: "#06b6d4", // cyan for combined measure tool
  fibRetracement: "#f59e0b", // amber for fibonacci tools
  fibExtension: "#f59e0b", // amber for fibonacci tools (same as retracement)
  fibFan: "#f59e0b", // amber for fibonacci tools (same as retracement)
  regressionTrend: "#10b981", // green/emerald for regression tools
  longPosition: "#22c55e", // green for long position (profit color)
  shortPosition: "#ef4444", // red for short position
  abcd: "#06b6d4", // cyan for harmonic patterns
  headAndShoulders: "#8b5cf6", // violet for head & shoulders pattern
  elliottWave: "#f59e0b", // amber for elliott wave (same as fib tools)
};

const HIT_TOLERANCE = 8;

/**
 * ADR: Overlay UI Event Isolation
 * 
 * PROBLEM: DrawingLayer uses native DOM event listeners (addEventListener) for pointer
 * handling because lightweight-charts requires low-level control. However, React portals
 * (like FloatingToolbar) render children into a different part of the DOM while
 * maintaining React's component tree. This means:
 * 
 * 1. Native event listeners on the chart container see ALL pointer events, including
 *    those from portaled UI like the FloatingToolbar
 * 2. React's synthetic event system (onClick) fires AFTER native listeners
 * 3. If we handle the event in native land, React never sees it
 * 
 * SOLUTION: Check if the event target is inside any overlay UI element EARLY in our
 * native handlers and bail out, letting React handle those events normally.
 * 
 * PATTERN: All overlay UI components should use data-overlay-ui="true" attribute or
 * a specific data-testid that we check here. This makes the pattern extensible.
 * 
 * @param target - The event target element
 * @returns true if the event came from overlay UI that should handle it instead
 */
function isEventFromOverlayUI(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  
  // Check for explicit overlay marker
  if (target.closest('[data-overlay-ui="true"]')) return true;
  
  // Check for known overlay UI components by testid
  const overlayTestIds = [
    'floating-toolbar',
    'text-edit-modal',
    'object-settings-modal',
    'alert-modal',
    'context-menu',
    'label-modal',
  ];
  
  for (const testId of overlayTestIds) {
    if (target.closest(`[data-testid="${testId}"]`)) return true;
  }
  
  return false;
}
const HANDLE_RADIUS = 5;
const LINE_WIDTH = 1.5;
const SELECTED_LINE_WIDTH = 2.5;
const SELECTION_GLOW_ALPHA = 0.4; // TV-30.1b: selection highlight opacity
const SNAP_FEEDBACK_MS = 200;

// ---------------------------------------------------------------------------
// TV-30.1b: Stroke helpers - always show user's style, selection as overlay
// ---------------------------------------------------------------------------

/** Apply base stroke style from drawing.style (color/width/dash/opacity) - ignores selection */
function applyBaseStroke(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  defaultColor: string,
) {
  const color = drawing.style?.color || defaultColor;
  const width = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  const opacity = drawing.style?.opacity ?? 1; // TV-30.2a: default fully opaque
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.globalAlpha = opacity;
}

/** Draw selection highlight glow around a path (call AFTER drawing base stroke) */
function drawSelectionGlow(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  colors: OverlayColors,
) {
  ctx.save();
  ctx.strokeStyle = colors.selection;
  ctx.lineWidth = 6; // wider glow behind the line
  ctx.globalAlpha = SELECTION_GLOW_ALPHA;
  ctx.setLineDash([]);
  ctx.stroke(path);
  ctx.restore();
}

/** Draw selection glow for a line segment (x1,y1 -> x2,y2) */
function drawSelectionGlowLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  colors: OverlayColors,
) {
  ctx.save();
  ctx.strokeStyle = colors.selection;
  ctx.lineWidth = 6;
  ctx.globalAlpha = SELECTION_GLOW_ALPHA;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
const IS_DEV = Boolean(
  typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV,
);
const CURSORS = {
  crosshair: "crosshair",
  default: "default",
  grab: "grab",
  grabbing: "grabbing",
  ns: "ns-resize",
  ew: "ew-resize",
  nesw: "nesw-resize",
  nwse: "nwse-resize",
};
type ChartDebugWindow = Window & { __chartsDebug?: boolean };

const getDebugFlag = () =>
  typeof window !== "undefined" && Boolean((window as ChartDebugWindow).__chartsDebug);

const setDebugFlag = (value: boolean) => {
  if (typeof window !== "undefined") {
    (window as ChartDebugWindow).__chartsDebug = value;
  }
};

/**
 * TV-30.7: Get label anchor position based on drawing geometry
 * Returns {x, y} position for label placement, or null if not applicable
 */
function getLabelAnchor(geometry: DrawingGeometry): { x: number; y: number } | null {
  switch (geometry.kind) {
    case "hline":
    case "vline":
    case "trend":
      // Lines: anchor near x2/y2 (end of segment)
      return { x: geometry.segment.x2, y: geometry.segment.y2 };
    case "ray":
    case "extendedLine":
      // Extended lines: anchor near the visible segment end
      return { x: geometry.segment.x2, y: geometry.segment.y2 };
    case "channel":
      // Channel: anchor near p3 (offset point)
      return { x: geometry.p3.x, y: geometry.p3.y };
    case "pitchfork":
    case "schiffPitchfork":
    case "modifiedSchiffPitchfork":
      // Pitchforks: anchor near p1 (apex)
      return { x: geometry.p1.x, y: geometry.p1.y };
    case "flatTopChannel":
    case "flatBottomChannel":
      // Flat channels: anchor near p3
      return { x: geometry.p3.x, y: geometry.p3.y };
    case "rectangle":
      // Rectangle: top-left corner
      return { x: geometry.x, y: geometry.y };
    case "circle":
    case "ellipse":
      // Circle/ellipse: top of shape
      return { x: geometry.cx, y: geometry.cy - (geometry.kind === "circle" ? geometry.radius : geometry.radiusY) };
    case "triangle":
      // Triangle: near first point
      return { x: geometry.p1.x, y: geometry.p1.y };
    case "priceRange":
    case "dateRange":
    case "dateAndPriceRange":
      // Ranges: near segment end
      return { x: geometry.segment.x2, y: geometry.segment.y2 };
    case "fibRetracement":
      // Fib: near segment end
      return { x: geometry.segment.x2, y: geometry.segment.y2 };
    case "fibExtension":
      // Fib extension: near p3
      return { x: geometry.p3.x, y: geometry.p3.y };
    case "fibFan":
      // Fib fan: near p2
      return { x: geometry.p2.x, y: geometry.p2.y };
    case "regressionTrend":
      // Regression: near midline end
      return { x: geometry.midline.segment.x2, y: geometry.midline.segment.y2 };
    case "longPosition":
    case "shortPosition":
      // Position: near entry
      return { x: geometry.entry.x, y: geometry.entry.y };
    case "callout":
      // Callout: already has text, skip label
      return null;
    case "note":
      // Note: already has text, skip label
      return null;
    case "text":
      // Text: skip - it IS text
      return null;
    case "abcd":
      // ABCD pattern: anchor near D point
      return { x: geometry.p4.x, y: geometry.p4.y };
    case "headAndShoulders":
      // H&S: anchor near head
      return { x: (geometry as Extract<DrawingGeometry, { kind: "headAndShoulders" }>).Head.x, y: (geometry as Extract<DrawingGeometry, { kind: "headAndShoulders" }>).Head.y };
    case "elliottWave":
      // Elliott Wave: anchor near wave 3 (typically the extreme)
      return { x: (geometry as Extract<DrawingGeometry, { kind: "elliottWave" }>).points[3].x, y: (geometry as Extract<DrawingGeometry, { kind: "elliottWave" }>).points[3].y };
    default:
      return null;
  }
}

/**
 * TV-30.7: Draw a label for a drawing at the appropriate anchor position
 */
function drawDrawingLabel(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: DrawingGeometry,
  width: number,
  height: number,
  colors: OverlayColors,
) {
  if (!drawing.label) return;
  
  const anchor = getLabelAnchor(geometry);
  if (!anchor) return;
  
  const label = drawing.label;
  const padding = 4;
  const fontSize = 11;
  
  ctx.save();
  ctx.font = `${fontSize}px 'Inter', sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  
  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + padding * 2;
  const boxHeight = fontSize + padding * 2;
  
  // Offset from anchor (slightly to the right and up)
  let labelX = anchor.x + 8;
  let labelY = anchor.y - 12;
  
  // Clamp to viewport
  labelX = Math.max(4, Math.min(width - boxWidth - 4, labelX));
  labelY = Math.max(boxHeight / 2 + 4, Math.min(height - boxHeight / 2 - 4, labelY));
  
  // Draw label background (semi-transparent)
  ctx.fillStyle = colors.labelBg;
  ctx.globalAlpha = 0.9;
  const borderRadius = 3;
  ctx.beginPath();
  ctx.roundRect(labelX, labelY - boxHeight / 2, boxWidth, boxHeight, borderRadius);
  ctx.fill();
  
  // Draw label text
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.labelText;
  ctx.fillText(label, labelX + padding, labelY);
  
  ctx.restore();
}

export interface DrawingLayerProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<SeriesType> | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  data: NormalizedBar[];
  timeframe: Tf;
  symbol: string;
  drawings: Drawing[];
  selectedId: string | null;
  tool: Tool;
  magnetEnabled: boolean;
  snapToClose: boolean;
  theme: ChartsTheme;
  onSelect: (id: string | null) => void;
  onUpsert: (drawing: Drawing, options?: UpsertOptions) => void;
  onRemove: (id: string) => void;
  duplicateDrawing: (id: string) => Drawing | null;
  onToggleLock: (id: string) => void;
  onToggleHide: (id: string) => void;
  setTool: (tool: Tool) => void;
  onTextCreated?: (drawingId: string) => void;
  onTextEdit?: (drawingId: string) => void;
  // TV-20.14: Global drawing controls
  globalHidden?: boolean;
  globalLocked?: boolean;
}

export function DrawingLayer({
  chart,
  candleSeries,
  containerRef,
  data,
  timeframe,
  symbol,
  drawings,
  selectedId,
  tool,
  magnetEnabled,
  snapToClose,
  theme,
  onSelect,
  onUpsert,
  onRemove,
  duplicateDrawing,
  onToggleLock,
  onToggleHide,
  setTool,
  onTextCreated,
  onTextEdit,
  globalHidden = false,
  globalLocked = false,
}: DrawingLayerProps) {
  const overlay = useOverlayCanvas();
  const pointerState = useRef<PointerState>({ mode: "idle" });
  const pointerOrigin = useRef<ChartPoint | null>(null);
  const rafRef = useRef<number | null>(null);
  const geometryCacheRef = useRef(
    new Map<string, { signature: string; geometry: DrawingGeometry | null }>(),
  );
  const draftIdRef = useRef<string | null>(null);
  const dragSnapshotRef = useRef<Drawing | null>(null);
  const activeDraftRef = useRef<Drawing | null>(null);
  const pendingCommitRef = useRef(false);
  const cursorRef = useRef<string>(CURSORS.crosshair);
  const snapFeedbackRef = useRef<SnapFeedback | null>(null);
  const isDrawing = tool !== "select";
  
  // Refs to hold the latest callback/prop versions for stable event handlers
  // This prevents the pointer handler useEffect from re-running on every callback change
  const callbacksRef = useRef<{
    applyCursorForHit: ((hit: HitResult | null, dragging: boolean) => void) | null;
    beginDrawing: ((point: ChartPoint) => void) | null;
    handleSelection: ((point: ChartPoint, event: PointerEvent, initialHit?: HitResult | null) => void) | null;
    hitTest: ((point: ChartPoint, opts?: { includeLocked?: boolean }) => HitResult | null) | null;
    updateDrawing: ((point: ChartPoint, event?: PointerEvent) => void) | null;
    computePoint: ((event: PointerEvent | MouseEvent) => ChartPoint | null) | null;
    pushDraft: ((next: Drawing, options?: UpsertOptions) => void) | null;
    requestRender: (() => void) | null;
    resetPointerSession: (() => void) | null;
    updateCursor: ((value: string) => void) | null;
    onUpsert: ((drawing: Drawing, options?: UpsertOptions) => void) | null;
    onTextEdit: ((id: string) => void) | null;
    onTextCreated: ((id: string) => void) | null;
    setTool: ((tool: Tool) => void) | null;
    tool: Tool;
  }>({
    applyCursorForHit: null,
    beginDrawing: null,
    handleSelection: null,
    hitTest: null,
    updateDrawing: null,
    computePoint: null,
    pushDraft: null,
    requestRender: null,
    resetPointerSession: null,
    updateCursor: null,
    onUpsert: null,
    onTextEdit: null,
    onTextCreated: null,
    setTool: null,
    tool: "select",
  });

  useEffect(() => {
    geometryCacheRef.current.clear();
  }, [chart, candleSeries]);

  useEffect(() => {
    const cache = geometryCacheRef.current;
    const ids = new Set(drawings.map((item) => item.id));
    for (const key of Array.from(cache.keys())) {
      if (!ids.has(key)) cache.delete(key);
    }
  }, [drawings]);

  const trendMap = useMemo(() => {
    const map = new Map<string, Trend>();
    for (const item of drawings) {
      if (item.kind === "trend") map.set(item.id, item);
    }
    return map;
  }, [drawings]);

  const computeViewportState = useCallback(
    (width: number, height: number) => {
      if (!chart || !candleSeries) {
        return { width, height, timeRangeKey: "auto", priceRangeKey: "auto" };
      }
      const timeScale = chart.timeScale();
      const visible = timeScale.getVisibleRange();
      const timeRangeKey =
        visible && visible.from && visible.to
          ? `${timeToMs(visible.from as UTCTimestamp | BusinessDay)}:${timeToMs(visible.to as UTCTimestamp | BusinessDay)}`
          : "auto";
      const topPrice = candleSeries.coordinateToPrice(0);
      const bottomPrice = candleSeries.coordinateToPrice(height);
      const priceRangeKey = `${topPrice ?? "na"}:${bottomPrice ?? "na"}`;
      return { width, height, timeRangeKey, priceRangeKey };
    },
    [candleSeries, chart],
  );

  const getDrawingGeometry = useCallback(
    (drawing: Drawing, viewport: { width: number; height: number; timeRangeKey: string; priceRangeKey: string }) => {
      if (!chart || !candleSeries) return null;
      const signature = geometrySignature(drawing, viewport);
      const cached = geometryCacheRef.current.get(drawing.id);
      if (cached && cached.signature === signature) {
        return cached.geometry;
      }
      const geometry = buildDrawingGeometry({
        drawing,
        chart,
        series: candleSeries,
        width: viewport.width,
        height: viewport.height,
        trends: trendMap,
        data,
      });
      geometryCacheRef.current.set(drawing.id, { signature, geometry });
      return geometry;
    },
    [candleSeries, chart, data, trendMap],
  );

  const updateCursor = useCallback(
    (value: string) => {
      if (cursorRef.current === value) return;
      cursorRef.current = value;
      if (containerRef.current) {
        containerRef.current.style.cursor = value;
      }
      if (overlay.canvas) {
        overlay.canvas.style.cursor = value;
      }
    },
    [containerRef, overlay.canvas],
  );

  const applyCursorForHit = useCallback(
    (hit: HitResult | null, dragging: boolean) => {
      if (dragging) {
        const dragCursor = hit ? (hit.handle === "line" ? CURSORS.grabbing : cursorForHandle(hit.handle)) : CURSORS.crosshair;
        updateCursor(dragCursor);
        return;
      }
      updateCursor(hit ? cursorForHandle(hit.handle) : tool === "select" ? CURSORS.default : CURSORS.crosshair);
    },
    [tool, updateCursor],
  );

  const pushDraft = useCallback(
    (next: Drawing, options?: UpsertOptions) => {
      activeDraftRef.current = next;
      onUpsert(next, options);
    },
    [onUpsert],
  );

  const render = useCallback(() => {
    const ctx = overlay.ctx;
    const canvas = overlay.canvas;
    if (!ctx || !canvas || !chart || !candleSeries) return;
    const ratio = overlay.pixelRatio || window.devicePixelRatio || 1;
    const width = overlay.width || canvas.width / ratio || canvas.width;
    const height = overlay.height || canvas.height / ratio || canvas.height;
    if (!width || !height) return;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    const colors = {
      line: theme.overlayLine,
      selection: theme.overlaySelection,
      handleFill: theme.overlayHandleFill,
      handleStroke: theme.overlayHandleStroke,
      labelBg: theme.overlayLabelBg,
      labelText: theme.overlayLabelText,
    };

    const viewport = computeViewportState(width, height);
    
    // TV-20.14: If globalHidden, skip rendering all drawings
    if (globalHidden) {
      ctx.restore();
      return;
    }
    
    const sorted = [...drawings].sort((a, b) => a.z - b.z);
    for (const drawing of sorted) {
      if (drawing.hidden) continue;
      const geometry = getDrawingGeometry(drawing, viewport);
      if (!geometry) continue;
      switch (geometry.kind) {
        case "hline":
          drawHLine(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "vline":
          drawVLine(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "trend":
          drawTrend(ctx, drawing, geometry, timeframe, selectedId === drawing.id, width, height, colors);
          break;
        case "ray":
          drawRay(ctx, drawing, geometry, timeframe, selectedId === drawing.id, width, height, colors);
          break;
        case "extendedLine":
          drawExtendedLine(ctx, drawing, geometry, timeframe, selectedId === drawing.id, width, height, colors);
          break;
        case "channel":
          drawChannel(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "pitchfork":
          drawPitchfork(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "schiffPitchfork":
        case "modifiedSchiffPitchfork":
          drawSchiffPitchfork(ctx, drawing, geometry as Extract<DrawingGeometry, { kind: "schiffPitchfork" | "modifiedSchiffPitchfork" }>, selectedId === drawing.id, colors);
          break;
        case "flatTopChannel":
        case "flatBottomChannel":
          drawFlatChannel(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "rectangle":
          drawRectangle(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "circle":
          drawCircle(ctx, drawing, geometry as Extract<DrawingGeometry, { kind: "circle" }>, selectedId === drawing.id, colors);
          break;
        case "ellipse":
          drawEllipse(ctx, drawing, geometry as Extract<DrawingGeometry, { kind: "ellipse" }>, selectedId === drawing.id, colors);
          break;
        case "triangle":
          drawTriangle(ctx, drawing, geometry as Extract<DrawingGeometry, { kind: "triangle" }>, selectedId === drawing.id, colors);
          break;
        case "callout":
          drawCallout(ctx, drawing, geometry as Extract<DrawingGeometry, { kind: "callout" }>, selectedId === drawing.id, colors);
          break;
        case "note":
          drawNote(ctx, drawing, geometry as Extract<DrawingGeometry, { kind: "note" }>, selectedId === drawing.id, colors);
          break;
        case "text":
          drawText(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "priceRange":
          drawPriceRange(ctx, drawing as PriceRange, geometry, selectedId === drawing.id, colors);
          break;
        case "dateRange":
          drawDateRange(ctx, drawing as DateRange, geometry, selectedId === drawing.id, colors, timeframe);
          break;
        case "dateAndPriceRange":
          drawDateAndPriceRange(ctx, drawing as DateAndPriceRange, geometry, selectedId === drawing.id, colors, timeframe);
          break;
        case "fibRetracement":
          drawFibRetracement(ctx, drawing as FibRetracement, geometry, selectedId === drawing.id, colors);
          break;
        case "fibExtension":
          drawFibExtension(ctx, drawing as FibExtension, geometry as Extract<DrawingGeometry, { kind: "fibExtension" }>, selectedId === drawing.id, colors);
          break;
        case "fibFan":
          drawFibFan(ctx, drawing as FibFan, geometry as Extract<DrawingGeometry, { kind: "fibFan" }>, selectedId === drawing.id, colors);
          break;
        case "regressionTrend":
          drawRegressionTrend(ctx, drawing, geometry as Extract<DrawingGeometry, { kind: "regressionTrend" }>, selectedId === drawing.id, colors);
          break;
        case "longPosition":
          drawLongPosition(ctx, drawing as LongPosition, geometry as Extract<DrawingGeometry, { kind: "longPosition" }>, selectedId === drawing.id, colors);
          break;
        case "shortPosition":
          drawShortPosition(ctx, drawing as ShortPosition, geometry as Extract<DrawingGeometry, { kind: "shortPosition" }>, selectedId === drawing.id, colors);
          break;
        case "abcd":
          drawABCD(ctx, drawing as ABCDPattern, geometry as Extract<DrawingGeometry, { kind: "abcd" }>, selectedId === drawing.id, colors);
          break;
        case "headAndShoulders":
          drawHeadAndShoulders(ctx, drawing as HeadAndShouldersPattern, geometry as Extract<DrawingGeometry, { kind: "headAndShoulders" }>, selectedId === drawing.id, colors);
          break;
        case "elliottWave":
          drawElliottWave(ctx, drawing as ElliottWaveImpulsePattern, geometry as Extract<DrawingGeometry, { kind: "elliottWave" }>, selectedId === drawing.id, colors);
          break;
        default:
          break;
      }
      // TV-30.7: Draw label for drawing if present
      drawDrawingLabel(ctx, drawing, geometry, width, height, colors);
    }

    const feedbackActive = drawSnapFeedbackIndicator(
      ctx,
      chart,
      candleSeries,
      width,
      height,
      snapFeedbackRef.current,
      colors,
    );
    if (feedbackActive) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => render());
    }

    if (IS_DEV && getDebugFlag()) {
      overlay.debugDraw();
    }

    ctx.restore();
  }, [
    candleSeries,
    chart,
    computeViewportState,
    drawings,
    getDrawingGeometry,
    globalHidden,
    overlay,
    selectedId,
    theme.overlayHandleFill,
    theme.overlayHandleStroke,
    theme.overlayLabelBg,
    theme.overlayLabelText,
    theme.overlayLine,
    theme.overlaySelection,
    timeframe,
  ]);

  const requestRender = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => render());
  }, [render]);

  const resetPointerSession = useCallback(() => {
    pointerState.current = { mode: "idle" };
    pointerOrigin.current = null;
    draftIdRef.current = null;
    dragSnapshotRef.current = null;
    activeDraftRef.current = null;
    pendingCommitRef.current = false;
    applyCursorForHit(null, false);
  }, [applyCursorForHit]);

  const cancelActiveOperation = useCallback(() => {
    if (pointerState.current.mode === "idle") return false;
    if (dragSnapshotRef.current) {
      onUpsert(dragSnapshotRef.current, { select: true });
    } else if (draftIdRef.current) {
      onRemove(draftIdRef.current);
    }
    resetPointerSession();
    requestRender();
    return true;
  }, [onRemove, onUpsert, requestRender, resetPointerSession]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    updateCursor(tool === "select" ? CURSORS.default : CURSORS.crosshair);
  }, [tool, updateCursor]);

  useEffect(() => {
    if (!IS_DEV) return;
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setDebugFlag(!getDebugFlag());
        overlay.clear();
        requestRender();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [overlay, requestRender]);

  useEffect(() => {
    if (!isDrawing) {
      // Don't reset if we're in a multi-click workflow (e.g., channel, pitchfork phase 1→2)
      // The pointerState.current.phase check protects multi-click tools in progress
      const state = pointerState.current;
      const isMultiClickInProgress = 
        state.mode === "drawing" && 
        "phase" in state && 
        typeof state.phase === "number";
      
      if (isMultiClickInProgress) {
        return;
      }
      
      pointerState.current = { mode: "idle" };
      pointerOrigin.current = null;
    }
  }, [isDrawing]);

  useEffect(() => {
    requestRender();
  }, [overlay.width, overlay.height, overlay.pixelRatio, requestRender]);

  useEffect(() => {
    if (!chart) return;
    const handle = () => requestRender();
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleTimeRangeChange(handle);
    timeScale.subscribeVisibleLogicalRangeChange(handle);
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(handle);
      timeScale.unsubscribeVisibleLogicalRangeChange(handle);
    };
  }, [chart, requestRender]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (!selectedId) return;
      if (event.key === "Delete") {
        onRemove(selectedId);
      } else if (event.key === "Enter") {
        // TV-20.4: Enter on selected text = edit
        const drawing = drawings.find((d) => d.id === selectedId);
        if (drawing?.kind === "text" && onTextEdit) {
          event.preventDefault();
          onTextEdit(selectedId);
        }
      } else if (event.shiftKey && event.key.toLowerCase() === "l") {
        // Shift+L = toggle lock
        onToggleLock(selectedId);
      } else if (event.shiftKey && event.key.toLowerCase() === "h") {
        // Shift+H = toggle hide (H alone is reserved for hline tool)
        onToggleHide(selectedId);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [selectedId, onRemove, onToggleHide, onToggleLock, drawings, onTextEdit]);

  useEffect(() => {
    if (!magnetEnabled) {
      snapFeedbackRef.current = null;
      requestRender();
    }
  }, [magnetEnabled, requestRender]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Priority: Cancel active drawing/drag operation first
        if (cancelActiveOperation()) {
          event.preventDefault();
          return;
        }
        // Fallback: If no active operation, switch to select tool
        setTool("select");
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [cancelActiveOperation, setTool]);

  const computePoint = useCallback(
    (event: PointerEvent): ChartPoint | null => {
      if (!chart || !candleSeries || !containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const time = chart.timeScale().coordinateToTime(x);
      const price = candleSeries.coordinateToPrice(y);
      if (time == null || price == null) return null;
      const ms = timeToMs(time as UTCTimestamp | BusinessDay);
      const numericPrice = Number(price);
      let snappedPoint = { timeMs: ms, price: numericPrice };
      let snapped = false;
      const shouldSnap = magnetEnabled || snapToClose;
      if (shouldSnap) {
        const next = snapPoint(ms, numericPrice, data, snapToClose);
        snapped = next.timeMs !== ms || next.price !== price;
        snappedPoint = next;
        if (snapped) {
          snapFeedbackRef.current = { timeMs: next.timeMs, price: next.price, startedAt: Date.now() };
          requestRender();
        }
      }
      return {
        x,
        y,
        ...snappedPoint,
        snapped,
        snapOrigin: snapped ? { timeMs: ms, price } : undefined,
      };
    },
    [candleSeries, chart, containerRef, data, magnetEnabled, requestRender, snapToClose],
  );

  const hitTest = useCallback(
    (point: ChartPoint, opts?: { includeLocked?: boolean }): HitResult | null => {
      // TV-20.14: If globalHidden, no hit test - drawings are invisible
      if (globalHidden) return null;
      if (!chart || !candleSeries) return null;
      const canvas = overlay.canvas;
      const ratio = overlay.pixelRatio || window.devicePixelRatio || 1;
      const width = overlay.width || (canvas ? canvas.width / ratio : 0);
      const height = overlay.height || (canvas ? canvas.height / ratio : 0);
      const viewport = computeViewportState(width, height);
      const includeLocked = opts?.includeLocked ?? false;
      const ordered = [...drawings].sort((a, b) => a.z - b.z);
      for (let i = ordered.length - 1; i >= 0; i -= 1) {
        const drawing = ordered[i];
        if (drawing.hidden) continue;
        // TV-20.14: globalLocked treats all drawings as locked
        const effectiveLocked = drawing.locked || globalLocked;
        if (!includeLocked && effectiveLocked) continue;
        const geometry = getDrawingGeometry(drawing, viewport);
        if (!geometry) continue;
        switch (geometry.kind) {
          case "hline": {
            if (distanceToSegment(point.x, point.y, geometry.segment) <= HIT_TOLERANCE) {
              return { drawing, handle: "hline" };
            }
            break;
          }
          case "vline": {
            if (distanceToSegment(point.x, point.y, geometry.segment) <= HIT_TOLERANCE) {
              return { drawing, handle: "vline" };
            }
            break;
          }
          case "trend": {
            const { segment } = geometry;
            if (distance(point.x, point.y, segment.x1, segment.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, segment.x2, segment.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distanceToSegment(point.x, point.y, segment) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "ray": {
            const { segment, extendedSegment } = geometry;
            // Check p1/p2 handles first (defined segment endpoints)
            if (distance(point.x, point.y, segment.x1, segment.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, segment.x2, segment.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            // Check the entire extended segment for line hit
            if (distanceToSegment(point.x, point.y, extendedSegment) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "extendedLine": {
            const { segment, extendedSegment } = geometry;
            // Check p1/p2 handles first (defined segment endpoints)
            if (distance(point.x, point.y, segment.x1, segment.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, segment.x2, segment.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            // Check the entire extended segment for line hit
            if (distanceToSegment(point.x, point.y, extendedSegment) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "channel": {
            const { baseline, parallel, midline, p3 } = geometry;
            // Check endpoint handles first (p1, p2 on baseline, p3 for offset)
            if (distance(point.x, point.y, baseline.x1, baseline.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, baseline.x2, baseline.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distance(point.x, point.y, p3.x, p3.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" };
            }
            // Check line segments for move
            if (distanceToSegment(point.x, point.y, baseline) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, parallel) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, midline) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "pitchfork": {
            const { median, leftTine, rightTine, p1, p2, p3 } = geometry;
            // Check endpoint handles first (p1, p2, p3)
            if (distance(point.x, point.y, p1.x, p1.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, p2.x, p2.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distance(point.x, point.y, p3.x, p3.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" };
            }
            // Check line segments for move
            if (distanceToSegment(point.x, point.y, median) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, leftTine) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, rightTine) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "schiffPitchfork":
          case "modifiedSchiffPitchfork": {
            const { median, leftTine, rightTine, p1, p2, p3 } = geometry as Extract<DrawingGeometry, { kind: "schiffPitchfork" | "modifiedSchiffPitchfork" }>;
            // Check endpoint handles first (p1, p2, p3) - use original p1, not shifted
            if (distance(point.x, point.y, p1.x, p1.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, p2.x, p2.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distance(point.x, point.y, p3.x, p3.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" };
            }
            // Check line segments for move
            if (distanceToSegment(point.x, point.y, median) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, leftTine) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, rightTine) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "flatTopChannel":
          case "flatBottomChannel": {
            const { trendLine, flatLine, midline, p1: fp1, p2: fp2, p3: fp3 } = geometry as Extract<DrawingGeometry, { kind: "flatTopChannel" | "flatBottomChannel" }>;
            // Check endpoint handles first (p1, p2, p3)
            if (distance(point.x, point.y, fp1.x, fp1.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, fp2.x, fp2.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distance(point.x, point.y, fp3.x, fp3.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" };
            }
            // Check line segments for move
            if (distanceToSegment(point.x, point.y, trendLine) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, flatLine) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, midline) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "rectangle": {
            const { x, y, w, h } = geometry;
            // All 4 corners: top-left, top-right, bottom-left, bottom-right
            const tl = { x: x, y: y };
            const tr = { x: x + w, y: y };
            const bl = { x: x, y: y + h };
            const br = { x: x + w, y: y + h };
            // Check all 4 corner handles
            if (distance(point.x, point.y, tl.x, tl.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "rect_tl" };
            }
            if (distance(point.x, point.y, tr.x, tr.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "rect_tr" };
            }
            if (distance(point.x, point.y, bl.x, bl.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "rect_bl" };
            }
            if (distance(point.x, point.y, br.x, br.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "rect_br" };
            }
            // Check if inside rectangle (for move/line handle)
            if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "circle": {
            const { cx, cy, radius } = geometry;
            const dist = distance(point.x, point.y, cx, cy);
            // Check 4 cardinal handles (top, right, bottom, left)
            const handles = [
              { pos: { x: cx, y: cy - radius }, name: "circle_top" as DragHandle },
              { pos: { x: cx + radius, y: cy }, name: "circle_right" as DragHandle },
              { pos: { x: cx, y: cy + radius }, name: "circle_bottom" as DragHandle },
              { pos: { x: cx - radius, y: cy }, name: "circle_left" as DragHandle },
            ];
            for (const { pos, name } of handles) {
              if (distance(point.x, point.y, pos.x, pos.y) <= HANDLE_RADIUS + 2) {
                return { drawing, handle: name };
              }
            }
            // Check center handle for move
            if (dist <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "circle_center" };
            }
            // Check if on or inside circle (for move)
            if (dist <= radius + HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "ellipse": {
            const { cx, cy, radiusX, radiusY } = geometry;
            // Normalized ellipse distance: (x-cx)²/rx² + (y-cy)²/ry² ≤ 1 inside
            const nx = (point.x - cx) / radiusX;
            const ny = (point.y - cy) / radiusY;
            const ellipseDist = Math.sqrt(nx * nx + ny * ny);
            // Check 4 cardinal handles (top, right, bottom, left)
            const handles = [
              { pos: { x: cx, y: cy - radiusY }, name: "ellipse_top" as DragHandle },
              { pos: { x: cx + radiusX, y: cy }, name: "ellipse_right" as DragHandle },
              { pos: { x: cx, y: cy + radiusY }, name: "ellipse_bottom" as DragHandle },
              { pos: { x: cx - radiusX, y: cy }, name: "ellipse_left" as DragHandle },
            ];
            for (const { pos, name } of handles) {
              if (distance(point.x, point.y, pos.x, pos.y) <= HANDLE_RADIUS + 2) {
                return { drawing, handle: name };
              }
            }
            // Check center handle for move
            if (distance(point.x, point.y, cx, cy) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "ellipse_center" };
            }
            // Check if on or inside ellipse (tolerance normalized)
            if (ellipseDist <= 1 + HIT_TOLERANCE / Math.min(radiusX, radiusY)) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "triangle": {
            const { p1, p2, p3, centroid, path } = geometry;
            // Check 3 vertex handles
            if (distance(point.x, point.y, p1.x, p1.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "triangle_p1" };
            }
            if (distance(point.x, point.y, p2.x, p2.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "triangle_p2" };
            }
            if (distance(point.x, point.y, p3.x, p3.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "triangle_p3" };
            }
            // Check center handle for move
            if (distance(point.x, point.y, centroid.x, centroid.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "triangle_center" };
            }
            // Check if inside triangle (for move)
            // Use canvas isPointInPath for accurate hit detection
            if (overlay.ctx && overlay.ctx.isPointInPath(path, point.x, point.y)) {
              return { drawing, handle: "line" };
            }
            // Also check edges for tolerance (in case path miss near edges)
            const edge1 = distanceToSegment(point.x, point.y, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, path: new Path2D() });
            const edge2 = distanceToSegment(point.x, point.y, { x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y, path: new Path2D() });
            const edge3 = distanceToSegment(point.x, point.y, { x1: p3.x, y1: p3.y, x2: p1.x, y2: p1.y, path: new Path2D() });
            if (Math.min(edge1, edge2, edge3) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "text": {
            const { x, y, width: w, height: h } = geometry;
            // Check if inside text bounding box (for move)
            // Text uses textBaseline="top", so y is top and text extends downward
            // Expand bounding box by HIT_TOLERANCE for easier selection
            if (point.x >= x - HIT_TOLERANCE && point.x <= x + w + HIT_TOLERANCE && 
                point.y >= y - HIT_TOLERANCE && point.y <= y + h + HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "callout": {
            // TV-26: Callout hit test - anchor handle, box handle, leader line, box body
            const { anchor, box, textWidth, textHeight } = geometry;
            const boxPadding = 4;
            const boxW = textWidth + boxPadding * 2;
            const boxH = textHeight;
            const boxLeft = box.x - boxPadding;
            const boxTop = box.y - boxH / 2;
            
            // Check anchor handle
            if (distance(point.x, point.y, anchor.x, anchor.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "callout_anchor" };
            }
            // Check box handle (right side of box when selected)
            if (distance(point.x, point.y, box.x + boxW - boxPadding, box.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "callout_box" };
            }
            // Check if inside box (for box move)
            if (point.x >= boxLeft - HIT_TOLERANCE && point.x <= boxLeft + boxW + HIT_TOLERANCE &&
                point.y >= boxTop - HIT_TOLERANCE && point.y <= boxTop + boxH + HIT_TOLERANCE) {
              return { drawing, handle: "callout_box" };
            }
            // Check leader line
            const leaderDist = distanceToSegment(point.x, point.y, { 
              x1: anchor.x, y1: anchor.y, 
              x2: box.x, y2: box.y, 
              path: new Path2D() 
            });
            if (leaderDist <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "note": {
            // TV-27: Note hit test - anchor handle, text box body
            const { anchor, textWidth, textHeight } = geometry;
            const boxPadding = 6;
            const boxW = textWidth + boxPadding * 2;
            const boxH = textHeight + boxPadding * 2;
            // Box is positioned below anchor with small offset
            const boxLeft = anchor.x - boxPadding;
            const boxTop = anchor.y + 4; // Small offset below anchor
            
            // Check anchor handle (small circle above box)
            if (distance(point.x, point.y, anchor.x, anchor.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "note_anchor" };
            }
            // Check if inside box (for selection/move)
            if (point.x >= boxLeft - HIT_TOLERANCE && point.x <= boxLeft + boxW + HIT_TOLERANCE &&
                point.y >= boxTop - HIT_TOLERANCE && point.y <= boxTop + boxH + HIT_TOLERANCE) {
              return { drawing, handle: "note_anchor" };
            }
            break;
          }
          case "priceRange": {
            const { segment } = geometry;
            // p1 = start point, p2 = end point
            if (distance(point.x, point.y, segment.x1, segment.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, segment.x2, segment.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distanceToSegment(point.x, point.y, segment) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "dateRange": {
            const { segment } = geometry;
            // p1 = start point, p2 = end point
            if (distance(point.x, point.y, segment.x1, segment.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, segment.x2, segment.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distanceToSegment(point.x, point.y, segment) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "dateAndPriceRange": {
            const { segment } = geometry;
            // p1 = start point, p2 = end point
            if (distance(point.x, point.y, segment.x1, segment.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, segment.x2, segment.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distanceToSegment(point.x, point.y, segment) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "fibRetracement": {
            const { segment, levels } = geometry;
            // Check endpoint handles first (p1, p2)
            if (distance(point.x, point.y, segment.x1, segment.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, segment.x2, segment.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            // Check if click is on any level line (horizontal lines at each fib level)
            for (const level of levels) {
              if (Math.abs(point.y - level.y) <= HIT_TOLERANCE &&
                  point.x >= Math.min(segment.x1, segment.x2) - HIT_TOLERANCE &&
                  point.x <= Math.max(segment.x1, segment.x2) + HIT_TOLERANCE) {
                return { drawing, handle: "line" };
              }
            }
            // Check the diagonal trend line between p1 and p2
            if (distanceToSegment(point.x, point.y, segment) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "fibExtension": {
            const { p1, p2, p3, levels } = geometry as Extract<DrawingGeometry, { kind: "fibExtension" }>;
            // Check p1, p2, p3 handles
            if (distance(point.x, point.y, p1.x, p1.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, p2.x, p2.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distance(point.x, point.y, p3.x, p3.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" };
            }
            // Check level lines (horizontal, extended right from p3)
            const minX = Math.min(p1.x, p2.x, p3.x);
            const maxX = Math.max(p1.x, p2.x, p3.x) + 200; // Extended right
            for (const level of levels) {
              if (typeof level.y === "number" && isFinite(level.y) &&
                  Math.abs(point.y - level.y) <= HIT_TOLERANCE &&
                  point.x >= minX - HIT_TOLERANCE && point.x <= maxX) {
                return { drawing, handle: "line" };
              }
            }
            // Check connecting lines (p1-p2, p2-p3)
            const seg12 = createSegment(p1.x, p1.y, p2.x, p2.y);
            const seg23 = createSegment(p2.x, p2.y, p3.x, p3.y);
            if (distanceToSegment(point.x, point.y, seg12) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, seg23) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "fibFan": {
            const { p1, p2, rays } = geometry as Extract<DrawingGeometry, { kind: "fibFan" }>;
            // Check p1, p2 handles
            if (distance(point.x, point.y, p1.x, p1.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, p2.x, p2.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            // Check each ray (from p1 to extended endpoint)
            for (const ray of rays) {
              const raySeg = createSegment(p1.x, p1.y, ray.endX, ray.endY);
              if (distanceToSegment(point.x, point.y, raySeg) <= HIT_TOLERANCE) {
                return { drawing, handle: "line" };
              }
            }
            break;
          }
          case "regressionTrend": {
            const { midline, upperBand, lowerBand } = geometry as Extract<DrawingGeometry, { kind: "regressionTrend" }>;
            // Check p1 and p2 handles (at midline endpoints)
            if (distance(point.x, point.y, midline.x1, midline.y1) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, midline.x2, midline.y2) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            // Check if click is on any of the three lines (midline, upper, lower)
            if (distanceToSegment(point.x, point.y, midline) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, upperBand) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, lowerBand) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "longPosition": {
            const { entry, stop, target } = geometry as Extract<DrawingGeometry, { kind: "longPosition" }>;
            // Check p1 (entry), p2 (stop), p3 (target) handles
            if (distance(point.x, point.y, entry.x, entry.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, stop.x, stop.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distance(point.x, point.y, target.x, target.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" };
            }
            // Check horizontal lines at entry, stop, target levels
            const minX = Math.min(entry.x, stop.x, target.x) - 50;
            const maxX = Math.max(entry.x, stop.x, target.x) + 50;
            if (Math.abs(point.y - entry.y) <= HIT_TOLERANCE && point.x >= minX && point.x <= maxX) {
              return { drawing, handle: "line" };
            }
            if (Math.abs(point.y - stop.y) <= HIT_TOLERANCE && point.x >= minX && point.x <= maxX) {
              return { drawing, handle: "line" };
            }
            if (Math.abs(point.y - target.y) <= HIT_TOLERANCE && point.x >= minX && point.x <= maxX) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "shortPosition": {
            const { entry, stop, target } = geometry as Extract<DrawingGeometry, { kind: "shortPosition" }>;
            // Check p1 (entry), p2 (stop), p3 (target) handles
            if (distance(point.x, point.y, entry.x, entry.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, stop.x, stop.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distance(point.x, point.y, target.x, target.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" };
            }
            // Check horizontal lines at entry, stop, target levels
            const minX = Math.min(entry.x, stop.x, target.x) - 50;
            const maxX = Math.max(entry.x, stop.x, target.x) + 50;
            if (Math.abs(point.y - entry.y) <= HIT_TOLERANCE && point.x >= minX && point.x <= maxX) {
              return { drawing, handle: "line" };
            }
            if (Math.abs(point.y - stop.y) <= HIT_TOLERANCE && point.x >= minX && point.x <= maxX) {
              return { drawing, handle: "line" };
            }
            if (Math.abs(point.y - target.y) <= HIT_TOLERANCE && point.x >= minX && point.x <= maxX) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "abcd": {
            const { p1, p2, p3, p4, segmentAB, segmentBC, segmentCD } = geometry as Extract<DrawingGeometry, { kind: "abcd" }>;
            // Check handles for A, B, C, D points
            if (distance(point.x, point.y, p1.x, p1.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" };
            }
            if (distance(point.x, point.y, p2.x, p2.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" };
            }
            if (distance(point.x, point.y, p3.x, p3.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" };
            }
            if (distance(point.x, point.y, p4.x, p4.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p4" };
            }
            // Check segments for line move
            if (distanceToSegment(point.x, point.y, segmentAB) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, segmentBC) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, segmentCD) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "headAndShoulders": {
            const { LS, Head, RS, NL1, NL2, neckline, segmentLSHead, segmentHeadRS } = geometry as Extract<DrawingGeometry, { kind: "headAndShoulders" }>;
            // Check handles for LS, Head, RS, NL1, NL2 points
            if (distance(point.x, point.y, LS.x, LS.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p1" }; // LS
            }
            if (distance(point.x, point.y, Head.x, Head.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p2" }; // Head
            }
            if (distance(point.x, point.y, RS.x, RS.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p3" }; // RS
            }
            if (distance(point.x, point.y, NL1.x, NL1.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p4" }; // NL1
            }
            if (distance(point.x, point.y, NL2.x, NL2.y) <= HANDLE_RADIUS + 2) {
              return { drawing, handle: "p5" }; // NL2
            }
            // Check segments for line move
            if (distanceToSegment(point.x, point.y, segmentLSHead) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, segmentHeadRS) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            if (distanceToSegment(point.x, point.y, neckline) <= HIT_TOLERANCE) {
              return { drawing, handle: "line" };
            }
            break;
          }
          case "elliottWave": {
            const { points, segments } = geometry as Extract<DrawingGeometry, { kind: "elliottWave" }>;
            // Check handles for p0-p5 points (6 wave points)
            const handleNames: DragHandle[] = ["p0", "p1", "p2", "p3", "p4", "p5"];
            for (let i = 0; i < points.length; i++) {
              if (distance(point.x, point.y, points[i].x, points[i].y) <= HANDLE_RADIUS + 2) {
                return { drawing, handle: handleNames[i] };
              }
            }
            // Check wave segments for line move
            for (const seg of segments) {
              if (distanceToSegment(point.x, point.y, seg) <= HIT_TOLERANCE) {
                return { drawing, handle: "line" };
              }
            }
            break;
          }
          default:
            break;
        }
      }
      return null;
    },
    [candleSeries, chart, computeViewportState, drawings, getDrawingGeometry, globalHidden, globalLocked, overlay.canvas, overlay.height, overlay.pixelRatio, overlay.width],
  );

  const beginDrawing = useCallback(
    (point: ChartPoint) => {
      switch (tool) {
        case "hline": {
          const drawing: Drawing = {
            id: createId(),
            kind: "hline",
            symbol,
            tf: timeframe,
            price: point.price,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.hline, width: 1 },
          };
          pushDraft(drawing);
          requestRender();
          break;
        }
        case "vline": {
          const drawing: Drawing = {
            id: createId(),
            kind: "vline",
            symbol,
            tf: timeframe,
            timeMs: point.timeMs,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.vline, width: 1 },
          };
          pushDraft(drawing);
          requestRender();
          break;
        }
        case "trendline": {
          const drawing: Drawing = {
            id: createId(),
            kind: "trend",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            showSlope: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.trend, width: 2 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "trend" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "ray": {
          const drawing: Drawing = {
            id: createId(),
            kind: "ray",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            showSlope: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.ray, width: 2 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "ray" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "extendedLine": {
          const drawing: Drawing = {
            id: createId(),
            kind: "extendedLine",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            showSlope: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.extendedLine, width: 2 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "extendedLine" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "channel": {
          // 3-click workflow: click1=p1, click2=p2, click3=p3
          const drawing: Drawing = {
            id: createId(),
            kind: "channel",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            p3: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.channel, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "channel", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up
          requestRender();
          break;
        }
        case "pitchfork": {
          // 3-click workflow: click1=p1 (pivot), click2=p2 (left tine), click3=p3 (right tine)
          const drawing: Drawing = {
            id: createId(),
            kind: "pitchfork",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            p3: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.pitchfork, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "pitchfork", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up
          requestRender();
          break;
        }
        case "schiffPitchfork":
        case "modifiedSchiffPitchfork": {
          // 3-click workflow: same as pitchfork
          const schiffKind = tool as "schiffPitchfork" | "modifiedSchiffPitchfork";
          const drawing: Drawing = {
            id: createId(),
            kind: schiffKind,
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            p3: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS[schiffKind], width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: schiffKind, phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up
          requestRender();
          break;
        }
        case "flatTopChannel":
        case "flatBottomChannel": {
          // 3-click workflow: click1=p1, click2=p2 (trend baseline), click3=p3 (flat level)
          const flatKind = tool as "flatTopChannel" | "flatBottomChannel";
          const drawing: Drawing = {
            id: createId(),
            kind: flatKind,
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            p3: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS[flatKind], width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: flatKind, phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up
          requestRender();
          break;
        }
        case "rectangle": {
          const drawing: Drawing = {
            id: createId(),
            kind: "rectangle",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            fillColor: COLORS.rectangle,
            fillOpacity: 0.1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.rectangle, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "rectangle" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "circle": {
          const drawing: Drawing = {
            id: createId(),
            kind: "circle",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price }, // center
            p2: { timeMs: point.timeMs, price: point.price }, // edge (will be updated on drag)
            fillColor: COLORS.circle,
            fillOpacity: 0.1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.circle, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "circle" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "ellipse": {
          const drawing: Drawing = {
            id: createId(),
            kind: "ellipse",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price }, // center
            p2: { timeMs: point.timeMs, price: point.price }, // bounding corner
            fillColor: COLORS.ellipse,
            fillOpacity: 0.1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.ellipse, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "ellipse" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "triangle": {
          // 3-click workflow: click1=p1, click2=p2, click3=p3
          const drawing: Drawing = {
            id: createId(),
            kind: "triangle",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            p3: { timeMs: point.timeMs, price: point.price },
            fillColor: COLORS.triangle,
            fillOpacity: 0.1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.triangle, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "triangle", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up (3-click workflow)
          requestRender();
          break;
        }
        case "text": {
          // Text tool: create text with placeholder content, then open modal for editing
          const drawing: Drawing = {
            id: createId(),
            kind: "text",
            symbol,
            tf: timeframe,
            anchor: { timeMs: point.timeMs, price: point.price },
            content: "Text", // Default placeholder
            fontSize: 12,
            fontColor: COLORS.text,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.text, width: 1 },
          };
          pushDraft(drawing, { select: true });
          pointerState.current = { mode: "idle" };
          pendingCommitRef.current = false;
          requestRender();
          // Trigger modal for text editing
          onTextCreated?.(drawing.id);
          break;
        }
        case "callout": {
          // TV-26: Callout 2-click workflow: click1=anchor, click2=box position
          const drawing: Drawing = {
            id: createId(),
            kind: "callout",
            symbol,
            tf: timeframe,
            anchor: { timeMs: point.timeMs, price: point.price },
            box: { timeMs: point.timeMs, price: point.price }, // will be updated on drag/click2
            text: "", // Empty, will open modal after placement
            fontSize: 12,
            fontColor: COLORS.callout,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.callout, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "callout" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "note": {
          // TV-27: Note 1-click workflow: click → create → open modal immediately
          const drawing: Drawing = {
            id: createId(),
            kind: "note",
            symbol,
            tf: timeframe,
            anchor: { timeMs: point.timeMs, price: point.price },
            text: "", // Empty, will open modal
            fontSize: 12,
            fontColor: "#1a1a1a", // Dark text for yellow sticky note
            backgroundColor: COLORS.note,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.note, width: 1 },
          };
          pushDraft(drawing, { select: true });
          pointerState.current = { mode: "idle" };
          pendingCommitRef.current = false;
          requestRender();
          // Trigger modal for text editing
          onTextCreated?.(drawing.id);
          break;
        }
        case "priceRange": {
          const drawing: Drawing = {
            id: createId(),
            kind: "priceRange",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.priceRange, width: 2 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "priceRange" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "dateRange": {
          const drawing: Drawing = {
            id: createId(),
            kind: "dateRange",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.dateRange, width: 2 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "dateRange" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "dateAndPriceRange": {
          const drawing: Drawing = {
            id: createId(),
            kind: "dateAndPriceRange",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.dateAndPriceRange, width: 2 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "dateAndPriceRange" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "fibRetracement": {
          const drawing: Drawing = {
            id: createId(),
            kind: "fibRetracement",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.fibRetracement, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "fibRetracement" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "fibExtension": {
          // 3-click workflow: click1=p1 (impulse start), click2=p2 (impulse end), click3=p3 (retracement anchor)
          const drawing: Drawing = {
            id: createId(),
            kind: "fibExtension",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            p3: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.fibExtension, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "fibExtension", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up (3-click)
          requestRender();
          break;
        }
        case "fibFan": {
          // 2-click workflow: click1=p1 (anchor), drag to p2 (end)
          const drawing: Drawing = {
            id: createId(),
            kind: "fibFan",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.fibFan, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "fibFan" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "regressionTrend": {
          const drawing: Drawing = {
            id: createId(),
            kind: "regressionTrend",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price },
            p2: { timeMs: point.timeMs, price: point.price },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.regressionTrend, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "regressionTrend" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
          requestRender();
          break;
        }
        case "longPosition": {
          // 3-click workflow: click1=entry (p1), click2=stop (p2), click3=target (p3)
          const drawing: Drawing = {
            id: createId(),
            kind: "longPosition",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price }, // Entry
            p2: { timeMs: point.timeMs, price: point.price }, // Stop (below entry for long)
            p3: { timeMs: point.timeMs, price: point.price }, // Target (above entry for long)
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.longPosition, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "longPosition", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up (3-click workflow)
          requestRender();
          break;
        }
        case "shortPosition": {
          // 3-click workflow: click1=entry (p1), click2=stop (p2), click3=target (p3)
          const drawing: Drawing = {
            id: createId(),
            kind: "shortPosition",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price }, // Entry
            p2: { timeMs: point.timeMs, price: point.price }, // Stop (above entry for short)
            p3: { timeMs: point.timeMs, price: point.price }, // Target (below entry for short)
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.shortPosition, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "shortPosition", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up (3-click workflow)
          requestRender();
          break;
        }
        case "abcd": {
          // 3-click workflow: click1=A (p1), click2=B (p2), click3=C (p3), D is computed
          const drawing: Drawing = {
            id: createId(),
            kind: "abcd",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price }, // Point A
            p2: { timeMs: point.timeMs, price: point.price }, // Point B (will be set on click 2)
            p3: { timeMs: point.timeMs, price: point.price }, // Point C (will be set on click 3)
            p4: { timeMs: point.timeMs, price: point.price }, // Point D (computed from k)
            k: 1.0, // Standard AB=CD ratio
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.abcd, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "abcd", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up (3-click workflow)
          requestRender();
          break;
        }
        case "headAndShoulders": {
          // 5-click workflow: click1=LS, click2=Head, click3=RS, click4=NL1, click5=NL2
          const drawing: Drawing = {
            id: createId(),
            kind: "headAndShoulders",
            symbol,
            tf: timeframe,
            p1: { timeMs: point.timeMs, price: point.price }, // LS
            p2: { timeMs: point.timeMs, price: point.price }, // Head
            p3: { timeMs: point.timeMs, price: point.price }, // RS
            p4: { timeMs: point.timeMs, price: point.price }, // NL1
            p5: { timeMs: point.timeMs, price: point.price }, // NL2
            inverse: false, // Will be computed and set when drawing is committed
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.headAndShoulders, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "headAndShoulders", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up (5-click workflow)
          requestRender();
          break;
        }
        case "elliottWave": {
          // 6-click workflow: click1=0, click2=1, click3=2, click4=3, click5=4, click6=5
          const drawing: Drawing = {
            id: createId(),
            kind: "elliottWave",
            symbol,
            tf: timeframe,
            p0: { timeMs: point.timeMs, price: point.price }, // Wave 0 origin
            p1: { timeMs: point.timeMs, price: point.price }, // Wave 1 end
            p2: { timeMs: point.timeMs, price: point.price }, // Wave 2 end
            p3: { timeMs: point.timeMs, price: point.price }, // Wave 3 end
            p4: { timeMs: point.timeMs, price: point.price }, // Wave 4 end
            p5: { timeMs: point.timeMs, price: point.price }, // Wave 5 end
            direction: "bullish", // Will be computed and set when drawing is committed
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.elliottWave, width: 1 },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "elliottWave", phase: 1 };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = false; // Don't commit on first mouse up (6-click workflow)
          requestRender();
          break;
        }
        default:
          break;
      }
    },
    [hitTest, onTextCreated, pushDraft, requestRender, selectedId, symbol, timeframe, tool, trendMap],
  );

  const updateDrawing = useCallback(
    (point: ChartPoint, event: PointerEvent) => {
      const state = pointerState.current;
      if (state.mode === "idle") return;
      const drawing = drawings.find((item) => item.id === state.id);
      // TV-20.14: globalLocked blocks all move/resize (but selection still works via hitTest w/ includeLocked)
      if (!drawing || drawing.locked || globalLocked) return;
      let targetPoint = point;
      if (event.shiftKey && pointerOrigin.current && chart && candleSeries) {
        targetPoint = applyShiftConstraint(pointerOrigin.current, point, chart, candleSeries);
      }
      pendingCommitRef.current = true;
      if (state.mode === "drawing") {
        if (drawing.kind === "trend") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "ray") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "extendedLine") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "channel") {
          // 3-click channel: phase 1 updates p2, phase 2 updates p3
          const phase = state.phase ?? 1;
          if (phase === 1) {
            // Drawing baseline: update p2
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing offset: update p3
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "pitchfork") {
          // 3-click pitchfork: phase 1 updates p2, phase 2 updates p3
          const phase = state.phase ?? 1;
          if (phase === 1) {
            // Drawing left tine: update p2
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing right tine: update p3
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "schiffPitchfork" || drawing.kind === "modifiedSchiffPitchfork") {
          // 3-click Schiff pitchfork: same as regular pitchfork
          const phase = state.phase ?? 1;
          if (phase === 1) {
            // Drawing left tine: update p2
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing right tine: update p3
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "flatTopChannel" || drawing.kind === "flatBottomChannel") {
          // 3-click flat channel: phase 1 updates p2, phase 2 updates p3
          const phase = state.phase ?? 1;
          if (phase === 1) {
            // Drawing trend baseline: update p2
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing flat level: update p3 (only y matters for flat line)
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "rectangle") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "circle") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "ellipse") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "triangle") {
          // 3-click triangle: phase 1 updates p2, phase 2 updates p3
          const phase = state.phase ?? 1;
          if (phase === 1) {
            // Drawing second vertex: update p2
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing third vertex: update p3
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "callout") {
          // TV-26: Update box position during drawing
          const next: Drawing = {
            ...drawing,
            box: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "priceRange") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "dateRange") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "dateAndPriceRange") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "fibRetracement") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "fibExtension") {
          // 3-click workflow: phase 1 = drawing p2, phase 2 = drawing p3
          const phase = state.phase ?? 0;
          if (phase === 1) {
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "fibFan") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "regressionTrend") {
          const next: Drawing = {
            ...drawing,
            p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "longPosition") {
          // 3-click workflow: phase 1 = drawing stop (p2), phase 2 = drawing target (p3)
          const phase = state.phase ?? 0;
          if (phase === 1) {
            // Drawing stop loss level (p2)
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing target level (p3)
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "shortPosition") {
          // 3-click workflow: phase 1 = drawing stop (p2), phase 2 = drawing target (p3)
          const phase = state.phase ?? 0;
          if (phase === 1) {
            // Drawing stop loss level (p2)
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing target level (p3)
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "abcd") {
          // 3-click workflow: phase 1 = drawing B (p2), phase 2 = drawing C (p3), D is computed
          const phase = state.phase ?? 0;
          if (phase === 1) {
            // Drawing B point (p2)
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            // Compute D
            const result = computeD(drawing.p1, next.p2, next.p3, drawing.k ?? 1.0);
            (next as ABCDPattern).p4 = result.d;
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing C point (p3), D recomputes
            const result = computeD(drawing.p1, drawing.p2, 
              { timeMs: targetPoint.timeMs, price: targetPoint.price }, 
              drawing.k ?? 1.0
            );
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p4: result.d,
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "headAndShoulders") {
          // 5-click workflow: phase 1-4 update p2-p5
          const phase = state.phase ?? 0;
          if (phase === 1) {
            // Drawing Head (p2)
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing RS (p3)
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 3) {
            // Drawing NL1 (p4)
            const next: Drawing = {
              ...drawing,
              p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 4) {
            // Drawing NL2 (p5)
            const next: Drawing = {
              ...drawing,
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        } else if (drawing.kind === "elliottWave") {
          // 6-click workflow: phase 1-5 update p1-p5
          const phase = state.phase ?? 0;
          if (phase === 1) {
            // Drawing Wave 1 (p1)
            const next: Drawing = {
              ...drawing,
              p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 2) {
            // Drawing Wave 2 (p2)
            const next: Drawing = {
              ...drawing,
              p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 3) {
            // Drawing Wave 3 (p3)
            const next: Drawing = {
              ...drawing,
              p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 4) {
            // Drawing Wave 4 (p4)
            const next: Drawing = {
              ...drawing,
              p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          } else if (phase === 5) {
            // Drawing Wave 5 (p5)
            const next: Drawing = {
              ...drawing,
              p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
              updatedAt: Date.now(),
            };
            pushDraft(next, { transient: true, select: false });
          }
        }
        requestRender();
        return;
      }
      if (state.mode === "drag") {
        switch (drawing.kind) {
          case "hline":
            if (state.handle === "hline") {
              pushDraft({ ...drawing, price: targetPoint.price, updatedAt: Date.now() }, { transient: true, select: false });
            }
            break;
          case "vline":
            if (state.handle === "vline") {
              pushDraft({ ...drawing, timeMs: targetPoint.timeMs, updatedAt: Date.now() }, { transient: true, select: false });
            }
            break;
          case "trend":
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          case "ray":
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          case "extendedLine":
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          case "channel":
            // 3-point channel: handles for p1, p2, p3, baseline, parallel, midline
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              // Move entire channel
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          case "pitchfork":
            // 3-point pitchfork: handles for p1, p2, p3, median, left/right tines
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              // Move entire pitchfork
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          case "schiffPitchfork":
          case "modifiedSchiffPitchfork":
            // 3-point Schiff pitchfork: same drag handling as regular pitchfork
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              // Move entire Schiff pitchfork
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          case "flatTopChannel":
          case "flatBottomChannel":
            // 3-point flat channel: handles for p1, p2, p3, trendLine, flatLine, midline
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              // p3 only affects the flat line's y-level
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              // Move entire flat channel
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          case "rectangle": {
            // Determine which p1/p2 coordinates to update based on corner handle
            // p1 and p2 define opposite corners, geometry normalizes to top-left origin
            const { p1, p2 } = drawing;
            const minTime = Math.min(p1.timeMs, p2.timeMs);
            const maxTime = Math.max(p1.timeMs, p2.timeMs);
            const minPrice = Math.min(p1.price, p2.price);
            const maxPrice = Math.max(p1.price, p2.price);
            
            if (state.handle === "rect_tl") {
              // Top-left: change minTime, maxPrice
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                p2: { timeMs: maxTime, price: minPrice },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "rect_tr") {
              // Top-right: change maxTime, maxPrice
              pushDraft({
                ...drawing,
                p1: { timeMs: minTime, price: targetPoint.price },
                p2: { timeMs: targetPoint.timeMs, price: minPrice },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "rect_bl") {
              // Bottom-left: change minTime, minPrice
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: maxPrice },
                p2: { timeMs: maxTime, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "rect_br") {
              // Bottom-right: change maxTime, minPrice
              pushDraft({
                ...drawing,
                p1: { timeMs: minTime, price: maxPrice },
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "circle": {
            // Circle: p1 = center, p2 = edge point that determines radius
            // Cardinal handles resize by moving the edge point to maintain circular shape
            // Center handle or "line" moves the whole circle
            if (state.handle === "circle_center" || state.handle === "line") {
              if (pointerOrigin.current) {
                const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
                const dp = targetPoint.price - pointerOrigin.current.price;
                pointerOrigin.current = targetPoint;
                pushDraft({
                  ...drawing,
                  p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                  p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                  updatedAt: Date.now(),
                }, { transient: true, select: false });
              }
            } else if (state.handle === "circle_top" || state.handle === "circle_bottom" || 
                       state.handle === "circle_left" || state.handle === "circle_right") {
              // Any cardinal handle: update p2 to match new radius based on drag position
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "ellipse": {
            // Ellipse: p1 = center, p2 = corner of bounding box
            // Cardinal handles resize by adjusting radii independently
            // Center handle or "line" moves the whole ellipse
            if (state.handle === "ellipse_center" || state.handle === "line") {
              if (pointerOrigin.current) {
                const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
                const dp = targetPoint.price - pointerOrigin.current.price;
                pointerOrigin.current = targetPoint;
                pushDraft({
                  ...drawing,
                  p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                  p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                  updatedAt: Date.now(),
                }, { transient: true, select: false });
              }
            } else if (state.handle === "ellipse_left" || state.handle === "ellipse_right") {
              // Horizontal handles: only change x-radius (time dimension)
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: drawing.p2.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "ellipse_top" || state.handle === "ellipse_bottom") {
              // Vertical handles: only change y-radius (price dimension)
              pushDraft({
                ...drawing,
                p2: { timeMs: drawing.p2.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "triangle": {
            // Triangle: p1, p2, p3 are vertices
            // Vertex handles reshape by moving individual vertex
            // Center handle or "line" moves the whole triangle
            if (state.handle === "triangle_center" || state.handle === "line") {
              if (pointerOrigin.current) {
                const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
                const dp = targetPoint.price - pointerOrigin.current.price;
                pointerOrigin.current = targetPoint;
                pushDraft({
                  ...drawing,
                  p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                  p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                  p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                  updatedAt: Date.now(),
                }, { transient: true, select: false });
              }
            } else if (state.handle === "triangle_p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "triangle_p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "triangle_p3") {
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "text": {
            // Move text by its anchor point
            if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                anchor: { 
                  timeMs: drawing.anchor.timeMs + dt, 
                  price: drawing.anchor.price + dp 
                },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "callout": {
            // TV-26: Callout drag semantics:
            // - callout_anchor: move only anchor (box stays)
            // - callout_box: move only box (anchor stays)
            // - line: move both anchor and box together
            if (state.handle === "callout_anchor") {
              pushDraft({
                ...drawing,
                anchor: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "callout_box") {
              pushDraft({
                ...drawing,
                box: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                anchor: { timeMs: drawing.anchor.timeMs + dt, price: drawing.anchor.price + dp },
                box: { timeMs: drawing.box.timeMs + dt, price: drawing.box.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "note": {
            // TV-27: Note drag - move anchor (and the entire note box)
            if (state.handle === "note_anchor" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                anchor: { timeMs: drawing.anchor.timeMs + dt, price: drawing.anchor.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "priceRange": {
            // priceRange: drag p1 or p2 endpoints, or move whole measurement
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "dateRange": {
            // dateRange: drag p1 or p2 endpoints, or move whole measurement
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "dateAndPriceRange": {
            // dateAndPriceRange: drag p1 or p2 endpoints, or move whole measurement
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "fibRetracement": {
            // fibRetracement: drag p1 or p2 endpoints, or move whole fib
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "fibExtension": {
            // fibExtension: drag p1, p2, or p3 endpoints, or move whole extension
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "fibFan": {
            // fibFan: drag p1 or p2 endpoints, or move whole fan
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "regressionTrend": {
            // regressionTrend: drag p1 or p2 endpoints, or move whole regression
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "longPosition": {
            // longPosition: drag entry (p1), stop (p2), target (p3), or move whole position
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "shortPosition": {
            // shortPosition: drag entry (p1), stop (p2), target (p3), or move whole position
            if (state.handle === "p1") {
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "abcd": {
            // ABCD pattern: drag A/B/C recomputes D, drag D changes k
            if (state.handle === "p1") {
              // Dragging A - recompute D with same k
              const newP1 = { timeMs: targetPoint.timeMs, price: targetPoint.price };
              const result = computeD(newP1, drawing.p2, drawing.p3, drawing.k);
              pushDraft({
                ...drawing,
                p1: newP1,
                p4: result.d,
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              // Dragging B - recompute D with same k
              const newP2 = { timeMs: targetPoint.timeMs, price: targetPoint.price };
              const result = computeD(drawing.p1, newP2, drawing.p3, drawing.k);
              pushDraft({
                ...drawing,
                p2: newP2,
                p4: result.d,
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              // Dragging C - recompute D with same k
              const newP3 = { timeMs: targetPoint.timeMs, price: targetPoint.price };
              const result = computeD(drawing.p1, drawing.p2, newP3, drawing.k);
              pushDraft({
                ...drawing,
                p3: newP3,
                p4: result.d,
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p4") {
              // Dragging D - solve for new k and update
              const solveResult = solveKFromDraggedD(
                drawing.p1,
                drawing.p2,
                drawing.p3,
                { timeMs: targetPoint.timeMs, price: targetPoint.price }
              );
              // Recompute D with new k for clean position
              const result = computeD(drawing.p1, drawing.p2, drawing.p3, solveResult.k);
              pushDraft({
                ...drawing,
                p4: result.d,
                k: solveResult.k,
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              // Move entire pattern
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                p4: { timeMs: drawing.p4.timeMs + dt, price: drawing.p4.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "headAndShoulders": {
            // H&S pattern: drag any point freely
            if (state.handle === "p1") {
              // Dragging LS
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              // Dragging Head
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              // Dragging RS
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p4") {
              // Dragging NL1
              pushDraft({
                ...drawing,
                p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p5") {
              // Dragging NL2
              pushDraft({
                ...drawing,
                p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              // Move entire pattern
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                p4: { timeMs: drawing.p4.timeMs + dt, price: drawing.p4.price + dp },
                p5: { timeMs: drawing.p5.timeMs + dt, price: drawing.p5.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          case "elliottWave": {
            // Elliott Wave pattern: drag any point freely
            if (state.handle === "p0") {
              // Dragging Wave 0 origin
              pushDraft({
                ...drawing,
                p0: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p1") {
              // Dragging Wave 1 end
              pushDraft({
                ...drawing,
                p1: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p2") {
              // Dragging Wave 2 end
              pushDraft({
                ...drawing,
                p2: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p3") {
              // Dragging Wave 3 end
              pushDraft({
                ...drawing,
                p3: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p4") {
              // Dragging Wave 4 end
              pushDraft({
                ...drawing,
                p4: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "p5") {
              // Dragging Wave 5 end
              pushDraft({
                ...drawing,
                p5: { timeMs: targetPoint.timeMs, price: targetPoint.price },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "line" && pointerOrigin.current) {
              // Move entire pattern
              const dt = targetPoint.timeMs - pointerOrigin.current.timeMs;
              const dp = targetPoint.price - pointerOrigin.current.price;
              pointerOrigin.current = targetPoint;
              pushDraft({
                ...drawing,
                p0: { timeMs: drawing.p0.timeMs + dt, price: drawing.p0.price + dp },
                p1: { timeMs: drawing.p1.timeMs + dt, price: drawing.p1.price + dp },
                p2: { timeMs: drawing.p2.timeMs + dt, price: drawing.p2.price + dp },
                p3: { timeMs: drawing.p3.timeMs + dt, price: drawing.p3.price + dp },
                p4: { timeMs: drawing.p4.timeMs + dt, price: drawing.p4.price + dp },
                p5: { timeMs: drawing.p5.timeMs + dt, price: drawing.p5.price + dp },
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            }
            break;
          }
          default:
            break;
        }
        applyCursorForHit({ drawing, handle: state.handle }, true);
        requestRender();
      }
    },
    [applyCursorForHit, candleSeries, chart, drawings, globalLocked, pushDraft, requestRender, trendMap],
  );

  const handleSelection = useCallback(
    (point: ChartPoint, event: PointerEvent, initialHit?: HitResult | null) => {
      const hit = initialHit ?? hitTest(point);
      if (!hit) {
        onSelect(null);
        pointerState.current = { mode: "idle" };
        return;
      }
      let targetId = hit.drawing.id;
      let workingDrawing: Drawing | null = hit.drawing;
      if (event.altKey) {
        const clone = duplicateDrawing(hit.drawing.id);
        if (clone) {
          targetId = clone.id;
          workingDrawing = clone;
        }
      }
      onSelect(targetId);
      pointerState.current = { mode: "drag", id: targetId, handle: hit.handle };
      dragSnapshotRef.current = workingDrawing ? cloneDrawingState(workingDrawing) : null;
      activeDraftRef.current = workingDrawing;
      pendingCommitRef.current = false;
      pointerOrigin.current = point;
      applyCursorForHit(hit, true);
    },
    [applyCursorForHit, duplicateDrawing, hitTest, onSelect],
  );

  // Keep callbacksRef updated with the latest callback versions
  // This runs on every render but doesn't trigger any effects
  callbacksRef.current = {
    applyCursorForHit,
    beginDrawing,
    handleSelection,
    hitTest,
    updateDrawing,
    computePoint,
    pushDraft,
    requestRender,
    resetPointerSession,
    updateCursor,
    onUpsert,
    onTextEdit: onTextEdit ?? null,
    onTextCreated: onTextCreated ?? null,
    setTool,
    tool,
  };

  const spacePanRef = useRef(false);
  const spaceDraggingRef = useRef(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !spacePanRef.current) {
        spacePanRef.current = true;
        if (pointerState.current.mode === "idle") callbacksRef.current.updateCursor?.(CURSORS.grab);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spacePanRef.current = false;
        spaceDraggingRef.current = false;
        if (pointerState.current.mode === "idle") {
          callbacksRef.current.updateCursor?.(
            callbacksRef.current.tool === "select" ? CURSORS.default : CURSORS.crosshair
          );
        }
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const targetEl = containerRef.current;
    if (!targetEl || !chart || !candleSeries) return;

    const handlePointerDown = (event: PointerEvent) => {
      // TV-30.1c: Ignore events from overlay UI (FloatingToolbar, modals, etc.)
      // See ADR comment on isEventFromOverlayUI() for explanation of native vs React event handling
      if (isEventFromOverlayUI(event.target)) {
        return; // Let overlay UI handle this event via React's synthetic events
      }
      
      if (spacePanRef.current) {
        spaceDraggingRef.current = true;
        callbacksRef.current.updateCursor?.(CURSORS.grabbing);
        return; // allow LW to handle pan
      }
      const point = callbacksRef.current.computePoint?.(event);
      if (!point) {
        return;
      }
      pointerOrigin.current = point;
      
      // Handle multi-click tool phase advancement (channel: 3-click)
      const state = pointerState.current;
      if (state.mode === "drawing" && state.kind === "channel" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "channel") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (baseline end), start defining p3
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "channel", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (pitchfork: 3-click)
      if (state.mode === "drawing" && state.kind === "pitchfork" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "pitchfork") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (left tine), start defining p3
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "pitchfork", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (right tine) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (schiffPitchfork/modifiedSchiffPitchfork: 3-click)
      if (state.mode === "drawing" && (state.kind === "schiffPitchfork" || state.kind === "modifiedSchiffPitchfork") && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || (drawing.kind !== "schiffPitchfork" && drawing.kind !== "modifiedSchiffPitchfork")) {
          return;
        }
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (left tine), start defining p3
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: drawing.kind, phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (right tine) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (flatTopChannel/flatBottomChannel: 3-click)
      if (state.mode === "drawing" && (state.kind === "flatTopChannel" || state.kind === "flatBottomChannel") && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || (drawing.kind !== "flatTopChannel" && drawing.kind !== "flatBottomChannel")) return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (trend baseline end), start defining p3 (flat level)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: drawing.kind, phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (flat level) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (longPosition: 3-click)
      if (state.mode === "drawing" && state.kind === "longPosition" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "longPosition") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (stop loss), start defining p3 (target)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "longPosition", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (target) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (shortPosition: 3-click)
      if (state.mode === "drawing" && state.kind === "shortPosition" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "shortPosition") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (stop loss), start defining p3 (target)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "shortPosition", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (target) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (abcd: 3-click, D is computed)
      if (state.mode === "drawing" && state.kind === "abcd" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "abcd") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock B (p2), start defining C (p3), D is computed
          const updatedDrawing: Drawing = {
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          // Compute D with the current k (computeD is imported at top)
          const result = computeD(drawing.p1, updatedDrawing.p2, updatedDrawing.p3, drawing.k ?? 1.0);
          (updatedDrawing as ABCDPattern).p4 = result.d;
          
          callbacksRef.current.pushDraft?.(updatedDrawing, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "abcd", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock C (p3), compute final D, and commit
          const result = computeD(drawing.p1, drawing.p2, 
            { timeMs: point.timeMs, price: point.price }, 
            drawing.k ?? 1.0
          );
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            p4: result.d,
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (headAndShoulders: 5-click)
      if (state.mode === "drawing" && state.kind === "headAndShoulders" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "headAndShoulders") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock Head (p2), start defining RS (p3)
          const newDrawing = {
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.pushDraft?.(newDrawing, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "headAndShoulders", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→3: Lock RS (p3), start defining NL1 (p4)
          const newDrawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.pushDraft?.(newDrawing, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "headAndShoulders", phase: 3 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 3) {
          // Phase 3→4: Lock NL1 (p4), start defining NL2 (p5)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p4: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "headAndShoulders", phase: 4 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 4) {
          // Phase 4→commit: Lock NL2 (p5), compute inverse, and commit
          const p5 = { timeMs: point.timeMs, price: point.price };
          // Determine if pattern is inverse (bullish) - head lower than shoulders
          const isInverse = isPatternInverse(drawing.p1, drawing.p2, drawing.p3);
          const finalDrawing: Drawing = {
            ...drawing,
            p5,
            inverse: isInverse,
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (elliottWave: 6-click)
      if (state.mode === "drawing" && state.kind === "elliottWave" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "elliottWave") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock Wave 1 (p1), start defining Wave 2 (p2)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p1: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "elliottWave", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→3: Lock Wave 2 (p2), start defining Wave 3 (p3)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "elliottWave", phase: 3 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 3) {
          // Phase 3→4: Lock Wave 3 (p3), start defining Wave 4 (p4)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "elliottWave", phase: 4 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 4) {
          // Phase 4→5: Lock Wave 4 (p4), start defining Wave 5 (p5)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p4: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "elliottWave", phase: 5 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 5) {
          // Phase 5→commit: Lock Wave 5 (p5), compute direction, and commit
          const p5 = { timeMs: point.timeMs, price: point.price };
          // Determine if pattern is bullish (p1 > p0) or bearish (p1 < p0)
          const direction = getImpulseDirection(drawing.p0, drawing.p1);
          const finalDrawing: Drawing = {
            ...drawing,
            p5,
            direction,
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (triangle: 3-click)
      if (state.mode === "drawing" && state.kind === "triangle" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "triangle") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (second vertex), start defining p3
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "triangle", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (third vertex) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      // Handle multi-click tool phase advancement (fibExtension: 3-click)
      if (state.mode === "drawing" && state.kind === "fibExtension" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "fibExtension") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (impulse end), start defining p3 (retracement anchor)
          callbacksRef.current.pushDraft?.({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "fibExtension", phase: 2 };
          callbacksRef.current.requestRender?.();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (retracement anchor) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          callbacksRef.current.onUpsert?.(finalDrawing, { select: true });
          callbacksRef.current.resetPointerSession?.();
          callbacksRef.current.setTool?.("select");
        }
        return;
      }
      
      const hit = callbacksRef.current.hitTest?.(point) ?? null;
      if (callbacksRef.current.tool === "select") {
        callbacksRef.current.handleSelection?.(point, event, hit);
      } else if (hit && !event.shiftKey) {
        callbacksRef.current.handleSelection?.(point, event, hit);
      } else {
        // Starting a draw session: prevent LW from panning
        event.preventDefault();
        callbacksRef.current.beginDrawing?.(point);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerState.current.mode === "idle") return;
      const point = callbacksRef.current.computePoint?.(event);
      if (!point) return;
      callbacksRef.current.updateDrawing?.(point, event);
    };

    const handlePointerUp = () => {
      if (spaceDraggingRef.current) {
        spaceDraggingRef.current = false;
        if (spacePanRef.current) callbacksRef.current.updateCursor?.(CURSORS.grab);
        return;
      }
      // Don't reset session for multi-click tools in progress (channel/pitchfork 3-click workflow)
      const state = pointerState.current;
      if (state.mode === "drawing" && state.kind === "channel" && state.phase) {
        // Channel is in multi-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && state.kind === "pitchfork" && state.phase) {
        // Pitchfork is in multi-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && (state.kind === "schiffPitchfork" || state.kind === "modifiedSchiffPitchfork") && state.phase) {
        // Schiff pitchfork is in multi-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && (state.kind === "flatTopChannel" || state.kind === "flatBottomChannel") && state.phase) {
        // Flat channel is in multi-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && state.kind === "longPosition" && state.phase) {
        // Long position is in multi-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && state.kind === "shortPosition" && state.phase) {
        // Short position is in multi-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && state.kind === "triangle" && state.phase) {
        // Triangle is in multi-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && state.kind === "fibExtension" && state.phase) {
        // Fib Extension is in 3-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && state.kind === "abcd" && state.phase) {
        // ABCD is in 3-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && state.kind === "headAndShoulders" && state.phase) {
        // H&S is in 5-click workflow - don't reset
        return;
      }
      if (state.mode === "drawing" && state.kind === "elliottWave" && state.phase) {
        // Elliott Wave is in 6-click workflow - don't reset
        return;
      }
      if (pendingCommitRef.current && activeDraftRef.current) {
        const commitDrawing = activeDraftRef.current;
        callbacksRef.current.onUpsert?.(commitDrawing, { select: true });
        // TV-26: Open text modal for callout after placement
        if (commitDrawing.kind === "callout") {
          callbacksRef.current.onTextCreated?.(commitDrawing.id);
        }
      }
      callbacksRef.current.resetPointerSession?.();
    };

    const handleWheel = (event: WheelEvent) => {
      // Allow LW zooming unless actively drawing/dragging
      if (pointerState.current.mode !== "idle") {
        event.preventDefault();
      }
    };

    const handleHover = (event: PointerEvent) => {
      // ADR: Skip overlay UI events - let React handle them
      if (isEventFromOverlayUI(event.target)) return;
      if (pointerState.current.mode !== "idle") return;
      if (spacePanRef.current) {
        callbacksRef.current.updateCursor?.(CURSORS.grab);
        return;
      }
      const point = callbacksRef.current.computePoint?.(event);
      if (!point) {
        callbacksRef.current.applyCursorForHit?.(null, false);
        return;
      }
      const hit = callbacksRef.current.hitTest?.(point) ?? null;
      callbacksRef.current.applyCursorForHit?.(hit, false);
    };

    const handlePointerLeave = () => {
      if (pointerState.current.mode !== "idle") return;
      callbacksRef.current.applyCursorForHit?.(null, false);
    };

    // TV-20.4: Double-click on text = edit
    // TV-26: Double-click on callout = edit text
    // TV-27: Double-click on note = edit text
    const handleDoubleClick = (event: MouseEvent) => {
      // ADR: Skip overlay UI events - let React handle them
      if (isEventFromOverlayUI(event.target)) return;
      const point = callbacksRef.current.computePoint?.(event as unknown as PointerEvent);
      if (!point) return;
      const hit = callbacksRef.current.hitTest?.(point) ?? null;
      if ((hit?.drawing.kind === "text" || hit?.drawing.kind === "callout" || hit?.drawing.kind === "note")) {
        event.preventDefault();
        callbacksRef.current.onTextEdit?.(hit.drawing.id);
      }
    };

    if (import.meta.env.DEV) console.log("[DL:useEffect pointerHandlers] attaching handlers, targetEl:", targetEl?.className);
    targetEl.addEventListener("pointerdown", handlePointerDown);
    targetEl.addEventListener("pointermove", handleHover);
    targetEl.addEventListener("pointerleave", handlePointerLeave);
    targetEl.addEventListener("dblclick", handleDoubleClick);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    targetEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      if (import.meta.env.DEV) console.log("[DL:useEffect pointerHandlers] CLEANUP - detaching handlers");
      targetEl.removeEventListener("pointerdown", handlePointerDown);
      targetEl.removeEventListener("pointermove", handleHover);
      targetEl.removeEventListener("pointerleave", handlePointerLeave);
      targetEl.removeEventListener("dblclick", handleDoubleClick);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      targetEl.removeEventListener("wheel", handleWheel);
    };
    // Dependencies: Only truly stable refs and primitives
    // Callbacks are accessed via callbacksRef.current to avoid re-running on every change
  }, [
    candleSeries,
    chart,
    containerRef,
  ]);

  return null;
}

function drawHLine(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "hline" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "hline") return;
  // TV-30.1b: Draw selection glow first (behind), then base stroke on top
  if (selected) {
    drawSelectionGlow(ctx, geometry.segment.path, colors);
  }
  applyBaseStroke(ctx, drawing, colors.line);
  ctx.stroke(geometry.segment.path);
}

function drawVLine(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "vline" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "vline") return;
  // TV-30.1b: Draw selection glow first (behind), then base stroke on top
  if (selected) {
    drawSelectionGlow(ctx, geometry.segment.path, colors);
  }
  applyBaseStroke(ctx, drawing, colors.line);
  ctx.stroke(geometry.segment.path);
}

function drawTrend(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "trend" }>,
  tf: Tf,
  selected: boolean,
  width: number,
  height: number,
  colors: OverlayColors,
) {
  if (drawing.kind !== "trend") return;
  const coords = geometry.segment;
  // TV-30.1b: Draw selection glow first (behind), then base stroke on top
  if (selected) {
    drawSelectionGlowLine(ctx, coords.x1, coords.y1, coords.x2, coords.y2, colors);
  }
  applyBaseStroke(ctx, drawing, colors.line);
  ctx.beginPath();
  ctx.moveTo(coords.x1, coords.y1);
  ctx.lineTo(coords.x2, coords.y2);
  ctx.stroke();
  if (drawing.showSlope) {
    const label = describeTrend(drawing, tf).label;
    const midX = clamp((coords.x1 + coords.x2) / 2, 8, width - 8);
    const midY = clamp((coords.y1 + coords.y2) / 2 - 18, 8, height - 18);
    ctx.font = "11px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const paddingX = 8;
    const boxHeight = 18;
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + paddingX * 2;
    const boxX = midX - boxWidth / 2;
    const boxY = midY - boxHeight / 2;
    ctx.fillStyle = colors.labelBg;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.fillStyle = colors.labelText;
    ctx.fillText(label, midX, midY);
  }
  if (selected) {
    drawHandleCircle(ctx, coords.x1, coords.y1, colors);
    drawHandleCircle(ctx, coords.x2, coords.y2, colors);
  }
}

function drawRay(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "ray" }>,
  tf: Tf,
  selected: boolean,
  width: number,
  height: number,
  colors: OverlayColors,
) {
  if (drawing.kind !== "ray") return;
  const { segment, extendedSegment } = geometry;
  // TV-30.1b: Draw selection glow first (behind), then base stroke on top
  if (selected) {
    drawSelectionGlowLine(ctx, extendedSegment.x1, extendedSegment.y1, extendedSegment.x2, extendedSegment.y2, colors);
  }
  applyBaseStroke(ctx, drawing, colors.line);
  // Draw the extended ray (from p1 through p2 to canvas edge)
  ctx.beginPath();
  ctx.moveTo(extendedSegment.x1, extendedSegment.y1);
  ctx.lineTo(extendedSegment.x2, extendedSegment.y2);
  ctx.stroke();
  if (drawing.showSlope) {
    const label = describeTrend(drawing, tf).label;
    const midX = clamp((segment.x1 + segment.x2) / 2, 8, width - 8);
    const midY = clamp((segment.y1 + segment.y2) / 2 - 18, 8, height - 18);
    ctx.font = "11px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const paddingX = 8;
    const boxHeight = 18;
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + paddingX * 2;
    const boxX = midX - boxWidth / 2;
    const boxY = midY - boxHeight / 2;
    ctx.fillStyle = colors.labelBg;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.fillStyle = colors.labelText;
    ctx.fillText(label, midX, midY);
  }
  if (selected) {
    drawHandleCircle(ctx, segment.x1, segment.y1, colors);
    drawHandleCircle(ctx, segment.x2, segment.y2, colors);
  }
}

function drawExtendedLine(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "extendedLine" }>,
  tf: Tf,
  selected: boolean,
  width: number,
  height: number,
  colors: OverlayColors,
) {
  if (drawing.kind !== "extendedLine") return;
  const { segment, extendedSegment } = geometry;
  // TV-30.1b: Draw selection glow first (behind), then base stroke on top
  if (selected) {
    drawSelectionGlowLine(ctx, extendedSegment.x1, extendedSegment.y1, extendedSegment.x2, extendedSegment.y2, colors);
  }
  applyBaseStroke(ctx, drawing, colors.line);
  // Draw the fully extended line (both directions to canvas edges)
  ctx.beginPath();
  ctx.moveTo(extendedSegment.x1, extendedSegment.y1);
  ctx.lineTo(extendedSegment.x2, extendedSegment.y2);
  ctx.stroke();
  if (drawing.showSlope) {
    const label = describeTrend(drawing, tf).label;
    const midX = clamp((segment.x1 + segment.x2) / 2, 8, width - 8);
    const midY = clamp((segment.y1 + segment.y2) / 2 - 18, 8, height - 18);
    ctx.font = "11px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const paddingX = 8;
    const boxHeight = 18;
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + paddingX * 2;
    const boxX = midX - boxWidth / 2;
    const boxY = midY - boxHeight / 2;
    ctx.fillStyle = colors.labelBg;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.fillStyle = colors.labelText;
    ctx.fillText(label, midX, midY);
  }
  if (selected) {
    drawHandleCircle(ctx, segment.x1, segment.y1, colors);
    drawHandleCircle(ctx, segment.x2, segment.y2, colors);
  }
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "channel" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "channel") return;
  
  const { baseline, parallel, midline, p3 } = geometry;
  const stroke = drawing.style?.color || colors.line;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, baseline.path, colors);
    drawSelectionGlow(ctx, parallel.path, colors);
  }
  
  // Draw baseline with user style
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.setLineDash(dash);
  ctx.stroke(baseline.path);
  
  // Draw parallel line with user style
  ctx.stroke(parallel.path);
  
  // Draw midline (always dashed, subtle - this is intentional structural dash, not user style)
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = baseWidth * 0.6;
  ctx.globalAlpha = 0.5;
  ctx.stroke(midline.path);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  
  // Draw handles when selected
  if (selected) {
    // p1 and p2 handles on baseline
    drawHandleCircle(ctx, baseline.x1, baseline.y1, colors);
    drawHandleCircle(ctx, baseline.x2, baseline.y2, colors);
    // p3 handle for offset
    drawHandleCircle(ctx, p3.x, p3.y, colors);
  }
}

function drawPitchfork(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "pitchfork" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "pitchfork") return;
  
  const { median, leftTine, rightTine, p1, p2, p3 } = geometry;
  const stroke = drawing.style?.color || colors.pitchfork;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, median.path, colors);
    drawSelectionGlow(ctx, leftTine.path, colors);
    drawSelectionGlow(ctx, rightTine.path, colors);
  }
  
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.setLineDash(dash);
  
  // Draw median line
  ctx.stroke(median.path);
  
  // Draw left tine
  ctx.stroke(leftTine.path);
  
  // Draw right tine
  ctx.stroke(rightTine.path);
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, p1.x, p1.y, colors);
    drawHandleCircle(ctx, p2.x, p2.y, colors);
    drawHandleCircle(ctx, p3.x, p3.y, colors);
  }
}

function drawSchiffPitchfork(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "schiffPitchfork" | "modifiedSchiffPitchfork" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "schiffPitchfork" && drawing.kind !== "modifiedSchiffPitchfork") return;
  
  const { median, leftTine, rightTine, p1, p2, p3, shiftedP1 } = geometry;
  const colorKey = drawing.kind === "schiffPitchfork" ? "schiffPitchfork" : "modifiedSchiffPitchfork";
  const stroke = drawing.style?.color || colors[colorKey];
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, median.path, colors);
    drawSelectionGlow(ctx, leftTine.path, colors);
    drawSelectionGlow(ctx, rightTine.path, colors);
  }
  
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.setLineDash(dash);
  
  // Draw median line - starts from shifted p1
  ctx.stroke(median.path);
  
  // Draw left tine
  ctx.stroke(leftTine.path);
  
  // Draw right tine
  ctx.stroke(rightTine.path);
  
  // Draw handles when selected
  if (selected) {
    // Show original p1 handle (user drags this)
    drawHandleCircle(ctx, p1.x, p1.y, colors);
    drawHandleCircle(ctx, p2.x, p2.y, colors);
    drawHandleCircle(ctx, p3.x, p3.y, colors);
    // Optionally show shifted p1 as smaller indicator
    ctx.fillStyle = colors.selection;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(shiftedP1.x, shiftedP1.y, HANDLE_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawFlatChannel(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "flatTopChannel" | "flatBottomChannel" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "flatTopChannel" && drawing.kind !== "flatBottomChannel") return;
  
  const { trendLine, flatLine, midline, p1, p2, p3 } = geometry;
  const stroke = drawing.style?.color || colors.line;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, trendLine.path, colors);
    drawSelectionGlow(ctx, flatLine.path, colors);
  }
  
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.setLineDash(dash);
  
  // Draw trend line
  ctx.stroke(trendLine.path);
  
  // Draw flat line
  ctx.stroke(flatLine.path);
  
  // Draw midline (always dashed, subtle - intentional structural dash)
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = baseWidth * 0.6;
  ctx.globalAlpha = 0.5;
  ctx.stroke(midline.path);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  
  // Draw handles when selected
  if (selected) {
    // p1 and p2 handles on trend line
    drawHandleCircle(ctx, p1.x, p1.y, colors);
    drawHandleCircle(ctx, p2.x, p2.y, colors);
    // p3 handle for flat level
    drawHandleCircle(ctx, p3.x, p3.y, colors);
  }
}

function drawRegressionTrend(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "regressionTrend" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "regressionTrend") return;
  
  const { midline, upperBand, lowerBand } = geometry;
  const stroke = drawing.style?.color || COLORS.regressionTrend;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, midline.path, colors);
    drawSelectionGlow(ctx, upperBand.path, colors);
    drawSelectionGlow(ctx, lowerBand.path, colors);
  }
  
  ctx.setLineDash(dash);
  
  // Draw midline (full opacity)
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.stroke(midline.path);
  
  // Draw upper and lower bands (0.7 opacity)
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = baseWidth * 0.8;
  ctx.stroke(upperBand.path);
  ctx.stroke(lowerBand.path);
  ctx.globalAlpha = 1;
  
  // Draw handles when selected (at midline endpoints = p1 and p2)
  if (selected) {
    drawHandleCircle(ctx, midline.x1, midline.y1, colors);
    drawHandleCircle(ctx, midline.x2, midline.y2, colors);
  }
}

function drawLongPosition(
  ctx: CanvasRenderingContext2D,
  drawing: LongPosition,
  geometry: Extract<DrawingGeometry, { kind: "longPosition" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { entry, stop, target, riskPrice, rewardPrice, riskPercent, rewardPercent, ratio } = geometry;
  const baseColor = drawing.style?.color || COLORS.longPosition;
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  
  // Compute zone bounds
  const minX = Math.min(entry.x, stop.x, target.x) - 30;
  const maxX = Math.max(entry.x, stop.x, target.x) + 100;
  const zoneWidth = maxX - minX;
  
  // Draw profit zone (entry to target) - green with fill
  const profitTop = Math.min(entry.y, target.y);
  const profitBottom = Math.max(entry.y, target.y);
  const profitHeight = profitBottom - profitTop;
  
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#22c55e"; // green
  ctx.fillRect(minX, profitTop, zoneWidth, profitHeight);
  ctx.restore();
  
  // Draw risk zone (entry to stop) - red with fill
  const riskTop = Math.min(entry.y, stop.y);
  const riskBottom = Math.max(entry.y, stop.y);
  const riskHeight = riskBottom - riskTop;
  
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#ef4444"; // red
  ctx.fillRect(minX, riskTop, zoneWidth, riskHeight);
  ctx.restore();
  
  ctx.setLineDash([]);
  
  // Draw horizontal lines at each level
  // Entry line (neutral color)
  ctx.strokeStyle = selected ? colors.selection : baseColor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(minX, entry.y);
  ctx.lineTo(maxX, entry.y);
  ctx.stroke();
  
  // Stop line (red)
  ctx.strokeStyle = selected ? colors.selection : "#ef4444";
  ctx.beginPath();
  ctx.moveTo(minX, stop.y);
  ctx.lineTo(maxX, stop.y);
  ctx.stroke();
  
  // Target line (green)
  ctx.strokeStyle = selected ? colors.selection : "#22c55e";
  ctx.beginPath();
  ctx.moveTo(minX, target.y);
  ctx.lineTo(maxX, target.y);
  ctx.stroke();
  
  // Draw labels
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "middle";
  
  const labelX = maxX + 5;
  
  // Entry label
  ctx.fillStyle = colors.text;
  ctx.textAlign = "left";
  ctx.fillText(`Entry`, labelX, entry.y);
  
  // Stop label with risk info
  ctx.fillStyle = "#ef4444";
  ctx.fillText(`Stop (−${riskPrice.toFixed(2)}, −${riskPercent.toFixed(1)}%)`, labelX, stop.y);
  
  // Target label with reward info
  ctx.fillStyle = "#22c55e";
  ctx.fillText(`Target (+${rewardPrice.toFixed(2)}, +${rewardPercent.toFixed(1)}%)`, labelX, target.y);
  
  // Draw R:R ratio in the middle
  const midY = (entry.y + target.y) / 2;
  ctx.fillStyle = colors.text;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`R:R ${ratio.toFixed(2)}`, labelX, midY);
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, entry.x, entry.y, colors);
    drawHandleCircle(ctx, stop.x, stop.y, colors);
    drawHandleCircle(ctx, target.x, target.y, colors);
  }
}

function drawShortPosition(
  ctx: CanvasRenderingContext2D,
  drawing: ShortPosition,
  geometry: Extract<DrawingGeometry, { kind: "shortPosition" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { entry, stop, target, riskPrice, rewardPrice, riskPercent, rewardPercent, ratio } = geometry;
  const baseColor = drawing.style?.color || COLORS.shortPosition;
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  
  // Compute zone bounds
  const minX = Math.min(entry.x, stop.x, target.x) - 30;
  const maxX = Math.max(entry.x, stop.x, target.x) + 100;
  const zoneWidth = maxX - minX;
  
  // Draw profit zone (entry to target) - green with fill (target below entry for short)
  const profitTop = Math.min(entry.y, target.y);
  const profitBottom = Math.max(entry.y, target.y);
  const profitHeight = profitBottom - profitTop;
  
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#22c55e"; // green (profit)
  ctx.fillRect(minX, profitTop, zoneWidth, profitHeight);
  ctx.restore();
  
  // Draw risk zone (entry to stop) - red with fill (stop above entry for short)
  const riskTop = Math.min(entry.y, stop.y);
  const riskBottom = Math.max(entry.y, stop.y);
  const riskHeight = riskBottom - riskTop;
  
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#ef4444"; // red (risk)
  ctx.fillRect(minX, riskTop, zoneWidth, riskHeight);
  ctx.restore();
  
  ctx.setLineDash([]);
  
  // Draw horizontal lines at each level
  // Entry line (neutral color)
  ctx.strokeStyle = selected ? colors.selection : baseColor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(minX, entry.y);
  ctx.lineTo(maxX, entry.y);
  ctx.stroke();
  
  // Stop line (red - above entry for short)
  ctx.strokeStyle = selected ? colors.selection : "#ef4444";
  ctx.beginPath();
  ctx.moveTo(minX, stop.y);
  ctx.lineTo(maxX, stop.y);
  ctx.stroke();
  
  // Target line (green - below entry for short)
  ctx.strokeStyle = selected ? colors.selection : "#22c55e";
  ctx.beginPath();
  ctx.moveTo(minX, target.y);
  ctx.lineTo(maxX, target.y);
  ctx.stroke();
  
  // Draw labels
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "middle";
  
  const labelX = maxX + 5;
  
  // Entry label
  ctx.fillStyle = colors.text;
  ctx.textAlign = "left";
  ctx.fillText(`Entry (Short)`, labelX, entry.y);
  
  // Stop label with risk info
  ctx.fillStyle = "#ef4444";
  ctx.fillText(`Stop (−${riskPrice.toFixed(2)}, −${riskPercent.toFixed(1)}%)`, labelX, stop.y);
  
  // Target label with reward info
  ctx.fillStyle = "#22c55e";
  ctx.fillText(`Target (+${rewardPrice.toFixed(2)}, +${rewardPercent.toFixed(1)}%)`, labelX, target.y);
  
  // Draw R:R ratio in the middle
  const midY = (entry.y + target.y) / 2;
  ctx.fillStyle = colors.text;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`R:R ${ratio.toFixed(2)}`, labelX, midY);
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, entry.x, entry.y, colors);
    drawHandleCircle(ctx, stop.x, stop.y, colors);
    drawHandleCircle(ctx, target.x, target.y, colors);
  }
}

function drawABCD(
  ctx: CanvasRenderingContext2D,
  drawing: ABCDPattern,
  geometry: Extract<DrawingGeometry, { kind: "abcd" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { p1, p2, p3, p4, segmentAB, segmentBC, segmentCD, k, isBullish } = geometry;
  const baseColor = drawing.style?.color || COLORS.abcd;
  const lineWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, segmentAB.path, colors);
    drawSelectionGlow(ctx, segmentBC.path, colors);
    drawSelectionGlow(ctx, segmentCD.path, colors);
  }
  
  ctx.strokeStyle = baseColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  
  // Draw the three segments: A→B, B→C, C→D
  ctx.stroke(segmentAB.path);
  ctx.stroke(segmentBC.path);
  ctx.stroke(segmentCD.path);
  
  ctx.setLineDash([]);
  
  // Draw point labels (A, B, C, D)
  const fontSize = 11;
  ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = baseColor;
  
  // Position labels slightly offset from points
  const labelOffset = 12;
  
  // A label - offset based on pattern direction
  const aOffsetY = isBullish ? labelOffset : -labelOffset;
  ctx.fillText("A", p1.x, p1.y + aOffsetY);
  
  // B label - opposite side of A
  const bOffsetY = isBullish ? -labelOffset : labelOffset;
  ctx.fillText("B", p2.x, p2.y + bOffsetY);
  
  // C label - same side as A
  ctx.fillText("C", p3.x, p3.y + aOffsetY);
  
  // D label - same side as B
  ctx.fillText("D", p4.x, p4.y + bOffsetY);
  
  // Draw k value near the CD segment midpoint
  const cdMidX = (p3.x + p4.x) / 2;
  const cdMidY = (p3.y + p4.y) / 2;
  ctx.font = `${fontSize - 1}px 'Inter', sans-serif`;
  ctx.fillStyle = colors.text || baseColor;
  ctx.fillText(formatK(k), cdMidX + 15, cdMidY);
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, p1.x, p1.y, colors); // A
    drawHandleCircle(ctx, p2.x, p2.y, colors); // B
    drawHandleCircle(ctx, p3.x, p3.y, colors); // C
    drawHandleCircle(ctx, p4.x, p4.y, colors); // D (draggable to change k)
  }
}

function drawHeadAndShoulders(
  ctx: CanvasRenderingContext2D,
  drawing: HeadAndShouldersPattern,
  geometry: Extract<DrawingGeometry, { kind: "headAndShoulders" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { LS, Head, RS, NL1, NL2, neckline, segmentLSHead, segmentHeadRS, isInverse, targetPrice, patternHeight } = geometry;
  const baseColor = drawing.style?.color || COLORS.headAndShoulders;
  const lineWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, segmentLSHead.path, colors);
    drawSelectionGlow(ctx, segmentHeadRS.path, colors);
    drawSelectionGlow(ctx, neckline.path, colors);
  }
  
  ctx.strokeStyle = baseColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  
  // Draw the pattern lines: LS→Head, Head→RS
  ctx.stroke(segmentLSHead.path);
  ctx.stroke(segmentHeadRS.path);
  
  // Draw neckline (dashed)
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = colors.muted || baseColor;
  ctx.stroke(neckline.path);
  ctx.restore();
  
  ctx.setLineDash([]);
  
  // Draw point labels (LS, Head, RS, NL1, NL2)
  const fontSize = 10;
  ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = baseColor;
  
  const labelOffset = 14;
  
  // Labels based on pattern type
  const peakOffset = isInverse ? labelOffset : -labelOffset;
  const neckOffset = isInverse ? -labelOffset : labelOffset;
  
  ctx.fillText("LS", LS.x, LS.y + peakOffset);
  ctx.fillText("H", Head.x, Head.y + peakOffset);
  ctx.fillText("RS", RS.x, RS.y + peakOffset);
  
  ctx.fillStyle = colors.muted || baseColor;
  ctx.fillText("NL1", NL1.x, NL1.y + neckOffset);
  ctx.fillText("NL2", NL2.x, NL2.y + neckOffset);
  
  // Draw pattern type indicator
  ctx.font = `${fontSize - 1}px 'Inter', sans-serif`;
  ctx.fillStyle = colors.text || baseColor;
  const typeLabel = isInverse ? "Inv. H&S" : "H&S";
  ctx.fillText(typeLabel, Head.x, Head.y + peakOffset * 2);
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, LS.x, LS.y, colors);
    drawHandleCircle(ctx, Head.x, Head.y, colors);
    drawHandleCircle(ctx, RS.x, RS.y, colors);
    drawHandleCircle(ctx, NL1.x, NL1.y, colors);
    drawHandleCircle(ctx, NL2.x, NL2.y, colors);
  }
}

function drawElliottWave(
  ctx: CanvasRenderingContext2D,
  drawing: ElliottWaveImpulsePattern,
  geometry: Extract<DrawingGeometry, { kind: "elliottWave" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { points, segments, direction } = geometry;
  const baseColor = drawing.style?.color || COLORS.elliottWave;
  const lineWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    for (const seg of segments) {
      drawSelectionGlow(ctx, seg.path, colors);
    }
  }
  
  ctx.strokeStyle = baseColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  
  // Draw the 5 wave segments: 0→1, 1→2, 2→3, 3→4, 4→5
  for (const seg of segments) {
    ctx.stroke(seg.path);
  }
  
  ctx.setLineDash([]);
  
  // Draw point labels (0, 1, 2, 3, 4, 5)
  const fontSize = 11;
  ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = baseColor;
  
  const labelOffset = 14;
  
  // Position labels based on direction and wave type
  // Impulse waves (1, 3, 5) are in trend direction - label opposite side
  // Corrective waves (2, 4) are against trend - label opposite side
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    // For bullish: peaks (1,3,5) above, troughs (0,2,4) below
    // For bearish: opposite
    const isImpulsePeak = i === 1 || i === 3 || i === 5;
    let offset: number;
    if (direction === "bullish") {
      offset = isImpulsePeak ? -labelOffset : labelOffset;
    } else {
      offset = isImpulsePeak ? labelOffset : -labelOffset;
    }
    // Wave 0 always at origin
    if (i === 0) {
      offset = direction === "bullish" ? labelOffset : -labelOffset;
    }
    ctx.fillText(String(i), p.x, p.y + offset);
  }
  
  // Draw direction indicator
  ctx.font = `${fontSize - 1}px 'Inter', sans-serif`;
  ctx.fillStyle = colors.muted || baseColor;
  const dirLabel = direction === "bullish" ? "↑ Impulse" : "↓ Impulse";
  // Place near wave 3 (usually highest/lowest point)
  const wave3 = points[3];
  const dirOffset = direction === "bullish" ? -labelOffset * 2 : labelOffset * 2;
  ctx.fillText(dirLabel, wave3.x, wave3.y + dirOffset);
  
  // Draw handles when selected
  if (selected) {
    for (const p of points) {
      drawHandleCircle(ctx, p.x, p.y, colors);
    }
  }
}

function drawRectangle(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "rectangle" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "rectangle") return;
  const { x, y, w, h, path } = geometry;
  const stroke = drawing.style?.color || COLORS.rectangle;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const fillColor = drawing.fillColor || COLORS.rectangle;
  const fillOpacity = drawing.fillOpacity ?? 0.10;
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, path, colors);
  }
  
  // Fill rectangle
  ctx.save();
  ctx.globalAlpha = fillOpacity;
  ctx.fillStyle = fillColor;
  ctx.fill(path);
  ctx.restore();
  
  // Stroke rectangle with user style
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.setLineDash(drawing.style?.dash || []);
  ctx.stroke(path);
  
  // Draw corner handles when selected
  if (selected) {
    drawHandleCircle(ctx, x, y, colors);
    drawHandleCircle(ctx, x + w, y, colors);
    drawHandleCircle(ctx, x, y + h, colors);
    drawHandleCircle(ctx, x + w, y + h, colors);
  }
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "circle" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "circle") return;
  const { cx, cy, radius, path } = geometry;
  const stroke = drawing.style?.color || COLORS.circle;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const fillColor = drawing.fillColor || COLORS.circle;
  const fillOpacity = drawing.fillOpacity ?? 0.10;
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, path, colors);
  }
  
  // Fill circle
  ctx.save();
  ctx.globalAlpha = fillOpacity;
  ctx.fillStyle = fillColor;
  ctx.fill(path);
  ctx.restore();
  
  // Stroke circle with user style
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.setLineDash(drawing.style?.dash || []);
  ctx.stroke(path);
  
  // Draw cardinal handles when selected (top, right, bottom, left)
  if (selected) {
    drawHandleCircle(ctx, cx, cy - radius, colors); // top
    drawHandleCircle(ctx, cx + radius, cy, colors); // right
    drawHandleCircle(ctx, cx, cy + radius, colors); // bottom
    drawHandleCircle(ctx, cx - radius, cy, colors); // left
    // Center handle
    drawHandleCircle(ctx, cx, cy, colors);
  }
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "ellipse" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "ellipse") return;
  const { cx, cy, radiusX, radiusY, path } = geometry;
  const stroke = drawing.style?.color || COLORS.ellipse;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const fillColor = drawing.fillColor || COLORS.ellipse;
  const fillOpacity = drawing.fillOpacity ?? 0.10;
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, path, colors);
  }
  
  // Fill ellipse
  ctx.save();
  ctx.globalAlpha = fillOpacity;
  ctx.fillStyle = fillColor;
  ctx.fill(path);
  ctx.restore();
  
  // Stroke ellipse with user style
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.setLineDash(drawing.style?.dash || []);
  ctx.stroke(path);
  
  // Draw cardinal handles when selected (top, right, bottom, left)
  if (selected) {
    drawHandleCircle(ctx, cx, cy - radiusY, colors); // top
    drawHandleCircle(ctx, cx + radiusX, cy, colors); // right
    drawHandleCircle(ctx, cx, cy + radiusY, colors); // bottom
    drawHandleCircle(ctx, cx - radiusX, cy, colors); // left
    // Center handle
    drawHandleCircle(ctx, cx, cy, colors);
  }
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "triangle" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "triangle") return;
  const { p1, p2, p3, centroid, path } = geometry;
  const stroke = drawing.style?.color || COLORS.triangle;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const fillColor = drawing.fillColor || COLORS.triangle;
  const fillOpacity = drawing.fillOpacity ?? 0.10;
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    drawSelectionGlow(ctx, path, colors);
  }
  
  // Fill triangle
  ctx.save();
  ctx.globalAlpha = fillOpacity;
  ctx.fillStyle = fillColor;
  ctx.fill(path);
  ctx.restore();
  
  // Stroke triangle with user style
  ctx.strokeStyle = stroke;
  ctx.lineWidth = baseWidth;
  ctx.setLineDash(drawing.style?.dash || []);
  ctx.stroke(path);
  
  // Draw vertex handles and center handle when selected
  if (selected) {
    drawHandleCircle(ctx, p1.x, p1.y, colors); // vertex 1
    drawHandleCircle(ctx, p2.x, p2.y, colors); // vertex 2
    drawHandleCircle(ctx, p3.x, p3.y, colors); // vertex 3
    drawHandleCircle(ctx, centroid.x, centroid.y, colors); // center
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "text" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "text") return;
  const { x, y, width, height, content } = geometry;
  const fontSize = drawing.fontSize ?? 12;
  const fontColor = drawing.fontColor ?? colors.text;
  const bgColor = drawing.backgroundColor;
  
  // Draw background if specified
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
  }
  
  // Draw selection highlight
  if (selected) {
    ctx.strokeStyle = colors.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x - 4, y - 4, width + 8, height + 8);
    ctx.setLineDash([]);
  }
  
  // Draw text
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = selected ? colors.selection : fontColor;
  ctx.textBaseline = "top";
  ctx.fillText(content, x, y);
  
  // Draw handle when selected
  if (selected) {
    drawHandleCircle(ctx, x, y, colors);
  }
}

/** TV-26: Callout = anchor + leader line + text box */
function drawCallout(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "callout" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "callout") return;
  const { anchor, box, textWidth, textHeight, content } = geometry;
  const color = drawing.style?.color ?? COLORS.callout;
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  const fontSize = drawing.fontSize ?? 12;
  const fontColor = drawing.fontColor ?? colors.text;
  const bgColor = drawing.backgroundColor ?? colors.labelBg;
  const borderColor = drawing.borderColor ?? color;
  
  // 1. Draw leader line from anchor to box
  ctx.strokeStyle = selected ? colors.selection : color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y);
  ctx.lineTo(box.x, box.y);
  ctx.stroke();
  
  // 2. Draw text box at box position
  const boxPadding = 4;
  const boxW = textWidth + boxPadding * 2;
  const boxH = textHeight;
  const boxLeft = box.x - boxPadding;
  const boxTop = box.y - boxH / 2;
  
  // Box background
  ctx.fillStyle = bgColor;
  ctx.fillRect(boxLeft, boxTop, boxW, boxH);
  
  // Box border
  ctx.strokeStyle = selected ? colors.selection : borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxLeft, boxTop, boxW, boxH);
  
  // 3. Draw text content
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = selected ? colors.selection : fontColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(content || "(click to edit)", box.x, box.y);
  ctx.textAlign = "left"; // reset
  
  // 4. Draw anchor handle (small circle at anchor point)
  drawHandleCircle(ctx, anchor.x, anchor.y, colors);
  
  // 5. Draw box handle when selected
  if (selected) {
    // Selection highlight around box
    ctx.strokeStyle = colors.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(boxLeft - 2, boxTop - 2, boxW + 4, boxH + 4);
    ctx.setLineDash([]);
    
    // Box handle
    drawHandleCircle(ctx, box.x + boxW - boxPadding, box.y, colors);
  }
}

/** TV-27: Note = sticky note at anchor position (no leader line) */
function drawNote(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "note" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "note") return;
  const { anchor, textWidth, textHeight, content } = geometry;
  const color = drawing.style?.color ?? COLORS.note;
  const fontSize = drawing.fontSize ?? 12;
  const fontColor = drawing.fontColor ?? "#1a1a1a"; // Dark text on yellow
  const bgColor = drawing.backgroundColor ?? COLORS.note;
  const borderColor = drawing.borderColor ?? "#d4a800"; // Darker yellow border
  
  // Box dimensions
  const boxPadding = 6;
  const boxW = textWidth + boxPadding * 2;
  const boxH = textHeight + boxPadding * 2;
  const boxLeft = anchor.x - boxPadding;
  const boxTop = anchor.y + 4; // Small offset below anchor point
  
  // 1. Draw sticky note background
  ctx.fillStyle = bgColor;
  ctx.fillRect(boxLeft, boxTop, boxW, boxH);
  
  // 2. Draw border (subtle shadow effect for sticky note look)
  ctx.strokeStyle = selected ? colors.selection : borderColor;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(boxLeft, boxTop, boxW, boxH);
  
  // 3. Draw text content
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = selected ? colors.selection : fontColor;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(content || "Note", boxLeft + boxPadding, boxTop + boxPadding);
  ctx.textAlign = "left"; // reset
  
  // 4. Draw anchor handle (small circle at anchor point)
  drawHandleCircle(ctx, anchor.x, anchor.y, colors);
  
  // 5. Selection highlight
  if (selected) {
    ctx.strokeStyle = colors.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(boxLeft - 2, boxTop - 2, boxW + 4, boxH + 4);
    ctx.setLineDash([]);
  }
}

function drawPriceRange(
  ctx: CanvasRenderingContext2D,
  drawing: PriceRange,
  geometry: Extract<DrawingGeometry, { kind: "priceRange" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { segment, deltaPrice, deltaPercent } = geometry;
  const color = drawing.style?.color ?? colors.line;
  const lineWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    ctx.save();
    ctx.strokeStyle = colors.selection;
    ctx.lineWidth = 6;
    ctx.globalAlpha = SELECTION_GLOW_ALPHA;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
    ctx.stroke();
    ctx.restore();
  }
  
  // Draw line connecting p1 and p2 with user style
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(segment.x1, segment.y1);
  ctx.lineTo(segment.x2, segment.y2);
  ctx.stroke();
  
  // Draw horizontal extension lines at both ends (TV-style measurement)
  ctx.setLineDash([]); // Extensions always solid
  const extLen = 15;
  ctx.beginPath();
  ctx.moveTo(segment.x1 - extLen, segment.y1);
  ctx.lineTo(segment.x1 + extLen, segment.y1);
  ctx.moveTo(segment.x2 - extLen, segment.y2);
  ctx.lineTo(segment.x2 + extLen, segment.y2);
  ctx.stroke();
  
  // Draw label showing Δprice and Δ%
  const sign = deltaPrice >= 0 ? "+" : "";
  const label = `${sign}${deltaPrice.toFixed(2)} (${sign}${deltaPercent.toFixed(2)}%)`;
  const labelX = (segment.x1 + segment.x2) / 2;
  const labelY = (segment.y1 + segment.y2) / 2;
  
  ctx.font = "12px sans-serif";
  const textWidth = ctx.measureText(label).width;
  const padding = 4;
  
  // Background for label
  ctx.fillStyle = colors.labelBg;
  ctx.fillRect(labelX - textWidth / 2 - padding, labelY - 8 - padding, textWidth + padding * 2, 16 + padding);
  
  // Label text
  ctx.fillStyle = deltaPrice >= 0 ? "#22c55e" : "#ef4444"; // green/red based on direction
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, labelX, labelY);
  ctx.textAlign = "left"; // reset
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, segment.x1, segment.y1, colors);
    drawHandleCircle(ctx, segment.x2, segment.y2, colors);
  }
}

function drawDateRange(
  ctx: CanvasRenderingContext2D,
  drawing: DateRange,
  geometry: Extract<DrawingGeometry, { kind: "dateRange" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { segment, deltaMs, barsCount } = geometry;
  const color = drawing.style?.color ?? colors.line;
  const lineWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // Draw horizontal line connecting p1 and p2 (same Y level, midpoint between the two)
  const midY = (segment.y1 + segment.y2) / 2;
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    ctx.save();
    ctx.strokeStyle = colors.selection;
    ctx.lineWidth = 6;
    ctx.globalAlpha = SELECTION_GLOW_ALPHA;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(segment.x1, midY);
    ctx.lineTo(segment.x2, midY);
    ctx.stroke();
    ctx.restore();
  }
  
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(segment.x1, midY);
  ctx.lineTo(segment.x2, midY);
  ctx.stroke();
  
  // Draw vertical extension lines at both ends (TV-style time measurement)
  ctx.setLineDash([]); // Extensions always solid
  const extLen = 15;
  ctx.beginPath();
  ctx.moveTo(segment.x1, midY - extLen);
  ctx.lineTo(segment.x1, midY + extLen);
  ctx.moveTo(segment.x2, midY - extLen);
  ctx.lineTo(segment.x2, midY + extLen);
  ctx.stroke();
  
  // Format time span as "Xd Yh Zm" or just relevant parts
  const formatTimeSpan = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      const remHours = hours % 24;
      return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
    } else if (hours > 0) {
      const remMins = minutes % 60;
      return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };
  
  // Draw label showing bars count and time span
  const timeSpan = formatTimeSpan(deltaMs);
  const label = `${barsCount} bars, ${timeSpan}`;
  const labelX = (segment.x1 + segment.x2) / 2;
  const labelY = midY - 20;
  
  ctx.font = "12px sans-serif";
  const textWidth = ctx.measureText(label).width;
  const padding = 4;
  
  // Background for label
  ctx.fillStyle = colors.labelBg;
  ctx.fillRect(labelX - textWidth / 2 - padding, labelY - 8 - padding, textWidth + padding * 2, 16 + padding);
  
  // Label text (cyan for time measurement)
  ctx.fillStyle = "#06b6d4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, labelX, labelY);
  ctx.textAlign = "left"; // reset
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, segment.x1, midY, colors);
    drawHandleCircle(ctx, segment.x2, midY, colors);
  }
}

function drawDateAndPriceRange(
  ctx: CanvasRenderingContext2D,
  drawing: DateAndPriceRange,
  geometry: Extract<DrawingGeometry, { kind: "dateAndPriceRange" }>,
  selected: boolean,
  colors: OverlayColors,
  _timeframe?: Tf, // For consistency with drawDateRange signature
) {
  const { segment, deltaPrice, deltaPercent, deltaMs, barsCount } = geometry;
  const color = drawing.style?.color ?? colors.line;
  const lineWidth = drawing.style?.width ?? LINE_WIDTH;
  const dash = drawing.style?.dash || [];
  
  // TV-30.1b: Draw selection glow first (behind)
  if (selected) {
    ctx.save();
    ctx.strokeStyle = colors.selection;
    ctx.lineWidth = 6;
    ctx.globalAlpha = SELECTION_GLOW_ALPHA;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
    ctx.stroke();
    ctx.restore();
  }
  
  // Draw diagonal line connecting p1 and p2 with user style
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(segment.x1, segment.y1);
  ctx.lineTo(segment.x2, segment.y2);
  ctx.stroke();
  
  // Draw extension lines at both ends (TV-style combined measurement)
  ctx.setLineDash([]); // Extensions always solid
  const extLen = 15;
  // Horizontal extensions at both Y levels
  ctx.beginPath();
  ctx.moveTo(segment.x1 - extLen, segment.y1);
  ctx.lineTo(segment.x1 + extLen, segment.y1);
  ctx.moveTo(segment.x2 - extLen, segment.y2);
  ctx.lineTo(segment.x2 + extLen, segment.y2);
  ctx.stroke();
  
  // Format time span as "Xd Yh" or relevant parts
  const formatTimeSpan = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      const remHours = hours % 24;
      return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
    } else if (hours > 0) {
      const remMins = minutes % 60;
      return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };
  
  // Draw label showing BOTH price delta AND time delta (TradingView combined measure style)
  const priceSign = deltaPrice >= 0 ? "+" : "";
  const timeSpan = formatTimeSpan(deltaMs);
  const label = `${priceSign}${deltaPrice.toFixed(2)} (${priceSign}${deltaPercent.toFixed(2)}%)  |  ${barsCount} bars, ${timeSpan}`;
  const labelX = (segment.x1 + segment.x2) / 2;
  const labelY = (segment.y1 + segment.y2) / 2 - 20;
  
  ctx.font = "12px sans-serif";
  const textWidth = ctx.measureText(label).width;
  const padding = 4;
  
  // Background for label
  ctx.fillStyle = colors.labelBg;
  ctx.fillRect(labelX - textWidth / 2 - padding, labelY - 8 - padding, textWidth + padding * 2, 16 + padding);
  
  // Label text (green/red for price, cyan separator)
  // First part: price delta (colored by direction)
  const priceLabel = `${priceSign}${deltaPrice.toFixed(2)} (${priceSign}${deltaPercent.toFixed(2)}%)`;
  const separator = "  |  ";
  const timeLabel = `${barsCount} bars, ${timeSpan}`;
  
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // Draw the combined label with mixed colors
  const priceWidth = ctx.measureText(priceLabel).width;
  const sepWidth = ctx.measureText(separator).width;
  
  const startX = labelX - textWidth / 2;
  ctx.textAlign = "left";
  
  // Price part (green/red)
  ctx.fillStyle = deltaPrice >= 0 ? "#22c55e" : "#ef4444";
  ctx.fillText(priceLabel, startX, labelY);
  
  // Separator (gray)
  ctx.fillStyle = colors.text;
  ctx.fillText(separator, startX + priceWidth, labelY);
  
  // Time part (cyan)
  ctx.fillStyle = "#06b6d4";
  ctx.fillText(timeLabel, startX + priceWidth + sepWidth, labelY);
  
  ctx.textAlign = "left"; // reset
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, segment.x1, segment.y1, colors);
    drawHandleCircle(ctx, segment.x2, segment.y2, colors);
  }
}

function drawFibRetracement(
  ctx: CanvasRenderingContext2D,
  drawing: FibRetracement,
  geometry: Extract<DrawingGeometry, { kind: "fibRetracement" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { segment, levels } = geometry;
  const color = drawing.style?.color ?? colors.line;
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  
  // Define colors for different fib levels (TradingView style)
  const levelColors: Record<number, string> = {
    0: "#787B86",      // gray for 0%
    0.236: "#F7525F",  // red
    0.382: "#F7525F",  // red
    0.5: "#787B86",    // gray for 50%
    0.618: "#22AB94",  // green (golden ratio)
    0.786: "#22AB94",  // green
    1: "#787B86",      // gray for 100%
    1.272: "#2962FF",  // blue for extension
    1.618: "#2962FF",  // blue for extension (golden ratio extension)
  };
  
  // Get the x-range for the fib tool (from p1 to p2)
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  const fibWidth = maxX - minX;
  
  // Extend lines a bit beyond the p1-p2 range (TradingView style)
  const extendLeft = 0;
  const extendRight = fibWidth * 0.5; // Extend 50% to the right
  
  ctx.setLineDash([]);
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "middle";
  
  // Draw each fib level as a horizontal line with label
  for (const level of levels) {
    if (typeof level.y !== "number" || !isFinite(level.y)) continue;
    
    const levelColor = levelColors[level.ratio] ?? color;
    const isMainLevel = [0, 0.5, 0.618, 1].includes(level.ratio);
    
    // Draw the horizontal level line
    ctx.strokeStyle = selected ? colors.selection : levelColor;
    ctx.lineWidth = isMainLevel ? lineWidth : lineWidth * 0.7;
    ctx.beginPath();
    ctx.moveTo(minX - extendLeft, level.y);
    ctx.lineTo(maxX + extendRight, level.y);
    ctx.stroke();
    
    // Draw label (ratio + price) at the right end
    const labelText = `${(level.ratio * 100).toFixed(1)}% (${level.price.toFixed(2)})`;
    ctx.textAlign = "left";
    ctx.fillStyle = levelColor;
    ctx.fillText(labelText, maxX + extendRight + 5, level.y);
  }
  
  // Draw the diagonal trend line connecting p1 and p2 (subtle)
  ctx.strokeStyle = selected ? colors.selection : color;
  ctx.lineWidth = lineWidth * 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(segment.x1, segment.y1);
  ctx.lineTo(segment.x2, segment.y2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, segment.x1, segment.y1, colors);
    drawHandleCircle(ctx, segment.x2, segment.y2, colors);
  }
  
  // Draw small markers at p1 and p2 even when not selected (subtle reference points)
  if (!selected) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(segment.x1, segment.y1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(segment.x2, segment.y2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFibExtension(
  ctx: CanvasRenderingContext2D,
  drawing: FibExtension,
  geometry: Extract<DrawingGeometry, { kind: "fibExtension" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { p1, p2, p3, levels } = geometry;
  const color = drawing.style?.color ?? colors.line;
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  
  // Define colors for different fib levels (TradingView style)
  const levelColors: Record<number, string> = {
    0: "#787B86",      // gray for 0%
    0.236: "#F7525F",  // red
    0.382: "#F7525F",  // red
    0.5: "#787B86",    // gray for 50%
    0.618: "#22AB94",  // green (golden ratio)
    0.786: "#22AB94",  // green
    1: "#787B86",      // gray for 100%
    1.272: "#2962FF",  // blue for extension
    1.618: "#2962FF",  // blue for extension (golden ratio extension)
    2: "#9C27B0",      // purple for higher extensions
    2.618: "#9C27B0",  // purple
    3.618: "#E91E63",  // pink for extreme extensions
    4.236: "#E91E63",  // pink
  };
  
  // Get x-range for level lines (from p3, extended to right)
  const minX = Math.min(p1.x, p2.x, p3.x);
  const maxX = Math.max(p1.x, p2.x, p3.x);
  const extendRight = (maxX - minX) * 0.5; // Extend 50% to the right
  
  ctx.setLineDash([]);
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "middle";
  
  // Draw each fib extension level as a horizontal line with label
  for (const level of levels) {
    if (typeof level.y !== "number" || !isFinite(level.y)) continue;
    
    const levelColor = levelColors[level.ratio] ?? color;
    const isMainLevel = [0, 0.5, 0.618, 1, 1.618].includes(level.ratio);
    
    // Draw the horizontal level line
    ctx.strokeStyle = selected ? colors.selection : levelColor;
    ctx.lineWidth = isMainLevel ? lineWidth : lineWidth * 0.7;
    ctx.beginPath();
    ctx.moveTo(p3.x, level.y);
    ctx.lineTo(maxX + extendRight, level.y);
    ctx.stroke();
    
    // Draw label (ratio + price) at the right end
    const labelText = `${(level.ratio * 100).toFixed(1)}% (${level.price.toFixed(2)})`;
    ctx.textAlign = "left";
    ctx.fillStyle = levelColor;
    ctx.fillText(labelText, maxX + extendRight + 5, level.y);
  }
  
  // Draw connecting lines p1→p2 and p2→p3 (dashed)
  ctx.strokeStyle = selected ? colors.selection : color;
  ctx.lineWidth = lineWidth * 0.5;
  ctx.setLineDash([4, 4]);
  
  // p1 → p2 (impulse)
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  
  // p2 → p3 (retracement)
  ctx.beginPath();
  ctx.moveTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.stroke();
  
  ctx.setLineDash([]);
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, p1.x, p1.y, colors);
    drawHandleCircle(ctx, p2.x, p2.y, colors);
    drawHandleCircle(ctx, p3.x, p3.y, colors);
  }
  
  // Draw small markers at p1, p2, p3 even when not selected
  if (!selected) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p3.x, p3.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFibFan(
  ctx: CanvasRenderingContext2D,
  drawing: FibFan,
  geometry: Extract<DrawingGeometry, { kind: "fibFan" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { p1, p2, rays } = geometry;
  const color = drawing.style?.color ?? colors.line;
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  
  // Define colors for different fib ratios
  const rayColors: Record<number, string> = {
    0.236: "#F7525F",  // red
    0.382: "#F7525F",  // red
    0.5: "#787B86",    // gray
    0.618: "#22AB94",  // green (golden ratio)
    0.786: "#22AB94",  // green
  };
  
  ctx.setLineDash([]);
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "middle";
  
  // Draw each fan ray
  for (const ray of rays) {
    const rayColor = rayColors[ray.ratio] ?? color;
    const isGolden = ray.ratio === 0.618;
    
    ctx.strokeStyle = selected ? colors.selection : rayColor;
    ctx.lineWidth = isGolden ? lineWidth * 1.2 : lineWidth * 0.8;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(ray.endX, ray.endY);
    ctx.stroke();
    
    // Draw label near the end of the ray
    const labelX = p1.x + (ray.endX - p1.x) * 0.7;
    const labelY = p1.y + (ray.endY - p1.y) * 0.7;
    const labelText = `${(ray.ratio * 100).toFixed(1)}%`;
    ctx.fillStyle = rayColor;
    ctx.textAlign = "center";
    ctx.fillText(labelText, labelX, labelY - 10);
  }
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, p1.x, p1.y, colors);
    drawHandleCircle(ctx, p2.x, p2.y, colors);
  }
  
  // Draw small markers at p1, p2 even when not selected
  if (!selected) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface GeometryViewport {
  width: number;
  height: number;
  timeRangeKey: string;
  priceRangeKey: string;
}

interface BuildGeometryArgs {
  drawing: Drawing;
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  width: number;
  height: number;
  trends: Map<string, Trend>;
  data: NormalizedBar[];
}

function geometrySignature(drawing: Drawing, viewport: GeometryViewport) {
  const base = `${viewport.width}x${viewport.height}:${viewport.timeRangeKey}:${viewport.priceRangeKey}`;
  switch (drawing.kind) {
    case "hline":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.price}:${base}`;
    case "vline":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.timeMs}:${base}`;
    case "trend":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "ray":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "extendedLine":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "channel":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${base}`;
    case "pitchfork":
    case "schiffPitchfork":
    case "modifiedSchiffPitchfork":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${base}`;
    case "flatTopChannel":
    case "flatBottomChannel":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${base}`;
    case "rectangle":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "text":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.anchor.timeMs}:${drawing.anchor.price}:${drawing.content}:${drawing.fontSize ?? 12}:${base}`;
    case "priceRange":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "dateRange":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "dateAndPriceRange":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "fibRetracement":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "regressionTrend":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "longPosition":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${base}`;
    case "shortPosition":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${base}`;
    case "fibExtension":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${base}`;
    case "fibFan":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${base}`;
    case "abcd":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${drawing.p4.timeMs}:${drawing.p4.price}:${drawing.k}:${base}`;
    case "headAndShoulders":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${drawing.p4.timeMs}:${drawing.p4.price}:${drawing.p5.timeMs}:${drawing.p5.price}:${base}`;
    case "elliottWave":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p0.timeMs}:${drawing.p0.price}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${drawing.p4.timeMs}:${drawing.p4.price}:${drawing.p5.timeMs}:${drawing.p5.price}:${base}`;
    default:
      return base;
  }
}

function buildDrawingGeometry({
  drawing,
  chart,
  series,
  width,
  height,
  trends,
  data,
}: BuildGeometryArgs): DrawingGeometry | null {
  switch (drawing.kind) {
    case "hline": {
      const y = resolveYCoordinate(series, drawing.price, height);
      if (y == null) return null;
      const lineY = clamp(y, -height * 2, height * 2);
      return {
        kind: "hline",
        segment: createSegment(0, lineY, width, lineY),
      };
    }
    case "vline": {
      const x = coordinateFromTime(chart, drawing.timeMs, width);
      if (x == null) return null;
      const lineX = clamp(x, -width, width * 2);
      return {
        kind: "vline",
        segment: createSegment(lineX, 0, lineX, height),
      };
    }
    case "trend": {
      const coords = trendSegmentCoords(chart, series, drawing.p1, drawing.p2, width, height);
      if (!coords) return null;
      return {
        kind: "trend",
        segment: createSegment(coords.x1, coords.y1, coords.x2, coords.y2),
      };
    }
    case "ray": {
      const coords = trendSegmentCoords(chart, series, drawing.p1, drawing.p2, width, height);
      if (!coords) return null;
      const segment = createSegment(coords.x1, coords.y1, coords.x2, coords.y2);
      // Extend from p1 through p2 to canvas edge (ray direction)
      const extendedSegment = extendLineToCanvasBounds(coords, width, height, "ray");
      return {
        kind: "ray",
        segment,
        extendedSegment,
      };
    }
    case "extendedLine": {
      const coords = trendSegmentCoords(chart, series, drawing.p1, drawing.p2, width, height);
      if (!coords) return null;
      const segment = createSegment(coords.x1, coords.y1, coords.x2, coords.y2);
      // Extend both directions to canvas edges
      const extendedSegment = extendLineToCanvasBounds(coords, width, height, "extended");
      return {
        kind: "extendedLine",
        segment,
        extendedSegment,
      };
    }
    case "channel": {
      // 3-point channel: p1-p2 = baseline, p3 = offset point
      const baseCoords = trendSegmentCoords(chart, series, drawing.p1, drawing.p2, width, height);
      if (!baseCoords) return null;
      
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      if (p3x == null || p3y == null) return null;
      
      // Compute perpendicular offset from baseline to p3 in pixel space
      const dx = baseCoords.x2 - baseCoords.x1;
      const dy = baseCoords.y2 - baseCoords.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return null;
      
      // Unit normal vector (perpendicular to baseline)
      const nx = -dy / len;
      const ny = dx / len;
      
      // Distance from p3 to baseline (signed)
      const p3OffsetX = p3x - baseCoords.x1;
      const p3OffsetY = p3y - baseCoords.y1;
      const offsetDist = p3OffsetX * nx + p3OffsetY * ny;
      
      // Parallel line endpoints (offset from baseline by offsetDist)
      const parallel = {
        x1: baseCoords.x1 + nx * offsetDist,
        y1: baseCoords.y1 + ny * offsetDist,
        x2: baseCoords.x2 + nx * offsetDist,
        y2: baseCoords.y2 + ny * offsetDist,
      };
      
      // Midline endpoints (halfway between baseline and parallel)
      const midline = {
        x1: (baseCoords.x1 + parallel.x1) / 2,
        y1: (baseCoords.y1 + parallel.y1) / 2,
        x2: (baseCoords.x2 + parallel.x2) / 2,
        y2: (baseCoords.y2 + parallel.y2) / 2,
      };
      
      return {
        kind: "channel",
        baseline: createSegment(baseCoords.x1, baseCoords.y1, baseCoords.x2, baseCoords.y2),
        parallel: createSegment(parallel.x1, parallel.y1, parallel.x2, parallel.y2),
        midline: createSegment(midline.x1, midline.y1, midline.x2, midline.y2),
        p3: { x: p3x, y: p3y },
      };
    }
    case "rectangle": {
      const x1 = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const y1 = resolveYCoordinate(series, drawing.p1.price, height);
      const x2 = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const y2 = resolveYCoordinate(series, drawing.p2.price, height);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      const path = new Path2D();
      path.rect(x, y, w, h);
      return { kind: "rectangle", x, y, w, h, path };
    }
    case "circle": {
      // p1 = center, p2 = edge point that determines radius
      const cx = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const cy = resolveYCoordinate(series, drawing.p1.price, height);
      const ex = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const ey = resolveYCoordinate(series, drawing.p2.price, height);
      if (cx == null || cy == null || ex == null || ey == null) return null;
      // Radius is the distance from center to edge point
      const radius = Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2);
      const path = new Path2D();
      path.arc(cx, cy, Math.max(radius, 1), 0, 2 * Math.PI);
      return { kind: "circle", cx, cy, radius, path };
    }
    case "ellipse": {
      // p1 = center, p2 = bounding corner (determines radiusX and radiusY)
      const cx = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const cy = resolveYCoordinate(series, drawing.p1.price, height);
      const ex = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const ey = resolveYCoordinate(series, drawing.p2.price, height);
      if (cx == null || cy == null || ex == null || ey == null) return null;
      const radiusX = Math.abs(ex - cx);
      const radiusY = Math.abs(ey - cy);
      const path = new Path2D();
      path.ellipse(cx, cy, Math.max(radiusX, 1), Math.max(radiusY, 1), 0, 0, 2 * Math.PI);
      return { kind: "ellipse", cx, cy, radiusX, radiusY, path };
    }
    case "triangle": {
      // 3-point triangle: p1, p2, p3 are the vertices
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Calculate centroid (average of vertices)
      const centroidX = (p1x + p2x + p3x) / 3;
      const centroidY = (p1y + p2y + p3y) / 3;
      
      // Build triangle path
      const path = new Path2D();
      path.moveTo(p1x, p1y);
      path.lineTo(p2x, p2y);
      path.lineTo(p3x, p3y);
      path.closePath();
      
      return {
        kind: "triangle",
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
        centroid: { x: centroidX, y: centroidY },
        path,
      };
    }
    case "text": {
      const anchorX = coordinateFromTime(chart, drawing.anchor.timeMs, width);
      const anchorY = resolveYCoordinate(series, drawing.anchor.price, height);
      if (anchorX == null || anchorY == null) return null;
      const fontSize = drawing.fontSize ?? 12;
      const content = drawing.content || "Text";
      // Approximate text dimensions (more accurate would require measuring)
      const textWidth = content.length * fontSize * 0.6;
      const textHeight = fontSize * 1.2;
      return { 
        kind: "text", 
        x: anchorX, 
        y: anchorY, 
        width: textWidth, 
        height: textHeight, 
        content 
      };
    }
    case "callout": {
      // TV-26: Callout = anchor point + leader line + text box
      const anchorX = coordinateFromTime(chart, drawing.anchor.timeMs, width);
      const anchorY = resolveYCoordinate(series, drawing.anchor.price, height);
      const boxX = coordinateFromTime(chart, drawing.box.timeMs, width);
      const boxY = resolveYCoordinate(series, drawing.box.price, height);
      if (anchorX == null || anchorY == null || boxX == null || boxY == null) return null;
      const fontSize = drawing.fontSize ?? 12;
      const content = drawing.text || "";
      // Approximate text dimensions
      const textWidth = Math.max(content.length * fontSize * 0.6, 40); // minimum 40px
      const textHeight = fontSize * 1.4 + 8; // padding
      return {
        kind: "callout",
        anchor: { x: anchorX, y: anchorY },
        box: { x: boxX, y: boxY },
        textWidth,
        textHeight,
        content,
      };
    }
    case "note": {
      // TV-27: Note = sticky note at anchor position (no leader line)
      const anchorX = coordinateFromTime(chart, drawing.anchor.timeMs, width);
      const anchorY = resolveYCoordinate(series, drawing.anchor.price, height);
      if (anchorX == null || anchorY == null) return null;
      const fontSize = drawing.fontSize ?? 12;
      const content = drawing.text || "Note";
      // Approximate text dimensions
      const textWidth = Math.max(content.length * fontSize * 0.6, 50); // minimum 50px
      const textHeight = fontSize * 1.4;
      return {
        kind: "note",
        anchor: { x: anchorX, y: anchorY },
        textWidth,
        textHeight,
        content,
      };
    }
    case "priceRange": {
      const coords = trendSegmentCoords(chart, series, drawing.p1, drawing.p2, width, height);
      if (!coords) return null;
      // Compute deltas for display
      const deltaPrice = drawing.p2.price - drawing.p1.price;
      const deltaPercent = drawing.p1.price !== 0 ? (deltaPrice / drawing.p1.price) * 100 : 0;
      return {
        kind: "priceRange",
        segment: createSegment(coords.x1, coords.y1, coords.x2, coords.y2),
        deltaPrice,
        deltaPercent,
      };
    }
    case "dateRange": {
      const coords = trendSegmentCoords(chart, series, drawing.p1, drawing.p2, width, height);
      if (!coords) return null;
      // Compute time delta
      const deltaMs = Math.abs(drawing.p2.timeMs - drawing.p1.timeMs);
      // Compute bar count by getting bar indices (approximation via time range)
      // We use the visible data range to estimate bar spacing
      const timeRange = chart.timeScale().getVisibleLogicalRange();
      const visibleBars = timeRange ? Math.abs(timeRange.to - timeRange.from) : 0;
      const visibleWidth = width;
      const barSpacing = visibleBars > 0 ? visibleWidth / visibleBars : 10;
      const pixelDist = Math.abs(coords.x2 - coords.x1);
      const barsCount = barSpacing > 0 ? Math.round(pixelDist / barSpacing) : 0;
      return {
        kind: "dateRange",
        segment: createSegment(coords.x1, coords.y1, coords.x2, coords.y2),
        deltaMs,
        barsCount,
      };
    }
    case "dateAndPriceRange": {
      const coords = trendSegmentCoords(chart, series, drawing.p1, drawing.p2, width, height);
      if (!coords) return null;
      // Compute price delta (same as priceRange)
      const deltaPrice = drawing.p2.price - drawing.p1.price;
      const deltaPercent = drawing.p1.price !== 0 ? (deltaPrice / drawing.p1.price) * 100 : 0;
      // Compute time delta (same as dateRange)
      const deltaMs = Math.abs(drawing.p2.timeMs - drawing.p1.timeMs);
      const timeRange = chart.timeScale().getVisibleLogicalRange();
      const visibleBars = timeRange ? Math.abs(timeRange.to - timeRange.from) : 0;
      const visibleWidth = width;
      const barSpacing = visibleBars > 0 ? visibleWidth / visibleBars : 10;
      const pixelDist = Math.abs(coords.x2 - coords.x1);
      const barsCount = barSpacing > 0 ? Math.round(pixelDist / barSpacing) : 0;
      return {
        kind: "dateAndPriceRange",
        segment: createSegment(coords.x1, coords.y1, coords.x2, coords.y2),
        deltaPrice,
        deltaPercent,
        deltaMs,
        barsCount,
      };
    }
    case "fibRetracement": {
      const coords = trendSegmentCoords(chart, series, drawing.p1, drawing.p2, width, height);
      if (!coords) return null;
      
      // Compute fib levels based on p1 and p2 prices
      const p1Price = drawing.p1.price;
      const p2Price = drawing.p2.price;
      const priceRange = p2Price - p1Price;
      
      // Calculate price and y-position for each standard fib level
      // Levels are measured from p2 towards p1:
      // - 0% = p2 (the end of the move)
      // - 100% = p1 (the start of the move)
      // - >100% = extension beyond p1
      const levels = FIB_LEVELS.map(ratio => {
        const price = p2Price - priceRange * ratio;
        // Get y coordinate for this price level
        const y = series.priceToCoordinate(price);
        return {
          ratio,
          price,
          y: y ?? coords.y2 - (coords.y2 - coords.y1) * ratio, // Fallback if conversion fails
        };
      });
      
      return {
        kind: "fibRetracement",
        segment: createSegment(coords.x1, coords.y1, coords.x2, coords.y2),
        levels,
      };
    }
    case "fibExtension": {
      // 3-point Fibonacci Extension: p1→p2 defines impulse, p3 is retracement anchor
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Calculate price delta from impulse move (p1 → p2)
      const impulseDelta = drawing.p2.price - drawing.p1.price;
      
      // Calculate extension levels from p3 (retracement anchor)
      // Extension levels project FROM p3 in the direction of the impulse
      const levels = FIB_EXTENSION_LEVELS.map(ratio => {
        const price = drawing.p3.price + impulseDelta * ratio;
        const y = series.priceToCoordinate(price);
        return {
          ratio,
          price,
          y: y ?? p3y + (p2y - p1y) * ratio, // Fallback
        };
      });
      
      return {
        kind: "fibExtension",
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
        levels,
      };
    }
    case "fibFan": {
      // 2-point Fibonacci Fan: rays from p1 through ratio-scaled points
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      if (p1x == null || p1y == null || p2x == null || p2y == null) return null;
      
      // Price delta between p1 and p2
      const priceDelta = drawing.p2.price - drawing.p1.price;
      
      // Calculate fan rays: each ray goes from p1 through a point at p2.time with scaled price
      const rays = FIB_FAN_RATIOS.map(ratio => {
        // The ray passes through (p2.time, p1.price + priceDelta * ratio)
        const targetPrice = drawing.p1.price + priceDelta * ratio;
        const targetY = series.priceToCoordinate(targetPrice);
        const actualTargetY = targetY ?? p1y + (p2y - p1y) * ratio;
        
        // Extend the ray beyond p2 to canvas edge
        const dx = p2x - p1x;
        const dy = actualTargetY - p1y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return { ratio, endX: p2x, endY: actualTargetY };
        
        // Extend to canvas bounds using ray intersection
        const endPoint = extendRayToCanvasBounds(p1x, p1y, dx, dy, width, height);
        
        return { ratio, endX: endPoint.x, endY: endPoint.y };
      });
      
      return {
        kind: "fibFan",
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        rays,
      };
    }
    case "pitchfork": {
      // p1 = pivot (origin), p2 = left tine anchor, p3 = right tine anchor
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Midpoint of p2-p3 (the base of the pitchfork)
      const midX = (p2x + p3x) / 2;
      const midY = (p2y + p3y) / 2;
      
      // Median line direction vector (from p1 through midpoint)
      const medianDx = midX - p1x;
      const medianDy = midY - p1y;
      const medianLen = Math.sqrt(medianDx * medianDx + medianDy * medianDy);
      if (medianLen === 0) return null;
      
      // Extend lines to canvas edges using ray intersection
      const medianEnd = extendRayToCanvasBounds(p1x, p1y, medianDx, medianDy, width, height);
      const leftTineEnd = extendRayToCanvasBounds(p2x, p2y, medianDx, medianDy, width, height);
      const rightTineEnd = extendRayToCanvasBounds(p3x, p3y, medianDx, medianDy, width, height);
      
      return {
        kind: "pitchfork",
        median: createSegment(p1x, p1y, medianEnd.x, medianEnd.y),
        leftTine: createSegment(p2x, p2y, leftTineEnd.x, leftTineEnd.y),
        rightTine: createSegment(p3x, p3y, rightTineEnd.x, rightTineEnd.y),
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
      };
    }
    case "schiffPitchfork": {
      // Schiff Pitchfork: median starts from midpoint between p1 and base midpoint
      // p1 = pivot, p2 = left tine anchor, p3 = right tine anchor
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Midpoint of p2-p3 (the base of the pitchfork)
      const baseMidX = (p2x + p3x) / 2;
      const baseMidY = (p2y + p3y) / 2;
      
      // Schiff shift: p1 shifted to midpoint between original p1 and base midpoint
      const shiftedP1x = (p1x + baseMidX) / 2;
      const shiftedP1y = (p1y + baseMidY) / 2;
      
      // Median line direction vector (from shifted p1 through base midpoint)
      const medianDx = baseMidX - shiftedP1x;
      const medianDy = baseMidY - shiftedP1y;
      const medianLen = Math.sqrt(medianDx * medianDx + medianDy * medianDy);
      if (medianLen === 0) return null;
      
      // Extend lines to canvas edges using ray intersection
      const medianEnd = extendRayToCanvasBounds(shiftedP1x, shiftedP1y, medianDx, medianDy, width, height);
      const leftTineEnd = extendRayToCanvasBounds(p2x, p2y, medianDx, medianDy, width, height);
      const rightTineEnd = extendRayToCanvasBounds(p3x, p3y, medianDx, medianDy, width, height);
      
      return {
        kind: "schiffPitchfork",
        median: createSegment(shiftedP1x, shiftedP1y, medianEnd.x, medianEnd.y),
        leftTine: createSegment(p2x, p2y, leftTineEnd.x, leftTineEnd.y),
        rightTine: createSegment(p3x, p3y, rightTineEnd.x, rightTineEnd.y),
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
        shiftedP1: { x: shiftedP1x, y: shiftedP1y },
      };
    }
    case "modifiedSchiffPitchfork": {
      // Modified Schiff: p1 shifted horizontally only (X to midpoint, Y stays at p1)
      // p1 = pivot, p2 = left tine anchor, p3 = right tine anchor
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Midpoint of p2-p3 (the base of the pitchfork)
      const baseMidX = (p2x + p3x) / 2;
      const baseMidY = (p2y + p3y) / 2;
      
      // Modified Schiff shift: only X is shifted to midpoint, Y stays at p1
      const shiftedP1x = (p1x + baseMidX) / 2;
      const shiftedP1y = p1y; // Y stays at original p1
      
      // Median line direction vector (from shifted p1 through base midpoint)
      const medianDx = baseMidX - shiftedP1x;
      const medianDy = baseMidY - shiftedP1y;
      const medianLen = Math.sqrt(medianDx * medianDx + medianDy * medianDy);
      if (medianLen === 0) return null;
      
      // Extend lines to canvas edges using ray intersection
      const medianEnd = extendRayToCanvasBounds(shiftedP1x, shiftedP1y, medianDx, medianDy, width, height);
      const leftTineEnd = extendRayToCanvasBounds(p2x, p2y, medianDx, medianDy, width, height);
      const rightTineEnd = extendRayToCanvasBounds(p3x, p3y, medianDx, medianDy, width, height);
      
      return {
        kind: "modifiedSchiffPitchfork",
        median: createSegment(shiftedP1x, shiftedP1y, medianEnd.x, medianEnd.y),
        leftTine: createSegment(p2x, p2y, leftTineEnd.x, leftTineEnd.y),
        rightTine: createSegment(p3x, p3y, rightTineEnd.x, rightTineEnd.y),
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
        shiftedP1: { x: shiftedP1x, y: shiftedP1y },
      };
    }
    case "flatTopChannel":
    case "flatBottomChannel": {
      // p1-p2 = trend baseline, p3.price = flat horizontal level
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Trend line direction and extension
      const trendDx = p2x - p1x;
      const trendDy = p2y - p1y;
      const trendLen = Math.sqrt(trendDx * trendDx + trendDy * trendDy);
      if (trendLen === 0) return null;
      
      // Extend trend line to canvas edges
      const extendFactor = 10;
      const trendX1 = p1x - trendDx * extendFactor;
      const trendY1 = p1y - trendDy * extendFactor;
      const trendX2 = p2x + trendDx * extendFactor;
      const trendY2 = p2y + trendDy * extendFactor;
      
      // Flat line is horizontal at p3.y, spanning the same x-range as extended trend
      const flatY = p3y;
      const flatX1 = trendX1;
      const flatX2 = trendX2;
      
      // Midline: average y between trend line and flat line at each x
      // For simplicity, compute midline at p1 and p2 x-coordinates, then extend
      const midY1 = (p1y + flatY) / 2;
      const midY2 = (p2y + flatY) / 2;
      const midDx = p2x - p1x;
      const midDy = midY2 - midY1;
      const midX1 = p1x - midDx * extendFactor;
      const midX2 = p2x + midDx * extendFactor;
      const midYa = midY1 - midDy * extendFactor;
      const midYb = midY2 + midDy * extendFactor;
      
      return {
        kind: drawing.kind,
        trendLine: createSegment(trendX1, trendY1, trendX2, trendY2),
        flatLine: createSegment(flatX1, flatY, flatX2, flatY),
        midline: createSegment(midX1, midYa, midX2, midYb),
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
      };
    }
    case "regressionTrend": {
      // Filter bars within the time range [p1.timeMs, p2.timeMs]
      const minTime = Math.min(drawing.p1.timeMs, drawing.p2.timeMs);
      const maxTime = Math.max(drawing.p1.timeMs, drawing.p2.timeMs);
      const barsInRange = data.filter(
        (bar) => bar.timestampMs >= minTime && bar.timestampMs <= maxTime
      );
      
      // Need at least 2 bars for meaningful regression
      if (barsInRange.length < 2) return null;
      
      // Sort bars by time to ensure proper ordering
      barsInRange.sort((a, b) => a.timestampMs - b.timestampMs);
      
      const n = barsInRange.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;
      
      // For linear regression: x = index (0, 1, 2, ...), y = close price
      for (let i = 0; i < n; i++) {
        const x = i;
        const y = barsInRange[i].close;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      }
      
      // Linear regression formulas
      const denominator = n * sumX2 - sumX * sumX;
      if (denominator === 0) return null;
      
      const slope = (n * sumXY - sumX * sumY) / denominator;
      const intercept = (sumY - slope * sumX) / n;
      
      // Calculate standard deviation of residuals
      let sumResidualSq = 0;
      for (let i = 0; i < n; i++) {
        const predicted = intercept + slope * i;
        const residual = barsInRange[i].close - predicted;
        sumResidualSq += residual * residual;
      }
      const stdev = Math.sqrt(sumResidualSq / n);
      
      // Get pixel coordinates for the regression line endpoints
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      if (p1x == null || p2x == null) return null;
      
      // Calculate prices at p1 and p2 positions
      // The regression line: price = intercept + slope * index
      // We need to map from time to index position
      const startIndex = 0;
      const endIndex = n - 1;
      
      // Determine which endpoint is the start (lower time)
      const isP1Start = drawing.p1.timeMs <= drawing.p2.timeMs;
      
      // Midline prices at start and end of regression window
      const startPrice = intercept + slope * startIndex;
      const endPrice = intercept + slope * endIndex;
      
      // Upper/lower band prices (regression ± 2σ)
      const upperStartPrice = startPrice + 2 * stdev;
      const upperEndPrice = endPrice + 2 * stdev;
      const lowerStartPrice = startPrice - 2 * stdev;
      const lowerEndPrice = endPrice - 2 * stdev;
      
      // Convert prices to pixel Y coordinates
      const startY = resolveYCoordinate(series, startPrice, height);
      const endY = resolveYCoordinate(series, endPrice, height);
      const upperStartY = resolveYCoordinate(series, upperStartPrice, height);
      const upperEndY = resolveYCoordinate(series, upperEndPrice, height);
      const lowerStartY = resolveYCoordinate(series, lowerStartPrice, height);
      const lowerEndY = resolveYCoordinate(series, lowerEndPrice, height);
      
      if (startY == null || endY == null || upperStartY == null || upperEndY == null || 
          lowerStartY == null || lowerEndY == null) return null;
      
      // Assign coordinates based on which point is the start
      const midlineX1 = isP1Start ? p1x : p2x;
      const midlineX2 = isP1Start ? p2x : p1x;
      const midlineY1 = isP1Start ? startY : endY;
      const midlineY2 = isP1Start ? endY : startY;
      const upperY1 = isP1Start ? upperStartY : upperEndY;
      const upperY2 = isP1Start ? upperEndY : upperStartY;
      const lowerY1 = isP1Start ? lowerStartY : lowerEndY;
      const lowerY2 = isP1Start ? lowerEndY : lowerStartY;
      
      return {
        kind: "regressionTrend",
        midline: createSegment(midlineX1, midlineY1, midlineX2, midlineY2),
        upperBand: createSegment(midlineX1, upperY1, midlineX2, upperY2),
        lowerBand: createSegment(midlineX1, lowerY1, midlineX2, lowerY2),
        slope,
        intercept,
        stdev,
      };
    }
    case "longPosition": {
      // p1 = entry, p2 = stop loss, p3 = target
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Calculate risk and reward
      const entryPrice = drawing.p1.price;
      const stopPrice = drawing.p2.price;
      const targetPrice = drawing.p3.price;
      
      const riskPrice = Math.abs(entryPrice - stopPrice);
      const rewardPrice = Math.abs(targetPrice - entryPrice);
      const riskPercent = entryPrice !== 0 ? (riskPrice / entryPrice) * 100 : 0;
      const rewardPercent = entryPrice !== 0 ? (rewardPrice / entryPrice) * 100 : 0;
      const ratio = riskPrice > 0 ? rewardPrice / riskPrice : 0;
      
      return {
        kind: "longPosition",
        entry: { x: p1x, y: p1y },
        stop: { x: p2x, y: p2y },
        target: { x: p3x, y: p3y },
        riskPrice,
        rewardPrice,
        riskPercent,
        rewardPercent,
        ratio,
      };
    }
    case "shortPosition": {
      // p1 = entry, p2 = stop loss, p3 = target (same calculation, just different semantics)
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Calculate risk and reward
      const entryPrice = drawing.p1.price;
      const stopPrice = drawing.p2.price;
      const targetPrice = drawing.p3.price;
      
      const riskPrice = Math.abs(stopPrice - entryPrice);
      const rewardPrice = Math.abs(entryPrice - targetPrice);
      const riskPercent = entryPrice !== 0 ? (riskPrice / entryPrice) * 100 : 0;
      const rewardPercent = entryPrice !== 0 ? (rewardPrice / entryPrice) * 100 : 0;
      const ratio = riskPrice > 0 ? rewardPrice / riskPrice : 0;
      
      return {
        kind: "shortPosition",
        entry: { x: p1x, y: p1y },
        stop: { x: p2x, y: p2y },
        target: { x: p3x, y: p3y },
        riskPrice,
        rewardPrice,
        riskPercent,
        rewardPercent,
        ratio,
      };
    }
    case "abcd": {
      // ABCD Pattern: p1=A, p2=B, p3=C, p4=D (D is computed from k factor)
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null) return null;
      
      // Compute D from A, B, C and k factor using the pure util
      const k = drawing.k ?? 1.0;
      const result = computeD(
        { timeMs: drawing.p1.timeMs, price: drawing.p1.price },
        { timeMs: drawing.p2.timeMs, price: drawing.p2.price },
        { timeMs: drawing.p3.timeMs, price: drawing.p3.price },
        k
      );
      
      const p4x = coordinateFromTime(chart, result.d.timeMs, width);
      const p4y = resolveYCoordinate(series, result.d.price, height);
      if (p4x == null || p4y == null) return null;
      
      // Determine pattern direction
      const isBullish = isPatternBullish(
        { timeMs: drawing.p1.timeMs, price: drawing.p1.price },
        { timeMs: drawing.p2.timeMs, price: drawing.p2.price }
      );
      
      return {
        kind: "abcd",
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
        p4: { x: p4x, y: p4y },
        segmentAB: createSegment(p1x, p1y, p2x, p2y),
        segmentBC: createSegment(p2x, p2y, p3x, p3y),
        segmentCD: createSegment(p3x, p3y, p4x, p4y),
        k,
        isBullish,
      };
    }
    case "headAndShoulders": {
      // H&S Pattern: p1=LS, p2=Head, p3=RS, p4=NL1, p5=NL2
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      const p4x = coordinateFromTime(chart, drawing.p4.timeMs, width);
      const p4y = resolveYCoordinate(series, drawing.p4.price, height);
      const p5x = coordinateFromTime(chart, drawing.p5.timeMs, width);
      const p5y = resolveYCoordinate(series, drawing.p5.price, height);
      
      if (p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null || p4x == null || p4y == null || p5x == null || p5y == null) return null;
      
      // Compute geometry using the H&S util
      const hsGeom = computeHSGeometry(
        drawing.p1, drawing.p2, drawing.p3, drawing.p4, drawing.p5
      );
      
      return {
        kind: "headAndShoulders",
        LS: { x: p1x, y: p1y },
        Head: { x: p2x, y: p2y },
        RS: { x: p3x, y: p3y },
        NL1: { x: p4x, y: p4y },
        NL2: { x: p5x, y: p5y },
        neckline: createSegment(p4x, p4y, p5x, p5y),
        segmentLSHead: createSegment(p1x, p1y, p2x, p2y),
        segmentHeadRS: createSegment(p2x, p2y, p3x, p3y),
        isInverse: hsGeom.isInverse,
        targetPrice: hsGeom.targetPrice,
        patternHeight: hsGeom.patternHeight,
      };
    }
    case "elliottWave": {
      // Elliott Wave Impulse: p0 (origin), p1-p5 (wave ends)
      const p0x = coordinateFromTime(chart, drawing.p0.timeMs, width);
      const p0y = resolveYCoordinate(series, drawing.p0.price, height);
      const p1x = coordinateFromTime(chart, drawing.p1.timeMs, width);
      const p1y = resolveYCoordinate(series, drawing.p1.price, height);
      const p2x = coordinateFromTime(chart, drawing.p2.timeMs, width);
      const p2y = resolveYCoordinate(series, drawing.p2.price, height);
      const p3x = coordinateFromTime(chart, drawing.p3.timeMs, width);
      const p3y = resolveYCoordinate(series, drawing.p3.price, height);
      const p4x = coordinateFromTime(chart, drawing.p4.timeMs, width);
      const p4y = resolveYCoordinate(series, drawing.p4.price, height);
      const p5x = coordinateFromTime(chart, drawing.p5.timeMs, width);
      const p5y = resolveYCoordinate(series, drawing.p5.price, height);
      
      if (p0x == null || p0y == null || p1x == null || p1y == null || p2x == null || p2y == null || p3x == null || p3y == null || p4x == null || p4y == null || p5x == null || p5y == null) return null;
      
      // Compute direction: bullish if p1 > p0
      const direction: "bullish" | "bearish" = drawing.p1.price > drawing.p0.price ? "bullish" : "bearish";
      
      const points = [
        { x: p0x, y: p0y },
        { x: p1x, y: p1y },
        { x: p2x, y: p2y },
        { x: p3x, y: p3y },
        { x: p4x, y: p4y },
        { x: p5x, y: p5y },
      ];
      
      // Create segments for each wave
      const segments = [
        createSegment(p0x, p0y, p1x, p1y), // Wave 1
        createSegment(p1x, p1y, p2x, p2y), // Wave 2
        createSegment(p2x, p2y, p3x, p3y), // Wave 3
        createSegment(p3x, p3y, p4x, p4y), // Wave 4
        createSegment(p4x, p4y, p5x, p5y), // Wave 5
      ];
      
      return {
        kind: "elliottWave",
        points,
        segments,
        direction,
      };
    }
    default:
      return null;
  }
}

function createSegment(x1: number, y1: number, x2: number, y2: number): SegmentGeometry {
  const path = new Path2D();
  path.moveTo(x1, y1);
  path.lineTo(x2, y2);
  return { x1, y1, x2, y2, path };
}

/**
 * Extends a ray from a starting point in a given direction to the canvas bounds.
 * Used for pitchfork tines/median and fib fan rays that should reach canvas edges.
 * @param startX - Ray starting point X
 * @param startY - Ray starting point Y
 * @param dx - Direction vector X component
 * @param dy - Direction vector Y component
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns End point {x, y} at canvas edge, or original direction if no intersection
 */
function extendRayToCanvasBounds(
  startX: number,
  startY: number,
  dx: number,
  dy: number,
  width: number,
  height: number,
): { x: number; y: number } {
  // Handle degenerate case
  if (dx === 0 && dy === 0) {
    return { x: startX + dx, y: startY + dy };
  }
  
  // Find intersections with canvas bounds for positive t values only (ray extends forward)
  // Line parametric form: P(t) = start + t * direction, t >= 0
  const tValues: number[] = [];
  
  // Intersection with left edge (x = 0)
  if (dx !== 0) {
    const t = -startX / dx;
    if (t > 0) tValues.push(t);
  }
  
  // Intersection with right edge (x = width)
  if (dx !== 0) {
    const t = (width - startX) / dx;
    if (t > 0) tValues.push(t);
  }
  
  // Intersection with top edge (y = 0)
  if (dy !== 0) {
    const t = -startY / dy;
    if (t > 0) tValues.push(t);
  }
  
  // Intersection with bottom edge (y = height)
  if (dy !== 0) {
    const t = (height - startY) / dy;
    if (t > 0) tValues.push(t);
  }
  
  // Find valid intersections within canvas bounds
  let maxValidT = 0;
  for (const t of tValues) {
    const px = startX + t * dx;
    const py = startY + t * dy;
    // Check if intersection is within canvas bounds (with small tolerance)
    if (px >= -1 && px <= width + 1 && py >= -1 && py <= height + 1) {
      if (t > maxValidT) {
        maxValidT = t;
      }
    }
  }
  
  // Return farthest valid intersection, or fallback to large extension
  if (maxValidT > 0) {
    return { x: startX + maxValidT * dx, y: startY + maxValidT * dy };
  }
  
  // Fallback: extend by factor of 10 (shouldn't happen in normal cases)
  return { x: startX + dx * 10, y: startY + dy * 10 };
}

/**
 * Extends a line segment to the canvas bounds.
 * @param coords - Original segment endpoints {x1, y1, x2, y2}
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mode - "ray" extends from p1 through p2 to edge, "extended" extends both directions
 * @returns SegmentGeometry with endpoints extended to canvas bounds
 */
function extendLineToCanvasBounds(
  coords: { x1: number; y1: number; x2: number; y2: number },
  width: number,
  height: number,
  mode: "ray" | "extended",
): SegmentGeometry {
  const { x1, y1, x2, y2 } = coords;
  const dx = x2 - x1;
  const dy = y2 - y1;
  
  // Handle degenerate case (points are the same)
  if (dx === 0 && dy === 0) {
    return createSegment(x1, y1, x2, y2);
  }
  
  // Find intersections with canvas bounds
  // Line parametric form: P(t) = P1 + t * (P2 - P1)
  // t = 0 at P1, t = 1 at P2
  // For ray: t >= 0 (from p1 in direction of p2)
  // For extended: t can be any value (full infinite line)
  
  const tValues: number[] = [];
  
  // Intersection with left edge (x = 0)
  if (dx !== 0) {
    const t = -x1 / dx;
    tValues.push(t);
  }
  
  // Intersection with right edge (x = width)
  if (dx !== 0) {
    const t = (width - x1) / dx;
    tValues.push(t);
  }
  
  // Intersection with top edge (y = 0)
  if (dy !== 0) {
    const t = -y1 / dy;
    tValues.push(t);
  }
  
  // Intersection with bottom edge (y = height)
  if (dy !== 0) {
    const t = (height - y1) / dy;
    tValues.push(t);
  }
  
  // Filter and sort t values based on mode
  let validT: number[];
  if (mode === "ray") {
    // Ray: only t >= 0 (extends from p1 through p2)
    validT = tValues.filter(t => t >= 0);
  } else {
    // Extended: all t values (both directions)
    validT = tValues;
  }
  
  // Find the intersection points within canvas bounds
  const intersections: Array<{ t: number; x: number; y: number }> = [];
  for (const t of validT) {
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    // Check if intersection is within canvas bounds (with small tolerance)
    if (px >= -1 && px <= width + 1 && py >= -1 && py <= height + 1) {
      intersections.push({ t, x: px, y: py });
    }
  }
  
  // Sort by t parameter
  intersections.sort((a, b) => a.t - b.t);
  
  if (intersections.length === 0) {
    // No valid intersections, return original segment
    return createSegment(x1, y1, x2, y2);
  }
  
  if (mode === "ray") {
    // Ray: start from p1, extend to farthest intersection in positive direction
    const endPoint = intersections[intersections.length - 1];
    return createSegment(x1, y1, endPoint.x, endPoint.y);
  } else {
    // Extended: use the two extreme intersections
    if (intersections.length >= 2) {
      const startPoint = intersections[0];
      const endPoint = intersections[intersections.length - 1];
      return createSegment(startPoint.x, startPoint.y, endPoint.x, endPoint.y);
    } else {
      // Single intersection - extend from intersection through segment
      const point = intersections[0];
      return createSegment(point.x, point.y, x2, y2);
    }
  }
}

function drawSnapFeedbackIndicator(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  width: number,
  height: number,
  feedback: SnapFeedback | null,
  colors: OverlayColors,
) {
  if (!feedback) return false;
  const elapsed = Date.now() - feedback.startedAt;
  if (elapsed > SNAP_FEEDBACK_MS) return false;
  const x = coordinateFromTime(chart, feedback.timeMs, width);
  const y = resolveYCoordinate(series, feedback.price, height);
  if (x == null || y == null) return false;
  const alpha = clamp(1 - elapsed / SNAP_FEEDBACK_MS, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colors.selection;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return true;
}

function drawHandleCircle(ctx: CanvasRenderingContext2D, x: number, y: number, colors: OverlayColors) {
  ctx.fillStyle = colors.handleFill;
  ctx.strokeStyle = colors.handleStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

interface OverlayColors {
  line: string;
  selection: string;
  handleFill: string;
  handleStroke: string;
  labelBg: string;
  labelText: string;
}

function trendSegmentCoords(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  p1: Trend["p1"],
  p2: Trend["p2"],
  width: number,
  height: number,
) {
  const x1 = coordinateFromTime(chart, p1.timeMs, width);
  const x2 = coordinateFromTime(chart, p2.timeMs, width);
  const y1 = resolveYCoordinate(series, p1.price, height);
  const y2 = resolveYCoordinate(series, p2.price, height);
  if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
  return { x1, y1, x2, y2 };
}

function channelLineCoords(
  trend: Trend,
  offset: number,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  width: number,
  height: number,
) {
  const x1 = coordinateFromTime(chart, trend.p1.timeMs, width);
  const x2 = coordinateFromTime(chart, trend.p2.timeMs, width);
  const y1 = resolveYCoordinate(series, trend.p1.price + offset, height);
  const y2 = resolveYCoordinate(series, trend.p2.price + offset, height);
  if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
  return { x1, y1, x2, y2 };
}

function cloneDrawingState(drawing: Drawing): Drawing {
  if (drawing.kind === "trend") {
    return { ...drawing, p1: { ...drawing.p1 }, p2: { ...drawing.p2 } };
  }
  if (drawing.kind === "rectangle") {
    return { ...drawing, p1: { ...drawing.p1 }, p2: { ...drawing.p2 } };
  }
  if (drawing.kind === "channel") {
    return { ...drawing, p1: { ...drawing.p1 }, p2: { ...drawing.p2 }, p3: { ...drawing.p3 } };
  }
  if (drawing.kind === "pitchfork") {
    return { ...drawing, p1: { ...drawing.p1 }, p2: { ...drawing.p2 }, p3: { ...drawing.p3 } };
  }
  if (drawing.kind === "flatTopChannel" || drawing.kind === "flatBottomChannel") {
    return { ...drawing, p1: { ...drawing.p1 }, p2: { ...drawing.p2 }, p3: { ...drawing.p3 } };
  }
  if (drawing.kind === "regressionTrend") {
    return { ...drawing, p1: { ...drawing.p1 }, p2: { ...drawing.p2 } };
  }
  if (drawing.kind === "text") {
    return { ...drawing, anchor: { ...drawing.anchor } };
  }
  return { ...drawing };
}

function resolveYCoordinate(series: ISeriesApi<SeriesType>, price: number, height: number) {
  const coord = series.priceToCoordinate(price);
  if (coord != null) return coord;
  const topPrice = series.coordinateToPrice(0);
  const bottomPrice = series.coordinateToPrice(Math.max(height, 0));
  if (topPrice == null || bottomPrice == null) return null;
  return price >= topPrice ? 0 : height;
}

function coordinateFromTime(chart: IChartApi, tsMs: number, width: number) {
  const utc = tsMsToUtc(tsMs);
  const timeScale = chart.timeScale();
  const x = timeScale.timeToCoordinate(utc);
  if (x != null) return x;
  const range = timeScale.getVisibleRange();
  if (!range) return null;
  const from = timeToMs(range.from as UTCTimestamp | BusinessDay);
  const to = timeToMs(range.to as UTCTimestamp | BusinessDay);
  if (tsMs < from) return 0;
  if (tsMs > to) return width;
  return null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return value;
  return Math.min(Math.max(value, min), max);
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function distanceToSegment(
  x: number,
  y: number,
  segmentOrX1: SegmentGeometry | number,
  maybeY1?: number,
  maybeX2?: number,
  maybeY2?: number,
) {
  const { x1, y1, x2, y2 } =
    typeof segmentOrX1 === "object"
      ? segmentOrX1
      : { x1: segmentOrX1, y1: maybeY1 ?? 0, x2: maybeX2 ?? 0, y2: maybeY2 ?? 0 };
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;
  let xx;
  let yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  return Math.hypot(x - xx, y - yy);
}

function cursorForHandle(handle: DragHandle | null) {
  switch (handle) {
    case "hline":
    case "upper":
    case "lower":
      return CURSORS.ns;
    case "vline":
      return CURSORS.ew;
    case "p1":
    case "rect_tl":
    case "rect_br":
      return CURSORS.nwse;
    case "p2":
    case "rect_tr":
    case "rect_bl":
      return CURSORS.nesw;
    case "line":
    case "circle_center":
    case "ellipse_center":
    case "triangle_center":
      return CURSORS.grab;
    default:
      return CURSORS.crosshair;
  }
}

function valueOnTrend(trend: Trend, timeMs: number) {
  const denom = trend.p2.timeMs - trend.p1.timeMs || 1;
  const slope = (trend.p2.price - trend.p1.price) / denom;
  return trend.p1.price + slope * (timeMs - trend.p1.timeMs);
}

function snapPoint(
  timeMs: number,
  price: number,
  rows: NormalizedBar[],
  snapCloseOnly: boolean,
): { timeMs: number; price: number } {
  if (!rows.length) return { timeMs, price };
  let nearest = rows[0];
  let delta = Math.abs(rows[0].timestampMs - timeMs);
  for (const row of rows) {
    const diff = Math.abs(row.timestampMs - timeMs);
    if (diff < delta) {
      nearest = row;
      delta = diff;
    }
  }
  const level = snapCloseOnly
    ? nearest.close
    : [nearest.open, nearest.high, nearest.low, nearest.close].reduce((prev, curr) =>
        Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev,
      );
  return { timeMs: nearest.timestampMs, price: level };
}

function applyShiftConstraint(
  origin: ChartPoint,
  target: ChartPoint,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
): ChartPoint {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  let nextX = target.x;
  let nextY = target.y;
  if (absDx < absDy * 0.5) {
    nextX = origin.x;
  } else if (absDy < absDx * 0.5) {
    nextY = origin.y;
  } else {
    const max = Math.max(absDx, absDy);
    nextX = origin.x + Math.sign(dx || 1) * max;
    nextY = origin.y + Math.sign(dy || 1) * max;
  }
  const constrainedTime = chart.timeScale().coordinateToTime(nextX);
  const constrainedPrice = series.coordinateToPrice(nextY);
  if (constrainedTime == null || constrainedPrice == null) {
    return target;
  }
  const timeMs = timeToMs(constrainedTime as UTCTimestamp | BusinessDay);
  return { x: nextX, y: nextY, timeMs, price: constrainedPrice };
}

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `dr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function timeToMs(time: UTCTimestamp | BusinessDay) {
  if (typeof time === "number") return time * 1000;
  return Date.UTC(time.year, time.month - 1, time.day);
}

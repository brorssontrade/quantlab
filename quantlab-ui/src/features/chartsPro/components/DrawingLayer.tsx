import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BusinessDay, IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from "@/lib/lightweightCharts";

import type { DateAndPriceRange, DateRange, Drawing, DrawingKind, FibRetracement, NormalizedBar, PriceRange, Tf, Trend } from "../types";
import { FIB_LEVELS } from "../types";
import { describeTrend, tsMsToUtc } from "../types";
import type { Tool } from "../state/controls";
import { useOverlayCanvas } from "./overlayCanvasContext";
import type { ChartsTheme } from "../theme";

type ChartPoint = {
  x: number;
  y: number;
  timeMs: number;
  price: number;
  snapped?: boolean;
  snapOrigin?: { timeMs: number; price: number };
};

type DragHandle = "line" | "p1" | "p2" | "upper" | "lower" | "hline" | "vline" | "rect_tl" | "rect_tr" | "rect_bl" | "rect_br";

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
  | { kind: "channel"; baseline: SegmentGeometry; parallel: SegmentGeometry; midline: SegmentGeometry; p3: { x: number; y: number } }
  | { kind: "pitchfork"; median: SegmentGeometry; leftTine: SegmentGeometry; rightTine: SegmentGeometry; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }
  | { kind: "flatTopChannel"; trendLine: SegmentGeometry; flatLine: SegmentGeometry; midline: SegmentGeometry; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }
  | { kind: "flatBottomChannel"; trendLine: SegmentGeometry; flatLine: SegmentGeometry; midline: SegmentGeometry; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }
  | { kind: "rectangle"; x: number; y: number; w: number; h: number; path: Path2D }
  | { kind: "text"; x: number; y: number; width: number; height: number; content: string }
  | { kind: "priceRange"; segment: SegmentGeometry; deltaPrice: number; deltaPercent: number }
  | { kind: "dateRange"; segment: SegmentGeometry; deltaMs: number; barsCount: number }
  | { kind: "dateAndPriceRange"; segment: SegmentGeometry; deltaPrice: number; deltaPercent: number; deltaMs: number; barsCount: number }
  | { kind: "fibRetracement"; segment: SegmentGeometry; levels: Array<{ ratio: number; price: number; y: number }> };

type PointerState =
  | { mode: "idle" }
  | { mode: "drawing"; id: string; kind: DrawingKind; phase?: number } // phase for multi-click tools (channel: 1=baseline, 2=offset)
  | { mode: "drag"; id: string; handle: DragHandle };

const COLORS: Record<Drawing["kind"], string> = {
  hline: "#f97316",
  vline: "#0ea5e9",
  trend: "#0ea5e9",
  channel: "#a855f7",
  pitchfork: "#ec4899", // pink for pitchfork tools
  flatTopChannel: "#a855f7", // purple like channel
  flatBottomChannel: "#a855f7", // purple like channel
  rectangle: "#22c55e",
  text: "#eab308",
  priceRange: "#06b6d4", // cyan for measure tools
  dateRange: "#06b6d4", // cyan for measure tools
  dateAndPriceRange: "#06b6d4", // cyan for combined measure tool
  fibRetracement: "#f59e0b", // amber for fibonacci tools
};

const HIT_TOLERANCE = 8;
const HANDLE_RADIUS = 5;
const LINE_WIDTH = 1.5;
const SELECTED_LINE_WIDTH = 2.5;
const SNAP_FEEDBACK_MS = 200;
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
      });
      geometryCacheRef.current.set(drawing.id, { signature, geometry });
      return geometry;
    },
    [candleSeries, chart, trendMap],
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
        case "channel":
          drawChannel(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "pitchfork":
          drawPitchfork(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "flatTopChannel":
        case "flatBottomChannel":
          drawFlatChannel(ctx, drawing, geometry, selectedId === drawing.id, colors);
          break;
        case "rectangle":
          drawRectangle(ctx, drawing, geometry, selectedId === drawing.id, colors);
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
        default:
          break;
      }
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
        if (!includeLocked && drawing.locked) continue;
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
          default:
            break;
        }
      }
      return null;
    },
    [candleSeries, chart, computeViewportState, drawings, getDrawingGeometry, overlay.canvas, overlay.height, overlay.pixelRatio, overlay.width],
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
      if (!drawing || drawing.locked) return;
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
          default:
            break;
        }
        applyCursorForHit({ drawing, handle: state.handle }, true);
        requestRender();
      }
    },
    [applyCursorForHit, candleSeries, chart, drawings, pushDraft, requestRender, trendMap],
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

  const spacePanRef = useRef(false);
  const spaceDraggingRef = useRef(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !spacePanRef.current) {
        spacePanRef.current = true;
        if (pointerState.current.mode === "idle") updateCursor(CURSORS.grab);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spacePanRef.current = false;
        spaceDraggingRef.current = false;
        if (pointerState.current.mode === "idle") updateCursor(tool === "select" ? CURSORS.default : CURSORS.crosshair);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [tool, updateCursor]);

  useEffect(() => {
    const targetEl = containerRef.current;
    if (!targetEl || !chart || !candleSeries) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (spacePanRef.current) {
        spaceDraggingRef.current = true;
        updateCursor(CURSORS.grabbing);
        return; // allow LW to handle pan
      }
      const point = computePoint(event);
      if (!point) return;
      pointerOrigin.current = point;
      
      // Handle multi-click tool phase advancement (channel: 3-click)
      const state = pointerState.current;
      if (state.mode === "drawing" && state.kind === "channel" && state.phase) {
        event.preventDefault();
        const drawing = activeDraftRef.current;
        if (!drawing || drawing.kind !== "channel") return;
        
        if (state.phase === 1) {
          // Phase 1→2: Lock p2 (baseline end), start defining p3
          pushDraft({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "channel", phase: 2 };
          requestRender();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          onUpsert(finalDrawing, { select: true });
          resetPointerSession();
          setTool("select");
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
          pushDraft({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "pitchfork", phase: 2 };
          requestRender();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (right tine) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          onUpsert(finalDrawing, { select: true });
          resetPointerSession();
          setTool("select");
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
          pushDraft({
            ...drawing,
            p2: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          }, { transient: false, select: false });
          pointerState.current = { mode: "drawing", id: drawing.id, kind: drawing.kind, phase: 2 };
          requestRender();
        } else if (state.phase === 2) {
          // Phase 2→commit: Lock p3 (flat level) and commit
          const finalDrawing: Drawing = {
            ...drawing,
            p3: { timeMs: point.timeMs, price: point.price },
            updatedAt: Date.now(),
          };
          onUpsert(finalDrawing, { select: true });
          resetPointerSession();
          setTool("select");
        }
        return;
      }
      
      const hit = hitTest(point);
      if (tool === "select") {
        handleSelection(point, event, hit);
      } else if (hit && !event.shiftKey) {
        handleSelection(point, event, hit);
      } else {
        // Starting a draw session: prevent LW from panning
        event.preventDefault();
        beginDrawing(point);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerState.current.mode === "idle") return;
      const point = computePoint(event);
      if (!point) return;
      updateDrawing(point, event);
    };

    const handlePointerUp = () => {
      if (spaceDraggingRef.current) {
        spaceDraggingRef.current = false;
        if (spacePanRef.current) updateCursor(CURSORS.grab);
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
      if (state.mode === "drawing" && (state.kind === "flatTopChannel" || state.kind === "flatBottomChannel") && state.phase) {
        // Flat channel is in multi-click workflow - don't reset
        return;
      }
      if (pendingCommitRef.current && activeDraftRef.current) {
        onUpsert(activeDraftRef.current, { select: true });
      }
      resetPointerSession();
    };

    const handleWheel = (event: WheelEvent) => {
      // Allow LW zooming unless actively drawing/dragging
      if (pointerState.current.mode !== "idle") {
        event.preventDefault();
      }
    };

    const handleHover = (event: PointerEvent) => {
      if (pointerState.current.mode !== "idle") return;
      if (spacePanRef.current) {
        updateCursor(CURSORS.grab);
        return;
      }
      const point = computePoint(event);
      if (!point) {
        applyCursorForHit(null, false);
        return;
      }
      const hit = hitTest(point);
      applyCursorForHit(hit, false);
    };

    const handlePointerLeave = () => {
      if (pointerState.current.mode !== "idle") return;
      applyCursorForHit(null, false);
    };

    // TV-20.4: Double-click on text = edit
    const handleDoubleClick = (event: MouseEvent) => {
      const point = computePoint(event as unknown as PointerEvent);
      if (!point) return;
      const hit = hitTest(point);
      if (hit?.drawing.kind === "text" && onTextEdit) {
        event.preventDefault();
        onTextEdit(hit.drawing.id);
      }
    };

    targetEl.addEventListener("pointerdown", handlePointerDown);
    targetEl.addEventListener("pointermove", handleHover);
    targetEl.addEventListener("pointerleave", handlePointerLeave);
    targetEl.addEventListener("dblclick", handleDoubleClick);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    targetEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      targetEl.removeEventListener("pointerdown", handlePointerDown);
      targetEl.removeEventListener("pointermove", handleHover);
      targetEl.removeEventListener("pointerleave", handlePointerLeave);
      targetEl.removeEventListener("dblclick", handleDoubleClick);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      targetEl.removeEventListener("wheel", handleWheel);
    };
  }, [
    applyCursorForHit,
    beginDrawing,
    candleSeries,
    chart,
    computePoint,
    handleSelection,
    hitTest,
    onUpsert,
    onTextEdit,
    containerRef,
    resetPointerSession,
    tool,
    updateDrawing,
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
  const stroke = drawing.style?.color || colors.line;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  ctx.strokeStyle = selected ? colors.selection : stroke;
  ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : baseWidth;
  ctx.setLineDash([]);
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
  const stroke = drawing.style?.color || colors.line;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  ctx.strokeStyle = selected ? colors.selection : stroke;
  ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : baseWidth;
  ctx.setLineDash([]);
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
  const stroke = drawing.style?.color || colors.line;
  const baseWidth = drawing.style?.width ?? (LINE_WIDTH + 0.5);
  ctx.strokeStyle = selected ? colors.selection : stroke;
  ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : baseWidth;
  ctx.setLineDash([]);
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
  
  // Draw baseline (solid)
  ctx.strokeStyle = selected ? colors.selection : stroke;
  ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : baseWidth;
  ctx.setLineDash([]);
  ctx.stroke(baseline.path);
  
  // Draw parallel line (solid)
  ctx.stroke(parallel.path);
  
  // Draw midline (dashed, subtle)
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = (selected ? SELECTED_LINE_WIDTH : baseWidth) * 0.6;
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
  
  ctx.strokeStyle = selected ? colors.selection : stroke;
  ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : baseWidth;
  ctx.setLineDash([]);
  
  // Draw median line (solid)
  ctx.stroke(median.path);
  
  // Draw left tine (solid)
  ctx.stroke(leftTine.path);
  
  // Draw right tine (solid)
  ctx.stroke(rightTine.path);
  
  // Draw handles when selected
  if (selected) {
    drawHandleCircle(ctx, p1.x, p1.y, colors);
    drawHandleCircle(ctx, p2.x, p2.y, colors);
    drawHandleCircle(ctx, p3.x, p3.y, colors);
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
  
  ctx.strokeStyle = selected ? colors.selection : stroke;
  ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : baseWidth;
  ctx.setLineDash([]);
  
  // Draw trend line (solid)
  ctx.stroke(trendLine.path);
  
  // Draw flat line (solid)
  ctx.stroke(flatLine.path);
  
  // Draw midline (dashed, subtle)
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = (selected ? SELECTED_LINE_WIDTH : baseWidth) * 0.6;
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

function drawRectangle(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  geometry: Extract<DrawingGeometry, { kind: "rectangle" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  if (drawing.kind !== "rectangle") return;
  const { x, y, w, h, path } = geometry;
  const stroke = drawing.style?.color || colors.rectangle;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  const fillColor = drawing.fillColor || colors.rectangle;
  const fillOpacity = drawing.fillOpacity ?? 0.15;
  
  // Fill rectangle
  ctx.save();
  ctx.globalAlpha = fillOpacity;
  ctx.fillStyle = fillColor;
  ctx.fill(path);
  ctx.restore();
  
  // Stroke rectangle
  ctx.strokeStyle = selected ? colors.selection : stroke;
  ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : baseWidth;
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

function drawPriceRange(
  ctx: CanvasRenderingContext2D,
  drawing: PriceRange,
  geometry: Extract<DrawingGeometry, { kind: "priceRange" }>,
  selected: boolean,
  colors: OverlayColors,
) {
  const { segment, deltaPrice, deltaPercent } = geometry;
  const color = drawing.style?.color ?? colors.line;
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  
  // Draw line connecting p1 and p2
  ctx.strokeStyle = selected ? colors.selection : color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(segment.x1, segment.y1);
  ctx.lineTo(segment.x2, segment.y2);
  ctx.stroke();
  
  // Draw horizontal extension lines at both ends (TV-style measurement)
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
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  
  // Draw horizontal line connecting p1 and p2 (same Y level, midpoint between the two)
  const midY = (segment.y1 + segment.y2) / 2;
  ctx.strokeStyle = selected ? colors.selection : color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(segment.x1, midY);
  ctx.lineTo(segment.x2, midY);
  ctx.stroke();
  
  // Draw vertical extension lines at both ends (TV-style time measurement)
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
  const lineWidth = selected ? SELECTED_LINE_WIDTH : (drawing.style?.width ?? LINE_WIDTH);
  
  // Draw diagonal line connecting p1 and p2 (like priceRange)
  ctx.strokeStyle = selected ? colors.selection : color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(segment.x1, segment.y1);
  ctx.lineTo(segment.x2, segment.y2);
  ctx.stroke();
  
  // Draw extension lines at both ends (TV-style combined measurement)
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
    case "channel":
      return `${drawing.id}:${drawing.updatedAt}:${drawing.p1.timeMs}:${drawing.p1.price}:${drawing.p2.timeMs}:${drawing.p2.price}:${drawing.p3.timeMs}:${drawing.p3.price}:${base}`;
    case "pitchfork":
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
      
      // Extend lines to canvas edges (use large multiplier)
      const extendFactor = 10;
      
      // Median line: from p1, extended through midpoint
      const medianX2 = p1x + medianDx * extendFactor;
      const medianY2 = p1y + medianDy * extendFactor;
      
      // Left tine: parallel to median, through p2
      const leftTineX2 = p2x + medianDx * extendFactor;
      const leftTineY2 = p2y + medianDy * extendFactor;
      
      // Right tine: parallel to median, through p3
      const rightTineX2 = p3x + medianDx * extendFactor;
      const rightTineY2 = p3y + medianDy * extendFactor;
      
      return {
        kind: "pitchfork",
        median: createSegment(p1x, p1y, medianX2, medianY2),
        leftTine: createSegment(p2x, p2y, leftTineX2, leftTineY2),
        rightTine: createSegment(p3x, p3y, rightTineX2, rightTineY2),
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
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

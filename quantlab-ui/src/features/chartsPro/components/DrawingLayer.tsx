import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BusinessDay, IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from "@/lib/lightweightCharts";

import type { Drawing, DrawingKind, NormalizedBar, Tf, Trend } from "../types";
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
  | { kind: "channel"; base?: SegmentGeometry | null; upper?: SegmentGeometry | null; lower?: SegmentGeometry | null }
  | { kind: "rectangle"; x: number; y: number; w: number; h: number; path: Path2D };

type PointerState =
  | { mode: "idle" }
  | { mode: "drawing"; id: string; kind: DrawingKind }
  | { mode: "drag"; id: string; handle: DragHandle };

const COLORS: Record<Drawing["kind"], string> = {
  hline: "#f97316",
  vline: "#0ea5e9",
  trend: "#0ea5e9",
  channel: "#a855f7",
  rectangle: "#22c55e",
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
        case "rectangle":
          drawRectangle(ctx, drawing, geometry, selectedId === drawing.id, colors);
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
  }, [selectedId, onRemove, onToggleHide, onToggleLock]);

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
            if (geometry.upper && distanceToSegment(point.x, point.y, geometry.upper) <= HIT_TOLERANCE) {
              return { drawing, handle: "upper" };
            }
            if (geometry.lower && distanceToSegment(point.x, point.y, geometry.lower) <= HIT_TOLERANCE) {
              return { drawing, handle: "lower" };
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
          const hit = hitTest(point, { includeLocked: true });
          const base =
            hit?.drawing.kind === "trend"
              ? (hit.drawing as Trend)
              : selectedId
                ? trendMap.get(selectedId)
                : undefined;
          if (!base) return;
          const basePrice = valueOnTrend(base, point.timeMs);
          const diff = point.price - basePrice;
          const drawing: Drawing = {
            id: createId(),
            kind: "channel",
            symbol,
            tf: timeframe,
            trendId: base.id,
            offsetTop: diff >= 0 ? diff : 0,
            offsetBottom: diff < 0 ? Math.abs(diff) : 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            z: Date.now(),
            style: { color: COLORS.channel, width: 1, dash: [6, 4] },
          };
          pushDraft(drawing);
          pointerState.current = { mode: "drawing", id: drawing.id, kind: "channel" };
          draftIdRef.current = drawing.id;
          pendingCommitRef.current = true;
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
        default:
          break;
      }
    },
    [hitTest, pushDraft, requestRender, selectedId, symbol, timeframe, tool, trendMap],
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
          const base = trendMap.get(drawing.trendId);
          if (!base) return;
          const basePrice = valueOnTrend(base, targetPoint.timeMs);
          const diff = targetPoint.price - basePrice;
          const next: Drawing = {
            ...drawing,
            offsetTop: diff >= 0 ? diff : drawing.offsetTop,
            offsetBottom: diff < 0 ? Math.abs(diff) : drawing.offsetBottom,
            updatedAt: Date.now(),
          };
          pushDraft(next, { transient: true, select: false });
        } else if (drawing.kind === "rectangle") {
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
            if (state.handle === "upper") {
              const base = trendMap.get(drawing.trendId);
              if (!base) break;
              pushDraft({
                ...drawing,
                offsetTop: Math.max(0, targetPoint.price - valueOnTrend(base, targetPoint.timeMs)),
                updatedAt: Date.now(),
              }, { transient: true, select: false });
            } else if (state.handle === "lower") {
              const base = trendMap.get(drawing.trendId);
              if (!base) break;
              pushDraft({
                ...drawing,
                offsetBottom: Math.max(0, valueOnTrend(base, targetPoint.timeMs) - targetPoint.price),
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

    targetEl.addEventListener("pointerdown", handlePointerDown);
    targetEl.addEventListener("pointermove", handleHover);
    targetEl.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    targetEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      targetEl.removeEventListener("pointerdown", handlePointerDown);
      targetEl.removeEventListener("pointermove", handleHover);
      targetEl.removeEventListener("pointerleave", handlePointerLeave);
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
  ctx.setLineDash([6, 4]);
  if (geometry.base) {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = LINE_WIDTH;
    ctx.stroke(geometry.base.path);
  }
  const stroke = drawing.style?.color || colors.line;
  const baseWidth = drawing.style?.width ?? LINE_WIDTH;
  ctx.setLineDash(drawing.style?.dash || [6, 4]);
  ctx.strokeStyle = selected ? colors.selection : stroke;
  ctx.lineWidth = selected ? SELECTED_LINE_WIDTH : baseWidth;
  if (geometry.upper) {
    ctx.stroke(geometry.upper.path);
  }
  if (geometry.lower) {
    ctx.stroke(geometry.lower.path);
  }
  if (selected) {
    if (geometry.upper) {
      const midUpperX = (geometry.upper.x1 + geometry.upper.x2) / 2;
      const midUpperY = (geometry.upper.y1 + geometry.upper.y2) / 2;
      drawHandleCircle(ctx, midUpperX, midUpperY, colors);
    }
    if (geometry.lower) {
      const midLowerX = (geometry.lower.x1 + geometry.lower.x2) / 2;
      const midLowerY = (geometry.lower.y1 + geometry.lower.y2) / 2;
      drawHandleCircle(ctx, midLowerX, midLowerY, colors);
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
      return `${drawing.id}:${drawing.updatedAt}:${drawing.trendId}:${drawing.offsetTop}:${drawing.offsetBottom}:${base}`;
    case "rectangle":
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
      const baseTrend = trends.get(drawing.trendId);
      if (!baseTrend) return null;
      const baseCoords = trendSegmentCoords(chart, series, baseTrend.p1, baseTrend.p2, width, height);
      const upper = channelLineCoords(baseTrend, drawing.offsetTop, chart, series, width, height);
      const lower = channelLineCoords(baseTrend, -drawing.offsetBottom, chart, series, width, height);
      return {
        kind: "channel",
        base: baseCoords ? createSegment(baseCoords.x1, baseCoords.y1, baseCoords.x2, baseCoords.y2) : null,
        upper: upper ? createSegment(upper.x1, upper.y1, upper.x2, upper.y2) : null,
        lower: lower ? createSegment(lower.x1, lower.y1, lower.x2, lower.y2) : null,
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

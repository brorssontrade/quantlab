
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import SearchableSelect from "@/components/SearchableSelect";
import { createChart, ColorType, LineStyle } from "@/lib/lightweightCharts";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "@/lib/lightweightCharts";
import { toast } from "sonner";
import { EyeOff, Loader2, Pencil, RefreshCcw, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { EMA, SMA } from "technicalindicators";

const BARS = ["D", "1h", "15m", "5m"] as const;
type ChartBar = (typeof BARS)[number];

interface SymbolOption {
  code: string;
  name: string;
}

interface ChartRow {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

type CandlestickSeries = ISeriesApi<"Candlestick">;
type HistogramSeries = ISeriesApi<"Histogram">;

type AlertDirection = "cross_up" | "cross_down" | "cross_any";
type AlertType = "hline" | "trendline" | "channel";

interface AlertPoint {
  time: number;
  price: number;
}

interface AlertGeometryHLine {
  price: number;
}

interface AlertGeometryTrendline {
  start: AlertPoint;
  end: AlertPoint;
}

interface AlertGeometryChannel {
  lower: { start: AlertPoint; end: AlertPoint };
  upper: { start: AlertPoint; end: AlertPoint };
}

type AlertGeometry = AlertGeometryHLine | AlertGeometryTrendline | AlertGeometryChannel;

interface AlertItem {
  id: number;
  label?: string | null;
  symbol: string;
  bar: string;
  type: AlertType;
  direction: AlertDirection;
  geometry: unknown;
  tol_bps: number;
  enabled: boolean;
  one_shot: boolean;
  cooldown_min: number;
  note?: string | null;
  paper_qty?: number | null;
  paper_sek_per_trade?: number | null;
  paper_side?: string | null;
  paper_strategy?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_triggered_at?: string | null;
  last_triggered_close?: number | null;
  last_triggered_direction?: string | null;
}

interface AlertLogItem {
  id: number;
  alert_id: number;
  triggered_at: string;
  direction: AlertDirection;
  price: number;
  close: number;
  note?: string | null;
}

type DrawingTool = "none" | "hline" | "trendline" | "channel";

interface DrawingPoint {
  time: number;
  price: number;
}

interface Drawing {
  id: string;
  type: "hline" | "trendline";
  start: DrawingPoint;
  end: DrawingPoint;
  color: string;
  width: number;
  dashed?: boolean;
}

interface ChannelDrawing {
  id: string;
  type: "channel";
  lower: { start: DrawingPoint; end: DrawingPoint };
  upper: { start: DrawingPoint; end: DrawingPoint };
  color: string;
  width: number;
  dashed?: boolean;
}

type OverlayDrawing = Drawing | ChannelDrawing;

interface IndicatorConfig {
  id: string;
  label: string;
  type: "sma" | "ema";
  period: number;
  color: string;
  active: boolean;
}

const INDICATOR_LIBRARY: IndicatorConfig[] = [
  { id: "sma20", label: "SMA 20", type: "sma", period: 20, color: "#2563eb", active: true },
  { id: "ema50", label: "EMA 50", type: "ema", period: 50, color: "#f97316", active: false },
];

interface AlertModalState {
  mode: "create" | "edit";
  alertId?: number;
  type: AlertType;
  geometry: AlertGeometry;
  initialValues: AlertFormState;
}

interface AlertFormState {
  label: string;
  direction: AlertDirection;
  tol_bps: number;
  one_shot: boolean;
  cooldown_min: number;
  enabled: boolean;
  note: string;
  paper_mode: "none" | "qty" | "sek";
  paper_qty: string;
  paper_sek_per_trade: string;
  paper_side: string;
  paper_strategy: string;
}

const INITIAL_FORM: AlertFormState = {
  label: "",
  direction: "cross_any",
  tol_bps: 0,
  one_shot: false,
  cooldown_min: 0,
  enabled: true,
  note: "",
  paper_mode: "none",
  paper_qty: "",
  paper_sek_per_trade: "",
  paper_side: "",
  paper_strategy: "",
};

const TOOL_LABELS: Record<DrawingTool, string> = {
  none: "None",
  hline: "Horizontal",
  trendline: "Trendline",
  channel: "Channel",
};

const TOOL_HINTS: Record<DrawingTool, string> = {
  none: "Exit drawing mode",
  hline: "Click and drag a horizontal line",
  trendline: "Click and drag a trendline",
  channel: "Draw the lower boundary first, then the upper",
};

function normalizeBarLabel(bar: string): string {
  const lookup: Record<string, string> = {
    D: "Daily",
    "1h": "1 hour",
    "15m": "15 minutes",
    "5m": "5 minutes",
  };
  return lookup[bar] ?? bar;
}

function toUTCTimestamp(value: string | number): UTCTimestamp {
  if (typeof value === "number") {
    return value as UTCTimestamp;
  }
  return (Math.floor(new Date(value).getTime() / 1000) as unknown) as UTCTimestamp;
}

function formatIso(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function describeGeometry(type: AlertType, geometry: AlertGeometry): string {
  switch (type) {
    case "hline": {
      const price = (geometry as AlertGeometryHLine).price ?? 0;
      return `Pris ${price.toFixed(4)}`;
    }
    case "trendline": {
      const g = geometry as AlertGeometryTrendline;
      return `${formatIso(new Date(g.start.time * 1000).toISOString())} → ${formatIso(
        new Date(g.end.time * 1000).toISOString(),
      )}`;
    }
    case "channel": {
      const g = geometry as AlertGeometryChannel;
      return `L ${g.lower.start.price.toFixed(2)}→${g.lower.end.price.toFixed(2)} / U ${g.upper.start.price.toFixed(
        2,
      )}→${g.upper.end.price.toFixed(2)}`;
    }
    default:
      return "Oknd geometri";
  }
}

type RawAlertPoint = {
  time?: unknown;
  Time?: unknown;
  ts?: unknown;
  price?: unknown;
  Price?: unknown;
} | null;

type RawAlertGeometry = {
  price?: unknown;
  Price?: unknown;
  start?: RawAlertPoint;
  end?: RawAlertPoint;
  lower?: { start?: RawAlertPoint; end?: RawAlertPoint };
  upper?: { start?: RawAlertPoint; end?: RawAlertPoint };
} | null;

function parseAlertGeometry(alert: AlertItem): AlertGeometry {
  const geom = (alert.geometry ?? {}) as RawAlertGeometry;
  if (alert.type === "hline") {
    return { price: toNumber(geom?.price ?? geom?.Price, 0) };
  }
  if (alert.type === "trendline") {
    return {
      start: parseAlertPoint(geom?.start),
      end: parseAlertPoint(geom?.end),
    };
  }
  const rawLower = geom?.lower ?? {};
  const rawUpper = geom?.upper ?? {};
  return {
    lower: {
      start: parseAlertPoint(rawLower.start),
      end: parseAlertPoint(rawLower.end),
    },
    upper: {
      start: parseAlertPoint(rawUpper.start),
      end: parseAlertPoint(rawUpper.end),
    },
  };
}

function parseAlertPoint(value?: RawAlertPoint | undefined): AlertPoint {
  const timeSource = value?.time ?? value?.Time ?? value?.ts;
  const priceSource = value?.price ?? value?.Price;
  return {
    time: toNumber(timeSource, 0),
    price: toNumber(priceSource, 0),
  };
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
export default function AlertsTab({ apiBase }: { apiBase: string }) {
  const apiBaseClean = useMemo(() => apiBase.replace(/\/$/, ""), [apiBase]);

  const [symbols, setSymbols] = useState<SymbolOption[]>([]);
  const [symbol, setSymbol] = useState<string>("");
  const [bar, setBar] = useState<ChartBar>("D");
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeStartInput, setRangeStartInput] = useState<string>("");
  const [candles, setCandles] = useState<ChartRow[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [logs, setLogs] = useState<AlertLogItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [indicatorConfigs, setIndicatorConfigs] = useState<IndicatorConfig[]>(INDICATOR_LIBRARY);
  const [tool, setTool] = useState<DrawingTool>("none");
  const [draftDrawing, setDraftDrawing] = useState<Drawing | null>(null);
  const [overlayDrawings, setOverlayDrawings] = useState<OverlayDrawing[]>([]);
  const [modalState, setModalState] = useState<AlertModalState | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  const startIso = useMemo(() => {
    if (!rangeStart) return undefined;
    const date = new Date(rangeStart);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }, [rangeStart]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<CandlestickSeries | null>(null);
  const volumeSeriesRef = useRef<HistogramSeries | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const draftDrawingRef = useRef<Drawing | null>(null);
  const channelLowerRef = useRef<Drawing | null>(null);
  const awaitingUpperRef = useRef(false);

  const symbolOptions = useMemo(
    () => symbols.map((item) => ({ value: item.code, label: `${item.code} — ${item.name}` })),
    [symbols],
  );

  const pointerToValue = useCallback(
    (event: PointerEvent | MouseEvent): { point: DrawingPoint } | null => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      if (!chart || !candleSeries) return null;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const time = chart.timeScale().coordinateToTime(x);
      if (time == null) return null;
      const price = candleSeries.coordinateToPrice(y);
      if (price == null) return null;
      return {
        point: {
          time: Number(time),
          price: Number(price),
        },
      };
    },
    [],
  );

  const syncOverlayCanvas = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const drawOverlays = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!canvas || !chart || !series) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawLine = (drawing: Drawing, dashed = false) => {
      const startX = chart.timeScale().timeToCoordinate(drawing.start.time as UTCTimestamp);
      const endX = chart.timeScale().timeToCoordinate(drawing.end.time as UTCTimestamp);
      const startY = series.priceToCoordinate(drawing.start.price);
      const endY = series.priceToCoordinate(drawing.end.price);
      if (startX == null || endX == null || startY == null || endY == null) return;
      ctx.save();
      ctx.strokeStyle = drawing.color;
      ctx.lineWidth = drawing.width;
      if (dashed || drawing.dashed) ctx.setLineDash([6, 6]);
      ctx.beginPath();
      if (drawing.type === "hline") {
        ctx.moveTo(0, startY);
        ctx.lineTo(canvas.width, startY);
      } else {
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
      }
      ctx.stroke();
      ctx.restore();
    };

    const drawChannel = (drawing: ChannelDrawing, dashed = false) => {
      drawLine(
        {
          id: `${drawing.id}-lower`,
          type: "trendline",
          start: drawing.lower.start,
          end: drawing.lower.end,
          color: drawing.color,
          width: drawing.width,
          dashed: dashed || drawing.dashed,
        },
        dashed,
      );
      drawLine(
        {
          id: `${drawing.id}-upper`,
          type: "trendline",
          start: drawing.upper.start,
          end: drawing.upper.end,
          color: drawing.color,
          width: drawing.width,
          dashed: dashed || drawing.dashed,
        },
        dashed,
      );
    };

    overlayDrawings.forEach((drawing) => {
      if (drawing.type === "channel") {
        drawChannel(drawing as ChannelDrawing);
      } else {
        drawLine(drawing as Drawing);
      }
    });

    if (channelLowerRef.current) {
      drawLine({ ...channelLowerRef.current, color: "#f97316", dashed: true }, true);
    }
    if (draftDrawing) {
      drawLine({ ...draftDrawing, color: "#f97316", dashed: true }, true);
    }
  }, [draftDrawing, overlayDrawings]);

  useEffect(() => {
    drawOverlays();
  }, [drawOverlays]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height: 480,
      layout: {
        textColor: "#1f2937",
        background: { type: ColorType.Solid, color: "#ffffff" },
      },
      grid: {
        vertLines: { color: "#e2e8f0", style: LineStyle.Dotted },
        horzLines: { color: "#e2e8f0", style: LineStyle.Dotted },
      },
      timeScale: {
        borderColor: "#e2e8f0",
      },
      rightPriceScale: {
        borderColor: "#e2e8f0",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      crosshair: {
        horzLine: { color: "#94a3b8", width: 1 },
        vertLine: { color: "#94a3b8", width: 1 },
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "left",
      color: "#38bdf8",
    });
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
      syncOverlayCanvas();
      drawOverlays();
    });
    resizeObserverRef.current = resizeObserver;
    resizeObserver.observe(container);

    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      overlayCanvas.style.touchAction = "none";
      syncOverlayCanvas();
    }

    let drawingActive = false;

    const handlePointerDown = (event: PointerEvent) => {
      if (tool === "none") return;
      if (event.button !== 0) return;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const value = pointerToValue(event);
      if (!value) return;
      drawingActive = true;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
      const effectiveTool: Drawing["type"] =
        tool === "channel" && awaitingUpperRef.current ? "trendline" : tool === "hline" ? "hline" : "trendline";
      const draft: Drawing = {
        id: `draft-${Date.now()}`,
        type: effectiveTool,
        start: value.point,
        end: value.point,
        color: "#f97316",
        width: 2,
      };
      draftDrawingRef.current = draft;
      setDraftDrawing(draft);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drawingActive) return;
      const value = pointerToValue(event);
      if (!value) return;
      const draft = draftDrawingRef.current;
      if (!draft) return;
      const updated: Drawing = { ...draft, end: value.point };
      draftDrawingRef.current = updated;
      setDraftDrawing(updated);
    };

    const finalizeDrawing = (drawing: Drawing) => {
      if (tool === "channel") {
        if (!awaitingUpperRef.current) {
          channelLowerRef.current = drawing;
          awaitingUpperRef.current = true;
          setDraftDrawing(null);
          toast.info("Kanal: rita nu vre grnsen");
          return;
        }
        const lower = channelLowerRef.current;
        channelLowerRef.current = null;
        awaitingUpperRef.current = false;
        setDraftDrawing(null);
        if (!lower) return;
        const channelGeometry: AlertGeometryChannel = {
          lower: {
            start: { ...lower.start },
            end: { ...lower.end },
          },
          upper: {
            start: { ...drawing.start },
            end: { ...drawing.end },
          },
        };
        openCreateModal("channel", channelGeometry);
        return;
      }
      setDraftDrawing(null);
      openCreateModal(drawing.type === "hline" ? "hline" : "trendline", drawing);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!drawingActive) return;
      drawingActive = false;
      const canvas = overlayCanvasRef.current;
      if (canvas) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          /* noop */
        }
      }
      const value = pointerToValue(event);
      const draft = draftDrawingRef.current;
      draftDrawingRef.current = null;
      if (!value || !draft) {
        setDraftDrawing(null);
        return;
      }
      if (draft.start.time === value.point.time && draft.start.price === value.point.price) {
        setDraftDrawing(null);
        return;
      }
      finalizeDrawing({ ...draft, end: value.point });
    };

    overlayCanvas?.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      overlayCanvas?.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      resizeObserver.disconnect();
      indicatorSeriesRef.current.forEach((seriesItem) => {
        chart.removeSeries(seriesItem);
      });
      indicatorSeriesRef.current.clear();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [pointerToValue, drawOverlays, syncOverlayCanvas, tool]);
  const loadSymbols = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseClean}/meta/symbols`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : data;
      if (Array.isArray(items)) {
        setSymbols(items);
        if (!symbol && items.length) {
          setSymbol(items[0].code);
        }
      }
    } catch (error) {
      toast.error(`Kunde inte ladda symboler: ${(error as Error).message}`);
    }
  }, [apiBaseClean, symbol]);

  const loadCandles = useCallback(async () => {
    if (!symbol) return;
    setLoadingCandles(true);
    try {
      const params = new URLSearchParams({
        symbol,
        bar,
        limit: "1500",
      });
      if (startIso) {
        params.set("start", startIso);
      }
      const res = await fetch(`${apiBaseClean}/chart/ohlcv?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const rows: ChartRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setCandles(rows);
    } catch (error) {
      toast.error(`Kunde inte ladda OHLCV: ${(error as Error).message}`);
    } finally {
      setLoadingCandles(false);
    }
  }, [apiBaseClean, bar, symbol, startIso]);

  const loadAlerts = useCallback(async () => {
    if (!symbol) return;
    setAlertsLoading(true);
    try {
      const res = await fetch(
        `${apiBaseClean}/alerts?symbol=${encodeURIComponent(symbol)}&bar=${encodeURIComponent(bar)}&limit=200`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAlerts(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      toast.error(`Kunde inte ladda alerts: ${(error as Error).message}`);
    } finally {
      setAlertsLoading(false);
    }
  }, [apiBaseClean, bar, symbol]);

  const loadLogs = useCallback(async () => {
    if (!symbol) return;
    setLogsLoading(true);
    try {
      const res = await fetch(
        `${apiBaseClean}/alerts/logs?symbol=${encodeURIComponent(symbol)}&bar=${encodeURIComponent(bar)}&limit=100`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLogs(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      toast.error(`Kunde inte ladda trigger log: ${(error as Error).message}`);
    } finally {
      setLogsLoading(false);
    }
  }, [apiBaseClean, bar, symbol]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;
    if (candles.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      drawOverlays();
      return;
    }
    const mappedCandles = candles.map((row) => ({
      time: toUTCTimestamp(row.t),
      open: row.o,
      high: row.h,
      low: row.l,
      close: row.c,
    }));
    candleSeries.setData(mappedCandles);
    volumeSeries.setData(
      candles.map((row) => ({
        time: toUTCTimestamp(row.t),
        value: row.v,
        color: row.o <= row.c ? "#22c55e" : "#ef4444",
      })),
    );
    const chart = chartRef.current;
    if (chart) {
      chart.timeScale().fitContent();
    }
    drawOverlays();
  }, [candles, drawOverlays]);

  const updateIndicators = useCallback(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries || candles.length === 0) {
      indicatorSeriesRef.current.forEach((series) => {
        series.setData([]);
      });
      return;
    }
    indicatorConfigs.forEach((config) => {
      const key = config.id;
      let series = indicatorSeriesRef.current.get(key);
      if (!config.active) {
        if (series) {
          series.setData([]);
        }
        return;
      }
      if (!series) {
        series = chart.addLineSeries({
          color: config.color,
          lineWidth: 2,
          priceScaleId: "right",
        });
        indicatorSeriesRef.current.set(key, series);
      }
      const closes = candles.map((row) => row.c);
      let values: number[] = [];
      if (config.type === "sma") {
        values = SMA.calculate({ period: config.period, values: closes });
      } else {
        values = EMA.calculate({ period: config.period, values: closes });
      }
      const offset = closes.length - values.length;
      const data = values.map((value, idx) => ({
        time: toUTCTimestamp(candles[idx + offset].t),
        value,
      }));
      series?.setData(data);
    });
  }, [candles, indicatorConfigs]);

  const rebuildAlertOverlays = useCallback(() => {
    const overlays: OverlayDrawing[] = [];
    alerts.forEach((alert) => {
      const enabledColor = alert.enabled ? "#0891b2" : "#94a3b8";
      const geometry = parseAlertGeometry(alert);
      if (alert.type === "hline") {
        const price = (geometry as AlertGeometryHLine).price ?? 0;
        const last = candles[candles.length - 1];
        const first = candles[0];
        if (!first || !last) return;
        overlays.push({
          id: `alert-${alert.id}`,
          type: "hline",
          start: { time: toUTCTimestamp(first.t), price },
          end: { time: toUTCTimestamp(last.t), price },
          color: enabledColor,
          width: 2,
          dashed: !alert.enabled,
        });
        return;
      }
      if (alert.type === "trendline") {
        const geom = geometry as AlertGeometryTrendline;
        overlays.push({
          id: `alert-${alert.id}`,
          type: "trendline",
          start: { ...geom.start },
          end: { ...geom.end },
          color: enabledColor,
          width: 2,
          dashed: !alert.enabled,
        });
        return;
      }
      const geom = geometry as AlertGeometryChannel;
      overlays.push({
        id: `alert-${alert.id}`,
        type: "channel",
        lower: {
          start: { ...geom.lower.start },
          end: { ...geom.lower.end },
        },
        upper: {
          start: { ...geom.upper.start },
          end: { ...geom.upper.end },
        },
        color: enabledColor,
        width: 2,
        dashed: !alert.enabled,
      });
    });
    setOverlayDrawings(overlays);
  }, [alerts, candles]);

  useEffect(() => {
    loadSymbols();
  }, [loadSymbols]);

  useEffect(() => {
    if (!symbol) return;
    loadCandles();
    loadAlerts();
    loadLogs();
  }, [symbol, bar, loadCandles, loadAlerts, loadLogs]);

  useEffect(() => {
    updateIndicators();
  }, [candles, updateIndicators]);

  useEffect(() => {
    rebuildAlertOverlays();
  }, [alerts, candles, rebuildAlertOverlays]);

  useEffect(() => {
    channelLowerRef.current = null;
    awaitingUpperRef.current = false;
    setDraftDrawing(null);
  }, [tool]);

  useEffect(() => {
    if (!symbol) return;
    const interval = window.setInterval(() => {
      loadAlerts();
      loadLogs();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [loadAlerts, loadLogs, symbol]);
  const openCreateModal = useCallback(
    (type: AlertType, payload: AlertGeometry | Drawing, defaults?: Partial<AlertFormState>) => {
      let geometry: AlertGeometry;
      if (type === "hline") {
        const drawing = payload as Drawing;
        geometry = { price: drawing.start.price };
      } else if (type === "trendline") {
        const drawing = payload as Drawing;
        geometry = {
          start: { ...drawing.start },
          end: { ...drawing.end },
        };
      } else {
        geometry = payload as AlertGeometryChannel;
      }
      const initial: AlertFormState = {
        ...INITIAL_FORM,
        label: defaults?.label ?? "",
        direction: defaults?.direction ?? "cross_any",
        tol_bps: defaults?.tol_bps ?? 0,
        one_shot: defaults?.one_shot ?? false,
        cooldown_min: defaults?.cooldown_min ?? 0,
        enabled: defaults?.enabled ?? true,
        note: defaults?.note ?? "",
        paper_mode: defaults?.paper_mode ?? "none",
        paper_qty: defaults?.paper_qty ?? "",
        paper_sek_per_trade: defaults?.paper_sek_per_trade ?? "",
        paper_side: defaults?.paper_side ?? "",
        paper_strategy: defaults?.paper_strategy ?? "",
      };
      setModalState({
        mode: "create",
        type,
        geometry,
        initialValues: initial,
      });
    },
    [],
  );

  const openEditModal = useCallback(
    (alert: AlertItem) => {
      const geometry = parseAlertGeometry(alert);
      const initial: AlertFormState = {
        label: alert.label ?? "",
        direction: alert.direction ?? "cross_any",
        tol_bps: alert.tol_bps ?? 0,
        one_shot: Boolean(alert.one_shot),
        cooldown_min: alert.cooldown_min ?? 0,
        enabled: Boolean(alert.enabled),
        note: alert.note ?? "",
        paper_mode:
          alert.paper_qty && alert.paper_qty > 0
            ? "qty"
            : alert.paper_sek_per_trade && alert.paper_sek_per_trade > 0
            ? "sek"
            : "none",
        paper_qty: alert.paper_qty ? String(alert.paper_qty) : "",
        paper_sek_per_trade: alert.paper_sek_per_trade ? String(alert.paper_sek_per_trade) : "",
        paper_side: alert.paper_side ?? "",
        paper_strategy: alert.paper_strategy ?? "",
      };
      setModalState({
        mode: "edit",
        alertId: alert.id,
        type: alert.type,
        geometry,
        initialValues: initial,
      });
    },
    [],
  );

  const closeModal = useCallback(() => {
    setModalState(null);
    setModalSubmitting(false);
  }, []);

  const handleModalSubmit = useCallback(
    async (values: AlertFormState) => {
      if (!modalState || !symbol) return;
      setModalSubmitting(true);
      try {
        const payload: Record<string, unknown> = {
          label: values.label || null,
          direction: values.direction,
          tol_bps: Number(values.tol_bps) || 0,
          one_shot: Boolean(values.one_shot),
          cooldown_min: Number(values.cooldown_min) || 0,
          enabled: Boolean(values.enabled),
          note: values.note || null,
        };
        if (values.paper_mode === "qty") {
          const qty = parseFloat(values.paper_qty);
          payload.paper_qty = Number.isFinite(qty) && qty > 0 ? qty : null;
          payload.paper_sek_per_trade = null;
        } else if (values.paper_mode === "sek") {
          const sek = parseFloat(values.paper_sek_per_trade);
          payload.paper_sek_per_trade = Number.isFinite(sek) && sek > 0 ? sek : null;
          payload.paper_qty = null;
        } else {
          payload.paper_qty = null;
          payload.paper_sek_per_trade = null;
        }
        payload.paper_side = values.paper_side ? values.paper_side.toUpperCase() : null;
        payload.paper_strategy = values.paper_strategy || null;

        if (modalState.mode === "create") {
          const createBody = {
            symbol,
            bar,
            type: modalState.type,
            direction: values.direction,
            geometry: modalState.geometry,
            tol_bps: payload.tol_bps,
            one_shot: payload.one_shot,
            cooldown_min: payload.cooldown_min,
            enabled: payload.enabled,
            note: payload.note,
            label: payload.label,
            paper_qty: payload.paper_qty,
            paper_sek_per_trade: payload.paper_sek_per_trade,
            paper_side: payload.paper_side,
            paper_strategy: payload.paper_strategy,
          };
          const res = await fetch(`${apiBaseClean}/alerts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(createBody),
          });
          if (!res.ok) throw new Error(await res.text());
          toast.success("Alert created");
        } else {
          const res = await fetch(`${apiBaseClean}/alerts/${modalState.alertId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              geometry: modalState.geometry,
            }),
          });
          if (!res.ok) throw new Error(await res.text());
          toast.success("Alert uppdaterad");
        }
        closeModal();
        loadAlerts();
      } catch (error) {
        toast.error(`Kunde inte spara alert: ${(error as Error).message}`);
      } finally {
        setModalSubmitting(false);
      }
    },
    [apiBaseClean, bar, closeModal, loadAlerts, modalState, symbol],
  );

  const handleIndicatorToggle = (id: string) => {
    setIndicatorConfigs((prev) =>
      prev.map((indicator) => (indicator.id === id ? { ...indicator, active: !indicator.active } : indicator)),
    );
  };

  const rangeStartInputIsValid = useMemo(() => {
    if (!rangeStartInput) return false;
    const date = new Date(rangeStartInput);
    return !Number.isNaN(date.getTime());
  }, [rangeStartInput]);
  const hasRangeStartInput = rangeStartInput.length > 0;
  const canApplyRange = rangeStartInputIsValid && rangeStartInput !== rangeStart;
  const canClearRange = Boolean(rangeStart);

  const handleApplyRange = () => {
    if (!canApplyRange) return;
    setRangeStart(rangeStartInput);
  };

  const handleClearRange = () => {
    if (!canClearRange) return;
    setRangeStart("");
    setRangeStartInput("");
  };

  const handleRangeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleApplyRange();
    }
  };

  const handleQuickHorizontal = () => {
    const last = candles[candles.length - 1];
    if (!last) {
      toast.info("Load price data before creating an alert");
      return;
    }
    const price = last.c;
    const drawing: Drawing = {
      id: "quick-hline",
      type: "hline",
      start: { time: toUTCTimestamp(candles[0].t), price },
      end: { time: toUTCTimestamp(last.t), price },
      color: "#f97316",
      width: 2,
    };
    openCreateModal("hline", drawing, { label: `${symbol} horisontell`, paper_mode: "none" });
  };

  const handleToggleAlert = async (alert: AlertItem) => {
    try {
      const res = await fetch(`${apiBaseClean}/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !alert.enabled }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Alert ${!alert.enabled ? "aktiverad" : "inaktiverad"}`);
      loadAlerts();
    } catch (error) {
      toast.error(`Misslyckades att uppdatera alert: ${(error as Error).message}`);
    }
  };

  const handleDeleteAlert = async (alert: AlertItem) => {
    if (!window.confirm(`Ta bort alert "${alert.label || alert.id}"?`)) return;
    try {
      const res = await fetch(`${apiBaseClean}/alerts/${alert.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Alert borttagen");
      loadAlerts();
    } catch (error) {
      toast.error(`Misslyckades att ta bort alert: ${(error as Error).message}`);
    }
  };

  const handleRefresh = () => {
    loadCandles();
    loadAlerts();
    loadLogs();
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alert tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs uppercase text-slate-500">Symbol</Label>
                  <SearchableSelect
                    value={symbol}
                    options={symbolOptions}
                    placeholder="Select symbol"
                    onChange={(value) => value && setSymbol(value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase text-slate-500">Bar</Label>
                  <div className="flex flex-wrap gap-2">
                    {BARS.map((item) => (
                      <Button
                        key={item}
                        variant={bar === item ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setBar(item)}
                      >
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alerts-range-start" className="text-xs uppercase text-slate-500">
                  From (local time)
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="alerts-range-start"
                    type="datetime-local"
                    value={rangeStartInput}
                    onChange={(event) => setRangeStartInput(event.target.value)}
                    onKeyDown={handleRangeKeyDown}
                    className="h-9 w-full md:w-auto"
                  />
                  <Button size="sm" onClick={handleApplyRange} disabled={!canApplyRange || loadingCandles}>
                    Apply
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleClearRange} disabled={!canClearRange || loadingCandles}>
                    Clear
                  </Button>
                </div>
                {hasRangeStartInput && !rangeStartInputIsValid ? (
                  <p className="text-xs text-red-500">Enter a valid date and time to filter the chart.</p>
                ) : (
                  <p className="text-xs text-slate-500">Optional lower bound; latest bars are always included.</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs uppercase text-slate-500">Drawing tools</Label>
                <div className="flex flex-wrap gap-2">
                  {(["none", "hline", "trendline", "channel"] as DrawingTool[]).map((item) => (
                    <Button
                      key={item}
                      variant={tool === item ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setTool(item)}
                    >
                      {TOOL_LABELS[item]}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">{TOOL_HINTS[tool]}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs uppercase text-slate-500">Indicators</Label>
                <div className="flex flex-wrap gap-2">
                  {indicatorConfigs.map((indicator) => (
                    <Button
                      key={indicator.id}
                      size="sm"
                      variant={indicator.active ? "secondary" : "outline"}
                      onClick={() => handleIndicatorToggle(indicator.id)}
                    >
                      {indicator.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={handleQuickHorizontal}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  New horizontal alert
                </Button>
                <Button size="sm" variant="outline" onClick={handleRefresh}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Refresh data
                </Button>
                <span className="text-xs text-slate-500">
                  {symbol ? `${symbol} - ${normalizeBarLabel(bar)}` : "Select a symbol to get started"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chart & drawings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div ref={containerRef} className="h-[480px]" />
                <canvas ref={overlayCanvasRef} className="pointer-events-auto absolute inset-0" />
                {loadingCandles ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Alerts</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleQuickHorizontal}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    New horizontal
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRefresh}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Reload
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {alertsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading alerts...
                </div>
              ) : alerts.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No alerts yet. Draw in the chart to create a new alert.
                </p>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="rounded border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
                          <span>{alert.label || `Alert #${alert.id}`}</span>
                          <Badge variant="secondary">{alert.type}</Badge>
                          <Badge variant="outline">{alert.direction}</Badge>
                          {alert.one_shot ? <Badge variant="outline">One shot</Badge> : null}
                        </div>
                        <div className="text-xs text-slate-500">
                          Last: {formatIso(alert.last_triggered_at)} • Tol: {alert.tol_bps} bps • Cooldown: {alert.cooldown_min} min • Notee: {alert.note || "-"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleAlert(alert)}
                          title={alert.enabled ? "Inaktivera" : "Aktivera"}
                        >
                          {alert.enabled ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditModal(alert)}
                          title="Redigera"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteAlert(alert)}
                          title="Ta bort"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trigger log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {logsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading log...
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-slate-500">No triggers yet.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="rounded border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-slate-700">{formatIso(log.triggered_at)}</span>
                        <span className="ml-2 text-xs uppercase text-slate-500">{log.direction}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Trigger @ {log.price.toFixed(3)} • Close {log.close.toFixed(3)}
                      </div>
                    </div>
                    {log.note ? <p className="text-xs text-slate-500">Notee: {log.note}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <AlertModal
        open={Boolean(modalState)}
        state={modalState}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
        submitting={modalSubmitting}
        symbol={symbol}
        bar={bar}
      />
    </div>
  );
}

function AlertModal({
  open,
  state,
  onClose,
  onSubmit,
  submitting,
  symbol,
  bar,
}: {
  open: boolean;
  state: AlertModalState | null;
  onClose: () => void;
  onSubmit: (values: AlertFormState) => Promise<void>;
  submitting: boolean;
  symbol: string;
  bar: string;
}) {
  const [form, setForm] = useState<AlertFormState>(INITIAL_FORM);

  useEffect(() => {
    if (open && state) {
      setForm(state.initialValues);
    }
  }, [open, state]);

  if (!open || !state) return null;

  const handleChange =
    (key: keyof AlertFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.type === "checkbox" ? (event.target as HTMLInputElement).checked : event.target.value;
      setForm((prev) => ({
        ...prev,
        [key]: event.target.type === "number" ? Number(value) : value,
      }));
    };

  const handlePaperModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as AlertFormState["paper_mode"];
    setForm((prev) => ({
      ...prev,
      paper_mode: value,
      paper_qty: value === "qty" ? prev.paper_qty : "",
      paper_sek_per_trade: value === "sek" ? prev.paper_sek_per_trade : "",
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-lg">
        <form onSubmit={handleSubmit}>
          <div className="border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-700">
                {state.mode === "create" ? "Create alert" : "Edit alert"} • {symbol} ({bar})
              </h2>
              <div className="text-xs uppercase text-slate-500">
                {state.type.toUpperCase()} • {describeGeometry(state.type, state.geometry)}
              </div>
            </div>
          </div>
          <div className="grid gap-4 px-6 py-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label className="text-xs uppercase text-slate-500">Etikett</Label>
                <Input value={form.label} onChange={handleChange("label")} placeholder="Optional label" />
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">Riktning</Label>
                <select
                  value={form.direction}
                  onChange={handleChange("direction")}
                  className="h-9 w-full rounded border border-slate-200 px-2 text-sm"
                >
                  <option value="cross_any">Korsa upp/ner</option>
                  <option value="cross_up">Endast upp</option>
                  <option value="cross_down">Endast ner</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase text-slate-500">Tol (bps)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.tol_bps}
                    onChange={handleChange("tol_bps")}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase text-slate-500">Cooldown (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.cooldown_min}
                    onChange={handleChange("cooldown_min")}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="alert-enabled"
                  type="checkbox"
                  checked={form.enabled}
                  onChange={handleChange("enabled")}
                  className="h-4 w-4"
                />
                <Label htmlFor="alert-enabled" className="text-sm">
                  Alert enabled
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="alert-one-shot"
                  type="checkbox"
                  checked={form.one_shot}
                  onChange={handleChange("one_shot")}
                  className="h-4 w-4"
                />
                <Label htmlFor="alert-one-shot" className="text-sm">
                  One shot (disables after trigger)
                </Label>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs uppercase text-slate-500">Paper trade-lge</Label>
                <select
                  value={form.paper_mode}
                  onChange={handlePaperModeChange}
                  className="h-9 w-full rounded border border-slate-200 px-2 text-sm"
                >
                  <option value="none">Ingen trade</option>
                  <option value="qty">Fast antal (paper_qty)</option>
                  <option value="sek">SEK per trade</option>
                </select>
              </div>
              {form.paper_mode === "qty" ? (
                <div>
                  <Label className="text-xs uppercase text-slate-500">Antal</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.paper_qty}
                    onChange={handleChange("paper_qty")}
                    placeholder="e.g. 100"
                  />
                </div>
              ) : null}
              {form.paper_mode === "sek" ? (
                <div>
                  <Label className="text-xs uppercase text-slate-500">SEK per trade</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.paper_sek_per_trade}
                    onChange={handleChange("paper_sek_per_trade")}
                    placeholder="e.g. 25000"
                  />
                </div>
              ) : null}
              <div>
                <Label className="text-xs uppercase text-slate-500">Paper side (BUY/SELL)</Label>
                <Input
                  value={form.paper_side}
                  onChange={handleChange("paper_side")}
                  placeholder="Auto if empty"
                />
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">Paper strategy id</Label>
                <Input
                  value={form.paper_strategy}
                  onChange={handleChange("paper_strategy")}
                  placeholder="Optional tag"
                />
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">Noteeering</Label>
                <textarea
                  value={form.note}
                  onChange={handleChange("note")}
                  className="min-h-[80px] w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Optional comment"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save alert
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

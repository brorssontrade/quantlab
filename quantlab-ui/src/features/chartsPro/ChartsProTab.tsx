import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Toolbar } from "./components/Toolbar";
import { ChartViewport } from "./components/ChartViewport";
import { ObjectTree } from "./components/ObjectTree";
import { IndicatorPanel } from "./components/IndicatorPanel";
import { ApiStatusBadge } from "./components/ApiStatusBadge";
import { useOhlcvQuery } from "./hooks/useOhlcv";
import { getLastHealthCheck, setQAForceDataMode } from "./runtime/dataClient";
import type { LwChartsApi } from "./qaTypes";
import {
  DEFAULT_SYMBOL,
  DEFAULT_THEME,
  DEFAULT_TIMEFRAME,
  TIMEFRAME_OPTIONS,
  type ChartTimeframe,
  useChartControls,
} from "./state/controls";
import type { ChartThemeName, Tf } from "./types";
import { getChartTheme } from "./theme";
import { useDrawingsStore } from "./state/drawings";

interface ChartsProTabProps {
  apiBase: string;
}
type ExportHandlers = {
  png?: () => Promise<string | null>;
  csv?: () => Promise<string | null>;
};

/**
 * Normalize inspector tab to canonical form.
 */
const normalizeInspectorTab = (input: unknown): "objectTree" | "dataWindow" | undefined => {
  if (typeof input !== "string") return undefined;
  const v = input.trim().toLowerCase();
  const map: Record<string, "objectTree" | "dataWindow"> = {
    objecttree: "objectTree",
    objects: "objectTree",
    "object-tree": "objectTree",
    tree: "objectTree",
    datawindow: "dataWindow",
    data: "dataWindow",
    "data-window": "dataWindow",
    window: "dataWindow",
  };
  return map[v];
};

function readInitialMockFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("mock")) {
      return params.get("mock") === "1";
    }
    const stored = window.localStorage?.getItem("cp.mock");
    if (!stored) return false;
    if (stored === "1" || stored === "0") {
      return stored === "1";
    }
    return stored.toLowerCase() === "true";
  } catch {
    return false;
  }
}

const LAYOUT_KEY = "cp.layout";
type PersistedLayout = { symbol: string; timeframe: ChartTimeframe; theme: ChartThemeName };

function persistMockFlag(flag: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem("cp.mock", flag ? "1" : "0");
  } catch {
    // ignore quota errors
  }
  const w = window as unknown as Record<string, unknown>;
  w.__cpMock = flag;
}

export default function ChartsProTab({ apiBase }: ChartsProTabProps) {
  const layoutRef = useRef<PersistedLayout | null>(null);
  const loadLayout = () => {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
    try {
      if (layoutRef.current) return layoutRef.current;
      const raw = window.localStorage.getItem(LAYOUT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedLayout>;
      const safe: PersistedLayout = {
        symbol: typeof parsed?.symbol === "string" && parsed.symbol.trim() ? parsed.symbol : DEFAULT_SYMBOL,
        timeframe: TIMEFRAME_OPTIONS.some((option) => option.value === parsed?.timeframe)
          ? (parsed?.timeframe as ChartTimeframe)
          : DEFAULT_TIMEFRAME,
        theme: parsed?.theme === "light" || parsed?.theme === "dark" ? (parsed.theme as ChartThemeName) : DEFAULT_THEME,
      };
      layoutRef.current = safe;
      return safe;
    } catch {
      return null;
    }
  };
  const persistLayout = (patch: Partial<PersistedLayout>) => {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
    try {
      const current =
        layoutRef.current ?? loadLayout() ?? { symbol: DEFAULT_SYMBOL, timeframe: DEFAULT_TIMEFRAME, theme: DEFAULT_THEME };
      const next = { ...current, ...patch };
      layoutRef.current = next;
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };
  const [symbol, setSymbolState] = useState(() => loadLayout()?.symbol ?? DEFAULT_SYMBOL);
  const [timeframe, setTimeframeState] = useState<ChartTimeframe>(() => loadLayout()?.timeframe ?? DEFAULT_TIMEFRAME);
  const [themeName, setThemeNameState] = useState<ChartThemeName>(() => loadLayout()?.theme ?? DEFAULT_THEME);
  const controls = useChartControls();
  const exportHandlersRef = useRef<ExportHandlers | null>(null);
  const buildSha = typeof __BUILD_SHA__ === "string" && __BUILD_SHA__ ? __BUILD_SHA__ : "dev";
  const buildTimeIso = typeof __BUILD_TIME__ === "string" && __BUILD_TIME__ ? __BUILD_TIME__ : "";
  const buildNote = typeof __LLM_NOTE__ === "string" && __LLM_NOTE__ ? __LLM_NOTE__ : "n/a";
  const lwVersion =
    (typeof __LW_VERSION__ === "string" && __LW_VERSION__) ||
    (typeof __LW_CHARTS_VERSION__ === "string" && __LW_CHARTS_VERSION__) ||
    "unknown";
  const readableBuildTime = useMemo(() => {
    const parsed = Date.parse(buildTimeIso);
    if (Number.isNaN(parsed)) return buildTimeIso || "unknown";
    return new Date(parsed).toLocaleString();
  }, [buildTimeIso]);

  const handleSymbolChange = useCallback(
    (value: string) => {
      const normalized = value.trim().toUpperCase() || DEFAULT_SYMBOL;
      setSymbolState(normalized);
      persistLayout({ symbol: normalized, timeframe, theme: themeName });
    },
    [timeframe, themeName],
  );

  const handleTimeframeChange = useCallback(
    (next: ChartTimeframe) => {
      setTimeframeState(next);
      persistLayout({ symbol, timeframe: next, theme: themeName });
    },
    [symbol, themeName],
  );

  const handleThemeChange = useCallback(
    (next: ChartThemeName) => {
      setThemeNameState(next);
      persistLayout({ symbol, timeframe, theme: next });
    },
    [symbol, timeframe],
  );

  useEffect(() => {
    return () => {
      exportHandlersRef.current = null;
    };
  }, []);
  const [mockMode, setMockMode] = useState<boolean>(() => readInitialMockFlag());
  const [debugMode, setDebugMode] = useState(false);
  const exposeQa = useMemo(() => {
    if (typeof window === "undefined") return false;
    const isMock = window.location.search.includes("mock=1");
    const isDev = typeof import.meta !== "undefined" && (import.meta as { env?: { MODE?: string } }).env?.MODE !== "production";
    return isMock || isDev;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyQueryFlags = () => {
      const params = new URLSearchParams(window.location.search);
      const debug = params.get("debug") === "1";
      setDebugMode(debug);
      if (params.has("mock")) {
        setMockMode(params.get("mock") === "1");
      }
    };
    applyQueryFlags();
    window.addEventListener("popstate", applyQueryFlags);
    return () => window.removeEventListener("popstate", applyQueryFlags);
  }, []);

  useEffect(() => {
    persistMockFlag(mockMode);
  }, [mockMode]);

  const { data, loading, error, meta, mode, reload } = useOhlcvQuery({
    apiBase,
    symbol,
    timeframe,
    mock: mockMode,
  });

  const theme = useMemo(() => getChartTheme(themeName), [themeName]);
  const drawingsStore = useDrawingsStore(symbol, timeframe as Tf);
  const { undo, redo } = drawingsStore;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [redo, undo]);

  const handleSaveLayout = async () => {
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, "")}/chart/layouts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: "v2",
          symbol,
          timeframe,
          drawings: drawingsStore.drawings,
          indicators: drawingsStore.indicators,
        }),
      });
      if (!res.ok) {
        if (res.status === 404 || res.status === 501) {
          toast.info("Backend layout missing, saving locally only");
          return;
        }
        throw new Error(await res.text());
      }
      toast.success("Layout saved");
    } catch {
      toast.info("Backend layout missing, saving locally only");
    }
  };

  const handleLoadLayout = async () => {
    try {
      const url = new URL(`${apiBase.replace(/\/$/, "")}/chart/layouts`);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("tf", timeframe);
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404 || res.status === 501) {
          toast.info("No layout on server, using local autosave");
          return;
        }
        throw new Error(await res.text());
      }
      const json = await res.json();
      const indicatorPayload = Array.isArray(json?.indicators)
        ? (json.indicators as typeof drawingsStore.indicators)
        : [];
      const drawingPayload = Array.isArray(json?.drawings)
        ? (json.drawings as typeof drawingsStore.drawings)
        : Array.isArray(json)
          ? (json as typeof drawingsStore.drawings)
          : null;
      if (!drawingPayload) {
        toast.info("No layout on server, using local autosave");
        return;
      }
      drawingsStore.setIndicators(indicatorPayload);
      drawingsStore.setDrawings(drawingPayload, { recordHistory: false });
      toast.success("Layout loaded");
    } catch {
      toast.info("No server layout found, using local autosave");
    }
  };
  const handleExportPng = async () => {
    const dataUrl = (await exportHandlersRef.current?.png?.()) ?? null;
    if (!dataUrl) {
      toast.error("PNG-export misslyckades");
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${symbol}-${timeframe}.png`;
    link.click();
  };

  const handleExportCsv = async () => {
    const csv = (await exportHandlersRef.current?.csv?.()) ?? null;
    if (!csv) {
      toast.error("CSV-export misslyckades");
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${symbol}-${timeframe}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMock = window.location.search.includes("mock=1");
    const timeframeSet = new Set(TIMEFRAME_OPTIONS.map((option) => option.value));
    const existing = (window.__lwcharts as LwChartsApi | undefined) ?? ({} as Partial<LwChartsApi>);
    const setter = existing.set;
    const applyPatch = (patch: Partial<LwChartsApi>) => {
      if (patch?.timeframe && timeframeSet.has(patch.timeframe as ChartTimeframe)) {
        handleTimeframeChange(patch.timeframe as ChartTimeframe);
      }
    };
    const patch: Partial<LwChartsApi> = {
      set: (payload?: Record<string, unknown>) => {
        if (!payload) return window.__lwcharts as LwChartsApi;
        // symbol/timeframe handling
        if (typeof payload.symbol === "string") {
          handleSymbolChange(payload.symbol as string);
        }
        if (typeof payload.timeframe === "string") {
          if (timeframeSet.has(payload.timeframe as ChartTimeframe)) {
            handleTimeframeChange(payload.timeframe as ChartTimeframe);
          } else {
            console.warn("[ChartsPro] Ignorerar ogiltigt timeframe", payload.timeframe);
          }
        }
        // inspector patch: dispatch event so chart viewport can react
        const hasInspectorOpen = typeof payload.inspectorOpen !== "undefined";
        const hasInspectorTab = typeof payload.inspectorTab === "string";
        const hasCompareScaleMode = typeof payload.compareScaleMode === "string";
        if (hasInspectorOpen || hasInspectorTab || hasCompareScaleMode) {
          try {
            const detail: Record<string, unknown> = {};
            if (hasInspectorOpen) detail.inspectorOpen = Boolean(payload.inspectorOpen);
            if (hasInspectorTab) {
              const normalized = normalizeInspectorTab(payload.inspectorTab);
              if (normalized) detail.inspectorTab = normalized;
            }
            if (hasCompareScaleMode) {
              const scaleMode = payload.compareScaleMode === "price" || payload.compareScaleMode === "percent"
                ? payload.compareScaleMode
                : null;
              if (scaleMode) detail.compareScaleMode = scaleMode;
            }
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("lwcharts:patch", { detail }));
            }
          } catch (e) {
            // ignore
          }
        }
        return window.__lwcharts as LwChartsApi;
      },
    };
    if (exposeQa || isMock) {
      patch._applyPatch = applyPatch;
      patch._qaForceDataMode = (mode?: 'live' | 'demo' | null) => {
        setQAForceDataMode(mode ?? null);
      };
      patch.debug = {
        ...(existing.debug ?? {}),
        qaFlags: () => ({
          href: typeof window !== "undefined" ? window.location.href : "",
          isMock,
          mode: typeof import.meta !== "undefined" ? (import.meta as { env?: { MODE?: string } }).env?.MODE : "unknown",
          hasApplyPatch: typeof window.__lwcharts?._applyPatch === "function",
        }),
      };
    }
    if (typeof setter === "function") {
      setter(patch as Partial<LwChartsApi>);
    } else {
      window.__lwcharts = { ...existing, ...patch } as LwChartsApi;
    }
  }, [exposeQa, handleSymbolChange, handleTimeframeChange]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        Charts Pro — build {buildSha} @ {readableBuildTime} — LW {lwVersion} — {buildNote}
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Charts Pro (Sprint 0)</CardTitle>
          <p className="text-sm text-slate-500">
            Målet är TradingView-paritet (egen overlay-motor, indikatorer i workers, alerts & layouts).
          </p>
          <p className="text-xs text-slate-500">Senaste update: {buildNote}</p>
          <p className="text-xs uppercase tracking-wide text-blue-500">
            Brief: <code>docs/LLM.md#project-charts-pro-tradingview-parity</code>
          </p>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          <p>
            Sprint 0 fokuserar på renderer + pan/zoom + theming. Ritverktyg, indikators och alerts kommer i nästa sprintar.
            Overlay-canvasen monteras redan nu så att ritmotor kan hookas in senare utan att röra pris-rendern.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live chart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wide text-slate-500">Data source</span>
                <div className="inline-flex overflow-hidden rounded border border-slate-700/60">
                  <button
                    type="button"
                    className={`px-3 py-1 font-semibold transition ${
                      mockMode ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800/30"
                    }`}
                    aria-pressed={mockMode}
                    onClick={() => setMockMode(true)}
                  >
                    ⚡ Mock
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 font-semibold transition ${
                      mockMode ? "text-slate-400 hover:bg-slate-800/30" : "bg-slate-800 text-slate-100"
                    } ${!getLastHealthCheck()?.ok ? 'opacity-50 cursor-not-allowed' : ''}`}
                    aria-pressed={!mockMode}
                    title={!getLastHealthCheck()?.ok ? 'API offline — using demo data' : ''}
                    onClick={() => {
                      const health = getLastHealthCheck();
                      if (!health?.ok) {
                        toast.error('API is offline. Using demo data.');
                        return;
                      }
                      setMockMode(false);
                    }}
                    disabled={!getLastHealthCheck()?.ok}
                  >
                    🟢 Live
                  </button>
                </div>
              </div>
              <ApiStatusBadge />
            </div>
            {debugMode ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Debug overlay</span>
            ) : null}
          </div>
          <Toolbar
            symbol={symbol}
            onSymbolChange={handleSymbolChange}
            timeframe={timeframe}
            onTimeframeChange={handleTimeframeChange}
            theme={themeName}
            onThemeChange={handleThemeChange}
            magnetEnabled={controls.magnet}
            snapEnabled={controls.snap}
            onMagnetToggle={controls.toggleMagnet}
            onSnapToggle={controls.toggleSnap}
            drawingTool={controls.tool}
            onDrawingToolChange={controls.setTool}
            onSaveLayout={handleSaveLayout}
            onLoadLayout={handleLoadLayout}
            onExportPng={() => {
              void handleExportPng();
            }}
            onExportCsv={() => {
              void handleExportCsv();
            }}
            loading={loading}
            onReload={reload}
            meta={meta}
          />
          {error ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* TV-4 Shell Layout */}
            <div className="tv-shell" data-testid="tv-shell">
              {/* Top Bar */}
              <div className="tv-topbar" data-testid="tv-topbar" />
              
              {/* Left Bar */}
              <div className="tv-leftbar" data-testid="tv-leftbar" />
              
              {/* Center Chart Root */}
              <div className="tv-chart-root" data-testid="tv-chart-root">
                <ChartViewport
                  apiBase={apiBase}
                  data={data}
                  meta={meta}
                  theme={theme}
                  loading={loading}
                  symbol={symbol}
                  timeframe={timeframe as Tf}
                  drawings={drawingsStore.drawings}
                  selectedId={drawingsStore.selectedId}
                  indicators={drawingsStore.indicators}
                  magnetEnabled={controls.magnet}
                  snapToClose={controls.snap}
                  onSelectDrawing={drawingsStore.selectDrawing}
                  onUpsertDrawing={drawingsStore.upsertDrawing}
                  onRemoveDrawing={drawingsStore.removeDrawing}
                  duplicateDrawing={drawingsStore.duplicateDrawing}
                  onToggleLock={drawingsStore.toggleLock}
                  onToggleHide={drawingsStore.toggleHidden}
                  onUpdateIndicator={drawingsStore.updateIndicator}
                  registerExports={(handlers) => {
                    exportHandlersRef.current = handlers;
                  }}
                  mockMode={mockMode}
                  debugMode={debugMode}
                  dataMode={mode}
                />
              </div>
              
              {/* Right Bar */}
              <div className="tv-rightbar" data-testid="tv-rightbar" />
              
              {/* Bottom Bar */}
              <div className="tv-bottombar" data-testid="tv-bottombar" />
            </div>
            <div className="space-y-4">
              <IndicatorPanel
                indicators={drawingsStore.indicators}
                onAdd={drawingsStore.addIndicator}
                onUpdate={drawingsStore.updateIndicator}
                onRemove={drawingsStore.removeIndicator}
              />
              <ObjectTree
                drawings={drawingsStore.drawings}
                selectedId={drawingsStore.selectedId}
                timeframe={timeframe as Tf}
                onSelect={drawingsStore.selectDrawing}
                onToggleHide={drawingsStore.toggleHidden}
                onToggleLock={drawingsStore.toggleLock}
                onDelete={drawingsStore.removeDrawing}
                onRename={drawingsStore.renameDrawing}
                onReorder={drawingsStore.reorderDrawing}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}





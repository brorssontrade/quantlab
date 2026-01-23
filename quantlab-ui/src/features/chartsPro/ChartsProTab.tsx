import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { TopBar } from "./components/TopBar";
import { ChartViewport } from "./components/ChartViewport";
import { BottomBar } from "./components/BottomBar";
import { LeftToolbar } from "./components/LeftToolbar/LeftToolbar";
import { ObjectTree } from "./components/ObjectTree";
import { IndicatorPanel } from "./components/IndicatorPanel";
import { AlertsPanel } from "./components/AlertsPanel";
import { TabsPanel, type RightPanelTab } from "./components/RightPanel/TabsPanel";
import { IndicatorsTab } from "./components/RightPanel/IndicatorsTab";
import { ObjectsTab } from "./components/RightPanel/ObjectsTab";
import { AlertsTab } from "./components/RightPanel/AlertsTab";
import { SettingsPanel, type ChartSettings, DEFAULT_SETTINGS } from "./components/TopBar/SettingsPanel";
import { LayoutManager, type SavedLayout } from "./components/TopBar/LayoutManager";
import { ApiStatusBadge } from "./components/ApiStatusBadge";
import { ModalPortal } from "./components/Modal/ModalPortal";
import { IndicatorsModal } from "./components/Modal/IndicatorsModal";
import { TextModal } from "./components/Modal/TextModal";
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
const WORKSPACE_KEY = "cp.workspace";
const CHART_TYPE_KEY = "cp.chart.type";
const SETTINGS_KEY_PREFIX = "cp.settings";

type PersistedLayout = { symbol: string; timeframe: ChartTimeframe; theme: ChartThemeName };
type WorkspaceLayout = { mode: boolean; sidebarCollapsed: boolean; sidebarWidth: number };

type ChartType = "candles" | "bars" | "line" | "area";
const DEFAULT_CHART_TYPE: ChartType = "candles";

function loadChartType(): ChartType {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return DEFAULT_CHART_TYPE;
  }
  try {
    const stored = window.localStorage.getItem(CHART_TYPE_KEY);
    const validTypes: ChartType[] = ["candles", "bars", "line", "area"];
    if (stored && validTypes.includes(stored as ChartType)) {
      return stored as ChartType;
    }
    return DEFAULT_CHART_TYPE;
  } catch {
    return DEFAULT_CHART_TYPE;
  }
}

function persistChartType(type: ChartType) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(CHART_TYPE_KEY, type);
  } catch {
    // ignore quota errors
  }
}

/**
 * Load chart settings from localStorage.
 * Keys: cp.settings.appearance.*, cp.settings.scales.*
 */
function loadSettings(): ChartSettings {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return DEFAULT_SETTINGS;
  }
  try {
    const appearance = {
      candleUpColor: window.localStorage.getItem(`${SETTINGS_KEY_PREFIX}.appearance.candleUpColor`) || DEFAULT_SETTINGS.appearance.candleUpColor,
      candleDownColor: window.localStorage.getItem(`${SETTINGS_KEY_PREFIX}.appearance.candleDownColor`) || DEFAULT_SETTINGS.appearance.candleDownColor,
      wickVisible: window.localStorage.getItem(`${SETTINGS_KEY_PREFIX}.appearance.wickVisible`) === "true" || DEFAULT_SETTINGS.appearance.wickVisible,
      borderVisible: window.localStorage.getItem(`${SETTINGS_KEY_PREFIX}.appearance.borderVisible`) === "true" || DEFAULT_SETTINGS.appearance.borderVisible,
      gridVisible: window.localStorage.getItem(`${SETTINGS_KEY_PREFIX}.appearance.gridVisible`) === "true" || DEFAULT_SETTINGS.appearance.gridVisible,
      backgroundDark: window.localStorage.getItem(`${SETTINGS_KEY_PREFIX}.appearance.backgroundDark`) === "true" || DEFAULT_SETTINGS.appearance.backgroundDark,
    };
    const scalesMode = window.localStorage.getItem(`${SETTINGS_KEY_PREFIX}.scales.mode`);
    const scales = {
      mode: (scalesMode === "auto" || scalesMode === "log" || scalesMode === "percent") ? scalesMode : DEFAULT_SETTINGS.scales.mode,
    };
    return { appearance, scales };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Persist chart settings to localStorage.
 */
function persistSettings(settings: ChartSettings) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(`${SETTINGS_KEY_PREFIX}.appearance.candleUpColor`, settings.appearance.candleUpColor);
    window.localStorage.setItem(`${SETTINGS_KEY_PREFIX}.appearance.candleDownColor`, settings.appearance.candleDownColor);
    window.localStorage.setItem(`${SETTINGS_KEY_PREFIX}.appearance.wickVisible`, String(settings.appearance.wickVisible));
    window.localStorage.setItem(`${SETTINGS_KEY_PREFIX}.appearance.borderVisible`, String(settings.appearance.borderVisible));
    window.localStorage.setItem(`${SETTINGS_KEY_PREFIX}.appearance.gridVisible`, String(settings.appearance.gridVisible));
    window.localStorage.setItem(`${SETTINGS_KEY_PREFIX}.appearance.backgroundDark`, String(settings.appearance.backgroundDark));
    window.localStorage.setItem(`${SETTINGS_KEY_PREFIX}.scales.mode`, settings.scales.mode);
  } catch {
    // ignore quota errors
  }
}

function loadWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return { mode: true, sidebarCollapsed: false, sidebarWidth: 320 };
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return { mode: true, sidebarCollapsed: false, sidebarWidth: 320 };
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayout>;
    return {
      mode: parsed.mode ?? true,
      sidebarCollapsed: parsed.sidebarCollapsed ?? false,
      sidebarWidth: typeof parsed.sidebarWidth === "number" ? Math.max(280, Math.min(600, parsed.sidebarWidth)) : 320,
    };
  } catch {
    return { mode: true, sidebarCollapsed: false, sidebarWidth: 320 };
  }
}

function persistWorkspaceLayout(layout: WorkspaceLayout) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(layout));
  } catch {
    // ignore quota errors
  }
}

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
  const chartRef = useRef<any>(null); // IChartApi reference for BottomBar
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
  const [chartType, setChartTypeState] = useState<ChartType>(() => loadChartType());
  const [settings, setSettings] = useState<ChartSettings>(() => loadSettings());
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [layoutManagerOpen, setLayoutManagerOpen] = useState(false);
  // TV-19.3: Timezone mode (UTC / Local) - controlled by ChartsProTab, passed to BottomBar
  const [timezoneMode, setTimezoneMode] = useState<"UTC" | "Local">(() => {
    if (typeof window === "undefined") return "UTC";
    try {
      const stored = window.localStorage?.getItem("cp.bottomBar.timezoneMode");
      if (stored === "Local") return "Local";
      return "UTC";
    } catch {
      return "UTC";
    }
  });
  // TV-19.4: Scale mode (auto/log/percent) - controlled by ChartsProTab
  const [scaleMode, setScaleMode] = useState<"auto" | "log" | "percent">(() => {
    if (typeof window === "undefined") return "auto";
    try {
      const stored = window.localStorage?.getItem("cp.bottomBar.scaleMode");
      if (stored === "log" || stored === "percent") return stored;
      return "auto";
    } catch {
      return "auto";
    }
  });
  // TV-18.1: Modal state (central portal for indicators/other modals)
  const [modalState, setModalState] = useState<{ open: boolean; kind: string | null }>({ open: false, kind: null });
  // TV-20.3: Text editing modal state (stores drawing ID being edited)
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState(() => loadWorkspaceLayout().mode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadWorkspaceLayout().sidebarCollapsed);
  const [sidebarWidth] = useState(() => loadWorkspaceLayout().sidebarWidth);
  const [viewportWidth, setViewportWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 1440;
    return window.innerWidth;
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [rightPanelActiveTab, setRightPanelActiveTab] = useState<RightPanelTab | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage?.getItem("cp.rightPanel.activeTab");
      if (raw === "") return null; // explicit closed state
      if (!raw) return null; // default closed
      const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const valid: RightPanelTab[] = ["indicators", "objects", "alerts"];
      if (valid.includes(v as RightPanelTab)) return v as RightPanelTab;
      window.localStorage?.setItem("cp.rightPanel.activeTab", "indicators");
      return "indicators";
    } catch {
      return null;
    }
  });

  // TV-18.2: indicatorsAddOpen state removed - modal state handles this now

  const controls = useChartControls();
  // Responsive breakpoints: mobile <768, tablet 768-1279, desktop ≥1280
  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1280;
  const isDesktop = viewportWidth >= 1280;
  const isToolbarCompact = viewportWidth < 1100;
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

  // TV-12: TopBar actions -> RightPanel wiring
  // TV-18.2: Indicators button opens central modal (TradingView-style)
  const handleIndicatorsClick = useCallback(() => {
    // Open indicators modal (portal), keep RightPanel as list view
    setModalState({ open: true, kind: "indicators" });
  }, []);

  const handleAlertsClick = useCallback(() => {
    if (rightPanelActiveTab === "alerts") {
      setRightPanelActiveTab(null); // Toggle off
      try {
        window.localStorage?.setItem("cp.rightPanel.activeTab", "");
      } catch {
        // ignore
      }
    } else {
      setRightPanelActiveTab("alerts");
      try {
        window.localStorage?.setItem("cp.rightPanel.activeTab", "alerts");
      } catch {
        // ignore
      }
    }
  }, [rightPanelActiveTab]);

  const handleObjectsClick = useCallback(() => {
    if (rightPanelActiveTab === "objects") {
      setRightPanelActiveTab(null); // Toggle off
      try {
        window.localStorage?.setItem("cp.rightPanel.activeTab", "");
      } catch {
        // ignore
      }
    } else {
      setRightPanelActiveTab("objects");
      try {
        window.localStorage?.setItem("cp.rightPanel.activeTab", "objects");
      } catch {
        // ignore
      }
    }
  }, [rightPanelActiveTab]);

  // TV-19.3: Handle timezone toggle (UTC <-> Local)
  const handleTimezoneToggle = useCallback((mode: "UTC" | "Local") => {
    setTimezoneMode(mode);
    try {
      window.localStorage?.setItem("cp.bottomBar.timezoneMode", mode);
    } catch {
      // ignore storage errors
    }
  }, []);

  // TV-19.4: Handle scale mode change (auto/log/percent)
  const handleScaleModeChange = useCallback((mode: string) => {
    const validMode = mode === "log" || mode === "percent" ? mode : "auto";
    setScaleMode(validMode);
    try {
      window.localStorage?.setItem("cp.bottomBar.scaleMode", validMode);
    } catch {
      // ignore storage errors
    }
  }, []);

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

  const handleChartTypeChange = useCallback((next: ChartType) => {
    setChartTypeState(next);
    persistChartType(next);
  }, []);

  const toggleWorkspaceMode = useCallback(() => {
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
    setWorkspaceMode((prev) => {
      const next = !prev;
      persistWorkspaceLayout({ mode: next, sidebarCollapsed, sidebarWidth });
      return next;
    });
  }, [isMobile, sidebarCollapsed, sidebarWidth]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    setSidebarCollapsed((prev) => {
      const next = !prev;
      persistWorkspaceLayout({ mode: workspaceMode, sidebarCollapsed: next, sidebarWidth });
      return next;
    });
  }, [isMobile, workspaceMode, sidebarWidth]);

  useEffect(() => {
    return () => {
      exportHandlersRef.current = null;
    };
  }, []);

  // TV-3.8: Restore persisted tool selection on mount
  useEffect(() => {
    controls.restoreToolFromStorage();
  }, [controls]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
      setMobileSidebarOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (isTablet) {
      setSidebarCollapsed(true);
    }
  }, [isTablet]);
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

  // Ensure production (non-QA) defaults to Live and hides toggle
  useEffect(() => {
    if (!exposeQa && mockMode) {
      setMockMode(false);
    }
  }, [exposeQa, mockMode]);

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
    setLayoutManagerOpen(true);
  };

  const handleLoadLayout = async () => {
    setLayoutManagerOpen(true);
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
      // Allow QA to set the active drawing tool
      const nextTool = (patch as any)?.activeTool ?? (patch as any)?.tool;
      if (typeof nextTool === "string") {
        const validTools = new Set(["select", "hline", "vline", "trendline", "channel", "rectangle", "text", "priceRange", "dateRange"]);
        if (validTools.has(nextTool)) {
          controls.setTool(nextTool as any);
        }
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
        if (typeof (payload as any).activeTool === "string" || typeof (payload as any).tool === "string") {
          const tool = ((payload as any).activeTool ?? (payload as any).tool) as string;
          const validTools = new Set(["select", "hline", "vline", "trendline", "channel", "rectangle", "text", "priceRange", "dateRange"]);
          if (validTools.has(tool)) controls.setTool(tool as any);
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
    <div
      className={workspaceMode ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "space-y-4"}
    >
      {!workspaceMode && (
        <>
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
        </>
      )}

      <Card className={workspaceMode ? "flex flex-col flex-1 min-h-0 border-0 shadow-none" : ""}>
        {!workspaceMode && (
          <CardHeader>
            <CardTitle>Live chart</CardTitle>
          </CardHeader>
        )}
        <CardContent className={workspaceMode ? "flex flex-col flex-1 min-h-0 p-0" : "space-y-4"}>
          <div className={workspaceMode ? "flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/40 border-b border-slate-800/60" : "flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"}>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={toggleWorkspaceMode}
                className="px-2 py-1 text-xs font-medium rounded hover:bg-slate-800/60 transition"
                title={workspaceMode ? "Exit workspace mode" : "Enter workspace mode"}
                data-testid="workspace-toggle-btn"
              >
                {workspaceMode ? "📐 Workspace" : "📋 Info"}
              </button>
              {exposeQa ? (
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
              ) : (
                <span className="uppercase tracking-wide text-slate-500">Live data</span>
              )}
              <ApiStatusBadge />
            </div>
            {debugMode ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Debug overlay</span>
            ) : null}
          </div>
          <TopBar
            symbol={symbol}
            onSymbolChange={handleSymbolChange}
            timeframe={timeframe}
            onTimeframeChange={handleTimeframeChange}
            chartType={chartType}
            onChartTypeChange={handleChartTypeChange}
            onSettingsClick={() => setSettingsPanelOpen(true)}
            onIndicatorsClick={handleIndicatorsClick}
            onAlertsClick={handleAlertsClick}
            onObjectsClick={handleObjectsClick}
            theme={themeName}
            onThemeChange={handleThemeChange}
            magnetEnabled={controls.magnet}
            snapEnabled={controls.snap}
            onMagnetToggle={controls.toggleMagnet}
            onSnapToggle={controls.toggleSnap}
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
            isCompact={isToolbarCompact}
            showPanelsButton={isMobile}
            onOpenPanelsDrawer={() => {
              setSidebarCollapsed(true);
              setMobileSidebarOpen(true);
            }}
          />
          
          {/* Settings Panel Overlay (TV-10.2) */}
          <SettingsPanel
            isOpen={settingsPanelOpen}
            onClose={() => setSettingsPanelOpen(false)}
            settings={settings}
            onChange={(newSettings) => {
              setSettings(newSettings);
              persistSettings(newSettings);
            }}
          />

          {/* TV-12 Layout Manager Overlay */}
          <LayoutManager
            isOpen={layoutManagerOpen}
            onClose={() => setLayoutManagerOpen(false)}
            onSave={(name: string, _layout: SavedLayout) => {
              toast.success(`Layout "${name}" saved`);
              setLayoutManagerOpen(false);
            }}
            onLoad={(name: string) => {
              toast.success(`Layout "${name}" loaded`);
              setLayoutManagerOpen(false);
            }}
            onDelete={(name: string) => {
              toast.success(`Layout "${name}" deleted`);
            }}
            currentState={{
              symbol,
              timeframe,
              chartType,
            }}
          />

          {error ? (
            <div className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
              {(error.toLowerCase().includes('not found') || 
                error.toLowerCase().includes('failed to fetch') || 
                error.toLowerCase().includes('timeout')) && (
                <p className="text-xs text-amber-700 dark:text-amber-300 ml-6">
                  💡 Ensure backend is running on port 8000:{' '}
                  <code className="bg-amber-100 dark:bg-amber-800/50 px-1 rounded">
                    uvicorn app.main:app --port 8000
                  </code>
                  {' '}— or enable Mock mode above.
                </p>
              )}
            </div>
          ) : null}
          <div
            className={
              workspaceMode
                ? `flex ${isMobile ? "flex-col" : "flex-row"} flex-1 min-h-0`
                : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
            }
            style={workspaceMode ? { gap: "var(--cp-gap)" } : undefined}
            data-testid="chartspro-workspace"
          >
            {/* TV-4 Shell Layout */}
            <div
              className={workspaceMode ? "tv-shell flex-1 min-w-0 rounded-[var(--cp-radius)] bg-slate-900/30" : "tv-shell"}
              data-testid="tv-shell"
            >
              {/* Top Bar */}
              <div className="tv-topbar" data-testid="tv-topbar" />
              
              {/* Left Bar */}
              <div className="tv-leftbar" data-testid="tv-leftbar">
                <LeftToolbar
                  activeTool={controls.tool}
                  onSelectTool={(tool) => {
                    controls.setTool(tool);
                  }}
                />
              </div>
              
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
                  chartType={chartType}
                  chartSettings={settings}
                  priceScaleMode={scaleMode}
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
                  onTextCreated={(drawingId) => setEditingTextId(drawingId)}
                  onTextEdit={(drawingId) => setEditingTextId(drawingId)}
                  registerExports={(handlers) => {
                    exportHandlersRef.current = handlers;
                  }}
                  onChartReady={(chart) => {
                    chartRef.current = chart;
                  }}
                  mockMode={mockMode}
                  debugMode={debugMode}

                  workspaceMode={workspaceMode}
                  sidebarCollapsed={sidebarCollapsed}
                  sidebarWidth={sidebarWidth}
                  rightPanelActiveTab={workspaceMode ? rightPanelActiveTab : null}
                  
                  modalOpen={modalState.open || editingTextId !== null}
                  modalKind={editingTextId !== null ? "text" : modalState.kind}
                />
              </div>
              
              {/* Right Bar */}
              <div className="tv-rightbar" data-testid="tv-rightbar">
                {workspaceMode ? (
                  <TabsPanel
                    indicatorsPanel={
                      <IndicatorsTab
                        indicators={drawingsStore.indicators}
                        onAdd={drawingsStore.addIndicator}
                        onUpdate={drawingsStore.updateIndicator}
                        onRemove={drawingsStore.removeIndicator}
                        onOpenModal={() => setModalState({ open: true, kind: "indicators" })}
                      />
                    }
                    objectsPanel={
                      <ObjectsTab
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
                    }
                    alertsPanel={
                      <AlertsTab
                        apiBase={apiBase}
                        symbol={symbol}
                        timeframe={timeframe as Tf}
                        selectedDrawing={
                          drawingsStore.selectedId
                            ? drawingsStore.drawings.find((d) => d.id === drawingsStore.selectedId) ?? null
                            : null
                        }
                      />
                    }
                    activeTab={rightPanelActiveTab}
                    onChangeActiveTab={(tab) => setRightPanelActiveTab(tab)}
                    collapsed={sidebarCollapsed}
                    onToggleCollapsed={toggleSidebar}
                    isDesktop={isDesktop}
                  />
                ) : null}
              </div>
              
              {/* Bottom Bar */}
              <BottomBar 
                chart={chartRef.current}
                dataBounds={data?.length > 0 ? {
                  firstBarTime: Number(data[0].time),
                  lastBarTime: Number(data[data.length - 1].time),
                  dataCount: data.length,
                  barTimes: data.map(d => Number(d.time)),
                } : undefined}
                timezoneMode={timezoneMode}
                onTimezoneToggle={handleTimezoneToggle}
                marketStatus={loading ? "LOADING" : mode === "live" ? "LIVE" : mode === "demo" ? "DEMO" : "OFFLINE"}
                scaleMode={scaleMode}
                onScaleModeChange={handleScaleModeChange}
              />
            </div>
            {!workspaceMode && !isMobile && !sidebarCollapsed && (
              <div
                className={
                  workspaceMode
                    ? "flex flex-col border-l border-slate-800/60 bg-slate-900/40 overflow-hidden"
                    : "space-y-4 overflow-y-auto max-h-[calc(100vh-200px)] pr-1"
                }
                style={
                  workspaceMode
                    ? isDesktop
                      ? { width: "clamp(var(--cp-sidebar-w-min), 25vw, var(--cp-sidebar-w-max))" }
                      : { width: "var(--cp-sidebar-w-laptop)" }
                    : undefined
                }
                data-testid="chartspro-sidebar"
              >
                {workspaceMode && (
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60">
                    <span className="text-xs font-medium text-slate-300">Panels</span>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      className="px-2 py-1 text-xs hover:bg-slate-800/60 rounded transition"
                      title="Collapse sidebar"
                      data-testid="collapse-sidebar-btn"
                    >
                      ❯
                    </button>
                  </div>
                )}
                <div className={workspaceMode ? "flex-1 overflow-y-auto px-3 py-2 space-y-3" : "space-y-4"} data-testid="sidebar-content">
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
                  <AlertsPanel
                    apiBase={apiBase}
                    symbol={symbol}
                    timeframe={timeframe as Tf}
                    selectedDrawing={
                      drawingsStore.selectedId
                        ? drawingsStore.drawings.find((d) => d.id === drawingsStore.selectedId) ?? null
                        : null
                    }
                  />
                </div>
              </div>
            )}
            {!workspaceMode && !isMobile && sidebarCollapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex items-center justify-center w-8 border-l border-slate-800/60 bg-slate-900/40 hover:bg-slate-800/60 transition text-slate-400"
                title="Expand sidebar"
                data-testid="expand-sidebar-btn"
              >
                ❮
              </button>
            )}
          </div>
          {isMobile ? (
            <div className="flex justify-end px-3 py-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/60 transition"
                data-testid="open-sidebar-drawer-btn"
              >
                🗂️ Panels
              </button>
            </div>
          ) : null}
          {isMobile && mobileSidebarOpen ? (
            <div
              className="fixed inset-0 z-40 flex flex-col"
              data-testid="sidebar-drawer-backdrop"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <div
                className="mt-auto chartspro-drawer rounded-t-[var(--cp-radius)] px-4 py-3"
                data-testid="sidebar-drawer"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">Panels</span>
                  <button
                    type="button"
                    onClick={() => setMobileSidebarOpen(false)}
                    className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800/60"
                    data-testid="close-sidebar-drawer-btn"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-0 py-1 space-y-3" data-testid="sidebar-content">
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
                  <AlertsPanel
                    apiBase={apiBase}
                    symbol={symbol}
                    timeframe={timeframe as Tf}
                    selectedDrawing={
                      drawingsStore.selectedId
                        ? drawingsStore.drawings.find((d) => d.id === drawingsStore.selectedId) ?? null
                        : null
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* TV-18.2: Indicators modal (central, TradingView-style) */}
      <ModalPortal
        open={modalState.open && modalState.kind === "indicators"}
        kind="indicators"
        onClose={() => setModalState({ open: false, kind: null })}
      >
        <IndicatorsModal
          onAdd={drawingsStore.addIndicator}
          onClose={() => setModalState({ open: false, kind: null })}
        />
      </ModalPortal>

      {/* TV-20.3: Text editing modal */}
      <ModalPortal
        open={editingTextId !== null}
        kind="text"
        onClose={() => {
          // Cancel: remove the text drawing if it still has placeholder content
          if (editingTextId) {
            const drawing = drawingsStore.drawings.find((d) => d.id === editingTextId);
            if (drawing?.kind === "text" && drawing.content === "Text") {
              drawingsStore.removeDrawing(editingTextId);
            }
          }
          setEditingTextId(null);
        }}
      >
        <TextModal
          initialContent={
            editingTextId
              ? (drawingsStore.drawings.find((d) => d.id === editingTextId) as { content?: string } | undefined)?.content ?? "Text"
              : "Text"
          }
          onSave={(content) => {
            if (editingTextId) {
              const existing = drawingsStore.drawings.find((d) => d.id === editingTextId);
              if (existing?.kind === "text") {
                drawingsStore.upsertDrawing({
                  ...existing,
                  content,
                  updatedAt: Date.now(),
                });
              }
            }
            setEditingTextId(null);
          }}
          onCancel={() => {
            // Cancel: remove the text drawing if it still has placeholder content
            if (editingTextId) {
              const drawing = drawingsStore.drawings.find((d) => d.id === editingTextId);
              if (drawing?.kind === "text" && drawing.content === "Text") {
                drawingsStore.removeDrawing(editingTextId);
              }
            }
            setEditingTextId(null);
          }}
        />
      </ModalPortal>
    </div>
  );
}





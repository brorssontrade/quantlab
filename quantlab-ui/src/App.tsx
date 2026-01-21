import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Loader2, Activity, Play, RefreshCcw, PlugZap, Send, X } from "lucide-react";

import SearchableSelect from "@/components/SearchableSelect";
import ChartsProTab from "@/features/chartsPro";
import FundamentalsTab from "@/features/fundamentals/FundamentalsTab";
import AssistantTab from "@/features/assistant/AssistantTab";
import LibraryTab from "@/features/library/LibraryTab";

interface OptimizeResponse { ok: boolean; run_id: number; workdir?: string | null; stdout_tail?: string | null }
interface RunItem {
  id: number;
  strategy_id: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  workdir?: string | null;
  metric_name?: string | null;
  metric_value?: number | null;
}
interface LiveJobItem {
  id: number;
  strategy_id: string;
  schedule: string;
  enabled: boolean;
  last_run?: string | null;
  last_status?: string | null;
  threshold?: number | null;
  top?: number | null;
  description?: string | null;
}

interface HistogramBin { bin_start: number; bin_end: number; count: number; }

interface ReportResponse {
  schema_version?: number;
  metrics: Record<string, number | string>;
  metrics_table?: Record<string, string>;
  trade_analysis?: Record<string, number | string>;
  equity: { ts: string; equity: number }[];
  drawdown?: { ts: string; dd: number }[];
  rolling_sharpe?: { ts: string; sharpe: number }[];
  trades: UnknownRecord[];
  period_returns?: UnknownRecord[];
  rolling_windows?: UnknownRecord[];
  daily_returns_histogram?: HistogramBin[];
  inputs?: UnknownRecord;
}
interface JournalSummary {
  trade_count: number;
  realized_pnl: number;
  unrealized_pnl: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  equity?: { ts: string; equity: number; Ts?: string; Equity?: number }[];
}

type UnknownRecord = Record<string, unknown>;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

const DEFAULT_STRATEGIES = ["bb_kc_squeeze", "obi", "rsi_reversal", "breakout_channels"];

const SYMBOL_SPLIT_REGEX = /[,\\s]+/;

function parseSymbolsList(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  input
    .split(SYMBOL_SPLIT_REGEX)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      result.push(item);
    });
  return result;
}
const SAMPLE_SIGNALS = [
  { Symbol: "AAPL.US", Score: 0.9, Signal: 1 },
  { Symbol: "MSFT.US", Score: 0.85, Signal: 1 },
  { Symbol: "NVDA.US", Score: 0.8, Signal: 1 },
];
const SAMPLE_EQUITY = SAMPLE_SIGNALS.map((_, idx) => ({ ts: `sample-${idx}`, equity: 1 + idx * 0.001 }));

function useLocalState<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(val));
  }, [key, val]);
  return [val, setVal] as const;
}

async function apiFetch(base: string, path: string, init?: RequestInit) {
  const url = `${base.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

function computeCostBps(opts: {
  commissionUsdPerTrade?: number;
  commissionPct?: number;
  slippagePct?: number;
  slippageBps?: number;
  tradeValue?: number;
}): number {
  const tradeVal = Math.max(0, opts.tradeValue ?? 0);
  let bps = 0;
  if ((opts.commissionUsdPerTrade ?? 0) > 0 && tradeVal > 0) {
    bps += (opts.commissionUsdPerTrade! / tradeVal) * 10000;
  }
  if ((opts.commissionPct ?? 0) > 0) {
    bps += (opts.commissionPct! * 100);
  }
  if ((opts.slippagePct ?? 0) > 0) {
    bps += (opts.slippagePct! * 100);
  }
  if ((opts.slippageBps ?? 0) > 0) {
    bps += opts.slippageBps!;
  }
  return Number(bps.toFixed(4));
}

function computeCostBpsFromSek(opts: {
  commissionSekPerTrade?: number;
  commissionPct?: number;
  slippagePct?: number;
  slippageBps?: number;
  sekPerTrade?: number;
  sekPerUsd?: number;
}): number {
  const sekPerUsd = opts.sekPerUsd && opts.sekPerUsd > 0 ? opts.sekPerUsd : 10;
  const tradeUsd = opts.sekPerTrade ? opts.sekPerTrade / sekPerUsd : undefined;
  const commissionUsd = opts.commissionSekPerTrade ? opts.commissionSekPerTrade / sekPerUsd : undefined;
  return computeCostBps({
    commissionUsdPerTrade: commissionUsd,
    commissionPct: opts.commissionPct,
    slippagePct: opts.slippagePct,
    slippageBps: opts.slippageBps,
    tradeValue: tradeUsd,
  });
}


export default function QuantLabApp() {
  const [apiBase, setApiBase] = useLocalState<string>("ql/apiBase", "http://127.0.0.1:8000");
  const [strategy, setStrategy] = useLocalState<string>("ql/strategy", "obi");
  const [nTrials, setNTrials] = useLocalState<number>("ql/ntrials", 30);
  const [workdir, setWorkdir] = useLocalState<string>("ql/workdir", "");
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [live, setLive] = useState<LiveJobItem[]>([]);
  const [schedule, setSchedule] = useLocalState("ql/schedule", "cron:5 17 * * 1-5");
  const [threshold, setThreshold] = useLocalState<number>("ql/threshold", 0.55);
  const [top, setTop] = useLocalState<number>("ql/top", 10);
  const [notifySlack, setNotifySlack] = useLocalState<boolean>("ql/notifySlack", true);
  const [notifyTelegram, setNotifyTelegram] = useLocalState<boolean>("ql/notifyTelegram", false);
  const [livePreview, setLivePreview] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useLocalState<string>("ql/tab", "dashboard");

  const [strategies, setStrategies] = useState<string[]>(DEFAULT_STRATEGIES);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbol, setSymbol] = useLocalState<string>("ql/symbol", "");
  const [symbolsCsv, setSymbolsCsv] = useLocalState<string>("ql/symbolsCsv", "");
  const [additionalSymbolDraft, setAdditionalSymbolDraft] = useState<string>("");
  const [multiSymbolMode, setMultiSymbolMode] = useLocalState<boolean>("ql/multiSymbols", false);
  const [startDate, setStartDate] = useLocalState<string>("ql/startDate", "");
  const [endDate, setEndDate] = useLocalState<string>("ql/endDate", "");
  const [bar, setBar] = useLocalState<string>("ql/bar", "D");
  const [pricesOverride, setPricesOverride] = useLocalState<string>("ql/pricesOverride", "");
  const [initialCapital, setInitialCapital] = useLocalState<number>("ql/initCap", 100000);
  const [tradeSizingMode, setTradeSizingMode] = useLocalState<"sek_per_trade"|"fixed_units">("ql/sizingMode", "sek_per_trade");
  const [sekPerTrade, setSekPerTrade] = useLocalState<number>("ql/sekPerTrade", 10000);
  const [unitsPerTrade, setUnitsPerTrade] = useLocalState<number>("ql/unitsPerTrade", 100);
  const [commissionSek, setCommissionSek] = useLocalState<number>("ql/commissionSek", 5);
  const [commPct, setCommPct] = useLocalState<number>("ql/commPct", 0);
  const [slipPct, setSlipPct] = useLocalState<number>("ql/slipPct", 0.04);
  const [slipBps, setSlipBps] = useLocalState<number>("ql/slipBps", 0);
  const [fxSekPerUsd, setFxSekPerUsd] = useLocalState<number>("ql/fxSekPerUsd", 10);

  const additionalSymbols = useMemo(() => parseSymbolsList(symbolsCsv), [symbolsCsv]);

  const handleAddAdditionalSymbol = useCallback((code: string) => {
    const cleaned = code.trim().toUpperCase();
    if (!cleaned) return;
    const primary = symbol.trim().toUpperCase();
    if (cleaned === primary) return;
    setSymbolsCsv((prev) => {
      const current = parseSymbolsList(prev);
      if (current.includes(cleaned)) return prev;
      return [...current, cleaned].join(", ");
    });
  }, [setSymbolsCsv, symbol]);

  const handleRemoveAdditionalSymbol = useCallback((code: string) => {
    setSymbolsCsv((prev) => {
      const current = parseSymbolsList(prev);
      const filtered = current.filter((item) => item !== code);
      if (filtered.length === current.length) return prev;
      return filtered.join(", ");
    });
  }, [setSymbolsCsv]);

  const [reportRunId, setReportRunId] = useLocalState<number | null>("ql/reportRunId", null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [signalsRows, setSignalsRows] = useState<UnknownRecord[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);

  const [breadthData, setBreadthData] = useState<UnknownRecord | null>(null);
  const [breadthLoading, setBreadthLoading] = useState(false);
  const [moversData, setMoversData] = useState<UnknownRecord[]>([]);
  const [moversLoading, setMoversLoading] = useState(false);
  const [moversPeriod, setMoversPeriod] = useLocalState<string>("ql/moversPeriod", "1d");
  const [moversTop, setMoversTop] = useLocalState<number>("ql/moversTop", 25);
  const [hotlistName, setHotlistName] = useLocalState<string>("ql/hotlistName", "gainers");
  const [hotlistItems, setHotlistItems] = useState<UnknownRecord[]>([]);
  const [hotlistLoading, setHotlistLoading] = useState(false);
  const [postMessage, setPostMessage] = useState("");
  const [postLoading, setPostLoading] = useState(false);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  const effectiveBps = useMemo(() => computeCostBpsFromSek({
    commissionSekPerTrade: commissionSek,
    commissionPct: commPct,
    slippagePct: slipPct,
    slippageBps: slipBps,
    sekPerTrade: sekPerTrade,
    sekPerUsd: fxSekPerUsd,
  }), [commissionSek, commPct, slipPct, slipBps, sekPerTrade, fxSekPerUsd]);

    const tradeColumns = useMemo(() => (
    report?.trades && report.trades.length
      ? Array.from(new Set(report.trades.flatMap((row) => Object.keys(row))))
      : []
  ), [report]);
  const periodKeys = useMemo(() => (
    report?.period_returns && report.period_returns.length
      ? Object.keys(report.period_returns[0])
      : []
  ), [report]);
  const rollingWindowKeys = useMemo(() => (
    report?.rolling_windows && report.rolling_windows.length
      ? Object.keys(report.rolling_windows[0])
      : []
  ), [report]);

const reloadRuns = async () => {
    try {
      const data = await apiFetch(apiBase, "/runs");
      setRuns(data.items || []);
    } catch (error: unknown) {
      toast.error(`Runs: ${getErrorMessage(error)}`);
    }
  };

  const reloadLive = async () => {
    try {
      const data = await apiFetch(apiBase, "/live");
      setLive(data.items || []);
    } catch (error: unknown) {
      toast.error(`Live: ${getErrorMessage(error)}`);
    }
  };

  const reloadMeta = async () => {
    try {
      const s = await apiFetch(apiBase, "/meta/strategies");
      if (Array.isArray(s?.items) && s.items.length) {
        setStrategies(s.items);
      }
    } catch {
      // optional endpoint
    }
    try {
      const s = await apiFetch(apiBase, "/meta/symbols");
      if (Array.isArray(s?.items) && s.items.length) {
        setSymbols(s.items);
      }
    } catch {
      // optional endpoint
    }
  };

  const fetchReport = async (runId: number) => {
    setReportLoading(true);
    try {
      const data: ReportResponse = await apiFetch(apiBase, `/runs/${runId}/report`);
      setReport(data);
      toast.success(`Loaded report for run ${runId}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const fetchSignalsView = async () => {
    if (!workdir) return toast.warning("Workdir required");
    setSignalsLoading(true);
    try {
      const res = await apiFetch(apiBase, "/signals/latest/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, workdir, top, threshold }),
      });
      const rows = res.items || res.rows || [];
      setSignalsRows(rows);
      toast.success(`Loaded signals (${rows.length})`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || "Signals view not available");
      setSignalsRows([]);
    } finally {
      setSignalsLoading(false);
    }
  };

  const runOptimize = async () => {
    if (!strategy) {
      toast.warning("Strategy required");
      return;
    }
    setOptimizeLoading(true);
    try {
      const csvSymbols = symbolsCsv.split(/[,+\\s]+/).map((s) => s.trim()).filter(Boolean);
      const singleSymbol = symbol.trim();
      const symbolsPayload = multiSymbolMode ? csvSymbols : singleSymbol ? [singleSymbol] : csvSymbols;
      const payload: Record<string, unknown> = {
        strategy,
        n_trials: nTrials,
        trade_sizing_mode: tradeSizingMode,
        initial_capital_sek: initialCapital,
        commission_sek_per_trade: commissionSek,
        commission_pct: commPct,
        slippage_pct: slipPct,
        slippage_bps: slipBps,
        fx_sek_per_usd: fxSekPerUsd,
      };
      if (symbolsPayload.length) payload.symbols = symbolsPayload;
      if (startDate) payload.date_start = startDate;
      if (endDate) payload.date_end = endDate;
      if (bar) payload.bar = bar;
      if (pricesOverride) payload.prices = pricesOverride;
      if (tradeSizingMode === "sek_per_trade" && sekPerTrade) payload.sek_per_trade = sekPerTrade;
      if (tradeSizingMode === "fixed_units" && unitsPerTrade) payload.fixed_units = unitsPerTrade;
      const res: OptimizeResponse = await apiFetch(apiBase, "/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.workdir) setWorkdir(res.workdir);
      toast.success(`Optimize OK. run_id=${res.run_id} - cost~${effectiveBps}bps`);
      await reloadRuns();
      if (res.run_id) {
        setReportRunId(res.run_id);
        await fetchReport(res.run_id);
        setActiveTab("report");
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setOptimizeLoading(false);
    }
  };

  const fetchBreadth = async () => {
    setBreadthLoading(true);
    try {
      const data = await apiFetch(apiBase, "/breadth");
      setBreadthData(data);
      toast.success("Breadth refreshed");
    } catch (error: unknown) {
      setBreadthData(null);
      toast.error(getErrorMessage(error) || "Breadth endpoint not available");
    } finally {
      setBreadthLoading(false);
    }
  };

  const fetchMovers = async () => {
    setMoversLoading(true);
    try {
      const url = `/movers?top=${encodeURIComponent(String(moversTop))}&period=${encodeURIComponent(moversPeriod)}`;
      const res = await apiFetch(apiBase, url);
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setMoversData(items);
      toast.success(`Movers loaded (${items.length})`);
    } catch (error: unknown) {
      setMoversData([]);
      toast.error(getErrorMessage(error) || "Movers endpoint not available");
    } finally {
      setMoversLoading(false);
    }
  };

  const fetchHotlist = async () => {
    setHotlistLoading(true);
    try {
      const name = hotlistName.trim() || "gainers";
      const res = await apiFetch(apiBase, `/hotlists/${encodeURIComponent(name)}`);
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setHotlistItems(items);
      toast.success(`Hotlist ${name} loaded (${items.length})`);
    } catch (error: unknown) {
      setHotlistItems([]);
      toast.error(getErrorMessage(error) || "Hotlist endpoint not available");
    } finally {
      setHotlistLoading(false);
    }
  };

  const submitPost = async () => {
    if (!postMessage.trim()) {
      toast.warning("Message required");
      return;
    }
    setPostLoading(true);
    try {
      await apiFetch(apiBase, "/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: postMessage }),
      });
      toast.success("Message sent");
      setPostMessage("");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || "Post endpoint not available");
    } finally {
      setPostLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    reloadRuns();
    reloadLive();
    reloadMeta();
  }, [apiBase]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <Toaster richColors />

      <div className="sticky top-0 z-10 shrink-0 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/80 border-b">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 md:flex-nowrap">
          <div className="flex items-center gap-3">
            <Logo />
            <Separator orientation="vertical" className="hidden h-6 md:block" />
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:flex-nowrap">
            <Label htmlFor="api">API</Label>
            <Input
              id="api"
              value={apiBase}
              onChange={(e)=>setApiBase(e.target.value)}
              className="min-w-0 flex-1 md:w-[280px]"
            />
            <HealthBadge apiBase={apiBase} />
          </div>
          <div className="flex w-full items-center justify-start gap-2 md:ml-auto md:w-auto md:justify-end">
            <Button variant="secondary" onClick={()=>{ reloadRuns(); reloadLive(); reloadMeta(); }}>
              <RefreshCcw className="h-4 w-4 mr-2"/> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="flex flex-wrap gap-2" data-testid="tab-list">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="charts" data-testid="tab-charts">Charts</TabsTrigger>
            <TabsTrigger value="fundamentals" data-testid="tab-fundamentals">Fundamentals</TabsTrigger>
            <TabsTrigger value="assistant" data-testid="tab-assistant">Assistant</TabsTrigger>
            <TabsTrigger value="library" data-testid="tab-library">Library</TabsTrigger>
            <TabsTrigger value="optimize" data-testid="tab-optimize">Optimize</TabsTrigger>
            <TabsTrigger value="report" data-testid="tab-report">Report</TabsTrigger>
            <TabsTrigger value="signals" data-testid="tab-signals">Signals</TabsTrigger>
            <TabsTrigger value="live" data-testid="tab-live">Live</TabsTrigger>
            <TabsTrigger value="journal" data-testid="tab-journal">Journal</TabsTrigger>
            <TabsTrigger value="breadth" data-testid="tab-breadth">Breadth</TabsTrigger>
            <TabsTrigger value="movers" data-testid="tab-movers">Movers</TabsTrigger>
            <TabsTrigger value="hotlists" data-testid="tab-hotlists">Hotlists</TabsTrigger>
            <TabsTrigger value="post" data-testid="tab-post">Post</TabsTrigger>
            <TabsTrigger value="pipeline" data-testid="tab-pipeline">Pipeline</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-dashboard">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard title="Strategies" value={strategies.length} sub="from /meta/strategies" />
              <StatCard title="Effective cost (bps)" value={effectiveBps} sub="commission + slippage" />
              <StatCard title="Live jobs" value={live.length} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Equity (sample)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={SAMPLE_EQUITY} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                      <XAxis dataKey="ts" hide />
                      <YAxis hide />
                      <RTooltip />
                      <Area type="monotone" dataKey="equity" strokeWidth={2} fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="charts" className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="content-charts">
            <ChartsProTab apiBase={apiBase} />
          </TabsContent>

          <TabsContent value="fundamentals" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-fundamentals">
            <FundamentalsTab apiBase={apiBase} />
          </TabsContent>

          <TabsContent value="assistant" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-assistant">
            <AssistantTab apiBase={apiBase} lastRunId={reportRunId} lastSymbol={symbol || undefined} />
          </TabsContent>

          <TabsContent value="library" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-library">
            <LibraryTab />
          </TabsContent>

          <TabsContent value="optimize" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-optimize">
            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle>Optimize strategy</CardTitle>
                <div className="text-sm text-slate-600">
                  Effective cost <span className="font-semibold">{effectiveBps} bps</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Strategy</Label>
                    <SearchableSelect
                      value={strategy}
                      onChange={(next) => setStrategy(next.trim())}
                      options={strategies.map((name) => ({ value: name, label: name }))}
                      inputPlaceholder="obi"
                      emptyMessage="No strategies found"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input type="checkbox" checked={multiSymbolMode} onChange={(e)=>setMultiSymbolMode(e.target.checked)} />
                    <span className="text-sm text-slate-600">Use comma separated symbols</span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>{multiSymbolMode ? "Symbols (comma separated)" : "Symbol"}</Label>
                    {multiSymbolMode ? (
                      <Input
                        value={symbolsCsv}
                        onChange={(e)=> setSymbolsCsv(e.target.value)}
                        placeholder="AAPL.US, MSFT.US"
                      />
                    ) : (
                      <SearchableSelect
                        value={symbol}
                        onChange={(next) => setSymbol(next.trim().toUpperCase())}
                        options={symbols.map((s) => ({ value: s, label: s }))}
                        inputPlaceholder="AAPL.US"
                        emptyMessage="No symbols found"
                      />
                    )}
                  </div>
                  {!multiSymbolMode && (
                    <div>
                      <Label>Additional symbols (optional)</Label>
                      <div className="mt-1 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-2">
                        {additionalSymbols.length === 0 ? (
                          <span className="text-xs text-slate-500">No extra symbols added.</span>
                        ) : (
                          additionalSymbols.map((code) => (
                            <span key={code} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                              {code}
                              <button
                                type="button"
                                className="text-slate-500 transition hover:text-rose-600"
                                onClick={() => handleRemoveAdditionalSymbol(code)}
                                aria-label={`Remove ${code}`}
                              >
                                <X className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </span>
                          ))
                        )}
                        <div className="min-w-[160px] flex-1">
                          <SearchableSelect
                            value={additionalSymbolDraft}
                            onChange={setAdditionalSymbolDraft}
                            onSelectOption={(option) => {
                              handleAddAdditionalSymbol(option.value);
                              setAdditionalSymbolDraft("");
                            }}
                            onSubmit={(submitted) => {
                              handleAddAdditionalSymbol(submitted);
                              setAdditionalSymbolDraft("");
                            }}
                            options={symbols.map((s) => ({ value: s, label: s }))}
                            inputPlaceholder="Add symbol…"
                            emptyMessage="No symbols found"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Start date</Label>
                    <Input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>End date</Label>
                    <Input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Bar</Label>
                    <select className="w-full h-9 border rounded px-2" value={bar} onChange={(e)=>setBar(e.target.value)}>
                      <option value="D">D (daily)</option>
                      <option value="5m">5m</option>
                      <option value="15m">15m</option>
                      <option value="1h">1h</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>n_trials</Label>
                    <Input type="number" value={nTrials} onChange={(e)=>setNTrials(parseInt(e.target.value || "0", 10))} />
                  </div>
                  <div>
                    <Label>Prices override (optional)</Label>
                    <Input value={pricesOverride} onChange={(e)=>setPricesOverride(e.target.value)} placeholder="storage/ml/symbol_history.parquet" />
                  </div>
                  <div>
                    <Label>Initial capital (SEK)</Label>
                    <Input type="number" value={initialCapital} onChange={(e)=>setInitialCapital(parseFloat(e.target.value || "0"))} />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Trade sizing mode</Label>
                    <select className="w-full h-9 border rounded px-2" value={tradeSizingMode} onChange={(e)=>setTradeSizingMode(e.target.value as typeof tradeSizingMode)}>
                      <option value="sek_per_trade">SEK per trade</option>
                      <option value="fixed_units">Fixed units</option>
                    </select>
                  </div>
                  {tradeSizingMode === "sek_per_trade" ? (
                    <div>
                      <Label>SEK per trade</Label>
                      <Input type="number" value={sekPerTrade} onChange={(e)=>setSekPerTrade(parseFloat(e.target.value || "0"))} />
                    </div>
                  ) : (
                    <div>
                      <Label>Fixed units</Label>
                      <Input type="number" value={unitsPerTrade} onChange={(e)=>setUnitsPerTrade(parseFloat(e.target.value || "0"))} />
                    </div>
                  )}
                  <div>
                    <Label>FX SEK per USD</Label>
                    <Input type="number" value={fxSekPerUsd} onChange={(e)=>setFxSekPerUsd(parseFloat(e.target.value || "0"))} />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Commission (SEK / trade)</Label>
                    <Input type="number" value={commissionSek} onChange={(e)=>setCommissionSek(parseFloat(e.target.value || "0"))} />
                  </div>
                  <div>
                    <Label>Commission (% of notional)</Label>
                    <Input type="number" step="0.001" value={commPct} onChange={(e)=>setCommPct(parseFloat(e.target.value || "0"))} />
                  </div>
                  <div>
                    <Label>Slippage</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" step="0.001" value={slipPct} onChange={(e)=>setSlipPct(parseFloat(e.target.value || "0"))} placeholder="%" />
                      <Input type="number" value={slipBps} onChange={(e)=>setSlipBps(parseFloat(e.target.value || "0"))} placeholder="bps" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={runOptimize} disabled={optimizeLoading}>
                    {optimizeLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Play className="h-4 w-4 mr-2"/>}
                    Run optimize
                  </Button>
                  {workdir && (<span className="text-xs text-slate-500">Last workdir: {workdir}</span>)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent runs</CardTitle>
                <Button variant="ghost" size="sm" onClick={reloadRuns}><RefreshCcw className="h-4 w-4 mr-2"/>Reload</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left sticky top-0 bg-white">
                      <tr>
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Strategy</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Started</th>
                        <th className="py-2 pr-3">Finished</th>
                        <th className="py-2 pr-3">Workdir</th>
                        <th className="py-2 pr-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map(r=> (
                        <tr key={r.id} className="border-t">
                          <td className="py-2 pr-3 font-mono">{r.id}</td>
                          <td className="py-2 pr-3">{r.strategy_id}</td>
                          <td className="py-2 pr-3">{statusPill(r.status)}</td>
                          <td className="py-2 pr-3">{fmt(r.started_at)}</td>
                          <td className="py-2 pr-3">{r.finished_at ? fmt(r.finished_at) : "-"}</td>
                          <td className="py-2 pr-3 break-all">{r.workdir || "-"}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={()=>{ setReportRunId(r.id); fetchReport(r.id); setActiveTab("report"); }}>Open report</Button>
                              {r.workdir && (<Button size="sm" variant="secondary" onClick={()=>{ setWorkdir(r.workdir!); fetchSignalsView(); setActiveTab("signals"); }}>Signals</Button>)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="report" className="mx-auto w-full max-w-7xl p-4" data-testid="content-report">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle>Backtest Report</CardTitle>
                <div className="flex items-center gap-2">
                  <Label>Run ID</Label>
                  <Input className="w-28" type="number" value={reportRunId ?? ''} onChange={(e)=>setReportRunId(Number(e.target.value || 0))} />
                  <Button size="sm" onClick={()=>{ if (reportRunId) fetchReport(reportRunId); }} disabled={!reportRunId || reportLoading}>
                    {reportLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <RefreshCcw className="h-4 w-4 mr-2"/>}
                    Load
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!report ? (
                  <p className="text-sm text-slate-600">Choose a run and click <em>Load</em>. The endpoint should return <code>{`{ schema_version, metrics, equity, drawdown?, trades }`}</code>.</p>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(report.metrics || {}).map(([k, v]) => (
                        <StatCard key={k} title={k} value={typeof v === 'number' ? formatNum(v) : String(v)} />
                      ))}
                    </div>

                    {report.metrics_table && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Performance summary</h3>
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <tbody>
                              {Object.entries(report.metrics_table).map(([metric, value]) => (
                                <tr key={metric} className="border-t">
                                  <td className="py-1 pr-3 font-medium">{metric}</td>
                                  <td className="py-1 pr-3">{String(value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {report.inputs && Object.keys(report.inputs).length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Inputs</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          {Object.entries(report.inputs).map(([k, v]) => (
                            <div key={k} className="flex justify-between rounded border p-2 bg-slate-50">
                              <span className="font-medium">{k}</span>
                              <span>{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {report.trade_analysis && Object.keys(report.trade_analysis).length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Trade analysis</h3>
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <tbody>
                              {Object.entries(report.trade_analysis).map(([metric, value]) => (
                                <tr key={metric} className="border-t">
                                  <td className="py-1 pr-3 font-medium">{metric}</td>
                                  <td className="py-1 pr-3">{typeof value === 'number' ? formatNum(value) : String(value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-semibold mb-2">Equity curve</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={report.equity || []} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                            <XAxis dataKey="ts" hide />
                            <YAxis hide />
                            <RTooltip />
                            <Area type="monotone" dataKey="equity" strokeWidth={2} fillOpacity={0.2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {report.drawdown?.length ? (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Drawdown</h3>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={report.drawdown} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                              <XAxis dataKey="ts" hide />
                              <YAxis hide />
                              <RTooltip />
                              <Area type="monotone" dataKey="dd" strokeWidth={2} fillOpacity={0.2} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}

                    {report.rolling_sharpe?.length ? (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Rolling sharpe</h3>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={report.rolling_sharpe} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                              <XAxis dataKey="ts" hide />
                              <YAxis hide />
                              <RTooltip />
                              <Area type="monotone" dataKey="sharpe" strokeWidth={2} fillOpacity={0.2} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}

                    {report.daily_returns_histogram?.length ? (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Daily return histogram</h3>
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="text-left sticky top-0 bg-white">
                              <tr>
                                <th className="py-2 pr-3">Bin start</th>
                                <th className="py-2 pr-3">Bin end</th>
                                <th className="py-2 pr-3">Count</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.daily_returns_histogram.map((row, idx) => (
                                <tr key={idx} className="border-t">
                                  <td className="py-1 pr-3">{formatNum(row.bin_start)}</td>
                                  <td className="py-1 pr-3">{formatNum(row.bin_end)}</td>
                                  <td className="py-1 pr-3">{row.count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {report.period_returns?.length ? (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Period returns</h3>
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="text-left sticky top-0 bg-white">
                              <tr>
                                {periodKeys.map((key) => (
                                  <th key={key} className="py-2 pr-3">{key}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {report.period_returns.map((row, idx) => (
                                <tr key={idx} className="border-t">
                                  {periodKeys.map((key) => (
                                    <td key={key} className="py-1 pr-3">{String(row[key])}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {report.rolling_windows?.length ? (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Rolling windows</h3>
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="text-left sticky top-0 bg-white">
                              <tr>
                                {rollingWindowKeys.map((key) => (
                                  <th key={key} className="py-2 pr-3">{key}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {report.rolling_windows.map((row, idx) => (
                                <tr key={idx} className="border-t">
                                  {rollingWindowKeys.map((key) => (
                                    <td key={key} className="py-1 pr-3">{String(row[key])}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <h3 className="text-sm font-semibold mb-2">Trades</h3>
                      {!report.trades?.length ? (
                        <p className="text-sm text-slate-600">No trades in report.</p>
                      ) : (
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="text-left sticky top-0 bg-white">
                              <tr>
                                {tradeColumns.map((key) => (
                                  <th key={key} className="py-2 pr-3">{key}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {report.trades?.map((row, idx) => (
                                <tr key={idx} className="border-t">
                                  {tradeColumns.map((col) => {
                                    const value = row[col];
                                    if (col === 'extra' && value && typeof value === 'object') {
                                      return (
                                        <td key={col} className="py-1 pr-3">
                                          <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(value, null, 2)}</pre>
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={col} className="py-1 pr-3">{typeof value === 'number' ? formatNum(value) : String(value ?? '')}</td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signals" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-signals">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Latest signals</CardTitle>
                <Button variant="ghost" size="sm" onClick={fetchSignalsView} disabled={signalsLoading}><RefreshCcw className="h-4 w-4 mr-2"/>Reload</Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Workdir</Label>
                    <Input value={workdir} onChange={(e)=>setWorkdir(e.target.value)} placeholder="artifacts/optuna/obi/<ts>" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Threshold</Label>
                      <Input type="number" step="0.01" value={threshold} onChange={(e)=>setThreshold(parseFloat(e.target.value || "0"))} />
                    </div>
                    <div>
                      <Label>Top</Label>
                      <Input type="number" value={top} onChange={(e)=>setTop(parseInt(e.target.value || "0", 10))} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={async()=>{
                    if (!workdir) return toast.warning("Workdir required");
                    try {
                      const res = await apiFetch(apiBase, "/signals/latest", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ strategy, workdir }),
                      });
                      toast.success(`Signals OK -> ${res.signals} (${res.rows} rows @ ${res.ts})`);
                    } catch (error: unknown) {
                      toast.error(getErrorMessage(error));
                    }
                  }}>Create latest</Button>
                  <Button variant="secondary" disabled={signalsLoading} onClick={fetchSignalsView}>View top-N</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                {signalsRows.length === 0 ? (
                  <p className="text-sm text-slate-600">No rows. Use <strong>View top-N</strong> or ensure the backend exposes <code>/signals/latest/view</code>.</p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left sticky top-0 bg-white">
                        <tr>
                          {Object.keys(signalsRows[0]).map((k) => (<th key={k} className="py-2 pr-3">{k}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {signalsRows.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            {Object.keys(signalsRows[0]).map((k) => (<td key={k} className="py-1 pr-3">{String(row[k])}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="live" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-live">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Schedule live job</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={async()=>{
                    try {
                      const res = await apiFetch(apiBase, "/live/preview-schedule", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ schedule, n: 5 }),
                      });
                      setLivePreview(res.next || []);
                      toast.success(`Preview loaded (${res.next?.length || 0})`);
                    } catch (error: unknown) {
                      toast.error(getErrorMessage(error));
                    }
                  }}>Preview next 5</Button>
                  <Button onClick={async()=>{
                    if (!workdir) return toast.warning("Workdir required");
                    try {
                      const payload: UnknownRecord = { strategy, schedule, workdir, threshold, top };
                      payload.params = { workdir, notifySlack, notifyTelegram };
                      const res = await apiFetch(apiBase, "/live/start", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      toast.success(`Live job #${res.id} created`);
                      reloadLive();
                    } catch (error: unknown) {
                      toast.error(getErrorMessage(error));
                    }
                  }}>Start live job</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Schedule</Label>
                    <Input value={schedule} onChange={(e)=>setSchedule(e.target.value)} placeholder="cron:5 17 * * 1-5" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Threshold</Label>
                      <Input type="number" step="0.01" value={threshold} onChange={(e)=>setThreshold(parseFloat(e.target.value || "0"))} />
                    </div>
                    <div>
                      <Label>Top</Label>
                      <Input type="number" value={top} onChange={(e)=>setTop(parseInt(e.target.value || "0", 10))} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notifySlack} onChange={(e)=>setNotifySlack(e.target.checked)} /> Slack</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notifyTelegram} onChange={(e)=>setNotifyTelegram(e.target.checked)} /> Telegram</label>
                </div>
                {livePreview.length > 0 && (
                  <div>
                    <Label className="text-xs">Next runs</Label>
                    <ul className="text-xs text-slate-600 list-disc pl-5">
                      {livePreview.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Live jobs</CardTitle>
                <Button variant="ghost" size="sm" onClick={reloadLive}><RefreshCcw className="h-4 w-4 mr-2"/>Reload</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left sticky top-0 bg-white">
                      <tr>
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Strategy</th>
                        <th className="py-2 pr-3">Schedule</th>
                        <th className="py-2 pr-3">Last run</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.map(job => (
                        <tr key={job.id} className="border-t">
                          <td className="py-2 pr-3 font-mono">{job.id}</td>
                          <td className="py-2 pr-3">{job.strategy_id}</td>
                          <td className="py-2 pr-3">{job.schedule}</td>
                          <td className="py-2 pr-3">{job.last_run ? fmt(job.last_run) : "-"}</td>
                          <td className="py-2 pr-3">{job.last_status || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="journal" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-journal">
            <JournalView apiBase={apiBase} />
          </TabsContent>

          <TabsContent value="breadth" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-breadth">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Breadth snapshot</CardTitle>
                <Button variant="outline" onClick={fetchBreadth} disabled={breadthLoading}>
                  {breadthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <RefreshCcw className="h-4 w-4 mr-2"/>}
                  Fetch
                </Button>
              </CardHeader>
              <CardContent>
                {!breadthData ? (
                  <p className="text-sm text-slate-600">No data loaded yet.</p>
                ) : (
                  <pre className="overflow-auto whitespace-pre-wrap text-xs bg-slate-950/5 p-3 rounded">{JSON.stringify(breadthData, null, 2)}</pre>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movers" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-movers">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Market movers</CardTitle>
                <Button variant="outline" onClick={fetchMovers} disabled={moversLoading}>
                  {moversLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <RefreshCcw className="h-4 w-4 mr-2"/>}
                  Fetch
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Top</Label>
                    <Input type="number" value={moversTop} onChange={(e)=>setMoversTop(parseInt(e.target.value || "0", 10))} />
                  </div>
                  <div>
                    <Label>Period</Label>
                    <Input value={moversPeriod} onChange={(e)=>setMoversPeriod(e.target.value)} placeholder="1d" />
                  </div>
                </div>
                {moversData.length === 0 ? (
                  <p className="text-sm text-slate-600">No movers loaded.</p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left sticky top-0 bg-white">
                        <tr>
                          {Object.keys(moversData[0]).map((k) => (<th key={k} className="py-2 pr-3">{k}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {moversData.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            {Object.keys(moversData[0]).map((k) => (<td key={k} className="py-1 pr-3">{String(row[k])}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hotlists" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-hotlists">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Hotlists</CardTitle>
                <Button variant="outline" onClick={fetchHotlist} disabled={hotlistLoading}>
                  {hotlistLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <RefreshCcw className="h-4 w-4 mr-2"/>}
                  Fetch
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Label className="w-24">Name</Label>
                  <Input value={hotlistName} onChange={(e)=>setHotlistName(e.target.value)} placeholder="gainers" />
                </div>
                {hotlistItems.length === 0 ? (
                  <p className="text-sm text-slate-600">No items loaded.</p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left sticky top-0 bg-white">
                        <tr>
                          {Object.keys(hotlistItems[0]).map((k) => (<th key={k} className="py-2 pr-3">{k}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {hotlistItems.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            {Object.keys(hotlistItems[0]).map((k) => (<td key={k} className="py-1 pr-3">{String(row[k])}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="post" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-post">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Post notification</CardTitle>
                <Button variant="outline" onClick={submitPost} disabled={postLoading}>
                  {postLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Send className="h-4 w-4 mr-2"/>}
                  Send
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={postMessage} onChange={(e)=>setPostMessage(e.target.value)} placeholder="Message..." />
                <p className="text-xs text-slate-500">Posts to backend /post endpoint (Slack/Telegram integration if configured).</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipeline" className="mx-auto w-full max-w-7xl space-y-4 p-4" data-testid="content-pipeline">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Daily pipeline</CardTitle>
                <Button variant="outline" onClick={async()=>{
                  try {
                    const res = await apiFetch(apiBase, "/pipeline/daily", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ config: null }),
                    });
                    toast.success(res.ok ? "Pipeline triggered" : "Pipeline response");
                  } catch (error: unknown) {
                    toast.error(getErrorMessage(error));
                  }
                }}>Run daily</Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">Runs the multistrategy daily pipeline for the current configuration.</p>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

      {/* Footer */}
      <div className="py-6 text-center text-xs text-slate-500">QuantLab Local - built for speed lightning</div>
    </div>
  );
}

function HealthBadge({ apiBase }: { apiBase: string }) {
  const [status, setStatus] = useState<"idle"|"ok"|"err">("idle");
  const [time, setTime] = useState<string>("");
  useEffect(() => {
    const ping = async () => {
      try {
        const res = await apiFetch(apiBase, "/health");
        setStatus("ok");
        setTime(res.time?.slice(11, 19) || "");
      } catch {
        setStatus("err");
        setTime("");
      }
    };
    ping();
    const id = setInterval(ping, 5000);
    return () => clearInterval(id);
  }, [apiBase]);
  return (
    <Badge variant={status === "ok" ? "secondary" : "destructive"} className="flex items-center gap-1">
      <Activity className={`h-3.5 w-3.5 ${status === "ok" ? "text-emerald-600" : "text-rose-600"}`} />
      {status === "ok" ? `OK ${time}` : "OFF"}
    </Badge>
  );
}

function JournalView({ apiBase }: { apiBase: string }) {
  const [items, setItems] = useState<UnknownRecord[]>([]);
  const [summary, setSummary] = useState<JournalSummary | null>(null);
  const [positions, setPositions] = useState<UnknownRecord[]>([]);
  const [form, setForm] = useState({
    ts: new Date().toISOString().slice(0, 19),
    symbol: "",
    side: "buy",
    quantity: 0,
    price: 0,
    strategy_id: "",
    run_id: undefined as number | undefined,
    note: "",
  });

  const reload = async () => {
    try {
      const [t, s, p] = await Promise.all([
        apiFetch(apiBase, "/trades"),
        apiFetch(apiBase, "/trades/summary"),
        apiFetch(apiBase, "/positions/open"),
      ]);
      setItems(t.items || []);
      setSummary(s || null);
      setPositions(p.items || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  };

  useEffect(() => {
    reload();
  }, [apiBase]);

  const submit = async () => {
    try {
      await apiFetch(apiBase, "/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          price: Number(form.price),
        }),
      });
      toast.success("Trade saved");
      reload();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  };

  const equitySeries = summary?.equity && summary.equity.length ? summary.equity : SAMPLE_EQUITY;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Trading journal</CardTitle>
        <Button variant="ghost" size="sm" onClick={reload}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Reload
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard title="Trades" value={summary?.trade_count ?? 0} />
          <StatCard title="Win rate" value={`${((summary?.win_rate ?? 0) * 100).toFixed(1)}%`} />
          <StatCard title="Realized PnL" value={(summary?.realized_pnl ?? 0).toFixed(2)} sub="SEK" />
          <StatCard title="Open positions" value={positions.length} />
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equitySeries} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
              <XAxis dataKey={equitySeries[0] && ("ts" in equitySeries[0] ? "ts" : "Ts")} hide />
              <YAxis hide />
              <RTooltip />
              <Area type="monotone" dataKey={equitySeries[0] && ("equity" in equitySeries[0] ? "equity" : "Equity")} strokeWidth={2} fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>Time (ISO)</Label>
            <Input value={form.ts} onChange={(e) => setForm({ ...form, ts: e.target.value })} />
          </div>
          <div>
            <Label>Symbol</Label>
            <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
          </div>
          <div>
            <Label>Side</Label>
            <Input value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} />
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Price</Label>
            <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Strategy</Label>
            <Input value={form.strategy_id} onChange={(e) => setForm({ ...form, strategy_id: e.target.value })} />
          </div>
          <div>
            <Label>Run ID</Label>
            <Input
              type="number"
              value={form.run_id ?? ""}
              onChange={(e) => setForm({ ...form, run_id: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div>
            <Label>Note</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <Button onClick={submit}>
          <Play className="mr-2 h-4 w-4" /> Add trade
        </Button>
        <div>
          <h4 className="text-sm font-semibold">Open positions</h4>
          {positions.length === 0 ? (
            <p className="text-sm text-slate-600">No open positions.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="py-2 pr-3 text-left">Symbol</th>
                    <th className="py-2 pr-3 text-left">Direction</th>
                    <th className="py-2 pr-3 text-left">Quantity</th>
                    <th className="py-2 pr-3 text-left">Entry price</th>
                    <th className="py-2 pr-3 text-left">Entry time</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="py-1 pr-3">{String(row.symbol)}</td>
                      <td className="py-1 pr-3 capitalize">{String(row.direction || "")}</td>
                      <td className="py-1 pr-3">{Number(row.quantity ?? 0).toFixed(2)}</td>
                      <td className="py-1 pr-3">{Number(row.entry_price ?? 0).toFixed(2)}</td>
                      <td className="py-1 pr-3">{String(row.entry_ts || "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold">Trades</h4>
          {items.length === 0 ? (
            <p className="text-sm text-slate-600">No trades logged yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    {Object.keys(items[0]).map((k) => (<th key={k} className="py-2 pr-3 text-left">{k}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={idx} className="border-t">
                      {Object.keys(items[0]).map((k) => (<td key={k} className="py-1 pr-3">{String(row[k])}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, sub }: { title: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-slate-600">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{typeof value === "number" ? formatNum(value) : value}</div>
        {sub ? <div className="text-xs text-slate-500 mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function statusPill(status: string) {
  const variant = status === "success" ? "secondary" : status === "failed" ? "destructive" : "outline";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

function formatNum(value: number | string) {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(2);
}

function fmt(ts?: string | null) {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function Logo() {
  return (
    <div className="flex items-center gap-2 font-semibold">
      <PlugZap className="h-5 w-5"/>
      <span>QuantLab</span>
    </div>
  );
}


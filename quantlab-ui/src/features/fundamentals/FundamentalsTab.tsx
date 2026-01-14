import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, AreaChart, Area, CartesianGrid } from "recharts";
import { Loader2, RefreshCcw, BarChart2, X } from "lucide-react";
import { METRIC_FACT_MAP, normalizeMetricKey } from "@/features/library/libraryData";

interface ScoreMetricDetail {
  bucket: string;
  score: number;
  weight: number;
  effective_weight: number;
  contribution: number;
  value: number | null;
  min?: number | null;
  max?: number | null;
  unit?: string;
  display_name: string;
  category: string;
  comments?: Record<string, string>;
}

interface ScoreLabelInfo {
  code?: string | null;
  label?: string | null;
  description?: string | null;
  logic?: string | null;
  threshold?: { min?: number | null; max?: number | null };
}

interface ScoreThresholds {
  buy?: number | null;
  sell?: number | null;
}

interface Scorecard {
  sector?: string;
  total_score?: number;
  max_score?: number;
  score_percent?: number;
  category_scores: Record<string, { score: number; max_score: number; percentage: number }>;
  metrics: Record<string, ScoreMetricDetail>;
  metrics_evaluated?: number;
  label?: ScoreLabelInfo;
  thresholds?: ScoreThresholds;
  explanations: string[];
  status?: string | null;
  message?: string | null;
  metrics_available?: number | null;
  metrics_missing?: number | null;
}

interface FundamentalsResponse {
  symbol: string;
  currency: string;
  asof?: string;
  fx: {
    base: string;
    quote: string;
    rate: number;
    asof?: string;
    source?: string;
  };
  metrics: Record<string, number | string | null | undefined>;
  metadata: Record<string, unknown>;
  score?: Scorecard;
  raw: Record<string, unknown>;
}

interface ScoreItem {
  symbol: string;
  score: number;
  raw_score?: number | null;
  status?: string | null;
  message?: string | null;
  label?: string | null;
  label_code?: string | null;
  legacy_label?: string | null;
  category_scores: Record<string, number | null>;
  thresholds?: ScoreThresholds;
  explanations?: string[];
  sector?: string;
  currency?: string;
  asof?: string;
  price?: number;
  metrics_available?: number | null;
  scorecard?: Scorecard;
}

interface ScoreResponse {
  scores: ScoreItem[];
  thresholds: { buy: number; sell: number };
  weights: Record<string, Record<string, number>>;
  run_at?: string;
}

interface ScoreHistoryRow {
  Symbol: string;
  Score?: number;
  ScorePercent?: number;
  Status?: string;
  Label?: string;
  LabelCode?: string;
  Price?: number;
  Currency?: string;
  AsOf?: string;
  RunAt: string;
  Payload?: string;
  payload?: ScoreItem | null | Record<string, unknown>;
  scorecard?: Scorecard | null;
  metrics?: Record<string, ScoreMetricDetail | undefined> | null;
  [key: string]: unknown;
}

function parseScoreHistoryPayload(row: ScoreHistoryRow): ScoreItem | null {
  const payloadCandidate = row.payload;
  if (payloadCandidate && typeof payloadCandidate === "object" && !Array.isArray(payloadCandidate)) {
    return payloadCandidate as ScoreItem;
  }
  const raw = (row.Payload ?? (typeof payloadCandidate === "string" ? payloadCandidate : null)) as unknown;
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      return JSON.parse(raw) as ScoreItem;
    } catch {
      return null;
    }
  }
  return null;
}

function extractMetricDetail(payload: ScoreItem | null, key: string): ScoreMetricDetail | null {
  if (!payload) return null;
  const metric =
    payload.scorecard?.metrics?.[key] ??
    (payload as unknown as { metrics?: Record<string, ScoreMetricDetail> }).metrics?.[key];
  if (!metric) return null;
  if (typeof metric !== "object") return null;
  return metric;
}
function ensureMetricMap(value: unknown): Record<string, ScoreMetricDetail> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries: Record<string, ScoreMetricDetail> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, detail]) => {
    if (detail && typeof detail === "object") {
      entries[key] = detail as ScoreMetricDetail;
    }
  });
  return Object.keys(entries).length > 0 ? entries : null;
}



type ScoreHistoryEntry = {
  row: ScoreHistoryRow;
  payload: ScoreItem | null;
  scorecard: Scorecard | null;
  metrics: Record<string, ScoreMetricDetail> | null;
};

function resolveMetricDetail(entry: ScoreHistoryEntry, key: string): ScoreMetricDetail | null {
  const direct = entry.metrics?.[key];
  if (direct && typeof direct === "object") {
    return direct;
  }
  return extractMetricDetail(entry.payload, key);
}

function resolveMetricValue(entry: ScoreHistoryEntry, key: string): number | null {
  const detail = resolveMetricDetail(entry, key);
  if (!detail) return null;
  const { value } = detail;
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}


interface JournalEntry {
  id: string;
  symbol: string;
  savedAt: string;
  decision: string;
  note: string;
  scorePercent?: number | null;
  label?: string | null;
  sector?: string | null;
  price?: number | null;
  currency?: string | null;
}
interface WeightProfile {
  name: string;
  weights: Record<string, Record<string, number>>;
}

interface WatchlistTemplate {
  key: string;
  label: string;
  symbols: string[];
  description?: string;
}

type HealthStatus = "ok" | "warn" | "empty" | "error";

interface FundamentalsHealth {
  status: HealthStatus;
  latest_run_at: string | null;
  symbol_count: number;
  metric_series_total?: number;
  metric_series_sufficient?: number;
  metric_series_ratio?: number | null;
}

type WeightPreviewSection = {
  category: string;
  metrics: Array<{ metric: string; weight: number }>;
};

interface FundamentalsTabProps {
  apiBase: string;
}

const DEFAULT_WEIGHTS: Record<string, Record<string, number>> = {
  Value: { ev_ebitda: 0.4, pe_ratio: 0.3, ev_sales: 0.3 },
  Quality: { roic: 0.5, fcf_margin: 0.5 },
  Growth: { eps_growth_yoy: 0.7, revenue_growth_yoy: 0.3 },
};

const PRESET_PROFILES: WeightProfile[] = [
  { name: "Balanced", weights: DEFAULT_WEIGHTS },
  {
    name: "Value",
    weights: {
      Value: { ev_ebitda: 0.5, ev_sales: 0.5 },
      Quality: { roic: 0.5, fcf_margin: 0.5 },
      Growth: { eps_growth_yoy: 0.4, revenue_growth_yoy: 0.6 },
    },
  },
  {
    name: "Quality",
    weights: {
      Value: { pe_ratio: 0.4, ev_ebitda: 0.6 },
      Quality: { roic: 0.6, fcf_margin: 0.4 },
      Growth: { eps_growth_yoy: 0.5, revenue_growth_yoy: 0.5 },
    },
  },
  {
    name: "Growth",
    weights: {
      Value: { pe_ratio: -0.5, ev_sales: -0.5 },
      Quality: { roic: 0.3, fcf_margin: 0.7 },
      Growth: { eps_growth_yoy: 0.8, revenue_growth_yoy: 0.2 },
    },
  },
  {
    name: "Quality defensive",
    weights: {
      Value: { pe_ratio: 0.2, ev_ebitda: 0.3, pb_ratio: 0.5 },
      Quality: { roic: 0.6, fcf_margin: 0.4 },
      Growth: { eps_growth_yoy: 0.4, revenue_growth_yoy: 0.6 },
    },
  },
  {
    name: "Cash flow compounders",
    weights: {
      Value: { ev_fcf: 0.5, ev_ebitda: 0.3, ev_sales: 0.2 },
      Quality: { fcf_margin: 0.6, ebitda_margin: 0.4 },
      Growth: { eps_growth_yoy: 0.5, revenue_growth_yoy: 0.5 },
    },
  },
  {
    name: "Deep value",
    weights: {
      Value: { ev_ebitda: 0.5, ev_sales: 0.3, pb_tangible_ratio: 0.2 },
      Quality: { roic: 0.4, net_debt_to_ebitda: -0.4, interest_coverage: 0.2 },
      Growth: { eps_growth_yoy: 0.3, revenue_growth_yoy: 0.7 },
    },
  },
];

const FALLBACK_WATCHLIST_TEMPLATES: WatchlistTemplate[] = [
  {
    key: "se_large",
    label: "SE Large Cap (industrials & banks)",
    symbols: ["ABB.ST", "ALFA.ST", "ATCO-A.ST", "EQT.ST", "ERIC-B.ST", "HM-B.ST", "SAND.ST", "VOLV-B.ST"],
    description: "Swedish bellwethers for a broad industrial/financial read.",
  },
  {
    key: "se_quality",
    label: "Nordic quality compounders",
    symbols: ["ASSA-B.ST", "EVO.ST", "HEXA-B.ST", "INVE-B.ST", "SKF-B.ST", "TELIA.ST", "SCA-B.ST"],
    description: "Low leverage, steady return on capital across the Nordics.",
  },
  {
    key: "us_tech",
    label: "US tech megacaps",
    symbols: ["AAPL.US", "MSFT.US", "GOOGL.US", "NVDA.US", "AMZN.US", "META.US", "TSLA.US"],
    description: "High growth US technology names with deep liquidity.",
  },
  {
    key: "global_income",
    label: "Global dividend franchise",
    symbols: ["KO.US", "PEP.US", "JNJ.US", "PG.US", "MCD.US", "HD.US", "CVX.US"],
    description: "Mature cash generators for yield-oriented screens.",
  },
];

const HISTORY_GROUPING_OPTIONS: Array<{ value: HistoryGrouping; label: string }> = [
  { value: "monthly", label: "Månad" },
  { value: "quarterly", label: "Kvartal" },
  { value: "weekly", label: "Vecka" },
];

const LABEL_STYLES: Record<string, string> = {
  BUY: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30",
  SELL: "bg-rose-500/15 text-rose-700 ring-1 ring-inset ring-rose-500/30",
  WATCH: "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/30",
};

const HEALTH_BADGE_STYLES: Record<HealthStatus, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/30",
  empty: "bg-slate-200/70 text-slate-600 ring-1 ring-inset ring-slate-300/80",
  error: "bg-rose-500/15 text-rose-700 ring-1 ring-inset ring-rose-500/30",
};

const BUCKET_STYLES: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-700",
  amber: "bg-amber-500/10 text-amber-700",
  red: "bg-rose-500/10 text-rose-700",
  missing: "bg-slate-200/60 text-slate-600",
};

type LocalStateTuple<T> = [T, (value: T) => void];

function useLocalState<T>(key: string, initial: T): LocalStateTuple<T> {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        return JSON.parse(raw) as T;
      }
    } catch (error) {
      console.error("Failed to read local storage", error);
    }
    return initial;
  });

  const setter = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (error) {
        console.error("Failed to write local storage", error);
      }
    },
    [key],
  );

  return [value, setter];
}

function formatCurrency(value: unknown, currency: string, opts?: Intl.NumberFormatOptions): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "–";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 0,
      ...opts,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0, ...opts }).format(value);
  }
}

function formatPrice(value: unknown, currency: string): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "–";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }
}
function formatNumber(value: unknown, digits = 2): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function formatPercent(value: unknown, digits = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "–";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(date);
}

type HistoryGrouping = "monthly" | "quarterly" | "weekly";

function getIsoWeekParts(date: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: target.getUTCFullYear(), week };
}

function computeHistoryBucket(ts: string, grouping: HistoryGrouping): { key: string; label: string; sortKey: number } | null {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (grouping === "monthly") {
    const month = date.getUTCMonth();
    const label = `${year}-${String(month + 1).padStart(2, "0")}`;
    return { key: label, label, sortKey: year * 12 + month };
  }
  if (grouping === "quarterly") {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    const label = `${year} Q${quarter}`;
    return { key: label, label, sortKey: year * 4 + quarter };
  }
  const { year: weekYear, week } = getIsoWeekParts(date);
  const label = `${weekYear}-W${String(week).padStart(2, "0")}`;
  return { key: label, label, sortKey: weekYear * 100 + week };
}

function formatHistoryMetricLabel(metric: string): string {
  if (!metric) return "Metric";
  const cleaned = metric.replace(/[_-]+/g, " ");
  return cleaned
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}


type MetricSeriesPoint = { RunAt: string; value: number; Status?: string | null };


function resolveScoreLabel(rawLabel?: string | null, code?: string | null, legacy?: string | null): { text: string; tone: keyof typeof LABEL_STYLES } {
  const candidate = (rawLabel ?? code ?? legacy ?? "").toLowerCase();
  if (!candidate) return { text: "Watch", tone: "WATCH" };
  if (candidate.includes("undvik") || candidate.includes("sell")) return { text: rawLabel ?? "Avoid", tone: "SELL" };
  if (candidate.includes("k\u00f6p") || candidate.includes("stark") || candidate.includes("buy")) return { text: rawLabel ?? "Buy", tone: "BUY" };
  return { text: rawLabel ?? "Watch", tone: "WATCH" };
}

function formatScoreValue(detail: ScoreMetricDetail | undefined): string {
  if (!detail || detail.value == null || Number.isNaN(detail.value)) return "–";
  if (detail.unit === "ratio" || detail.unit === "percent") return formatPercent(detail.value);
  if (detail.unit === "per_share") return formatNumber(detail.value, 2);
  if (detail.unit === "absolute") return formatNumber(detail.value, 2);
  if (detail.unit === "x" || detail.unit === "multiple") return formatNumber(detail.value, 2);
  return formatNumber(detail.value, 2);
}

function formatScoreRange(detail: ScoreMetricDetail | undefined): string {
  if (!detail) return "";
  const { min, max } = detail;
  if (min != null && max != null && !Number.isNaN(min) && !Number.isNaN(max)) {
    if (min === max) return `${formatNumber(min, 2)}`;
    return `${formatNumber(min, 2)}–${formatNumber(max, 2)}`;
  }
  if (min != null && !Number.isNaN(min)) return `≥ ${formatNumber(min, 2)}`;
  if (max != null && !Number.isNaN(max)) return `≤ ${formatNumber(max, 2)}`;
  return "";
}

const KPI_FIELDS: Array<{ key: string; label: string; formatter: (value: unknown, currency: string) => string }> = [
  { key: "price", label: "Price", formatter: (value, currency) => formatPrice(value, currency) },
  { key: "market_cap", label: "Market Cap", formatter: (value, currency) => formatCurrency(value, currency) },
  { key: "enterprise_value", label: "Enterprise Value", formatter: (value, currency) => formatCurrency(value, currency) },
  { key: "revenue_ttm", label: "Revenue TTM", formatter: (value, currency) => formatCurrency(value, currency) },
  { key: "ebitda_ttm", label: "EBITDA TTM", formatter: (value, currency) => formatCurrency(value, currency) },
  { key: "fcf_ttm", label: "FCF TTM", formatter: (value, currency) => formatCurrency(value, currency) },
];

const MULTIPLE_FIELDS = [
  { key: "ps_ratio", label: "P/S" },
  { key: "pe_ratio", label: "P/E" },
  { key: "pb_ratio", label: "P/B" },
  { key: "pb_tangible_ratio", label: "P/Tangible Book" },
  { key: "ev_sales", label: "EV/S" },
  { key: "ev_ebitda", label: "EV/EBITDA" },
  { key: "ev_ebit", label: "EV/EBIT" },
  { key: "ev_net_income", label: "EV/E" },
  { key: "ev_fcf", label: "EV/FCF" },
  { key: "e_to_ev", label: "E/EV" },
  { key: "ebit_to_ev", label: "EBIT/EV" },
];

const MARGIN_FIELDS = [
  { key: "gross_margin", label: "Gross margin" },
  { key: "ebitda_margin", label: "EBITDA margin" },
  { key: "ebit_margin", label: "EBIT margin" },
  { key: "net_margin", label: "Net margin" },
  { key: "fcf_margin", label: "FCF margin" },
];

const RETURN_FIELDS = [
  { key: "roe", label: "ROE" },
  { key: "roa", label: "ROA" },
  { key: "roic", label: "ROIC" },
];

const PER_SHARE_FIELDS = [
  { key: "revenue_per_share", label: "Revenue/share" },
  { key: "eps_ttm", label: "EPS TTM" },
  { key: "equity_per_share", label: "Equity/share" },
  { key: "tangible_book_per_share", label: "Tangible book/share" },
  { key: "cashflow_per_share", label: "NCFO/share" },
  { key: "fcf_per_share", label: "FCF/share" },
  { key: "dividends_per_share", label: "Dividend/share" },
  { key: "dividend_yield", label: "Dividend yield" },
];

const BALANCE_FIELDS = [
  { key: "current_ratio", label: "Current ratio" },
  { key: "debt_to_equity", label: "Debt/Equity" },
  { key: "net_debt_to_ebitda", label: "Net Debt/EBITDA" },
  { key: "net_debt_to_capital", label: "Net Debt/Capital" },
  { key: "asset_turnover", label: "Asset turnover" },
  { key: "equity_to_assets", label: "Equity/Assets" },
  { key: "cash_to_assets", label: "Cash/Assets" },
  { key: "intangibles_to_assets", label: "Intangibles/Assets" },
  { key: "working_capital", label: "Working capital" },
  { key: "working_capital_to_assets", label: "Working capital/Assets" },
  { key: "working_capital_to_ncl", label: "Working capital/NCL" },
  { key: "capex_to_ncfo", label: "CapEx/NCFO" },
  { key: "capex_to_revenue", label: "CapEx/Revenue" },
];

const CURRENCY_FIELDS = new Set([
  ...KPI_FIELDS.map((item) => item.key),
  "cash",
  "debt",
  "net_debt",
  "total_equity",
  "tangible_book",
  "total_assets",
  "current_assets",
  "current_liabilities",
  "total_debt",
  "inventory",
  "working_capital",
]);

const PERCENT_FIELDS = new Set([...MARGIN_FIELDS, ...RETURN_FIELDS].map((item) => item.key).concat(["dividend_yield"]));

export default function FundamentalsTab({ apiBase }: FundamentalsTabProps) {
  const [symbol, setSymbol] = useLocalState<string>("ql/fundamentals/symbol", "ABB.ST");
  const [metrics, setMetrics] = useState<FundamentalsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [scoreSymbols, setScoreSymbols] = useLocalState<string>("ql/fundamentals/scoreSymbols", "ABB.ST, VOLV-B.ST");
  const [weightsText, setWeightsText] = useLocalState<string>("ql/fundamentals/weights", JSON.stringify(DEFAULT_WEIGHTS, null, 2));
  const [selectedProfile, setSelectedProfile] = useState<string>(PRESET_PROFILES[0]?.name ?? "");
  const [selectedWatchlist, setSelectedWatchlist] = useState<string>("");
  const [selectedScoreSymbols, setSelectedScoreSymbols] = useState<string[]>([]);
  const [watchlistTemplates, setWatchlistTemplates] = useState<WatchlistTemplate[]>([]);
  const [health, setHealth] = useState<FundamentalsHealth | null>(null);

  const [scoreResult, setScoreResult] = useState<ScoreResponse | null>(null);
  const [scoreLatest, setScoreLatest] = useState<ScoreResponse | null>(null);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryRow[]>([]);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [latestLoading, setLatestLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [scoreSortColumn, setScoreSortColumn] = useState<"score" | "symbol" | "label">("score");
  const [scoreSortDir, setScoreSortDir] = useState<"asc" | "desc">("desc");
  const [reportDecision, setReportDecision] = useState<string>("WATCH");
  const [reportNote, setReportNote] = useState<string>("");
  const [journalEntries, setJournalEntries] = useLocalState<JournalEntry[]>("ql/fundamentals/journal", []);

  const fetchWatchlistTemplates = useCallback(async () => {
    try {
      const base = apiBase.replace(/\/$/, "");
      const res = await fetch(`${base}/fundamentals/watchlists`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const json = (await res.json()) as { templates?: WatchlistTemplate[] };
      const rawTemplates = Array.isArray(json.templates) ? json.templates : [];
      const unique = new Map<string, WatchlistTemplate>();
      rawTemplates.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const key = String(item.key ?? "").trim();
        const label = String(item.label ?? "").trim();
        const symbolsSource = Array.isArray(item.symbols) ? item.symbols : [];
        const symbols = symbolsSource.map((sym) => String(sym ?? "").trim().toUpperCase()).filter(Boolean);
        if (!key || !label || symbols.length === 0) return;
        unique.set(key, {
          key,
          label,
          description: item.description ?? undefined,
          symbols,
        });
      });
      const templates = Array.from(unique.values());
      setWatchlistTemplates(templates.length > 0 ? templates : FALLBACK_WATCHLIST_TEMPLATES);
    } catch (error) {
      console.warn("Failed to load fundamentals watchlists", error);
      setWatchlistTemplates(FALLBACK_WATCHLIST_TEMPLATES);
    }
  }, [apiBase]);

  const fetchFundamentalsHealth = useCallback(async () => {
    try {
      const base = apiBase.replace(/\/$/, "");
      const res = await fetch(`${base}/fundamentals/health`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const json = (await res.json()) as FundamentalsHealth;
      if (json && typeof json === "object" && "status" in json) {
        setHealth(json);
      } else {
        setHealth(null);
      }
    } catch (error) {
      console.warn("Failed to load fundamentals health", error);
      setHealth({
        status: "error",
        latest_run_at: null,
        symbol_count: 0,
        metric_series_total: 0,
        metric_series_sufficient: 0,
        metric_series_ratio: null,
      });
    }
  }, [apiBase]);

  const currency = metrics?.currency ?? "SEK";

  const allProfiles = useMemo(() => [...PRESET_PROFILES], []);

  const getWeightsObject = useCallback((): Record<string, Record<string, number>> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(weightsText);
    } catch (error) {
      throw new Error(`Weights JSON parse error: ${error}`);
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Weights JSON must be an object");
    }
    return parsed as Record<string, Record<string, number>>;
  }, [weightsText]);

  const handleSelectProfile = useCallback(
    (name: string) => {
      setSelectedProfile(name);
      const profile = allProfiles.find((item) => item.name === name);
      if (profile) {
        setWeightsText(JSON.stringify(profile.weights, null, 2));
      }
    },
    [allProfiles, setWeightsText],
  );

  const weightPreview = useMemo<WeightPreviewSection[] | null>(() => {
    try {
      const parsed = JSON.parse(weightsText) as Record<string, Record<string, number>>;
      const sections: WeightPreviewSection[] = [];
      Object.entries(parsed).forEach(([category, metricsMap]) => {
        if (!metricsMap || typeof metricsMap !== "object") return;
        const metrics: Array<{ metric: string; weight: number }> = [];
        Object.entries(metricsMap).forEach(([metricKey, rawWeight]) => {
          const numeric = Number(rawWeight);
          if (Number.isFinite(numeric)) {
            metrics.push({ metric: metricKey, weight: numeric });
          }
        });
        metrics.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
        if (metrics.length > 0) {
          sections.push({ category, metrics });
        }
      });
      return sections;
    } catch {
      return null;
    }
  }, [weightsText]);

  const weightParseError = weightPreview === null;

  const handleTweakWeight = useCallback(
    (category: string, metric: string, delta: number) => {
      try {
        const current = getWeightsObject();
        const next: Record<string, Record<string, number>> = {};
        Object.entries(current).forEach(([cat, metricsMap]) => {
          next[cat] = { ...(metricsMap ?? {}) };
        });
        const bucket = next[category] ?? {};
        next[category] = bucket;
        const currentValue = Number(bucket[metric] ?? 0);
        const updated = Number((currentValue + delta).toFixed(2));
        bucket[metric] = updated;
        setWeightsText(JSON.stringify(next, null, 2));
      } catch (error) {
        toast.error(`Unable to tweak weight: ${error}`);
      }
    },
    [getWeightsObject, setWeightsText],
  );

  const fetchFundamentals = useCallback(
    async (opts: { force?: boolean } = {}) => {
      const target = symbol.trim();
      if (!target) {
        toast.error("Enter a symbol to load fundamentals.");
        return;
      }
      setMetricsLoading(true);
      try {
        const base = apiBase.replace(/\/$/, "");
        const params = opts.force ? "?force=true" : "";
        const res = await fetch(`${base}/fundamentals/${encodeURIComponent(target)}${params}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = (await res.json()) as FundamentalsResponse;
        setMetrics(json);
        toast.success(`Loaded fundamentals for ${json.symbol}`);
      } catch (error) {
        toast.error(`Failed to load fundamentals: ${error}`);
      } finally {
        setMetricsLoading(false);
      }
    },
    [apiBase, symbol],
  );

  const fetchScoreHistory = useCallback(
    async (limit = 180) => {
      setHistoryLoading(true);
      try {
        const base = apiBase.replace(/\/$/, "");
        const res = await fetch(`${base}/fundamentals/scores/history?limit=${limit}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = await res.json();
        setScoreHistory((json.items as ScoreHistoryRow[]) ?? []);
      } catch (error) {
        toast.error(`Failed to load score history: ${error}`);
      } finally {
        setHistoryLoading(false);
      }
    },
    [apiBase],
  );

  const fetchLatestScores = useCallback(
    async (opts: { force?: boolean } = {}) => {
      setLatestLoading(true);
      try {
        const base = apiBase.replace(/\/$/, "");
        const url = opts.force ? `${base}/fundamentals/scores/latest?force=true` : `${base}/fundamentals/scores/latest`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = (await res.json()) as ScoreResponse;
        setScoreLatest(json);
        fetchFundamentalsHealth();
        if (opts.force) {
          await fetchScoreHistory();
        }
      } catch (error) {
        toast.error(`Failed to load scores: ${error}`);
      } finally {
        setLatestLoading(false);
      }
    },
    [apiBase, fetchFundamentalsHealth, fetchScoreHistory],
  );

  useEffect(() => {
    fetchLatestScores();
    fetchScoreHistory();
  }, [fetchLatestScores, fetchScoreHistory]);

  useEffect(() => {
    fetchWatchlistTemplates();
  }, [fetchWatchlistTemplates]);

  useEffect(() => {
    fetchFundamentalsHealth();
  }, [fetchFundamentalsHealth]);

  const handleScore = useCallback(
    async () => {
      const list = scoreSymbols.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      if (list.length === 0) {
        toast.error("Enter at least one symbol to score.");
        return;
      }
      let weightsParsed: Record<string, Record<string, number>>;
      try {
        weightsParsed = getWeightsObject();
      } catch (error) {
        toast.error(String(error));
        return;
      }
      setScoreLoading(true);
      try {
        const payload = {
          symbols: list,
          weights: weightsParsed,
        };
        const base = apiBase.replace(/\/$/, "");
        const res = await fetch(`${base}/fundamentals/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = (await res.json()) as ScoreResponse;
        setScoreResult(json);
        setScoreLatest(json);
        await fetchScoreHistory();
        await fetchFundamentalsHealth();
        toast.success("Score computed");
      } catch (error) {
        toast.error(`Failed to score fundamentals: ${error}`);
      } finally {
        setScoreLoading(false);
      }
    },
    [apiBase, scoreSymbols, getWeightsObject, fetchFundamentalsHealth, fetchScoreHistory],
  );

  const toggleSort = useCallback((column: "score" | "symbol" | "label") => {
    setScoreSortColumn((prevColumn) => {
      if (prevColumn === column) {
        setScoreSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevColumn;
      }
      setScoreSortDir(column === "score" ? "desc" : "asc");
      return column;
    });
  }, []);

  const renderSortIndicator = useMemo(
    () => ({
      symbol: scoreSortColumn === "symbol" ? (scoreSortDir === "asc" ? "↑" : "↓") : "",
      score: scoreSortColumn === "score" ? (scoreSortDir === "asc" ? "↑" : "↓") : "",
      label: scoreSortColumn === "label" ? (scoreSortDir === "asc" ? "↑" : "↓") : "",
    }),
    [scoreSortColumn, scoreSortDir],
  );

  const activeScore = scoreResult ?? scoreLatest;

  const dynamicWatchlists = useMemo<WatchlistTemplate[]>(() => {
    if (!activeScore || !Array.isArray(activeScore.scores) || activeScore.scores.length === 0) {
      return [];
    }
    const scores = activeScore.scores;
    const sorted = scores.slice().sort((a, b) => b.score - a.score);
    const thresholds = activeScore.thresholds ?? {};
    const buyThreshold = typeof thresholds.buy === "number" ? thresholds.buy : null;
    const sellThreshold = typeof thresholds.sell === "number" ? thresholds.sell : null;
    const unique = (arr: string[]) => Array.from(new Set(arr));
    const options: WatchlistTemplate[] = [
      {
        key: "latest_all",
        label: `Latest run (${scores.length})`,
        symbols: unique(scores.map((item) => item.symbol)),
        description: "All symbols from the most recent score run.",
      },
      {
        key: "latest_top5",
        label: "Latest run – top 5",
        symbols: unique(sorted.slice(0, 5).map((item) => item.symbol)),
        description: "Highest scoring names this run.",
      },
      {
        key: "latest_top10",
        label: "Latest run – top 10",
        symbols: unique(sorted.slice(0, 10).map((item) => item.symbol)),
        description: "Broader basket of leaders.",
      },
    ];
    if (buyThreshold != null) {
      const buySymbols = unique(sorted.filter((item) => item.score >= buyThreshold).map((item) => item.symbol));
      if (buySymbols.length > 0) {
        options.push({
          key: "latest_buy",
          label: `Signals ≥ buy (${buySymbols.length})`,
          symbols: buySymbols,
          description: "Names clearing the buy threshold.",
        });
      }
    }
    if (sellThreshold != null) {
      const sellSymbols = unique(sorted.filter((item) => item.score <= sellThreshold).map((item) => item.symbol));
      if (sellSymbols.length > 0) {
        options.push({
          key: "latest_sell",
          label: `Signals ≤ sell (${sellSymbols.length})`,
          symbols: sellSymbols,
          description: "Symbols flagged for caution.",
        });
      }
    }
    return options.filter((option) => option.symbols.length > 0);
  }, [activeScore]);

  const watchlistOptions = useMemo(() => {
    const base = watchlistTemplates.length > 0 ? watchlistTemplates : FALLBACK_WATCHLIST_TEMPLATES;
    return [...dynamicWatchlists, ...base];
  }, [dynamicWatchlists, watchlistTemplates]);

  const selectedWatchlistMeta = useMemo(
    () => watchlistOptions.find((option) => option.key === selectedWatchlist),
    [watchlistOptions, selectedWatchlist],
  );

  useEffect(() => {
    if (!selectedWatchlist && watchlistOptions.length > 0) {
      setSelectedWatchlist(watchlistOptions[0].key);
    }
  }, [watchlistOptions, selectedWatchlist]);

  const handleSelectWatchlist = useCallback(
    (key: string) => {
      if (!key) {
        setSelectedWatchlist("");
        return;
      }
      setSelectedWatchlist(key);
      const option = watchlistOptions.find((item) => item.key === key);
      if (option && option.symbols?.length) {
        setScoreSymbols(option.symbols.join(", "));
      }
    },
    [watchlistOptions, setScoreSymbols],
  );

  const highlightGroups = useMemo(() => {
    if (!activeScore || !Array.isArray(activeScore.scores) || activeScore.scores.length === 0) {
      return null;
    }
    const thresholds = activeScore.thresholds ?? {};
    const buyThreshold = typeof thresholds.buy === "number" ? thresholds.buy : 70;
    const sellThreshold = typeof thresholds.sell === "number" ? thresholds.sell : 30;
    const ordered = activeScore.scores.slice().sort((a, b) => b.score - a.score);
    const buy = ordered.filter((item) => item.score >= buyThreshold).slice(0, 4);
    const neutral = ordered.filter((item) => item.score < buyThreshold && item.score > sellThreshold).slice(0, 4);
    const sell = ordered.filter((item) => item.score <= sellThreshold).slice(0, 4);
    return {
      buyThreshold,
      sellThreshold,
      buy,
      neutral,
      sell,
    };
  }, [activeScore]);

  const healthSummary = useMemo(() => {
    if (!health) return null;
    const badgeClass = HEALTH_BADGE_STYLES[health.status] ?? HEALTH_BADGE_STYLES.warn;
    const labels: Record<HealthStatus, string> = {
      ok: "Frisk",
      warn: "Begränsad data",
      empty: "Ingen data",
      error: "Fel",
    };
    const coverage = typeof health.metric_series_ratio === "number" ? `${Math.round(health.metric_series_ratio * 100)}%` : "n/a";
    const latest = health.latest_run_at ? formatDateTime(health.latest_run_at) : "n/a";
    const detailParts = [
      `${health.symbol_count} symboler`,
      `${coverage} metrics`,
      `senast ${latest}`,
    ];
    return {
      badgeClass,
      label: labels[health.status] ?? "Status",
      detail: detailParts.join(" • "),
    };
  }, [health]);

  const sortedScores = useMemo(() => {
    const base = activeScore?.scores ?? [];
    const arr = [...base];
    arr.sort((a, b) => {
      let comparison = 0;
      if (scoreSortColumn === "score") {
        comparison = a.score - b.score;
      } else if (scoreSortColumn === "symbol") {
        comparison = a.symbol.localeCompare(b.symbol);
      } else {
        const labelA = resolveScoreLabel(a.label, a.label_code, a.legacy_label).text;
        const labelB = resolveScoreLabel(b.label, b.label_code, b.legacy_label).text;
        comparison = labelA.localeCompare(labelB);
      }
      return scoreSortDir === "asc" ? comparison : -comparison;
    });
    return arr;
  }, [activeScore, scoreSortColumn, scoreSortDir]);

  useEffect(() => {
    if (sortedScores.length === 0) {
      setSelectedScoreSymbols([]);
      return;
    }
    const available = new Set(sortedScores.map((item) => item.symbol));
    setSelectedScoreSymbols((prev) => {
      const filtered = prev.filter((symbol) => available.has(symbol));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [sortedScores]);

  useEffect(() => {
    if (!highlightGroups) return;
    if (selectedScoreSymbols.length > 0) return;
    if (highlightGroups.buy.length > 0) {
      setSelectedScoreSymbols(highlightGroups.buy.map((item) => item.symbol));
    }
  }, [highlightGroups, selectedScoreSymbols.length]);

  const summaryRows = useMemo(() => {
    if (selectedScoreSymbols.length === 0) return [] as ScoreItem[];
    const lookup = new Map(sortedScores.map((item) => [item.symbol, item]));
    return selectedScoreSymbols
      .map((symbol) => lookup.get(symbol))
      .filter((item): item is ScoreItem => Boolean(item));
  }, [sortedScores, selectedScoreSymbols]);

  const handleToggleScoreSelection = useCallback((symbol: string, next?: boolean) => {
    setSelectedScoreSymbols((prev) => {
      const exists = prev.includes(symbol);
      const shouldInclude = typeof next === "boolean" ? next : !exists;
      if (shouldInclude && !exists) {
        return [...prev, symbol];
      }
      if (!shouldInclude && exists) {
        return prev.filter((item) => item !== symbol);
      }
      return prev;
    });
  }, []);

  const handleRemoveSelectedSymbol = useCallback((symbol: string) => {
    setSelectedScoreSymbols((prev) => prev.filter((item) => item !== symbol));
  }, []);

  const handleSelectAllScores = useCallback(() => {
    const all = sortedScores.map((item) => item.symbol);
    setSelectedScoreSymbols((prev) => {
      if (prev.length === all.length && prev.every((symbol, index) => symbol === all[index])) {
        return prev;
      }
      return all;
    });
  }, [sortedScores]);

  const handleClearSelections = useCallback(() => {
    setSelectedScoreSymbols((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const globalThresholds = activeScore?.thresholds ?? null;
  const scoreboardRunAt = activeScore?.run_at;
  const showScores = sortedScores.length > 0;

  const historyEntries = useMemo<ScoreHistoryEntry[]>(() => {
    return scoreHistory.map((row) => {
      const payload = parseScoreHistoryPayload(row);
      const scorecardFromRow = row.scorecard;
      const scorecard =
        (scorecardFromRow && typeof scorecardFromRow === "object" && !Array.isArray(scorecardFromRow)
          ? (scorecardFromRow as Scorecard)
          : payload?.scorecard) ??
        null;
      const metrics =
        ensureMetricMap(row.metrics) ??
        ensureMetricMap(scorecard?.metrics) ??
        ensureMetricMap((payload as unknown as { metrics?: Record<string, ScoreMetricDetail> })?.metrics);
      return {
        row,
        payload,
        scorecard,
        metrics,
      };
    });
  }, [scoreHistory]);

  const chartSymbols = useMemo(() => {
    const set = new Set<string>();
    historyEntries.forEach(({ row }) => {
      if (row.Symbol) set.add(row.Symbol);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [historyEntries]);

  const [historySymbol, setHistorySymbol] = useState<string>("");
  const [historyGrouping, setHistoryGrouping] = useState<HistoryGrouping>("monthly");
  const [historyMetric, setHistoryMetric] = useState<string>("");

  const metricCoverage = useMemo(() => {
    const counts = new Map<string, number>();
    historyEntries.forEach(({ metrics }) => {
      if (!metrics) return;
      Object.entries(metrics).forEach(([key, detail]) => {
        if (!detail) return;
        const value = detail.value;
        if (typeof value === "number" && Number.isFinite(value)) {
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [historyEntries]);

  const metricOptions = useMemo(() => {
    return metricCoverage.map(([key]) => {
      let detailLabel: string | undefined;
      for (const entry of historyEntries) {
        const detail = resolveMetricDetail(entry, key);
        if (detail?.display_name) {
          detailLabel = detail.display_name;
          break;
        }
      }
      const fact = METRIC_FACT_MAP[normalizeMetricKey(key)];
      return {
        key,
        label: detailLabel ?? fact?.label ?? formatHistoryMetricLabel(key),
      };
    });
  }, [metricCoverage, historyEntries]);

  useEffect(() => {
    if (chartSymbols.length === 0) {
      setHistorySymbol("");
      return;
    }
    if (!historySymbol || !chartSymbols.includes(historySymbol)) {
      setHistorySymbol(chartSymbols[0]);
    }
  }, [chartSymbols, historySymbol]);

  useEffect(() => {
    if (metricOptions.length === 0) {
      if (historyMetric) setHistoryMetric("");
      return;
    }
    if (!metricOptions.some((option) => option.key === historyMetric)) {
      setHistoryMetric(metricOptions[0]?.key ?? "");
    }
  }, [metricOptions, historyMetric]);

  const scorePeriodSeries = useMemo(() => {
    if (historyEntries.length === 0) {
      return [] as Array<{ period: string; average: number; min: number; max: number; count: number }>;
    }
    const buckets = new Map<string, { label: string; sortKey: number; values: number[] }>();
    historyEntries.forEach(({ row }) => {
      const value =
        typeof row.ScorePercent === "number"
          ? row.ScorePercent
          : typeof row.Score === "number"
            ? row.Score
            : null;
      if (value == null) return;
      const bucket = computeHistoryBucket(row.RunAt, historyGrouping);
      if (!bucket) return;
      const entry = buckets.get(bucket.key) ?? { label: bucket.label, sortKey: bucket.sortKey, values: [] };
      entry.values.push(value);
      buckets.set(bucket.key, entry);
    });
    return Array.from(buckets.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((entry) => {
        const total = entry.values.reduce((acc, val) => acc + val, 0);
        const average = total / entry.values.length;
        const min = Math.min(...entry.values);
        const max = Math.max(...entry.values);
        return {
          period: entry.label,
          average,
          min,
          max,
          count: entry.values.length,
        };
      });
  }, [historyEntries, historyGrouping]);

  const selectedSymbolMetricDetail = useMemo<ScoreMetricDetail | null>(() => {
    if (!historyMetric || !historySymbol) return null;
    for (const entry of historyEntries) {
      const { row } = entry;
      if (row.Symbol !== historySymbol) continue;
      const detail = resolveMetricDetail(entry, historyMetric);
      if (detail) return detail;
    }
    return null;
  }, [historyEntries, historyMetric, historySymbol]);

  const selectedMetricDetailGlobal = useMemo<ScoreMetricDetail | null>(() => {
    if (!historyMetric) return null;
    for (const entry of historyEntries) {
      const detail = resolveMetricDetail(entry, historyMetric);
      if (detail) return detail;
    }
    return null;
  }, [historyEntries, historyMetric]);

  const selectedMetricFact = useMemo(() => {
    if (!historyMetric) return undefined;
    return METRIC_FACT_MAP[normalizeMetricKey(historyMetric)];
  }, [historyMetric]);

  const metricSeries = useMemo(() => {
    if (!historySymbol || !historyMetric) return [] as MetricSeriesPoint[];
    const points: MetricSeriesPoint[] = [];
    historyEntries.forEach((entry) => {
      const { row, payload } = entry;
      if (row.Symbol !== historySymbol) return;
      const value = resolveMetricValue(entry, historyMetric);
      if (value == null) return;
      const status = row.Status ?? payload?.status ?? null;
      points.push({ RunAt: row.RunAt, value, Status: status });
    });
    points.sort((a, b) => {
      const aTime = new Date(a.RunAt ?? "").getTime();
      const bTime = new Date(b.RunAt ?? "").getTime();
      return aTime - bTime;
    });
    return points;
  }, [historyEntries, historySymbol, historyMetric]);

  const scorePeriodHasData = scorePeriodSeries.length > 0;
  const metricSeriesHasData = metricSeries.length > 0;
  const groupingLabel = useMemo(
    () => HISTORY_GROUPING_OPTIONS.find((option) => option.value === historyGrouping)?.label ?? historyGrouping,
    [historyGrouping],
  );
  const metricLabel = useMemo(() => {
    if (!historyMetric) return "";
    return (
      selectedSymbolMetricDetail?.display_name ??
      selectedMetricDetailGlobal?.display_name ??
      selectedMetricFact?.label ??
      formatHistoryMetricLabel(historyMetric)
    );
  }, [historyMetric, selectedSymbolMetricDetail, selectedMetricDetailGlobal, selectedMetricFact]);

  const metricLatestValue = useMemo(() => {
    if (!metricSeriesHasData) return null;
    const last = metricSeries[metricSeries.length - 1];
    return typeof last?.value === "number" ? last.value : null;
  }, [metricSeries, metricSeriesHasData]);

  const metricBucket = selectedSymbolMetricDetail?.bucket ?? selectedMetricDetailGlobal?.bucket ?? null;
  const metricComments = selectedSymbolMetricDetail?.comments ?? selectedMetricDetailGlobal?.comments ?? undefined;

  const handleRefreshLatest = useCallback(() => {
    fetchLatestScores({ force: true });
  }, [fetchLatestScores]);


  const handleSaveReport = useCallback(() => {
    if (!metrics) {
      toast.error("Load a symbol before saving a report.");
      return;
    }
    const summary = metrics.score;
    if (!summary) {
      toast.error("Scorecard unavailable for this symbol yet.");
      return;
    }
    const wasmCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
    const id = typeof wasmCrypto?.randomUUID === "function" ? wasmCrypto.randomUUID() : `${Date.now()}`;
    const resolved = resolveScoreLabel(summary.label?.label, summary.label?.code, undefined);
    const entry: JournalEntry = {
      id,
      symbol: metrics.symbol,
      savedAt: new Date().toISOString(),
      decision: reportDecision,
      note: reportNote.trim(),
      scorePercent: typeof summary.score_percent === "number" ? summary.score_percent : null,
      label: resolved.text,
      sector: summary.sector ?? null,
      price: typeof metrics.metrics?.price === "number" ? Number(metrics.metrics.price) : null,
      currency: metrics.currency ?? null,
    };
    setJournalEntries([...journalEntries, entry]);
    setReportNote("");
    toast.success(`Saved report for ${metrics.symbol}`);
  }, [metrics, reportDecision, reportNote, journalEntries, setJournalEntries]);

  const handleDeleteReport = useCallback((id: string) => {
    setJournalEntries(journalEntries.filter((entry) => entry.id !== id));
  }, [journalEntries, setJournalEntries]);

  const scoreSummary = useMemo(() => {
    if (!metrics?.score) return null;
    const score = metrics.score;
    const status = score.status ?? "ok";
    const message = score.message;
    const { text: resolvedLabel, tone } = resolveScoreLabel(score.label?.label, score.label?.code, undefined);
    const labelClass = LABEL_STYLES[tone] ?? LABEL_STYLES.WATCH;
    const percent = typeof score.score_percent === "number" ? score.score_percent : undefined;
    const categories = Object.entries(score.category_scores ?? {}).sort((a, b) => ((b[1]?.percentage ?? -Infinity) - (a[1]?.percentage ?? -Infinity)));
    const metricEntries = Object.entries(score.metrics ?? {});
    const strengths = status === "ok"
      ? metricEntries
          .filter(([, detail]) => detail.bucket === "green")
          .sort((a, b) => (b[1].weight ?? 0) - (a[1].weight ?? 0))
          .slice(0, 3)
      : [];
    const watchouts = status === "ok"
      ? metricEntries
          .filter(([, detail]) => detail.bucket === "red")
          .sort((a, b) => (b[1].weight ?? 0) - (a[1].weight ?? 0))
          .slice(0, 3)
      : [];
    const explanations = score.explanations ?? [];
    const thresholds = score.thresholds ?? {};

    const metricsByCategory = new Map<string, Array<[string, ScoreMetricDetail]>>();
    for (const entry of metricEntries) {
      const category = entry[1].category ?? "Other";
      const bucket = metricsByCategory.get(category) ?? [];
      bucket.push(entry);
      metricsByCategory.set(category, bucket);
    }

    const renderMetricItem = (entry: [string, ScoreMetricDetail], accent: "green" | "red") => {
      const [key, detail] = entry;
      const badgeClass = BUCKET_STYLES[detail.bucket] ?? BUCKET_STYLES.missing;
      const range = formatScoreRange(detail);
      const comment = accent === "green"
        ? detail.comments?.within || detail.comments?.general
        : detail.comments?.above || detail.comments?.general;
      return (
        <li key={key} className="flex items-start justify-between gap-3 rounded-lg bg-white/60 p-2 text-sm shadow-sm dark:bg-slate-800/40">
          <div className="space-y-1">
            <div className="font-medium text-slate-700 dark:text-slate-200">{detail.display_name}</div>
            <div className="text-xs text-slate-500">
              {range ? `Target ${range}` : "Target n/a"}
              {comment ? ` • ${comment}` : ""}
            </div>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}>{formatScoreValue(detail)}</span>
        </li>
      );
    };

    const renderMetricCard = (entry: [string, ScoreMetricDetail]) => {
      const [key, detail] = entry;
      const badgeClass = BUCKET_STYLES[detail.bucket] ?? BUCKET_STYLES.missing;
      const range = formatScoreRange(detail);
      const comment = detail.comments?.general || detail.comments?.within || detail.comments?.below || detail.comments?.above;
      return (
        <div key={key} className="rounded border border-slate-200 bg-white/80 p-3 dark:border-slate-700/40 dark:bg-slate-800/40">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium text-slate-700 dark:text-slate-100">{detail.display_name}</div>
              {range && <div className="text-xs text-slate-500">Target {range}</div>}
              {comment && <div className="text-xs text-slate-500">{comment}</div>}
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}>{formatScoreValue(detail)}</span>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-slate-700/40 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <Label className="text-xs uppercase text-slate-500">Overall score</Label>
            <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{percent != null ? `${formatNumber(percent, 1)}%` : "–"}</div>
            {score.metrics_evaluated != null && (
              <div className="text-xs text-slate-500">{score.metrics_evaluated} metrics evaluated</div>
            )}
            {typeof score.metrics_available === "number" && (
              <div className="text-xs text-slate-500">{score.metrics_available} metrics with data{typeof score.metrics_missing === "number" ? ` • ${score.metrics_missing} missing` : ""}</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${labelClass}`}>{resolvedLabel}</span>
            <div className="text-xs text-slate-500">Sector: {score.sector ?? "N/A"}</div>
            {(thresholds.buy != null || thresholds.sell != null) && (
              <div className="text-xs text-slate-500">
                Sector thresholds:&nbsp;
                {thresholds.buy != null ? `Buy ≥ ${formatNumber(thresholds.buy, 0)}` : ""}
                {thresholds.buy != null && thresholds.sell != null ? " • " : ""}
                {thresholds.sell != null ? `Sell ≤ ${formatNumber(thresholds.sell, 0)}` : ""}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map(([category, info]) => (
              <Badge key={category} variant="outline" className="bg-white/80 text-xs font-medium dark:bg-slate-800/50">
                {category}: {info?.percentage != null ? `${formatNumber(info.percentage, 1)}%` : "–"}
              </Badge>
            ))}
          </div>
        </div>

        {status !== "ok" && message && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-200">
            {message}
          </div>
        )}

        {explanations.length > 0 && (
          <div>
            <Label className="text-xs uppercase text-slate-500">Highlights</Label>
            <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              {explanations.map((item, index) => (
                <li key={`expl-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {status === "ok" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Strengths</div>
              <ul className="mt-2 space-y-2">
                {strengths.length > 0 ? strengths.map((entry) => renderMetricItem(entry, "green")) : <li className="text-xs text-slate-500">No strong green metrics yet.</li>}
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-rose-700 dark:text-rose-300">Watch-outs</div>
              <ul className="mt-2 space-y-2">
                {watchouts.length > 0 ? watchouts.map((entry) => renderMetricItem(entry, "red")) : <li className="text-xs text-slate-500">Nothing critical flagged.</li>}
              </ul>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {Array.from(metricsByCategory.entries()).map(([category, items]) => {
            const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
            return (
              <div key={category} className="space-y-2">
                <div className="text-xs uppercase text-slate-500">{categoryLabel}</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {items.map(renderMetricCard)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [metrics]);


  const kpiCards = useMemo(() => {
    if (!metrics) return null;
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {KPI_FIELDS.map((field) => (
          <Card key={field.key}>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{field.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-medium">{field.formatter(metrics.metrics[field.key], currency)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }, [metrics, currency]);

  const renderTable = useCallback(
    (title: string, fields: Array<{ key: string; label: string }>) => {
      if (!metrics) return null;
      return (
        <Card key={title}>
          <CardHeader>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-200">
                {fields.map((field) => {
                  if (!(field.key in metrics.metrics)) return null;
                  const value = metrics.metrics[field.key];
                  let display: string;
                  if (CURRENCY_FIELDS.has(field.key)) {
                    display = formatCurrency(value, currency);
                  } else if (PERCENT_FIELDS.has(field.key)) {
                    display = formatPercent(value);
                  } else {
                    display = formatNumber(value);
                  }
                  return (
                    <tr key={field.key}>
                      <td className="py-2 pr-4 text-slate-500">{field.label}</td>
                      <td className="py-2 text-right font-medium">{display}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      );
    },
    [metrics, currency],
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Fundamentals</CardTitle>
          <div className="flex items-center gap-2">
            <Input className="w-40" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Symbol (e.g., ABB.ST)" />
            <Button onClick={() => fetchFundamentals()} disabled={metricsLoading}>
              {metricsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart2 className="h-4 w-4 mr-2" />}Load
            </Button>
            <Button variant="outline" onClick={() => fetchFundamentals({ force: true })} disabled={metricsLoading}>
              <RefreshCcw className="h-4 w-4 mr-2" />Force refresh
            </Button>
          </div>
        </CardHeader>
        {metrics && (
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="flex flex-wrap gap-4">
              <div>
                <Label className="text-xs uppercase text-slate-500">Symbol</Label>
                <div className="font-semibold text-base text-slate-800">{metrics.symbol}</div>
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">Currency</Label>
                <div>{metrics.currency}</div>
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">As of</Label>
                <div>{formatDateTime(metrics.asof)}</div>
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">FX ({metrics.fx.source || "AV"})</Label>
                <div>
                  {metrics.fx.quote} → {metrics.fx.base}: {formatNumber(metrics.fx.rate, 4)} {metrics.fx.asof ? `(${metrics.fx.asof})` : ""}
                </div>
              </div>
            </div>
            {scoreSummary}
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {metrics && kpiCards}
          {metrics && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderTable("Multiples", MULTIPLE_FIELDS)}
              {renderTable("Margins", MARGIN_FIELDS)}
              {renderTable("Returns", RETURN_FIELDS)}
              {renderTable("Per share", PER_SHARE_FIELDS)}
              {renderTable("Balance sheet & cash", BALANCE_FIELDS)}
            </div>
          )}
        </div>
        <div className="space-y-4">
          {metrics && (
            <Card>
              <CardHeader>
                <CardTitle>Save report</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Decision</Label>
                    <select className="w-full h-9 rounded border border-slate-300 px-2" value={reportDecision} onChange={(event) => setReportDecision(event.target.value)}>
                      <option value="BUY">Buy</option>
                      <option value="WATCH">Watch</option>
                      <option value="SELL">Sell</option>
                    </select>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <textarea
                      className="w-full min-h-[100px] rounded border border-slate-300 bg-white p-3 text-sm"
                      placeholder="What stands out? Thesis, catalysts, risks..."
                      value={reportNote}
                      onChange={(event) => setReportNote(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Report captures the current scorecard snapshot for {metrics.symbol}.</span>
                  <Button type="button" onClick={handleSaveReport} disabled={!metrics.score}>
                    Save report
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {journalEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Saved reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {journalEntries
                  .slice()
                  .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
                  .map((entry) => {
                    const badge = LABEL_STYLES[entry.decision as keyof typeof LABEL_STYLES] ?? LABEL_STYLES.WATCH;
                    return (
                      <div key={entry.id} className="rounded border border-slate-200 p-3 dark:border-slate-700/40">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold text-slate-700 dark:text-slate-100">{entry.symbol}</div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}>{entry.decision}</span>
                            <button type="button" className="text-xs text-slate-500 hover:text-rose-600" onClick={() => handleDeleteReport(entry.id)}>Delete</button>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">Saved {formatDateTime(entry.savedAt)} • Score {entry.scorePercent != null ? `${formatNumber(entry.scorePercent, 1)}%` : "n/a"}</div>
                        {entry.note && <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{entry.note}</div>}
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Bulk scoring (watchlist)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-slate-500">Use this form to refresh the watchlist scores in bulk. For single-symbol journaling, use the save report section above.</p>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div>
                    <Label>Watchlist template</Label>
                    <select
                      className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
                      value={selectedWatchlist}
                      onChange={(event) => handleSelectWatchlist(event.target.value)}
                    >
                      <option value="">{watchlistOptions.length === 0 ? "No templates yet" : "Choose template…"}</option>
                      {watchlistOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {selectedWatchlistMeta?.description && (
                      <p className="mt-1 text-xs text-slate-500">{selectedWatchlistMeta.description}</p>
                    )}
                  </div>
                  <div>
                    <Label>Symbols</Label>
                    <textarea
                      className="mt-1 w-full min-h-[120px] rounded border border-slate-300 bg-white p-3 font-mono text-xs"
                      value={scoreSymbols}
                      onChange={(event) => setScoreSymbols(event.target.value)}
                      placeholder="ABB.ST&#10;VOLV-B.ST&#10;..."
                    />
                    <p className="mt-1 text-xs text-slate-500">Paste or type tickers separated by comma, space or newline.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Weight profile</Label>
                    <select className="w-full h-9 rounded border border-slate-300 px-2" value={selectedProfile} onChange={(event) => handleSelectProfile(event.target.value)}>
                      {allProfiles.map((profile) => (
                        <option key={profile.name} value={profile.name}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-slate-500">
                    Selecting a profile loads its weights into the editor. Adjust the JSON manually for one-off scenarios.
                  </p>
                </div>
              </div>

              {weightPreview && weightPreview.length > 0 ? (
                <div className="rounded border border-slate-200 bg-white p-3 text-xs shadow-sm dark:border-slate-700/40 dark:bg-slate-800/40">
                  <div className="text-xs font-semibold uppercase text-slate-500">Weight breakdown</div>
                  <div className="mt-2 space-y-2">
                    {weightPreview.map((section) => (
                      <div key={section.category}>
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">{section.category}</div>
                        <ul className="mt-1 space-y-1">
                          {section.metrics.map((metric) => (
                            <li key={`${section.category}-${metric.metric}`} className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] text-slate-600">{metric.metric}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded border border-slate-200 text-sm text-slate-600 hover:bg-slate-100"
                                  onClick={() => handleTweakWeight(section.category, metric.metric, -0.1)}
                                  title="Decrease weight by 0.1"
                                >
                                  -
                                </button>
                                <span className="w-12 text-right font-semibold text-slate-700">{metric.weight.toFixed(2)}</span>
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded border border-slate-200 text-sm text-slate-600 hover:bg-slate-100"
                                  onClick={() => handleTweakWeight(section.category, metric.metric, 0.1)}
                                  title="Increase weight by 0.1"
                                >
                                  +
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {!weightPreview && weightParseError ? (
                <p className="text-xs text-rose-500">Weights JSON could not be parsed. Please fix the structure to preview and tweak values.</p>
              ) : null}
              {weightPreview && weightPreview.length === 0 && !weightParseError ? (
                <p className="text-xs text-slate-500">Add metric weights to see a per-metric breakdown.</p>
              ) : null}

              <div>
                <Label>Weights JSON</Label>
                <textarea
                  className={`w-full min-h-[200px] rounded border bg-white p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 ${weightParseError ? "border-rose-300 focus-visible:ring-rose-400" : "border-slate-300 focus-visible:ring-slate-400"}`}
                  value={weightsText}
                  onChange={(event) => setWeightsText(event.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">Positive weight rewards high values. Negative weight rewards low values.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleScore} disabled={scoreLoading}>
                  {scoreLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart2 className="h-4 w-4 mr-2" />}Score
                </Button>
                <span className="text-xs text-slate-500">Latest results appear below with a removable summary.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Scores</CardTitle>
            {scoreboardRunAt && <div className="text-xs text-slate-500">Last bulk run {formatDateTime(scoreboardRunAt)}</div>}
            {globalThresholds && (
              <div className="text-xs text-slate-500">
                Global thresholds
                {globalThresholds.buy != null ? ` • Buy ≥ ${formatNumber(globalThresholds.buy, 0)}` : ""}
                {globalThresholds.sell != null ? ` • Sell ≤ ${formatNumber(globalThresholds.sell, 0)}` : ""}
              </div>
            )}
            {healthSummary && (
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <Badge variant="outline" className={healthSummary.badgeClass}>
                  {healthSummary.label}
                </Badge>
                <span>{healthSummary.detail}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => fetchLatestScores()} disabled={latestLoading}>
              {latestLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}Load latest
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefreshLatest} disabled={latestLoading}>
              Force
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            Use the bulk scorer to refresh multiple symbols and pin the most relevant ones in the summary.
          </p>
          {showScores ? (
            <>
              {highlightGroups && (highlightGroups.buy.length > 0 || highlightGroups.neutral.length > 0 || highlightGroups.sell.length > 0) ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    {
                      title: `Buy zone ≥ ${formatNumber(highlightGroups.buyThreshold, 0)}%`,
                      items: highlightGroups.buy,
                    },
                    {
                      title: "Stable / watch",
                      items: highlightGroups.neutral,
                    },
                    {
                      title: `Caution ≤ ${formatNumber(highlightGroups.sellThreshold, 0)}%`,
                      items: highlightGroups.sell,
                    },
                  ].map((group) => (
                    <div key={group.title} className="space-y-2">
                      <div className="text-xs font-semibold uppercase text-slate-500">{group.title}</div>
                      {group.items.length === 0 ? (
                        <p className="text-xs text-slate-500">Nothing to surface yet.</p>
                      ) : (
                        group.items.map((item) => {
                          const { text: labelText, tone } = resolveScoreLabel(item.label, item.label_code, item.legacy_label);
                          const badgeClass = LABEL_STYLES[tone] ?? LABEL_STYLES.WATCH;
                          return (
                            <div key={`${group.title}-${item.symbol}`} className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700/40 dark:bg-slate-800/40">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800 dark:text-slate-100">{item.symbol}</span>
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatNumber(item.score, 1)}%</span>
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>{labelText}</span>
                                {item.sector ? <span className="text-[11px] uppercase tracking-wide text-slate-400">{item.sector}</span> : null}
                              </div>
                              {item.price != null ? (
                                <div className="mt-1 text-[11px] text-slate-500">{formatPrice(item.price, item.currency ?? "SEK")}</div>
                              ) : null}
                              <button
                                type="button"
                                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                                onClick={() => handleToggleScoreSelection(item.symbol, true)}
                              >
                                Pin to summary
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600">
                  {summaryRows.length > 0
                    ? `Pinned ${summaryRows.length} of ${sortedScores.length} symbols in the summary.`
                    : "Ingen sammanfattning ännu. Markera raderna nedan för att lägga till symboler."}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectAllScores} disabled={sortedScores.length === 0}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClearSelections} disabled={selectedScoreSymbols.length === 0}>
                    Clear summary
                  </Button>
                </div>
              </div>
              {scoreboardRunAt && <div className="text-xs text-slate-500">Last bulk run {formatDateTime(scoreboardRunAt)}</div>}
              {summaryRows.length > 0 && (
                <div className="overflow-x-auto rounded border border-slate-200 p-3 dark:border-slate-700/40">
                  <table className="w-full text-xs md:text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-2 pr-3 text-left">Symbol</th>
                        <th className="py-2 pr-3 text-left">Score</th>
                        <th className="py-2 pr-3 text-left">Label</th>
                        <th className="py-2 pr-3 text-left">Sector</th>
                        <th className="py-2 pr-3 text-left">Price</th>
                        <th className="py-2 pr-3 text-left">As of</th>
                        <th className="py-2 pr-3 text-left">Run at</th>
                        <th className="py-2 pl-3 pr-1 text-right">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {summaryRows.map((item) => {
                        const { text: labelText, tone } = resolveScoreLabel(item.label, item.label_code, item.legacy_label);
                        const badgeClass = LABEL_STYLES[tone] ?? LABEL_STYLES.WATCH;
                        const priceDisplay = item.price != null ? formatPrice(item.price, item.currency ?? "SEK") : "–";
                        return (
                          <tr key={`summary-${item.symbol}`}>
                            <td className="py-2 pr-3 font-semibold text-slate-800 dark:text-slate-100">{item.symbol}</td>
                            <td className="py-2 pr-3">{`${formatNumber(item.score, 1)}%`}</td>
                            <td className="py-2 pr-3">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>{labelText}</span>
                            </td>
                            <td className="py-2 pr-3">{item.sector ?? "N/A"}</td>
                            <td className="py-2 pr-3">{priceDisplay}</td>
                            <td className="py-2 pr-3">{item.asof ? formatDateTime(item.asof) : "–"}</td>
                            <td className="py-2 pr-3">{scoreboardRunAt ? formatDateTime(scoreboardRunAt) : "–"}</td>
                            <td className="py-2 pl-3 pr-1 text-right">
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:text-rose-600"
                                onClick={() => handleRemoveSelectedSymbol(item.symbol)}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">Remove {item.symbol}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="w-12 py-2 pr-3">Select</th>
                      <th className="py-2 pr-3">
                        <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("symbol")}>
                          Symbol {renderSortIndicator.symbol}
                        </button>
                      </th>
                      <th className="py-2 pr-3">
                        <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("score")}>
                          Score {renderSortIndicator.score}
                        </button>
                      </th>
                      <th className="py-2 pr-3">
                        <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("label")}>
                          Label {renderSortIndicator.label}
                        </button>
                      </th>
                      <th className="py-2 pr-3">Sector</th>
                      <th className="py-2 pr-3">Price</th>
                      <th className="py-2 pr-3">As of</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedScores.map((item) => {
                      const isSelected = selectedScoreSymbols.includes(item.symbol);
                      const { text: labelText, tone } = resolveScoreLabel(item.label, item.label_code, item.legacy_label);
                      const badgeClass = LABEL_STYLES[tone] ?? LABEL_STYLES.WATCH;
                      const priceDisplay = item.price != null ? formatPrice(item.price, item.currency ?? "SEK") : "–";
                      const statusDisplay = item.status ?? "–";
                      return (
                        <tr key={item.symbol}>
                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={isSelected}
                              onChange={(event) => handleToggleScoreSelection(item.symbol, event.target.checked)}
                              aria-label={`Select ${item.symbol}`}
                            />
                          </td>
                          <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{item.symbol}</td>
                          <td className="py-2 pr-3">{`${formatNumber(item.score, 1)}%`}</td>
                          <td className="py-2 pr-3">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>{labelText}</span>
                          </td>
                          <td className="py-2 pr-3">{item.sector ?? "N/A"}</td>
                          <td className="py-2 pr-3">{priceDisplay}</td>
                          <td className="py-2 pr-3">{item.asof ? formatDateTime(item.asof) : "–"}</td>
                          <td className="py-2 pr-3">{statusDisplay}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              </>
          ) : (
            <p className="text-sm text-slate-500">No scores yet. Run a bulk scoring job to populate the watchlist.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Score history</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => fetchScoreHistory()} disabled={historyLoading}>
            {historyLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}Reload history
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {historyLoading ? (
            <p className="text-sm text-slate-500">Loading history…</p>
          ) : scoreHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No historical data yet. Nightly refresh will populate scores.</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Grouping</Label>
                  <select className="w-full h-9 rounded border border-slate-300 px-2" value={historyGrouping} onChange={(event) => setHistoryGrouping(event.target.value as HistoryGrouping)}>
                    {HISTORY_GROUPING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Symbol</Label>
                  <select className="w-full h-9 rounded border border-slate-300 px-2" value={historySymbol} onChange={(event) => setHistorySymbol(event.target.value)}>
                    {chartSymbols.length === 0 ? <option value="">Ingen symbol</option> : null}
                    {chartSymbols.map((sym) => (
                      <option key={sym} value={sym}>
                        {sym}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Metric (topp 10)</Label>
                  <select className="w-full h-9 rounded border border-slate-300 px-2" value={historyMetric} onChange={(event) => setHistoryMetric(event.target.value)} disabled={metricOptions.length === 0}>
                    {metricOptions.length === 0 ? <option value="">Ingen data tillgänglig</option> : null}
                    {metricOptions.map((metric) => (
                      <option key={metric.key} value={metric.key}>
                        {metric.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {historyMetric && (selectedSymbolMetricDetail || selectedMetricDetailGlobal || selectedMetricFact) && (
                <div className="rounded border border-slate-200 bg-white/70 p-3 text-sm dark:border-slate-700/40 dark:bg-slate-800/50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{metricLabel}</div>
                      {metricBucket && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${BUCKET_STYLES[metricBucket] ?? BUCKET_STYLES.missing}`}>
                          {metricBucket === "green" ? "Strength" : metricBucket === "amber" ? "Neutral" : metricBucket === "red" ? "Risk" : "Info"}
                        </span>
                      )}
                    </div>
                    {metricLatestValue != null && (
                      <div className="text-xs text-slate-500">
                        Latest: {formatNumber(metricLatestValue, 2)}
                      </div>
                    )}
                  </div>
                  {selectedMetricFact?.whyItMatters && (
                    <p className="mt-2 text-slate-600 dark:text-slate-300">{selectedMetricFact.whyItMatters}</p>
                  )}
                  {metricComments && (metricComments.general || metricComments.within || metricComments.above || metricComments.below) && (
                    <p className="mt-1 text-xs text-slate-500">{metricComments.general || metricComments.within || metricComments.above || metricComments.below}</p>
                  )}
                  {selectedMetricFact?.good && (
                    <p className="mt-1 text-xs text-slate-500">Bra nivå: {selectedMetricFact.good}</p>
                  )}
                  {selectedMetricFact?.caution && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">Att tänka på: {selectedMetricFact.caution}</p>
                  )}
                </div>
              )}
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Genomsnittlig score per {groupingLabel.toLowerCase()}
                    </h4>
                    <div className="text-xs text-slate-500">{scorePeriodSeries.length} perioder</div>
                  </div>
                  {scorePeriodHasData ? (
                    <div className="h-72">
                      <ResponsiveContainer>
                        <AreaChart data={scorePeriodSeries} margin={{ left: 0, right: 16, top: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="period" />
                          <YAxis tickFormatter={(value) => formatNumber(Number(value), 1)} width={60} />
                          <RechartsTooltip
                            labelFormatter={(value) => String(value)}
                            formatter={(value: number, _name, info) => {
                              const payload = (info?.payload as { min?: number; max?: number; count?: number }) ?? {};
                              const extras: string[] = [];
                              if (typeof payload.min === "number") extras.push(`min ${formatNumber(payload.min, 1)}`);
                              if (typeof payload.max === "number") extras.push(`max ${formatNumber(payload.max, 1)}`);
                              if (typeof payload.count === "number") extras.push(`${payload.count} obs`);
                              const suffix = extras.length ? ` (${extras.join(", ")})` : "";
                              return [`${formatNumber(value, 2)}${suffix}`, "Score %"];
                            }}
                          />
                          <Area type="monotone" dataKey="average" stroke="#2563eb" fill="rgba(37,99,235,0.25)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Det finns inte tillräckligt med historik för att visa score per {groupingLabel.toLowerCase()}.
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {historySymbol ? `${historySymbol}: ${metricLabel}` : metricLabel || "Metric"}
                    </h4>
                    <div className="text-xs text-slate-500">{metricSeries.length} datapunkter</div>
                  </div>
                  {metricSeriesHasData ? (
                    <div className="h-72">
                      <ResponsiveContainer>
                        <LineChart data={metricSeries} margin={{ left: 0, right: 16, top: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="RunAt" tickFormatter={(value) => formatDateTime(String(value))} minTickGap={24} />
                          <YAxis tickFormatter={(value) => formatNumber(Number(value), 1)} width={60} />
                          <RechartsTooltip
                            labelFormatter={(value) => formatDateTime(String(value))}
                            formatter={(value: number) => [`${formatNumber(value, 2)}`, metricLabel || "Metric"]}
                          />
                          <Line type="monotone" dataKey="value" stroke="#0f172a" strokeWidth={2} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Ingen data hittades för {historySymbol || "vald symbol"} och {metricLabel || "vald metric"}.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

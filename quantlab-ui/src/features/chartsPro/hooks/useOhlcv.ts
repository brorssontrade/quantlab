import { useCallback, useEffect, useMemo, useState } from "react";

import { MAX_POINT_COUNT, type ChartTimeframe } from "../state/controls";
import type { ChartMeta, NormalizedBar, OhlcvResponse, RawOhlcvRow, Tf } from "../types";
import { normalizeRows } from "../types";
import { getMockOhlcv } from "../mocks/ohlcv";
import { fetchOhlcv, fetchCompareOhlcv, setBaseRowsCount, getDataMode } from "../runtime/dataClient";

interface UseOhlcvParams {
  apiBase: string;
  symbol: string;
  timeframe: ChartTimeframe;
  limit?: number;
  from?: string;
  to?: string;
  mock?: boolean;
}

interface UseOhlcvResult {
  data: NormalizedBar[];
  loading: boolean;
  error: string | null;
  meta: ChartMeta | null;
  mode: 'live' | 'demo';
  reload: () => void;
}

const toUtcTs = (value: number): NormalizedBar["time"] => {
  if (!Number.isFinite(value)) {
    return Math.floor(Date.now() / 1000) as NormalizedBar["time"];
  }
  const seconds = value > 20_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  return seconds as NormalizedBar["time"];
};

export interface FetchOhlcvOptions {
  apiBase: string;
  symbol: string;
  timeframe: string;
  limit?: number;
  /** ISO start timestamp for windowed fetch (e.g., '2026-01-01T00:00:00Z') */
  start?: string;
  /** ISO end timestamp for windowed fetch */
  end?: string;
  mock?: boolean;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export function useOhlcvQuery({
  apiBase,
  symbol,
  timeframe,
  limit = MAX_POINT_COUNT,
  from,
  to,
  mock = false,
}: UseOhlcvParams): UseOhlcvResult {
  const [data, setData] = useState<NormalizedBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ChartMeta | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const safeBase = useMemo(() => apiBase.replace(/\/$/, ""), [apiBase]);
  const normalizedSymbol = symbol.trim().toUpperCase();

  const globalWindow = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
  const shouldMock = mock || Boolean(globalWindow?.__cpMock);

  const reload = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    if (!normalizedSymbol) {
      setData([]);
      setMeta(null);
      setError("Specify a symbol to load data");
      setLoading(false);
      setBaseRowsCount(0);
      return;
    }
    if (shouldMock) {
      setLoading(false);
      setError(null);
      setMeta(null);
      const mockData = getMockOhlcv(normalizedSymbol, timeframe as Tf);
      setData(mockData);
      setBaseRowsCount(mockData.length);
      return;
    }
    const controller = new AbortController();
    let mounted = true;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // TV-3 Steg 1B: Use dataClient for base OHLCV fetch
        const result = await fetchOhlcv(normalizedSymbol, timeframe, {
          limit,
          source: 'yahoo',
        });

        if (!mounted) return;

        if (!result.ok) {
          const errorMsg = result.error?.message || "Failed to load OHLCV data";
          setError(errorMsg);
          setData([]);
          setMeta(null);
          setBaseRowsCount(0);
          return;
        }

        const rows = result.data || [];
        const normalized = normalizeRows(rows as any).map((row) => {
          const baseMs =
            typeof row.timestampMs === "number" && Number.isFinite(row.timestampMs)
              ? row.timestampMs
              : typeof row.time === "number"
                ? row.time * 1000
                : Date.now();
          return {
            ...row,
            time: toUtcTs(baseMs),
          };
        });

        if (!mounted) return;
        setData(normalized);
        setBaseRowsCount(normalized.length);
        setMeta(null); // meta not available from dataClient, but that's OK
      } catch (err) {
        if (controller.signal.aborted || !mounted) return;
        const message = err instanceof Error ? err.message : "Something went wrong while loading OHLCV";
        setError(message);
        setData([]);
        setMeta(null);
        setBaseRowsCount(0);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData().catch(() => {
      // handled above
    });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [safeBase, normalizedSymbol, timeframe, limit, from, to, reloadTick, shouldMock]);

  return { data, loading, error, meta, mode: getDataMode(), reload };
}

export async function fetchOhlcvSeries({
  apiBase,
  symbol,
  timeframe,
  limit = MAX_POINT_COUNT,
  start,
  end,
  mock = false,
  signal,
}: FetchOhlcvOptions): Promise<NormalizedBar[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return [];
  if (mock) {
    return getMockOhlcv(normalizedSymbol, timeframe as Tf);
  }
  const safeBase = apiBase.replace(/\/$/, "");
  const url = new URL(`${safeBase}/chart/ohlcv`);
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("bar", timeframe);
  url.searchParams.set("limit", String(limit));
  // TV-37.2: Add windowed fetch support for range presets
  if (start) url.searchParams.set("start", start);
  if (end) url.searchParams.set("end", end);
  
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Failed to load ${normalizedSymbol}`);
  }
  const payload = (await res.json()) as OhlcvResponse | RawOhlcvRow[];
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rows)
      ? payload.rows
      : [];
  return normalizeRows(rows).map((row) => {
    const baseMs =
      typeof row.timestampMs === "number" && Number.isFinite(row.timestampMs)
        ? row.timestampMs
        : typeof row.time === "number"
          ? row.time * 1000
          : Date.now();
    return {
      ...row,
      time: toUtcTs(baseMs),
    };
  });
}

function extractMeta(payload: OhlcvResponse | RawOhlcvRow[] | undefined, headers: Headers): ChartMeta | null {
  const metaRecord =
    payload && !Array.isArray(payload) && payload.meta && typeof payload.meta === "object"
      ? (payload.meta as Record<string, unknown>)
      : null;
  const source = toOptionalString(metaRecord?.source) ?? headers.get("X-Data-Source") ?? undefined;
  const fallback =
    toOptionalBoolean(metaRecord?.fallback) ??
    toOptionalBoolean(headers.get("X-Data-Fallback") ?? undefined) ??
    undefined;
  const tz = toOptionalString(metaRecord?.tz);
  const cache = toOptionalString(metaRecord?.cache) ?? headers.get("X-Cache") ?? undefined;
  if (!source && !fallback && !tz && !cache) return null;
  return { source, fallback, tz, cache: cache ?? undefined };
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return undefined;
}

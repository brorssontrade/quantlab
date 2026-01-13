/**
 * dataClient.ts
 *
 * Sprint TV-3: Centralized Data Client for ChartsPro
 *
 * Handles all external data fetching with:
 * - API health checks
 * - Timeout & retry logic
 * - Standardized error shapes
 * - Status tracking for dump()
 *
 * Architecture:
 * - Single source of truth for baseURL
 * - All fetch calls go through this module
 * - Exposes status for UI consumption
 */

// ============================================================================
// Types
// ============================================================================

export interface DataClientConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
}

export interface HealthCheckResult {
  ok: boolean;
  status: 'online' | 'offline' | 'error';
  message?: string;
  timestamp: number;
}

export interface FetchResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface OhlcvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';

export type DataMode = 'live' | 'demo';

export interface CompareStatus {
  status: DataStatus;
  lastError: string | null;
  rows: number;
}

export interface DataDumpState {
  mode: DataMode;
  api: {
    ok: boolean;
    lastOkAt?: number;
    lastError?: string;
  };
  base: {
    status: DataStatus;
    rows: number;
  };
  compares: Record<string, {
    status: DataStatus;
    rows?: number;
    error?: string;
  }>;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get base URL from environment variable or fallback to localhost
 * - VITE_API_BASE_URL: explicit URL (e.g., http://127.0.0.1:8000)
 * - Fallback: http://127.0.0.1:8000 (local dev/preview)
 * - Production: set VITE_API_BASE_URL to relative /api (reverse proxy)
 */
function getDefaultBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim();
  }
  // Fallback for local dev/preview without .env
  return 'http://127.0.0.1:8000';
}

const DEFAULT_CONFIG: DataClientConfig = {
  baseUrl: getDefaultBaseUrl(),
  timeout: 10000, // 10s
  retries: 2,
};

let currentConfig: DataClientConfig = { ...DEFAULT_CONFIG };

export function configureDataClient(config: Partial<DataClientConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

export function getDataClientConfig(): Readonly<DataClientConfig> {
  return currentConfig;
}

// ============================================================================
// State (for dump() exposure)
// ============================================================================

let dataMode: DataMode = 'demo'; // Default to demo until health check runs
let qaForceDataMode: DataMode | null = null; // QA control to force mode for deterministic testing
let dataStatus: DataStatus = 'idle';
let lastError: string | null = null;
let lastHealthCheck: HealthCheckResult | null = null;
let compareStatusBySymbol: Record<string, CompareStatus> = {};
let baseRowsCount: number = 0;
let cachedBaseRows: OhlcvBar[] = []; // Cache to prevent blink on brief API outages

export function getDataStatus(): DataStatus {
  return dataStatus;
}

export function getLastError(): string | null {
  return lastError;
}

export function getLastHealthCheck(): HealthCheckResult | null {
  return lastHealthCheck;
}

export function getCompareStatusBySymbol(): Record<string, CompareStatus> {
  return compareStatusBySymbol;
}

export function getBaseRowsCount(): number {
  return baseRowsCount;
}

export function getCachedBaseRows(): OhlcvBar[] {
  return cachedBaseRows;
}

export function getDataMode(): DataMode {
  return qaForceDataMode ?? dataMode;
}

export function setQAForceDataMode(mode: DataMode | null): void {
  qaForceDataMode = mode;
}

export function setBaseRowsCount(count: number): void {
  baseRowsCount = count;
}

export function setCompareStatus(symbol: string, status: CompareStatus): void {
  compareStatusBySymbol = {
    ...compareStatusBySymbol,
    [symbol]: status,
  };
}

export function deleteCompareStatus(symbol: string): void {
  const next = { ...compareStatusBySymbol };
  delete next[symbol];
  compareStatusBySymbol = next;
}

export function getDumpDataState(): DataDumpState {
  const apiOk = lastHealthCheck?.ok ?? false;
  
  return {
    mode: dataMode,
    api: {
      ok: apiOk,
      lastOkAt: lastHealthCheck?.timestamp,
      lastError: lastHealthCheck?.ok ? undefined : lastHealthCheck?.message,
    },
    base: {
      status: dataStatus ?? 'idle',
      rows: baseRowsCount,
    },
    compares: Object.entries(compareStatusBySymbol).reduce((acc, [sym, status]) => {
      acc[sym] = {
        status: status.status,
        rows: status.rows ?? 0,
        error: status.error,
      };
      return acc;
    }, {} as Record<string, { status: DataStatus; rows?: number; error?: string }>),
  };
}

function setDataStatus(status: DataStatus, error?: string): void {
  dataStatus = status;
  lastError = error ?? null;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = currentConfig.timeout
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    throw error;
  }
}

/**
 * Retry logic with exponential backoff
 */
async function fetchWithRetry<T>(
  fetcher: () => Promise<T>,
  retries: number = currentConfig.retries
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetcher();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on timeout or 4xx errors (client errors)
      if (
        lastError.message === 'TIMEOUT' ||
        (error instanceof Response && error.status >= 400 && error.status < 500)
      ) {
        break;
      }

      // Exponential backoff: 100ms, 200ms, 400ms
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

// ============================================================================
// API Health Check
// ============================================================================

/**
 * Check if backend API is reachable
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  const timestamp = Date.now();

  // If QA force mode is set, skip actual health check and return forced result
  if (qaForceDataMode !== null) {
    const result: HealthCheckResult = {
      ok: qaForceDataMode === 'live',
      status: qaForceDataMode === 'live' ? 'online' : 'offline',
      message: qaForceDataMode === 'live' ? 'API is reachable (QA forced)' : 'Offline (QA forced)',
      timestamp,
    };
    lastHealthCheck = result;
    dataMode = qaForceDataMode;
    return result;
  }

  try {
    const response = await fetchWithTimeout(
      `${currentConfig.baseUrl}/api/health`,
      { method: 'GET' },
      5000 // Shorter timeout for health check
    );

    if (response.ok) {
      const result: HealthCheckResult = {
        ok: true,
        status: 'online',
        message: 'API is reachable',
        timestamp,
      };
      lastHealthCheck = result;
      dataMode = 'live'; // Set to live mode when API is online
      return result;
    } else {
      const result: HealthCheckResult = {
        ok: false,
        status: 'error',
        message: `HTTP ${response.status}`,
        timestamp,
      };
      lastHealthCheck = result;
      dataMode = 'demo'; // Fall back to demo when API returns error
      return result;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const result: HealthCheckResult = {
      ok: false,
      status: 'offline',
      message,
      timestamp,
    };
    lastHealthCheck = result;
    dataMode = 'demo'; // Fall back to demo when API is offline
    return result;
  }
}

/**
 * Start polling health check (for UI status indicator)
 */
let healthCheckInterval: NodeJS.Timeout | null = null;

export function startHealthCheckPoll(
  intervalMs: number = 5000,
  onUpdate?: (result: HealthCheckResult) => void
): void {
  stopHealthCheckPoll(); // Clear existing

  healthCheckInterval = setInterval(async () => {
    const result = await healthCheck();
    onUpdate?.(result);
  }, intervalMs);

  // Run immediately
  healthCheck().then((result) => onUpdate?.(result));
}

export function stopHealthCheckPoll(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// ============================================================================
// OHLCV Data Fetch
// ============================================================================

export interface FetchOhlcvOptions {
  limit?: number;
  source?: 'yahoo' | 'polygon' | 'mock';
}

/**
 * Fetch OHLCV data for a symbol
 */
export async function fetchOhlcv(
  symbol: string,
  timeframe: string,
  options: FetchOhlcvOptions = {}
): Promise<FetchResult<OhlcvBar[]>> {
  setDataStatus('loading');

  try {
    const { limit = 500, source = 'yahoo' } = options;

    const url = new URL(`${currentConfig.baseUrl}/api/chart/ohlcv`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('timeframe', timeframe);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('source', source);

    const response = await fetchWithRetry(() =>
      fetchWithTimeout(url.toString(), { method: 'GET' })
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const errorCode = `HTTP_${response.status}`;
      const errorMessage = `Failed to fetch OHLCV: ${errorText}`;

      setDataStatus('error', errorMessage);

      // If API offline and we have cached baseRows, return them in demo mode
      if (cachedBaseRows.length > 0) {
        dataMode = 'demo';
        return {
          ok: true,
          data: cachedBaseRows, // Return cached data instead of failing
        };
      }

      return {
        ok: false,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }

    const json = await response.json();
    const data: OhlcvBar[] = json.candles || json.data || [];

    // Cache successful base rows for offline fallback
    if (data.length > 0) {
      cachedBaseRows = [...data];
    }

    setDataStatus('ready');

    return {
      ok: true,
      data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = errorMessage === 'TIMEOUT' ? 'TIMEOUT' : 'FETCH_ERROR';

    setDataStatus('error', errorMessage);

    // If API offline and we have cached baseRows, return them in demo mode
    if (cachedBaseRows.length > 0) {
      dataMode = 'demo';
      return {
        ok: true,
        data: cachedBaseRows, // Return cached data instead of failing
      };
    }

    return {
      ok: false,
      error: {
        code: errorCode,
        message: errorMessage,
      },
    };
  }
}

/**
 * Fetch OHLCV data for a compare symbol (non-blocking errors)
 */
export async function fetchCompareOhlcv(
  symbol: string,
  timeframe: string,
  options: FetchOhlcvOptions = {}
): Promise<FetchResult<OhlcvBar[]>> {
  // Compare fetch does NOT update global dataStatus (only base does)
  try {
    const { limit = 500, source = 'yahoo' } = options;

    const url = new URL(`${currentConfig.baseUrl}/api/chart/ohlcv`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('timeframe', timeframe);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('source', source);

    const response = await fetchWithRetry(() =>
      fetchWithTimeout(url.toString(), { method: 'GET' })
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        ok: false,
        error: {
          code: `HTTP_${response.status}`,
          message: `Failed to fetch compare OHLCV: ${errorText}`,
        },
      };
    }

    const json = await response.json();
    const data: OhlcvBar[] = json.candles || json.data || [];

    return {
      ok: true,
      data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        code: errorMessage === 'TIMEOUT' ? 'TIMEOUT' : 'FETCH_ERROR',
        message: errorMessage,
      },
    };
  }
}

// ============================================================================
// Reset (for tests)
// ============================================================================

export function resetDataClient(): void {
  dataStatus = 'idle';
  lastError = null;
  lastHealthCheck = null;
  dataMode = 'demo'; // Reset to demo mode
  cachedBaseRows = []; // Clear cached rows
  compareStatusBySymbol = {};
  baseRowsCount = 0;
  stopHealthCheckPoll();
  currentConfig = { ...DEFAULT_CONFIG };
}

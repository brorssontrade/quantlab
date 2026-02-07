/**
 * VPDebugBanner.tsx
 * 
 * Debug overlay for Volume Profile indicators.
 * Shows per-VP status: rangeStart/rangeEnd, barCount, profilesCount, anchorStart/anchorEnd, lastError.
 * Positioned in the chart's top-left corner.
 * 
 * Only renders in dev mode or when ?vpDebug=1 query param is set.
 */

import { useMemo } from "react";

interface VPDebugEntry {
  name: string;
  enabled: boolean;
  rangeStart: number;
  rangeEnd: number;
  ltfBars: number;
  chartBarsTotal?: number;
  profilesCount: number;
  anchorStart?: number;
  anchorEnd?: number;
  error?: string | null;
  loading?: boolean;
  usingFallback?: boolean;
  // New: additional diagnostic data
  priceMin?: number;
  priceMax?: number;
}

interface VPDebugBannerProps {
  entries: VPDebugEntry[];
  chartApiReady: boolean;
  chartBarsCount: number;
  // New: bar validation info
  barsFirstTime?: number;
  barsLastTime?: number;
  barsFirstDate?: string;
  barsLastDate?: string;
  barsIsAscending?: boolean;
  barsPriceMin?: number;
  barsPriceMax?: number;
  barsIssues?: string[];
}

function formatTime(ts: number): string {
  if (!ts || ts <= 0) return "none";
  try {
    return new Date(ts * 1000).toISOString().slice(0, 10);
  } catch {
    return `${ts}`;
  }
}

function formatPrice(p: number | undefined): string {
  if (p === undefined || !isFinite(p) || p <= 0) return "?";
  return p.toFixed(2);
}

export function VPDebugBanner({ 
  entries, 
  chartApiReady, 
  chartBarsCount,
  barsFirstTime = 0,
  barsLastTime = 0,
  barsFirstDate = "?",
  barsLastDate = "?",
  barsIsAscending = true,
  barsPriceMin = 0,
  barsPriceMax = 0,
  barsIssues = [],
}: VPDebugBannerProps) {
  // Only show in dev mode or with vpDebug query param
  const shouldShow = useMemo(() => {
    if (typeof window === "undefined") return false;
    const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV;
    const hasQueryParam = window.location.search.includes("vpDebug=1");
    return isDev || hasQueryParam;
  }, []);
  
  if (!shouldShow) return null;
  
  const enabledEntries = entries.filter(e => e.enabled);
  if (enabledEntries.length === 0 && chartApiReady && chartBarsCount > 0) return null;
  
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        background: "rgba(0, 0, 0, 0.85)",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: "11px",
        padding: "6px 10px",
        borderRadius: "4px",
        zIndex: 1000,
        pointerEvents: "none",
        maxWidth: "400px",
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4, color: "#ff9800" }}>
        VP Debug
      </div>
      
      {/* Chart state */}
      <div style={{ marginBottom: 4, color: chartApiReady ? "#4caf50" : "#f44336" }}>
        Chart: {chartApiReady ? "ready" : "NOT READY"} | Bars: {chartBarsCount}
      </div>
      
      {/* Bars validation info */}
      {chartBarsCount > 0 && (
        <div style={{ marginBottom: 4, fontSize: "10px" }}>
          <div style={{ color: barsIsAscending ? "#4caf50" : "#f44336" }}>
            Bars: {barsFirstDate} → {barsLastDate} {!barsIsAscending && "(DESC!)"}
          </div>
          <div>
            Price: {formatPrice(barsPriceMin)} - {formatPrice(barsPriceMax)}
          </div>
          {barsIssues.length > 0 && (
            <div style={{ color: "#f44336" }}>
              Issues: {barsIssues.join(", ")}
            </div>
          )}
        </div>
      )}
      
      {/* VP entries */}
      {entries.length === 0 ? (
        <div style={{ color: "#888" }}>No VP indicators active</div>
      ) : (
        entries.map((entry, idx) => (
          <div
            key={idx}
            style={{
              marginTop: idx > 0 ? 4 : 0,
              paddingTop: idx > 0 ? 4 : 0,
              borderTop: idx > 0 ? "1px solid #444" : undefined,
              color: entry.enabled ? "#fff" : "#666",
            }}
          >
            <div style={{ fontWeight: "bold", color: entry.profilesCount > 0 ? "#4caf50" : "#f44336" }}>
              {entry.name}: {entry.profilesCount} profiles
            </div>
            
            <div>
              Range: {formatTime(entry.rangeStart)} → {formatTime(entry.rangeEnd)}
            </div>
            
            {/* Show price range for window */}
            {(entry.priceMin !== undefined && entry.priceMax !== undefined) && (
              <div style={{ color: "#82b1ff" }}>
                PriceWindow: {formatPrice(entry.priceMin)} - {formatPrice(entry.priceMax)}
              </div>
            )}
            
            <div>
              LTF: {entry.ltfBars} bars
              {entry.usingFallback && <span style={{ color: "#ff9800" }}> (fallback)</span>}
              {entry.chartBarsTotal !== undefined && ` | Chart: ${entry.chartBarsTotal}`}
            </div>
            
            {(entry.anchorStart !== undefined || entry.anchorEnd !== undefined) && (
              <div>
                Anchor: {formatTime(entry.anchorStart ?? 0)} → {formatTime(entry.anchorEnd ?? 0)}
              </div>
            )}
            
            {entry.loading && (
              <div style={{ color: "#2196f3" }}>Loading...</div>
            )}
            
            {entry.error && (
              <div style={{ color: "#f44336" }}>Error: {entry.error}</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export type { VPDebugEntry };

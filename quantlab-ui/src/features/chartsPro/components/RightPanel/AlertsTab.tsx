import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Drawing, Tf } from "../../types";

interface AlertItem {
  id: number;
  label: string | null;
  symbol: string;
  bar: string;
  type: "price" | "indicator" | "trendline";
  direction: "cross_up" | "cross_down" | "cross_any";
  geometry: Record<string, unknown>;
  enabled: boolean;
  one_shot: boolean;
  cooldown_min: number;
  last_triggered_at: string | null;
}

type AlertDirection = "cross_up" | "cross_down" | "cross_any";

const DIRECTION_LABELS: Record<AlertDirection, string> = {
  cross_up: "Crosses above",
  cross_down: "Crosses below",
  cross_any: "Crosses either",
};

function tfToBar(tf: Tf): string {
  switch (tf) {
    case "1m":
      return "1m";
    case "5m":
      return "5m";
    case "15m":
      return "15m";
    case "1h":
      return "1h";
    case "4h":
      return "4h";
    case "1D":
      return "D";
    case "1W":
      return "W";
    default:
      return "D";
  }
}

function drawingToGeometry(drawing: Drawing): Record<string, unknown> | null {
  if (drawing.kind === "hline") {
    return { price: drawing.price };
  }
  if (drawing.kind === "trend") {
    return {
      start: { time: Math.floor(drawing.p1.timeMs / 1000), price: drawing.p1.price },
      end: { time: Math.floor(drawing.p2.timeMs / 1000), price: drawing.p2.price },
    };
  }
  return null;
}

function drawingToAlertType(drawing: Drawing): "price" | "trendline" | null {
  if (drawing.kind === "hline") return "price";
  if (drawing.kind === "trend") return "trendline";
  return null;
}

interface AlertsTabProps {
  apiBase: string;
  symbol: string;
  timeframe: Tf;
  selectedDrawing: Drawing | null;
}

/**
 * AlertsTab – TradingView-style alerts list (TV-8).
 * 
 * Features:
 * - Sticky header with "Alerts" title + "Create Alert" button
 * - Scrollable list of alerts (symbol, condition, price, status)
 * - Quick actions: enable/disable, edit, delete
 * - Linked drawing badge if created from an object
 * - Sort by Active first
 * - Create alert via drawing, chart, or tab button
 */
export function AlertsTab({ apiBase, symbol, timeframe, selectedDrawing }: AlertsTabProps) {
  const apiBaseClean = apiBase.replace(/\/$/, "");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formDirection, setFormDirection] = useState<AlertDirection>("cross_any");
  const [formOneShot, setFormOneShot] = useState(false);

  const bar = tfToBar(timeframe);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL(`${apiBaseClean}/alerts`);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("bar", bar);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const items = data?.items ?? data;
      setAlerts(Array.isArray(items) ? items : []);
    } catch (err) {
      console.warn("[AlertsTab] Fetch failed:", err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseClean, symbol, bar]);

  useEffect(() => {
    if (symbol) fetchAlerts();
  }, [symbol, bar, fetchAlerts]);

  // Auto-show form when a valid drawing is selected
  useEffect(() => {
    if (selectedDrawing && drawingToAlertType(selectedDrawing) !== null) {
      setShowForm(true);
    }
  }, [selectedDrawing]);

  const toggleAlert = useCallback(
    async (alertId: number, enabled: boolean) => {
      try {
        const res = await fetch(`${apiBaseClean}/alerts/${alertId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) throw new Error(await res.text());
        await fetchAlerts();
        toast.success(enabled ? "Alert enabled" : "Alert disabled");
      } catch (err) {
        toast.error(`Failed to toggle: ${err}`);
      }
    },
    [apiBaseClean, fetchAlerts]
  );

  const deleteAlert = useCallback(
    async (alertId: number) => {
      try {
        const res = await fetch(`${apiBaseClean}/alerts/${alertId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(await res.text());
        await fetchAlerts();
        toast.success("Alert deleted");
      } catch (err) {
        toast.error(`Failed to delete: ${err}`);
      }
    },
    [apiBaseClean, fetchAlerts]
  );

  const createAlertFromDrawing = useCallback(async () => {
    if (!selectedDrawing) {
      toast.error("Select a drawing first");
      return;
    }
    const geometry = drawingToGeometry(selectedDrawing);
    const type = drawingToAlertType(selectedDrawing);
    if (!geometry || !type) {
      toast.error("Only hline/trend can be alerts");
      return;
    }

    setCreating(true);
    try {
      const payload = {
        label: formLabel.trim() || selectedDrawing.label || `${type} alert`,
        symbol,
        bar,
        type,
        direction: formDirection,
        geometry,
        tol_bps: 0,
        enabled: true,
        one_shot: formOneShot,
        cooldown_min: 0,
      };
      const res = await fetch(`${apiBaseClean}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAlerts();
      toast.success("Alert created");
      setShowForm(false);
      setFormLabel("");
      setFormDirection("cross_any");
      setFormOneShot(false);
    } catch (err) {
      toast.error(`Failed to create: ${err}`);
    } finally {
      setCreating(false);
    }
  }, [apiBaseClean, symbol, bar, selectedDrawing, formLabel, formDirection, formOneShot, fetchAlerts]);

  const canCreateAlert = selectedDrawing && drawingToAlertType(selectedDrawing) !== null;
  const hasDrawable = Boolean(canCreateAlert);

  // Sort alerts: Active first
  const sortedAlerts = [...alerts].sort((a, b) => {
    if (a.enabled === b.enabled) return 0;
    return a.enabled ? -1 : 1;
  });

  return (
    <div className="flex flex-col min-h-0" style={{ color: "var(--tv-text, #d1d4dc)" }}>
      {/* Sticky Header - TV tight */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b sticky top-0"
        style={{
          backgroundColor: "var(--tv-panel, #1e222d)",
          borderColor: "var(--tv-border, #363a45)",
        }}
      >
        <span className="text-[11px] font-medium" style={{ color: "var(--tv-text-muted, #787b86)" }}>Alerts</span>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-sm transition"
          style={{
            color: hasDrawable ? "#fff" : "var(--tv-text-muted, #787b86)",
            backgroundColor: hasDrawable ? "var(--tv-blue, #2962ff)" : "transparent",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            if (hasDrawable) return;
            (e.currentTarget as HTMLElement).style.backgroundColor = "var(--tv-bg-secondary, #2a2e39)";
          }}
          onMouseLeave={(e) => {
            if (hasDrawable) return;
            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
          }}
          title={hasDrawable ? "Create alert" : "Select a drawing to create alert"}
          data-testid="alerts-create-btn"
        >
          <Plus className="h-3 w-3" />
          Create
        </button>
      </div>

      {/* Content Area - TV tight */}
      <div className="flex-1 overflow-y-auto space-y-1.5 p-2">
        {/* Create Form */}
        {showForm && (
          <div
            className="rounded-sm border p-2 space-y-1.5"
            style={{
              borderColor: "var(--tv-border, #363a45)",
              backgroundColor: "var(--tv-bg-secondary, #2a2e39)",
            }}
            data-testid="alerts-create-form"
          >
            <div className="text-[10px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
              {selectedDrawing ? `From: ${selectedDrawing.kind}` : "Select drawing to create alert"}
            </div>

            {!hasDrawable && (
              <div
                className="text-[10px] rounded-sm border px-1.5 py-1"
                style={{
                  color: "var(--tv-text-muted, #787b86)",
                  borderColor: "var(--tv-border, #363a45)",
                  backgroundColor: "var(--tv-bg, #131722)",
                }}
                data-testid="alerts-create-form-help"
              >
                Choose a line or trendline to enable alert creation
              </div>
            )}

            <div>
              <label className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                Label
              </label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder={selectedDrawing?.label || `${selectedDrawing?.kind ?? "alert"}`}
                className="w-full h-5 text-[10px] rounded-sm px-1 mt-0.5 border"
                style={{
                  borderColor: "var(--tv-border, #363a45)",
                  backgroundColor: "var(--tv-bg, #131722)",
                  color: "var(--tv-text, #d1d4dc)",
                  opacity: hasDrawable ? 1 : 0.6,
                }}
                disabled={!hasDrawable}
              />
            </div>

            <div>
              <label className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                Direction
              </label>
              <select
                value={formDirection}
                onChange={(e) => setFormDirection(e.target.value as AlertDirection)}
                className="w-full h-5 text-[10px] rounded-sm px-1 mt-0.5 border"
                style={{
                  borderColor: "var(--tv-border, #363a45)",
                  backgroundColor: "var(--tv-bg, #131722)",
                  color: "var(--tv-text, #d1d4dc)",
                  opacity: hasDrawable ? 1 : 0.6,
                }}
                disabled={!hasDrawable}
              >
                <option value="cross_any">Crosses either</option>
                <option value="cross_up">Crosses above</option>
                <option value="cross_down">Crosses below</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <input
                type="checkbox"
                id="one-shot"
                checked={formOneShot}
                onChange={(e) => setFormOneShot(e.target.checked)}
                className="w-3 h-3"
                disabled={!hasDrawable}
              />
              <label htmlFor="one-shot" className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                One-shot
              </label>
            </div>

            <div className="flex gap-1">
              <button
                onClick={createAlertFromDrawing}
                disabled={creating || !hasDrawable}
                className="flex-1 h-5 text-[10px] rounded-sm transition"
                style={{
                  backgroundColor: hasDrawable ? "var(--tv-blue, #2962ff)" : "var(--tv-bg-secondary, #2a2e39)",
                  color: hasDrawable ? "#fff" : "var(--tv-text-muted, #787b86)",
                  opacity: hasDrawable ? 1 : 0.6,
                }}
                data-testid="alerts-create-submit"
              >
                {creating ? "..." : "Create"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 h-5 text-[10px] rounded-sm transition"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--tv-text-muted, #787b86)",
                  border: "1px solid var(--tv-border, #363a45)",
                }}
                data-testid="alerts-create-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <AlertCircle className="mb-1.5 h-5 w-5 opacity-50" style={{ color: "var(--tv-text-muted, #787b86)" }} />
            <p className="text-[11px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
              No alerts for {symbol}
            </p>
          </div>
        )}

        {/* Alerts List */}
        {sortedAlerts.map((alert) => (
          <div
            key={alert.id}
            className="rounded-sm border p-1.5 space-y-0.5"
            style={{
              borderColor: "var(--tv-border, #363a45)",
              backgroundColor: alert.enabled ? "var(--tv-bg-secondary, #2a2e39)" : "transparent",
            }}
            data-testid={`alert-row-${alert.id}`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium truncate" style={{ color: "var(--tv-text, #d1d4dc)" }}>
                  {alert.symbol}
                </div>
                <div className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                  {DIRECTION_LABELS[alert.direction]}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleAlert(alert.id, !alert.enabled)}
                  className="p-0.5 rounded-sm transition"
                  title={alert.enabled ? "Disable" : "Enable"}
                  data-testid={`alert-toggle-${alert.id}`}
                  style={{
                    color: alert.enabled ? "var(--tv-green, #26a69a)" : "var(--tv-text-muted, #787b86)",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--tv-bg-secondary, #2a2e39)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }}
                >
                  {alert.enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="p-0.5 rounded-sm transition"
                  title="Delete"
                  data-testid={`alert-delete-${alert.id}`}
                  style={{
                    color: "var(--tv-red, #ef5350)",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239, 83, 80, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            {alert.last_triggered_at && (
              <div className="text-[8px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                Triggered: {new Date(alert.last_triggered_at).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * AlertsPanel - Price alerts panel for ChartsPro
 * 
 * Day 8: Integrated alerts into ChartsPro (formerly separate Alerts tab).
 * 
 * Features:
 * - List alerts for current symbol/timeframe
 * - Create alert from selected drawing (hline/trend)
 * - Enable/disable alerts
 * - Delete alerts
 * 
 * API: /alerts CRUD endpoints (backend)
 */
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Plus, RefreshCcw, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import type { Drawing, Tf } from "../types";

interface AlertItem {
  id: number;
  label: string | null;
  symbol: string;
  bar: string;
  type: "price" | "indicator" | "trendline";  // Backend AlertType enum values
  direction: "cross_up" | "cross_down" | "cross_any";
  geometry: Record<string, unknown>;
  enabled: boolean;
  one_shot: boolean;
  cooldown_min: number;
  last_triggered_at: string | null;
}

interface AlertsPanelProps {
  apiBase: string;
  symbol: string;
  timeframe: Tf;
  selectedDrawing: Drawing | null;
  onAlertCreated?: () => void;
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
  // Channel and vline not supported yet
  return null;
}

/**
 * Map drawing kind to backend AlertType enum value.
 * Backend uses: "price" | "indicator" | "trendline"
 * - hline (horizontal line) → "price" (price level alert)
 * - trend (trendline) → "trendline"
 */
function drawingToAlertType(drawing: Drawing): "price" | "trendline" | null {
  if (drawing.kind === "hline") return "price";
  if (drawing.kind === "trend") return "trendline";
  return null;
}

export function AlertsPanel({
  apiBase,
  symbol,
  timeframe,
  selectedDrawing,
  onAlertCreated,
}: AlertsPanelProps) {
  const apiBaseClean = apiBase.replace(/\/$/, "");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // New alert form state
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
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      // Backend returns { items: [...] }
      const items = data?.items ?? data;
      setAlerts(Array.isArray(items) ? items : []);
    } catch (err) {
      console.warn("[AlertsPanel] Failed to fetch alerts:", err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseClean, symbol, bar]);

  useEffect(() => {
    if (symbol) {
      fetchAlerts();
    }
  }, [symbol, bar, fetchAlerts]);

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
        toast.error(`Failed to toggle alert: ${err}`);
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
        toast.error(`Failed to delete alert: ${err}`);
      }
    },
    [apiBaseClean, fetchAlerts]
  );

  const createAlertFromDrawing = useCallback(async () => {
    if (!selectedDrawing) {
      toast.error("Select a drawing (hline or trend) first");
      return;
    }
    const geometry = drawingToGeometry(selectedDrawing);
    const type = drawingToAlertType(selectedDrawing);
    if (!geometry || !type) {
      toast.error("Only horizontal lines and trendlines can be converted to alerts");
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
      const url = `${apiBaseClean}/alerts`;
      console.log("[AlertsPanel] POST", url, payload);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("[AlertsPanel] POST failed:", res.status, errorText);
        throw new Error(errorText || `HTTP ${res.status}`);
      }
      console.log("[AlertsPanel] Alert created successfully");
      await fetchAlerts();
      toast.success("Alert created");
      setShowForm(false);
      setFormLabel("");
      setFormDirection("cross_any");
      setFormOneShot(false);
      onAlertCreated?.();
    } catch (err) {
      console.error("[AlertsPanel] Create alert error:", err);
      toast.error(`Failed to create alert: ${err}`);
    } finally {
      setCreating(false);
    }
  }, [apiBaseClean, symbol, bar, selectedDrawing, formLabel, formDirection, formOneShot, fetchAlerts, onAlertCreated]);

  const canCreateAlert = selectedDrawing && drawingToAlertType(selectedDrawing) !== null;

  return (
    <Card className="h-auto" data-testid="chartspro-alerts-panel">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">Alerts</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => fetchAlerts()}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {canCreateAlert && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowForm(!showForm)}
              title="Create alert from drawing"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create alert form */}
        {showForm && selectedDrawing && canCreateAlert && (
          <div className="space-y-2 rounded border border-slate-200 p-2 dark:border-slate-700/40">
            <div className="text-xs font-medium text-slate-500">
              Create alert from: {selectedDrawing.label || selectedDrawing.kind}
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder={selectedDrawing.label || `${selectedDrawing.kind} alert`}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Direction</Label>
              <select
                value={formDirection}
                onChange={(e) => setFormDirection(e.target.value as AlertDirection)}
                className="h-8 w-full rounded border border-slate-300 px-2 text-sm"
              >
                <option value="cross_any">Crosses either</option>
                <option value="cross_up">Crosses above</option>
                <option value="cross_down">Crosses below</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="one-shot"
                checked={formOneShot}
                onChange={(e) => setFormOneShot(e.target.checked)}
              />
              <Label htmlFor="one-shot" className="text-xs">
                One-shot (disable after trigger)
              </Label>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={createAlertFromDrawing}
                disabled={creating}
                className="flex-1"
              >
                {creating ? "Creating..." : "Create Alert"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Alerts list */}
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400">
            <AlertCircle className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">No alerts for {symbol}</p>
            <p className="text-xs mt-1">
              {canCreateAlert
                ? "Click + to create from selected drawing"
                : "Select a horizontal line or trendline to add an alert"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm dark:border-slate-700/40"
                data-testid={`alert-${alert.id}`}
              >
                <div className="flex-1 space-y-0.5 overflow-hidden">
                  <div className="font-medium truncate">
                    {alert.label || `${alert.type} #${alert.id}`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {DIRECTION_LABELS[alert.direction]}
                    {alert.one_shot && (
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        One-shot
                      </Badge>
                    )}
                  </div>
                  {alert.last_triggered_at && (
                    <div className="text-[10px] text-slate-400">
                      Triggered: {new Date(alert.last_triggered_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => toggleAlert(alert.id, !alert.enabled)}
                    title={alert.enabled ? "Disable" : "Enable"}
                  >
                    {alert.enabled ? (
                      <Bell className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <BellOff className="h-4 w-4 text-slate-400" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => deleteAlert(alert.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-rose-400 hover:text-rose-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

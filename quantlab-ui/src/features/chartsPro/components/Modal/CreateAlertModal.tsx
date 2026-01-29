/**
 * CreateAlertModal.tsx
 * 
 * TV-30.4: Quick alert creation from FloatingToolbar
 * 
 * Minimal modal for creating alerts from selected line-based drawings.
 * Supports: hline (horizontal line), trend (trendline), ray, extendedLine
 */

import { useCallback, useState } from "react";
import { ModalPortal } from "./ModalPortal";
import { X, Bell, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Drawing, Tf } from "../../types";

interface CreateAlertModalProps {
  open: boolean;
  drawing: Drawing | null;
  apiBase: string;
  symbol: string;
  timeframe: Tf;
  onClose: () => void;
  onAlertCreated: () => void;
}

type AlertDirection = "cross_up" | "cross_down" | "cross_any";

const DIRECTION_LABELS: Record<AlertDirection, string> = {
  cross_any: "Crosses either direction",
  cross_up: "Crosses above",
  cross_down: "Crosses below",
};

// Convert timeframe to backend bar format
function tfToBar(tf: Tf): string {
  const map: Record<Tf, string> = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "4h": "4h", "1d": "D", "1w": "W", "1M": "M"
  };
  return map[tf] || "D";
}

// Convert drawing to alert geometry
function drawingToGeometry(drawing: Drawing): Record<string, unknown> | null {
  if (drawing.kind === "hline") {
    return { price: (drawing as any).price };
  }
  if (drawing.kind === "trend" || drawing.kind === "ray" || drawing.kind === "extendedLine") {
    const d = drawing as any;
    return {
      start: { time: Math.floor(d.p1.timeMs / 1000), price: d.p1.price },
      end: { time: Math.floor(d.p2.timeMs / 1000), price: d.p2.price },
    };
  }
  return null;
}

// Map drawing kind to backend AlertType
function drawingToAlertType(drawing: Drawing): "price" | "trendline" | null {
  if (drawing.kind === "hline") return "price";
  if (drawing.kind === "trend" || drawing.kind === "ray" || drawing.kind === "extendedLine") return "trendline";
  return null;
}

// Check if drawing supports alerts
function supportsAlert(kind: string): boolean {
  return ["hline", "trend", "ray", "extendedLine"].includes(kind);
}

// Get human-readable drawing kind label
function getDrawingLabel(kind: string): string {
  const labels: Record<string, string> = {
    hline: "Horizontal Line",
    trend: "Trend Line",
    ray: "Ray",
    extendedLine: "Extended Line",
  };
  return labels[kind] || kind;
}

export function CreateAlertModal({
  open,
  drawing,
  apiBase,
  symbol,
  timeframe,
  onClose,
  onAlertCreated,
}: CreateAlertModalProps) {
  const [label, setLabel] = useState("");
  const [direction, setDirection] = useState<AlertDirection>("cross_any");
  const [oneShot, setOneShot] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!drawing) return;
    
    const geometry = drawingToGeometry(drawing);
    const type = drawingToAlertType(drawing);
    
    if (!geometry || !type) {
      toast.error("This drawing type doesn't support alerts");
      return;
    }

    setCreating(true);
    try {
      const apiBaseClean = apiBase.replace(/\/$/, "");
      const bar = tfToBar(timeframe);
      
      const payload = {
        label: label.trim() || drawing.label || `${getDrawingLabel(drawing.kind)} Alert`,
        symbol,
        bar,
        type,
        direction,
        geometry,
        tol_bps: 0,
        enabled: true,
        one_shot: oneShot,
        cooldown_min: 0,
        drawing_id: drawing.id, // Link alert to drawing
      };

      const res = await fetch(`${apiBaseClean}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      toast.success("Alert created!");
      onAlertCreated();
      onClose();
      
      // Reset form
      setLabel("");
      setDirection("cross_any");
      setOneShot(false);
    } catch (err) {
      console.error("[CreateAlertModal] Failed to create alert:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to create alert: ${errMsg}`);
    } finally {
      setCreating(false);
    }
  }, [drawing, apiBase, symbol, timeframe, label, direction, oneShot, onAlertCreated, onClose]);

  if (!drawing) return null;
  
  const isSupported = supportsAlert(drawing.kind);
  const priceInfo = drawing.kind === "hline" 
    ? `Price: ${(drawing as any).price?.toFixed(2)}`
    : drawing.kind === "trend" || drawing.kind === "ray" || drawing.kind === "extendedLine"
    ? `From ${(drawing as any).p1?.price?.toFixed(2)} to ${(drawing as any).p2?.price?.toFixed(2)}`
    : null;

  return (
    <ModalPortal open={open} kind="create-alert" onClose={onClose}>
      <div
        data-testid="create-alert-modal"
        className="cp-modal-panel w-[360px] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="cp-header p-4 border-b border-[var(--cp-overlay-modal-border)]">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" style={{ color: "var(--cp-overlay-selection, #f59e0b)" }} />
            <h2 className="cp-header__title text-lg">Create Alert</h2>
          </div>
          <button
            onClick={onClose}
            className="cp-icon-btn"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {!isSupported ? (
            <div className="flex items-center gap-2 p-3 rounded" style={{ background: "rgba(217, 119, 6, 0.15)", color: "#fbbf24" }}>
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Not supported</p>
                <p style={{ opacity: 0.7 }}>Alerts are only available for horizontal lines, trend lines, rays, and extended lines.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Drawing info */}
              <div className="p-3 rounded space-y-1" style={{ background: "var(--cp-overlay-chip-bg, rgba(51, 65, 85, 0.5))" }}>
                <div className="cp-text-primary text-sm font-medium">
                  {getDrawingLabel(drawing.kind)}
                </div>
                {priceInfo && (
                  <div className="cp-text-muted text-xs">{priceInfo}</div>
                )}
                {drawing.label && (
                  <div className="cp-text-muted text-xs">Label: {drawing.label}</div>
                )}
              </div>

              {/* Alert Label */}
              <div className="space-y-1.5">
                <label className="cp-label">Alert Name</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={drawing.label || `${getDrawingLabel(drawing.kind)} Alert`}
                  className="cp-input"
                  data-testid="create-alert-label"
                />
              </div>

              {/* Direction */}
              <div className="space-y-1.5">
                <label className="cp-label">Trigger When Price</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as AlertDirection)}
                  className="cp-select"
                  data-testid="create-alert-direction"
                >
                  <option value="cross_any">{DIRECTION_LABELS.cross_any}</option>
                  <option value="cross_up">{DIRECTION_LABELS.cross_up}</option>
                  <option value="cross_down">{DIRECTION_LABELS.cross_down}</option>
                </select>
              </div>

              {/* One-shot */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={oneShot}
                  onChange={(e) => setOneShot(e.target.checked)}
                  className="rounded"
                  style={{ accentColor: "var(--cp-overlay-selection, #3b82f6)" }}
                  data-testid="create-alert-oneshot"
                />
                <span className="cp-text-secondary text-sm">One-time only (disable after triggering)</span>
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--cp-overlay-modal-border)]" style={{ background: "var(--cp-overlay-chip-bg, rgba(51, 65, 85, 0.3))" }}>
          <button
            onClick={onClose}
            className="cp-btn-secondary"
            data-testid="create-alert-cancel"
          >
            Cancel
          </button>
          {isSupported && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="cp-btn-warning flex items-center gap-2"
              data-testid="create-alert-submit"
            >
              <Bell className="w-4 h-4" />
              {creating ? "Creating..." : "Create Alert"}
            </button>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

export default CreateAlertModal;

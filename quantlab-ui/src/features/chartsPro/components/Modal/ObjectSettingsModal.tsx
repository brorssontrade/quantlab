/**
 * ObjectSettingsModal.tsx
 * 
 * TV-30.3: Object Settings Modal
 * 
 * Opened via gear button in FloatingToolbar.
 * Allows precise editing of drawing properties:
 * - Exact coordinates (p1, p2, p3 time/price)
 * - Style: color, width, dash, opacity
 * - Fill: fillColor, fillOpacity (for shapes)
 * - Lock toggle + Delete
 */

import { useCallback, useState, useEffect } from "react";
import { ModalPortal } from "./ModalPortal";
import { X, Trash2, Lock, Unlock } from "lucide-react";
import type { Drawing, DrawingStyle, TrendPoint } from "../../types";

// Color palette (same as FloatingToolbar)
const COLOR_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff", "#94a3b8",
];

interface ObjectSettingsModalProps {
  open: boolean;
  drawing: Drawing | null;
  onClose: () => void;
  onSave: (updated: Drawing) => void;
  onDelete: () => void;
  onToggleLock: () => void;
}

// Get human-readable label for drawing kind
function getDrawingKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    hline: "Horizontal Line",
    vline: "Vertical Line",
    trend: "Trend Line",
    ray: "Ray",
    extendedLine: "Extended Line",
    channel: "Channel",
    flatTopChannel: "Flat Top Channel",
    flatBottomChannel: "Flat Bottom Channel",
    rectangle: "Rectangle",
    circle: "Circle",
    ellipse: "Ellipse",
    triangle: "Triangle",
    text: "Text",
    callout: "Callout",
    note: "Note",
    priceRange: "Price Range",
    dateRange: "Date Range",
    fibRetracement: "Fib Retracement",
    fibExtension: "Fib Extension",
    fibFan: "Fib Fan",
    pitchfork: "Pitchfork",
    schiffPitchfork: "Schiff Pitchfork",
    modifiedSchiffPitchfork: "Modified Schiff Pitchfork",
    longPosition: "Long Position",
    shortPosition: "Short Position",
  };
  return labels[kind] || kind;
}

// Check if drawing has fill capability
function hasFillCapability(kind: string): boolean {
  const shapesWithFill = ["rectangle", "circle", "ellipse", "triangle", "channel", "flatTopChannel", "flatBottomChannel"];
  return shapesWithFill.includes(kind);
}

// Get point fields from drawing based on kind
function getPointFields(drawing: Drawing): Array<{ key: string; label: string; value: TrendPoint | number }> {
  const fields: Array<{ key: string; label: string; value: TrendPoint | number }> = [];
  
  // Handle different drawing types
  if ("price" in drawing) {
    fields.push({ key: "price", label: "Price", value: drawing.price as number });
  }
  if ("timeMs" in drawing && !("p1" in drawing)) {
    fields.push({ key: "timeMs", label: "Time", value: drawing.timeMs as number });
  }
  if ("p1" in drawing) {
    fields.push({ key: "p1", label: "Point 1", value: (drawing as any).p1 });
  }
  if ("p2" in drawing) {
    fields.push({ key: "p2", label: "Point 2", value: (drawing as any).p2 });
  }
  if ("p3" in drawing) {
    fields.push({ key: "p3", label: "Point 3", value: (drawing as any).p3 });
  }
  if ("anchor" in drawing) {
    fields.push({ key: "anchor", label: "Anchor", value: (drawing as any).anchor });
  }
  
  return fields;
}

// Format timestamp as readable date/time
function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().replace("T", " ").substring(0, 19);
}

// Parse date/time string back to timestamp
function parseTime(str: string): number | null {
  const d = new Date(str.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.getTime();
}

export function ObjectSettingsModal({
  open,
  drawing,
  onClose,
  onSave,
  onDelete,
  onToggleLock,
}: ObjectSettingsModalProps) {
  // Local draft state for editing
  const [draft, setDraft] = useState<Drawing | null>(null);
  
  // Reset draft when drawing changes
  useEffect(() => {
    if (drawing) {
      setDraft({ ...drawing });
    } else {
      setDraft(null);
    }
  }, [drawing]);
  
  const handleStyleChange = useCallback((key: keyof DrawingStyle, value: string | number | number[] | null) => {
    if (!draft) return;
    setDraft({
      ...draft,
      style: {
        ...draft.style,
        [key]: value,
      } as DrawingStyle,
    });
  }, [draft]);
  
  const handleFillChange = useCallback((key: "fillColor" | "fillOpacity", value: string | number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      [key]: value,
    } as any);
  }, [draft]);
  
  // TV-30.7: Handle label change
  const handleLabelChange = useCallback((value: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      label: value.trim() || undefined, // Empty string = remove label
    });
  }, [draft]);
  
  const handlePointChange = useCallback((pointKey: string, field: "timeMs" | "price", value: string) => {
    if (!draft) return;
    
    if (pointKey === "price") {
      // Direct price field (hline)
      const numVal = parseFloat(value);
      if (!isNaN(numVal)) {
        setDraft({ ...draft, price: numVal } as any);
      }
    } else if (pointKey === "timeMs") {
      // Direct time field (vline)
      const timeVal = parseTime(value);
      if (timeVal !== null) {
        setDraft({ ...draft, timeMs: timeVal } as any);
      }
    } else {
      // Point field (p1, p2, p3, anchor)
      const point = (draft as any)[pointKey] as TrendPoint;
      if (!point) return;
      
      if (field === "price") {
        const numVal = parseFloat(value);
        if (!isNaN(numVal)) {
          setDraft({
            ...draft,
            [pointKey]: { ...point, price: numVal },
          } as any);
        }
      } else if (field === "timeMs") {
        const timeVal = parseTime(value);
        if (timeVal !== null) {
          setDraft({
            ...draft,
            [pointKey]: { ...point, timeMs: timeVal },
          } as any);
        }
      }
    }
  }, [draft]);
  
  const handleSave = useCallback(() => {
    if (!draft) return;
    onSave({
      ...draft,
      updatedAt: Date.now(),
    });
    onClose();
  }, [draft, onSave, onClose]);
  
  const handleCancel = useCallback(() => {
    setDraft(drawing ? { ...drawing } : null);
    onClose();
  }, [drawing, onClose]);
  
  if (!drawing || !draft) return null;
  
  const pointFields = getPointFields(draft);
  const hasFill = hasFillCapability(draft.kind);
  const currentColor = draft.style?.color || "#3b82f6";
  const currentWidth = draft.style?.width ?? 2;
  const currentOpacity = draft.style?.opacity ?? 1;
  const currentDash = draft.style?.dash;
  const currentFillColor = (draft as any).fillColor || "#3b82f6";
  const currentFillOpacity = (draft as any).fillOpacity ?? 0.10;
  const currentLabel = draft.label ?? "";
  
  // TV-30.7: Check if drawing kind supports labels (not text/callout/note which have their own text)
  const supportsLabel = !["text", "callout", "note"].includes(draft.kind);
  
  return (
    <ModalPortal open={open} kind="object-settings" onClose={handleCancel}>
      <div
        data-testid="object-settings-modal"
        className="cp-modal-panel w-[400px] max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="cp-header p-4 border-b border-[var(--cp-overlay-modal-border)]">
          <h2 className="cp-header__title text-lg">
            {getDrawingKindLabel(draft.kind)} Settings
          </h2>
          <button
            onClick={handleCancel}
            className="cp-icon-btn"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Coordinates Section */}
          {pointFields.length > 0 && (
            <div>
              <h3 className="cp-text-secondary text-sm font-medium mb-3">Coordinates</h3>
              <div className="space-y-3">
                {pointFields.map((field) => {
                  if (typeof field.value === "number") {
                    // Simple numeric field (price or timeMs)
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="cp-label">{field.label}</label>
                        <input
                          type={field.key === "price" ? "number" : "text"}
                          step="any"
                          value={field.key === "price" ? field.value : formatTime(field.value)}
                          onChange={(e) => handlePointChange(field.key, field.key as any, e.target.value)}
                          className="cp-input"
                          data-testid={`object-settings-${field.key}`}
                        />
                      </div>
                    );
                  } else {
                    // TrendPoint with time + price
                    const point = field.value as TrendPoint;
                    return (
                      <div key={field.key} className="space-y-2">
                        <label className="cp-label">{field.label}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="cp-text-muted text-xs">Time</label>
                            <input
                              type="text"
                              value={formatTime(point.timeMs)}
                              onChange={(e) => handlePointChange(field.key, "timeMs", e.target.value)}
                              className="cp-input text-xs"
                              data-testid={`object-settings-${field.key}-time`}
                            />
                          </div>
                          <div>
                            <label className="cp-text-muted text-xs">Price</label>
                            <input
                              type="number"
                              step="any"
                              value={point.price}
                              onChange={(e) => handlePointChange(field.key, "price", e.target.value)}
                              className="cp-input text-xs"
                              data-testid={`object-settings-${field.key}-price`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          )}
          
          {/* TV-30.7: Label Section */}
          {supportsLabel && (
            <div>
              <h3 className="cp-text-secondary text-sm font-medium mb-3">Label</h3>
              <div className="space-y-2">
                <label className="cp-label">Label Text (optional)</label>
                <input
                  type="text"
                  value={currentLabel}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="Enter label..."
                  className="cp-input"
                  data-testid="object-settings-label"
                  maxLength={50}
                />
                <p className="cp-text-muted text-xs">Leave empty to remove label</p>
              </div>
            </div>
          )}
          
          {/* Style Section */}
          <div>
            <h3 className="cp-text-secondary text-sm font-medium mb-3">Style</h3>
            <div className="space-y-4">
              {/* Stroke Color */}
              <div className="space-y-2">
                <label className="cp-label">Stroke Color</label>
                <div className="grid grid-cols-10 gap-1">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      className={`cp-color-swatch ${currentColor === color ? "ring-2 ring-[var(--cp-overlay-selection)]" : ""}`}
                      style={{ backgroundColor: color }}
                      onClick={() => handleStyleChange("color", color)}
                      data-testid={`object-settings-color-${color.replace("#", "")}`}
                    />
                  ))}
                </div>
              </div>
              
              {/* Stroke Width */}
              <div className="space-y-2">
                <label className="cp-label">Stroke Width: {currentWidth}px</label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={currentWidth}
                  onChange={(e) => handleStyleChange("width", parseInt(e.target.value, 10))}
                  className="cp-slider"
                  data-testid="object-settings-width"
                />
              </div>
              
              {/* Stroke Opacity */}
              <div className="space-y-2">
                <label className="cp-label">Stroke Opacity: {Math.round(currentOpacity * 100)}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(currentOpacity * 100)}
                  onChange={(e) => handleStyleChange("opacity", parseInt(e.target.value, 10) / 100)}
                  className="cp-slider"
                  data-testid="object-settings-stroke-opacity"
                />
              </div>
              
              {/* Line Style */}
              <div className="space-y-2">
                <label className="cp-label">Line Style</label>
                <div className="flex gap-2">
                  <button
                    className={`${!currentDash ? "cp-btn-primary" : "cp-btn-secondary"} px-3 py-1.5 text-xs`}
                    onClick={() => handleStyleChange("dash", null)}
                    data-testid="object-settings-dash-solid"
                  >
                    Solid
                  </button>
                  <button
                    className={`${currentDash && currentDash[0] === 6 ? "cp-btn-primary" : "cp-btn-secondary"} px-3 py-1.5 text-xs`}
                    onClick={() => handleStyleChange("dash", [6, 4])}
                    data-testid="object-settings-dash-dashed"
                  >
                    Dashed
                  </button>
                  <button
                    className={`${currentDash && currentDash[0] === 2 ? "cp-btn-primary" : "cp-btn-secondary"} px-3 py-1.5 text-xs`}
                    onClick={() => handleStyleChange("dash", [2, 2])}
                    data-testid="object-settings-dash-dotted"
                  >
                    Dotted
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Fill Section (for shapes) */}
          {hasFill && (
            <div>
              <h3 className="cp-text-secondary text-sm font-medium mb-3">Fill</h3>
              <div className="space-y-4">
                {/* Fill Color */}
                <div className="space-y-2">
                  <label className="cp-label">Fill Color</label>
                  <div className="grid grid-cols-10 gap-1">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        className={`cp-color-swatch ${currentFillColor === color ? "ring-2 ring-[var(--cp-overlay-selection)]" : ""}`}
                        style={{ backgroundColor: color }}
                        onClick={() => handleFillChange("fillColor", color)}
                        data-testid={`object-settings-fill-color-${color.replace("#", "")}`}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Fill Opacity */}
                <div className="space-y-2">
                  <label className="cp-label">Fill Opacity: {Math.round(currentFillOpacity * 100)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(currentFillOpacity * 100)}
                    onChange={(e) => handleFillChange("fillOpacity", parseInt(e.target.value, 10) / 100)}
                    className="cp-slider"
                    data-testid="object-settings-fill-opacity"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--cp-overlay-modal-border)]" style={{ background: "var(--cp-overlay-chip-bg, rgba(51, 65, 85, 0.3))" }}>
          <div className="flex gap-2">
            {/* Lock Toggle */}
            <button
              onClick={onToggleLock}
              className={`cp-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm ${draft.locked ? "is-active" : ""}`}
              style={draft.locked ? { background: "rgba(217, 119, 6, 0.2)", color: "#fbbf24" } : {}}
              data-testid="object-settings-lock"
            >
              {draft.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              {draft.locked ? "Unlock" : "Lock"}
            </button>
            
            {/* Delete */}
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm"
              style={{ background: "rgba(220, 38, 38, 0.2)", color: "#f87171" }}
              data-testid="object-settings-delete"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="cp-btn-secondary"
              data-testid="object-settings-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="cp-btn-primary"
              data-testid="object-settings-save"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default ObjectSettingsModal;

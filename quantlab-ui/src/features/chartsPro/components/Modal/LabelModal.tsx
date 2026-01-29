/**
 * LabelModal.tsx
 *
 * TV-30.7: Label Modal
 *
 * Simple modal for editing a drawing's label (short annotation text).
 * Unlike text drawings, labels are properties on any drawing kind.
 * Features:
 * - Single-line input field
 * - Enter = Save
 * - Save/Cancel buttons
 * - Empty text = remove label
 * - data-testid attributes for testing
 * - data-overlay-ui="true" for event isolation
 */
import { useState, useEffect } from "react";
import { ModalPortal } from "./ModalPortal";
import { X, Type } from "lucide-react";

export interface LabelModalProps {
  open: boolean;
  initialLabel: string;
  drawingKind: string;
  onSave: (label: string | undefined) => void;
  onClose: () => void;
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

export function LabelModal({
  open,
  initialLabel,
  drawingKind,
  onSave,
  onClose,
}: LabelModalProps) {
  const [label, setLabel] = useState(initialLabel);

  // Reset label when modal opens with new initial value
  useEffect(() => {
    setLabel(initialLabel);
  }, [initialLabel, open]);

  const handleSave = () => {
    // Empty string = remove label (undefined)
    const trimmed = label.trim();
    onSave(trimmed || undefined);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <ModalPortal open={open} kind="label" onClose={onClose}>
      <div
        data-testid="label-modal"
        className="cp-modal-panel w-[360px] overflow-hidden"
      >
        {/* Header */}
        <div className="cp-header p-4 border-b border-[var(--cp-overlay-modal-border)]">
          <div className="flex items-center gap-2">
            <Type className="w-5 h-5 cp-text-secondary" />
            <h2 className="cp-header__title text-lg">
              {getDrawingKindLabel(drawingKind)} Label
            </h2>
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
          <div className="space-y-2">
            <label htmlFor="label-input" className="cp-label">
              Label Text
            </label>
            <p className="cp-text-muted text-xs">
              Leave empty to remove label
            </p>
            <input
              id="label-input"
              type="text"
              data-testid="label-modal-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter label..."
              className="cp-input"
              autoFocus
              maxLength={50}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--cp-overlay-modal-border)]" style={{ background: "var(--cp-overlay-chip-bg, rgba(51, 65, 85, 0.3))" }}>
          <button
            onClick={onClose}
            className="cp-btn-secondary"
            data-testid="label-modal-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="cp-btn-primary"
            data-testid="label-modal-save"
          >
            Save
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export default LabelModal;

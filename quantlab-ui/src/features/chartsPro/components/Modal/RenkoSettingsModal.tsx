/**
 * RenkoSettingsModal.tsx
 * 
 * TV-22.0b: Renko settings modal (central)
 * 
 * TradingView-style modal for configuring Renko chart settings:
 * - Mode: auto (ATR-based) or fixed box size
 * - Fixed box size (when mode=fixed)
 * - ATR period (when mode=auto)
 * - Auto minimum box size (when mode=auto)
 * - Rounding: none or nice
 * 
 * Features:
 * - Cancel reverts to previous settings (no partial state)
 * - Save persists to localStorage via handler
 * - Esc + click-outside close via ModalPortal
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RenkoSettings } from "../../ChartsProTab";

interface RenkoSettingsModalProps {
  settings: RenkoSettings;
  onSave: (settings: RenkoSettings) => void;
  onCancel: () => void;
}

export function RenkoSettingsModal({ settings, onSave, onCancel }: RenkoSettingsModalProps) {
  // Local draft state - initialized from props, only committed on Save
  const [draft, setDraft] = useState<RenkoSettings>({ ...settings });
  const initialRef = useRef<HTMLButtonElement>(null);

  // Reset draft when settings prop changes (e.g., modal reopened)
  useEffect(() => {
    setDraft({ ...settings });
  }, [settings]);

  // Auto-focus mode toggle on mount
  useEffect(() => {
    const timer = setTimeout(() => initialRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleModeChange = (mode: "auto" | "fixed") => {
    setDraft((prev) => ({ ...prev, mode }));
  };

  const handleFixedBoxSizeChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      setDraft((prev) => ({ ...prev, fixedBoxSize: num }));
    }
  };

  const handleAtrPeriodChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setDraft((prev) => ({ ...prev, atrPeriod: num }));
    }
  };

  const handleAutoMinBoxSizeChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setDraft((prev) => ({ ...prev, autoMinBoxSize: num }));
    }
  };

  const handleRoundingChange = (rounding: "none" | "nice") => {
    setDraft((prev) => ({ ...prev, rounding }));
  };

  const handleSave = () => {
    onSave(draft);
  };

  const handleCancel = () => {
    // Revert to original settings (no commit)
    setDraft({ ...settings });
    onCancel();
  };

  return (
    <div
      className="w-[360px] max-w-[90vw] rounded-lg border shadow-2xl"
      style={{
        backgroundColor: "var(--cp-panel-bg)",
        borderColor: "var(--cp-panel-border)",
        color: "var(--cp-panel-text)",
      }}
      data-testid="renko-settings-modal"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          backgroundColor: "var(--cp-panel-header-bg)",
          borderColor: "var(--cp-panel-border)",
        }}
      >
        <span id="modal-title" className="text-sm font-medium">
          Renko Settings
        </span>
        <button
          type="button"
          onClick={handleCancel}
          className="h-6 w-6 flex items-center justify-center text-sm hover:bg-slate-700 rounded"
          aria-label="Close"
          data-testid="renko-settings-close"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Mode Selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Box Size Mode
          </label>
          <div className="flex gap-2">
            <Button
              ref={draft.mode === "auto" ? initialRef : undefined}
              type="button"
              variant={draft.mode === "auto" ? "default" : "outline"}
              size="sm"
              onClick={() => handleModeChange("auto")}
              className="flex-1 h-8 text-xs"
              data-testid="renko-settings-mode-auto"
            >
              Auto (ATR)
            </Button>
            <Button
              ref={draft.mode === "fixed" ? initialRef : undefined}
              type="button"
              variant={draft.mode === "fixed" ? "default" : "outline"}
              size="sm"
              onClick={() => handleModeChange("fixed")}
              className="flex-1 h-8 text-xs"
              data-testid="renko-settings-mode-fixed"
            >
              Fixed
            </Button>
          </div>
        </div>

        {/* Conditional fields based on mode */}
        {draft.mode === "fixed" ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Box Size
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={draft.fixedBoxSize}
              onChange={(e) => handleFixedBoxSizeChange(e.target.value)}
              className="h-9 text-sm"
              data-testid="renko-settings-fixed-box-size"
            />
            <p className="text-xs text-slate-500">Fixed price movement per brick</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                ATR Period
              </label>
              <Input
                type="number"
                step="1"
                min="1"
                max="100"
                value={draft.atrPeriod}
                onChange={(e) => handleAtrPeriodChange(e.target.value)}
                className="h-9 text-sm"
                data-testid="renko-settings-atr-period"
              />
              <p className="text-xs text-slate-500">Number of bars for ATR calculation</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Minimum Box Size
              </label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={draft.autoMinBoxSize}
                onChange={(e) => handleAutoMinBoxSizeChange(e.target.value)}
                className="h-9 text-sm"
                data-testid="renko-settings-auto-min-box-size"
              />
              <p className="text-xs text-slate-500">Minimum box size when using ATR mode</p>
            </div>
          </>
        )}

        {/* Rounding */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Rounding
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={draft.rounding === "none" ? "default" : "outline"}
              size="sm"
              onClick={() => handleRoundingChange("none")}
              className="flex-1 h-8 text-xs"
              data-testid="renko-settings-rounding-none"
            >
              None
            </Button>
            <Button
              type="button"
              variant={draft.rounding === "nice" ? "default" : "outline"}
              size="sm"
              onClick={() => handleRoundingChange("nice")}
              className="flex-1 h-8 text-xs"
              data-testid="renko-settings-rounding-nice"
            >
              Nice (1/2/5/10)
            </Button>
          </div>
          <p className="text-xs text-slate-500">Round box size to nice numbers</p>
        </div>
      </div>

      {/* Footer with Save/Cancel */}
      <div
        className="flex justify-end gap-2 px-4 py-3 border-t"
        style={{
          borderColor: "var(--cp-panel-border)",
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCancel}
          className="h-8 px-4 text-xs"
          data-testid="renko-settings-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={handleSave}
          className="h-8 px-4 text-xs"
          data-testid="renko-settings-save"
        >
          Save
        </Button>
      </div>
    </div>
  );
}

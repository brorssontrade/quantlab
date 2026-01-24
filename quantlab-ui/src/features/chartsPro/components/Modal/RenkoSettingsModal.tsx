/**
 * RenkoSettingsModal.tsx
 * 
 * TV-22.0b: Renko settings modal (central)
 * TV-22.0d2: UX hardening with string-draft inputs + inline validation
 * 
 * TradingView-style modal for configuring Renko chart settings:
 * - Mode: auto (ATR-based) or fixed box size
 * - Fixed box size (when mode=fixed)
 * - ATR period (when mode=auto)
 * - Auto minimum box size (when mode=auto)
 * - Rounding: none or nice
 * 
 * Features:
 * - String-draft inputs: allows empty/partial input during typing
 * - Inline validation errors with aria-invalid
 * - Save disabled when any field is invalid
 * - Reset to defaults button
 * - Cancel reverts to previous settings (no partial state)
 * - Save persists to localStorage via handler
 * - Esc + click-outside close via ModalPortal
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RenkoSettings } from "../../ChartsProTab";
import {
  DEFAULT_RENKO_SETTINGS,
  normalizeRenkoSettings,
} from "../../runtime/renko";

interface RenkoSettingsModalProps {
  settings: RenkoSettings;
  onSave: (settings: RenkoSettings) => void;
  onCancel: () => void;
}

/**
 * String-based draft state for inputs (allows partial/empty values during typing)
 */
interface DraftStrings {
  fixedBoxSize: string;
  atrPeriod: string;
  autoMinBoxSize: string;
}

/**
 * Convert numeric RenkoSettings to string draft
 */
function settingsToStrings(settings: RenkoSettings): DraftStrings {
  return {
    fixedBoxSize: String(settings.fixedBoxSize),
    atrPeriod: String(settings.atrPeriod),
    autoMinBoxSize: String(settings.autoMinBoxSize),
  };
}

export function RenkoSettingsModal({ settings, onSave, onCancel }: RenkoSettingsModalProps) {
  // Mode and rounding as enums (not string inputs)
  const [mode, setMode] = useState<"auto" | "fixed">(settings.mode);
  const [rounding, setRounding] = useState<"none" | "nice">(settings.rounding);
  
  // String draft for numeric inputs (allows empty/partial during typing)
  const [strings, setStrings] = useState<DraftStrings>(() => settingsToStrings(settings));
  
  const initialRef = useRef<HTMLButtonElement>(null);

  // Reset draft when settings prop changes (e.g., modal reopened)
  useEffect(() => {
    setMode(settings.mode);
    setRounding(settings.rounding);
    setStrings(settingsToStrings(settings));
  }, [settings]);

  // Auto-focus mode toggle on mount
  useEffect(() => {
    const timer = setTimeout(() => initialRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Compute validation state from current draft
  const validation = useMemo(() => {
    const result = normalizeRenkoSettings({
      mode,
      fixedBoxSize: strings.fixedBoxSize,
      atrPeriod: strings.atrPeriod,
      autoMinBoxSize: strings.autoMinBoxSize,
      rounding,
    });

    // Only validate fields relevant to current mode
    const relevantErrors: typeof result.errors = {};
    if (result.errors.mode) relevantErrors.mode = result.errors.mode;
    if (result.errors.rounding) relevantErrors.rounding = result.errors.rounding;
    
    if (mode === "fixed") {
      if (result.errors.fixedBoxSize) relevantErrors.fixedBoxSize = result.errors.fixedBoxSize;
    } else {
      if (result.errors.atrPeriod) relevantErrors.atrPeriod = result.errors.atrPeriod;
      if (result.errors.autoMinBoxSize) relevantErrors.autoMinBoxSize = result.errors.autoMinBoxSize;
    }

    const isValid = Object.keys(relevantErrors).length === 0;

    return {
      errors: relevantErrors,
      isValid,
      normalizedValue: result.value,
    };
  }, [mode, rounding, strings]);

  const handleModeChange = (newMode: "auto" | "fixed") => {
    setMode(newMode);
  };

  const handleStringChange = (field: keyof DraftStrings, value: string) => {
    setStrings((prev) => ({ ...prev, [field]: value }));
  };

  const handleRoundingChange = (newRounding: "none" | "nice") => {
    setRounding(newRounding);
  };

  const handleSave = () => {
    if (!validation.isValid) return;
    onSave(validation.normalizedValue);
  };

  const handleCancel = () => {
    // Revert to original settings (no commit)
    setMode(settings.mode);
    setRounding(settings.rounding);
    setStrings(settingsToStrings(settings));
    onCancel();
  };

  const handleReset = () => {
    // Reset to defaults
    setMode(DEFAULT_RENKO_SETTINGS.mode);
    setRounding(DEFAULT_RENKO_SETTINGS.rounding);
    setStrings(settingsToStrings(DEFAULT_RENKO_SETTINGS));
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
              ref={mode === "auto" ? initialRef : undefined}
              type="button"
              variant={mode === "auto" ? "default" : "outline"}
              size="sm"
              onClick={() => handleModeChange("auto")}
              className="flex-1 h-8 text-xs"
              data-testid="renko-settings-mode-auto"
            >
              Auto (ATR)
            </Button>
            <Button
              ref={mode === "fixed" ? initialRef : undefined}
              type="button"
              variant={mode === "fixed" ? "default" : "outline"}
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
        {mode === "fixed" ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Box Size
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={strings.fixedBoxSize}
              onChange={(e) => handleStringChange("fixedBoxSize", e.target.value)}
              className="h-9 text-sm"
              aria-invalid={!!validation.errors.fixedBoxSize}
              data-testid="renko-settings-fixed-box-size"
            />
            {validation.errors.fixedBoxSize ? (
              <p className="text-xs text-red-400" data-testid="renko-settings-error-fixed-box-size">
                {validation.errors.fixedBoxSize}
              </p>
            ) : (
              <p className="text-xs text-slate-500">Fixed price movement per brick</p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                ATR Period
              </label>
              <Input
                type="text"
                inputMode="numeric"
                value={strings.atrPeriod}
                onChange={(e) => handleStringChange("atrPeriod", e.target.value)}
                className="h-9 text-sm"
                aria-invalid={!!validation.errors.atrPeriod}
                data-testid="renko-settings-atr-period"
              />
              {validation.errors.atrPeriod ? (
                <p className="text-xs text-red-400" data-testid="renko-settings-error-atr-period">
                  {validation.errors.atrPeriod}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Number of bars for ATR calculation (1-200)</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Minimum Box Size
              </label>
              <Input
                type="text"
                inputMode="decimal"
                value={strings.autoMinBoxSize}
                onChange={(e) => handleStringChange("autoMinBoxSize", e.target.value)}
                className="h-9 text-sm"
                aria-invalid={!!validation.errors.autoMinBoxSize}
                data-testid="renko-settings-auto-min-box-size"
              />
              {validation.errors.autoMinBoxSize ? (
                <p className="text-xs text-red-400" data-testid="renko-settings-error-auto-min-box-size">
                  {validation.errors.autoMinBoxSize}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Minimum box size when using ATR mode (≥0)</p>
              )}
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
              variant={rounding === "none" ? "default" : "outline"}
              size="sm"
              onClick={() => handleRoundingChange("none")}
              className="flex-1 h-8 text-xs"
              data-testid="renko-settings-rounding-none"
            >
              None
            </Button>
            <Button
              type="button"
              variant={rounding === "nice" ? "default" : "outline"}
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

      {/* Footer with Reset/Cancel/Save */}
      <div
        className="flex justify-between items-center px-4 py-3 border-t"
        style={{
          borderColor: "var(--cp-panel-border)",
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-8 px-3 text-xs gap-1"
          data-testid="renko-settings-reset"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
        <div className="flex gap-2">
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
            disabled={!validation.isValid}
            className="h-8 px-4 text-xs"
            data-testid="renko-settings-save"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

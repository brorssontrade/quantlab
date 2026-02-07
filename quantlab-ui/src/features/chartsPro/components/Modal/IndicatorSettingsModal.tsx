/**
 * Indicator Settings Modal
 * 
 * TradingView-style settings modal for configuring indicator parameters.
 * Features:
 * - Three tabs: Inputs (params), Style (colors/widths), Visibility (per-line toggle)
 * - Per-line style editing for multi-output indicators (MACD, ADX, BB, etc.)
 * - Apply/Cancel buttons with keyboard support (Enter=Apply, ESC=Cancel)
 * - Reset to defaults
 * - NO hardcoded color fallbacks - uses CSS variables only
 * 
 * Separation of concerns:
 * - Inputs change → triggers indicator recompute
 * - Style change → series.applyOptions() only (NO recompute)
 * - Visibility change → series.setVisible() only (NO recompute)
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { X, RotateCcw, Settings2, Palette, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { IndicatorInstance, LineStyleConfig } from "../../types";
import { getIndicatorManifest, type InputDef, type OutputDef, TV_COLORS } from "../../indicators/indicatorManifest";
import { getDefaultParams, getDefaultColor } from "../../indicators/registryV2";
import { indicatorDisplayName } from "../../types";

// ============================================================================
// Types
// ============================================================================

interface IndicatorSettingsModalProps {
  indicator: IndicatorInstance;
  onApply: (patch: Partial<IndicatorInstance>) => void;
  onClose: () => void;
}

type SettingsTab = "inputs" | "style" | "visibility";

// ============================================================================
// Color Palette (TV-style defaults)
// ============================================================================

const COLOR_SWATCHES = [
  TV_COLORS.blue,
  TV_COLORS.orange,
  TV_COLORS.purple,
  TV_COLORS.teal,
  TV_COLORS.red,
  TV_COLORS.green,
  TV_COLORS.yellow,
  TV_COLORS.pink,
  TV_COLORS.gray,
  "#ffffff",
];

// ============================================================================
// Tab Button Component
// ============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors rounded-t ${
        active ? "border-b-2" : ""
      }`}
      style={{
        color: active ? "var(--tv-blue)" : "var(--tv-text-muted)",
        borderColor: active ? "var(--tv-blue)" : "transparent",
        backgroundColor: active ? "var(--tv-bg-secondary)" : "transparent",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================================
// Parameter Input Component
// ============================================================================

interface ParamInputProps {
  inputDef: InputDef;
  value: number | string | boolean;
  onChange: (value: number | string | boolean) => void;
}

function ParamInput({ inputDef, value, onChange }: ParamInputProps) {
  // Boolean input: render as toggle/checkbox (TV-style)
  if (inputDef.type === "boolean") {
    const boolValue = typeof value === "boolean" ? value : value === true || value === "true" || value === 1;
    return (
      <div className="flex items-center justify-between gap-2 col-span-2">
        <label
          className="text-xs font-medium"
          style={{ color: "var(--tv-text-muted)" }}
        >
          {inputDef.label}
        </label>
        <button
          type="button"
          onClick={() => onChange(!boolValue)}
          className="relative w-10 h-5 rounded-full transition-colors"
          style={{
            backgroundColor: boolValue ? "var(--tv-blue)" : "var(--tv-bg-secondary)",
            border: "1px solid var(--tv-border)",
          }}
          aria-pressed={boolValue}
          role="switch"
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
            style={{
              left: boolValue ? "calc(100% - 18px)" : "2px",
            }}
          />
        </button>
      </div>
    );
  }

  if (inputDef.type === "select" && inputDef.options) {
    return (
      <div className="flex flex-col gap-1.5">
        <label
          className="text-xs font-medium"
          style={{ color: "var(--tv-text-muted)" }}
        >
          {inputDef.label}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 px-2 text-sm rounded border outline-none focus:ring-1"
          style={{
            backgroundColor: "var(--tv-bg-secondary)",
            borderColor: "var(--tv-border)",
            color: "var(--tv-text)",
          }}
        >
          {inputDef.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Number input with clamping
  const numValue = typeof value === "number" ? value : Number(value) || 0;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newVal = Number(e.target.value);
    // Clamp on blur, allow typing any value
    onChange(newVal);
  };
  const handleBlur = () => {
    let clamped = numValue;
    if (inputDef.min !== undefined && clamped < inputDef.min) clamped = inputDef.min;
    if (inputDef.max !== undefined && clamped > inputDef.max) clamped = inputDef.max;
    if (clamped !== numValue) onChange(clamped);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-xs font-medium"
        style={{ color: "var(--tv-text-muted)" }}
      >
        {inputDef.label}
      </label>
      <Input
        type="number"
        value={numValue}
        onChange={handleChange}
        onBlur={handleBlur}
        min={inputDef.min}
        max={inputDef.max}
        step={inputDef.step ?? 1}
        className="h-8 text-sm"
        style={{
          backgroundColor: "var(--tv-bg-secondary)",
          borderColor: "var(--tv-border)",
          color: "var(--tv-text)",
        }}
      />
      {(inputDef.min !== undefined || inputDef.max !== undefined) && (
        <span
          className="text-[10px]"
          style={{ color: "var(--tv-text-muted)" }}
        >
          {inputDef.min !== undefined && `Min: ${inputDef.min}`}
          {inputDef.min !== undefined && inputDef.max !== undefined && " • "}
          {inputDef.max !== undefined && `Max: ${inputDef.max}`}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Color Picker Component (inline swatches + custom)
// ============================================================================

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-xs font-medium"
        style={{ color: "var(--tv-text-muted)" }}
      >
        {label}
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className="w-6 h-6 rounded border-2 transition focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{
              backgroundColor: c,
              borderColor: value.toLowerCase() === c.toLowerCase() ? "var(--tv-blue)" : "transparent",
              // Focus ring uses theme color
            }}
            title={c}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border focus:outline-none focus:ring-2"
          style={{ borderColor: "var(--tv-border)" }}
          title="Custom color"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Line Width Selector Component
// ============================================================================

interface LineWidthSelectorProps {
  label: string;
  value: number;
  onChange: (width: number) => void;
}

function LineWidthSelector({ label, value, onChange }: LineWidthSelectorProps) {
  const widths = [1, 2, 3, 4];
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-xs font-medium"
        style={{ color: "var(--tv-text-muted)" }}
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        {widths.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            className="w-8 h-8 rounded border flex items-center justify-center transition focus:outline-none focus:ring-2"
            style={{
              borderColor: value === w ? "var(--tv-blue)" : "var(--tv-border)",
              backgroundColor: value === w ? "var(--tv-bg-secondary)" : "transparent",
            }}
            title={`${w}px`}
          >
            <div
              style={{
                width: "16px",
                height: `${w}px`,
                backgroundColor: "var(--tv-text)",
                borderRadius: "1px",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Line Style Selector Component (TV-parity: solid/dashed/dotted)
// ============================================================================

interface LineStyleSelectorProps {
  label: string;
  value: "solid" | "dashed" | "dotted";
  onChange: (style: "solid" | "dashed" | "dotted") => void;
}

function LineStyleSelector({ label, value, onChange }: LineStyleSelectorProps) {
  const styles: Array<{ key: "solid" | "dashed" | "dotted"; label: string; pattern: string }> = [
    { key: "solid", label: "Solid", pattern: "0" },
    { key: "dashed", label: "Dashed", pattern: "8,4" },
    { key: "dotted", label: "Dotted", pattern: "2,2" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-xs font-medium"
        style={{ color: "var(--tv-text-muted)" }}
      >
        {label}
      </label>
      <div className="flex items-center gap-1">
        {styles.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className="flex-1 h-8 rounded border flex items-center justify-center transition focus:outline-none focus:ring-2"
            style={{
              borderColor: value === s.key ? "var(--tv-blue)" : "var(--tv-border)",
              backgroundColor: value === s.key ? "var(--tv-bg-secondary)" : "transparent",
            }}
            title={s.label}
          >
            <svg width="32" height="2" className="overflow-visible">
              <line
                x1="0"
                y1="1"
                x2="32"
                y2="1"
                stroke="var(--tv-text)"
                strokeWidth="2"
                strokeDasharray={s.pattern}
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Visibility Toggle Component
// ============================================================================

interface VisibilityToggleProps {
  label: string;
  color: string;
  visible: boolean;
  onToggle: () => void;
}

function VisibilityToggle({ label, color, visible, onToggle }: VisibilityToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-3 px-3 py-2 rounded border transition w-full text-left"
      style={{
        borderColor: "var(--tv-border)",
        backgroundColor: visible ? "transparent" : "var(--tv-bg-secondary)",
        opacity: visible ? 1 : 0.6,
      }}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 text-sm" style={{ color: "var(--tv-text)" }}>
        {label}
      </span>
      <Eye
        className="w-4 h-4"
        style={{
          color: visible ? "var(--tv-blue)" : "var(--tv-text-muted)",
        }}
      />
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function IndicatorSettingsModal({
  indicator,
  onApply,
  onClose,
}: IndicatorSettingsModalProps) {
  const manifest = getIndicatorManifest(indicator.kind);
  
  // State for each concern
  const [activeTab, setActiveTab] = useState<SettingsTab>("inputs");
  const [params, setParams] = useState<Record<string, number | string | boolean>>({ ...indicator.params });
  const [styleByLineId, setStyleByLineId] = useState<Record<string, LineStyleConfig>>(() => {
    // Initialize from indicator or defaults
    const initial: Record<string, LineStyleConfig> = {};
    if (manifest) {
      manifest.outputs.forEach((output) => {
        const existing = indicator.styleByLineId?.[output.key];
        initial[output.key] = {
          color: existing?.color ?? output.defaultColor,
          lineWidth: existing?.lineWidth ?? output.defaultLineWidth ?? 2,
          lineStyle: existing?.lineStyle ?? "solid",
          visible: existing?.visible ?? true,
        };
      });
    }
    return initial;
  });

  // Compute whether inputs have changed (for showing which tab has changes)
  const inputsChanged = useMemo(() => {
    return JSON.stringify(params) !== JSON.stringify(indicator.params);
  }, [params, indicator.params]);

  // Compute whether styles have changed
  const stylesChanged = useMemo(() => {
    if (!manifest) return false;
    for (const output of manifest.outputs) {
      const current = styleByLineId[output.key];
      const original = indicator.styleByLineId?.[output.key];
      const defaultColor = output.defaultColor;
      const defaultWidth = output.defaultLineWidth ?? 2;
      
      // Compare to original or defaults
      const origColor = original?.color ?? defaultColor;
      const origWidth = original?.lineWidth ?? defaultWidth;
      const origLineStyle = original?.lineStyle ?? "solid";
      const origVisible = original?.visible ?? true;
      
      if (current?.color !== origColor || current?.lineWidth !== origWidth || 
          current?.lineStyle !== origLineStyle || current?.visible !== origVisible) {
        return true;
      }
    }
    return false;
  }, [styleByLineId, indicator.styleByLineId, manifest]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        // Prevent Enter from submitting if in a textarea or contenteditable
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA" || target.isContentEditable) return;
        handleApply();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, params, styleByLineId]);

  const handleParamChange = useCallback((key: string, value: number | string | boolean) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleStyleChange = useCallback((lineId: string, patch: Partial<LineStyleConfig>) => {
    setStyleByLineId((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], ...patch },
    }));
  }, []);

  const handleReset = useCallback(() => {
    const defaultParams = getDefaultParams(indicator.kind);
    setParams(defaultParams);
    
    // Reset styles to manifest defaults
    if (manifest) {
      const resetStyles: Record<string, LineStyleConfig> = {};
      manifest.outputs.forEach((output) => {
        resetStyles[output.key] = {
          color: output.defaultColor,
          lineWidth: output.defaultLineWidth ?? 2,
          lineStyle: "solid",
          visible: true,
        };
      });
      setStyleByLineId(resetStyles);
    }
  }, [indicator.kind, manifest]);

  const handleApply = useCallback(() => {
    onApply({
      params,
      styleByLineId,
      // Also update legacy color field to first output's color for backwards compat
      color: manifest?.outputs[0] ? (styleByLineId[manifest.outputs[0].key]?.color ?? indicator.color) : indicator.color,
    });
    onClose();
  }, [params, styleByLineId, manifest, indicator.color, onApply, onClose]);

  if (!manifest) {
    return (
      <div
        className="w-[360px] rounded-lg border shadow-2xl"
        style={{
          backgroundColor: "var(--tv-bg)",
          borderColor: "var(--tv-border)",
        }}
      >
        <div className="p-4 text-center" style={{ color: "var(--tv-text-muted)" }}>
          <p>Indicator not found</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 px-4 py-1.5 rounded text-sm transition"
            style={{ color: "var(--tv-text)" }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-[440px] max-w-[95vw] rounded-lg border shadow-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--tv-bg)",
        borderColor: "var(--tv-border)",
        color: "var(--tv-text)",
      }}
      data-testid="indicator-settings-modal"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--tv-border)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: styleByLineId[manifest.outputs[0]?.key]?.color ?? indicator.color }}
          />
          <h3 className="font-medium">{indicatorDisplayName(indicator.kind)}</h3>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--tv-bg-secondary)",
              color: "var(--tv-text-muted)",
            }}
          >
            {manifest.shortName}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded transition"
          style={{ color: "var(--tv-text-muted)" }}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tab Navigation */}
      <div
        className="flex border-b px-2"
        style={{ borderColor: "var(--tv-border)" }}
      >
        <TabButton
          active={activeTab === "inputs"}
          onClick={() => setActiveTab("inputs")}
          icon={<Settings2 className="w-4 h-4" />}
          label={`Inputs${inputsChanged ? " •" : ""}`}
        />
        <TabButton
          active={activeTab === "style"}
          onClick={() => setActiveTab("style")}
          icon={<Palette className="w-4 h-4" />}
          label={`Style${stylesChanged ? " •" : ""}`}
        />
        <TabButton
          active={activeTab === "visibility"}
          onClick={() => setActiveTab("visibility")}
          icon={<Eye className="w-4 h-4" />}
          label="Visibility"
        />
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[60vh] overflow-y-auto">
        {/* Inputs Tab */}
        {activeTab === "inputs" && (
          <div className="space-y-4">
            {manifest.inputs.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {manifest.inputs.map((inputDef) => (
                  <ParamInput
                    key={inputDef.key}
                    inputDef={inputDef}
                    value={params[inputDef.key] ?? inputDef.default}
                    onChange={(val) => handleParamChange(inputDef.key, val)}
                  />
                ))}
              </div>
            ) : (
              <p
                className="text-sm text-center py-4"
                style={{ color: "var(--tv-text-muted)" }}
              >
                No configurable inputs for this indicator
              </p>
            )}
          </div>
        )}

        {/* Style Tab */}
        {activeTab === "style" && (
          <div className="space-y-6">
            {manifest.outputs.map((output) => (
              <div
                key={output.key}
                className="space-y-3 pb-4 border-b last:border-0"
                style={{ borderColor: "var(--tv-border)" }}
              >
                <h4
                  className="text-sm font-medium flex items-center gap-2"
                  style={{ color: "var(--tv-text)" }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: styleByLineId[output.key]?.color ?? output.defaultColor }}
                  />
                  {output.label}
                </h4>
                <ColorPicker
                  label="Color"
                  value={styleByLineId[output.key]?.color ?? output.defaultColor}
                  onChange={(color) => handleStyleChange(output.key, { color })}
                />
                {output.style === "line" && (
                  <>
                    <LineWidthSelector
                      label="Line Width"
                      value={styleByLineId[output.key]?.lineWidth ?? output.defaultLineWidth ?? 2}
                      onChange={(lineWidth) => handleStyleChange(output.key, { lineWidth })}
                    />
                    <LineStyleSelector
                      label="Line Style"
                      value={styleByLineId[output.key]?.lineStyle ?? "solid"}
                      onChange={(lineStyle) => handleStyleChange(output.key, { lineStyle })}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Visibility Tab */}
        {activeTab === "visibility" && (
          <div className="space-y-2">
            {manifest.outputs.map((output) => (
              <VisibilityToggle
                key={output.key}
                label={output.label}
                color={styleByLineId[output.key]?.color ?? output.defaultColor}
                visible={styleByLineId[output.key]?.visible ?? true}
                onToggle={() =>
                  handleStyleChange(output.key, {
                    visible: !(styleByLineId[output.key]?.visible ?? true),
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-3 border-t"
        style={{ borderColor: "var(--tv-border)" }}
      >
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition"
          style={{ color: "var(--tv-text-muted)" }}
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded text-sm transition"
            style={{ color: "var(--tv-text)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 rounded text-sm font-medium transition hover:opacity-90"
            style={{
              backgroundColor: "var(--tv-blue)",
              color: "#fff",
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

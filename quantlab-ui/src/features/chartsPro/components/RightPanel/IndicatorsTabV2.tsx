/**
 * PRIO 3: Indicators Tab (RightPanel)
 * 
 * Features:
 * - List of active indicators with TV-style compact design
 * - Compute status display (points count, last value, error badge)
 * - Hide/Show toggle (eye icon)
 * - Edit inline (settings icon expands params)
 * - Remove (trash icon)
 * - Color indicator dot
 * - Premium spacing and hover states
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Trash2, Settings, GripVertical, AlertCircle } from "lucide-react";
import type { IndicatorKind, IndicatorPane, IndicatorInstance, IndicatorWorkerResponse } from "../../indicators/registryV2";
import { getIndicatorManifest, type InputDef } from "../../indicators/indicatorManifest";

// ============================================================================
// Types
// ============================================================================

interface IndicatorsTabV2Props {
  indicators: IndicatorInstance[];
  indicatorResults?: Record<string, IndicatorWorkerResponse>;
  onAdd: (
    kind: IndicatorKind,
    params?: Partial<Record<string, number | string>>,
    options?: { color?: string; pane?: IndicatorPane },
  ) => IndicatorInstance;
  onUpdate: (id: string, patch: Partial<IndicatorInstance>) => void;
  onRemove: (id: string) => void;
  onOpenModal?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDisplayName(kind: IndicatorKind): string {
  const manifest = getIndicatorManifest(kind);
  return manifest?.shortName ?? kind.toUpperCase();
}

function getParamsSummary(indicator: IndicatorInstance): string {
  const params = indicator.params;
  if (!params || Object.keys(params).length === 0) return "";
  
  // Show only numeric params for brevity
  const numericParams = Object.entries(params)
    .filter(([_, v]) => typeof v === "number")
    .map(([_, v]) => v);
  
  if (numericParams.length === 0) return "";
  return `(${numericParams.join(",")})`;
}

function getInputDefs(kind: IndicatorKind): InputDef[] {
  const manifest = getIndicatorManifest(kind);
  return manifest?.inputs ?? [];
}

function formatValue(value: number | null | undefined): string {
  if (value == null) return "–";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

interface ComputeStatus {
  state: "pending" | "ready" | "error";
  points: number;
  lastValue: number | null;
  error: string | null;
}

function getComputeStatus(
  indicator: IndicatorInstance,
  results: Record<string, IndicatorWorkerResponse> | undefined
): ComputeStatus {
  if (!results) {
    return { state: "pending", points: 0, lastValue: null, error: null };
  }
  
  const result = results[indicator.id];
  if (!result) {
    return { state: "pending", points: 0, lastValue: null, error: null };
  }
  
  if (result.error) {
    return { state: "error", points: 0, lastValue: null, error: result.error };
  }
  
  const primaryLine = result.lines?.[0];
  const values = primaryLine?.values ?? [];
  const lastPoint = values.length > 0 ? values[values.length - 1] : null;
  
  return {
    state: values.length > 0 ? "ready" : "pending",
    points: values.length,
    lastValue: lastPoint?.value ?? null,
    error: null,
  };
}

// ============================================================================
// Component
// ============================================================================

type EditTab = "inputs" | "style";

export function IndicatorsTabV2({ 
  indicators, 
  indicatorResults,
  onAdd, 
  onUpdate, 
  onRemove, 
  onOpenModal 
}: IndicatorsTabV2Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<EditTab>("inputs");

  const handleToggleEdit = useCallback((id: string) => {
    setEditingId(prev => {
      if (prev === id) return null;
      setEditTab("inputs"); // Reset to inputs tab when opening new edit
      return id;
    });
  }, []);

  const handleParamChange = useCallback((
    indicator: IndicatorInstance,
    key: string,
    value: number | string
  ) => {
    onUpdate(indicator.id, {
      params: { ...indicator.params, [key]: value },
    });
  }, [onUpdate]);

  return (
    <div className="flex flex-col min-h-0 h-full relative" data-testid="indicators-tab-v2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b sticky top-0 z-10"
        style={{
          backgroundColor: "var(--tv-panel, #1e222d)",
          borderColor: "var(--tv-border, #363a45)",
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--tv-text-muted, #787b86)" }}>
          Indicators
        </span>
        <Button
          type="button"
          size="sm"
          onClick={onOpenModal}
          className="h-6 px-2.5 text-[11px] font-medium rounded"
          style={{
            backgroundColor: "var(--tv-blue, #2962ff)",
            color: "#fff",
            border: "none",
          }}
          data-testid="indicators-add-btn"
        >
          + Add
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {indicators.length === 0 ? (
          <div className="p-6 text-center" data-testid="indicators-empty">
            <p className="text-sm" style={{ color: "var(--tv-text-muted, #787b86)" }}>
              No indicators added
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--tv-text-muted, #787b86)" }}>
              Click "+ Add" to add indicators
            </p>
          </div>
        ) : (
          <div className="py-1">
            {indicators.map((ind) => {
              const isEditing = editingId === ind.id;
              const inputDefs = getInputDefs(ind.kind);
              
              return (
                <div
                  key={ind.id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--tv-border, #363a45)" }}
                  data-testid={`indicator-row-${ind.id}`}
                >
                  {/* Main Row */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 transition ${
                      isEditing ? "bg-[var(--tv-bg-secondary,#2a2e39)]" : "hover:bg-[var(--tv-bg-secondary,#2a2e39)]/50"
                    }`}
                  >
                    {/* Drag handle (visual only for now) */}
                    <GripVertical
                      className="w-3.5 h-3.5 flex-shrink-0 cursor-grab"
                      style={{ color: "var(--tv-text-muted, #787b86)" }}
                    />

                    {/* Color dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ind.color }}
                    />

                    {/* Name + Params + Status */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-sm font-medium ${ind.hidden ? "line-through opacity-50" : ""}`}
                          style={{ color: "var(--tv-text, #d1d4dc)" }}
                        >
                          {getDisplayName(ind.kind)}
                        </span>
                        <span className="text-xs" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                          {getParamsSummary(ind)}
                        </span>
                      </div>
                      {/* Compute Status Line */}
                      {(() => {
                        const status = getComputeStatus(ind, indicatorResults);
                        const manifest = getIndicatorManifest(ind.kind);
                        // Use manifest.panePolicy as single source of truth (not outputs[0].pane which doesn't exist)
                        const paneType = manifest?.panePolicy ?? "overlay";
                        const isSeparate = paneType === "separate";
                        
                        return (
                          <div className="flex items-center gap-2 mt-0.5">
                            {status.state === "error" ? (
                              <span className="flex items-center gap-1 text-[10px] text-red-400">
                                <AlertCircle className="w-3 h-3" />
                                Compute failed
                              </span>
                            ) : status.state === "pending" ? (
                              <span className="text-[10px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                                Computing...
                              </span>
                            ) : (
                              <span className="text-[10px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                                {status.points} pts • Last: {formatValue(status.lastValue)}
                              </span>
                            )}
                            {/* Pane badge - reads from manifest.panePolicy */}
                            <span 
                              className="text-[9px] px-1 py-0.5 rounded"
                              style={{ 
                                backgroundColor: isSeparate 
                                  ? "rgba(255, 152, 0, 0.15)" 
                                  : "rgba(41, 98, 255, 0.15)",
                                color: isSeparate 
                                  ? "#ff9800" 
                                  : "var(--tv-blue, #2962ff)"
                              }}
                              data-testid={`indicator-pane-${ind.id}`}
                              title={`Pane: ${paneType} (from manifest.panePolicy)`}
                            >
                              {isSeparate ? "Separate" : "Overlay"}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={ind.hidden ? "Show" : "Hide"}
                        onClick={() => onUpdate(ind.id, { hidden: !ind.hidden })}
                        className="h-6 w-6 rounded"
                        style={{ color: ind.hidden ? "var(--tv-text-muted, #787b86)" : "var(--tv-text, #d1d4dc)" }}
                        data-testid={`indicator-eye-${ind.id}`}
                      >
                        {ind.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Edit"
                        onClick={() => handleToggleEdit(ind.id)}
                        className={`h-6 w-6 rounded ${isEditing ? "bg-[var(--tv-blue,#2962ff)]/20" : ""}`}
                        style={{ color: isEditing ? "var(--tv-blue, #2962ff)" : "var(--tv-text-muted, #787b86)" }}
                        data-testid={`indicator-edit-${ind.id}`}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove"
                        onClick={() => onRemove(ind.id)}
                        className="h-6 w-6 rounded hover:text-red-400"
                        style={{ color: "var(--tv-text-muted, #787b86)" }}
                        data-testid={`indicator-remove-${ind.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Edit Panel */}
                  {isEditing && (
                    <div
                      className="px-3 pb-3 pt-1"
                      style={{ backgroundColor: "var(--tv-bg-secondary, #2a2e39)" }}
                    >
                      {/* Tab Switcher */}
                      <div className="flex gap-1 mb-2">
                        <button
                          type="button"
                          onClick={() => setEditTab("inputs")}
                          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                            editTab === "inputs" 
                              ? "bg-[var(--tv-blue,#2962ff)]/20 text-[var(--tv-blue,#2962ff)]" 
                              : "text-[var(--tv-text-muted,#787b86)] hover:text-[var(--tv-text,#d1d4dc)]"
                          }`}
                        >
                          Inputs
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditTab("style")}
                          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                            editTab === "style" 
                              ? "bg-[var(--tv-blue,#2962ff)]/20 text-[var(--tv-blue,#2962ff)]" 
                              : "text-[var(--tv-text-muted,#787b86)] hover:text-[var(--tv-text,#d1d4dc)]"
                          }`}
                        >
                          Style
                        </button>
                      </div>

                      {/* Inputs Tab */}
                      {editTab === "inputs" && inputDefs.length > 0 && (
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(inputDefs.length, 3)}, 1fr)` }}>
                          {inputDefs.map(inputDef => (
                            <div key={inputDef.key}>
                              <label
                                className="text-[10px] font-medium mb-1 block"
                                style={{ color: "var(--tv-text-muted, #787b86)" }}
                              >
                                {inputDef.label}
                              </label>
                              {inputDef.type === "select" ? (
                                <select
                                  value={String(ind.params[inputDef.key] ?? inputDef.default)}
                                  onChange={e => handleParamChange(ind, inputDef.key, e.target.value)}
                                  className="w-full h-7 px-2 text-xs rounded border"
                                  style={{
                                    backgroundColor: "var(--tv-bg, #131722)",
                                    borderColor: "var(--tv-border, #363a45)",
                                    color: "var(--tv-text, #d1d4dc)",
                                  }}
                                  data-testid={`indicator-param-${ind.id}-${inputDef.key}`}
                                >
                                  {inputDef.options?.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <Input
                                  type="number"
                                  min={inputDef.min}
                                  max={inputDef.max}
                                  step={inputDef.step ?? 1}
                                  value={Number(ind.params[inputDef.key] ?? inputDef.default)}
                                  onChange={e => handleParamChange(ind, inputDef.key, Math.max(inputDef.min ?? 1, Number(e.target.value)))}
                                  className="h-7 text-xs"
                                  style={{
                                    backgroundColor: "var(--tv-bg, #131722)",
                                    borderColor: "var(--tv-border, #363a45)",
                                    color: "var(--tv-text, #d1d4dc)",
                                  }}
                                  data-testid={`indicator-param-${ind.id}-${inputDef.key}`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {editTab === "inputs" && inputDefs.length === 0 && (
                        <p className="text-[10px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                          No configurable inputs
                        </p>
                      )}

                      {/* Style Tab */}
                      {editTab === "style" && (
                        <div className="space-y-3">
                          {/* Main Color */}
                          <div>
                            <label
                              className="text-[10px] font-medium mb-1 block"
                              style={{ color: "var(--tv-text-muted, #787b86)" }}
                            >
                              Color
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={ind.color}
                                onChange={e => onUpdate(ind.id, { color: e.target.value })}
                                className="w-8 h-7 rounded border cursor-pointer"
                                style={{
                                  backgroundColor: "var(--tv-bg, #131722)",
                                  borderColor: "var(--tv-border, #363a45)",
                                }}
                                data-testid={`indicator-color-${ind.id}`}
                              />
                              <span className="text-[10px] font-mono" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                                {ind.color.toUpperCase()}
                              </span>
                            </div>
                          </div>

                          {/* TV-style color presets */}
                          <div>
                            <label
                              className="text-[10px] font-medium mb-1 block"
                              style={{ color: "var(--tv-text-muted, #787b86)" }}
                            >
                              Presets
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                "#2962ff", "#f23645", "#089981", "#ff9800", 
                                "#9c27b0", "#00bcd4", "#ffeb3b", "#e91e63",
                                "#4caf50", "#795548"
                              ].map(color => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => onUpdate(ind.id, { color })}
                                  className={`w-5 h-5 rounded border-2 transition-transform hover:scale-110 ${
                                    ind.color.toLowerCase() === color ? "border-white" : "border-transparent"
                                  }`}
                                  style={{ backgroundColor: color }}
                                  title={color}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

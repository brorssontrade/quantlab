import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Trash2, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { IndicatorInstance, IndicatorKind, IndicatorPane } from "../../types";
import { indicatorDisplayName, indicatorParamsSummary, defaultIndicatorParams } from "../../types";

interface IndicatorsTabProps {
  indicators: IndicatorInstance[];
  onAdd: (
    kind: IndicatorKind,
    params?: Partial<IndicatorInstance["params"]>,
    options?: { color?: string; pane?: IndicatorPane },
  ) => IndicatorInstance;
  onUpdate: (id: string, patch: Partial<IndicatorInstance>) => void;
  onRemove: (id: string) => void;
  // TV-18.2: Open central modal for adding indicators
  onOpenModal?: () => void;
}

export function IndicatorsTab({ indicators, onAdd, onUpdate, onRemove, onOpenModal }: IndicatorsTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleOpenAdd = () => {
    if (onOpenModal) {
      onOpenModal();
    }
  };

  return (
    <div className="flex flex-col min-h-0 h-full relative" data-testid="indicators-tab">
      {/* Header - TV tight */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b sticky top-0"
        style={{
          backgroundColor: "var(--tv-panel, #1e222d)",
          borderColor: "var(--tv-border, #363a45)",
          color: "var(--tv-text, #d1d4dc)",
        }}
      >
        <span className="text-[11px] font-medium" style={{ color: "var(--tv-text-muted, #787b86)" }}>Indicators</span>
        <Button
          type="button"
          size="sm"
          onClick={handleOpenAdd}
          className="h-5 px-2 text-[10px] rounded-sm"
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

      {/* Content - TV tight */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {indicators.length === 0 ? (
          <p className="text-[11px] text-center py-3" style={{ color: "var(--tv-text-muted, #787b86)" }} data-testid="indicators-empty">
            No indicators
          </p>
        ) : (
          indicators.map((ind) => {
            const isEditing = editingId === ind.id;
            return (
              <div
                key={ind.id}
                className="rounded-sm border px-2 py-1.5 transition"
                style={{
                  borderColor: "var(--tv-border, #363a45)",
                  backgroundColor: isEditing ? "var(--tv-bg-secondary, #2a2e39)" : "transparent",
                }}
                data-testid={`indicator-row-${ind.id}`}
              >
                {/* Name row */}
                <div className="flex items-center gap-1.5 justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate" style={{ color: "var(--tv-text, #d1d4dc)" }}>
                      {indicatorDisplayName(ind.kind)}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                      {indicatorParamsSummary(ind)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={ind.hidden ? "Show" : "Hide"}
                      onClick={() => onUpdate(ind.id, { hidden: !ind.hidden })}
                      className="h-5 w-5 text-[10px] rounded-sm"
                      style={{ color: "var(--tv-text-muted, #787b86)" }}
                      data-testid={`indicator-eye-${ind.id}`}
                    >
                      {ind.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Edit"
                      onClick={() => setEditingId(isEditing ? null : ind.id)}
                      className="h-5 w-5 text-[10px] rounded-sm"
                      style={{ color: "var(--tv-text-muted, #787b86)" }}
                      data-testid={`indicator-edit-${ind.id}`}
                    >
                      <Settings className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove"
                      onClick={() => onRemove(ind.id)}
                      className="h-5 w-5 text-[10px] rounded-sm"
                      style={{ color: "var(--tv-text-muted, #787b86)" }}
                      data-testid={`indicator-remove-${ind.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <div className="mt-1.5 pt-1.5 border-t space-y-1.5" style={{ borderColor: "var(--tv-border, #363a45)" }}>
                    {ind.kind === "macd" ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>Fast</label>
                          <Input
                            type="number"
                            min={1}
                            value={(ind.params as any).fast}
                            onChange={(e) =>
                              onUpdate(ind.id, {
                                params: { ...(ind.params as any), fast: Math.max(1, Number(e.target.value)) },
                              })
                            }
                            className="h-5 text-[10px]"
                            style={{ backgroundColor: "var(--tv-bg, #131722)", borderColor: "var(--tv-border, #363a45)", color: "var(--tv-text, #d1d4dc)" }}
                          />
                        </div>
                        <div>
                          <label className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>Slow</label>
                          <Input
                            type="number"
                            min={1}
                            value={(ind.params as any).slow}
                            onChange={(e) =>
                              onUpdate(ind.id, {
                                params: { ...(ind.params as any), slow: Math.max(1, Number(e.target.value)) },
                              })
                            }
                            className="h-5 text-[10px]"
                            style={{ backgroundColor: "var(--tv-bg, #131722)", borderColor: "var(--tv-border, #363a45)", color: "var(--tv-text, #d1d4dc)" }}
                          />
                        </div>
                        <div>
                          <label className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>Signal</label>
                          <Input
                            type="number"
                            min={1}
                            value={(ind.params as any).signal}
                            onChange={(e) =>
                              onUpdate(ind.id, {
                                params: { ...(ind.params as any), signal: Math.max(1, Number(e.target.value)) },
                              })
                            }
                            className="h-5 text-[10px]"
                            style={{ backgroundColor: "var(--tv-bg, #131722)", borderColor: "var(--tv-border, #363a45)", color: "var(--tv-text, #d1d4dc)" }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>Period</label>
                        <Input
                          type="number"
                          min={1}
                          value={(ind.params as any).period}
                          onChange={(e) =>
                            onUpdate(ind.id, {
                              params: { ...(ind.params as any), period: Math.max(1, Number(e.target.value)) },
                            })
                          }
                          className="h-5 text-[10px]"
                          style={{ backgroundColor: "var(--tv-bg, #131722)", borderColor: "var(--tv-border, #363a45)", color: "var(--tv-text, #d1d4dc)" }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {/* TV-18.2: Overlay removed - indicator picker now opens in central modal */}
    </div>
  );
}

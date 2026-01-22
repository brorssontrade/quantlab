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
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b sticky top-0"
        style={{
          backgroundColor: "var(--cp-panel-header-bg)",
          borderColor: "var(--cp-panel-border)",
          color: "var(--cp-panel-text)",
        }}
      >
        <span className="text-xs font-medium">Indicators</span>
        <Button
          type="button"
          size="sm"
          onClick={handleOpenAdd}
          className="h-6 px-2 text-xs"
          style={{ color: "var(--cp-panel-text)" }}
          data-testid="indicators-add-btn"
        >
          + Add
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {indicators.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: "var(--cp-panel-text-muted)" }} data-testid="indicators-empty">
            No indicators
          </p>
        ) : (
          indicators.map((ind) => {
            const isEditing = editingId === ind.id;
            return (
              <div
                key={ind.id}
                className="rounded border px-3 py-2 transition"
                style={{
                  borderColor: "var(--cp-panel-border)",
                  backgroundColor: isEditing ? "var(--cp-panel-hover-bg)" : "transparent",
                }}
                data-testid={`indicator-row-${ind.id}`}
              >
                {/* Name row */}
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide truncate">
                      {indicatorDisplayName(ind.kind)}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--cp-panel-text-muted)" }}>
                      {indicatorParamsSummary(ind)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={ind.hidden ? "Show" : "Hide"}
                      onClick={() => onUpdate(ind.id, { hidden: !ind.hidden })}
                      className="h-6 w-6 text-xs"
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
                      className="h-6 w-6 text-xs"
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
                      className="h-6 w-6 text-xs"
                      data-testid={`indicator-remove-${ind.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <div className="mt-2 pt-2 border-t space-y-2" style={{ borderColor: "var(--cp-panel-border)" }}>
                    {ind.kind === "macd" ? (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Fast</label>
                          <Input
                            type="number"
                            min={1}
                            value={(ind.params as any).fast}
                            onChange={(e) =>
                              onUpdate(ind.id, {
                                params: { ...(ind.params as any), fast: Math.max(1, Number(e.target.value)) },
                              })
                            }
                            className="h-6 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Slow</label>
                          <Input
                            type="number"
                            min={1}
                            value={(ind.params as any).slow}
                            onChange={(e) =>
                              onUpdate(ind.id, {
                                params: { ...(ind.params as any), slow: Math.max(1, Number(e.target.value)) },
                              })
                            }
                            className="h-6 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Signal</label>
                          <Input
                            type="number"
                            min={1}
                            value={(ind.params as any).signal}
                            onChange={(e) =>
                              onUpdate(ind.id, {
                                params: { ...(ind.params as any), signal: Math.max(1, Number(e.target.value)) },
                              })
                            }
                            className="h-6 text-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] text-muted-foreground">Period</label>
                        <Input
                          type="number"
                          min={1}
                          value={(ind.params as any).period}
                          onChange={(e) =>
                            onUpdate(ind.id, {
                              params: { ...(ind.params as any), period: Math.max(1, Number(e.target.value)) },
                            })
                          }
                          className="h-6 text-xs"
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

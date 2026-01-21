import { useMemo, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Trash2, Settings } from "lucide-react";
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
  // TV-12: controlled addOpen state
  addOpen?: boolean;
  onChangeAddOpen?: (value: boolean) => void;
}

const ALL_KINDS: IndicatorKind[] = ["sma", "ema", "rsi", "macd"];

export function IndicatorsTab({ indicators, onAdd, onUpdate, onRemove, addOpen: addOpenProp, onChangeAddOpen }: IndicatorsTabProps) {
  const [localAddOpen, setLocalAddOpen] = useState(() => {
    try {
      return window.localStorage?.getItem("cp.indicators.addOpen") === "1";
    } catch {
      return false;
    }
  });

  const addOpen = addOpenProp !== undefined ? addOpenProp : localAddOpen;

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when add overlay opens
  useEffect(() => {
    if (addOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [addOpen]);

  const filteredKinds = useMemo(
    () => ALL_KINDS.filter((k) => indicatorDisplayName(k).toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  const setAddOpen = (value: boolean) => {
    if (onChangeAddOpen) {
      onChangeAddOpen(value);
    } else {
      setLocalAddOpen(value);
      try {
        window.localStorage?.setItem("cp.indicators.addOpen", value ? "1" : "0");
      } catch {
        // ignore
      }
    }
  };

  const handleOpenAdd = () => setAddOpen(true);
  const handleCloseAdd = () => setAddOpen(false);

  const handleAddKind = (kind: IndicatorKind) => {
    const defaults = defaultIndicatorParams(kind);
    const pane: IndicatorPane = kind === "rsi" || kind === "macd" ? "separate" : "price";
    onAdd(kind, defaults as Partial<IndicatorInstance["params"]>, { pane });
    setQuery("");
    handleCloseAdd();
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

      {/* Add overlay - constrained to RightPanel (not full screen) */}
      {addOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm pointer-events-none" data-testid="indicators-overlay">
          <div
            className="w-80 rounded-lg border shadow-lg z-50 pointer-events-auto"
            style={{
              backgroundColor: "var(--cp-panel-bg)",
              borderColor: "var(--cp-panel-border)",
              color: "var(--cp-panel-text)",
            }}
            data-testid="indicators-add-form"
          >
            {/* Overlay header - pointer-events-none to prevent interception, children use pointer-events-auto */}
            <div
              className="flex items-center justify-between px-3 py-2 border-b pointer-events-none"
              style={{
                backgroundColor: "var(--cp-panel-header-bg)",
                borderColor: "var(--cp-panel-border)",
              }}
            >
              <span className="text-xs font-medium pointer-events-auto">Add Indicator</span>
              <button
                type="button"
                onClick={() => {
                  console.log("[IndicatorsTab] X button clicked, calling handleCloseAdd");
                  handleCloseAdd();
                }}
                className="relative z-10 h-5 w-5 flex items-center justify-center text-xs hover:bg-slate-700 rounded pointer-events-auto"
                aria-label="Close add indicator"
                data-testid="indicators-close-overlay"
              >
                ✕
              </button>
            </div>

            {/* Overlay content */}
            <div className="p-3 space-y-3 max-h-96 overflow-y-auto" data-testid="indicators-overlay-content">
              <Input
                ref={searchInputRef}
                placeholder="Search (SMA, EMA, RSI, MACD)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 text-xs"
                data-testid="indicators-search"
              />

              <div className="space-y-1">
                {filteredKinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="w-full text-left rounded px-3 py-2 text-sm transition capitalize"
                    style={{
                      color: "var(--cp-panel-text)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        "var(--cp-panel-hover-bg)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        "transparent";
                    }}
                    onClick={() => handleAddKind(k)}
                    data-testid={`indicators-add-${k}`}
                  >
                    {indicatorDisplayName(k)}
                  </button>
                ))}
                {filteredKinds.length === 0 && (
                  <p className="text-xs text-center py-2" style={{ color: "var(--cp-panel-text-muted)" }}>
                    No matches
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

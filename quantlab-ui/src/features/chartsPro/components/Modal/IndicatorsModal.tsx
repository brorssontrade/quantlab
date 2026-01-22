/**
 * TV-18.2: IndicatorsModal - Central indicator picker in portal modal
 *
 * TradingView-style modal for adding indicators.
 * Extracted from IndicatorsTab overlay to avoid RightPanel clipping.
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import type { IndicatorKind, IndicatorPane, IndicatorInstance } from "../../types";
import { indicatorDisplayName, defaultIndicatorParams } from "../../types";

const ALL_KINDS: IndicatorKind[] = ["sma", "ema", "rsi", "macd"];

interface IndicatorsModalProps {
  onAdd: (
    kind: IndicatorKind,
    params?: Partial<IndicatorInstance["params"]>,
    options?: { color?: string; pane?: IndicatorPane },
  ) => IndicatorInstance;
  onClose: () => void;
}

export function IndicatorsModal({ onAdd, onClose }: IndicatorsModalProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on mount
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const filteredKinds = useMemo(
    () => ALL_KINDS.filter((k) => indicatorDisplayName(k).toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  const handleAddKind = (kind: IndicatorKind) => {
    const defaults = defaultIndicatorParams(kind);
    const pane: IndicatorPane = kind === "rsi" || kind === "macd" ? "separate" : "price";
    onAdd(kind, defaults as Partial<IndicatorInstance["params"]>, { pane });
    setQuery("");
    onClose();
  };

  return (
    <div
      className="w-[400px] max-w-[90vw] rounded-lg border shadow-2xl"
      style={{
        backgroundColor: "var(--cp-panel-bg)",
        borderColor: "var(--cp-panel-border)",
        color: "var(--cp-panel-text)",
      }}
      data-testid="indicators-modal"
    >
      {/* Modal header with title for a11y (matches aria-labelledby="modal-title" in ModalPortal) */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          backgroundColor: "var(--cp-panel-header-bg)",
          borderColor: "var(--cp-panel-border)",
        }}
      >
        <span id="modal-title" className="text-sm font-medium">
          Indicators
        </span>
        <button
          type="button"
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center text-sm hover:bg-slate-700 rounded"
          aria-label="Close"
          data-testid="indicators-modal-close"
        >
          ✕
        </button>
      </div>

      {/* Search + list */}
      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        <Input
          ref={searchInputRef}
          placeholder="Search indicators (SMA, EMA, RSI, MACD)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 text-sm"
          data-testid="indicators-modal-search"
        />

        <div className="space-y-1">
          {filteredKinds.map((k) => (
            <button
              key={k}
              type="button"
              className="w-full text-left rounded px-3 py-2.5 text-sm transition capitalize hover:bg-slate-700"
              style={{
                color: "var(--cp-panel-text)",
              }}
              onClick={() => handleAddKind(k)}
              data-testid={`indicators-modal-add-${k}`}
            >
              {indicatorDisplayName(k)}
            </button>
          ))}
          {filteredKinds.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: "var(--cp-panel-text-muted)" }}>
              No indicators match "{query}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

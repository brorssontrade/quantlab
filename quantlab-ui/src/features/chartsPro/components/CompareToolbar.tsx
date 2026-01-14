import { useEffect, useState } from "react";

import { colorFor, type CompareMode, encodeId } from "../state/compare";
import type { Tf } from "../types";
import { TIMEFRAME_OPTIONS } from "../state/controls";

interface CompareToolbarProps {
  items: Array<{ symbol: string; mode: CompareMode; timeframe: Tf; hidden?: boolean }>;
  defaultMode: CompareMode;
  defaultTimeframe: Tf;
  compareScaleMode?: "price" | "percent";
  onAdd: (symbol: string, options: { mode: CompareMode; timeframe: Tf }) => Promise<void> | void;
  onRemove: (symbol: string) => void;
  onToggle: (symbol: string) => void;
  onMode: (symbol: string, mode: CompareMode) => void;
  onTimeframe: (symbol: string, timeframe: Tf) => void;
  onDefaultsChange: (options: { mode: CompareMode; timeframe: Tf }) => void;
  onCompareScaleModeChange?: (mode: "price" | "percent") => void;
}

const MODE_OPTIONS: Array<{ label: string; value: CompareMode }> = [
  { label: "Overlay", value: "percent" },
  { label: "Indexed", value: "indexed" },
  { label: "Price", value: "price" },
];

export function CompareToolbar({
  items,
  defaultMode,
  defaultTimeframe,
  compareScaleMode,
  onAdd,
  onRemove,
  onToggle,
  onMode,
  onTimeframe,
  onDefaultsChange,
  onCompareScaleModeChange,
}: CompareToolbarProps) {
  const [symbolValue, setSymbolValue] = useState("");
  const [modeValue, setModeValue] = useState<CompareMode>(defaultMode);
  const [timeframeValue, setTimeframeValue] = useState<Tf>(defaultTimeframe);
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    setModeValue(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    setTimeframeValue(defaultTimeframe);
  }, [defaultTimeframe]);

  const handleSubmit = () => {
    const trimmed = symbolValue.trim().toUpperCase();
    if (!trimmed) return;
    const result = onAdd(trimmed, { mode: modeValue, timeframe: timeframeValue });
    onDefaultsChange({ mode: modeValue, timeframe: timeframeValue });
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSubmitting(true);
      (result as Promise<unknown>)
        .catch(() => {
          // errors handled upstream
        })
        .finally(() => {
          setSymbolValue("");
          setSubmitting(false);
        });
    } else {
      setSymbolValue("");
    }
  };

  return (
    <div className="flex flex-col gap-2 text-sm text-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <button
          data-testid="compare-scale-mode-toggle"
          type="button"
          className={`rounded border px-2 py-1 text-xs uppercase tracking-wide transition ${
            compareScaleMode === "percent"
              ? "border-blue-500 bg-blue-950/40 text-blue-200"
              : "border-slate-700/60 bg-slate-950/30 text-slate-200 hover:bg-slate-800/40"
          }`}
          onClick={() => {
            onCompareScaleModeChange?.(compareScaleMode === "percent" ? "price" : "percent");
          }}
        >
          {compareScaleMode === "percent" ? "Scale: %" : "Scale: Price"}
        </button>
        <input
          data-testid="compare-add-symbol"
          value={symbolValue}
          onChange={(event) => setSymbolValue(event.target.value)}
          placeholder="Compare symbol. e.g. MSFT.US"
          className="w-44 flex-1 rounded border border-slate-700/60 bg-slate-950/30 px-2 py-1 text-xs uppercase placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
        />
        <select
          data-testid="compare-add-timeframe"
          value={timeframeValue}
          onChange={(event) => setTimeframeValue(event.target.value as Tf)}
          className="rounded border border-slate-700/60 bg-slate-950/30 px-1 py-0.5 text-[11px] uppercase"
        >
          {TIMEFRAME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value}
            </option>
          ))}
        </select>
        <select
          data-testid="compare-add-mode"
          value={modeValue}
          onChange={(event) => setModeValue(event.target.value as CompareMode)}
          className="rounded border border-slate-700/60 bg-slate-950/30 px-1 py-0.5 text-[11px] uppercase"
        >
          {MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          data-testid="compare-add-submit"
          type="button"
          className="rounded border border-slate-700/60 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 transition hover:bg-slate-800/40"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Adding..." : "Add"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => {
          const domKey = encodeId(item.symbol);
          return (
            <div
              key={item.symbol}
              className="flex flex-wrap items-center gap-2 rounded border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-xs"
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(item.symbol) }} />
              <strong className="tracking-wide">{item.symbol}</strong>
              <select
                data-testid={`compare-${domKey}-timeframe`}
                value={item.timeframe}
                onChange={(event) => onTimeframe(item.symbol, event.target.value as Tf)}
                className="rounded border border-slate-700/60 bg-slate-950/30 px-1 py-0.5 text-[11px] uppercase"
            >
              {TIMEFRAME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value}
                </option>
              ))}
              </select>
              <select
                data-testid={`compare-${domKey}-mode`}
                value={item.mode}
                onChange={(event) => onMode(item.symbol, event.target.value as CompareMode)}
                className="rounded border border-slate-700/60 bg-slate-950/30 px-1 py-0.5 text-[11px] uppercase"
              >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-[11px] uppercase tracking-wide underline"
              onClick={() => onToggle(item.symbol)}
            >
              {item.hidden ? "show" : "hide"}
            </button>
            <button
              type="button"
              className="text-[11px] uppercase tracking-wide text-rose-400 underline"
              onClick={() => onRemove(item.symbol)}
            >
              remove
            </button>
            <div className="flex gap-1 items-center">
              <button
                data-testid={`compare-${domKey}-addmode-samePercent`}
                type="button"
                className="rounded px-1 py-0.5 text-[11px] bg-slate-800/50"
                onClick={() => onAdd(item.symbol, { mode: item.mode, timeframe: item.timeframe, addMode: "samePercent" })}
              >
                %
              </button>
              <button
                data-testid={`compare-${domKey}-addmode-newPriceScale`}
                type="button"
                className="rounded px-1 py-0.5 text-[11px] bg-slate-800/50"
                onClick={() => onAdd(item.symbol, { mode: item.mode, timeframe: item.timeframe, addMode: "newPriceScale" })}
              >
                scale
              </button>
              <button
                data-testid={`compare-${domKey}-addmode-newPane`}
                type="button"
                className="rounded px-1 py-0.5 text-[11px] bg-slate-800/50"
                onClick={() => onAdd(item.symbol, { mode: item.mode, timeframe: item.timeframe, addMode: "newPane" })}
              >
                pane
              </button>
            </div>
            </div>
        );
        })}
      </div>
    </div>
  );
}

/**
 * PRIO 3: TradingView-style Indicators Modal
 * 
 * Features:
 * - Search with instant filtering
 * - Category sidebar (Moving Averages, Momentum, Volatility, Volume)
 * - Keyboard navigation (ArrowUp/Down, Enter to add, Esc to close)
 * - TV premium styling (tokens, spacing, hover states)
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, X, TrendingUp, Activity, BarChart3, Volume2, LineChart } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  INDICATOR_MANIFESTS,
  CATEGORY_META,
  CATEGORY_ORDER,
  searchIndicators,
  getDefaultInputs,
  type IndicatorManifest,
  type IndicatorCategory,
} from "../../indicators/indicatorManifest";
import type { IndicatorKind, IndicatorPane, IndicatorInstance } from "../../indicators/registryV2";
import { getDefaultColor, getDefaultPane, getDefaultParams } from "../../indicators/registryV2";

// ============================================================================
// Types
// ============================================================================

interface IndicatorsModalV2Props {
  onAdd: (
    kind: IndicatorKind,
    params?: Partial<Record<string, number | string>>,
    options?: { color?: string; pane?: IndicatorPane },
  ) => IndicatorInstance;
  onClose: () => void;
}

// ============================================================================
// Category Icons
// ============================================================================

const CATEGORY_ICONS: Record<IndicatorCategory, React.ReactNode> = {
  "moving-average": <LineChart className="w-4 h-4" />,
  "momentum": <Activity className="w-4 h-4" />,
  "volatility": <BarChart3 className="w-4 h-4" />,
  "volume": <Volume2 className="w-4 h-4" />,
  "trend": <TrendingUp className="w-4 h-4" />,
};

// ============================================================================
// Component
// ============================================================================

export function IndicatorsModalV2({ onAdd, onClose }: IndicatorsModalV2Props) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<IndicatorCategory | "all">("all");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus search on mount
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Filter indicators
  const filteredIndicators = useMemo(() => {
    let results = query ? searchIndicators(query) : INDICATOR_MANIFESTS;
    if (selectedCategory !== "all") {
      results = results.filter(m => m.category === selectedCategory);
    }
    return results;
  }, [query, selectedCategory]);

  // Reset highlight when filters change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, selectedCategory]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll("[data-indicator-item]");
      const highlighted = items[highlightedIndex] as HTMLElement;
      if (highlighted) {
        highlighted.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(i => Math.min(i + 1, filteredIndicators.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredIndicators[highlightedIndex]) {
          handleAdd(filteredIndicators[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredIndicators, highlightedIndex, onClose]);

  // Add indicator
  const handleAdd = (manifest: IndicatorManifest) => {
    const kind = manifest.id as IndicatorKind;
    const params = getDefaultParams(kind);
    const color = getDefaultColor(kind);
    const pane = getDefaultPane(kind);
    onAdd(kind, params, { color, pane });
    onClose();
  };

  // Group by category for display
  const groupedIndicators = useMemo(() => {
    if (selectedCategory !== "all") {
      return [{ category: selectedCategory, indicators: filteredIndicators }];
    }
    
    const groups: Array<{ category: IndicatorCategory; indicators: IndicatorManifest[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const indicators = filteredIndicators.filter(m => m.category === cat);
      if (indicators.length > 0) {
        groups.push({ category: cat, indicators });
      }
    }
    return groups;
  }, [filteredIndicators, selectedCategory]);

  // Flat list for keyboard navigation
  const flatIndex = (groupIdx: number, itemIdx: number): number => {
    let idx = 0;
    for (let g = 0; g < groupIdx; g++) {
      idx += groupedIndicators[g].indicators.length;
    }
    return idx + itemIdx;
  };

  return (
    <div
      className="w-[560px] max-w-[95vw] h-[480px] max-h-[80vh] rounded-lg border shadow-2xl flex overflow-hidden"
      style={{
        backgroundColor: "var(--tv-bg, #131722)",
        borderColor: "var(--tv-border, #363a45)",
        color: "var(--tv-text, #d1d4dc)",
      }}
      data-testid="indicators-modal-v2"
      onKeyDown={handleKeyDown}
    >
      {/* Left Sidebar - Categories */}
      <div
        className="w-[160px] border-r flex-shrink-0 flex flex-col"
        style={{ borderColor: "var(--tv-border, #363a45)", backgroundColor: "var(--tv-panel, #1e222d)" }}
      >
        <div className="p-3 border-b" style={{ borderColor: "var(--tv-border, #363a45)" }}>
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--tv-text-muted, #787b86)" }}>
            Categories
          </span>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {/* All */}
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
              selectedCategory === "all" ? "bg-[var(--tv-blue,#2962ff)]/20" : "hover:bg-[var(--tv-bg-secondary,#2a2e39)]"
            }`}
            style={{ color: selectedCategory === "all" ? "var(--tv-blue, #2962ff)" : "var(--tv-text, #d1d4dc)" }}
            data-testid="category-all"
          >
            <Search className="w-4 h-4" />
            <span>All</span>
            <span className="ml-auto text-xs" style={{ color: "var(--tv-text-muted, #787b86)" }}>
              {INDICATOR_MANIFESTS.length}
            </span>
          </button>

          {/* Categories */}
          {CATEGORY_ORDER.map(cat => {
            const count = INDICATOR_MANIFESTS.filter(m => m.category === cat).length;
            if (count === 0) return null;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
                  isActive ? "bg-[var(--tv-blue,#2962ff)]/20" : "hover:bg-[var(--tv-bg-secondary,#2a2e39)]"
                }`}
                style={{ color: isActive ? "var(--tv-blue, #2962ff)" : "var(--tv-text, #d1d4dc)" }}
                data-testid={`category-${cat}`}
              >
                {CATEGORY_ICONS[cat]}
                <span className="truncate">{CATEGORY_META[cat].label}</span>
                <span className="ml-auto text-xs" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Content - Search + List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with Search */}
        <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: "var(--tv-border, #363a45)" }}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--tv-text-muted, #787b86)" }} />
            <Input
              ref={searchInputRef}
              placeholder="Search indicators..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9 h-9 text-sm border-0 focus-visible:ring-1"
              style={{
                backgroundColor: "var(--tv-bg-secondary, #2a2e39)",
                color: "var(--tv-text, #d1d4dc)",
              }}
              data-testid="indicators-modal-search"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--tv-bg-secondary,#2a2e39)] transition"
            aria-label="Close"
            data-testid="indicators-modal-close"
          >
            <X className="w-5 h-5" style={{ color: "var(--tv-text-muted, #787b86)" }} />
          </button>
        </div>

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {groupedIndicators.length === 0 ? (
            <div className="p-8 text-center" style={{ color: "var(--tv-text-muted, #787b86)" }}>
              <p className="text-sm">No indicators found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            groupedIndicators.map((group, groupIdx) => (
              <div key={group.category}>
                {/* Category Header (only show in "all" mode) */}
                {selectedCategory === "all" && (
                  <div
                    className="sticky top-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide flex items-center gap-2"
                    style={{
                      backgroundColor: "var(--tv-panel, #1e222d)",
                      color: "var(--tv-text-muted, #787b86)",
                      borderBottom: "1px solid var(--tv-border, #363a45)",
                    }}
                  >
                    {CATEGORY_ICONS[group.category]}
                    {CATEGORY_META[group.category].label}
                  </div>
                )}
                
                {/* Indicator Items */}
                {group.indicators.map((manifest, itemIdx) => {
                  const globalIdx = flatIndex(groupIdx, itemIdx);
                  const isHighlighted = globalIdx === highlightedIndex;
                  return (
                    <button
                      key={manifest.id}
                      type="button"
                      onClick={() => handleAdd(manifest)}
                      onMouseEnter={() => setHighlightedIndex(globalIdx)}
                      className={`w-full px-3 py-2.5 flex items-start gap-3 text-left transition ${
                        isHighlighted ? "bg-[var(--tv-blue,#2962ff)]/10" : "hover:bg-[var(--tv-bg-secondary,#2a2e39)]"
                      }`}
                      style={{
                        borderLeft: isHighlighted ? "2px solid var(--tv-blue, #2962ff)" : "2px solid transparent",
                      }}
                      data-indicator-item
                      data-testid={`indicator-item-${manifest.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm" style={{ color: "var(--tv-text, #d1d4dc)" }}>
                            {manifest.name}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "var(--tv-bg-secondary, #2a2e39)",
                              color: "var(--tv-text-muted, #787b86)",
                            }}
                          >
                            {manifest.shortName}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                          {manifest.description}
                        </p>
                      </div>
                      <div
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          backgroundColor: manifest.panePolicy === "overlay" 
                            ? "var(--tv-blue, #2962ff)" 
                            : "var(--tv-bg-secondary, #2a2e39)",
                          color: manifest.panePolicy === "overlay" 
                            ? "#fff" 
                            : "var(--tv-text-muted, #787b86)",
                        }}
                      >
                        {manifest.panePolicy === "overlay" ? "Overlay" : "Separate"}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="px-3 py-2 border-t flex items-center justify-between text-xs"
          style={{ borderColor: "var(--tv-border, #363a45)", color: "var(--tv-text-muted, #787b86)" }}
        >
          <span>
            {filteredIndicators.length} indicator{filteredIndicators.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--tv-bg-secondary,#2a2e39)]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--tv-bg-secondary,#2a2e39)]">⏎</kbd>
              add
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--tv-bg-secondary,#2a2e39)]">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

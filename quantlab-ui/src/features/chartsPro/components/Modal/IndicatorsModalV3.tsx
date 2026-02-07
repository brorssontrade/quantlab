/**
 * PRIO 3: TradingView-style Indicators Modal (Enhanced)
 * 
 * Features:
 * - Search with instant filtering
 * - Category sidebar (Favorites, Recent, Moving Averages, Momentum, Volatility, Volume)
 * - Keyboard navigation (ArrowUp/Down, Enter to add, Esc to close, ? for info)
 * - Star toggle for favorites (persisted to localStorage)
 * - Info panel (? icon) with documentation sections
 * - TV premium styling (tokens, spacing, hover states)
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  X,
  TrendingUp,
  Activity,
  BarChart3,
  Volume2,
  LineChart,
  Star,
  Clock,
  HelpCircle,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  INDICATOR_MANIFESTS,
  CATEGORY_META,
  CATEGORY_ORDER,
  searchIndicators,
  type IndicatorManifest,
  type IndicatorCategory,
} from "../../indicators/indicatorManifest";
import { getIndicatorDocs, type IndicatorDocs } from "../../indicators/indicatorDocs";
import type { IndicatorKind, IndicatorPane, IndicatorInstance } from "../../indicators/registryV2";
import { getDefaultColor, getDefaultPane, getDefaultParams } from "../../indicators/registryV2";
import { useIndicatorFavoritesStore } from "../../state/indicatorFavorites";

// ============================================================================
// Types
// ============================================================================

interface IndicatorsModalV3Props {
  onAdd: (
    kind: IndicatorKind,
    params?: Partial<Record<string, number | string>>,
    options?: { color?: string; pane?: IndicatorPane },
  ) => IndicatorInstance;
  onClose: () => void;
}

type SidebarCategory = IndicatorCategory | "all" | "favorites" | "recent";

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
// Info Panel Component
// ============================================================================

interface InfoPanelProps {
  manifest: IndicatorManifest;
  onClose: () => void;
  onAdd: (manifest: IndicatorManifest) => void;
  onSelectRelated: (id: string) => void;
}

function InfoPanel({ manifest, onClose, onAdd, onSelectRelated }: InfoPanelProps) {
  const docs = getIndicatorDocs(manifest.id);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-4">
      <h4
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: "var(--tv-text-muted, #787b86)" }}
      >
        {title}
      </h4>
      <div className="text-sm" style={{ color: "var(--tv-text, #d1d4dc)" }}>
        {children}
      </div>
    </div>
  );

  return (
    <div
      className="w-[320px] border-l flex flex-col h-full"
      style={{ borderColor: "var(--tv-border, #363a45)", backgroundColor: "var(--tv-bg, #131722)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--tv-border, #363a45)" }}
      >
        <div>
          <h3 className="font-medium" style={{ color: "var(--tv-text, #d1d4dc)" }}>
            {manifest.name}
          </h3>
          <span className="text-xs" style={{ color: "var(--tv-text-muted, #787b86)" }}>
            {manifest.shortName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAdd(manifest)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition hover:opacity-90"
            style={{ backgroundColor: "var(--tv-blue, #2962ff)", color: "#fff" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition"
            aria-label="Close info panel"
          >
            <X className="w-4 h-4" style={{ color: "var(--tv-text-muted, #787b86)" }} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!docs ? (
          <div className="text-center py-8" style={{ color: "var(--tv-text-muted, #787b86)" }}>
            <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Documentation coming soon</p>
          </div>
        ) : (
          <>
            {docs.definition && <Section title="Definition">{docs.definition}</Section>}
            
            {docs.explanation && <Section title="Explanation">{docs.explanation}</Section>}
            
            {docs.calculations && (
              <Section title="Calculations">
                <code
                  className="block p-2 rounded text-xs font-mono whitespace-pre-wrap"
                  style={{ backgroundColor: "var(--tv-bg-secondary, #2a2e39)" }}
                >
                  {docs.calculations}
                </code>
              </Section>
            )}
            
            {docs.takeaways && docs.takeaways.length > 0 && (
              <Section title="Takeaways">
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {docs.takeaways.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </Section>
            )}
            
            {docs.whatToLookFor && docs.whatToLookFor.length > 0 && (
              <Section title="What to Look For">
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {docs.whatToLookFor.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </Section>
            )}
            
            {docs.limitations && docs.limitations.length > 0 && (
              <Section title="Limitations">
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {docs.limitations.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </Section>
            )}
            
            {docs.commonSettings && (
              <Section title="Common Settings">{docs.commonSettings}</Section>
            )}
            
            {docs.bestConditions && (
              <Section title="Best Conditions">{docs.bestConditions}</Section>
            )}
            
            {docs.goesGoodWith && docs.goesGoodWith.length > 0 && (
              <Section title="Goes Good With">
                <div className="flex flex-wrap gap-2">
                  {docs.goesGoodWith.map((relatedId) => {
                    const relatedManifest = INDICATOR_MANIFESTS.find((m) => m.id === relatedId);
                    if (!relatedManifest) return null;
                    return (
                      <button
                        key={relatedId}
                        type="button"
                        onClick={() => onSelectRelated(relatedId)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition hover:bg-[var(--tv-bg-secondary,#2a2e39)]"
                        style={{
                          backgroundColor: "var(--tv-panel, #1e222d)",
                          color: "var(--tv-text, #d1d4dc)",
                          border: "1px solid var(--tv-border, #363a45)",
                        }}
                      >
                        <span>{relatedManifest.shortName}</span>
                        <ChevronRight className="w-3 h-3" style={{ color: "var(--tv-text-muted, #787b86)" }} />
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}
            
            {docs.summary && (
              <Section title="Summary">
                <p className="italic">{docs.summary}</p>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function IndicatorsModalV3({ onAdd, onClose }: IndicatorsModalV3Props) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<SidebarCategory>("all");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [infoManifest, setInfoManifest] = useState<IndicatorManifest | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Favorites store
  const favorites = useIndicatorFavoritesStore((s) => s.favorites);
  const recent = useIndicatorFavoritesStore((s) => s.recent);
  const toggleFavorite = useIndicatorFavoritesStore((s) => s.toggleFavorite);
  const addRecent = useIndicatorFavoritesStore((s) => s.addRecent);

  // Auto-focus search on mount
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Filter indicators based on category and search
  const filteredIndicators = useMemo(() => {
    let results = query ? searchIndicators(query) : INDICATOR_MANIFESTS;

    // Filter by category
    if (selectedCategory === "favorites") {
      results = results.filter((m) => favorites.has(m.id));
    } else if (selectedCategory === "recent") {
      // Order by recent order
      const recentSet = new Set(recent);
      results = recent
        .map((id) => INDICATOR_MANIFESTS.find((m) => m.id === id))
        .filter((m): m is IndicatorManifest => m !== undefined && results.some((r) => r.id === m.id));
    } else if (selectedCategory !== "all") {
      results = results.filter((m) => m.category === selectedCategory);
    }

    return results;
  }, [query, selectedCategory, favorites, recent]);

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
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((i) => Math.min(i + 1, filteredIndicators.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredIndicators[highlightedIndex]) {
            handleAdd(filteredIndicators[highlightedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (infoManifest) {
            setInfoManifest(null);
          } else {
            onClose();
          }
          break;
        case "?":
        case "i":
          if (!e.ctrlKey && !e.metaKey && filteredIndicators[highlightedIndex]) {
            e.preventDefault();
            setInfoManifest(filteredIndicators[highlightedIndex]);
          }
          break;
      }
    },
    [filteredIndicators, highlightedIndex, onClose, infoManifest]
  );

  // Add indicator
  const handleAdd = useCallback(
    (manifest: IndicatorManifest) => {
      const kind = manifest.id as IndicatorKind;
      const params = getDefaultParams(kind);
      const color = getDefaultColor(kind);
      const pane = getDefaultPane(kind);
      addRecent(manifest.id);
      onAdd(kind, params, { color, pane });
      onClose();
    },
    [onAdd, onClose, addRecent]
  );

  // Toggle favorite (prevent event bubbling)
  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent, indicatorId: string) => {
      e.stopPropagation();
      toggleFavorite(indicatorId);
    },
    [toggleFavorite]
  );

  // Open info panel
  const handleOpenInfo = useCallback((e: React.MouseEvent, manifest: IndicatorManifest) => {
    e.stopPropagation();
    setInfoManifest(manifest);
  }, []);

  // Select related indicator from info panel
  const handleSelectRelated = useCallback((id: string) => {
    const manifest = INDICATOR_MANIFESTS.find((m) => m.id === id);
    if (manifest) {
      setInfoManifest(manifest);
    }
  }, []);

  // Group by category for display
  const groupedIndicators = useMemo(() => {
    if (selectedCategory !== "all") {
      return [{ category: selectedCategory, indicators: filteredIndicators }];
    }

    const groups: Array<{ category: SidebarCategory; indicators: IndicatorManifest[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const indicators = filteredIndicators.filter((m) => m.category === cat);
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

  // Counts
  const favoritesCount = INDICATOR_MANIFESTS.filter((m) => favorites.has(m.id)).length;
  const recentCount = recent.length;

  return (
    <div
      className="w-[560px] max-w-[95vw] h-[520px] max-h-[85vh] rounded-lg border shadow-2xl flex overflow-hidden"
      style={{
        backgroundColor: "var(--tv-bg, #131722)",
        borderColor: "var(--tv-border, #363a45)",
        color: "var(--tv-text, #d1d4dc)",
        // Expand width when info panel is open
        width: infoManifest ? "880px" : "560px",
        maxWidth: infoManifest ? "95vw" : "95vw",
        transition: "width 0.2s ease-in-out",
      }}
      data-testid="indicators-modal"
      onKeyDown={handleKeyDown}
    >
      {/* Left Sidebar - Categories */}
      <div
        className="w-[160px] border-r flex-shrink-0 flex flex-col"
        style={{ borderColor: "var(--tv-border, #363a45)", backgroundColor: "var(--tv-panel, #1e222d)" }}
      >
        {/* Personal Section */}
        <div className="py-2">
          <div className="px-3 py-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--tv-text-muted, #787b86)" }}
            >
              Personal
            </span>
          </div>

          {/* Favorites */}
          <button
            type="button"
            onClick={() => setSelectedCategory("favorites")}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
              selectedCategory === "favorites" ? "bg-[var(--tv-blue,#2962ff)]/20" : "hover:bg-[var(--tv-bg-secondary,#2a2e39)]"
            }`}
            style={{ color: selectedCategory === "favorites" ? "var(--tv-blue, #2962ff)" : "var(--tv-text, #d1d4dc)" }}
            data-testid="category-favorites"
          >
            <Star className="w-4 h-4" fill={selectedCategory === "favorites" ? "var(--tv-blue, #2962ff)" : "none"} />
            <span>Favorites</span>
            {favoritesCount > 0 && (
              <span className="ml-auto text-xs" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                {favoritesCount}
              </span>
            )}
          </button>

          {/* Recent */}
          <button
            type="button"
            onClick={() => setSelectedCategory("recent")}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
              selectedCategory === "recent" ? "bg-[var(--tv-blue,#2962ff)]/20" : "hover:bg-[var(--tv-bg-secondary,#2a2e39)]"
            }`}
            style={{ color: selectedCategory === "recent" ? "var(--tv-blue, #2962ff)" : "var(--tv-text, #d1d4dc)" }}
            data-testid="category-recent"
          >
            <Clock className="w-4 h-4" />
            <span>Recent</span>
            {recentCount > 0 && (
              <span className="ml-auto text-xs" style={{ color: "var(--tv-text-muted, #787b86)" }}>
                {recentCount}
              </span>
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 border-t" style={{ borderColor: "var(--tv-border, #363a45)" }} />

        {/* Categories Section */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 py-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--tv-text-muted, #787b86)" }}
            >
              Categories
            </span>
          </div>

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
          {CATEGORY_ORDER.map((cat) => {
            const count = INDICATOR_MANIFESTS.filter((m) => m.category === cat).length;
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

      {/* Center Content - Search + List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with Search */}
        <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: "var(--tv-border, #363a45)" }}>
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--tv-text-muted, #787b86)" }}
            />
            <Input
              ref={searchInputRef}
              placeholder="Search indicators..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
          {filteredIndicators.length === 0 ? (
            <div className="p-8 text-center" style={{ color: "var(--tv-text-muted, #787b86)" }}>
              {selectedCategory === "favorites" ? (
                <>
                  <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No favorites yet</p>
                  <p className="text-xs mt-1">Click the star next to an indicator to add it</p>
                </>
              ) : selectedCategory === "recent" ? (
                <>
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent indicators</p>
                  <p className="text-xs mt-1">Recently added indicators will appear here</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No indicators found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </>
              )}
            </div>
          ) : (
            groupedIndicators.map((group, groupIdx) => (
              <div key={group.category}>
                {/* Category Header (only show in "all" mode) */}
                {selectedCategory === "all" && group.category !== "favorites" && group.category !== "recent" && (
                  <div
                    className="sticky top-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide flex items-center gap-2"
                    style={{
                      backgroundColor: "var(--tv-panel, #1e222d)",
                      color: "var(--tv-text-muted, #787b86)",
                      borderBottom: "1px solid var(--tv-border, #363a45)",
                    }}
                  >
                    {CATEGORY_ICONS[group.category as IndicatorCategory]}
                    {CATEGORY_META[group.category as IndicatorCategory]?.label || group.category}
                  </div>
                )}

                {/* Indicator Items */}
                {group.indicators.map((manifest, itemIdx) => {
                  const globalIdx = flatIndex(groupIdx, itemIdx);
                  const isHighlighted = globalIdx === highlightedIndex;
                  const isFavorite = favorites.has(manifest.id);

                  return (
                    <button
                      key={manifest.id}
                      type="button"
                      onClick={() => handleAdd(manifest)}
                      onMouseEnter={() => setHighlightedIndex(globalIdx)}
                      className={`group/item w-full px-3 py-2.5 flex items-center gap-3 text-left transition ${
                        isHighlighted ? "bg-[var(--tv-blue,#2962ff)]/10" : "hover:bg-[var(--tv-bg-secondary,#2a2e39)]"
                      }`}
                      style={{
                        borderLeft: isHighlighted ? "2px solid var(--tv-blue, #2962ff)" : "2px solid transparent",
                      }}
                      data-indicator-item
                      data-testid={`indicators-modal-add-${manifest.id}`}
                    >
                      {/* Favorite Star */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(e, manifest.id)}
                        className="p-0.5 rounded hover:bg-white/10 transition flex-shrink-0"
                        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                        data-testid={`indicator-star-${manifest.id}`}
                      >
                        <Star
                          className="w-4 h-4"
                          fill={isFavorite ? "var(--tv-yellow, #FFEB3B)" : "none"}
                          style={{ color: isFavorite ? "var(--tv-yellow, #FFEB3B)" : "var(--tv-text-muted, #787b86)" }}
                        />
                      </button>

                      {/* Indicator Info */}
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

                      {/* Pane Policy Badge */}
                      <div
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          backgroundColor:
                            manifest.panePolicy === "overlay"
                              ? "var(--tv-blue, #2962ff)"
                              : "var(--tv-bg-secondary, #2a2e39)",
                          color: manifest.panePolicy === "overlay" ? "#fff" : "var(--tv-text-muted, #787b86)",
                        }}
                      >
                        {manifest.panePolicy === "overlay" ? "Overlay" : "Separate"}
                      </div>

                      {/* Add Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdd(manifest);
                        }}
                        className="p-1 rounded hover:bg-[var(--tv-blue,#2962ff)]/20 transition flex-shrink-0 opacity-0 group-hover/item:opacity-100"
                        aria-label="Add indicator"
                        data-testid={`indicator-add-btn-${manifest.id}`}
                      >
                        <Plus className="w-4 h-4" style={{ color: "var(--tv-blue, #2962ff)" }} />
                      </button>

                      {/* Help Icon */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenInfo(e, manifest)}
                        className="p-1 rounded hover:bg-white/10 transition flex-shrink-0"
                        aria-label="View indicator info"
                        data-testid={`indicator-info-${manifest.id}`}
                      >
                        <HelpCircle className="w-4 h-4" style={{ color: "var(--tv-text-muted, #787b86)" }} />
                      </button>
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
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--tv-bg-secondary,#2a2e39)]">?</kbd>
              info
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--tv-bg-secondary,#2a2e39)]">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel - Info */}
      {infoManifest && (
        <InfoPanel
          manifest={infoManifest}
          onClose={() => setInfoManifest(null)}
          onAdd={handleAdd}
          onSelectRelated={handleSelectRelated}
        />
      )}
    </div>
  );
}

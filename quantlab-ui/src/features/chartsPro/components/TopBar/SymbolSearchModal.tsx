/**
 * SymbolSearchModal.tsx
 * 
 * TradingView-style symbol search with:
 * - Theme-aware (light/dark mode)
 * - Category tabs (All, US Stocks, Swedish Stocks, Indices)
 * - Filter chips (Country, Type)
 * - Recent searches
 * - Keyboard navigation
 * - Rich metadata display
 * - Shows ALL symbols including disabled indices
 * 
 * Sprint: TV-48 (Symbol Search Enhancement)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Clock, TrendingUp, DollarSign, Globe, AlertCircle } from "lucide-react";
import { getDataClientConfig } from "../../runtime/dataClient";

// ============================================================================
// Types
// ============================================================================

export interface SymbolItem {
  code: string;
  name: string;
  exchange?: string;
  type?: "stock" | "index" | "etf" | "fund" | "crypto" | "forex";
  country?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface SymbolSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
  currentSymbol?: string;
}

type CategoryTab = "all" | "us" | "se" | "index" | "recent";
type FilterCountry = "all" | "US" | "SE";
type FilterType = "all" | "stock" | "index" | "etf";

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_RECENTS = "cp.recentSymbols";
const MAX_RECENTS = 10;

const CATEGORY_TABS: { id: CategoryTab; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "All", icon: <Search className="w-3.5 h-3.5" /> },
  { id: "us", label: "US Stocks", icon: <DollarSign className="w-3.5 h-3.5" /> },
  { id: "se", label: "Swedish", icon: <Globe className="w-3.5 h-3.5" /> },
  { id: "index", label: "Indices", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { id: "recent", label: "Recent", icon: <Clock className="w-3.5 h-3.5" /> },
];

// Index symbols that may not have data - show them but mark as disabled
const KNOWN_INDICES: SymbolItem[] = [
  { code: "^GSPC", name: "S&P 500", exchange: "INDEX", type: "index", country: "US", disabled: true, disabledReason: "Index data unavailable" },
  { code: "^NDX", name: "Nasdaq 100", exchange: "INDEX", type: "index", country: "US", disabled: true, disabledReason: "Index data unavailable" },
  { code: "^DJI", name: "Dow Jones Industrial", exchange: "INDEX", type: "index", country: "US", disabled: true, disabledReason: "Index data unavailable" },
  { code: "^OEX", name: "S&P 100", exchange: "INDEX", type: "index", country: "US", disabled: true, disabledReason: "Index data unavailable" },
  { code: "^OMXS30", name: "OMX Stockholm 30", exchange: "INDEX", type: "index", country: "SE", disabled: true, disabledReason: "Index data unavailable" },
  { code: "^OMXSPI", name: "OMX Stockholm PI", exchange: "INDEX", type: "index", country: "SE", disabled: true, disabledReason: "Index data unavailable" },
];

// Fallback suggestions when API is unavailable
const FALLBACK_SYMBOLS: SymbolItem[] = [
  { code: "AAPL.US", name: "Apple Inc.", exchange: "NASDAQ", type: "stock", country: "US" },
  { code: "MSFT.US", name: "Microsoft Corporation", exchange: "NASDAQ", type: "stock", country: "US" },
  { code: "GOOGL.US", name: "Alphabet Inc.", exchange: "NASDAQ", type: "stock", country: "US" },
  { code: "AMZN.US", name: "Amazon.com Inc.", exchange: "NASDAQ", type: "stock", country: "US" },
  { code: "NVDA.US", name: "NVIDIA Corporation", exchange: "NASDAQ", type: "stock", country: "US" },
  { code: "META.US", name: "Meta Platforms Inc.", exchange: "NASDAQ", type: "stock", country: "US" },
  { code: "ABB.ST", name: "ABB Ltd", exchange: "OMX", type: "stock", country: "SE" },
  { code: "VOLV-B.ST", name: "Volvo AB", exchange: "OMX", type: "stock", country: "SE" },
  { code: "ERIC-B.ST", name: "Ericsson AB", exchange: "OMX", type: "stock", country: "SE" },
  { code: "HM-B.ST", name: "H&M Hennes & Mauritz", exchange: "OMX", type: "stock", country: "SE" },
];

// ============================================================================
// Helpers
// ============================================================================

function inferSymbolMetadata(item: SymbolItem): SymbolItem {
  const code = item.code.toUpperCase();
  
  // Infer country/exchange from symbol suffix
  let country = item.country;
  let exchange = item.exchange;
  let type = item.type;
  
  if (code.endsWith(".US")) {
    country = country || "US";
    exchange = exchange || "NASDAQ";
    type = type || "stock";
  } else if (code.endsWith(".ST")) {
    country = country || "SE";
    exchange = exchange || "OMX";
    type = type || "stock";
  } else if (code.startsWith("^")) {
    type = "index";
    exchange = "INDEX";
    if (code.includes("OMX")) {
      country = "SE";
    } else {
      country = "US";
    }
  }
  
  return { ...item, country, exchange, type };
}

function getCountryFlag(country: string | undefined): string {
  switch (country?.toUpperCase()) {
    case "US": return "🇺🇸";
    case "SE": return "🇸🇪";
    case "GB": return "🇬🇧";
    case "DE": return "🇩🇪";
    case "FR": return "🇫🇷";
    case "JP": return "🇯🇵";
    default: return "🌍";
  }
}

function getRecentSymbols(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_RECENTS);
    if (!stored) return [];
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
}

function addRecentSymbol(symbol: string): void {
  if (typeof window === "undefined") return;
  try {
    const recents = getRecentSymbols().filter(s => s !== symbol);
    recents.unshift(symbol);
    const trimmed = recents.slice(0, MAX_RECENTS);
    localStorage.setItem(STORAGE_KEY_RECENTS, JSON.stringify(trimmed));
  } catch {
    // Ignore localStorage errors
  }
}

// ============================================================================
// Component
// ============================================================================

export function SymbolSearchModal({
  isOpen,
  onClose,
  onSelect,
  currentSymbol,
}: SymbolSearchModalProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const [filterCountry, setFilterCountry] = useState<FilterCountry>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightIndex, setHighlightIndex] = useState(0);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch symbols on mount
  useEffect(() => {
    if (!isOpen) return;
    
    const controller = new AbortController();
    setLoading(true);
    
    // Use the configured API base URL (handles dev/preview/prod)
    const { baseUrl } = getDataClientConfig();
    const apiUrl = `${baseUrl}/meta/symbols`;
    
    fetch(apiUrl, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`API error: ${res.status}`)))
      .then(data => {
        const items = (data.items || []) as SymbolItem[];
        const enriched = items.map(inferSymbolMetadata);
        
        // Add known indices that may be missing
        const existingCodes = new Set(enriched.map(s => s.code));
        const indicesToAdd = KNOWN_INDICES.filter(idx => !existingCodes.has(idx.code));
        const allSymbols = [...enriched, ...indicesToAdd];
        
        console.log("[SymbolSearchModal] Loaded", allSymbols.length, "symbols from API");
        setSymbols(allSymbols.length > 0 ? allSymbols : [...FALLBACK_SYMBOLS.map(inferSymbolMetadata), ...KNOWN_INDICES]);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("[SymbolSearchModal] API failed, using fallback:", err.message);
        setSymbols([...FALLBACK_SYMBOLS.map(inferSymbolMetadata), ...KNOWN_INDICES]);
        setLoading(false);
      });
    
    return () => controller.abort();
  }, [isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveTab("all");
      setFilterCountry("all");
      setFilterType("all");
      setHighlightIndex(0);
    }
  }, [isOpen]);

  // Filter symbols based on query, tab, and filters
  const filteredSymbols = useMemo(() => {
    const q = query.trim().toUpperCase();
    const recents = getRecentSymbols();
    
    let filtered: SymbolItem[];
    
    if (activeTab === "recent") {
      // Show only recent symbols
      filtered = recents
        .map(code => symbols.find(s => s.code === code) || { code, name: code })
        .map(inferSymbolMetadata);
    } else {
      // Filter by category tab
      filtered = symbols.filter(s => {
        if (activeTab === "us") return s.country === "US" && s.type !== "index";
        if (activeTab === "se") return s.country === "SE" && s.type !== "index";
        if (activeTab === "index") return s.type === "index";
        return true; // "all"
      });
      
      // Apply additional filters
      if (filterCountry !== "all") {
        filtered = filtered.filter(s => s.country === filterCountry);
      }
      if (filterType !== "all") {
        filtered = filtered.filter(s => s.type === filterType);
      }
    }
    
    // Filter by query
    if (q) {
      filtered = filtered.filter(s => 
        s.code.toUpperCase().includes(q) || 
        s.name.toUpperCase().includes(q)
      );
    }
    
    // Sort: exact matches first, enabled before disabled, then by code
    filtered.sort((a, b) => {
      // Exact matches first
      const aExact = a.code.toUpperCase() === q;
      const bExact = b.code.toUpperCase() === q;
      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;
      
      // Enabled before disabled
      if (a.disabled && !b.disabled) return 1;
      if (!a.disabled && b.disabled) return -1;
      
      return a.code.localeCompare(b.code);
    });
    
    // No artificial limit - show all results
    return filtered;
  }, [symbols, query, activeTab, filterCountry, filterType]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredSymbols.length, activeTab, query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector(`[data-index="${highlightIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const handleSelect = useCallback((symbol: SymbolItem) => {
    if (symbol.disabled) return; // Don't select disabled symbols
    addRecentSymbol(symbol.code);
    onSelect(symbol.code);
    onClose();
  }, [onSelect, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex(i => Math.min(i + 1, filteredSymbols.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredSymbols[highlightIndex] && !filteredSymbols[highlightIndex].disabled) {
          handleSelect(filteredSymbols[highlightIndex]);
        } else if (query.trim()) {
          onSelect(query.trim().toUpperCase());
          onClose();
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "Tab":
        e.preventDefault();
        // Cycle through tabs
        const currentIdx = CATEGORY_TABS.findIndex(t => t.id === activeTab);
        const nextIdx = (currentIdx + (e.shiftKey ? -1 : 1) + CATEGORY_TABS.length) % CATEGORY_TABS.length;
        setActiveTab(CATEGORY_TABS[nextIdx].id);
        break;
    }
  }, [filteredSymbols, highlightIndex, query, activeTab, handleSelect, onClose, onSelect]);

  if (!isOpen) return null;

  const symbolCount = symbols.filter(s => !s.disabled).length;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]
        bg-black/40 dark:bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="symbol-search-modal"
    >
      <div 
        className="w-full max-w-lg rounded-lg shadow-2xl
          bg-white dark:bg-slate-900 
          border border-gray-200 dark:border-slate-700"
        onKeyDown={handleKeyDown}
      >
        {/* Header with search input */}
        <div className="flex items-center gap-2 px-3 py-2.5
          border-b border-gray-200 dark:border-slate-700">
          <Search className="w-5 h-5 text-gray-400 dark:text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="Search symbol or company..."
            className="flex-1 bg-transparent text-sm outline-none
              text-gray-900 dark:text-white
              placeholder-gray-400 dark:placeholder-slate-500"
            data-testid="symbol-search-input"
          />
          <span 
            className="text-xs text-gray-400 dark:text-slate-500"
            data-testid="symbol-search-count"
          >
            {symbolCount} symbols
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 
              hover:bg-gray-100 dark:hover:bg-slate-800
              text-gray-400 dark:text-slate-400"
            data-testid="symbol-search-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto px-2 py-1.5
          border-b border-gray-200 dark:border-slate-700" 
          role="tablist"
        >
          {CATEGORY_TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 
                text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200"
              }`}
              data-testid={`symbol-tab-${tab.id}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter chips (visible when not on Recent tab) */}
        {activeTab !== "recent" && (
          <div className="flex flex-wrap gap-1.5 px-3 py-2
            border-b border-gray-100 dark:border-slate-800">
            {/* Country filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium uppercase text-gray-400 dark:text-slate-500 mr-1">
                Country
              </span>
              {(["all", "US", "SE"] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setFilterCountry(c)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    filterCountry === c
                      ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                      : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {c === "all" ? "All" : c === "US" ? "🇺🇸 US" : "🇸🇪 SE"}
                </button>
              ))}
            </div>
            
            <div className="w-px h-4 bg-gray-200 dark:bg-slate-700 mx-1" />
            
            {/* Type filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium uppercase text-gray-400 dark:text-slate-500 mr-1">
                Type
              </span>
              {(["all", "stock", "index", "etf"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    filterType === t
                      ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                      : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results list */}
        <div 
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto"
          data-testid="symbol-search-results"
        >
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-slate-400">
              Loading symbols...
            </div>
          ) : filteredSymbols.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-slate-400">
              {query ? `No results for "${query}"` : "No symbols available"}
            </div>
          ) : (
            filteredSymbols.map((symbol, idx) => (
              <button
                key={symbol.code}
                data-index={idx}
                onClick={() => handleSelect(symbol)}
                disabled={symbol.disabled}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors
                  ${symbol.disabled 
                    ? "opacity-50 cursor-not-allowed" 
                    : "cursor-pointer"
                  }
                  ${idx === highlightIndex && !symbol.disabled
                    ? "bg-blue-50 dark:bg-blue-600/20"
                    : symbol.disabled 
                      ? "bg-gray-50 dark:bg-slate-900"
                      : "hover:bg-gray-50 dark:hover:bg-slate-800"
                  } 
                  ${symbol.code === currentSymbol 
                    ? "border-l-2 border-blue-500" 
                    : ""
                  }`}
                data-testid={`symbol-result-${symbol.code}`}
              >
                {/* Country flag */}
                <span className="text-base">{getCountryFlag(symbol.country)}</span>
                
                {/* Symbol info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-medium 
                      ${symbol.disabled 
                        ? "text-gray-400 dark:text-slate-500" 
                        : "text-gray-900 dark:text-white"
                      }`}>
                      {symbol.code}
                    </span>
                    
                    {/* Type badges */}
                    {symbol.type === "index" && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium
                        ${symbol.disabled 
                          ? "bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400"
                          : "bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-400"
                        }`}>
                        INDEX
                      </span>
                    )}
                    {symbol.type === "etf" && (
                      <span className="rounded bg-purple-100 dark:bg-purple-600/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-400">
                        ETF
                      </span>
                    )}
                    
                    {/* Disabled indicator */}
                    {symbol.disabled && (
                      <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500">
                        <AlertCircle className="w-3 h-3" />
                        {symbol.disabledReason || "No data"}
                      </span>
                    )}
                  </div>
                  <div className={`truncate text-xs 
                    ${symbol.disabled 
                      ? "text-gray-400 dark:text-slate-500" 
                      : "text-gray-500 dark:text-slate-400"
                    }`}>
                    {symbol.name}
                  </div>
                </div>
                
                {/* Exchange badge */}
                <span className={`text-xs 
                  ${symbol.disabled 
                    ? "text-gray-300 dark:text-slate-600" 
                    : "text-gray-400 dark:text-slate-500"
                  }`}>
                  {symbol.exchange}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between px-3 py-2 text-[10px]
          border-t border-gray-200 dark:border-slate-700
          text-gray-400 dark:text-slate-500">
          <div className="flex gap-3">
            <span><kbd className="rounded px-1 bg-gray-100 dark:bg-slate-800">↑↓</kbd> Navigate</span>
            <span><kbd className="rounded px-1 bg-gray-100 dark:bg-slate-800">Enter</kbd> Select</span>
            <span><kbd className="rounded px-1 bg-gray-100 dark:bg-slate-800">Tab</kbd> Switch tab</span>
          </div>
          <span><kbd className="rounded px-1 bg-gray-100 dark:bg-slate-800">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

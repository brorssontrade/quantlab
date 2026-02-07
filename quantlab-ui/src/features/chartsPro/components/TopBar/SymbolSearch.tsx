import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SymbolSearchModal } from "./SymbolSearchModal";

type SymbolItem = { code: string; name: string };
const DEFAULT_SUGGESTIONS: SymbolItem[] = [
  { code: "AAPL.US", name: "Apple" },
  { code: "MSFT.US", name: "Microsoft" },
  { code: "META.US", name: "Meta" },
  { code: "NVDA.US", name: "NVIDIA" },
  { code: "ABB.ST", name: "ABB" },
  { code: "IBM.US", name: "IBM" },
];

interface SymbolSearchProps {
  value: string;
  onChange: (value: string) => void;
}

const STORAGE_KEY = "cp.lastSymbol";

export function SymbolSearch({ value, onChange }: SymbolSearchProps) {
  const [query, setQuery] = useState<string>(() => {
    // On mount: check localStorage, fallback to prop value
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored || value;
    }
    return value;
  });
  const [items, setItems] = useState<SymbolItem[]>([]);
  const [open, setOpen] = useState<boolean>(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sync query when value prop changes (e.g., on init, reload, or external state change)
  // Only update when dropdown is closed to avoid disrupting user input
  useEffect(() => {
    if (!open && !modalOpen) {
      setQuery(value);
    }
  }, [value, open, modalOpen]);

  // Fetch symbols when dropdown opens (first time), abortable.
  useEffect(() => {
    if (!open || items.length > 0) return;
    const isMock = typeof window !== "undefined" && window.location.search.includes("mock=1");
    if (isMock) setItems(DEFAULT_SUGGESTIONS);
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const currentRequestId = ++requestIdRef.current;
    fetch("/meta/symbols", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed meta/symbols"))))
      .then((json) => {
        if (requestIdRef.current !== currentRequestId) return; // Ignore stale response
        const arr: SymbolItem[] = Array.isArray(json?.items) ? json.items : [];
        if (arr.length) setItems(arr);
      })
      .catch(() => {
        // ignore; mock fallback already applied
      });
    return () => abortRef.current?.abort();
  }, [open, items.length]);

  const isMock = typeof window !== "undefined" && window.location.search.includes("mock=1");
  const suggestions = useMemo(() => {
    const q = (query || "").trim().toUpperCase();
    if (!q) return [] as SymbolItem[];
    const effective = items.length ? items : (isMock ? DEFAULT_SUGGESTIONS : []);
    return effective
      .filter((it) => it.code.toUpperCase().includes(q) || it.name.toUpperCase().includes(q))
      .slice(0, 8);
  }, [items, query, isMock]);

  // Clamp highlight if suggestions shrink, but don't auto-highlight when they appear
  useEffect(() => {
    if (highlight >= suggestions.length && suggestions.length > 0) {
      setHighlight(suggestions.length - 1);
    }
  }, [suggestions.length, highlight]);

  function commitSelect(code: string) {
    const normalized = code.trim().toUpperCase();
    setQuery(normalized);
    setOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, normalized);
    }
    onChange(normalized);
  }

  const handleModalSelect = useCallback((symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    setQuery(normalized);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, normalized);
    }
    onChange(normalized);
  }, [onChange]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Ctrl/Cmd+K opens the full modal
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setModalOpen(true);
      setOpen(false);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && suggestions[highlight]) {
        commitSelect(suggestions[highlight].code);
      } else {
        commitSelect(query);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    // Close dropdown when clicking outside; keep it if focusing within container
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !containerRef.current?.contains(related)) {
      setOpen(false);
    }
  }

  return (
    <>
      <div className="relative" ref={containerRef}>
        <Label htmlFor="charts-pro-symbol" className="hidden text-xs uppercase tracking-wide text-slate-500 sm:inline">
          Symbol
        </Label>
        <div className="relative">
          <Input
            id="charts-pro-symbol"
            value={query}
            onChange={(e) => { setQuery(e.target.value.toUpperCase()); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            placeholder="AAPL.US"
            className="w-28 sm:w-32 uppercase pr-6"
            data-testid="topbar-symbol-input"
            role="combobox"
            aria-expanded={open}
            aria-controls="symbol-dropdown"
            aria-activedescendant={open && suggestions[highlight] ? `symbol-option-${suggestions[highlight].code}` : undefined}
          />
          {/* Search icon button to open modal */}
          <button
            type="button"
            onClick={() => { setModalOpen(true); setOpen(false); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            title="Advanced search (Ctrl+K)"
            data-testid="symbol-search-expand"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
        {open && (
          <div
            id="symbol-dropdown"
            className="absolute z-50 left-0 top-full mt-1 w-48 max-w-xs rounded border border-slate-700/30 bg-slate-900/95 shadow"
            role="listbox"
            data-testid="symbol-dropdown"
          >
            {items.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-slate-400">Loading…</div>
            ) : suggestions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-slate-400">No matches</div>
            ) : (
              suggestions.map((it, idx) => (
                <button
                  key={it.code}
                  id={`symbol-option-${it.code}`}
                  type="button"
                  role="option"
                  aria-selected={idx === highlight}
                  onMouseDown={(e) => { e.preventDefault(); commitSelect(it.code); }}
                  className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-sm ${idx === highlight ? "bg-slate-800" : "bg-transparent"}`}
                  data-testid={`symbol-option-${it.code}`}
                >
                  <span className="font-mono">{it.code}</span>
                  <span className="ml-2 text-xs text-slate-400">{it.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      
      {/* TradingView-style full search modal */}
      <SymbolSearchModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModalSelect}
        currentSymbol={value}
      />
    </>
  );
}

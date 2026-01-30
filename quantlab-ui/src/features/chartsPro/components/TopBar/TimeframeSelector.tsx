/**
 * TimeframeSelector.tsx
 * TV-11: TradingView-style timeframe dropdown
 *
 * - Renders in TopBar PrimaryControls
 * - Shows current timeframe as label
 * - Dropdown with keyboard nav (ArrowUp/Down/Enter/Esc)
 * - Click-outside closes
 * - Persistence: localStorage cp.layout.timeframe (stored in ChartsProTab)
 * - Exposes dump().ui.timeframe
 */

import { useRef, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "2H", "4h", "1D", "1W"];
const DEFAULT_TIMEFRAME = "1D";

/**
 * TV-37.3: Timeframes that are production-ready.
 * PRIO 4: Extended to support range→timeframe auto-mapping.
 * Note: Intraday timeframes (1m, 5m) require intraday data subscription.
 */
const READY_TIMEFRAMES = new Set(["1m", "5m", "15m", "30m", "1h", "2H", "4h", "1D", "1W"]);

function getTimeframeTooltip(tf: string): string {
  if (READY_TIMEFRAMES.has(tf)) {
    return `Timeframe: ${tf}`;
  }
  return `${tf}: Coming soon (requires intraday data)`;
}

interface TimeframeSelectorProps {
  timeframe: string;
  onChange: (timeframe: string) => void;
}

export function TimeframeSelector({
  timeframe,
  onChange,
}: TimeframeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(timeframe);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Sync highlight when dropdown opens (avoid stale highlight from persistence/prop changes)
  useEffect(() => {
    if (isOpen) {
      setHighlighted(timeframe);
    }
  }, [isOpen, timeframe]);

  // Close on Esc
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard nav
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      const currentIndex = TIMEFRAMES.indexOf(highlighted);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % TIMEFRAMES.length;
        setHighlighted(TIMEFRAMES[nextIndex]);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prevIndex = (currentIndex - 1 + TIMEFRAMES.length) % TIMEFRAMES.length;
        setHighlighted(TIMEFRAMES[prevIndex]);
      } else if (event.key === "Enter") {
        event.preventDefault();
        onChange(highlighted);
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeydown);
      return () => document.removeEventListener("keydown", handleKeydown);
    }
  }, [isOpen, highlighted, onChange]);

  return (
    <div className="relative">
      {/* Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 rounded border border-[var(--cp-panel-border)] bg-[var(--cp-panel-bg)] text-[var(--cp-panel-text)] text-sm font-medium hover:bg-[var(--cp-panel-hover-bg)] flex items-center gap-1"
        data-testid="timeframe-button"
        title={getTimeframeTooltip(timeframe)}
      >
        <span>{timeframe}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--cp-panel-text-muted)]" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 mt-1 z-50 w-40 rounded border border-[var(--cp-panel-border)] bg-[var(--cp-panel-bg)] shadow-lg p-1"
          data-testid="timeframe-dropdown"
        >
          {TIMEFRAMES.map((tf) => {
            const isReady = READY_TIMEFRAMES.has(tf);
            const isHighlighted = tf === highlighted;
            return (
              <div
                key={tf}
                onClick={() => {
                  if (!isReady) return; // Don't allow selection of non-ready timeframes
                  onChange(tf);
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlighted(tf)}
                className={`px-3 py-2 rounded text-sm ${
                  !isReady
                    ? "cursor-not-allowed opacity-50"
                    : isHighlighted
                      ? "bg-[var(--cp-panel-hover-bg)] text-[var(--cp-panel-text)] cursor-pointer"
                      : "text-[var(--cp-panel-text)] hover:bg-[var(--cp-panel-hover-bg)] cursor-pointer"
                }`}
                data-testid={`timeframe-item-${tf}`}
                aria-selected={isHighlighted}
                aria-disabled={!isReady}
                role="option"
                title={getTimeframeTooltip(tf)}
              >
                <span className="flex items-center justify-between">
                  <span>{tf}</span>
                  {!isReady && (
                    <span className="text-xs text-[var(--cp-text-muted)] ml-2">Soon</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

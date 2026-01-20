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

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
const DEFAULT_TIMEFRAME = "1D";

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
        title={`Timeframe: ${timeframe}`}
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
          {TIMEFRAMES.map((tf) => (
            <div
              key={tf}
              onClick={() => {
                onChange(tf);
                setIsOpen(false);
              }}
              onMouseEnter={() => setHighlighted(tf)}
              className={`px-3 py-2 rounded text-sm cursor-pointer ${
                tf === highlighted
                  ? "bg-[var(--cp-panel-hover-bg)] text-[var(--cp-panel-text)]"
                  : "text-[var(--cp-panel-text)] hover:bg-[var(--cp-panel-hover-bg)]"
              }`}
              data-testid={`timeframe-item-${tf}`}
              aria-selected={tf === highlighted}
              role="option"
            >
              {tf}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ChartTypeSelector.tsx
 * TV-10.1: Chart Type dropdown (Candles/Bars/Line/Area)
 *
 * TradingView-style chart type switcher:
 * - Dropdown with icon + label
 * - Core types: Candles (default), Bars, Hollow Candles, Heikin Ashi, Renko, Line, Area
 * - Persists to localStorage: cp.chart.type
 * - Exposes in dump().ui.chartType
 */

import { useState, useRef, useEffect } from "react";
import { BarChart3, CandlestickChart, TrendingUp, AreaChart, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type UIChartType } from "../../runtime/seriesFactory";

// Re-export for backwards compatibility
export type ChartType = UIChartType;

interface ChartTypeSelectorProps {
  value: ChartType;
  onChange: (type: ChartType) => void;
}

const CHART_TYPES: Array<{ value: ChartType; label: string; icon: React.ElementType }> = [
  { value: "candles", label: "Candles", icon: CandlestickChart },
  { value: "bars", label: "Bars", icon: BarChart3 },
  { value: "hollowCandles", label: "Hollow Candles", icon: CandlestickChart },
  { value: "heikinAshi", label: "Heikin Ashi", icon: CandlestickChart },
  { value: "renko", label: "Renko", icon: Boxes },
  { value: "line", label: "Line", icon: TrendingUp },
  { value: "area", label: "Area", icon: AreaChart },
];

export function ChartTypeSelector({ value, onChange }: ChartTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedType = CHART_TYPES.find((t) => t.value === value) || CHART_TYPES[0];
  const Icon = selectedType.icon;

  // Close dropdown when clicking outside or pressing Esc
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen]);

  const handleSelect = (type: ChartType) => {
    onChange(type);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef} data-testid="chart-type-selector">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 px-2 text-xs gap-1.5"
        data-testid="chart-type-button"
        title={`Chart Type: ${selectedType.label}`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{selectedType.label}</span>
      </Button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-md border border-slate-700 bg-slate-900 shadow-lg"
          data-testid="chart-type-dropdown"
        >
          {CHART_TYPES.map((type) => {
            const TypeIcon = type.icon;
            const isSelected = type.value === value;

            return (
              <button
                key={type.value}
                onClick={() => handleSelect(type.value)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                  hover:bg-slate-800 transition-colors
                  ${isSelected ? "bg-slate-800/50 text-purple-400" : "text-slate-300"}
                `}
                data-testid={`chart-type-option-${type.value}`}
              >
                <TypeIcon className="h-4 w-4" />
                <span>{type.label}</span>
                {isSelected && (
                  <span className="ml-auto text-purple-400 text-xs">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

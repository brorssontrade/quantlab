/**
 * ChartTypeMenu.tsx
 *
 * Sprint TV-3 Steg 1C: Chart Type Switcher
 *
 * TradingView-style dropdown menu for selecting chart type.
 * Supports: Bars, Candles, Hollow candles, Heikin Ashi, Line, Line with markers, Step line, Area, Baseline, Columns
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  BarChart2,
  BarChart3,
  CandlestickChart,
  ChartLine,
  Clock3,
  Columns,
  LineChart,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { ChartType } from '../runtime/seriesFactory';

type MenuItemKey =
  | ChartType
  | 'volumeCandles'
  | 'hlcArea'
  | 'highLow'
  | 'renko'
  | 'kagi'
  | 'pointFigure'
  | 'volumeProfile'
  | 'tpo';

interface MenuItem {
  key: MenuItemKey;
  label: string;
  icon: LucideIcon;
  type?: ChartType;
  disabled?: boolean;
  note?: string;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'Candles & Bars',
    items: [
      { key: 'bars', type: 'bars', label: 'Bars', icon: BarChart2 },
      { key: 'candles', type: 'candles', label: 'Candles', icon: CandlestickChart },
      { key: 'hollowCandles', type: 'hollowCandles', label: 'Hollow Candles', icon: CandlestickChart },
      { key: 'heikinAshi', type: 'heikinAshi', label: 'Heikin Ashi', icon: CandlestickChart },
    ],
  },
  {
    title: 'Line & Area',
    items: [
      { key: 'line', type: 'line', label: 'Line', icon: LineChart },
      { key: 'lineWithMarkers', type: 'lineWithMarkers', label: 'Line with Markers', icon: ChartLine },
      { key: 'stepLine', type: 'stepLine', label: 'Step Line', icon: Waves },
      { key: 'area', type: 'area', label: 'Area', icon: Activity },
      { key: 'baseline', type: 'baseline', label: 'Baseline', icon: BarChart3 },
    ],
  },
  {
    title: 'Columns & Histograms',
    items: [
      { key: 'columns', type: 'columns', label: 'Columns', icon: Columns },
    ],
  },
  {
    title: 'Coming Soon',
    items: [
      { key: 'volumeCandles', label: 'Volume Candles', icon: Clock3, disabled: true, note: 'Coming soon' },
      { key: 'hlcArea', label: 'HLC Area', icon: Clock3, disabled: true, note: 'Coming soon' },
      { key: 'highLow', label: 'High-Low', icon: Clock3, disabled: true, note: 'Coming soon' },
      { key: 'renko', label: 'Renko', icon: Clock3, disabled: true, note: 'Coming soon' },
      { key: 'kagi', label: 'Kagi', icon: Clock3, disabled: true, note: 'Coming soon' },
      { key: 'pointFigure', label: 'Point & Figure', icon: Clock3, disabled: true, note: 'Coming soon' },
      { key: 'tpo', label: 'TPO Profile', icon: Clock3, disabled: true, note: 'Coming soon' },
      { key: 'volumeProfile', label: 'Volume Profile', icon: Clock3, disabled: true, note: 'Coming soon' },
    ],
  },
];

interface ChartTypeMenuProps {
  currentType: ChartType;
  onTypeChange: (type: ChartType) => void;
}

export function ChartTypeMenu({ currentType, onTypeChange }: ChartTypeMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const flatItems = MENU_GROUPS.flatMap((g) => g.items).filter((item) => !!item.type);
  const currentOption = flatItems.find((opt) => opt.type === currentType);
  const CurrentIcon = currentOption?.icon ?? CandlestickChart;

  const handleSelect = (type: ChartType) => {
    onTypeChange(type);
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative" data-testid="chart-type-menu">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="chart-type-trigger"
        className="flex items-center gap-2 rounded border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700/50 transition-colors"
        title={`Chart Type: ${currentOption?.label ?? 'Candles'}`}
      >
        <CurrentIcon size={16} className="text-slate-400" />
        <span>{currentOption?.label ?? 'Candles'}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="text-slate-400"
        >
          <path
            d="M3 5L6 8L9 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          data-testid="chart-type-dropdown"
          className="absolute top-full left-0 mt-1 min-w-[220px] rounded-md border border-slate-700/70 bg-slate-900/95 shadow-lg z-50 backdrop-blur-sm"
        >
          <div className="py-1 max-h-[420px] overflow-y-auto">
            {MENU_GROUPS.map((group, groupIdx) => (
              <div key={group.title} className="px-2 py-1">
                <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-slate-500">{group.title}</div>
                {group.items.map((option) => {
                  const Icon = option.icon;
                  const isActive = option.type === currentType && !option.disabled;
                  const isDisabled = Boolean(option.disabled || !option.type);
                  const testId = isDisabled 
                    ? `charttype-item-disabled-${option.key}` 
                    : `charttype-item-${option.key}`;
                  
                  return (
                    <div
                      key={option.key}
                      title={isDisabled ? option.note || 'Coming soon' : undefined}
                      className="group relative"
                    >
                      <button
                        type="button"
                        data-testid={testId}
                        onClick={() => {
                          if (option.type && !isDisabled) handleSelect(option.type);
                        }}
                        disabled={isDisabled}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors rounded
                          ${isDisabled ? 'cursor-not-allowed text-slate-500 opacity-60' : 'text-slate-200 hover:bg-slate-800/50'}
                          ${isActive ? 'bg-blue-600/20 text-blue-400' : ''}
                        `}
                      >
                        <Icon size={16} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
                        <span className="flex-1 truncate">{option.label}</span>
                        {option.note ? (
                          <span className="text-[11px] text-slate-500">{option.note}</span>
                        ) : null}
                        {isActive && (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            className="text-blue-400"
                          >
                            <path
                              d="M13 4L6 11L3 8"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
                {groupIdx < MENU_GROUPS.length - 1 ? (
                  <div className="my-2 h-px bg-slate-800/80" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

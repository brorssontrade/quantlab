/**
 * TVCompactHeader.tsx
 * 
 * TradingView-style compact single-row header (48-52px)
 * 
 * Layout (TradingView Supercharts parity):
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ [Symbol] [TF▼] [Type▼] [⚙] │ [Compare/Overlay controls] │ [fx] [🔔] [📐] [⋮] │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 * 
 * - Left: Symbol chip, Timeframe dropdown, ChartType dropdown, Settings gear
 * - Center: Compare/Overlay/Inspector controls (scrollable, flex-1 min-w-0)
 * - Right: Panel toggles (fx/alerts/objects), Theme, Utils menu
 * 
 * PRIO 2: TopControls section added - Compare/Overlay moved from ChartViewport toolbar
 * 
 * Target dimensions:
 * - Height: 48-52px (strict)
 * - Button height: 28-32px
 * - Icon size: 16-18px
 * - Padding: 8px horizontal
 * - Gap: 4-8px between items
 */

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Settings,
  Bell,
  Ruler,
  Sun,
  Moon,
  MoreVertical,
  RefreshCw,
  Download,
  FileImage,
  Layout,
  Magnet,
  Grid3X3,
  ChevronDown,
  Loader2,
  Layers,
  Plus,
  X,
  Eye,
  EyeOff,
  PanelRightOpen,
} from "lucide-react";
import type { ChartThemeName, ChartMeta, Tf } from "../../types";
import type { ChartTimeframe } from "../../state/controls";
import type { ChartType } from "./ChartTypeSelector";
import { TV_LAYOUT } from "../TVLayoutShell";
import { useToolbarStore, type CompareItem, type CompareMode, type OverlayState, type CompareScaleMode } from "../../state/toolbar";
import { colorFor } from "../../state/compare";
import { TIMEFRAME_OPTIONS } from "../../state/controls";

// ========== TYPES ==========
type ApiStatus = "online" | "offline" | "checking";
type DataMode = "live" | "mock";

interface TVCompactHeaderProps {
  // Primary controls
  symbol: string;
  onSymbolChange: (value: string) => void;
  timeframe: ChartTimeframe;
  onTimeframeChange: (value: ChartTimeframe) => void;
  chartType: ChartType;
  onChartTypeChange: (value: ChartType) => void;
  
  // Settings
  onSettingsClick?: () => void;
  onRenkoSettingsClick?: () => void;
  
  // Panel toggles
  onIndicatorsClick?: () => void;
  onAlertsClick?: () => void;
  onObjectsClick?: () => void;
  
  // Theme
  theme: ChartThemeName;
  onThemeChange: (value: ChartThemeName) => void;
  
  // Utilities
  magnetEnabled?: boolean;
  onMagnetToggle?: () => void;
  snapEnabled?: boolean;
  onSnapToggle?: () => void;
  onSaveLayout?: () => void;
  onLoadLayout?: () => void;
  onExportPng?: () => void;
  onExportCsv?: () => void;
  
  // State
  loading?: boolean;
  onReload?: () => void;
  meta?: ChartMeta | null;
  
  // API Status (PRIO 1: integrated into header)
  apiStatus?: ApiStatus;
  dataMode?: DataMode;
  onDataModeChange?: (mode: DataMode) => void;
  onInfoClick?: () => void;
  
  // PRIO 2: TopControls (Compare/Overlay/Inspector) in header
  // When true, renders Compare/Overlay controls in the center section
  showTopControls?: boolean;
}

// ========== CONSTANTS ==========
// PRIO 4: Extended timeframes to support range→timeframe mapping
const READY_TIMEFRAMES: ChartTimeframe[] = ["1m", "5m", "15m", "30m", "1h", "2H", "4h", "1D", "1W"];
const ALL_TIMEFRAMES: ChartTimeframe[] = ["1m", "5m", "15m", "30m", "1h", "2H", "4h", "1D", "1W"];

// ========== COMPACT API STATUS (fits in 26px height) ==========
interface CompactApiStatusProps {
  apiStatus: ApiStatus;
  dataMode: DataMode;
  onDataModeChange?: (mode: DataMode) => void;
}

const CompactApiStatus = memo(function CompactApiStatus({
  apiStatus,
  dataMode,
  onDataModeChange,
}: CompactApiStatusProps) {
  const isOnline = apiStatus === "online";
  const isChecking = apiStatus === "checking";
  
  return (
    <div className="flex items-center gap-1" data-testid="tv-api-status">
      {/* Status dot */}
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          isChecking ? "bg-[#787b86] animate-pulse" :
          isOnline ? "bg-[#089981]" : "bg-[#f23645]"
        }`}
        title={isChecking ? "Checking..." : isOnline ? "API Online" : "API Offline"}
      />
      
      {/* Mode toggle - only show if online */}
      {isOnline && onDataModeChange ? (
        <div className="flex items-center rounded-sm overflow-hidden border border-[#363a45]">
          <button
            type="button"
            onClick={() => onDataModeChange("live")}
            className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              dataMode === "live" 
                ? "bg-[#089981]/20 text-[#089981]" 
                : "text-[#787b86] hover:text-[#d1d4dc]"
            }`}
            title="Live data"
          >
            LIVE
          </button>
          <button
            type="button"
            onClick={() => onDataModeChange("mock")}
            className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              dataMode === "mock" 
                ? "bg-[#f7a600]/20 text-[#f7a600]" 
                : "text-[#787b86] hover:text-[#d1d4dc]"
            }`}
            title="Mock data"
          >
            MOCK
          </button>
        </div>
      ) : (
        <span className={`text-[10px] font-medium ${
          isChecking ? "text-[#787b86]" :
          isOnline ? "text-[#089981]" : "text-[#f23645]"
        }`}>
          {isChecking ? "..." : isOnline ? "ON" : "OFF"}
        </span>
      )}
    </div>
  );
});

const CHART_TYPES: { value: ChartType; label: string; icon: string }[] = [
  { value: "candles", label: "Candles", icon: "🕯️" },
  { value: "line", label: "Line", icon: "📈" },
  { value: "area", label: "Area", icon: "📊" },
  { value: "bars", label: "Bars", icon: "📊" },
  { value: "heikinAshi", label: "Heikin Ashi", icon: "🔶" },
  { value: "renko", label: "Renko", icon: "🧱" },
];

const TF_LABELS: Record<ChartTimeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2H": "2H",
  "4h": "4H",
  "1D": "1D",
  "1W": "1W",
};

// ========== COMPACT BUTTON COMPONENT ==========
interface CompactButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  "data-testid"?: string;
}

const CompactButton = memo(function CompactButton({
  children,
  onClick,
  active,
  disabled,
  title,
  className = "",
  "data-testid": testId,
}: CompactButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`
        inline-flex items-center justify-center
        h-[26px] min-w-[26px] px-1.5
        rounded-sm
        text-[11px] font-medium
        transition-colors duration-75
        ${active 
          ? "bg-[#2962ff]/15 text-[#2962ff]" 
          : "bg-transparent text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
        }
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
    >
      {children}
    </button>
  );
});

// ========== PORTAL DROPDOWN COMPONENT ==========
// Renders dropdown menu in a portal to avoid clipping by parent overflow:hidden
interface SimpleDropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  "data-testid"?: string;
}

function SimpleDropdown({ trigger, children, align = "start", "data-testid": testId }: SimpleDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, ready: false });

  // Calculate menu position based on trigger element
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4, // 4px gap below trigger
      left: align === "end" ? rect.right : rect.left,
      ready: true,
    });
  }, [align]);

  // Handle toggle - calculate position immediately when opening
  const handleToggle = useCallback(() => {
    if (!open && triggerRef.current) {
      // Pre-calculate position before opening
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: align === "end" ? rect.right : rect.left,
        ready: true,
      });
    }
    setOpen(!open);
  }, [open, align]);

  // Update position on scroll/resize while open
  useEffect(() => {
    if (open) {
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      // Use setTimeout to avoid closing immediately on the same click that opened
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open]);

  const menuContent = open && menuPos.ready ? (
    <div
      ref={menuRef}
      data-testid={testId ? `${testId}-menu` : undefined}
      className="
        fixed z-[3000]
        min-w-[140px] py-1
        bg-[#1e222d] border border-[#363a45] rounded-sm shadow-xl
      "
      style={{
        top: menuPos.top,
        // Fixed: Use direct left position instead of 100vw calc (avoids overflow)
        left: align === "end" ? undefined : menuPos.left,
        right: align === "end" ? (window.innerWidth - menuPos.left) : undefined,
      }}
      onClick={() => setOpen(false)}
    >
      {children}
    </div>
  ) : null;

  return (
    <>
      <div 
        ref={triggerRef} 
        className="relative" 
        data-testid={testId}
        onClick={handleToggle}
      >
        {trigger}
      </div>
      {menuContent && createPortal(menuContent, document.body)}
    </>
  );
}

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  "data-testid"?: string;
}

function DropdownItem({ children, onClick, disabled, active, "data-testid": testId }: DropdownItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-testid={testId}
      className={`
        w-full px-3 py-1 text-left text-[11px]
        transition-colors
        ${active ? "bg-[#2962ff]/15 text-[#2962ff]" : "text-[#d1d4dc]"}
        ${disabled ? "text-[#787b86]/50 cursor-not-allowed" : "hover:bg-[#2a2e39]"}
      `}
    >
      {children}
    </button>
  );
}

function DropdownSeparator() {
  return <div className="h-px bg-[#363a45] my-1" />;
}

// ========== SYMBOL CHIP ==========
interface SymbolChipProps {
  symbol: string;
  onSymbolChange: (value: string) => void;
  loading?: boolean;
}

const SymbolChip = memo(function SymbolChip({ symbol, onSymbolChange, loading }: SymbolChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(symbol);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSubmit = () => {
    const cleaned = draft.trim().toUpperCase();
    if (cleaned && cleaned !== symbol) {
      onSymbolChange(cleaned);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") {
            setDraft(symbol);
            setEditing(false);
          }
        }}
        className="
          h-7 w-24 px-2
          bg-[#2a2e39] text-white text-sm font-semibold
          border border-[#363a45] rounded-sm
          outline-none focus:border-[#2962ff]
        "
        data-testid="topbar-symbol-input"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(symbol);
        setEditing(true);
      }}
      className="
        inline-flex items-center gap-1
        h-[26px] px-1.5
        bg-transparent text-[#d1d4dc] text-[12px] font-semibold
        rounded-sm hover:bg-[#2a2e39]
        transition-colors
      "
      data-testid="tv-symbol-chip"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin text-[#787b86]" />
      ) : null}
      {symbol}
    </button>
  );
});

// ========== TIMEFRAME DROPDOWN ==========
interface TimeframeDropdownProps {
  value: ChartTimeframe;
  onChange: (value: ChartTimeframe) => void;
}

const TimeframeDropdown = memo(function TimeframeDropdown({ value, onChange }: TimeframeDropdownProps) {
  return (
    <SimpleDropdown
      data-testid="timeframe-dropdown"
      trigger={
        <button
          className="
            inline-flex items-center gap-0.5
            h-[26px] px-1.5
            bg-transparent text-[#787b86] text-[11px] font-medium
            rounded-sm hover:bg-[#2a2e39] hover:text-[#d1d4dc]
            transition-colors
          "
          data-testid="timeframe-button"
        >
          {TF_LABELS[value]}
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>
      }
    >
      {ALL_TIMEFRAMES.map((tf) => {
        const isReady = READY_TIMEFRAMES.includes(tf);
        return (
          <DropdownItem
            key={tf}
            onClick={() => isReady && onChange(tf)}
            disabled={!isReady}
            active={tf === value}
            data-testid={`timeframe-item-${tf}`}
          >
            <span className="flex items-center justify-between w-full">
              {TF_LABELS[tf]}
              {!isReady && <span className="text-[9px] text-[#787b86]/60">Soon</span>}
            </span>
          </DropdownItem>
        );
      })}
    </SimpleDropdown>
  );
});

// ========== CHART TYPE DROPDOWN ==========
interface ChartTypeDropdownProps {
  value: ChartType;
  onChange: (value: ChartType) => void;
  onRenkoSettingsClick?: () => void;
}

const ChartTypeDropdown = memo(function ChartTypeDropdown({ 
  value, 
  onChange,
  onRenkoSettingsClick: _onRenkoSettingsClick, // Reserved for future Renko gear icon
}: ChartTypeDropdownProps) {
  const current = CHART_TYPES.find(t => t.value === value) ?? CHART_TYPES[0];
  
  return (
    <SimpleDropdown
      data-testid="charttype-dropdown"
      trigger={
        <button
          className="
            inline-flex items-center gap-0.5
            h-[26px] px-1.5
            bg-transparent text-[#787b86] text-[11px] font-medium
            rounded-sm hover:bg-[#2a2e39] hover:text-[#d1d4dc]
            transition-colors
          "
          data-testid="chart-type-button"
        >
          <span className="text-[13px]">{current.icon}</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>
      }
    >
      {CHART_TYPES.map((type) => (
        <DropdownItem
          key={type.value}
          onClick={() => onChange(type.value)}
          active={type.value === value}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-[12px]">{type.icon}</span>
            {type.label}
          </span>
        </DropdownItem>
      ))}
    </SimpleDropdown>
  );
});

// ========== UTILS MENU (More options) ==========
interface UtilsMenuProps {
  magnetEnabled?: boolean;
  onMagnetToggle?: () => void;
  snapEnabled?: boolean;
  onSnapToggle?: () => void;
  onSaveLayout?: () => void;
  onLoadLayout?: () => void;
  onExportPng?: () => void;
  onExportCsv?: () => void;
  onReload?: () => void;
}

const UtilsMenu = memo(function UtilsMenu({
  magnetEnabled,
  onMagnetToggle,
  snapEnabled,
  onSnapToggle,
  onSaveLayout,
  onLoadLayout,
  onExportPng,
  onExportCsv,
  onReload,
}: UtilsMenuProps) {
  return (
    <SimpleDropdown
      align="end"
      data-testid="utils-menu"
      trigger={
        <button
          className="
            inline-flex items-center justify-center
            w-7 h-7
            bg-transparent text-[#787b86]
            rounded hover:bg-[#2a2e39] hover:text-white
            transition-colors
          "
          data-testid="utils-menu-button"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      }
    >
      <DropdownItem onClick={onMagnetToggle} data-testid="utils-magnet-btn">
        <span className="flex items-center gap-2">
          <Magnet className={`w-4 h-4 ${magnetEnabled ? "text-[#2962ff]" : ""}`} />
          Magnet {magnetEnabled ? "On" : "Off"}
        </span>
      </DropdownItem>
      <DropdownItem onClick={onSnapToggle} data-testid="utils-snap-btn">
        <span className="flex items-center gap-2">
          <Grid3X3 className={`w-4 h-4 ${snapEnabled ? "text-[#2962ff]" : ""}`} />
          Snap {snapEnabled ? "On" : "Off"}
        </span>
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem onClick={onSaveLayout} data-testid="utils-save-layout">
        <span className="flex items-center gap-2">
          <Layout className="w-4 h-4" />
          Save Layout
        </span>
      </DropdownItem>
      <DropdownItem onClick={onLoadLayout} data-testid="utils-load-layout">
        <span className="flex items-center gap-2">
          <Layout className="w-4 h-4" />
          Load Layout
        </span>
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem onClick={onExportPng} data-testid="utils-export-png">
        <span className="flex items-center gap-2">
          <FileImage className="w-4 h-4" />
          Export PNG
        </span>
      </DropdownItem>
      <DropdownItem onClick={onExportCsv} data-testid="utils-export-csv">
        <span className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </span>
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem onClick={onReload} data-testid="utils-reload-btn">
        <span className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Reload Data
        </span>
      </DropdownItem>
    </SimpleDropdown>
  );
});

// ========== TOP CONTROLS (Compare/Overlay/Inspector) ==========
// PRIO 2: Moved from ChartViewport toolbar to header for TradingView-style layout

const MODE_OPTIONS: Array<{ label: string; value: CompareMode }> = [
  { label: "%", value: "percent" },
  { label: "Idx", value: "indexed" },
  { label: "$", value: "price" },
];

const OVERLAY_CONFIG: Array<{ group: "sma" | "ema"; value: number; label: string }> = [
  { group: "sma", value: 20, label: "SMA 20" },
  { group: "sma", value: 50, label: "SMA 50" },
  { group: "ema", value: 12, label: "EMA 12" },
  { group: "ema", value: 26, label: "EMA 26" },
];

interface TopControlsProps {
  defaultTimeframe: Tf;
}

const TopControls = memo(function TopControls({ defaultTimeframe }: TopControlsProps) {
  const {
    compareItems,
    defaultCompareMode,
    defaultCompareTimeframe,
    compareScaleMode,
    overlayState,
    inspectorOpen,
    addCompare,
    removeCompare,
    toggleCompare,
    setCompareMode,
    setCompareTimeframe,
    setDefaultCompareMode,
    setDefaultCompareTimeframe,
    setCompareScaleMode,
    toggleOverlay,
    toggleInspector,
  } = useToolbarStore();
  
  const [symbolInput, setSymbolInput] = useState("");
  const [addModeValue, setAddModeValue] = useState<CompareMode>(defaultCompareMode);
  const [addTimeframeValue, setAddTimeframeValue] = useState<Tf>(defaultCompareTimeframe);
  
  // Sync local state when store defaults change
  useEffect(() => {
    setAddModeValue(defaultCompareMode);
  }, [defaultCompareMode]);
  
  useEffect(() => {
    setAddTimeframeValue(defaultCompareTimeframe);
  }, [defaultCompareTimeframe]);
  
  const handleAddCompare = () => {
    const trimmed = symbolInput.trim().toUpperCase();
    if (!trimmed) return;
    
    // Use chart API to add compare (handles data fetching, rendering, AND max count guard)
    // Do NOT call addCompare directly - the ChartViewport handles state sync
    const lwcharts = (window as any).__lwcharts;
    if (lwcharts?.compare?.add) {
      lwcharts.compare.add(trimmed, { mode: addModeValue, timeframe: addTimeframeValue });
    }
    
    // Update defaults
    setDefaultCompareMode(addModeValue);
    setDefaultCompareTimeframe(addTimeframeValue);
    setSymbolInput("");
  };
  
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto scrollbar-hide"
      style={{
        flex: "1 1 0%",
        minWidth: 0,
        whiteSpace: "nowrap",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
      data-testid="topbar-controls"
    >
      {/* Scale mode toggle */}
      <button
        type="button"
        data-testid="topbar-scale-mode-toggle"
        onClick={() => setCompareScaleMode(compareScaleMode === "percent" ? "price" : "percent")}
        className={`
          inline-flex items-center justify-center
          h-[22px] px-1.5
          rounded-sm text-[10px] font-medium uppercase
          transition-colors
          ${compareScaleMode === "percent"
            ? "bg-[#2962ff]/15 text-[#2962ff]"
            : "bg-transparent text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          }
        `}
        title={compareScaleMode === "percent" ? "Scale: Percent" : "Scale: Price"}
      >
        {compareScaleMode === "percent" ? "%" : "$"}
      </button>
      
      {/* Add compare input */}
      <div className="flex items-center gap-0.5">
        <input
          type="text"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddCompare()}
          placeholder="+ Compare"
          className="
            h-[22px] w-20 px-1.5
            bg-transparent text-[10px] text-[#d1d4dc]
            border border-[#363a45] rounded-sm
            placeholder:text-[#787b86]
            focus:outline-none focus:border-[#2962ff]
          "
          data-testid="topbar-compare-input"
        />
        <select
          value={addTimeframeValue}
          onChange={(e) => setAddTimeframeValue(e.target.value as Tf)}
          className="
            h-[22px] px-0.5
            bg-[#1e222d] text-[10px] text-[#787b86]
            border border-[#363a45] rounded-sm
            focus:outline-none
          "
          data-testid="topbar-compare-tf"
        >
          {TIMEFRAME_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.value}</option>
          ))}
        </select>
        <select
          value={addModeValue}
          onChange={(e) => setAddModeValue(e.target.value as CompareMode)}
          className="
            h-[22px] px-0.5
            bg-[#1e222d] text-[10px] text-[#787b86]
            border border-[#363a45] rounded-sm
            focus:outline-none
          "
          data-testid="topbar-compare-mode"
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {symbolInput.trim() && (
          <button
            type="button"
            onClick={handleAddCompare}
            className="h-[22px] px-1.5 text-[10px] bg-[#2962ff]/15 text-[#2962ff] rounded-sm hover:bg-[#2962ff]/25"
            data-testid="topbar-compare-add-btn"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      
      {/* Separator */}
      {compareItems.length > 0 && <div className="w-px h-4 bg-[#363a45] mx-1" />}
      
      {/* Compare chips */}
      {compareItems.map((item) => (
        <div
          key={item.symbol}
          className={`
            inline-flex items-center gap-0.5
            h-[22px] px-1.5
            bg-[#2a2e39] rounded-sm
            text-[10px] font-medium
            ${item.hidden ? "opacity-50" : ""}
          `}
          data-testid={`topbar-compare-chip-${item.symbol.toLowerCase().replace(/\./g, "-")}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: colorFor(item.symbol) }}
          />
          <span className="text-[#d1d4dc]">{item.symbol}</span>
          <select
            value={item.mode}
            onChange={(e) => setCompareMode(item.symbol, e.target.value as CompareMode)}
            className="
              h-4 px-0.5 ml-0.5
              bg-transparent text-[9px] text-[#787b86]
              border-none
              focus:outline-none cursor-pointer
            "
            onClick={(e) => e.stopPropagation()}
          >
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => toggleCompare(item.symbol)}
            className="p-0.5 hover:bg-[#363a45] rounded-sm"
            title={item.hidden ? "Show" : "Hide"}
          >
            {item.hidden ? <EyeOff className="w-2.5 h-2.5 text-[#787b86]" /> : <Eye className="w-2.5 h-2.5 text-[#787b86]" />}
          </button>
          <button
            type="button"
            onClick={() => removeCompare(item.symbol)}
            className="p-0.5 hover:bg-[#363a45] rounded-sm"
            title="Remove"
          >
            <X className="w-2.5 h-2.5 text-[#787b86]" />
          </button>
        </div>
      ))}
      
      {/* Separator before overlays */}
      <div className="w-px h-4 bg-[#363a45] mx-1" />
      
      {/* Overlay toggles (SMA/EMA) */}
      {OVERLAY_CONFIG.map((item) => {
        const active = overlayState[item.group].includes(item.value);
        return (
          <button
            key={`${item.group}-${item.value}`}
            type="button"
            onClick={() => toggleOverlay(item.group, item.value)}
            className={`
              inline-flex items-center justify-center
              h-[22px] px-1.5
              rounded-sm text-[10px] font-medium
              transition-colors
              ${active
                ? "bg-[#2962ff]/15 text-[#2962ff]"
                : "bg-transparent text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
              }
            `}
            data-testid={`topbar-overlay-${item.group}-${item.value}`}
          >
            {item.label}
          </button>
        );
      })}
      
      {/* Separator before inspector */}
      <div className="w-px h-4 bg-[#363a45] mx-1" />
      
      {/* Inspector toggle */}
      <button
        type="button"
        onClick={toggleInspector}
        className={`
          inline-flex items-center justify-center
          h-[22px] px-1.5
          rounded-sm text-[10px] font-medium
          transition-colors
          ${inspectorOpen
            ? "bg-[#2962ff]/15 text-[#2962ff]"
            : "bg-transparent text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          }
        `}
        data-testid="topbar-inspector-toggle"
        title="Inspector"
      >
        <PanelRightOpen className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

// ========== MAIN COMPONENT ==========
export const TVCompactHeader = memo(function TVCompactHeader({
  symbol,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  chartType,
  onChartTypeChange,
  onSettingsClick,
  onRenkoSettingsClick,
  onIndicatorsClick,
  onAlertsClick,
  onObjectsClick,
  theme,
  onThemeChange,
  magnetEnabled,
  onMagnetToggle,
  snapEnabled,
  onSnapToggle,
  onSaveLayout,
  onLoadLayout,
  onExportPng,
  onExportCsv,
  loading,
  onReload,
  meta: _meta, // Reserved for future symbol metadata display
  // API Status props
  apiStatus = "checking",
  dataMode = "mock",
  onDataModeChange,
  onInfoClick,
  // PRIO 2: TopControls
  showTopControls = false,
}: TVCompactHeaderProps) {
  const isDark = theme === "dark";

  return (
    <header
      className="
        flex items-center
        w-full h-full
        px-2 gap-1
        bg-[var(--tv-panel,#1e222d)]
        border-b border-[var(--tv-border,#363a45)]
      "
      style={{
        minHeight: `${TV_LAYOUT.HEADER_HEIGHT_MIN}px`,
        maxHeight: `${TV_LAYOUT.HEADER_HEIGHT_MAX}px`,
      }}
      data-testid="tv-topbar-root"
    >
      {/* LEFT GROUP: Primary Controls */}
      <div className="flex items-center gap-1" data-testid="tv-header-left">
        <SymbolChip 
          symbol={symbol} 
          onSymbolChange={onSymbolChange}
          loading={loading}
        />
        
        <div className="w-px h-4 bg-[#363a45]" />
        
        <TimeframeDropdown 
          value={timeframe} 
          onChange={onTimeframeChange} 
        />
        
        <ChartTypeDropdown 
          value={chartType} 
          onChange={onChartTypeChange}
          onRenkoSettingsClick={onRenkoSettingsClick}
        />
        
        <CompactButton
          onClick={onSettingsClick}
          title="Chart Settings"
          data-testid="settings-button"
        >
          <Settings className="w-4 h-4" />
        </CompactButton>
      </div>

      {/* CENTER: TopControls (Compare/Overlay) OR spacer */}
      {showTopControls ? (
        <TopControls defaultTimeframe={timeframe as Tf} />
      ) : (
        <div className="flex-1 min-w-0" />
      )}

      {/* RIGHT GROUP: API Status + Panel Toggles + Theme + Utils */}
      <div className="flex items-center gap-1" data-testid="tv-header-right">
        {/* API Status (compact, TV-integrated) */}
        <CompactApiStatus
          apiStatus={apiStatus}
          dataMode={dataMode}
          onDataModeChange={onDataModeChange}
        />
        
        <div className="w-px h-4 bg-[#363a45]" />
        
        {/* Info/About button */}
        {onInfoClick && (
          <CompactButton
            onClick={onInfoClick}
            title="Info"
            data-testid="info-button"
          >
            <span className="text-[11px]">ℹ️</span>
          </CompactButton>
        )}
        
        {/* Panel toggles */}
        <CompactButton
          onClick={onIndicatorsClick}
          title="Indicators"
          data-testid="topbar-indicators-btn"
        >
          <Layers className="w-4 h-4" />
        </CompactButton>
        
        <CompactButton
          onClick={onAlertsClick}
          title="Alerts"
          data-testid="topbar-alerts-btn"
        >
          <Bell className="w-4 h-4" />
        </CompactButton>
        
        <CompactButton
          onClick={onObjectsClick}
          title="Objects"
          data-testid="topbar-objects-btn"
        >
          <Ruler className="w-4 h-4" />
        </CompactButton>

        <div className="w-px h-4 bg-[#363a45]" />

        {/* Theme toggle */}
        <CompactButton
          onClick={() => onThemeChange(isDark ? "light" : "dark")}
          title={isDark ? "Switch to Light" : "Switch to Dark"}
          data-testid="theme-toggle-button"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </CompactButton>

        {/* Utils menu */}
        <UtilsMenu
          magnetEnabled={magnetEnabled}
          onMagnetToggle={onMagnetToggle}
          snapEnabled={snapEnabled}
          onSnapToggle={onSnapToggle}
          onSaveLayout={onSaveLayout}
          onLoadLayout={onLoadLayout}
          onExportPng={onExportPng}
          onExportCsv={onExportCsv}
          onReload={onReload}
        />
      </div>
    </header>
  );
});

export default TVCompactHeader;

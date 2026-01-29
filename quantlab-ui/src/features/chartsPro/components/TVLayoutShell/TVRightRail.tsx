/**
 * TVRightRail.tsx
 * 
 * TradingView-style slim vertical icon rail (40-44px)
 * 
 * Layout:
 * ┌────┐
 * │ 📋 │  Watchlist
 * │ 🔔 │  Alerts  
 * │ 📐 │  Objects
 * │ fx │  Indicators
 * ├────┤
 * │ ⚙️ │  Settings
 * │ ❓ │  Help
 * └────┘
 * 
 * Features:
 * - Slim vertical column (40-44px width)
 * - Icon buttons with active state
 * - Panel toggle callbacks
 * - Positioned to right of chart, left of panel
 */

import { memo } from "react";
import {
  List,
  Bell,
  Ruler,
  Layers,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TV_LAYOUT } from "../TVLayoutShell";

// ========== TYPES ==========
export type RailTab = "watchlist" | "alerts" | "objects" | "indicators";

interface TVRightRailProps {
  /** Currently active tab (null = panel collapsed) */
  activeTab: RailTab | null;
  /** Callback when tab is clicked */
  onTabChange: (tab: RailTab | null) => void;
  /** Whether the panel is collapsed */
  panelCollapsed?: boolean;
  /** Callback to toggle panel collapse */
  onTogglePanel?: () => void;
  /** Optional: Show settings button */
  showSettings?: boolean;
  onSettingsClick?: () => void;
}

// ========== RAIL BUTTON ==========
interface RailButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  "data-testid"?: string;
}

const RailButton = memo(function RailButton({
  icon,
  label,
  active,
  onClick,
  "data-testid": testId,
}: RailButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      data-testid={testId}
      className={`
        flex items-center justify-center
        w-full h-9
        transition-colors duration-75
        ${active 
          ? "bg-[#2a2e39] text-[#2962ff] border-r-2 border-[#2962ff]" 
          : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]/50"
        }
      `}
    >
      {icon}
    </button>
  );
});

// ========== RAIL TABS CONFIG ==========
const RAIL_TABS: { id: RailTab; icon: React.ReactNode; label: string }[] = [
  { id: "watchlist", icon: <List className="w-[16px] h-[16px]" />, label: "Watchlist" },
  { id: "alerts", icon: <Bell className="w-[16px] h-[16px]" />, label: "Alerts" },
  { id: "objects", icon: <Ruler className="w-[16px] h-[16px]" />, label: "Objects" },
  { id: "indicators", icon: <Layers className="w-[16px] h-[16px]" />, label: "Indicators" },
];

// ========== MAIN COMPONENT ==========
export const TVRightRail = memo(function TVRightRail({
  activeTab,
  onTabChange,
  panelCollapsed = false,
  onTogglePanel,
  showSettings = false,
  onSettingsClick,
}: TVRightRailProps) {
  const handleTabClick = (tab: RailTab) => {
    if (activeTab === tab) {
      // Clicking active tab collapses panel
      onTabChange(null);
    } else {
      onTabChange(tab);
    }
  };

  return (
    <div
      className="
        flex flex-col
        h-full
        bg-[#1e222d]
        border-l border-[#363a45]
      "
      style={{
        width: `${TV_LAYOUT.RIGHT_ICON_RAIL}px`,
        minWidth: `${TV_LAYOUT.RIGHT_ICON_RAIL}px`,
      }}
      data-testid="tv-right-rail"
    >
      {/* Collapse/Expand toggle */}
      <RailButton
        icon={panelCollapsed 
          ? <ChevronLeft className="w-[16px] h-[16px]" /> 
          : <ChevronRight className="w-[16px] h-[16px]" />
        }
        label={panelCollapsed ? "Expand Panel" : "Collapse Panel"}
        onClick={onTogglePanel}
        data-testid="rail-toggle-panel"
      />

      {/* Separator */}
      <div className="h-px bg-[#363a45] mx-2" />

      {/* Tab buttons */}
      <div className="flex-1 flex flex-col py-0.5">
        {RAIL_TABS.map((tab) => (
          <RailButton
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            active={activeTab === tab.id && !panelCollapsed}
            onClick={() => handleTabClick(tab.id)}
            data-testid={`rail-${tab.id}`}
          />
        ))}
      </div>

      {/* Bottom section: Settings + Help */}
      <div className="mt-auto">
        <div className="h-px bg-[#363a45] mx-2" />
        
        {showSettings && (
          <RailButton
            icon={<Settings className="w-[16px] h-[16px]" />}
            label="Settings"
            onClick={onSettingsClick}
            data-testid="rail-settings"
          />
        )}
        
        <RailButton
          icon={<HelpCircle className="w-[16px] h-[16px]" />}
          label="Help"
          onClick={() => {
            // Could open help modal/docs
            console.log("Help clicked");
          }}
          data-testid="rail-help"
        />
      </div>
    </div>
  );
});

export default TVRightRail;

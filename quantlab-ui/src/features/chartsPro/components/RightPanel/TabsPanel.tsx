import { useEffect, useMemo, useState } from "react";

export type RightPanelTab = "indicators" | "objects" | "alerts";

const STORAGE_KEY = "cp.rightPanel.activeTab";
const VALID_TABS: RightPanelTab[] = ["indicators", "objects", "alerts"];

function readInitialTab(): RightPanelTab {
  if (typeof window === "undefined") return "indicators";
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (typeof raw === "string") {
      const v = raw.trim().toLowerCase();
      if (VALID_TABS.includes(v as RightPanelTab)) return v as RightPanelTab;
    }
  } catch {
    // ignore
  }
  return "indicators";
}

function persistActiveTab(tab: RightPanelTab | "") {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

interface TabsPanelProps {
  indicatorsPanel: React.ReactNode;
  objectsPanel: React.ReactNode;
  alertsPanel: React.ReactNode;
  activeTab?: RightPanelTab | null; // optional controlled
  onChangeActiveTab?: (tab: RightPanelTab | null) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  isDesktop?: boolean;
}

export function TabsPanel({
  indicatorsPanel,
  objectsPanel,
  alertsPanel,
  activeTab,
  onChangeActiveTab,
  collapsed = false,
  onToggleCollapsed,
  isDesktop = true,
}: TabsPanelProps) {
  const [internalTab, setInternalTab] = useState<RightPanelTab>(() => readInitialTab());
  const currentTab = activeTab === undefined ? internalTab : activeTab;

  useEffect(() => {
    if (currentTab === null) {
      persistActiveTab("");
      return;
    }
    persistActiveTab(currentTab);
  }, [currentTab]);

  const widthStyle = useMemo(() => {
    // Constrain right panel width similar to external sidebar
    return isDesktop
      ? { width: "clamp(var(--cp-sidebar-w-min), 25vw, var(--cp-sidebar-w-max))" }
      : { width: "var(--cp-sidebar-w-laptop)" };
  }, [isDesktop]);

  const handleTabClick = (next: RightPanelTab) => {
    if (onChangeActiveTab) onChangeActiveTab(next);
    setInternalTab(next);
  };

  if (collapsed) {
    return (
      <div className="flex items-center justify-center" style={widthStyle}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="m-2 w-8 h-8 rounded border transition text-current"
          style={{
            borderColor: "var(--cp-panel-border)",
            backgroundColor: "var(--cp-panel-header-bg)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "var(--cp-panel-hover-bg)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "var(--cp-panel-header-bg)";
          }}
          title="Expand panels"
          data-testid="rightpanel-expand-btn"
        >
          ❮
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col min-h-0 border-l"
      style={{
        ...widthStyle,
        backgroundColor: "var(--tv-panel, #1e222d)",
        borderLeftColor: "var(--tv-border, #363a45)",
      }}
      data-testid="rightpanel-root"
    >
      {/* Header - Tighter TV styling */}
      <div
        className="flex items-center justify-between border-b"
        style={{
          padding: "6px 8px",
          backgroundColor: "var(--tv-panel, #1e222d)",
          borderColor: "var(--tv-border, #363a45)",
          color: "var(--tv-text, #d1d4dc)",
        }}
      >
        <span className="text-[11px] font-medium" style={{ color: "var(--tv-text-muted, #787b86)" }}>Panels</span>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="px-1.5 py-0.5 text-[11px] rounded-sm transition"
            style={{
              color: "var(--tv-text-muted, #787b86)",
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = "var(--tv-panel-hover, #2a2e39)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = "transparent"; }}
            title="Collapse panels"
            data-testid="rightpanel-collapse-btn"
          >
            ❯
          </button>
        ) : null}
      </div>
      {/* Tab bar - Tighter TV styling with underline indicator */}
      <div
        className="flex items-center border-b"
        style={{
          gap: "2px",
          padding: "4px 6px",
          backgroundColor: "var(--tv-panel, #1e222d)",
          borderColor: "var(--tv-border, #363a45)",
        }}
        data-testid="rightpanel-tabs"
      >
        {VALID_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabClick(tab)}
            className={`px-2 py-1 text-[11px] font-medium rounded-sm transition border-b-2 ${
              currentTab === tab 
                ? "border-[#2962ff] bg-transparent" 
                : "border-transparent hover:bg-[#2a2e39]/40"
            }`}
            style={{
              color: currentTab === tab ? "var(--tv-blue, #2962ff)" : "var(--tv-text-muted, #787b86)",
            }}
            aria-pressed={currentTab === tab}
            data-testid={`rightpanel-tab-${tab}`}
          >
            {tab === "indicators" ? "Indicators" : tab === "objects" ? "Objects" : "Alerts"}
          </button>
        ))}
      </div>
      {/* Content area - Tighter padding */}
      <div
        className="flex flex-col flex-1 min-h-0 overflow-y-auto"
        style={{
          color: "var(--tv-text, #d1d4dc)",
          padding: "6px 8px",
          gap: "4px",
        }}
        data-testid="rightpanel-content"
      >
        {/* If no tab selected (null), still show Indicators for overlay support */}
        {(currentTab === "indicators" || currentTab === null) ? indicatorsPanel : null}
        {currentTab === "objects" ? objectsPanel : null}
        {currentTab === "alerts" ? alertsPanel : null}
      </div>
    </div>
  );
}

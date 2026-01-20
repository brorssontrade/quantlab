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
        backgroundColor: "var(--cp-panel-bg)",
        borderLeftColor: "var(--cp-panel-border)",
      }}
      data-testid="rightpanel-root"
    >
      <div
        className="flex items-center justify-between border-b"
        style={{
          padding: "var(--cp-pad-sm) var(--cp-pad)",
          backgroundColor: "var(--cp-panel-header-bg)",
          borderColor: "var(--cp-panel-border)",
          color: "var(--cp-panel-text)",
        }}
      >
        <span className="text-xs font-medium">Panels</span>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="px-2 py-1 text-xs rounded transition"
            style={{
              color: "var(--cp-panel-text)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "var(--cp-panel-hover-bg)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "transparent";
            }}
            title="Collapse panels"
            data-testid="rightpanel-collapse-btn"
          >
            ❯
          </button>
        ) : null}
      </div>
      <div
        className="flex items-center border-b"
        style={{
          gap: "var(--cp-gap-xs)",
          padding: "var(--cp-pad-sm)",
          backgroundColor: "var(--cp-panel-header-bg)",
          borderColor: "var(--cp-panel-border)",
        }}
        data-testid="rightpanel-tabs"
      >
        {VALID_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabClick(tab)}
            className="px-3 py-1 text-xs rounded transition"
            style={{
              color: currentTab === tab ? "var(--cp-panel-text)" : "var(--cp-panel-text-muted)",
              backgroundColor: currentTab === tab ? "var(--cp-panel-hover-bg)" : "transparent",
            }}
            onMouseEnter={(e) => {
              if (currentTab !== tab) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "var(--cp-panel-hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              if (currentTab !== tab) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "transparent";
              }
            }}
            aria-pressed={currentTab === tab}
            data-testid={`rightpanel-tab-${tab}`}
          >
            {tab === "indicators" ? "Indicators" : tab === "objects" ? "Objects" : "Alerts"}
          </button>
        ))}
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto space-y-3"
        style={{
          color: "var(--cp-panel-text)",
          padding: "var(--cp-pad-sm) var(--cp-pad)",
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

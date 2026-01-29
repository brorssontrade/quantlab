/**
 * TVLayoutShell.tsx
 * 
 * TradingView "Supercharts" Layout Parity Shell
 * 
 * Goal: "Screenshot should feel like TradingView Supercharts with our content"
 * 
 * Layout Structure (CSS Grid):
 * ┌──────────────────────────────────────────────────────┐
 * │ HEADER (48-52px)                                     │
 * ├────────┬─────────────────────────────────┬───────────┤
 * │ LEFT   │                                 │ RIGHT     │
 * │TOOLBAR │      CHART AREA (flex)          │ PANEL     │
 * │(45-50px│                                 │ (300-360px│
 * ├────────┴─────────────────────────────────┴───────────┤
 * │ BOTTOM BAR (38-42px)                                 │
 * └──────────────────────────────────────────────────────┘
 * 
 * Contract (dump().ui.layout):
 * - headerH: 48-52px
 * - leftW: 45-50px
 * - rightW: 0 (collapsed) or 280-360px (expanded, resizable)
 * - bottomH: 38-42px
 */

import { createContext, useContext, useCallback, useRef, useState, useEffect, type ReactNode } from "react";

// ========== LAYOUT CONSTANTS (TradingView Parity) ==========
export const TV_LAYOUT = {
  HEADER_HEIGHT: 50,         // Target: 48-52px
  HEADER_HEIGHT_MIN: 48,
  HEADER_HEIGHT_MAX: 52,
  
  LEFT_WIDTH: 48,            // Target: 45-50px
  LEFT_WIDTH_MIN: 45,
  LEFT_WIDTH_MAX: 50,
  
  RIGHT_ICON_RAIL: 44,       // Right icon rail: 40-44px (always visible)
  RIGHT_PANEL_WIDTH: 280,    // Right panel default: 280px
  RIGHT_PANEL_WIDTH_MIN: 280,
  RIGHT_PANEL_WIDTH_MAX: 400, // Extended max for resizing (was 320)
  RIGHT_PANEL_WIDTH_DEFAULT: 280, // Double-click reset target
  
  BOTTOM_HEIGHT: 40,         // Target: 38-42px
  BOTTOM_HEIGHT_MIN: 38,
  BOTTOM_HEIGHT_MAX: 42,
  
  // Icon/button sizes
  ICON_SIZE: 20,             // Icon: 20px inside 28-32px hit area
  BUTTON_SIZE: 32,           // Button hit area: 28-32px
  BUTTON_PADDING: 6,         // Padding: 6-8px
  
  // Resize handle
  RESIZE_HANDLE_WIDTH: 5,    // 5px drag zone
} as const;

// ========== LOCALSTORAGE KEY ==========
const RIGHT_PANEL_WIDTH_KEY = "cp.rightPanel.width";

function loadRightPanelWidth(): number {
  if (typeof window === "undefined") return TV_LAYOUT.RIGHT_PANEL_WIDTH_DEFAULT;
  try {
    const stored = window.localStorage?.getItem(RIGHT_PANEL_WIDTH_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= TV_LAYOUT.RIGHT_PANEL_WIDTH_MIN && parsed <= TV_LAYOUT.RIGHT_PANEL_WIDTH_MAX) {
        return parsed;
      }
    }
  } catch {}
  return TV_LAYOUT.RIGHT_PANEL_WIDTH_DEFAULT;
}

function saveRightPanelWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(RIGHT_PANEL_WIDTH_KEY, String(width));
  } catch {}
}

// ========== LAYOUT CONTEXT ==========
export interface TVLayoutState {
  headerHeight: number;
  leftToolbarWidth: number;
  rightPanelWidth: number;
  rightPanelCollapsed: boolean;
  bottomBarHeight: number;
}

export interface TVLayoutActions {
  setRightPanelCollapsed: (collapsed: boolean) => void;
  toggleRightPanel: () => void;
}

export interface TVLayoutContextValue extends TVLayoutState, TVLayoutActions {
  /** For dump().ui.layout contract */
  getLayoutMetrics: () => {
    headerH: number;
    leftW: number;
    rightW: number;
    bottomH: number;
    rightCollapsed: boolean;
  };
}

const TVLayoutContext = createContext<TVLayoutContextValue | null>(null);

export function useTVLayout(): TVLayoutContextValue {
  const ctx = useContext(TVLayoutContext);
  if (!ctx) {
    throw new Error("useTVLayout must be used within TVLayoutShell");
  }
  return ctx;
}

// ========== LAYOUT SHELL COMPONENT ==========
interface TVLayoutShellProps {
  children: ReactNode;
  /** Initial right panel collapsed state (default: true = collapsed) */
  rightPanelCollapsed?: boolean;
  /** CSS class for root element */
  className?: string;
  /** Slot: Header content (48-52px height) */
  header?: ReactNode;
  /** Slot: Left toolbar content (45-50px width) */
  leftToolbar?: ReactNode;
  /** Slot: Right rail content (40-44px width, always visible) */
  rightRail?: ReactNode;
  /** Slot: Right panel content (280-400px width, collapsible, resizable) */
  rightPanel?: ReactNode;
  /** Slot: Bottom bar content (38-42px height) */
  bottomBar?: ReactNode;
  /** Theme CSS variables object */
  themeCssVars?: Record<string, string>;
  /** Data theme name for styling */
  dataTheme?: string;
  /** Show right rail even without rightRail slot (for placeholder) */
  showRightRail?: boolean;
}

export function TVLayoutShell({
  children,
  rightPanelCollapsed = true, // Controlled from parent
  className = "",
  header,
  leftToolbar,
  rightRail,
  rightPanel,
  bottomBar,
  themeCssVars = {},
  dataTheme = "dark",
  showRightRail = true,
}: TVLayoutShellProps) {
  // ========== RESIZABLE RIGHT PANEL STATE ==========
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => loadRightPanelWidth());
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  
  // Refs for measuring actual dimensions
  const headerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  // ========== RESIZE HANDLERS ==========
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = rightPanelWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, [rightPanelWidth]);
  
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    // RAF throttle for smooth performance
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    rafRef.current = requestAnimationFrame(() => {
      // Resize from left edge of panel (drag left = wider, drag right = narrower)
      const delta = resizeStartX.current - e.clientX;
      const newWidth = Math.min(
        TV_LAYOUT.RIGHT_PANEL_WIDTH_MAX,
        Math.max(TV_LAYOUT.RIGHT_PANEL_WIDTH_MIN, resizeStartWidth.current + delta)
      );
      setRightPanelWidth(newWidth);
    });
  }, [isResizing]);
  
  const handleResizeEnd = useCallback(() => {
    if (!isResizing) return;
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    
    // Save to localStorage
    saveRightPanelWidth(rightPanelWidth);
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [isResizing, rightPanelWidth]);
  
  // Double-click to reset to default width
  const handleResizeDoubleClick = useCallback(() => {
    setRightPanelWidth(TV_LAYOUT.RIGHT_PANEL_WIDTH_DEFAULT);
    saveRightPanelWidth(TV_LAYOUT.RIGHT_PANEL_WIDTH_DEFAULT);
  }, []);
  
  // Global mouse event listeners for resize
  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResizeMove);
      window.addEventListener("mouseup", handleResizeEnd);
      return () => {
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);
  
  const setRightPanelCollapsed = useCallback((_collapsed: boolean) => {
    // This is now a no-op since we're controlled - parent should handle via props
    console.warn("[TVLayoutShell] setRightPanelCollapsed called but component is controlled by parent");
  }, []);
  
  const toggleRightPanel = useCallback(() => {
    // This is now a no-op since we're controlled - parent should handle toggle
    console.warn("[TVLayoutShell] toggleRightPanel called but component is controlled by parent");
  }, []);
  
  const getLayoutMetrics = useCallback(() => {
    const railWidth = showRightRail ? TV_LAYOUT.RIGHT_ICON_RAIL : 0;
    const panelW = rightPanelCollapsed ? 0 : rightPanelWidth;
    return {
      headerH: headerRef.current?.offsetHeight ?? TV_LAYOUT.HEADER_HEIGHT,
      leftW: leftRef.current?.offsetWidth ?? TV_LAYOUT.LEFT_WIDTH,
      rightW: rightPanelCollapsed ? railWidth : railWidth + panelW,
      bottomH: bottomRef.current?.offsetHeight ?? TV_LAYOUT.BOTTOM_HEIGHT,
      rightCollapsed: rightPanelCollapsed,
      railW: railWidth,
      panelW,
    };
  }, [rightPanelCollapsed, showRightRail, rightPanelWidth]);
  
  const contextValue: TVLayoutContextValue = {
    headerHeight: TV_LAYOUT.HEADER_HEIGHT,
    leftToolbarWidth: TV_LAYOUT.LEFT_WIDTH,
    rightPanelWidth: rightPanelCollapsed ? 0 : rightPanelWidth,
    rightPanelCollapsed,
    bottomBarHeight: TV_LAYOUT.BOTTOM_HEIGHT,
    setRightPanelCollapsed,
    toggleRightPanel,
    getLayoutMetrics,
  };
  
  // Calculate grid dimensions - FIXED header height for TV parity (48-52px)
  const headerRowHeight = `${TV_LAYOUT.HEADER_HEIGHT}px`;
  const leftColumnWidth = leftToolbar ? `${TV_LAYOUT.LEFT_WIDTH}px` : "0px";
  // Right side: always show rail (44px), optionally show panel (resizable width)
  const hasRightRail = showRightRail || rightRail;
  const railColumnWidth = hasRightRail ? `${TV_LAYOUT.RIGHT_ICON_RAIL}px` : "0px";
  const panelColumnWidth = rightPanelCollapsed ? "0px" : `${rightPanelWidth}px`;

  return (
    <TVLayoutContext.Provider value={contextValue}>
      <div
        className={`tv-layout-shell ${className}`}
        style={{
          ...themeCssVars,
          display: "grid",
          gridTemplateRows: `${headerRowHeight} 1fr ${TV_LAYOUT.BOTTOM_HEIGHT}px`,
          gridTemplateColumns: `${leftColumnWidth} 1fr ${railColumnWidth} ${panelColumnWidth}`,
          gridTemplateAreas: `
            "header header header header"
            "left main rail panel"
            "bottom bottom bottom bottom"
          `,
          height: "100%",
          width: "100%",
          overflow: "hidden",
          // Use CSS custom properties from tv-tokens.css with fallbacks
          backgroundColor: "var(--tv-bg, #131722)",
          color: "var(--tv-text, #d1d4dc)",
        }}
        data-theme={dataTheme}
        data-testid="tv-layout-shell"
        data-panel-collapsed={rightPanelCollapsed ? "true" : "false"}
      >
        {/* HEADER ROW - FIXED height for TV parity (48-52px) */}
        <div
          ref={headerRef}
          className="tv-header"
          style={{
            gridArea: "header",
            height: `${TV_LAYOUT.HEADER_HEIGHT}px`,
            minHeight: `${TV_LAYOUT.HEADER_HEIGHT_MIN}px`,
            maxHeight: `${TV_LAYOUT.HEADER_HEIGHT_MAX}px`,
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--tv-border, #363a45)",
            backgroundColor: "var(--tv-panel, #1e222d)",
            overflow: "hidden",
          }}
          data-testid="tv-header"
        >
          {header}
        </div>
        
        {/* LEFT TOOLBAR - 45-50px width (conditionally rendered) */}
        {leftToolbar && (
          <div
            ref={leftRef}
            className="tv-left-toolbar"
            style={{
              gridArea: "left",
              width: `${TV_LAYOUT.LEFT_WIDTH}px`,
              minWidth: `${TV_LAYOUT.LEFT_WIDTH_MIN}px`,
              maxWidth: `${TV_LAYOUT.LEFT_WIDTH_MAX}px`,
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid var(--tv-border, #363a45)",
              backgroundColor: "var(--tv-panel, #1e222d)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
            data-testid="tv-left-toolbar"
          >
            {leftToolbar}
          </div>
        )}
        
        {/* MAIN CHART AREA - flex */}
        <div
          className="tv-main"
          style={{
            gridArea: "main",
            position: "relative",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
          }}
          data-testid="tv-main"
        >
          {children}
        </div>
        
        {/* RIGHT RAIL - 40-44px width (always visible) */}
        {hasRightRail && (
          <div
            className="tv-right-rail"
            style={{
              gridArea: "rail",
              width: `${TV_LAYOUT.RIGHT_ICON_RAIL}px`,
              display: "flex",
              flexDirection: "column",
              borderLeft: "1px solid var(--tv-border, #363a45)",
              backgroundColor: "var(--tv-panel, #1e222d)",
            }}
            data-testid="tv-right-rail-container"
          >
            {rightRail}
          </div>
        )}
        
        {/* RIGHT PANEL - 280-400px width (collapsible, resizable) */}
        {!rightPanelCollapsed && rightPanel && (
          <div
            ref={rightRef}
            className="tv-right-panel"
            style={{
              gridArea: "panel",
              width: `${rightPanelWidth}px`,
              minWidth: `${TV_LAYOUT.RIGHT_PANEL_WIDTH_MIN}px`,
              maxWidth: `${TV_LAYOUT.RIGHT_PANEL_WIDTH_MAX}px`,
              display: "flex",
              flexDirection: "column",
              borderLeft: "1px solid var(--tv-border, #363a45)",
              backgroundColor: "var(--tv-panel, #1e222d)",
              overflowY: "auto",
              overflowX: "hidden",
              position: "relative",
            }}
            data-testid="tv-right-panel"
            data-panel-width={rightPanelWidth}
          >
            {/* Resize handle - 5px drag zone on left edge */}
            <div
              className="tv-panel-resize-handle"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${TV_LAYOUT.RESIZE_HANDLE_WIDTH}px`,
                cursor: "ew-resize",
                zIndex: 10,
                // Hover highlight - uses TV blue accent
                background: isResizing ? "var(--tv-blue-subtle, rgba(41, 98, 255, 0.3))" : "transparent",
                transition: isResizing ? "none" : "background 0.15s ease",
              }}
              onMouseDown={handleResizeStart}
              onDoubleClick={handleResizeDoubleClick}
              onMouseEnter={(e) => {
                if (!isResizing) {
                  (e.target as HTMLElement).style.background = "rgba(41, 98, 255, 0.2)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isResizing) {
                  (e.target as HTMLElement).style.background = "transparent";
                }
              }}
              data-testid="tv-panel-resize-handle"
              title="Drag to resize panel (double-click to reset)"
            />
            {rightPanel}
          </div>
        )}
        
        {/* BOTTOM BAR - 38-42px height */}
        <div
          ref={bottomRef}
          className="tv-bottom-bar"
          style={{
            gridArea: "bottom",
            height: `${TV_LAYOUT.BOTTOM_HEIGHT}px`,
            minHeight: `${TV_LAYOUT.BOTTOM_HEIGHT_MIN}px`,
            maxHeight: `${TV_LAYOUT.BOTTOM_HEIGHT_MAX}px`,
            display: "flex",
            alignItems: "center",
            borderTop: "1px solid var(--tv-border, #363a45)",
            backgroundColor: "var(--tv-panel, #1e222d)",
            padding: "0 4px",
          }}
          data-testid="tv-bottom-bar"
        >
          {bottomBar}
        </div>
      </div>
    </TVLayoutContext.Provider>
  );
}

export default TVLayoutShell;

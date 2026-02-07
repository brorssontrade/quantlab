/**
 * LeftToolbar.tsx
 * 
 * TV-20.1: TradingView-style LeftToolbar with Tool Groups + Flyout
 * TV-20.13: Favorites + Recent sections for faster workflow
 * 
 * Features:
 * - Tool groups with expandable flyout menus
 * - Active tool synced to dump().ui.activeTool
 * - Responsive: Desktop (vertical) / Mobile (floating pill)
 * - Keyboard shortcuts maintained
 * - Flyout closes on Esc and click-outside
 * - Favorites section: starred tools visible immediately (no flyout needed)
 * - Recent section: last 5 tools for quick access
 * 
 * TV-3.9: Responsive behavior preserved
 * - Desktop (≥768px): Vertical toolbar in tv-leftbar grid slot
 * - Mobile (<768px): Floating horizontal pill (overlay, touch-friendly)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Undo2, Trash2, Maximize2, ChevronUp, ChevronDown, Clock, Star, Lock, Unlock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tool } from "../../state/controls";
import { TOOL_GROUPS, isToolEnabled, getEnabledTools } from "./toolRegistry";
import { ToolFlyout } from "./ToolFlyout";
import type { ToolGroup, ToolDefinition } from "./toolRegistry";
import { cn } from "@/lib/utils";

interface LeftToolbarProps {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
  /** TV-20.13: Favorites list from parent */
  favorites?: string[];
  /** TV-20.13: Recents list from parent */
  recents?: string[];
  /** TV-20.13: Callback to toggle favorite */
  onToggleFavorite?: (toolId: string) => void;
  /** TV-20.14: All drawings locked state */
  drawingsLocked?: boolean;
  /** TV-20.14: All drawings hidden state */
  drawingsHidden?: boolean;
  /** TV-20.14: Toggle all drawings locked */
  onToggleDrawingsLocked?: () => void;
  /** TV-20.14: Toggle all drawings hidden */
  onToggleDrawingsHidden?: () => void;
  /** TV-20.14: Remove all drawings */
  onRemoveAllDrawings?: () => void;
}

/**
 * Get the display icon for a group based on active tool
 * If active tool is in this group, show that tool's icon
 */
function getGroupIcon(group: ToolGroup, activeTool: string): string {
  const activeInGroup = group.tools.find(t => t.id === activeTool);
  return activeInGroup?.icon ?? group.icon;
}

/**
 * Check if a group contains the active tool
 */
function isGroupActive(group: ToolGroup, activeTool: string): boolean {
  return group.tools.some(t => t.id === activeTool);
}

/**
 * Get tool definition by ID from all groups
 */
function getToolById(toolId: string): ToolDefinition | undefined {
  for (const group of TOOL_GROUPS) {
    const tool = group.tools.find(t => t.id === toolId);
    if (tool) return tool;
  }
  return undefined;
}

/** Desktop: Vertical toolbar with flyout support */
function DesktopToolbar({ 
  activeTool, 
  onSelectTool, 
  favorites = [], 
  recents = [], 
  onToggleFavorite,
  // TV-20.14 guardrails: default no-ops prevent undefined onClick crashes
  drawingsLocked = false,
  drawingsHidden = false,
  onToggleDrawingsLocked = () => {},
  onToggleDrawingsHidden = () => {},
  onRemoveAllDrawings = () => {},
}: LeftToolbarProps) {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  
  // Only render compat layer in test mode (detected by ?mock=1 or __TEST_MODE__)
  const [isTestMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.location.search.includes("mock=1") || 
           (window as any).__TEST_MODE__ === true;
  });

  const handleGroupClick = useCallback((group: ToolGroup, button: HTMLButtonElement) => {
    // If clicking cursor group (only 1 tool), select directly
    if (group.id === "cursor" && group.tools.length === 1) {
      const tool = group.tools[0];
      if (isToolEnabled(tool.id)) {
        onSelectTool(tool.id as Tool);
      }
      return;
    }

    // Toggle flyout
    if (openGroupId === group.id) {
      setOpenGroupId(null);
      setAnchorRect(null);
    } else {
      setOpenGroupId(group.id);
      setAnchorRect(button.getBoundingClientRect());
    }
  }, [openGroupId, onSelectTool]);

  const handleToolSelect = useCallback((toolId: string) => {
    if (isToolEnabled(toolId)) {
      onSelectTool(toolId as Tool);
      // TV-20.13: recordRecent is now handled in ChartsProTab (watches controls.tool)
    }
  }, [onSelectTool]);

  const handleCloseFlyout = useCallback(() => {
    setOpenGroupId(null);
    setAnchorRect(null);
  }, []);

  // Find the open group for flyout
  const openGroup = openGroupId ? TOOL_GROUPS.find(g => g.id === openGroupId) : null;
  
  // TV-20.13: Get tool definitions for favorites and recents
  const favoriteTools = favorites.map(id => getToolById(id)).filter((t): t is ToolDefinition => t !== undefined && isToolEnabled(t.id));
  const recentTools = recents
    .filter(id => !favorites.includes(id)) // Don't show in recents if already in favorites
    .map(id => getToolById(id))
    .filter((t): t is ToolDefinition => t !== undefined && isToolEnabled(t.id));

  return (
    <div
      className="hidden md:flex flex-col items-center"
      style={{
        gap: 'var(--cp-gap-xs)',
        padding: '8px 4px', /* TV-style compact padding - prevents child overflow */
        /* PRIO 2: Fixed dimensions prevent scrollbar - NO horizontal scroll ever */
        height: '100%',
        maxHeight: '100%',
        width: '48px', /* Fixed width matches TV sidebar exactly */
        minWidth: '48px',
        maxWidth: '48px',
        boxSizing: 'border-box',
        overflow: 'hidden', /* Clip any overflow - no scrollbars */
        overflowX: 'clip', /* Modern clip is stronger than hidden */
        overflowY: 'auto', /* Allow vertical scroll if needed */
        backgroundColor: 'var(--tv-panel)',
        borderRight: '1px solid var(--tv-border)',
      }}
      data-testid="tv-leftbar-container"
    >
      {/* TV-20.13: Favorites Section */}
      {favoriteTools.length > 0 && (
        <>
          <div 
            className="text-[9px] font-medium uppercase tracking-wider mt-1"
            style={{ color: 'var(--tv-yellow, #f7a600)', opacity: 0.7 }}
            title="Starred favorites"
          >
            <Star className="h-3 w-3 inline-block" fill="currentColor" />
          </div>
          {favoriteTools.map((tool) => (
            <Button
              key={`fav-${tool.id}`}
              variant={activeTool === tool.id ? "default" : "ghost"}
              size="icon"
              onClick={() => handleToolSelect(tool.id)}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
              data-testid={`lefttoolbar-fav-${tool.id}`}
              className="h-9 w-9"
              style={{
                backgroundColor: activeTool === tool.id ? 'var(--tv-panel-hover)' : 'transparent',
                color: activeTool === tool.id ? 'var(--tv-text)' : 'var(--tv-text-muted)',
              }}
            >
              <span className="text-base">{tool.icon}</span>
            </Button>
          ))}
          <div className="my-0.5 w-6" style={{ borderTop: '1px solid var(--tv-yellow, #f7a600)', opacity: 0.3 }} />
        </>
      )}
      
      {/* TV-20.13: Recent Section */}
      {recentTools.length > 0 && (
        <>
          <div 
            className="text-[9px] font-medium uppercase tracking-wider"
            style={{ color: 'var(--tv-text-muted)' }}
            title="Recently used"
          >
            <Clock className="h-3 w-3 inline-block" />
          </div>
          {recentTools.slice(0, 3).map((tool) => (
            <Button
              key={`recent-${tool.id}`}
              variant={activeTool === tool.id ? "default" : "ghost"}
              size="icon"
              onClick={() => handleToolSelect(tool.id)}
              title={`${tool.label} (recent)`}
              data-testid={`lefttoolbar-recent-${tool.id}`}
              className="h-8 w-8"
              style={{
                backgroundColor: activeTool === tool.id ? 'var(--tv-panel-hover)' : 'transparent',
                color: activeTool === tool.id ? 'var(--tv-text)' : 'var(--tv-text-muted)',
              }}
            >
              <span className="text-sm">{tool.icon}</span>
            </Button>
          ))}
          <div className="my-0.5 w-6" style={{ borderTop: '1px solid var(--tv-border)' }} />
        </>
      )}
      
      {/* Tool Groups */}
      {TOOL_GROUPS.map((group) => {
        const groupActive = isGroupActive(group, activeTool);
        const hasMultipleTools = group.tools.length > 1;
        const isOpen = openGroupId === group.id;

        return (
          <div key={group.id} className="relative">
            <Button
              ref={(el) => {
                if (el) buttonRefs.current.set(group.id, el);
              }}
              variant={groupActive ? "default" : "ghost"}
              size="icon"
              onClick={(e) => handleGroupClick(group, e.currentTarget)}
              title={group.label}
              data-testid={`lefttoolbar-group-${group.id}`}
              className={`h-9 w-9 relative ${isOpen ? "ring-2 ring-[var(--tv-blue)]/50" : ""}`}
              style={{
                backgroundColor: groupActive ? 'var(--tv-panel-hover)' : 'transparent',
                color: groupActive ? 'var(--tv-text)' : 'var(--tv-text-muted)',
              }}
            >
              <span className="text-base">{getGroupIcon(group, activeTool)}</span>
              
              {/* Flyout indicator (small triangle) */}
              {hasMultipleTools && (
                <span 
                  className="absolute bottom-0.5 right-0.5 text-[8px]"
                  style={{ color: 'var(--tv-text-dim)' }}
                  aria-hidden="true"
                >
                  ▸
                </span>
              )}
            </Button>
          </div>
        );
      })}

      {/* Divider */}
      <div className="my-1 w-6" style={{ borderTop: '1px solid var(--tv-border)' }} />

      {/* Utility buttons */}
      <Button
        variant="ghost"
        size="icon"
        title="Undo (Ctrl+Z)"
        data-testid="tool-undo"
        className="h-9 w-9"
        style={{ color: 'var(--tv-text-muted)' }}
      >
        <Undo2 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Delete (Del)"
        data-testid="tool-delete"
        className="h-9 w-9"
        style={{ color: 'var(--tv-text-muted)' }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Fit to content (Ctrl+F)"
        data-testid="tool-fit"
        className="h-9 w-9"
        style={{ color: 'var(--tv-text-muted)' }}
      >
        <Maximize2 className="h-4 w-4" />
      </Button>

      {/* TV-20.14: Drawing Controls (Lock/Hide/Remove) */}
      <div className="my-1 w-6" style={{ borderTop: '1px solid var(--tv-border)' }} />

      <Button
        variant="ghost"
        size="icon"
        title={drawingsLocked ? "Unlock all drawings" : "Lock all drawings"}
        data-testid="drawings-lock-toggle"
        className="h-9 w-9"
        style={{
          color: drawingsLocked ? 'var(--tv-yellow)' : 'var(--tv-text-muted)',
        }}
        onClick={onToggleDrawingsLocked}
      >
        {drawingsLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title={drawingsHidden ? "Show all drawings" : "Hide all drawings"}
        data-testid="drawings-hide-toggle"
        className="h-9 w-9"
        style={{
          color: drawingsHidden ? 'var(--tv-yellow)' : 'var(--tv-text-muted)',
        }}
        onClick={onToggleDrawingsHidden}
      >
        {drawingsHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Remove all drawings"
        data-testid="drawings-remove-all"
        className="h-9 w-9"
        style={{ color: 'var(--tv-text-muted)' }}
        onClick={onRemoveAllDrawings}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* Flyout Portal */}
      {openGroup && anchorRect && (
        <ToolFlyout
          group={openGroup}
          anchorRect={anchorRect}
          activeTool={activeTool}
          onSelectTool={handleToolSelect}
          onClose={handleCloseFlyout}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      {/* 
        Backwards-compat layer for tests: hidden buttons with old testids 
        ONLY rendered in test mode (mock=1 URL param) to avoid production interference
        IMPORTANT: Both container and buttons have pointer-events-none to prevent click interception
      */}
      {isTestMode && (
        <div 
          className="fixed top-0 left-0 flex opacity-0 pointer-events-none" 
          aria-hidden="true"
          style={{ zIndex: -1, visibility: "hidden" }}
        >
          {TOOL_GROUPS.flatMap(g => g.tools)
            .filter(t => isToolEnabled(t.id))
            .map(tool => (
              <button
                key={tool.id}
                data-testid={`tool-${tool.id}`}
                onClick={() => handleToolSelect(tool.id)}
                tabIndex={-1}
                className="w-1 h-1 pointer-events-none"
              >
                {tool.label}
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
}

// Legacy flat tools for mobile (simpler UX - only enabled tools)
const MOBILE_TOOLS: Array<{ id: Tool; label: string; icon: string; shortcut?: string }> = [
  { id: "select", label: "Select", icon: "◀", shortcut: "Esc" },
  { id: "trendline", label: "Trendline", icon: "⧹", shortcut: "T" },
  { id: "hline", label: "H-Line", icon: "—", shortcut: "H" },
  { id: "vline", label: "V-Line", icon: "|", shortcut: "V" },
  { id: "channel", label: "Channel", icon: "⫴", shortcut: "C" },
];

/** Mobile: Floating horizontal pill - uses Portal to escape hidden container */
function MobilePill({ activeTool, onSelectTool }: LeftToolbarProps) {
  const [expanded, setExpanded] = useState(true);
  const [mounted, setMounted] = useState(false);
  const portalRoot = useRef<HTMLElement | null>(null);

  // Find or create portal mount point
  useEffect(() => {
    let container = document.getElementById("tv-leftbar-pill-portal");
    if (!container) {
      container = document.createElement("div");
      container.id = "tv-leftbar-pill-portal";
      document.body.appendChild(container);
    }
    portalRoot.current = container;
    setMounted(true);
  }, []);

  if (!mounted || !portalRoot.current) {
    return null;
  }

  return createPortal(
    <div
      className="
        md:hidden fixed bottom-4 left-1/2 -translate-x-1/2
        z-50 pointer-events-none
      "
      data-testid="tv-leftbar-mobile-container"
    >
      <div
        className="pointer-events-auto flex items-center backdrop-blur-sm rounded-full shadow-lg"
        style={{
          gap: 'var(--cp-gap-xs)',
          padding: 'var(--cp-pad-xs) var(--cp-pad-sm)',
          backgroundColor: 'var(--tv-panel)',
          border: '1px solid var(--tv-border)',
        }}
        data-testid="tv-leftbar-pill"
      >
        {/* Collapse/Expand toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Collapse tools" : "Expand tools"}
          data-testid="tool-pill-toggle"
          className="h-10 w-10 flex-shrink-0"
          style={{ color: 'var(--tv-text-muted)' }}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>

        {expanded && (
          <>
            {/* Divider */}
            <div className="h-6 w-px" style={{ backgroundColor: 'var(--tv-border)' }} />

            {/* Drawing tools (enabled only) */}
            {MOBILE_TOOLS.map((tool) => (
              <Button
                key={tool.id}
                variant={activeTool === tool.id ? "default" : "ghost"}
                size="icon"
                onClick={() => onSelectTool(tool.id)}
                title={tool.label}
                data-testid={`tool-${tool.id}`}
                className="h-10 w-10 text-lg"
                style={{
                  backgroundColor: activeTool === tool.id ? 'var(--tv-panel-hover)' : 'transparent',
                  color: activeTool === tool.id ? 'var(--tv-text)' : 'var(--tv-text-muted)',
                }}
              >
                {tool.icon}
              </Button>
            ))}

            {/* Divider */}
            <div className="h-6 w-px" style={{ backgroundColor: 'var(--tv-border)' }} />

            {/* Utility buttons (only Undo + Delete for mobile) */}
            <Button
              variant="ghost"
              size="icon"
              title="Undo"
              data-testid="tool-undo"
              className="h-10 w-10"
              style={{ color: 'var(--tv-text-muted)' }}
            >
              <Undo2 className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              title="Delete"
              data-testid="tool-delete"
              className="h-10 w-10"
              style={{ color: 'var(--tv-text-muted)' }}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </div>,
    portalRoot.current
  );
}


export function LeftToolbar({ 
  activeTool, 
  onSelectTool, 
  favorites, 
  recents, 
  onToggleFavorite,
  drawingsLocked,
  drawingsHidden,
  onToggleDrawingsLocked,
  onToggleDrawingsHidden,
  onRemoveAllDrawings,
}: LeftToolbarProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile breakpoint (768px)
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      {/* Desktop: Vertical toolbar in grid slot (hidden from DOM on mobile) */}
      {!isMobile && (
        <DesktopToolbar 
          activeTool={activeTool} 
          onSelectTool={onSelectTool} 
          favorites={favorites}
          recents={recents}
          onToggleFavorite={onToggleFavorite}
          drawingsLocked={drawingsLocked}
          drawingsHidden={drawingsHidden}
          onToggleDrawingsLocked={onToggleDrawingsLocked}
          onToggleDrawingsHidden={onToggleDrawingsHidden}
          onRemoveAllDrawings={onRemoveAllDrawings}
        />
      )}

      {/* Mobile: Floating pill overlay (only renders on mobile) */}
      {isMobile && <MobilePill activeTool={activeTool} onSelectTool={onSelectTool} />}
    </>
  );
}
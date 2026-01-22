/**
 * ToolFlyout.tsx
 * 
 * TV-20.1: TradingView-style flyout menu for tool groups
 * 
 * Features:
 * - Anchored to group button (positioned to the right)
 * - Portal-based to avoid clipping by containers
 * - Closes on Esc and click-outside
 * - Shows all tools in group with enabled/disabled state
 * - Keyboard accessible (arrow keys, Enter, Esc)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ToolGroup, ToolDefinition } from "./toolRegistry";
import { isToolEnabled } from "./toolRegistry";
import type { Tool } from "../../state/controls";

interface ToolFlyoutProps {
  group: ToolGroup;
  anchorRect: DOMRect | null;
  activeTool: string;
  onSelectTool: (toolId: string) => void;
  onClose: () => void;
}

export function ToolFlyout({
  group,
  anchorRect,
  activeTool,
  onSelectTool,
  onClose,
}: ToolFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const portalRoot = useRef<HTMLElement | null>(null);

  // Portal setup
  useEffect(() => {
    let container = document.getElementById("tv-leftbar-flyout-portal");
    if (!container) {
      container = document.createElement("div");
      container.id = "tv-leftbar-flyout-portal";
      document.body.appendChild(container);
    }
    portalRoot.current = container;
    setMounted(true);
  }, []);

  // Close on Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // Arrow key navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, group.tools.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const tool = group.tools[focusIndex];
        if (tool && isToolEnabled(tool.id)) {
          onSelectTool(tool.id);
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [focusIndex, group.tools, onClose, onSelectTool]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to avoid immediate close from the button click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Focus first enabled tool on open
  useEffect(() => {
    const firstEnabledIndex = group.tools.findIndex((t) => isToolEnabled(t.id));
    setFocusIndex(firstEnabledIndex >= 0 ? firstEnabledIndex : 0);
  }, [group.tools]);

  const handleToolClick = useCallback(
    (tool: ToolDefinition) => {
      if (!isToolEnabled(tool.id)) return;
      onSelectTool(tool.id);
      onClose();
    },
    [onSelectTool, onClose]
  );

  if (!mounted || !portalRoot.current || !anchorRect) return null;

  // Position flyout to the right of anchor button
  const flyoutStyle: React.CSSProperties = {
    position: "fixed",
    top: anchorRect.top,
    left: anchorRect.right + 8, // 8px gap from button
    zIndex: 9999,
  };

  return createPortal(
    <div
      ref={flyoutRef}
      className="
        bg-slate-900/98 backdrop-blur-md
        border border-slate-700/60
        rounded-lg shadow-2xl
        min-w-[200px] max-w-[280px]
        overflow-hidden
      "
      style={flyoutStyle}
      data-testid="lefttoolbar-flyout"
      role="menu"
      aria-label={`${group.label} tools`}
    >
      {/* Header */}
      <div
        className="
          px-3 py-2
          border-b border-slate-700/40
          text-xs font-medium text-slate-400 uppercase tracking-wider
        "
      >
        {group.label}
      </div>

      {/* Tool list */}
      <div className="py-1">
        {group.tools.map((tool, index) => {
          const enabled = isToolEnabled(tool.id);
          const isActive = activeTool === tool.id;
          const isFocused = focusIndex === index;

          return (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool)}
              disabled={!enabled}
              data-testid={`lefttoolbar-tool-${tool.id}`}
              data-tool-id={tool.id}
              role="menuitem"
              aria-disabled={!enabled}
              className={`
                w-full flex items-center gap-3 px-3 py-2
                text-left text-sm transition-colors
                ${isFocused ? "bg-slate-800/60" : ""}
                ${isActive && enabled ? "bg-purple-600/20 text-purple-300" : ""}
                ${enabled 
                  ? "text-slate-200 hover:bg-slate-800/80 cursor-pointer" 
                  : "text-slate-500 cursor-not-allowed opacity-50"
                }
              `}
            >
              {/* Icon */}
              <span className="w-6 text-center text-lg">
                {tool.icon}
              </span>

              {/* Label + shortcut */}
              <span className="flex-1">{tool.label}</span>

              {/* Shortcut badge */}
              {tool.shortcut && enabled && (
                <span className="text-xs text-slate-500 font-mono bg-slate-800/60 px-1.5 py-0.5 rounded">
                  {tool.shortcut}
                </span>
              )}

              {/* Coming soon badge for disabled */}
              {!enabled && (
                <span className="text-[10px] text-slate-600 italic">
                  {tool.tooltip || "Soon"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    portalRoot.current
  );
}

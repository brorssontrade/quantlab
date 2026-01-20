/**
 * LeftToolbar.tsx
 * Vertical toolbar with drawing tools for ChartsPro.
 * Tools: Select, Trendline, H-line, V-line, Channel, Rectangle, Text/Note.
 * Active tool synced to dump().ui.activeTool for testing.
 *
 * TV-3.9: Responsive behavior
 * - Desktop (≥768px): Vertical toolbar in tv-leftbar grid slot
 * - Mobile (<768px): Floating horizontal pill (overlay, touch-friendly)
 *
 * NOTE: MobilePill uses React Portal to escape tv-leftbar container
 * which is hidden on mobile. The pill is portaled to document.body.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Undo2, Trash2, Maximize2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tool } from "../../state/controls";

interface LeftToolbarProps {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
}

const tools: Array<{ id: Tool; label: string; icon: React.ReactNode; shortcut?: string }> = [
  { id: "select", label: "Select", icon: "◀", shortcut: "Esc" },
  { id: "trendline", label: "Trendline", icon: "⧹", shortcut: "T" },
  { id: "hline", label: "H-Line", icon: "—", shortcut: "H" },
  { id: "vline", label: "V-Line", icon: "|", shortcut: "V" },
  { id: "channel", label: "Channel", icon: "⫴", shortcut: "C" },
  { id: "rectangle", label: "Rectangle", icon: "□", shortcut: "R" },
  { id: "text", label: "Text", icon: "T", shortcut: "N" },
];

/** Desktop: Vertical toolbar (original layout) */
function DesktopToolbar({ activeTool, onSelectTool }: LeftToolbarProps) {
  return (
    <div
      className="
        hidden md:flex flex-col items-center
        border-r border-slate-800/40
        bg-slate-950/40
      "
      style={{
        gap: 'var(--cp-gap-xs)',
        padding: 'var(--cp-pad) var(--cp-pad-sm)',
      }}
      data-testid="tv-leftbar-container"
    >
      {tools.map((tool) => (
        <Button
          key={tool.id}
          variant={activeTool === tool.id ? "default" : "ghost"}
          size="icon"
          onClick={() => onSelectTool(tool.id)}
          title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
          data-testid={`tool-${tool.id}`}
          className={`h-9 w-9 ${
            activeTool === tool.id
              ? "bg-slate-700 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {tool.icon}
        </Button>
      ))}

      {/* Divider */}
      <div className="my-1 w-6 border-t border-slate-700/60" />

      {/* Utility buttons */}
      <Button
        variant="ghost"
        size="icon"
        title="Undo (Ctrl+Z)"
        data-testid="tool-undo"
        className="h-9 w-9 text-slate-400 hover:text-slate-200"
      >
        <Undo2 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Delete (Del)"
        data-testid="tool-delete"
        className="h-9 w-9 text-slate-400 hover:text-slate-200"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="Fit to content (Ctrl+F)"
        data-testid="tool-fit"
        className="h-9 w-9 text-slate-400 hover:text-slate-200"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Mobile: Floating horizontal pill - uses Portal to escape hidden container */
function MobilePill({ activeTool, onSelectTool }: LeftToolbarProps) {
  const [expanded, setExpanded] = useState(true);
  const [mounted, setMounted] = useState(false);
  const portalRoot = useRef<HTMLElement | null>(null);

  // Find or create portal mount point
  useEffect(() => {
    // Look for existing portal container or use body
    let container = document.getElementById("tv-leftbar-pill-portal");
    if (!container) {
      container = document.createElement("div");
      container.id = "tv-leftbar-pill-portal";
      document.body.appendChild(container);
    }
    portalRoot.current = container;
    setMounted(true);

    return () => {
      // Cleanup on unmount (optional, can leave for reuse)
    };
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
        className="
          pointer-events-auto
          flex items-center
          bg-slate-900/95 backdrop-blur-sm
          border border-slate-700/60
          rounded-full shadow-lg
        "
        style={{
          gap: 'var(--cp-gap-xs)',
          padding: 'var(--cp-pad-xs) var(--cp-pad-sm)',
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
          className="h-10 w-10 text-slate-400 hover:text-slate-200 flex-shrink-0"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>

        {expanded && (
          <>
            {/* Divider */}
            <div className="h-6 w-px bg-slate-700/60" />

            {/* Drawing tools */}
            {tools.map((tool) => (
              <Button
                key={tool.id}
                variant={activeTool === tool.id ? "default" : "ghost"}
                size="icon"
                onClick={() => onSelectTool(tool.id)}
                title={tool.label}
                data-testid={`tool-${tool.id}`}
                className={`h-10 w-10 text-lg ${
                  activeTool === tool.id
                    ? "bg-slate-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tool.icon}
              </Button>
            ))}

            {/* Divider */}
            <div className="h-6 w-px bg-slate-700/60" />

            {/* Utility buttons (only Undo + Delete for mobile) */}
            <Button
              variant="ghost"
              size="icon"
              title="Undo"
              data-testid="tool-undo"
              className="h-10 w-10 text-slate-400 hover:text-slate-200"
            >
              <Undo2 className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              title="Delete"
              data-testid="tool-delete"
              className="h-10 w-10 text-slate-400 hover:text-slate-200"
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


export function LeftToolbar({ activeTool, onSelectTool }: LeftToolbarProps) {
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
      {!isMobile && <DesktopToolbar activeTool={activeTool} onSelectTool={onSelectTool} />}

      {/* Mobile: Floating pill overlay (only renders on mobile) */}
      {isMobile && <MobilePill activeTool={activeTool} onSelectTool={onSelectTool} />}
    </>
  );
}

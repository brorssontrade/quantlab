/**
 * PaneDivider - Resizable divider between panes
 */

import React, { useCallback, useRef, useEffect } from "react";

interface PaneDividerProps {
  /** Index of this divider (0 = top divider price↔pane[0], 1+ = between panes) */
  index: number;
  /** Whether this divider is draggable */
  draggable?: boolean;
  /** Callback when drag changes pane heights */
  onResize: (index: number, deltaY: number) => void;
  /** Callback when drag starts */
  onResizeStart?: () => void;
  /** Callback when drag ends */
  onResizeEnd?: () => void;
}

export function PaneDivider({ 
  index, 
  draggable = true,
  onResize, 
  onResizeStart, 
  onResizeEnd 
}: PaneDividerProps) {
  const isDragging = useRef(false);
  const lastY = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    lastY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onResizeStart?.();
  }, [draggable, onResizeStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const deltaY = e.clientY - lastY.current;
    lastY.current = e.clientY;
    onResize(index, deltaY);
  }, [index, onResize]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onResizeEnd?.();
  }, [onResizeEnd]);

  // Handle escape key to cancel drag
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDragging.current) {
        isDragging.current = false;
        onResizeEnd?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onResizeEnd]);

  // Theme-adaptive colors - these CSS variables are set by the theme system
  // Light mode: lighter backgrounds with darker borders
  // Dark mode: darker backgrounds with subtle borders
  return (
    <div
      className={`pane-divider ${draggable ? 'pane-divider-draggable' : ''}`}
      data-testid={`pane-divider-${index}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        height: 6,
        cursor: draggable ? "ns-resize" : "default",
        // Use theme-adaptive panel background - falls back gracefully
        backgroundColor: "var(--chart-pane-divider-bg, var(--tv-panel-bg, hsl(var(--muted))))",
        borderTop: "1px solid var(--chart-border, var(--tv-border, hsl(var(--border))))",
        borderBottom: "1px solid var(--chart-border, var(--tv-border, hsl(var(--border))))",
        position: "relative",
        zIndex: 10,
        touchAction: draggable ? "none" : "auto",
        userSelect: "none",
      }}
    >
      {/* Visual indicator on hover - only show for draggable dividers */}
      {draggable && (
        <div
          className="pane-divider-handle"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 40,
            height: 3,
            borderRadius: 2,
            // Theme-adaptive handle color
            backgroundColor: "var(--chart-border, var(--tv-border, hsl(var(--border))))",
            transition: "background-color 0.15s",
          }}
        />
      )}
      <style>{`
        .pane-divider-draggable:hover .pane-divider-handle,
        .pane-divider-draggable:active .pane-divider-handle {
          background-color: var(--chart-accent, var(--tv-blue, hsl(var(--primary)))) !important;
        }
      `}</style>
    </div>
  );
}

export default PaneDivider;

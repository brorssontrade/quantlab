/**
 * FloatingToolbar.tsx
 * 
 * TV-30.1: Quick-edit toolbar for selected drawings
 * TV-30.2a: Added stroke/fill opacity sliders
 * 
 * Appears when a drawing is selected (and drawingsHidden=false).
 * Provides fast access to:
 * - Line color (pen icon)
 * - Fill color (paint bucket) - for shapes/channels
 * - Stroke opacity (0-100%)
 * - Fill opacity (0-100%) - for shapes
 * - Line thickness (1-4px)
 * - Line style (solid/dashed/dotted)
 * - Lock toggle (per-object)
 * - Delete (trash)
 * 
 * Positioning:
 * - Anchored at selection bounds top-center
 * - Clamped to viewport to prevent overflow
 * - Draggable with persist to localStorage
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Drawing, DrawingStyle } from "../../types";
import {
  Trash2,
  Lock,
  Unlock,
  Palette,
  PaintBucket,
  Minus,
  MoreHorizontal,
  GripVertical,
  Droplets,
  Settings,
  Bell,
  Eye,
  EyeOff,
  Bookmark,
  Type,
  ArrowUpToLine,
  ArrowDownToLine,
} from "lucide-react";
import { PresetMenu } from "./PresetMenu";
import type { Preset, PresetStyle } from "../../presetStore";
import { extractStyleFromDrawing } from "../../presetStore";

// Types for drawing capabilities
interface DrawingCapabilities {
  hasStroke: boolean;
  hasFill: boolean;
  hasLineStyle: boolean;
  supportsAlert: boolean;
}

// Determine what styling options a drawing type supports
function getDrawingCapabilities(kind: Drawing["kind"]): DrawingCapabilities {
  const shapesWithFill = ["rectangle", "circle", "ellipse", "triangle", "channel", "flatTopChannel", "flatBottomChannel"];
  // TV-30.4: Line-based drawings that support alerts
  const alertSupportedKinds = ["hline", "trend", "ray", "extendedLine"];
  const hasStroke = true; // All drawings have stroke
  const hasFill = shapesWithFill.includes(kind);
  const hasLineStyle = true; // All line-based drawings support dash styles
  const supportsAlert = alertSupportedKinds.includes(kind);
  
  return { hasStroke, hasFill, hasLineStyle, supportsAlert };
}

// Predefined color palette (TradingView-style)
const COLOR_PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#ffffff", // white
  "#94a3b8", // gray
];

// Line thickness options
const THICKNESS_OPTIONS = [1, 2, 3, 4] as const;

// Line style options
const LINE_STYLE_OPTIONS: Array<{ value: number[] | null; label: string; icon: React.ReactNode }> = [
  { value: null, label: "Solid", icon: <Minus className="w-4 h-4 pointer-events-none" /> },
  { value: [6, 4], label: "Dashed", icon: <MoreHorizontal className="w-4 h-4 pointer-events-none" /> },
  { value: [2, 2], label: "Dotted", icon: <span className="text-xs pointer-events-none">···</span> },
];

interface FloatingToolbarProps {
  drawing: Drawing;
  bounds: { x: number; y: number; width: number; height: number } | null;
  containerRef: React.RefObject<HTMLElement | null>;
  onUpdateStyle: (style: Partial<DrawingStyle>) => void;
  onUpdateFill: (fillColor: string, fillOpacity?: number) => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onOpenSettings: () => void;
  onCreateAlert: () => void;
  onApplyPreset: (preset: Preset) => void;
  onEditLabel: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  drawingsHidden: boolean;
}

const STORAGE_KEY = "cp.floatingToolbar.offset";
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_MIN_WIDTH = 200;

export function FloatingToolbar({
  drawing,
  bounds,
  containerRef,
  onUpdateStyle,
  onUpdateFill,
  onToggleLock,
  onToggleHidden,
  onDelete,
  onOpenSettings,
  onCreateAlert,
  onApplyPreset,
  onEditLabel,
  onBringToFront,
  onSendToBack,
  drawingsHidden,
}: FloatingToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const presetButtonRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [userOffset, setUserOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showColorPicker, setShowColorPicker] = useState<"stroke" | "fill" | null>(null);
  const [showThicknessPicker, setShowThicknessPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showStrokeOpacityPicker, setShowStrokeOpacityPicker] = useState(false);
  const [showFillOpacityPicker, setShowFillOpacityPicker] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; offsetX: number; offsetY: number } | null>(null);

  const capabilities = useMemo(() => getDrawingCapabilities(drawing.kind), [drawing.kind]);

  // Load persisted offset on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setUserOffset(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save offset when it changes
  useEffect(() => {
    if (userOffset.x !== 0 || userOffset.y !== 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userOffset));
      } catch {
        // Ignore storage errors
      }
    }
  }, [userOffset]);

  // Handle drag start - TV-30.1c: Use pointer events for more robust drag
  const handleDragStart = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Capture pointer for stable drag even if cursor leaves element
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      offsetX: userOffset.x,
      offsetY: userOffset.y,
    };
  }, [userOffset]);

  // Handle drag move - TV-30.1c: Use pointer events
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setUserOffset({
        x: dragStartRef.current.offsetX + dx,
        y: dragStartRef.current.offsetY + dy,
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowColorPicker(null);
        setShowThicknessPicker(false);
        setShowStylePicker(false);
        setShowStrokeOpacityPicker(false);
        setShowFillOpacityPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Don't render if hidden or no bounds
  if (drawingsHidden || !bounds) return null;

  // Calculate position (top-center of bounds, clamped to viewport)
  const container = containerRef.current;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  
  // Position at top-center of selection bounds
  let posX = bounds.x + bounds.width / 2 + userOffset.x;
  let posY = bounds.y - TOOLBAR_HEIGHT - 8 + userOffset.y; // 8px gap above selection

  // Clamp to container bounds
  const toolbarWidth = toolbarRef.current?.offsetWidth || TOOLBAR_MIN_WIDTH;
  posX = Math.max(toolbarWidth / 2 + 4, Math.min(containerRect.width - toolbarWidth / 2 - 4, posX));
  posY = Math.max(4, Math.min(containerRect.height - TOOLBAR_HEIGHT - 4, posY));

  // If toolbar would be above container top, place it below selection instead
  if (posY < 4) {
    posY = bounds.y + bounds.height + 8 + userOffset.y;
    posY = Math.min(containerRect.height - TOOLBAR_HEIGHT - 4, posY);
  }

  const currentColor = drawing.style?.color || "#3b82f6";
  const currentWidth = drawing.style?.width || 2;
  const currentDash = drawing.style?.dash;
  const currentStrokeOpacity = drawing.style?.opacity ?? 1; // TV-30.2a: default fully opaque
  const currentFillColor = (drawing as any).fillColor || "#3b82f6";
  const currentFillOpacity = (drawing as any).fillOpacity ?? 0.10; // default 10%

  return createPortal(
    <div
      ref={toolbarRef}
      data-testid="floating-toolbar"
      data-overlay-ui="true"
      className="absolute z-50 flex items-center gap-1 px-2 py-1 cp-overlay-panel select-none pointer-events-auto"
      style={{
        left: posX,
        top: posY,
        transform: "translateX(-50%)",
        cursor: isDragging ? "grabbing" : "default",
      }}
      // TV-30.1c: Pointer isolation for DrawingLayer is handled in DrawingLayer.tsx
      // by checking if event.target is inside floating-toolbar via isEventFromOverlayUI()
    >
      {/* Drag handle */}
      <button
        data-testid="floating-toolbar-drag"
        className="cp-icon-btn cursor-grab active:cursor-grabbing"
        onPointerDown={handleDragStart}
        title="Drag to reposition"
      >
        <GripVertical className="w-4 h-4 pointer-events-none" />
      </button>

      <div className="cp-divider" />

      {/* Stroke Color */}
      <div className="relative">
        <button
          data-testid="floating-toolbar-stroke-color"
          className="cp-icon-btn"
          onClick={() => setShowColorPicker(showColorPicker === "stroke" ? null : "stroke")}
          title="Line color"
        >
          <Palette className="w-4 h-4 pointer-events-none" style={{ color: currentColor }} />
        </button>
        {showColorPicker === "stroke" && (
          <div
            data-testid="floating-toolbar-color-picker"
            className="cp-dropdown grid grid-cols-5 gap-1"
          >
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                data-testid={`color-swatch-${color.replace("#", "")}`}
                className="cp-color-swatch"
                style={{ backgroundColor: color }}
                onClick={() => {
                  onUpdateStyle({ color });
                  setShowColorPicker(null);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* TV-30.2a: Stroke Opacity Slider */}
      <div className="relative">
        <button
          data-testid="floating-toolbar-stroke-opacity"
          className="cp-icon-btn flex items-center gap-1"
          onClick={() => setShowStrokeOpacityPicker(!showStrokeOpacityPicker)}
          title="Line opacity"
        >
          <Droplets className="w-4 h-4 pointer-events-none" style={{ color: currentColor, opacity: currentStrokeOpacity }} />
          <span className="cp-text-secondary text-xs">{Math.round(currentStrokeOpacity * 100)}%</span>
        </button>
        {showStrokeOpacityPicker && (
          <div
            data-testid="floating-toolbar-stroke-opacity-picker"
            className="cp-dropdown w-40 p-3"
          >
            <label className="cp-label mb-2">Stroke Opacity</label>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(currentStrokeOpacity * 100)}
              onChange={(e) => {
                const opacity = parseInt(e.target.value, 10) / 100;
                onUpdateStyle({ opacity });
              }}
              className="cp-slider"
              data-testid="floating-toolbar-stroke-opacity-slider"
            />
            <div className="flex justify-between cp-text-muted text-xs mt-1">
              <span>0%</span>
              <span>{Math.round(currentStrokeOpacity * 100)}%</span>
              <span>100%</span>
            </div>
          </div>
        )}
      </div>

      {/* Fill Color (for shapes) */}
      {capabilities.hasFill && (
        <div className="relative">
          <button
            data-testid="floating-toolbar-fill-color"
            className="cp-icon-btn"
            onClick={() => setShowColorPicker(showColorPicker === "fill" ? null : "fill")}
            title="Fill color"
          >
            <PaintBucket className="w-4 h-4 pointer-events-none" style={{ color: currentFillColor }} />
          </button>
          {showColorPicker === "fill" && (
            <div
              data-testid="floating-toolbar-fill-picker"
              className="cp-dropdown grid grid-cols-5 gap-1"
            >
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  className="cp-color-swatch"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    // Pass undefined for opacity to preserve existing value (callback defaults to 0.10 if none)
                    onUpdateFill(color, undefined);
                    setShowColorPicker(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TV-30.2a: Fill Opacity Slider (for shapes) */}
      {capabilities.hasFill && (
        <div className="relative">
          <button
            data-testid="floating-toolbar-fill-opacity"
            className="cp-icon-btn flex items-center gap-1"
            onClick={() => setShowFillOpacityPicker(!showFillOpacityPicker)}
            title="Fill opacity"
          >
            <div
              className="w-4 h-4 rounded border border-slate-500 pointer-events-none"
              style={{ backgroundColor: currentFillColor, opacity: currentFillOpacity }}
            />
            <span className="cp-text-secondary text-xs">{Math.round(currentFillOpacity * 100)}%</span>
          </button>
          {showFillOpacityPicker && (
            <div
              data-testid="floating-toolbar-fill-opacity-picker"
              className="cp-dropdown w-40 p-3"
            >
              <label className="cp-label mb-2">Fill Opacity</label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(currentFillOpacity * 100)}
                onChange={(e) => {
                  const fillOpacity = parseInt(e.target.value, 10) / 100;
                  onUpdateFill(currentFillColor, fillOpacity);
                }}
                className="cp-slider"
                data-testid="floating-toolbar-fill-opacity-slider"
              />
              <div className="flex justify-between cp-text-muted text-xs mt-1">
                <span>0%</span>
                <span>{Math.round(currentFillOpacity * 100)}%</span>
                <span>100%</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="cp-divider" />

      {/* Line Thickness */}
      <div className="relative">
        <button
          data-testid="floating-toolbar-thickness"
          className="cp-icon-btn flex items-center gap-1"
          onClick={() => setShowThicknessPicker(!showThicknessPicker)}
          title="Line thickness"
        >
          <div
            className="w-4 bg-current rounded-full"
            style={{ height: currentWidth, backgroundColor: currentColor }}
          />
          <span className="cp-text-secondary text-xs">{currentWidth}px</span>
        </button>
        {showThicknessPicker && (
          <div
            data-testid="floating-toolbar-thickness-picker"
            className="cp-dropdown flex flex-col gap-1"
          >
            {THICKNESS_OPTIONS.map((w) => (
              <button
                key={w}
                className={`cp-dropdown-item ${currentWidth === w ? "is-selected" : ""}`}
                onClick={() => {
                  onUpdateStyle({ width: w });
                  setShowThicknessPicker(false);
                }}
              >
                <div
                  className="w-8 bg-current rounded-full"
                  style={{ height: w, backgroundColor: currentColor }}
                />
                <span className="cp-text-secondary text-xs">{w}px</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Line Style */}
      {capabilities.hasLineStyle && (
        <div className="relative">
          <button
            data-testid="floating-toolbar-line-style"
            className="cp-icon-btn"
            onClick={() => setShowStylePicker(!showStylePicker)}
            title="Line style"
          >
            {currentDash ? (
              currentDash[0] > 3 ? <MoreHorizontal className="w-4 h-4 pointer-events-none" /> : <span className="text-xs pointer-events-none">···</span>
            ) : (
              <Minus className="w-4 h-4 pointer-events-none" />
            )}
          </button>
          {showStylePicker && (
            <div
              data-testid="floating-toolbar-style-picker"
              className="cp-dropdown flex flex-col gap-1"
            >
              {LINE_STYLE_OPTIONS.map((style) => {
                const isSelected = 
                  (style.value === null && !currentDash) ||
                  (style.value && currentDash && style.value[0] === currentDash[0]);
                return (
                  <button
                    key={style.label}
                    className={`cp-dropdown-item ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      onUpdateStyle({ dash: style.value });
                      setShowStylePicker(false);
                    }}
                  >
                    {style.icon}
                    <span className="cp-text-secondary text-xs">{style.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="cp-divider" />

      {/* TV-30.6: Style Presets (bookmark) */}
      <button
        ref={presetButtonRef}
        data-testid="floating-toolbar-preset"
        className="cp-icon-btn"
        onClick={() => setShowPresetMenu(!showPresetMenu)}
        title="Style Presets"
      >
        <Bookmark className="w-4 h-4 pointer-events-none" />
      </button>
      {showPresetMenu && (
        <PresetMenu
          kind={drawing.kind}
          currentStyle={extractStyleFromDrawing(drawing as any)}
          anchorRef={presetButtonRef}
          onApplyPreset={(preset) => {
            onApplyPreset(preset);
            setShowPresetMenu(false);
          }}
          onClose={() => setShowPresetMenu(false)}
        />
      )}

      {/* TV-30.7: Edit Label (T icon) */}
      <button
        data-testid="floating-toolbar-label"
        className={`cp-icon-btn ${drawing.label ? "is-active" : ""}`}
        onClick={onEditLabel}
        title={drawing.label ? `Label: ${drawing.label}` : "Add Label"}
      >
        <Type className="w-4 h-4 pointer-events-none" />
      </button>

      {/* TV-30.8: Z-order (Bring to front / Send to back) */}
      <button
        data-testid="floating-toolbar-bring-to-front"
        className="cp-icon-btn"
        onClick={onBringToFront}
        title="Bring to Front"
      >
        <ArrowUpToLine className="w-4 h-4 pointer-events-none" />
      </button>
      <button
        data-testid="floating-toolbar-send-to-back"
        className="cp-icon-btn"
        onClick={onSendToBack}
        title="Send to Back"
      >
        <ArrowDownToLine className="w-4 h-4 pointer-events-none" />
      </button>

      {/* TV-30.4: Create Alert (bell) - only for line-based drawings */}
      {capabilities.supportsAlert && (
        <button
          data-testid="floating-toolbar-alert"
          className="cp-icon-btn"
          onClick={onCreateAlert}
          title="Create Alert"
        >
          <Bell className="w-4 h-4 pointer-events-none" />
        </button>
      )}

      {/* TV-30.5: Toggle Hide (eye) */}
      <button
        data-testid="floating-toolbar-hide"
        className={`cp-icon-btn ${drawing.hidden ? "cp-text-muted" : ""}`}
        onClick={onToggleHidden}
        title={drawing.hidden ? "Show" : "Hide"}
      >
        {drawing.hidden ? <EyeOff className="w-4 h-4 pointer-events-none" /> : <Eye className="w-4 h-4 pointer-events-none" />}
      </button>

      {/* TV-30.3: Object Settings (gear) */}
      <button
        data-testid="floating-toolbar-settings"
        className="cp-icon-btn"
        onClick={onOpenSettings}
        title="Object Settings"
      >
        <Settings className="w-4 h-4 pointer-events-none" />
      </button>

      {/* Lock Toggle */}
      <button
        data-testid="floating-toolbar-lock"
        className={`cp-icon-btn ${drawing.locked ? "is-active" : ""}`}
        onClick={onToggleLock}
        title={drawing.locked ? "Unlock" : "Lock"}
      >
        {drawing.locked ? <Lock className="w-4 h-4 pointer-events-none" /> : <Unlock className="w-4 h-4 pointer-events-none" />}
      </button>

      {/* Delete */}
      <button
        data-testid="floating-toolbar-delete"
        className="cp-icon-btn is-danger"
        onClick={() => {
          onDelete();
        }}
        title="Delete"
      >
        <Trash2 className="w-4 h-4 pointer-events-none" />
      </button>
    </div>,
    container
  );
}

export default FloatingToolbar;

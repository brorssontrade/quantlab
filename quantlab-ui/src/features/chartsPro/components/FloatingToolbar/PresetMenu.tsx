/**
 * PresetMenu.tsx
 * 
 * TV-30.6: Preset dropdown menu for FloatingToolbar
 * 
 * Dropdown that shows:
 * - List of saved presets for current drawing kind
 * - "Save current as preset" option
 * - "Set as default" toggle for each preset
 * - Delete preset option
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookmarkPlus,
  Check,
  Star,
  StarOff,
  Trash2,
  X,
} from "lucide-react";
import type { DrawingKind } from "../../types";
import type { Preset, PresetStyle } from "../../presetStore";
import {
  getPresetsForKind,
  addPreset,
  removePreset,
  getDefaultPreset,
  setDefaultPreset,
} from "../../presetStore";

interface PresetMenuProps {
  kind: DrawingKind;
  currentStyle: PresetStyle;
  anchorRef: React.RefObject<HTMLElement | null>;
  onApplyPreset: (preset: Preset) => void;
  onClose: () => void;
}

export function PresetMenu({
  kind,
  currentStyle,
  anchorRef,
  onApplyPreset,
  onClose,
}: PresetMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");

  // Load presets on mount
  useEffect(() => {
    setPresets(getPresetsForKind(kind));
    setDefaultId(getDefaultPreset(kind)?.id || null);
  }, [kind]);

  // Position menu below anchor
  const [position, setPosition] = useState({ top: 0, left: 0 });
  
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
    });
  }, [anchorRef]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Delay to avoid closing on same click
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 50);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // Handle save preset
  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    
    const newPreset = addPreset(kind, saveName.trim(), currentStyle);
    setPresets(getPresetsForKind(kind));
    setSaveName("");
    setShowSaveForm(false);
    
    // If this is the first preset, make it default
    if (presets.length === 0) {
      setDefaultPreset(kind, newPreset.id);
      setDefaultId(newPreset.id);
    }
  }, [kind, currentStyle, saveName, presets.length]);

  // Handle delete preset
  const handleDelete = useCallback((presetId: string) => {
    removePreset(kind, presetId);
    setPresets(getPresetsForKind(kind));
    if (defaultId === presetId) {
      setDefaultId(null);
    }
  }, [kind, defaultId]);

  // Handle toggle default
  const handleToggleDefault = useCallback((presetId: string) => {
    const newDefaultId = defaultId === presetId ? null : presetId;
    setDefaultPreset(kind, newDefaultId);
    setDefaultId(newDefaultId);
  }, [kind, defaultId]);

  // Style preview (color swatch)
  const renderStylePreview = (style: PresetStyle) => (
    <div className="flex items-center gap-1.5">
      <div
        className="cp-color-swatch"
        style={{ backgroundColor: style.color || "#3b82f6", width: "1rem", height: "1rem" }}
      />
      <span className="cp-text-secondary text-xs">
        {style.width || 2}px
        {style.dash ? " dashed" : ""}
      </span>
    </div>
  );

  return createPortal(
    <div
      ref={menuRef}
      data-testid="preset-menu"
      data-overlay-ui="true"
      className="fixed z-[60] min-w-[200px] cp-modal-panel overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="cp-header">
        <span className="cp-header__title">Style Presets</span>
        <button
          onClick={onClose}
          className="cp-icon-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Preset list */}
      <div className="max-h-[200px] overflow-y-auto">
        {presets.length === 0 ? (
          <div className="px-3 py-4 cp-text-muted text-sm text-center">
            No presets saved yet
          </div>
        ) : (
          presets.map((preset) => (
            <div
              key={preset.id}
              data-testid={`preset-item-${preset.id}`}
              className="cp-dropdown-item group"
            >
              {/* Apply button (main click area) */}
              <button
                onClick={() => onApplyPreset(preset)}
                className="flex-1 flex items-center gap-2 text-left"
                data-testid={`preset-apply-${preset.id}`}
              >
                {renderStylePreview(preset.style)}
                <span className="cp-text-primary text-sm truncate">{preset.name}</span>
              </button>

              {/* Default star */}
              <button
                onClick={() => handleToggleDefault(preset.id)}
                className={`cp-icon-btn ${defaultId === preset.id ? "is-active" : ""}`}
                title={defaultId === preset.id ? "Remove as default" : "Set as default for new drawings"}
                data-testid={`preset-default-${preset.id}`}
              >
                {defaultId === preset.id ? (
                  <Star className="w-4 h-4 fill-current" />
                ) : (
                  <StarOff className="w-4 h-4" />
                )}
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(preset.id)}
                className="cp-icon-btn is-danger opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete preset"
                data-testid={`preset-delete-${preset.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Save form */}
      {showSaveForm ? (
        <div className="border-t border-[var(--cp-overlay-modal-border)] p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Preset name..."
              className="cp-input flex-1"
              autoFocus
              data-testid="preset-save-name"
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="cp-btn-primary px-3 py-1.5"
              data-testid="preset-save-confirm"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setShowSaveForm(false);
                setSaveName("");
              }}
              className="cp-icon-btn"
              data-testid="preset-save-cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-[var(--cp-overlay-modal-border)]">
          <button
            onClick={() => setShowSaveForm(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--cp-overlay-chip-bg)]"
            style={{ color: "var(--cp-overlay-selection, #60a5fa)" }}
            data-testid="preset-save-current"
          >
            <BookmarkPlus className="w-4 h-4" />
            Save current style as preset
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

export default PresetMenu;

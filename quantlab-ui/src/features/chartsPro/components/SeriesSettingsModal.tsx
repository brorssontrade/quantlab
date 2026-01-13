/**
 * SeriesSettingsModal.tsx - Settings UI for color, width, line style, pane, and scale.
 * Sprint 5 - Legend Overlay & Series Controls
 * Sprint 6 - Added pane/scale placement controls
 */

import React from 'react';
import { X } from 'lucide-react';

export interface SeriesSettingsModalProps {
  seriesId: string;
  seriesName: string;
  currentColor: string;
  currentWidth: number;
  currentLineStyle: string;
  currentPane?: 'main' | 'own';
  currentScale?: 'left' | 'right';
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onLineStyleChange: (style: string) => void;
  onPaneChange?: (pane: 'main' | 'own') => void;
  onScaleChange?: (scale: 'left' | 'right') => void;
  onSave: () => void;
  onCancel: () => void;
}

const COLOR_SWATCHES = [
  '#f97316', // orange
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export const SeriesSettingsModal: React.FC<SeriesSettingsModalProps> = ({
  seriesId,
  seriesName,
  currentColor,
  currentWidth,
  currentLineStyle,
  currentPane = 'main',
  currentScale = 'right',
  onColorChange,
  onWidthChange,
  onLineStyleChange,
  onPaneChange,
  onScaleChange,
  onSave,
  onCancel,
}) => {
  return (
    <div
      data-testid="series-settings-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        data-testid={`series-settings-modal-${seriesId}`}
        className="bg-slate-900 rounded-lg shadow-xl p-6 w-full max-w-sm border border-slate-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full border border-slate-600"
              style={{ backgroundColor: currentColor }}
            />
            <h2 className="text-lg font-semibold text-slate-100">{seriesName}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Settings sections */}
        <div className="space-y-4">
          {/* Color picker */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
              Color
            </label>
            <div className="flex gap-2">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  data-testid={`color-swatch-${color}`}
                  onClick={() => onColorChange(color)}
                  className={`h-8 w-8 rounded border-2 transition-all ${
                    currentColor === color
                      ? 'border-sky-400 ring-2 ring-sky-400/30'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Line width */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
              Line Width
            </label>
            <select
              data-testid="line-width-select"
              value={String(currentWidth)}
              onChange={(e) => onWidthChange(Number(e.target.value))}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>

          {/* Line style */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
              Line Style
            </label>
            <select
              data-testid="line-style-select"
              value={currentLineStyle}
              onChange={(e) => onLineStyleChange(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>

          {/* Pane selection (Sprint 6) */}
          {onPaneChange && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
                Pane
              </label>
              <select
                data-testid="pane-select"
                value={currentPane}
                onChange={(e) => onPaneChange(e.target.value as 'main' | 'own')}
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="main">Main Pane</option>
                <option value="own">Own Pane</option>
              </select>
            </div>
          )}

          {/* Scale selection (Sprint 6) */}
          {onScaleChange && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
                Scale
              </label>
              <select
                data-testid="scale-select"
                value={currentScale}
                onChange={(e) => onScaleChange(e.target.value as 'left' | 'right')}
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="left">Left Scale</option>
                <option value="right">Right Scale</option>
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            data-testid="series-settings-save-btn"
            onClick={onSave}
            className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-medium py-2 rounded transition-colors"
          >
            Apply
          </button>
          <button
            type="button"
            data-testid="series-settings-cancel-btn"
            onClick={onCancel}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

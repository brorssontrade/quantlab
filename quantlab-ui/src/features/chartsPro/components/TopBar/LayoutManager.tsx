/**
 * LayoutManager.tsx
 *
 * TV-12: Save/Load manager for chart layouts (TradingView-style)
 *
 * Features:
 * - Overlay panel (non-blocking, closes on Esc/click-outside)
 * - Save current layout with name
 * - Load saved layout
 * - Delete saved layouts
 * - localStorage: cp.layouts.* (JSON)
 * - dump().ui.layout contract
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Trash2, Plus, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';

export interface SavedLayout {
  symbol: string;
  timeframe: string;
  chartType: string;
  savedAt: number;
  [key: string]: unknown;
}

export interface LayoutManagerState {
  activeName?: string;
  savedCount: number;
  lastLoaded?: string;
}

interface LayoutManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, layout: SavedLayout) => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
  currentState: {
    symbol: string;
    timeframe: string;
    chartType: string;
  };
}

export function LayoutManager({
  isOpen,
  onClose,
  onSave,
  onLoad,
  onDelete,
  currentState,
}: LayoutManagerProps) {
  const [savedLayouts, setSavedLayouts] = useState<Record<string, SavedLayout>>({});
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load saved layouts from localStorage
  useEffect(() => {
    const layouts: Record<string, SavedLayout> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cp.layouts.') && key !== 'cp.layouts.active') {
        const name = key.replace('cp.layouts.', '');
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          layouts[name] = data;
        } catch {
          // Skip corrupt entries
        }
      }
    }
    setSavedLayouts(layouts);
  }, [isOpen]);

  // Close on Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      setTimeout(() => {
        window.addEventListener('click', handleClickOutside);
      }, 100);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!saveName.trim()) return;
    const layout: SavedLayout = {
      symbol: currentState.symbol,
      timeframe: currentState.timeframe,
      chartType: currentState.chartType,
      savedAt: Date.now(),
    };
    localStorage.setItem(`cp.layouts.${saveName}`, JSON.stringify(layout));
    onSave(saveName, layout);
    setSaveName('');
    setShowSaveForm(false);
    // Reload list
    setSavedLayouts((prev) => ({ ...prev, [saveName]: layout }));
  };

  const handleLoad = (name: string) => {
    localStorage.setItem('cp.layouts.active', name);
    onLoad(name);
  };

  const handleDelete = (name: string) => {
    localStorage.removeItem(`cp.layouts.${name}`);
    onDelete(name);
    setSavedLayouts((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setDeleteConfirm(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Panel */}
      <Card
        ref={panelRef}
        className="relative w-80 bg-white dark:bg-slate-900 shadow-lg rounded-lg p-4 max-h-96 overflow-y-auto"
        data-testid="layout-manager-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Layouts</h2>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onClose}
            data-testid="layout-close-btn"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Save Form */}
        {showSaveForm && (
          <div className="mb-4 p-3 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Layout name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="flex-1 px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600"
                data-testid="layout-name-input"
                autoFocus
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleSave}
                data-testid="layout-confirm-save-btn"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={() => setShowSaveForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Save Button */}
        {!showSaveForm && (
          <Button
            size="sm"
            className="w-full mb-4 h-8 text-xs"
            onClick={() => setShowSaveForm(true)}
            data-testid="layout-save-btn"
          >
            <Plus className="h-3 w-3 mr-1" />
            Save Current
          </Button>
        )}

        {/* Saved Layouts List */}
        <div className="space-y-2">
          {Object.entries(savedLayouts).map(([name, layout]) => (
            <div
              key={name}
              className="p-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between group"
              onClick={() => {
                if (deleteConfirm !== name) {
                  handleLoad(name);
                }
              }}
              data-testid={`layout-item-${name}`}
            >
              <div className="text-sm flex-1">
                <div className="font-medium">{name}</div>
                <div className="text-xs text-slate-500">
                  {layout.symbol} • {layout.timeframe} • {layout.chartType}
                </div>
              </div>

              {/* Delete Confirmation */}
              {deleteConfirm === name ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-6 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(name);
                    }}
                    data-testid="layout-confirm-delete-btn"
                  >
                    Yes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(null);
                    }}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(name);
                  }}
                  data-testid={`layout-delete-${name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          {Object.keys(savedLayouts).length === 0 && !showSaveForm && (
            <div className="text-xs text-slate-500 text-center py-4">
              No saved layouts yet
            </div>
          )}
        </div>

        {/* Reset to Default Button (TV-12.5) */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs"
            onClick={() => {
              // Clear all saved layouts from localStorage
              const keys = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('cp.layouts.')) {
                  keys.push(key);
                }
              }
              keys.forEach(k => localStorage.removeItem(k));
              setSavedLayouts({});
              onDelete('_reset'); // Signal reset to parent
            }}
            data-testid="layout-reset-btn"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset All
          </Button>
        </div>
      </Card>
    </div>
  );
}

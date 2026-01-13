/**
 * LegendOverlay.tsx - TradingView-style legend overlay positioned in top-left of chart.
 * Handles hover, toggle, solo, reorder, and settings interactions.
 * Sprint 5 - Legend Overlay & Series Controls
 * Sprint 6 - Polish (no layout shift, fixed columns), drag-drop reorder, placement
 */

import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, X, Settings, GripVertical } from 'lucide-react';
import type { LegendRowData } from '../utils/legendModel';
import { hexToRgba, applyDimColor } from '../utils/legendModel';

export interface LegendOverlayProps {
  rows: LegendRowData[];
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onToggleVisibility: (id: string) => void;
  onSolo: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenSettings: (id: string) => void;
  onReorder?: (fromId: string, toId: string) => void;
}

export const LegendOverlay: React.FC<LegendOverlayProps> = ({
  rows,
  hoverId,
  onHover,
  onToggleVisibility,
  onSolo,
  onRemove,
  onOpenSettings,
  onReorder,
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (targetId: string) => {
    if (draggedId && draggedId !== targetId) {
      setDropTargetId(targetId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== targetId && onReorder) {
      onReorder(draggedId, targetId);
      setDraggedId(null);
      setDropTargetId(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTargetId(null);
  };

  return (
    <div
      data-testid="legend-overlay"
      className="absolute top-2 left-2 z-30 bg-slate-950/85 backdrop-blur-sm rounded-lg border border-slate-800/60 py-1 shadow-lg pointer-events-auto"
      style={{ minWidth: 'fit-content' }}
    >
      {rows.length === 0 ? (
        <div className="px-3 py-2 text-xs text-slate-400">No series</div>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => {
            const isHovered = hoverId === row.id;
            const isDimmed = hoverId !== null && hoverId !== row.id;
            const isDropTarget = dropTargetId === row.id;
            
            // Apply dimming via color (no text opacity change for dimmed state)
            const textOpacity = !row.visible ? 'opacity-50' : 'opacity-100';
            const bgHover = isHovered ? 'bg-slate-800/80' : 'hover:bg-slate-800/40';

            return (
              <React.Fragment key={row.id}>
                {/* Drop indicator line (before row) */}
                {draggedId && isDropTarget && draggedId !== row.id && (
                  <div className="h-0.5 bg-blue-500 mx-0" data-testid={`drop-indicator-before-${row.id}`} />
                )}
                
                <div
                  ref={(el) => {
                    rowRefs.current[row.id] = el;
                  }}
                  data-testid={`legend-row-${row.id}`}
                  draggable={onReorder ? true : false}
                  onDragStart={(e) => handleDragStart(e, row.id)}
                  onDragOver={handleDragOver}
                  onDragEnter={() => handleDragEnter(row.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, row.id)}
                  onDragEnd={handleDragEnd}
                  onMouseEnter={() => onHover(row.id)}
                  onMouseLeave={() => onHover(null)}
                  onClick={(e) => {
                    if (e.altKey) {
                      e.stopPropagation();
                      onSolo(row.id);
                    } else {
                      onToggleVisibility(row.id);
                    }
                  }}
                  className={`group relative px-2 py-1.5 flex items-center text-xs text-slate-200 cursor-pointer transition-colors duration-150 ${bgHover} ${
                    draggedId === row.id ? 'opacity-60 bg-slate-700/60' : ''
                  }`}
                style={{ 
                  minHeight: '24px',
                  display: 'grid',
                  gridTemplateColumns: 'auto auto 1fr auto auto', // [handle] [marker] [name+value] [error] [actions]
                  gap: '6px',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                {/* Drag handle (fixed width) */}
                {onReorder && (
                  <div 
                    data-testid={`legend-handle-${row.id}`}
                    className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-3 w-3 text-slate-500" />
                  </div>
                )}

                {/* Color indicator (fixed width) */}
                <div
                  data-testid={`legend-marker-${row.id}`}
                  className="flex-shrink-0 h-2 w-2 rounded-full border border-slate-600 transition-colors duration-150"
                  style={{
                    backgroundColor: isDimmed ? applyDimColor(row.colorHint, 0.35) : row.colorHint,
                    opacity: row.visible ? 1 : 0.4,
                  }}
                />

                {/* Series name & last value (flex) */}
                <div className={`flex-1 flex flex-col gap-0.5 min-w-0 ${textOpacity} transition-opacity duration-150`}>
                  <span className="font-semibold leading-tight truncate">{row.symbol}</span>
                  {row.lastValue && (
                    <span className="text-[10px] text-slate-400 leading-tight truncate">
                      {row.lastValue}
                    </span>
                  )}
                </div>

                {/* Error chip - shows when compare status is error */}
                {row.status === 'error' && (
                  <div
                    data-testid={`legend-error-${row.id}`}
                    className="flex-shrink-0 h-5 w-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center"
                    title={row.statusError || 'Error loading data'}
                  >
                    <span className="text-xs text-red-400 font-bold">!</span>
                  </div>
                )}

                {/* Actions (fixed width, always present for layout) */}
                <div
                  className={`flex items-center gap-1 flex-shrink-0 transition-opacity duration-150 ${
                    isHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                  }`}
                  style={{ minWidth: isHovered ? 'auto' : '0px' }}
                >
                  <button
                    type="button"
                    data-testid={`legend-settings-${row.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSettings(row.id);
                    }}
                    className="p-1 rounded hover:bg-slate-700/60 transition-colors"
                    title="Settings"
                  >
                    <Settings className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                  <button
                    type="button"
                    data-testid={`legend-toggle-${row.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(row.id);
                    }}
                    className="p-1 rounded hover:bg-slate-700/60 transition-colors"
                    title={row.visible ? 'Hide' : 'Show'}
                  >
                    {row.visible ? (
                      <Eye className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </button>
                  {!row.isBase && (
                    <button
                      type="button"
                      data-testid={`legend-remove-${row.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(row.id);
                      }}
                      className="p-1 rounded hover:bg-red-900/40 transition-colors"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

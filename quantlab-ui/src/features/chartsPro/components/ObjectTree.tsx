import { useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { GripVertical, Eye, EyeOff, Lock, Unlock, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { Drawing, Tf } from "../types";
import { describeTrend } from "../types";

interface ObjectTreeProps {
  drawings: Drawing[];
  selectedId: string | null;
  timeframe: Tf;
  onSelect: (id: string | null) => void;
  onToggleLock: (id: string) => void;
  onToggleHide: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onReorder: (id: string, targetIndex: number) => void;
}

export function ObjectTree({
  drawings,
  selectedId,
  timeframe,
  onSelect,
  onToggleHide,
  onToggleLock,
  onDelete,
  onRename,
  onReorder,
}: ObjectTreeProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sorted = useMemo(() => [...drawings].sort((a, b) => a.z - b.z), [drawings]);

  const beginRename = (drawing: Drawing) => {
    setEditingId(drawing.id);
    setDraftLabel(drawing.label || formatKind(drawing.kind));
  };

  const commitRename = () => {
    if (!editingId) return;
    onRename(editingId, draftLabel);
    setEditingId(null);
    setDraftLabel("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setDraftLabel("");
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, id: string) => {
    if (editingId) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
    setDragOverId(id);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggingId) return;
    event.preventDefault();
    if (targetId === dragOverId) return;
    setDragOverId(targetId);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string | null) => {
    if (!draggingId) return;
    event.preventDefault();
    const fallbackIndex = Math.max(sorted.length - 1, 0);
    const targetIndex =
      targetId === null ? fallbackIndex : sorted.findIndex((item) => item.id === targetId);
    if (targetIndex >= 0) {
      onReorder(draggingId, targetIndex);
    }
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Objects</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-500">Inga ritobjekt annu.</p>
        ) : (
          <>
            {sorted.map((drawing) => {
              const isSelected = drawing.id === selectedId;
              const isEditing = editingId === drawing.id;
              const isDragging = draggingId === drawing.id;
              const isDragOver = dragOverId === drawing.id && draggingId !== drawing.id;
              const summary =
                drawing.kind === "trend" ? describeTrend(drawing, timeframe).label : undefined;
              return (
                <div
                  key={drawing.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  draggable={!isEditing}
                  onDragStart={(event) => handleDragStart(event, drawing.id)}
                  onDragOver={(event) => handleDragOver(event, drawing.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={(event) => handleDrop(event, drawing.id)}
                  onClick={() => onSelect(isSelected ? null : drawing.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(isSelected ? null : drawing.id);
                    }
                  }}
                  className={cn(
                    "chartspro-object-row rounded border px-3 py-2 text-sm transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    isSelected ? "border-blue-500 bg-blue-500/5" : "border-slate-200",
                    isDragging && "opacity-70",
                    isDragOver && "ring-1 ring-blue-400",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      className="mt-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                      aria-label="Drag to reorder"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            autoFocus
                            value={draftLabel}
                            onChange={(event) => setDraftLabel(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitRename();
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            onBlur={commitRename}
                            className="h-7 px-2 text-sm"
                          />
                        ) : (
                          <button
                            type="button"
                            className="flex-1 text-left font-medium capitalize"
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              beginRename(drawing);
                            }}
                          >
                            {drawing.label || formatKind(drawing.kind)}
                          </button>
                        )}
                        <div className="flex items-center gap-1">
                          <IconButton
                            label={drawing.hidden ? "Show" : "Hide"}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleHide(drawing.id);
                            }}
                          >
                            {drawing.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </IconButton>
                          <IconButton
                            label={drawing.locked ? "Unlock" : "Lock"}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleLock(drawing.id);
                            }}
                          >
                            {drawing.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          </IconButton>
                          <IconButton
                            label="Delete"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(drawing.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">
                        {summary ?? `${formatKind(drawing.kind)} - ${drawing.tf}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div
              className="h-2"
              onDragOver={(event) => {
                if (!draggingId) return;
                event.preventDefault();
                setDragOverId(null);
              }}
              onDrop={(event) => handleDrop(event, null)}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      onMouseDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      title={label}
      aria-label={label}
      className="h-7 w-7 text-slate-600 hover:text-slate-900"
    >
      {children}
    </Button>
  );
}

function formatKind(kind: Drawing["kind"]) {
  switch (kind) {
    case "hline":
      return "Hline";
    case "vline":
      return "Vline";
    case "trend":
      return "Trend";
    case "channel":
      return "Channel";
    default:
      return kind;
  }
}

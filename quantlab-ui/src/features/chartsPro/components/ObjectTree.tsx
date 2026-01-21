import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { GripVertical, Eye, EyeOff, Lock, Unlock, Trash2, Edit3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as ContextMenu from "@radix-ui/react-context-menu";

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
    <Card className="h-full flex flex-col" data-testid="objecttree-card">
      <CardHeader>
        <CardTitle>Objects</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-2 overflow-hidden">
        <div
          className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-1.5 text-xs font-medium border-b sticky top-0"
          style={{
            color: "var(--cp-panel-text-muted)",
            backgroundColor: "var(--cp-panel-header-bg)",
            borderColor: "var(--cp-panel-border)",
          }}
          data-testid="objecttree-header-row"
        >
          <div data-testid="objecttree-header-name">Name</div>
          <div className="w-7 text-center" title="Visible" data-testid="objecttree-header-visible">
            <Eye className="h-3.5 w-3.5 mx-auto" />
          </div>
          <div className="w-7 text-center" title="Locked" data-testid="objecttree-header-locked">
            <Lock className="h-3.5 w-3.5 mx-auto" />
          </div>
          <div className="w-7 text-center" title="Reorder" data-testid="objecttree-header-reorder">
            <GripVertical className="h-3.5 w-3.5 mx-auto" />
          </div>
          <div className="w-7 text-center" title="Delete" data-testid="objecttree-header-delete">
            <Trash2 className="h-3.5 w-3.5 mx-auto" />
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="px-3 py-2" data-testid="objecttree-empty">
            <p className="text-sm text-slate-500">Inga ritobjekt ännu.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2" data-testid="objecttree-rows">
            {sorted.map((drawing) => {
              const isSelected = drawing.id === selectedId;
              const isEditing = editingId === drawing.id;
              const isDragging = draggingId === drawing.id;
              const isDragOver = dragOverId === drawing.id && draggingId !== drawing.id;
              const summary =
                drawing.kind === "trend" ? describeTrend(drawing, timeframe).label : undefined;
              return (
                <ContextMenu.Root key={drawing.id}>
                  <ContextMenu.Trigger asChild>
                    <div
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
                        "grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        isSelected ? "border-blue-500 bg-blue-500/5" : "border-slate-200",
                        isDragging && "opacity-70",
                        isDragOver && "ring-2 ring-blue-400"
                      )}
                      data-testid={`objecttree-row-${drawing.id}`}
                    >
                      <div className="truncate" title={drawing.label || formatKind(drawing.kind)}>
                        {isEditing ? (
                          <Input
                            value={draftLabel}
                            onChange={(event) => setDraftLabel(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                commitRename();
                              } else if (event.key === "Escape") {
                                cancelRename();
                              }
                            }}
                            onBlur={commitRename}
                            autoFocus
                            data-testid="objecttree-rename-input"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{drawing.label || formatKind(drawing.kind)}</span>
                            {summary && <span className="text-xs text-slate-500">{summary}</span>}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "h-8 w-8",
                          drawing.hidden ? "text-slate-400" : "text-slate-700",
                          "hover:text-slate-900"
                        )}
                        onClick={(event: MouseEvent) => {
                          event.stopPropagation();
                          onToggleHide(drawing.id);
                        }}
                        title={drawing.hidden ? "Show" : "Hide"}
                        data-testid={`objecttree-hide-${drawing.id}`}
                      >
                        {drawing.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "h-8 w-8",
                          drawing.locked ? "text-slate-400" : "text-slate-700",
                          "hover:text-slate-900"
                        )}
                        onClick={(event: MouseEvent) => {
                          event.stopPropagation();
                          onToggleLock(drawing.id);
                        }}
                        title={drawing.locked ? "Unlock" : "Lock"}
                        data-testid={`objecttree-lock-${drawing.id}`}
                      >
                        {drawing.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </Button>
                      <div
                        className="flex items-center justify-center"
                        draggable
                        onDragStart={(event) => handleDragStart(event, drawing.id)}
                        onDragOver={(event) => handleDragOver(event, drawing.id)}
                        onDragEnd={handleDragEnd}
                        onDrop={(event) => handleDrop(event, null)}
                        data-testid={`objecttree-drag-${drawing.id}`}
                      >
                        <GripVertical className={cn("h-4 w-4 text-slate-400", isDragging && "opacity-50")} />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-slate-700 hover:text-red-600"
                        onClick={(event: MouseEvent) => {
                          event.stopPropagation();
                          onDelete(drawing.id);
                        }}
                        title="Delete"
                        data-testid={`objecttree-delete-${drawing.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content
                      className="min-w-[200px] rounded-md shadow-lg border p-1 z-50"
                      style={{
                        backgroundColor: "var(--cp-menu-bg)",
                        borderColor: "var(--cp-panel-border)",
                      }}
                      sideOffset={5}
                    >
                      <ContextMenu.Item
                        className="flex items-center gap-2 px-3 py-2 text-sm outline-none cursor-pointer rounded"
                        style={{
                          color: "var(--cp-panel-text)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cp-menu-hover-bg)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onSelect={() => beginRename(drawing)}
                        data-testid={`objecttree-ctx-rename-${drawing.id}`}
                      >
                        <Edit3 className="h-4 w-4" />
                        <span>Edit/Rename</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="flex items-center gap-2 px-3 py-2 text-sm outline-none cursor-pointer rounded"
                        style={{
                          color: "var(--cp-panel-text)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cp-menu-hover-bg)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onSelect={() => onToggleLock(drawing.id)}
                        data-testid={`objecttree-ctx-lock-${drawing.id}`}
                      >
                        {drawing.locked ? (
                          <>
                            <Unlock className="h-4 w-4" />
                            <span>Unlock</span>
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4" />
                            <span>Lock</span>
                          </>
                        )}
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="flex items-center gap-2 px-3 py-2 text-sm outline-none cursor-pointer rounded"
                        style={{
                          color: "var(--cp-panel-text)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cp-menu-hover-bg)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onSelect={() => onToggleHide(drawing.id)}
                        data-testid={`objecttree-ctx-hide-${drawing.id}`}
                      >
                        {drawing.hidden ? (
                          <>
                            <Eye className="h-4 w-4" />
                            <span>Show</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-4 w-4" />
                            <span>Hide</span>
                          </>
                        )}
                      </ContextMenu.Item>
                      <ContextMenu.Separator
                        className="h-px my-1"
                        style={{ backgroundColor: "var(--cp-panel-border)" }}
                      />
                      <ContextMenu.Item
                        className="flex items-center gap-2 px-3 py-2 text-sm outline-none cursor-pointer rounded text-red-600"
                        style={{
                          color: "rgba(220, 38, 38, 1)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(220, 38, 38, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onSelect={() => onDelete(drawing.id)}
                        data-testid={`objecttree-ctx-delete-${drawing.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
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
          </div>
        )}
      </CardContent>
    </Card>
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

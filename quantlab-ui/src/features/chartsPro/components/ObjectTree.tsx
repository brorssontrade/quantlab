import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { GripVertical, Eye, EyeOff, Lock, Unlock, Trash2, Edit3 } from "lucide-react";
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
    <div className="h-full flex flex-col" data-testid="objecttree-card" style={{ backgroundColor: "var(--tv-panel, #1e222d)" }}>
      <div className="px-2 py-1.5 border-b" style={{ borderColor: "var(--tv-border, #363a45)" }}>
        <h3 className="text-[11px] font-medium" style={{ color: "var(--tv-text-muted, #787b86)" }}>Objects</h3>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-1.5 px-2 py-1 text-[10px] font-medium border-b sticky top-0"
          style={{
            color: "var(--tv-text-muted, #787b86)",
            backgroundColor: "var(--tv-panel, #1e222d)",
            borderColor: "var(--tv-border, #363a45)",
          }}
          data-testid="objecttree-header-row"
        >
          <div data-testid="objecttree-header-name">Name</div>
          <div className="w-6 text-center" title="Visible" data-testid="objecttree-header-visible">
            <Eye className="h-3 w-3 mx-auto" />
          </div>
          <div className="w-6 text-center" title="Locked" data-testid="objecttree-header-locked">
            <Lock className="h-3 w-3 mx-auto" />
          </div>
          <div className="w-6 text-center" title="Reorder" data-testid="objecttree-header-reorder">
            <GripVertical className="h-3 w-3 mx-auto" />
          </div>
          <div className="w-6 text-center" title="Delete" data-testid="objecttree-header-delete">
            <Trash2 className="h-3 w-3 mx-auto" />
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="px-2 py-2" data-testid="objecttree-empty">
            <p className="text-[11px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>No objects yet.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 p-1.5" data-testid="objecttree-rows">
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
                        "chartspro-object-row rounded-sm border px-2 py-1 text-[11px] transition",
                        "grid grid-cols-[1fr_auto_auto_auto_auto] gap-1.5 items-center",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff]",
                        isDragging && "opacity-70",
                        isDragOver && "ring-1 ring-[#2962ff]"
                      )}
                      style={{
                        backgroundColor: isSelected ? "var(--tv-bg-secondary, #2a2e39)" : "transparent",
                        borderColor: isSelected ? "var(--tv-blue, #2962ff)" : "var(--tv-border, #363a45)",
                        color: "var(--tv-text, #d1d4dc)",
                      }}
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
                            className="h-5 text-[10px]"
                            style={{ backgroundColor: "var(--tv-bg, #131722)", borderColor: "var(--tv-border, #363a45)", color: "var(--tv-text, #d1d4dc)" }}
                            data-testid="objecttree-rename-input"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{drawing.label || formatKind(drawing.kind)}</span>
                            {summary && <span className="text-[9px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>{summary}</span>}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 rounded-sm"
                        style={{ color: drawing.hidden ? "var(--tv-text-muted, #787b86)" : "var(--tv-text, #d1d4dc)" }}
                        onClick={(event: MouseEvent) => {
                          event.stopPropagation();
                          onToggleHide(drawing.id);
                        }}
                        title={drawing.hidden ? "Show" : "Hide"}
                        data-testid={`objecttree-hide-${drawing.id}`}
                      >
                        {drawing.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 rounded-sm"
                        style={{ color: drawing.locked ? "var(--tv-text-muted, #787b86)" : "var(--tv-text, #d1d4dc)" }}
                        onClick={(event: MouseEvent) => {
                          event.stopPropagation();
                          onToggleLock(drawing.id);
                        }}
                        title={drawing.locked ? "Unlock" : "Lock"}
                        data-testid={`objecttree-lock-${drawing.id}`}
                      >
                        {drawing.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
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
                        <GripVertical className={cn("h-3 w-3", isDragging && "opacity-50")} style={{ color: "var(--tv-text-muted, #787b86)" }} />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 rounded-sm"
                        style={{ color: "var(--tv-text-muted, #787b86)" }}
                        onClick={(event: MouseEvent) => {
                          event.stopPropagation();
                          onDelete(drawing.id);
                        }}
                        title="Delete"
                        data-testid={`objecttree-delete-${drawing.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content
                      className="min-w-[160px] rounded-sm shadow-lg border p-1 z-50"
                      style={{
                        backgroundColor: "var(--tv-panel, #1e222d)",
                        borderColor: "var(--tv-border, #363a45)",
                      }}
                      sideOffset={5}
                    >
                      <ContextMenu.Item
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] outline-none cursor-pointer rounded-sm"
                        style={{
                          color: "var(--tv-text, #d1d4dc)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--tv-bg-secondary, #2a2e39)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onSelect={() => beginRename(drawing)}
                        data-testid={`objecttree-ctx-rename-${drawing.id}`}
                      >
                        <Edit3 className="h-3 w-3" />
                        <span>Edit/Rename</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] outline-none cursor-pointer rounded-sm"
                        style={{
                          color: "var(--tv-text, #d1d4dc)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--tv-bg-secondary, #2a2e39)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onSelect={() => onToggleLock(drawing.id)}
                        data-testid={`objecttree-ctx-lock-${drawing.id}`}
                      >
                        {drawing.locked ? (
                          <>
                            <Unlock className="h-3 w-3" />
                            <span>Unlock</span>
                          </>
                        ) : (
                          <>
                            <Lock className="h-3 w-3" />
                            <span>Lock</span>
                          </>
                        )}
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] outline-none cursor-pointer rounded-sm"
                        style={{
                          color: "var(--tv-text, #d1d4dc)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--tv-bg-secondary, #2a2e39)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onSelect={() => onToggleHide(drawing.id)}
                        data-testid={`objecttree-ctx-hide-${drawing.id}`}
                      >
                        {drawing.hidden ? (
                          <>
                            <Eye className="h-3 w-3" />
                            <span>Show</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3" />
                            <span>Hide</span>
                          </>
                        )}
                      </ContextMenu.Item>
                      <ContextMenu.Separator
                        className="h-px my-1"
                        style={{ backgroundColor: "var(--tv-border, #363a45)" }}
                      />
                      <ContextMenu.Item
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] outline-none cursor-pointer rounded-sm"
                        style={{
                          color: "var(--tv-red, #ef5350)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239, 83, 80, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onSelect={() => onDelete(drawing.id)}
                        data-testid={`objecttree-ctx-delete-${drawing.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              );
            })}
            <div
              className="h-1.5"
              onDragOver={(event) => {
                if (!draggingId) return;
                event.preventDefault();
                setDragOverId(null);
              }}
              onDrop={(event) => handleDrop(event, null)}
            />
          </div>
        )}
      </div>
    </div>
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

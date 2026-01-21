import type { Drawing, Tf } from "../../types";
import { ObjectTree } from "../ObjectTree";

interface ObjectsTabProps {
  drawings: Drawing[];
  selectedId: string | null;
  timeframe: Tf;
  onSelect: (id: string | null) => void;
  onToggleHide: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
}

/**
 * ObjectsTab – Wrapper for ObjectTree in RightPanel tabs.
 * 
 * TV-5: Modular tab content wrapper.
 * Future enhancements (TV-6): TradingView-style table headers, toggles, context menu.
 */
export function ObjectsTab({
  drawings,
  selectedId,
  timeframe,
  onSelect,
  onToggleHide,
  onToggleLock,
  onDelete,
  onRename,
  onReorder,
}: ObjectsTabProps) {
  return (
    <ObjectTree
      drawings={drawings}
      selectedId={selectedId}
      timeframe={timeframe}
      onSelect={onSelect}
      onToggleHide={onToggleHide}
      onToggleLock={onToggleLock}
      onDelete={onDelete}
      onRename={onRename}
      onReorder={onReorder}
    />
  );
}

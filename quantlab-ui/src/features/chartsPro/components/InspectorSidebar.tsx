import { Eye, EyeOff, Trash2 } from "lucide-react";
import type { HoverSnapshot, LegendSnapshot } from "../qaTypes";

type InspectorTab = "objectTree" | "dataWindow";

export type InspectorObject = {
  id: string;
  kind: "base" | "volume" | "compare" | "overlay" | "pane-indicator";
  title: string;
  paneId: string;
  visible: boolean;
  removable?: boolean;
  colorHint?: string | null;
};

interface InspectorSidebarProps {
  open: boolean;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onClose: () => void;
  objects: InspectorObject[];
  hover: HoverSnapshot | null;
  lastLegend: LegendSnapshot | null;
  onToggleVisible: (id: string) => void;
  onRemove: (id: string) => void;
}

export function InspectorSidebar({
  open,
  tab,
  onTabChange,
  onClose,
  objects,
  hover,
  lastLegend,
  onToggleVisible,
  onRemove,
}: InspectorSidebarProps) {
  if (!open) return null;
  const grouped = {
    PRICE: objects.filter((o) => o.kind === "base"),
    VOLUME: objects.filter((o) => o.kind === "volume"),
    COMPARES: objects.filter((o) => o.kind === "compare"),
    INDICATORS: objects.filter((o) => o.kind === "overlay" || o.kind === "pane-indicator"),
  };

  const renderObjectRow = (obj: InspectorObject) => (
    <div
      key={obj.id}
      data-testid={`obj-${obj.id}`}
      className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-800/40"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: obj.colorHint ?? "var(--foreground)" }}
          aria-hidden
        />
        <span className="text-xs text-slate-100">{obj.title}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid={`obj-toggle-${obj.id}`}
          className="text-slate-300 hover:text-slate-50"
          onClick={() => onToggleVisible(obj.id)}
          aria-label={obj.visible ? "Hide" : "Show"}
        >
          {obj.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        {obj.removable ? (
          <button
            type="button"
            data-testid={`obj-remove-${obj.id}`}
            className="text-slate-400 hover:text-rose-300"
            onClick={() => onRemove(obj.id)}
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );

  const renderDataWindow = () => {
    const rows: Array<{ label: string; value: string }> = [];
    const snapshot = hover ?? null;
    const legend = lastLegend ?? null;
    if (snapshot) {
      rows.push(
        { label: "Time", value: new Date(snapshot.time * 1000).toISOString().replace("T", " ").slice(0, 16) },
        { label: "Base O", value: String(snapshot.base.open ?? "-") },
        { label: "Base H", value: String(snapshot.base.high ?? "-") },
        { label: "Base L", value: String(snapshot.base.low ?? "-") },
        { label: "Base C", value: String(snapshot.base.close ?? "-") },
        { label: "Vol", value: String(snapshot.base.volume ?? "-") },
      );
      Object.entries(snapshot.compares ?? {}).forEach(([sym, entry]) => {
        rows.push({ label: `${sym} price`, value: entry.price == null ? "-" : entry.price.toFixed(2) });
        if (entry.percent != null) {
          rows.push({ label: `${sym} %`, value: `${entry.percent.toFixed(2)}%` });
        }
      });
    } else if (legend) {
      rows.push({ label: "Base", value: legend.base.value ?? "-" });
      Object.entries(legend.compares ?? {}).forEach(([sym, entry]) => {
        rows.push({ label: sym, value: entry.value ?? "-" });
      });
    }
    return (
      <div className="space-y-1" data-testid="chartspro-datawindow">
        {rows.length === 0 ? <div className="text-xs text-slate-400">No hover data</div> : null}
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="flex items-center justify-between gap-2 rounded px-2 py-1">
            <span className="text-xs text-slate-300">{row.label}</span>
            <span className="text-xs font-semibold text-slate-100">{row.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <aside
      data-testid="chartspro-inspector"
      className="flex h-full w-72 flex-col border-l border-slate-800/60 bg-slate-900/80 text-slate-100 backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-slate-800/60 px-3 py-2">
        <div className="flex gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          <button
            type="button"
            data-testid="chartspro-inspector-tab-objecttree"
            className={`px-2 py-1 ${tab === "objectTree" ? "rounded bg-slate-700 text-slate-50" : "text-slate-400"}`}
            onClick={() => onTabChange("objectTree")}
          >
            Object Tree
          </button>
          <button
            type="button"
            data-testid="chartspro-inspector-tab-datawindow"
            className={`px-2 py-1 ${tab === "dataWindow" ? "rounded bg-slate-700 text-slate-50" : "text-slate-400"}`}
            onClick={() => onTabChange("dataWindow")}
          >
            Data Window
          </button>
        </div>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-100"
          onClick={onClose}
          aria-label="Close inspector"
        >
          ✕
        </button>
      </div>
      <div className="h-full overflow-y-auto px-3 py-2 text-xs">
        {tab === "objectTree" ? (
          <div className="space-y-4">
            {Object.entries(grouped).map(([group, list]) =>
              list.length ? (
                <div key={group}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</div>
                  <div className="space-y-1">{list.map(renderObjectRow)}</div>
                </div>
              ) : null,
            )}
          </div>
        ) : (
          renderDataWindow()
        )}
      </div>
    </aside>
  );
}

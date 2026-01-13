import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CompareSeriesConfig } from "../types";

interface ComparePanelProps {
  items: CompareSeriesConfig[];
  onAdd: (config: Omit<CompareSeriesConfig, "id">) => CompareSeriesConfig;
  onUpdate: (id: string, patch: Partial<CompareSeriesConfig>) => void;
  onRemove: (id: string) => void;
}

const clampOpacity = (value: number | undefined) => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0.6;
  return Math.min(1, Math.max(0.1, numeric));
};

export function ComparePanel({ items, onAdd, onUpdate, onRemove }: ComparePanelProps) {
  const [symbol, setSymbol] = useState("");
  const [color, setColor] = useState("#f97316");
  const [opacity, setOpacity] = useState(0.6);

  const handleAdd = () => {
    if (!symbol.trim()) return;
    onAdd({
      symbol: symbol.trim().toUpperCase(),
      color,
      opacity: clampOpacity(opacity),
      hidden: false,
    });
    setSymbol("");
  };

  const percentLabel = (value: number | undefined) => `${Math.round(clampOpacity(value) * 100)}%`;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Compare</CardTitle>
        <p className="text-xs text-slate-500">Overlay peer symbols with custom colors.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="compare-symbol" className="text-xs uppercase text-slate-500">
                Symbol
              </Label>
              <Input
                id="compare-symbol"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="MSFT.US"
                className="mt-1 uppercase"
              />
            </div>
            <div>
              <Label htmlFor="compare-color" className="text-xs uppercase text-slate-500">
                Color
              </Label>
              <Input
                id="compare-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="mt-1 h-10 w-16 p-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase text-slate-500">Opacity</Label>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={(event) => setOpacity(Math.min(1, Math.max(0.1, Number(event.target.value) / 100)))}
              className="mt-1 w-full"
            />
            <p className="text-xs text-slate-500">{percentLabel(opacity)}</p>
          </div>
          <Button type="button" size="sm" className="w-full" onClick={handleAdd}>
            Add comparison
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No comparison series yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((entry) => (
              <div key={entry.id} className="rounded border border-slate-200 bg-white p-2 text-sm shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold uppercase tracking-wide">{entry.symbol}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={entry.hidden ? "Show series" : "Hide series"}
                      onClick={() => onUpdate(entry.id, { hidden: !entry.hidden })}
                      className="h-8 w-8"
                    >
                      {entry.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove series"
                      onClick={() => onRemove(entry.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="color"
                    value={entry.color}
                    onChange={(event) => onUpdate(entry.id, { color: event.target.value })}
                    className="h-9 w-14 p-1"
                    id={`compare-color-${entry.id}`}
                  />
                  <div className="flex-1">
                    <Label className="text-xs uppercase text-slate-500">Opacity</Label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round(clampOpacity(entry.opacity) * 100)}
                      onChange={(event) =>
                        onUpdate(entry.id, {
                          opacity: Math.min(1, Math.max(0.1, Number(event.target.value) / 100)),
                        })
                      }
                      className="mt-1 w-full"
                    />
                    <p className="text-xs text-slate-500">{percentLabel(entry.opacity)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

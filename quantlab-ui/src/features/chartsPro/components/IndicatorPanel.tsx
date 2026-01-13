import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { IndicatorInstance, IndicatorKind, IndicatorPane } from "../types";
import { defaultIndicatorParams, indicatorDisplayName } from "../types";

interface IndicatorPanelProps {
  indicators: IndicatorInstance[];
  onAdd: (
    kind: IndicatorKind,
    params?: Partial<IndicatorInstance["params"]>,
    options?: { color?: string; pane?: IndicatorPane },
  ) => IndicatorInstance;
  onUpdate: (id: string, patch: Partial<IndicatorInstance>) => void;
  onRemove: (id: string) => void;
}

const INDICATOR_OPTIONS: IndicatorKind[] = ["sma", "ema", "rsi", "macd"];
const defaultPaneForKind = (kind: IndicatorKind): IndicatorPane => (kind === "rsi" || kind === "macd" ? "separate" : "price");

export function IndicatorPanel({ indicators, onAdd, onUpdate, onRemove }: IndicatorPanelProps) {
  const [kind, setKind] = useState<IndicatorKind>("sma");
  const [color, setColor] = useState("#0ea5e9");
  const defaults = useMemo(() => defaultIndicatorParams(kind), [kind]);
  const [period, setPeriod] = useState<number>("period" in defaults ? defaults.period : 20);
  const [fast, setFast] = useState<number>(12);
  const [slow, setSlow] = useState<number>(26);
  const [signal, setSignal] = useState<number>(9);
  const [pane, setPane] = useState<IndicatorPane>(defaultPaneForKind(kind));

  useEffect(() => {
    if ("period" in defaults) {
      setPeriod(defaults.period);
    } else if (kind === "macd") {
      setFast((defaults as { fast: number }).fast ?? 12);
      setSlow((defaults as { slow: number }).slow ?? 26);
      setSignal((defaults as { signal: number }).signal ?? 9);
    }
    setPane(defaultPaneForKind(kind));
  }, [defaults, kind]);

  const handleAdd = () => {
    if (kind === "macd") {
      onAdd(
        "macd",
        { fast, slow, signal } as Partial<IndicatorInstance["params"]>,
        { color, pane },
      );
      return;
    }
    onAdd(kind, { period } as Partial<IndicatorInstance["params"]>, { color, pane });
  };

  const renderParamEditor = (indicator: IndicatorInstance) => {
    switch (indicator.kind) {
      case "sma":
      case "ema":
      case "rsi": {
        const params = indicator.params as { period: number };
        return (
          <Input
            type="number"
            min={1}
            value={params.period}
            onChange={(event) =>
              onUpdate(
                indicator.id,
                {
                  params: { ...params, period: Number(event.target.value) } as IndicatorInstance["params"],
                } as Partial<IndicatorInstance>,
              )
            }
          />
        );
      }
      case "macd": {
        const params = indicator.params as { fast: number; slow: number; signal: number };
        return (
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="number"
              min={1}
              value={params.fast}
              onChange={(event) =>
                onUpdate(
                  indicator.id,
                  {
                    params: { ...params, fast: Number(event.target.value) } as IndicatorInstance["params"],
                  } as Partial<IndicatorInstance>,
                )
              }
            />
            <Input
              type="number"
              min={1}
              value={params.slow}
              onChange={(event) =>
                onUpdate(
                  indicator.id,
                  {
                    params: { ...params, slow: Number(event.target.value) } as IndicatorInstance["params"],
                  } as Partial<IndicatorInstance>,
                )
              }
            />
            <Input
              type="number"
              min={1}
              value={params.signal}
              onChange={(event) =>
                onUpdate(
                  indicator.id,
                  {
                    params: { ...params, signal: Number(event.target.value) } as IndicatorInstance["params"],
                  } as Partial<IndicatorInstance>,
                )
              }
            />
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Indicators</CardTitle>
        <p className="text-xs text-slate-500">Worker-backed overlays and pane indicators.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <Label htmlFor="indicator-type" className="text-xs uppercase text-slate-500">
            Type
          </Label>
          <select
            id="indicator-type"
            value={kind}
            onChange={(event) => setKind(event.target.value as IndicatorKind)}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm capitalize"
          >
            {INDICATOR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {indicatorDisplayName(option)}
              </option>
            ))}
          </select>

          {kind === "macd" ? (
            <div className="grid grid-cols-3 gap-2">
              <NumberField id="indicator-fast" label="Fast" value={fast} onChange={setFast} />
              <NumberField id="indicator-slow" label="Slow" value={slow} onChange={setSlow} />
              <NumberField id="indicator-signal" label="Signal" value={signal} onChange={setSignal} />
            </div>
          ) : (
            <NumberField id="indicator-period" label="Period" value={period} onChange={setPeriod} />
          )}

          <div>
            <Label htmlFor="indicator-pane" className="text-xs uppercase text-slate-500">
              Pane
            </Label>
            <select
              id="indicator-pane"
              value={pane}
              onChange={(event) => setPane(event.target.value as IndicatorPane)}
              className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="price">Price overlay</option>
              <option value="separate">Separate pane</option>
            </select>
          </div>

          <div>
            <Label htmlFor="indicator-color" className="text-xs uppercase text-slate-500">
              Color
            </Label>
            <Input
              id="indicator-color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="mt-1 h-10 w-16 p-1"
            />
          </div>
          <Button type="button" size="sm" className="w-full" onClick={handleAdd}>
            Add indicator
          </Button>
        </div>

        {indicators.length === 0 ? (
          <p className="text-sm text-slate-500">No indicators configured.</p>
        ) : (
          <div className="space-y-2">
            {indicators.map((indicator) => (
              <div key={indicator.id} className="rounded border border-slate-200 bg-white p-2 text-sm shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-semibold uppercase tracking-wide">
                      {indicatorDisplayName(indicator.kind)}
                    </span>
                    <span className="text-[11px] text-slate-500">{indicator.pane === "price" ? "Overlay" : "Separate pane"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={indicator.hidden ? "Show indicator" : "Hide indicator"}
                      onClick={() => onUpdate(indicator.id, { hidden: !indicator.hidden })}
                      className="h-8 w-8"
                    >
                      {indicator.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove indicator"
                      onClick={() => onRemove(indicator.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={indicator.color}
                      onChange={(event) => onUpdate(indicator.id, { color: event.target.value })}
                      className="h-9 w-14 p-1"
                      id={`indicator-color-${indicator.id}`}
                      aria-label={`${indicatorDisplayName(indicator.kind)} color`}
                    />
                    {renderParamEditor(indicator)}
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-slate-500">Pane</Label>
                    <select
                      value={indicator.pane}
                      onChange={(event) =>
                        onUpdate(indicator.id, { pane: event.target.value as IndicatorPane })
                      }
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="price">Price overlay</option>
                      <option value="separate">Separate pane</option>
                    </select>
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

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase text-slate-500">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1"
      />
    </div>
  );
}

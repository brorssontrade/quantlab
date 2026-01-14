import { Download, FileText, Magnet, Moon, RefreshCcw, Save, Share2, SunMedium, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import type { ChartMeta, ChartThemeName } from "../types";
import { TIMEFRAME_OPTIONS, type ChartTimeframe, type Tool } from "../state/controls";

interface ToolbarProps {
  symbol: string;
  onSymbolChange: (value: string) => void;
  timeframe: ChartTimeframe;
  onTimeframeChange: (value: ChartTimeframe) => void;
  theme: ChartThemeName;
  onThemeChange: (value: ChartThemeName) => void;
  magnetEnabled: boolean;
  snapEnabled: boolean;
  onMagnetToggle: () => void;
  onSnapToggle: () => void;
  drawingTool: Tool;
  onDrawingToolChange: (tool: Tool) => void;
  onSaveLayout: () => void;
  onLoadLayout: () => void;
  onExportPng: () => void;
  onExportCsv: () => void;
  loading?: boolean;
  onReload: () => void;
  meta: ChartMeta | null;
}

const themeOptions: Array<{ value: ChartThemeName; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "Light", icon: <SunMedium className="h-3.5 w-3.5" /> },
  { value: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
];

const drawingTools: Array<{ value: Tool; label: string }> = [
  { value: "select", label: "Select" },
  { value: "h", label: "H" },
  { value: "v", label: "V" },
  { value: "trend", label: "Trend" },
  { value: "channel", label: "Channel" },
];

export function Toolbar({
  symbol,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  theme,
  onThemeChange,
  magnetEnabled,
  snapEnabled,
  onMagnetToggle,
  onSnapToggle,
  drawingTool,
  onDrawingToolChange,
  onSaveLayout,
  onLoadLayout,
  onExportPng,
  onExportCsv,
  loading,
  onReload,
  meta,
}: ToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between">
        <div className="flex min-h-[42px] flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
          <Label htmlFor="charts-pro-symbol" className="text-xs uppercase tracking-wide text-slate-500">
            Symbol
          </Label>
          <Input
            id="charts-pro-symbol"
            value={symbol}
            onChange={(event) => onSymbolChange(event.target.value.toUpperCase())}
            placeholder="AAPL.US"
            className="w-32 uppercase"
          />
          <Button variant="ghost" size="icon" onClick={onReload} title="Ladda om" disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <div className="flex gap-2">
            {themeOptions.map((option) => (
              <Button
                key={option.value}
                variant={theme === option.value ? "default" : "outline"}
                size="sm"
                className="gap-1"
                onClick={() => onThemeChange(option.value)}
              >
                {option.icon}
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex min-h-[42px] flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
          <ToggleButton
            icon={<Magnet className="h-3.5 w-3.5" />}
            label="Magnet"
            active={magnetEnabled}
            onClick={onMagnetToggle}
          />
          <ToggleButton
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Snap"
            active={snapEnabled}
            onClick={onSnapToggle}
          />
        </div>
      </div>

      <div className="flex min-h-[40px] flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
        {TIMEFRAME_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={timeframe === option.value ? "secondary" : "outline"}
            size="sm"
            onClick={() => onTimeframeChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="flex min-h-[40px] flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
        {drawingTools.map((item) => (
          <Button
            key={item.value}
            variant={drawingTool === item.value ? "secondary" : "outline"}
            size="sm"
            onClick={() => onDrawingToolChange(item.value)}
          >
            {item.label}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={onSaveLayout}>
          <Save className="mr-1 h-3.5 w-3.5" /> Save
        </Button>
        <Button variant="outline" size="sm" onClick={onLoadLayout}>
          <Share2 className="mr-1 h-3.5 w-3.5" /> Load
        </Button>
        <Button variant="outline" size="sm" onClick={onExportPng} data-testid="chartspro-export-png">
          <Download className="mr-1 h-3.5 w-3.5" /> PNG
        </Button>
        <Button variant="outline" size="sm" onClick={onExportCsv} data-testid="chartspro-export-csv">
          <FileText className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      <div className="flex min-h-[32px] flex-nowrap gap-2 overflow-x-auto whitespace-nowrap text-xs text-slate-500">
        {meta?.source ? <Badge variant="outline">Source: {meta.source}</Badge> : null}
        {meta?.tz ? <Badge variant="outline">TZ: {meta.tz}</Badge> : null}
        {typeof meta?.fallback === "boolean" ? (
          <Badge variant={meta.fallback ? "destructive" : "outline"}>
            {meta.fallback ? "Fallback-data" : "Primary feed"}
          </Badge>
        ) : null}
        {meta?.cache ? <Badge variant="outline">Cache: {meta.cache}</Badge> : null}
        {!meta && <span className="text-slate-400">Meta visas här när data laddats.</span>}
      </div>
    </div>
  );
}

function ToggleButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className="gap-1"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

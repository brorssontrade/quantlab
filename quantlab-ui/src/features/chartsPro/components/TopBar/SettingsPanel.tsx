/**
 * SettingsPanel.tsx
 * TV-10.2: Settings Gear Panel
 *
 * TradingView-style settings overlay:
 * - Appearance: candle colors, grid, background
 * - Scales: auto/log/percent mode
 * - Overlay positioning (doesn't affect TopBar height)
 * - Persists to localStorage: cp.settings.*
 * - Exposes in dump().ui.settings
 */

import { useRef, useEffect } from "react";
import { Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChartSettings {
  appearance: {
    candleUpColor: string;
    candleDownColor: string;
    wickVisible: boolean;
    borderVisible: boolean;
    gridVisible: boolean;
    backgroundDark: boolean;
  };
  scales: {
    mode: "auto" | "log" | "percent";
  };
}

export const DEFAULT_SETTINGS: ChartSettings = {
  appearance: {
    candleUpColor: "#26a69a",
    candleDownColor: "#ef5350",
    wickVisible: true,
    borderVisible: true,
    gridVisible: true,
    backgroundDark: true,
  },
  scales: {
    mode: "auto",
  },
};

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ChartSettings;
  onChange: (settings: ChartSettings) => void;
}

export function SettingsPanel({ isOpen, onClose, settings, onChange }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Esc
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const updateAppearance = (key: keyof ChartSettings["appearance"], value: any) => {
    onChange({
      ...settings,
      appearance: {
        ...settings.appearance,
        [key]: value,
      },
    });
  };

  const updateScales = (mode: ChartSettings["scales"]["mode"]) => {
    onChange({
      ...settings,
      scales: { mode },
    });
  };

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 mt-2 z-50 w-80 rounded-md border bg-[var(--cp-panel-bg)] text-[var(--cp-panel-text)] shadow-lg border-[var(--cp-panel-border)]"
      data-testid="settings-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cp-panel-border)] bg-[var(--cp-panel-header-bg)]">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-[var(--cp-panel-text-muted)]" />
          <span className="text-sm font-semibold text-[var(--cp-panel-text)]">Settings</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0"
          data-testid="settings-close"
          title="Close (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Appearance Section */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--cp-panel-text-muted)] uppercase mb-3">Appearance</h3>
          <div className="space-y-3">
            {/* Candle Colors */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--cp-panel-text)]">Up Candle Color</label>
              <input
                type="color"
                value={settings.appearance.candleUpColor}
                onChange={(e) => updateAppearance("candleUpColor", e.target.value)}
                className="h-8 w-16 rounded border border-[var(--cp-panel-border)] bg-[var(--cp-panel-bg)] cursor-pointer"
                data-testid="settings-candle-up-color"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--cp-panel-text)]">Down Candle Color</label>
              <input
                type="color"
                value={settings.appearance.candleDownColor}
                onChange={(e) => updateAppearance("candleDownColor", e.target.value)}
                className="h-8 w-16 rounded border border-[var(--cp-panel-border)] bg-[var(--cp-panel-bg)] cursor-pointer"
                data-testid="settings-candle-down-color"
              />
            </div>

            {/* Toggles */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--cp-panel-text)]">Show Wicks</label>
              <input
                type="checkbox"
                checked={settings.appearance.wickVisible}
                onChange={(e) => updateAppearance("wickVisible", e.target.checked)}
                className="h-4 w-4 rounded border border-[var(--cp-panel-border)] bg-[var(--cp-panel-bg)] cursor-pointer"
                data-testid="settings-wick-visible"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--cp-panel-text)]">Show Borders</label>
              <input
                type="checkbox"
                checked={settings.appearance.borderVisible}
                onChange={(e) => updateAppearance("borderVisible", e.target.checked)}
                className="h-4 w-4 rounded border border-[var(--cp-panel-border)] bg-[var(--cp-panel-bg)] cursor-pointer"
                data-testid="settings-border-visible"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--cp-panel-text)]">Show Grid</label>
              <input
                type="checkbox"
                checked={settings.appearance.gridVisible}
                onChange={(e) => updateAppearance("gridVisible", e.target.checked)}
                className="h-4 w-4 rounded border border-[var(--cp-panel-border)] bg-[var(--cp-panel-bg)] cursor-pointer"
                data-testid="settings-grid-visible"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--cp-panel-text)]">Dark Background</label>
              <input
                type="checkbox"
                checked={settings.appearance.backgroundDark}
                onChange={(e) => updateAppearance("backgroundDark", e.target.checked)}
                className="h-4 w-4 rounded border border-[var(--cp-panel-border)] bg-[var(--cp-panel-bg)] cursor-pointer"
                data-testid="settings-background-dark"
              />
            </div>
          </div>
        </div>

        {/* Scales Section */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--cp-panel-text-muted)] uppercase mb-3">Price Scale</h3>
          <div className="space-y-2">
            {(["auto", "log", "percent"] as const).map((mode) => (
              <label
                key={mode}
                className="flex items-center gap-2 cursor-pointer hover:bg-[var(--cp-panel-hover-bg)] p-2 rounded"
              >
                <input
                  type="radio"
                  name="scale-mode"
                  value={mode}
                  checked={settings.scales.mode === mode}
                  onChange={() => updateScales(mode)}
                  className="h-4 w-4 cursor-pointer"
                  data-testid={`settings-scale-${mode}`}
                />
                <span className="text-sm text-[var(--cp-panel-text)] capitalize">{mode}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

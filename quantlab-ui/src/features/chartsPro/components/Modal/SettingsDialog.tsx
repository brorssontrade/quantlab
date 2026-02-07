/**
 * SettingsDialog.tsx
 * 
 * TV-23.1: Chart Settings Dialog
 * 
 * Modal dialog with tabbed sections for configuring chart appearance, layout, and advanced settings.
 * Features:
 * - Three tabs: Appearance, Layout, Advanced
 * - Pending changes until Save (cancel reverts)
 * - Reset to defaults
 * - localStorage persistence
 * - Testable via dump().ui.settings
 */
import { useEffect, useRef } from "react";
import { Settings2, Palette, Layout, Cog, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSettingsStore,
  DEFAULT_SETTINGS,
  type AppearanceSettings,
  type LayoutSettings,
  type AdvancedSettings,
} from "../../state/settings";

// Simple toggle component (styled like TradingView)
interface ToggleProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "data-testid"?: string;
}

function Toggle({ id, checked, onCheckedChange, "data-testid": testId }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors"
      style={{
        backgroundColor: checked ? 'var(--tv-blue)' : 'var(--tv-border)',
      }}
      data-testid={testId}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// Tab types
type SettingsTab = "appearance" | "layout" | "advanced";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "layout", label: "Layout", icon: <Layout className="h-4 w-4" /> },
  { id: "advanced", label: "Advanced", icon: <Cog className="h-4 w-4" /> },
];

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const {
    pendingSettings,
    activeTab,
    setActiveTab,
    updatePendingAppearance,
    updatePendingLayout,
    updatePendingAdvanced,
    saveSettings,
    cancelChanges,
    resetToDefaults,
  } = useSettingsStore();

  const initialRef = useRef<HTMLButtonElement>(null);

  // Auto-focus first tab button on mount
  useEffect(() => {
    const timer = setTimeout(() => initialRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSave = () => {
    saveSettings();
    onClose();
  };

  const handleCancel = () => {
    cancelChanges();
    onClose();
  };

  const handleReset = () => {
    resetToDefaults();
  };

  if (!pendingSettings) return null;

  return (
    <div
      className="w-[480px] max-w-[95vw] max-h-[80vh] flex flex-col rounded-lg border shadow-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--cp-panel-bg)",
        borderColor: "var(--cp-panel-border)",
        color: "var(--cp-panel-text)",
      }}
      data-testid="settings-dialog"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{
          backgroundColor: "var(--cp-panel-header-bg)",
          borderColor: "var(--cp-panel-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          <span id="modal-title" className="text-sm font-medium">
            Chart Settings
          </span>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="h-6 w-6 flex items-center justify-center text-sm rounded"
          style={{ backgroundColor: 'transparent' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-panel-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          aria-label="Close"
          data-testid="settings-close"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b shrink-0"
        style={{ borderColor: "var(--cp-panel-border)" }}
        role="tablist"
      >
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={index === 0 ? initialRef : undefined}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-400"
                : ""
            }`}
            style={{
              color: activeTab === tab.id ? undefined : 'var(--tv-text-muted)',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = 'var(--tv-panel-hover)';
                e.currentTarget.style.color = 'var(--tv-text)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--tv-text-muted)';
              }
            }}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`settings-tab-${tab.id}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "appearance" && (
          <AppearancePanel
            settings={pendingSettings.appearance}
            onChange={updatePendingAppearance}
          />
        )}
        {activeTab === "layout" && (
          <LayoutPanel
            settings={pendingSettings.layout}
            onChange={updatePendingLayout}
          />
        )}
        {activeTab === "advanced" && (
          <AdvancedPanel
            settings={pendingSettings.advanced}
            onChange={updatePendingAdvanced}
          />
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-3 border-t shrink-0"
        style={{ borderColor: "var(--cp-panel-border)" }}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-8 text-xs gap-1"
          data-testid="settings-reset"
        >
          <RotateCcw className="h-3 w-3" />
          Reset Defaults
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            className="h-8 text-xs"
            data-testid="settings-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            className="h-8 text-xs"
            data-testid="settings-save"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Panels ───────────────────────────────────────────────────────────────

interface AppearancePanelProps {
  settings: AppearanceSettings;
  onChange: (updates: Partial<AppearanceSettings>) => void;
}

function AppearancePanel({ settings, onChange }: AppearancePanelProps) {
  return (
    <div className="space-y-6" role="tabpanel" id="panel-appearance" data-testid="settings-panel-appearance">
      {/* Grid Section */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--tv-text-muted)' }}>Grid</h3>
        
        <div className="flex items-center justify-between">
          <label htmlFor="showGrid" className="text-sm">Show Grid</label>
          <Toggle
            id="showGrid"
            checked={settings.showGrid}
            onCheckedChange={(checked) => onChange({ showGrid: checked })}
            data-testid="settings-showGrid"
          />
        </div>
        
        {settings.showGrid && (
          <>
            <div className="flex items-center justify-between">
              <label htmlFor="gridStyle" className="text-sm">Grid Style</label>
              <select
                id="gridStyle"
                value={settings.gridStyle}
                onChange={(e) => onChange({ gridStyle: e.target.value as AppearanceSettings["gridStyle"] })}
                className="h-8 px-2 text-xs rounded border"
                style={{
                  backgroundColor: 'var(--tv-input-bg)',
                  borderColor: 'var(--tv-border)',
                  color: 'var(--tv-text)',
                }}
                data-testid="settings-gridStyle"
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
            
            <div className="flex items-center justify-between">
              <label htmlFor="gridColor" className="text-sm">Grid Color</label>
              <input
                type="color"
                id="gridColor"
                value={settings.gridColor.startsWith("rgba") ? "#2a2e39" : settings.gridColor}
                onChange={(e) => onChange({ gridColor: e.target.value })}
                className="h-8 w-16 rounded border cursor-pointer"
                style={{ borderColor: 'var(--tv-border)' }}
                data-testid="settings-gridColor"
              />
            </div>
          </>
        )}
      </section>

      {/* Background Section */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--tv-text-muted)' }}>Background</h3>
        
        <div className="flex items-center justify-between">
          <label htmlFor="backgroundColor" className="text-sm">Background Color</label>
          <input
            type="color"
            id="backgroundColor"
            value={settings.backgroundColor}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
            className="h-8 w-16 rounded border cursor-pointer"
            style={{ borderColor: 'var(--tv-border)' }}
            data-testid="settings-backgroundColor"
          />
        </div>
      </section>

      {/* Candle Colors Section */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--tv-text-muted)' }}>Candle Colors</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <label htmlFor="upColor" className="text-sm">Up</label>
            <input
              type="color"
              id="upColor"
              value={settings.upColor}
              onChange={(e) => onChange({ upColor: e.target.value })}
              className="h-8 w-12 rounded border cursor-pointer"
              style={{ borderColor: 'var(--tv-border)' }}
              data-testid="settings-upColor"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <label htmlFor="downColor" className="text-sm">Down</label>
            <input
              type="color"
              id="downColor"
              value={settings.downColor}
              onChange={(e) => onChange({ downColor: e.target.value })}
              className="h-8 w-12 rounded border cursor-pointer"
              style={{ borderColor: 'var(--tv-border)' }}
              data-testid="settings-downColor"
            />
          </div>
        </div>
      </section>

      {/* Crosshair Section */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--tv-text-muted)' }}>Crosshair</h3>
        
        <div className="flex items-center justify-between">
          <label htmlFor="crosshairMode" className="text-sm">Mode</label>
          <select
            id="crosshairMode"
            value={settings.crosshairMode}
            onChange={(e) => onChange({ crosshairMode: e.target.value as AppearanceSettings["crosshairMode"] })}
            className="h-8 px-2 text-xs rounded border"
            style={{
              backgroundColor: 'var(--tv-input-bg)',
              borderColor: 'var(--tv-border)',
              color: 'var(--tv-text)',
            }}
            data-testid="settings-crosshairMode"
          >
            <option value="normal">Normal</option>
            <option value="magnet">Magnet</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
      </section>
    </div>
  );
}

interface LayoutPanelProps {
  settings: LayoutSettings;
  onChange: (updates: Partial<LayoutSettings>) => void;
}

function LayoutPanel({ settings, onChange }: LayoutPanelProps) {
  return (
    <div className="space-y-6" role="tabpanel" id="panel-layout" data-testid="settings-panel-layout">
      {/* Panel Visibility */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--tv-text-muted)' }}>Panel Visibility</h3>
        
        <div className="flex items-center justify-between">
          <label htmlFor="showLeftToolbar" className="text-sm">Left Toolbar</label>
          <Toggle
            id="showLeftToolbar"
            checked={settings.showLeftToolbar}
            onCheckedChange={(checked) => onChange({ showLeftToolbar: checked })}
            data-testid="settings-showLeftToolbar"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <label htmlFor="showBottomBar" className="text-sm">Bottom Bar</label>
          <Toggle
            id="showBottomBar"
            checked={settings.showBottomBar}
            onCheckedChange={(checked) => onChange({ showBottomBar: checked })}
            data-testid="settings-showBottomBar"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <label htmlFor="showRightPanel" className="text-sm">Right Panel</label>
          <Toggle
            id="showRightPanel"
            checked={settings.showRightPanel}
            onCheckedChange={(checked) => onChange({ showRightPanel: checked })}
            data-testid="settings-showRightPanel"
          />
        </div>
      </section>

      {/* Legend */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--tv-text-muted)' }}>Legend</h3>
        
        <div className="flex items-center justify-between">
          <label htmlFor="showLegend" className="text-sm">Show Legend</label>
          <Toggle
            id="showLegend"
            checked={settings.showLegend}
            onCheckedChange={(checked) => onChange({ showLegend: checked })}
            data-testid="settings-showLegend"
          />
        </div>
        
        {settings.showLegend && (
          <div className="flex items-center justify-between">
            <label htmlFor="legendPosition" className="text-sm">Position</label>
            <select
              id="legendPosition"
              value={settings.legendPosition}
              onChange={(e) => onChange({ legendPosition: e.target.value as LayoutSettings["legendPosition"] })}
              className="h-8 px-2 text-xs rounded border"
              style={{
                backgroundColor: 'var(--tv-input-bg)',
                borderColor: 'var(--tv-border)',
                color: 'var(--tv-text)',
              }}
              data-testid="settings-legendPosition"
            >
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
            </select>
          </div>
        )}
      </section>
    </div>
  );
}

interface AdvancedPanelProps {
  settings: AdvancedSettings;
  onChange: (updates: Partial<AdvancedSettings>) => void;
}

function AdvancedPanel({ settings, onChange }: AdvancedPanelProps) {
  return (
    <div className="space-y-6" role="tabpanel" id="panel-advanced" data-testid="settings-panel-advanced">
      {/* Performance */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--tv-text-muted)' }}>Performance</h3>
        
        <div className="flex items-center justify-between">
          <label htmlFor="maxBarsOnChart" className="text-sm">Max Bars on Chart</label>
          <Input
            type="number"
            id="maxBarsOnChart"
            value={settings.maxBarsOnChart}
            onChange={(e) => onChange({ maxBarsOnChart: parseInt(e.target.value, 10) || 4000 })}
            className="h-8 w-24 text-xs"
            min={100}
            max={10000}
            data-testid="settings-maxBarsOnChart"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <label htmlFor="enableAnimations" className="text-sm">Enable Animations</label>
          <Toggle
            id="enableAnimations"
            checked={settings.enableAnimations}
            onCheckedChange={(checked) => onChange({ enableAnimations: checked })}
            data-testid="settings-enableAnimations"
          />
        </div>
      </section>

      {/* Data */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--tv-text-muted)' }}>Data</h3>
        
        <div className="flex items-center justify-between">
          <label htmlFor="autoSaveDrawings" className="text-sm">Auto-save Drawings</label>
          <Toggle
            id="autoSaveDrawings"
            checked={settings.autoSaveDrawings}
            onCheckedChange={(checked) => onChange({ autoSaveDrawings: checked })}
            data-testid="settings-autoSaveDrawings"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <label htmlFor="confirmBeforeDelete" className="text-sm">Confirm Before Delete</label>
          <Toggle
            id="confirmBeforeDelete"
            checked={settings.confirmBeforeDelete}
            onCheckedChange={(checked) => onChange({ confirmBeforeDelete: checked })}
            data-testid="settings-confirmBeforeDelete"
          />
        </div>
      </section>
    </div>
  );
}

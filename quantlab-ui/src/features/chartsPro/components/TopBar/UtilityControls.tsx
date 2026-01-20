/**
 * UtilityControls.tsx
 * Magnet, Snap toggles + Layout save/load + Export
 * Part of TopBar, utility operations group.
 */

import { Magnet, Zap, Save, Share2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolGroup } from "./ToolGroup";

interface UtilityControlsProps {
  magnetEnabled: boolean;
  onMagnetToggle: () => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
  onSaveLayout: () => void;
  onLoadLayout: () => void;
  onExportPng: () => void;
  onExportCsv: () => void;
  isCompact?: boolean;
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
      className="h-8 gap-1 px-2"
      onClick={onClick}
      title={label}
      data-testid={`topbar-${label.toLowerCase()}`}
    >
      {icon}
      <span className="hidden sm:inline text-xs">{label}</span>
    </Button>
  );
}

export function UtilityControls({
  magnetEnabled,
  onMagnetToggle,
  snapEnabled,
  onSnapToggle,
  onSaveLayout,
  onLoadLayout,
  onExportPng,
  onExportCsv,
  isCompact,
}: UtilityControlsProps) {
  return (
    <>
      {/* Magnet + Snap */}
      <ToolGroup label="Drawing Tools">
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
      </ToolGroup>

      {/* Layout & Export */}
      <ToolGroup label="Layout & Export">
        {isCompact ? (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={onSaveLayout}
              className="h-8 w-8"
              title="Save layout"
              data-testid="topbar-save-layout-icon"
            >
              <Save className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onLoadLayout}
              className="h-8 w-8"
              title="Load layout"
              data-testid="topbar-load-layout-icon"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onExportPng}
              className="h-8 w-8"
              title="Export PNG"
              data-testid="topbar-export-png-icon"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onExportCsv}
              className="h-8 w-8"
              title="Export CSV"
              data-testid="topbar-export-csv-icon"
            >
              <FileText className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              onClick={onSaveLayout}
              title="Save layout"
              data-testid="topbar-save-layout"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="text-xs">Save</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              onClick={onLoadLayout}
              title="Load layout"
              data-testid="topbar-load-layout"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="text-xs">Load</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              onClick={onExportPng}
              title="Export PNG"
              data-testid="topbar-export-png"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="text-xs">PNG</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              onClick={onExportCsv}
              title="Export CSV"
              data-testid="topbar-export-csv"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="text-xs">CSV</span>
            </Button>
          </>
        )}
      </ToolGroup>
    </>
  );
}

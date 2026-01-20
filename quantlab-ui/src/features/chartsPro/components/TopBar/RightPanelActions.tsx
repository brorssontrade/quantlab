/**
 * RightPanelActions.tsx
 * TV-12: TopBar buttons for RightPanel actions (Indicators, Alerts, Objects)
 * Integrated in TopBar between PrimaryControls and ThemeAndVisibility.
 */

import { BarChart3, Bell, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolGroup } from "./ToolGroup";

interface RightPanelActionsProps {
  onIndicatorsClick?: () => void;
  onAlertsClick?: () => void;
  onObjectsClick?: () => void;
}

export function RightPanelActions({
  onIndicatorsClick,
  onAlertsClick,
  onObjectsClick,
}: RightPanelActionsProps) {
  return (
    <ToolGroup>
      {onIndicatorsClick && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2"
          onClick={onIndicatorsClick}
          title="Indicators"
          data-testid="topbar-indicators-btn"
        >
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Indicators</span>
        </Button>
      )}

      {onAlertsClick && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2"
          onClick={onAlertsClick}
          title="Alerts"
          data-testid="topbar-alerts-btn"
        >
          <Bell className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Alerts</span>
        </Button>
      )}

      {onObjectsClick && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2"
          onClick={onObjectsClick}
          title="Objects"
          data-testid="topbar-objects-btn"
        >
          <Layers className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Objects</span>
        </Button>
      )}
    </ToolGroup>
  );
}

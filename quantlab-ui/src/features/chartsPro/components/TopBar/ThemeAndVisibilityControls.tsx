/**
 * ThemeAndVisibilityControls.tsx
 * Theme toggle + Inspector/Panels visibility
 * Part of TopBar, keeps these grouped together.
 */

import { Moon, SunMedium, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChartThemeName } from "../../types";
import { ToolGroup } from "./ToolGroup";

const themeOptions: Array<{ value: ChartThemeName; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "Light", icon: <SunMedium className="h-3.5 w-3.5" /> },
  { value: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
];

interface ThemeAndVisibilityControlsProps {
  theme: ChartThemeName;
  onThemeChange: (value: ChartThemeName) => void;
  showPanelsButton?: boolean;
  onOpenPanelsDrawer?: () => void;
}

export function ThemeAndVisibilityControls({
  theme,
  onThemeChange,
  showPanelsButton,
  onOpenPanelsDrawer,
}: ThemeAndVisibilityControlsProps) {
  return (
    <ToolGroup label="Theme & Visibility">
      {/* Theme buttons */}
      <div className="flex gap-1">
        {themeOptions.map((option) => (
          <Button
            key={option.value}
            variant={theme === option.value ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1 px-2"
            onClick={() => onThemeChange(option.value)}
            title={option.label}
            data-testid={`topbar-theme-${option.value}`}
          >
            {option.icon}
            <span className="hidden sm:inline text-xs">{option.label}</span>
          </Button>
        ))}
      </div>

      {/* Panels button (mobile) */}
      {showPanelsButton && onOpenPanelsDrawer && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2"
          onClick={onOpenPanelsDrawer}
          data-testid="topbar-panels-btn"
          title="Open panels drawer"
        >
          <PanelRight className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Panels</span>
        </Button>
      )}
    </ToolGroup>
  );
}

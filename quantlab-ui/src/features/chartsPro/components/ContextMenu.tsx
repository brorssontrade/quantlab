import { useEffect, useRef, useCallback } from "react";
import type { ChartsTheme } from "../theme";

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
}

export interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onAction: (actionId: string) => void;
  onClose: () => void;
  theme: ChartsTheme;
}

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  selectedAction: string | null;
}

/**
 * Right-click context menu for chart interactions.
 * Closes on ESC, click outside, or action selection.
 */
export function ContextMenu({
  open,
  x,
  y,
  actions,
  onAction,
  onClose,
  theme,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle ESC key and click outside
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose]);

  const handleAction = useCallback(
    (actionId: string) => {
      onAction(actionId);
      onClose();
    },
    [onAction, onClose]
  );

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      data-testid="chartspro-context-menu"
      className="chartspro-context-menu"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        backgroundColor: theme.panel,
        borderColor: theme.grid,
        color: theme.axisText,
      }}
      role="menu"
    >
      {actions.map((action) => {
        if (action.separator) {
          return (
            <div
              key={action.id}
              className="chartspro-context-menu__separator"
              style={{ backgroundColor: theme.grid }}
            />
          );
        }

        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            data-testid={`context-menu-${action.id}`}
            className={`chartspro-context-menu__item ${action.disabled ? "is-disabled" : ""}`}
            onClick={() => !action.disabled && handleAction(action.id)}
            disabled={action.disabled}
          >
            {action.icon && (
              <span className="chartspro-context-menu__icon">{action.icon}</span>
            )}
            <span className="chartspro-context-menu__label">{action.label}</span>
            {action.shortcut && (
              <span className="chartspro-context-menu__shortcut" style={{ color: theme.crosshair }}>
                {action.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Default chart context menu actions - TradingView-style expanded menu */
export const DEFAULT_CHART_ACTIONS: ContextMenuAction[] = [
  { id: "add-alert", label: "Add Alert...", shortcut: "Alt+A" },
  { id: "separator-alerts", label: "", separator: true },
  { id: "reset-scale", label: "Reset Scale", shortcut: "Dbl-click" },
  { id: "fit-content", label: "Fit All Data", shortcut: "Home" },
  { id: "auto-scale", label: "Auto Scale", shortcut: "A" },
  { id: "separator-scale", label: "", separator: true },
  { id: "toggle-ohlc", label: "Show OHLC Strip" },
  { id: "toggle-volume", label: "Show Volume" },
  { id: "toggle-crosshair", label: "Toggle Crosshair" },
  { id: "toggle-watermark", label: "Toggle Watermark" },
  { id: "separator-display", label: "", separator: true },
  { id: "copy-price", label: "Copy Price", shortcut: "Ctrl+C" },
  { id: "separator-export", label: "", separator: true },
  { id: "export-png", label: "Export as PNG..." },
  { id: "export-csv", label: "Export as CSV..." },
  { id: "separator-settings", label: "", separator: true },
  { id: "settings", label: "Settings..." },
];

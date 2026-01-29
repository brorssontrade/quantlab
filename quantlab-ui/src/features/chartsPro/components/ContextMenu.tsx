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

  // TV-35.4: Use structured theme tokens for consistent styling
  const menuStyle = {
    left: `${x}px`,
    top: `${y}px`,
    backgroundColor: theme.overlay.modalBg,
    borderColor: theme.overlay.modalBorder,
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamily.primary,
    fontSize: `${theme.typography.fontSize.sm}px`,
    borderRadius: `${theme.spacing.xs}px`,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    border: "1px solid",
    padding: `${theme.spacing.xs}px 0`,
    minWidth: "180px",
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      data-testid="chartspro-context-menu"
      data-overlay-ui="true"
      className="chartspro-context-menu"
      style={menuStyle}
      role="menu"
    >
      {actions.map((action) => {
        if (action.separator) {
          return (
            <div
              key={action.id}
              className="chartspro-context-menu__separator"
              style={{ 
                backgroundColor: theme.overlay.modalBorder, 
                height: "1px",
                margin: `${theme.spacing.xs}px 0`,
              }}
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
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
              background: "transparent",
              border: "none",
              color: action.disabled ? theme.text.muted : theme.text.primary,
              cursor: action.disabled ? "not-allowed" : "pointer",
              fontFamily: theme.typography.fontFamily.primary,
              fontSize: `${theme.typography.fontSize.sm}px`,
              textAlign: "left",
              transition: "background-color 0.1s ease",
            }}
            onMouseEnter={(e) => {
              if (!action.disabled) {
                e.currentTarget.style.backgroundColor = theme.overlay.chipBg;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {action.icon && (
              <span style={{ marginRight: `${theme.spacing.sm}px`, display: "flex" }}>
                {action.icon}
              </span>
            )}
            <span style={{ flex: 1 }}>{action.label}</span>
            {action.shortcut && (
              <span style={{ 
                color: theme.text.muted,
                fontSize: `${theme.typography.fontSize.xs}px`,
                marginLeft: `${theme.spacing.md}px`,
              }}>
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

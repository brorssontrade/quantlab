import { memo } from "react";
import type { ChartsTheme } from "../theme";

export interface CrosshairPosition {
  x: number;     // px from left
  y: number;     // px from top
  price: number | null;
  time: string | null;  // formatted time string
  visible: boolean;
}

export interface CrosshairOverlayProps {
  position: CrosshairPosition;
  theme: ChartsTheme;
  chartWidth: number;
  chartHeight: number;
  priceScaleWidth: number;
  timeScaleHeight: number;
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toPrecision(4);
}

/**
 * Crosshair overlay component providing testable pills for price/time.
 * This mirrors the native lightweight-charts crosshair but adds data-testid attributes.
 * The actual crosshair lines are rendered by lightweight-charts; this component
 * only provides the testable pill overlays positioned at the axis edges.
 */
export const CrosshairOverlay = memo(function CrosshairOverlay({
  position,
  theme,
  chartWidth,
  chartHeight,
  priceScaleWidth,
  timeScaleHeight,
}: CrosshairOverlayProps) {
  if (!position.visible) {
    return (
      <div data-testid="chartspro-crosshair" data-visible="false" style={{ display: "none" }} />
    );
  }

  // Price pill position: right edge of chart area, aligned with crosshair Y
  const pricePillStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: position.y,
    transform: "translateY(-50%)",
    backgroundColor: theme.crosshairLabelBg,
    color: "#ffffff",
    padding: "2px 6px",
    fontSize: "11px",
    fontFamily: theme.fontFamily,
    fontWeight: 500,
    borderRadius: "2px",
    zIndex: 50,
    pointerEvents: "none",
    whiteSpace: "nowrap",
    minWidth: "50px",
    textAlign: "right",
  };

  // Time pill position: bottom of chart area, aligned with crosshair X
  const timePillStyle: React.CSSProperties = {
    position: "absolute",
    left: position.x,
    bottom: 0,
    transform: "translateX(-50%)",
    backgroundColor: theme.crosshairLabelBg,
    color: "#ffffff",
    padding: "2px 8px",
    fontSize: "11px",
    fontFamily: theme.fontFamily,
    fontWeight: 500,
    borderRadius: "2px",
    zIndex: 50,
    pointerEvents: "none",
    whiteSpace: "nowrap",
  };

  return (
    <div 
      data-testid="chartspro-crosshair" 
      data-visible="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      {/* TV-42: Price pill REMOVED - LWC native crosshair shows correct Y-coordinate price.
          Custom overlay was showing bar.close which caused price mismatch with tick labels.
          Native LWC crosshair has labelVisible: true and shows actual price at Y position. */}
      
      {/* Time pill on bottom axis - kept for data-testid accessibility in tests */}
      {position.time != null && (
        <div data-testid="chartspro-crosshair-time" style={timePillStyle}>
          {position.time}
        </div>
      )}
    </div>
  );
});

export default CrosshairOverlay;

import { memo } from "react";
import type { ChartsTheme } from "../theme";

export interface WatermarkProps {
  symbol: string;
  visible: boolean;
  theme: ChartsTheme;
}

/**
 * Faint watermark showing symbol in chart background.
 * TradingView-style large centered symbol text.
 */
export const Watermark = memo(function Watermark({
  symbol,
  visible,
  theme,
}: WatermarkProps) {
  if (!visible || !symbol) {
    return null;
  }

  // Extract base symbol (remove exchange suffix like .US, .ST)
  const displaySymbol = symbol.split(".")[0];

  return (
    <div
      data-testid="chartspro-watermark"
      className="chartspro-watermark"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontSize: "clamp(48px, 8vw, 120px)",
        fontWeight: 700,
        fontFamily: theme.fontFamily,
        color: theme.name === "dark" 
          ? "rgba(255, 255, 255, 0.03)" 
          : "rgba(0, 0, 0, 0.03)",
        pointerEvents: "none",
        userSelect: "none",
        whiteSpace: "nowrap",
        letterSpacing: "0.05em",
        zIndex: 0,
      }}
    >
      {displaySymbol}
    </div>
  );
});

export default Watermark;

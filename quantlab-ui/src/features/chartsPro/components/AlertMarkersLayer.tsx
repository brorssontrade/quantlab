import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, LineStyle, LineWidth } from "@/lib/lightweightCharts";
import type { CandlestickData } from "@/lib/lightweightCharts";

interface AlertMarker {
  id: number;
  price: number;
  label?: string;
  isSelected?: boolean;
}

interface AlertMarkersLayerProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick", CandlestickData> | null;
  alerts: AlertMarker[];
  selectedAlertId?: number | null;
  onMarkerClick?: (alertId: number) => void;
  theme: "light" | "dark";
}

/**
 * AlertMarkersLayer – Renders horizontal dashed lines + bell icons for alerts.
 *
 * Features:
 * - Horizontal dashed line at each alert's price level
 * - Bell icon marker at right side of chart (via lightweight-charts API)
 * - Click handler to select alert in AlertsTab
 * - Efficient Map-based updates (no flicker on add/remove)
 * - Theme-aware colors (light/dark mode support)
 * - Pointer-events: none on overlay to preserve chart interactions
 *
 * Implementation:
 * - Uses lightweight-charts addLineSeries() for dashed lines at alert prices
 * - Bell icon rendered via SVG overlay positioned at price axis
 * - Maintains Map<alertId, lineSeriesApi> for O(1) updates
 */
export function AlertMarkersLayer({
  chart,
  series,
  alerts,
  selectedAlertId,
  onMarkerClick,
  theme,
}: AlertMarkersLayerProps) {
  const alertLinesRef = useRef<Map<number, ISeriesApi<"Line", any>>>(new Map());
  const markerOverlayRef = useRef<HTMLDivElement | null>(null);
  const chartContainerRef = useRef<HTMLElement | null>(null);

  // Colors based on theme
  const lineColor = theme === "dark" ? "rgba(139, 92, 246, 0.4)" : "rgba(139, 92, 246, 0.3)";
  const selectedLineColor = theme === "dark" ? "rgba(139, 92, 246, 0.7)" : "rgba(139, 92, 246, 0.6)";
  const textColor = theme === "dark" ? "#c4b5fd" : "#7c3aed";
  const selectedBg = theme === "dark" ? "rgba(139, 92, 246, 0.15)" : "rgba(139, 92, 246, 0.1)";

  // Initialize marker overlay container
  useEffect(() => {
    if (!chart) return;

    // Get chart container
    const container = (chart as any)._container;
    if (!container) return;
    chartContainerRef.current = container;

    // Create overlay div for bell icons
    let overlay = markerOverlayRef.current;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "10";
      overlay.setAttribute("data-testid", "alert-markers-overlay");
      container.appendChild(overlay);
      markerOverlayRef.current = overlay;
    }

    return () => {
      // Cleanup on unmount (overlay remains for performance)
    };
  }, [chart]);

  // Update alert marker lines
  useEffect(() => {
    if (!chart || !series) return;

    const activeIds = new Set(alerts.map((a) => a.id));
    const existingIds = new Set(alertLinesRef.current.keys());

    // Remove deleted alerts
    for (const id of existingIds) {
      if (!activeIds.has(id)) {
        const lineSeries = alertLinesRef.current.get(id);
        if (lineSeries) {
          chart.removeSeries(lineSeries);
          alertLinesRef.current.delete(id);
        }
      }
    }

    // Add or update existing alerts
    alerts.forEach((alert) => {
      let lineSeries = alertLinesRef.current.get(alert.id);
      const isSelected = alert.id === selectedAlertId;
      const currentColor = isSelected ? selectedLineColor : lineColor;

      if (!lineSeries) {
        // Create new line series for this alert
        try {
          lineSeries = chart.addLineSeries({
            color: currentColor,
            lineStyle: 2 as LineStyle, // Dashed line (LineStyle.Dashed = 2)
            lineWidth: 2 as LineWidth,
            priceScaleId: "right",
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            title: `Alert ${alert.label || `#${alert.id}`}`,
          });
          alertLinesRef.current.set(alert.id, lineSeries);
        } catch (err) {
          console.warn("[AlertMarkersLayer] Failed to create line series:", err);
          return;
        }
      } else {
        // Update color if selection changed
        try {
          lineSeries.applyOptions({
            color: currentColor,
            lineWidth: isSelected ? (3 as LineWidth) : (2 as LineWidth),
          });
        } catch (err) {
          console.warn("[AlertMarkersLayer] Failed to apply options:", err);
        }
      }

      // Set data: horizontal line at alert price using chart's visible time range
      // This ensures the line aligns with the chart's time scale
      try {
        const timeScale = chart.timeScale();
        const range = timeScale.getVisibleLogicalRange();
        
        if (range && typeof range.from === 'number' && typeof range.to === 'number') {
          // Use the visible time range to ensure the line spans the viewport
          const from = Math.max(0, Math.floor(range.from));
          const to = Math.max(1, Math.ceil(range.to));
          
          lineSeries.setData([
            { time: from as any, value: alert.price },
            { time: to as any, value: alert.price },
          ]);
        } else {
          // Fallback if range is not available yet
          lineSeries.setData([]);
        }
      } catch (err) {
        console.warn("[AlertMarkersLayer] Failed to set line data:", err);
        // Clear data on error to prevent stale state
        try {
          lineSeries.setData([]);
        } catch {}
      }
    });

    // Update bell icons in overlay
    updateBellIcons();
  }, [chart, series, alerts, selectedAlertId]);

  // Update bell icon positions and click handlers
  const updateBellIcons = () => {
    if (!markerOverlayRef.current || !chart) return;

    const overlay = markerOverlayRef.current;
    overlay.innerHTML = ""; // Clear existing icons

    alerts.forEach((alert) => {
      const isSelected = alert.id === selectedAlertId;
      const bellColor = isSelected ? textColor : theme === "dark" ? "#a78bfa" : "#a78bfa";
      const bellBg = isSelected ? selectedBg : "transparent";

      // Create bell icon container
      const bellContainer = document.createElement("div");
      bellContainer.className = "alert-marker-bell";
      bellContainer.setAttribute("data-testid", `alert-marker-bell-${alert.id}`);
      bellContainer.setAttribute("data-alert-id", String(alert.id));
      bellContainer.style.position = "absolute";
      bellContainer.style.cursor = "pointer";
      bellContainer.style.padding = "4px";
      bellContainer.style.borderRadius = "4px";
      bellContainer.style.display = "flex";
      bellContainer.style.alignItems = "center";
      bellContainer.style.justifyContent = "center";
      bellContainer.style.backgroundColor = bellBg;
      bellContainer.style.transition = "background-color 200ms ease";
      bellContainer.style.pointerEvents = "auto"; // Allow clicks on icons
      bellContainer.title = `Alert: ${alert.label || `#${alert.id}`}`;

      // SVG bell icon (inline)
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", bellColor);
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9m-9 8a1 1 0 1 1 2 0 1 1 0 0 1-2 0z"
      );
      svg.appendChild(path);

      bellContainer.appendChild(svg);

      // Click handler
      bellContainer.addEventListener("click", (e) => {
        e.stopPropagation();
        if (onMarkerClick) {
          onMarkerClick(alert.id);
        }
      });

      // Hover effect
      bellContainer.addEventListener("mouseenter", () => {
        bellContainer.style.backgroundColor = selectedBg;
      });
      bellContainer.addEventListener("mouseleave", () => {
        bellContainer.style.backgroundColor = isSelected ? selectedBg : "transparent";
      });

      overlay.appendChild(bellContainer);
    });

    // Position icons at correct Y coordinate
    // This is called after the lines are rendered so the chart should have them
    setTimeout(() => {
      positionBellIcons();
    }, 50);
  };

  // Position bell icons at correct Y coordinates (at alert prices)
  const positionBellIcons = () => {
    if (!chart || !series || !markerOverlayRef.current) return;

    const overlay = markerOverlayRef.current;
    const bellIcons = overlay.querySelectorAll(".alert-marker-bell");

    bellIcons.forEach((icon) => {
      const alertIdStr = (icon as HTMLElement).getAttribute("data-alert-id");
      if (!alertIdStr) return;

      const alertId = parseInt(alertIdStr, 10);
      const alert = alerts.find((a) => a.id === alertId);
      if (!alert) return;

      try {
        // Get Y coordinate for the alert's price level
        const yCoord = series.priceToCoordinate(alert.price);
        if (yCoord !== null) {
          const rightMargin = 48; // Distance from right edge
          const topOffset = yCoord - 8; // Center icon vertically

          (icon as HTMLElement).style.right = `${rightMargin}px`;
          (icon as HTMLElement).style.top = `${topOffset}px`;
        }
      } catch {
        // If price is outside visible range, icon will be hidden naturally
      }
    });
  };

  // Reposition icons on chart resize/pan/zoom
  useEffect(() => {
    if (!chart) return;

    const handler = () => positionBellIcons();
    const timeScale = chart.timeScale();
    if (typeof timeScale.subscribeVisibleTimeRangeChange === "function") {
      timeScale.subscribeVisibleTimeRangeChange(handler);
    }

    return () => {
      if (typeof timeScale.unsubscribeVisibleTimeRangeChange === "function") {
        timeScale.unsubscribeVisibleTimeRangeChange(handler);
      }
    };
  }, [chart, alerts, series, positionBellIcons]);

  // Also reposition on price scale changes
  useEffect(() => {
    if (!chart) return;

    const priceScale = chart.priceScale("right");
    if (!priceScale) return;

    const handler = () => positionBellIcons();

    // Lightweight-charts doesn't expose subscribeVisibleRangeChange; guard for the available hooks.
    const subscribe =
      // Preferred: vertical range changes (supported in newer versions)
      (priceScale as any).subscribeVisibleLogicalRangeChange ||
      // Fallback: width changes still give us a resize signal to re-position icons
      (priceScale as any).subscribePriceScaleWidthChange;
    const unsubscribe =
      (priceScale as any).unsubscribeVisibleLogicalRangeChange ||
      (priceScale as any).unsubscribePriceScaleWidthChange;

    if (typeof subscribe === "function") {
      subscribe(handler);
      return () => {
        if (typeof unsubscribe === "function") {
          unsubscribe(handler);
        }
      };
    }

    // If no subscription API exists, at least position once to avoid stale placement.
    handler();
    return undefined;
  }, [chart, alerts, series, positionBellIcons]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Remove all alert line series
      if (chart) {
        alertLinesRef.current.forEach((series) => {
          try {
            chart.removeSeries(series);
          } catch {
            // Series already removed
          }
        });
        alertLinesRef.current.clear();
      }

      // Remove overlay
      if (markerOverlayRef.current && chartContainerRef.current) {
        chartContainerRef.current.removeChild(markerOverlayRef.current);
        markerOverlayRef.current = null;
      }
    };
  }, [chart]);

  return null; // AlertMarkersLayer is invisible; it manages chart overlays
}

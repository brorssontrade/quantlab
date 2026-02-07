/**
 * SyncController - Handles cross-pane synchronization
 * 
 * Responsibilities:
 * - TimeScale sync (scroll/zoom across all panes)
 * - Crosshair sync (vertical line matches across panes)
 * - Loop prevention via syncLock
 * - Initial sync of new panes to price chart's current range
 */

import type { IChartApi, Time, LogicalRange } from "@/lib/lightweightCharts";
import type { PaneId, SyncState } from "./types";

// Type for subscription handlers
type UnsubscribeFn = () => void;
type SubscriptionHandler = ((range: LogicalRange | null) => void) | ((param: { time?: Time | null }) => void);

export class SyncController {
  private panes = new Map<PaneId, IChartApi>();
  private state: SyncState = {
    syncLock: false,
    syncSource: null,
  };
  private unsubscribers = new Map<PaneId, Array<UnsubscribeFn>>();
  // Store handlers for dual-pattern unsubscribe (old LWC style)
  private handlers = new Map<PaneId, { rangeHandler: SubscriptionHandler; crosshairHandler: SubscriptionHandler }>();

  /**
   * Register a pane's chart for synchronization
   */
  registerPane(paneId: PaneId, chart: IChartApi): void {
    if (this.panes.has(paneId)) {
      this.unregisterPane(paneId);
    }
    
    this.panes.set(paneId, chart);
    const unsubs: Array<UnsubscribeFn> = [];

    // Create handlers
    const rangeHandler = (range: LogicalRange | null) => {
      if (range) {
        this.handleRangeChange(paneId, range);
      }
    };
    
    const crosshairHandler = (param: { time?: Time | null }) => {
      this.handleCrosshairMove(paneId, param.time ?? null);
    };

    // Store handlers for potential old-style unsubscribe
    this.handlers.set(paneId, { rangeHandler, crosshairHandler: crosshairHandler as SubscriptionHandler });

    // Subscribe to visible range changes for timeScale sync
    // Dual pattern: try new style (returns unsub fn) or fall back to old style
    const timeScale = chart.timeScale();
    const maybeRangeUnsub = timeScale.subscribeVisibleLogicalRangeChange(rangeHandler);
    if (typeof maybeRangeUnsub === "function") {
      unsubs.push(maybeRangeUnsub);
    }
    // else: old style - we'll use unsubscribeVisibleLogicalRangeChange in cleanup

    // Subscribe to crosshair move for crosshair sync
    const maybeCrosshairUnsub = chart.subscribeCrosshairMove(crosshairHandler);
    if (typeof maybeCrosshairUnsub === "function") {
      unsubs.push(maybeCrosshairUnsub);
    }
    // else: old style - we'll use unsubscribeCrosshairMove in cleanup

    this.unsubscribers.set(paneId, unsubs);

    // Initial sync: if this is NOT the price pane, sync to price's current range
    if (paneId !== "price") {
      const priceRange = this.getCurrentRange("price");
      if (priceRange) {
        try {
          chart.timeScale().setVisibleLogicalRange(priceRange);
        } catch {
          // Chart may not be ready yet
        }
      }
    }
  }

  /**
   * Unregister a pane from synchronization
   */
  unregisterPane(paneId: PaneId): void {
    const chart = this.panes.get(paneId);
    const unsubs = this.unsubscribers.get(paneId);
    const handlers = this.handlers.get(paneId);
    
    // Try new-style unsub first
    if (unsubs) {
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {
          // Ignore cleanup errors
        }
      });
      this.unsubscribers.delete(paneId);
    }
    
    // Also try old-style unsubscribe methods (in case new style didn't work)
    if (chart && handlers) {
      try {
        const timeScale = chart.timeScale();
        // Old LWC style: unsubscribeVisibleLogicalRangeChange(handler)
        if (typeof (timeScale as any).unsubscribeVisibleLogicalRangeChange === "function") {
          (timeScale as any).unsubscribeVisibleLogicalRangeChange(handlers.rangeHandler);
        }
      } catch {
        // Ignore - may already be cleaned up
      }
      
      try {
        // Old LWC style: unsubscribeCrosshairMove(handler)
        if (typeof (chart as any).unsubscribeCrosshairMove === "function") {
          (chart as any).unsubscribeCrosshairMove(handlers.crosshairHandler);
        }
      } catch {
        // Ignore - may already be cleaned up
      }
    }
    
    this.handlers.delete(paneId);
    this.panes.delete(paneId);
  }

  /**
   * Handle timeScale range change - sync to all other panes
   */
  private handleRangeChange(sourcePane: PaneId, range: LogicalRange): void {
    if (this.state.syncLock) return;
    
    this.state.syncLock = true;
    this.state.syncSource = sourcePane;

    try {
      this.panes.forEach((chart, paneId) => {
        if (paneId === sourcePane) return;
        try {
          chart.timeScale().setVisibleLogicalRange(range);
        } catch {
          // Chart may be disposed
        }
      });
    } finally {
      this.state.syncLock = false;
      this.state.syncSource = null;
    }
  }

  /**
   * Handle crosshair move - sync vertical line to all other panes
   */
  private handleCrosshairMove(sourcePane: PaneId, time: Time | null): void {
    if (this.state.syncLock) return;

    this.state.syncLock = true;
    this.state.syncSource = sourcePane;

    try {
      this.panes.forEach((chart, paneId) => {
        if (paneId === sourcePane) return;
        try {
          if (time != null) {
            // Get the first series in the chart to set crosshair position
            // We use the time to position the crosshair vertically
            // The price doesn't matter much - we just need the vertical line
            const series = chart.allSeries?.()[0];
            if (series) {
              chart.setCrosshairPosition(0, time, series);
            }
          } else {
            chart.clearCrosshairPosition();
          }
        } catch {
          // Chart may be disposed or no series available
        }
      });
    } finally {
      this.state.syncLock = false;
      this.state.syncSource = null;
    }
  }

  /**
   * Manually sync all panes to a specific range
   */
  syncAllToRange(range: LogicalRange): void {
    this.panes.forEach((chart) => {
      try {
        chart.timeScale().setVisibleLogicalRange(range);
      } catch {
        // Chart may be disposed
      }
    });
  }

  /**
   * Get current visible range from a specific pane
   */
  getCurrentRange(paneId: PaneId): LogicalRange | null {
    const chart = this.panes.get(paneId);
    if (!chart) return null;
    try {
      return chart.timeScale().getVisibleLogicalRange();
    } catch {
      return null;
    }
  }

  /**
   * Clean up all subscriptions
   */
  dispose(): void {
    // Use unregisterPane for proper cleanup
    const paneIds = Array.from(this.panes.keys());
    paneIds.forEach((paneId) => {
      this.unregisterPane(paneId);
    });
  }
}

// Singleton instance for the chart viewport
let syncControllerInstance: SyncController | null = null;

export function getSyncController(): SyncController {
  if (!syncControllerInstance) {
    syncControllerInstance = new SyncController();
  }
  return syncControllerInstance;
}

export function resetSyncController(): void {
  if (syncControllerInstance) {
    syncControllerInstance.dispose();
    syncControllerInstance = null;
  }
}

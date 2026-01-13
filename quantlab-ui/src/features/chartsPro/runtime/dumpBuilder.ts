/**
 * dumpBuilder.ts
 *
 * Constructs the dump object for the public API.
 * No DOM, purely serializable data.
 *
 * The dump object exposes:
 * - symbol, timeframe
 * - data readiness (baseReady, comparesReady)
 * - render state (crosshair, legendRows, seriesStyles)
 * - hover state
 * - legend state
 * - last snapshot
 * - scale info
 * - etc.
 *
 * This is called from ChartViewport.dump() and returns the full state
 * as a JSON-serializable object for testing and inspection.
 */

export interface DumpBuilderInput {
  symbol: string | null;
  timeframe: string;
  pricePointCount: number;
  volumePointCount: number;
  baseRowsLength: number;
  comparesReadiness: Record<string, boolean>;
  lastLoadReason?: string;
  lastError?: string | null;
  hoverState: any;
  pinnedState: { time: number | null; price: number | null };
  legendState: any;
  lastSnapshot: any;
  scaleInfo: any;
  percentBlock: any;
  comparesMeta: any[];
  compareColors: any[];
  renderSnapshot: any;
  compareDisplays: any;
  overlayStates: { sma: any; ema: any };
  qaDebugEnabled: boolean;
  compareSourceKeys?: string[];
  compareCounts?: Record<string, number>;
}

/**
 * Stub for dumpBuilder - to be expanded as we extract more logic.
 * Currently this is a placeholder; the actual dump() logic remains
 * in ChartViewport.tsx for now to avoid massive refactor.
 */
export const buildDumpObject = (input: DumpBuilderInput): any => {
  // This function will be expanded to extract the full dump() logic from ChartViewport
  // For now, we're just providing the interface and placeholder.
  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    pricePoints: input.pricePointCount,
    volumePoints: input.volumePointCount,
    data: {
      baseReady: input.baseRowsLength > 0,
      comparesReady: input.comparesReadiness,
      lastLoadReason: input.lastLoadReason,
      lastError: input.lastError,
      _qaCompareSourceKeys: input.qaDebugEnabled ? input.compareSourceKeys : undefined,
      _qaCompareCounts: input.qaDebugEnabled ? input.compareCounts : undefined,
    },
    hover: input.hoverState,
    legend: input.legendState,
    last: input.lastSnapshot,
    scale: input.scaleInfo,
    percent: input.percentBlock,
    // ... more properties as we build out
  };
};

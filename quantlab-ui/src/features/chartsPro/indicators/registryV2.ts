/**
 * PRIO 3: Indicator Registry - Unified compute interface
 * 
 * Combines manifest definitions with compute functions.
 * Provides caching layer for performance.
 */

import type { UTCTimestamp } from "@/lib/lightweightCharts";
import type { IndicatorManifest, PanePolicy } from "./indicatorManifest";
import { getIndicatorManifest, TV_COLORS, type IndicatorKind, isValidIndicatorKind } from "./indicatorManifest";
import {
  computeSMA,
  computeSMAAdvanced,
  computeEMA,
  computeEMAAdvanced,
  computeSMMA,
  computeWMA,
  computeDEMA,
  computeTEMA,
  computeHMA,
  computeKAMA,
  computeVWMA,
  computeMcGinley,
  computeALMA,
  computeLSMA,
  computeMARibbon,
  computeMARibbon4,
  computePSAR,
  computeSAR,
  computeSupertrend,
  computeIchimoku,
  computeRSI,
  computeMACD,
  computeBollingerBands,
  computeATR,
  computeDonchianChannels,
  computeKeltnerChannels,
  computeVolatilityStop,
  computeChoppinessIndex,
  computeHistoricalVolatility,
  computeBBW,
  computeBBTrend,
  computeUlcerIndex,
  computeADX,
  computeDMI,
  computeVortex,
  computeAroon,
  computeAroonOsc,
  computeVWAP,
  computeAnchoredVWAP,
  computeOBV,
  computeOBVAdvanced,
  computeMFI,
  computeTRIX,
  computeTSI,
  computeSMII,
  computeSMIO,
  computeCoppockCurve,
  computeCMO,
  computeUO,
  computeCMF,
  computeStochastic,
  computeStochRSI,
  computeCCI,
  computeROC,
  computeMomentum,
  computeWilliamsR,
  computeAO,
  computeFisherTransform,
  computeVolumeDelta,
  computeVolumeDeltaFromChartBars,
  computeCVD,
  computeCVDFromChartBars,
  computeCVIFromChartBars,
  computePVT,
  computeKlingerOscillator,
  computePVI,
  computeNVI,
  computeRelVolAtTime,
  computePivotPointsStandard,
  computePivotPointsHighLow,
  computeZigZag,
  computeAutoFibRetracement,
  computeEnvelope,
  computeMedianIndicator,
  computeLinearRegression,
  computeWilliamsAlligator,
  computeWilliamsFractals,
  computeRSIDivergence,
  computeKnoxvilleDivergence,
  computeAdvanceDeclineRatioBars,
  computeAdvanceDeclineRatioBreadth,
  computeAdvanceDeclineLineBreadth,
  computeADRFromChartBars,
  computeADLFromChartBars,
  shiftSeriesByBars,
  type ComputeBar,
  type LinePoint,
  type MARibbonType,
  type BBMaType,
  type CCISmoothingType,
  type EMASmoothingType,
  type SMASmoothingType,
  type SARPlotStyle,
  type SARPoint,
  type OBVSmoothingType,
  type VolumeDeltaCandle,
  type CVDCandle,
  type CVDAnchorPeriod,
  type IntrabarPoint,
  type PivotPointType,
  type PivotTimeframe,
  type PivotPeriod,
  type PivotLevelKey,
  type WilliamsFractalPoint,
  type RSIDivergenceSignal,
  type KnoxvilleDivergenceSignal,
  type ADRBreadthResult,
  type ADLBreadthResult,
} from "./compute";

// ============================================================================
// Types - Re-export from manifest (single source of truth)
// ============================================================================

// Re-export IndicatorKind from manifest
export type { IndicatorKind };

export type IndicatorPane = "price" | "separate";

/** Standard line point (for lines) */
export interface IndicatorLineResult {
  id: string;
  label: string;
  pane: IndicatorPane;
  values: LinePoint[] | Array<{ time: UTCTimestamp; value: number; color?: string }>;
  color: string;
  style: "line" | "histogram";
  lineWidth: number;
  /** Line style: 0 = solid, 2 = dashed, 3 = dotted */
  lineStyle?: number;
  /** Whether this is a decorative level line (excluded from legend/status-line) */
  isLevelLine?: boolean;
}

export interface IndicatorWorkerResponse {
  id: string;
  kind: IndicatorKind;
  lines: IndicatorLineResult[];
  error?: string;
  /** Whether highlight fill is enabled (Supertrend only) */
  highlight?: boolean;
  /** Whether cloud fill is enabled (Ichimoku only) */
  showCloudFill?: boolean;
  /** Cloud data for Ichimoku overlay (even if lines hidden) */
  _cloudData?: {
    senkouA: Array<{ time: number; value?: number }>;
    senkouB: Array<{ time: number; value?: number }>;
  };
  /** Zero line settings (MACD only) */
  _zeroLine?: {
    visible: boolean;
    color?: string;
    lineStyle?: "solid" | "dashed" | "dotted";
    lineWidth?: number;
  };
  /** Bollinger Bands fill data */
  _bbData?: {
    upper: Array<{ time: number; value?: number }>;
    lower: Array<{ time: number; value?: number }>;
    backgroundColor: string;
  };
  /** Donchian Channels fill data */
  _dcFill?: {
    upper: Array<{ time: number; value?: number }>;
    lower: Array<{ time: number; value?: number }>;
    backgroundColor: string;
  };
  /** RSI fill data (passed through from registry) */
  _rsiFill?: {
    showBackgroundFill: boolean;
    backgroundFillColor: string;
    backgroundFillOpacity: number;
    showOverboughtFill: boolean;
    overboughtFillColor: string;
    showOversoldFill: boolean;
    oversoldFillColor: string;
    upperBandValue: number;
    middleBandValue: number;
    lowerBandValue: number;
    rsiValues: Array<{ time: any; value: number }>;
  };
  /** CCI fill data for canvas overlay */
  _cciFill?: {
    showBackgroundFill: boolean;
    backgroundFillColor: string;
    backgroundFillOpacity: number;
    upperBandValue: number;
    lowerBandValue: number;
  };
  /** EMA BB fill data for canvas overlay (when smoothingType = sma_bb) */
  _emaFill?: {
    showBBFill: boolean;
    bbFillColor: string;
    upper: Array<{ time: number; value?: number }>;
    lower: Array<{ time: number; value?: number }>;
  };
  /** SMA BB fill data for canvas overlay (when smoothingType = sma_bb) */
  _smaFill?: {
    showBBFill: boolean;
    fillColor: string;
    bbUpper: Array<{ time: number; value?: number }>;
    bbLower: Array<{ time: number; value?: number }>;
  };
  /** Williams %R fill data for canvas overlay (RSI-style fills) */
  _willrFill?: {
    showBackgroundFill: boolean;
    backgroundFillColor: string;
    backgroundFillOpacity: number;
    showOverboughtFill: boolean;
    overboughtFillColor: string;
    showOversoldFill: boolean;
    oversoldFillColor: string;
    upperBandValue: number;
    lowerBandValue: number;
    willrValues: Array<{ time: number; value: number }>;
  };
  /** SAR markers data for canvas overlay (circles/cross/diamonds) */
  _sarData?: {
    plotStyle: SARPlotStyle;
    color: string;
    lineWidth: number;
    priceLine: boolean;
    /** SAR points with trend info for marker rendering */
    points: Array<{ time: number; value: number; isUpTrend: boolean }>;
  };
  /** Stochastic RSI fill data for canvas overlay (zone fill between 20-80 bands) */
  _stochrsiFill?: {
    showBackground: boolean;
    backgroundFillColor: string;
    backgroundFillOpacity: number;
    upperBandValue: number;
    middleBandValue: number;
    lowerBandValue: number;
  };
  /** Stochastic fill data for canvas overlay (zone fill between 20-80 bands) */
  _stochFill?: {
    showBackground: boolean;
    backgroundFillColor: string;
    backgroundFillOpacity: number;
    upperBandValue: number;
    middleBandValue: number;
    lowerBandValue: number;
  };
  /** MFI fill data for canvas overlay (zone fill between overbought/oversold bands) */
  _mfiFill?: {
    showBackground: boolean;
    backgroundFillColor: string;
    backgroundFillOpacity: number;
    overboughtValue: number;
    middleBandValue: number;
    oversoldValue: number;
  };
  /** CHOP fill data for canvas overlay (zone fill between upper/lower bands) */
  _chopFill?: {
    showBackground: boolean;
    backgroundFillColor: string;
    backgroundFillOpacity: number;
    upperBandValue: number;
    middleBandValue: number;
    lowerBandValue: number;
  };
  /** VWAP bands fill data for canvas overlay (up to 3 band fills) */
  _vwapFill?: {
    fills: Array<{
      enabled: boolean;
      color: string;
      opacity: number;
      upperLineId: string;
      lowerLineId: string;
    }>;
    anchorPeriod: string;
  };
  /** OBV BB fill data for canvas overlay (when smoothingType = sma_bb) */
  _obvFill?: {
    showBBFill: boolean;
    bbFillColor: string;
    bbFillOpacity: number;
    bbUpper: Array<{ time: number; value?: number }>;
    bbLower: Array<{ time: number; value?: number }>;
  };
  /** 
   * Flag to indicate this indicator uses compact formatter (K/M/B/T) for price scale
   * Used by UI to apply volume-style formatting to axis labels and last value
   */
  _compactFormatter?: boolean;
  /** Ulcer Index fill data for canvas overlay (fill between 0 and ulcer line) */
  _ulcerFill?: {
    showBackground: boolean;
    backgroundFillColor: string;
    backgroundFillOpacity: number;
    ulcerValues: Array<{ time: any; value: number }>;
  };
  /** 
   * Volume Delta candle data for candlestick series rendering
   * Used by IndicatorPane to render OHLC candles (not lines)
   */
  _volumeDeltaCandles?: {
    candles: VolumeDeltaCandle[];
    upColor: string;
    downColor: string;
    wickUpColor: string;
    wickDownColor: string;
    borderUpColor: string;
    borderDownColor: string;
    showZeroLine: boolean;
    zeroLineColor: string;
    zeroLineStyle: "solid" | "dashed" | "dotted";
  };
  /** 
   * CVD (Cumulative Volume Delta) candle data
   * Same structure as Volume Delta but with cumulative semantics
   */
  _cvdCandles?: {
    candles: CVDCandle[];
    upColor: string;
    downColor: string;
    wickUpColor: string;
    wickDownColor: string;
    borderUpColor: string;
    borderDownColor: string;
    showLevelZero: boolean;
    levelZeroColor: string;
    levelZeroStyle: "solid" | "dashed" | "dotted";
    anchorPeriod: string;
  };
  /**
   * Pivot Points Standard data for overlay rendering
   * Contains segments (periods) with levels and time boundaries
   */
  _pivotPointsData?: {
    periods: PivotPeriod[];
    validLevels: PivotLevelKey[];
    pivotType: PivotPointType;
    showLabels: boolean;
    showPrices: boolean;
    labelsPosition: "left" | "right";
    lineWidth: number;
    levelVisibility: Record<PivotLevelKey, boolean>;
    levelColors: Record<PivotLevelKey, string>;
  };
  
  /**
   * Pivot Points High Low data for overlay rendering
   * Contains individual pivot highs and lows with labels
   */
  _pivotPointsHLData?: {
    pivots: Array<{ time: number; price: number; isHigh: boolean; index: number }>;
    highs: Array<{ time: number; price: number; index: number }>;
    lows: Array<{ time: number; price: number; index: number }>;
    showPrices: boolean;
    highColor: string;
    lowColor: string;
  };
  
  /**
   * Zig Zag data for overlay rendering
   * Contains swing points and line segments
   */
  _zigzagData?: {
    swings: Array<{ time: number; price: number; isHigh: boolean; index: number; volume?: number; priceChange?: number; percentChange?: number }>;
    lineSegments: Array<{ startTime: number; startPrice: number; endTime: number; endPrice: number; isUp: boolean }>;
    lineColor: string;
    lineWidth: number;
    showPrice: boolean;
    showVolume: boolean;
    priceChangeMode: "absolute" | "percent";
    upColor: string;
    downColor: string;
  };
  
  /**
   * Auto Fib Retracement data for overlay rendering
   * Contains Fibonacci levels and anchor points
   */
  _autoFibData?: {
    startPoint: { time: number; price: number } | null;
    endPoint: { time: number; price: number } | null;
    levels: Array<{ ratio: number; price: number; color: string }>;
    isUpward: boolean;
    extendLeft: boolean;
    extendRight: boolean;
    showPrices: boolean;
    showLevels: "values" | "percent";
    labelsPosition: "left" | "right";
    backgroundTransparency: number;
    lineWidth: number;
  };
  
  /**
   * Williams Alligator data for overlay rendering
   * Forward-shifted SMMA lines with raw values for status line
   */
  _alligatorData?: {
    jaw: Array<{ time: number; value?: number }>;
    teeth: Array<{ time: number; value?: number }>;
    lips: Array<{ time: number; value?: number }>;
    jawRaw: Array<{ time: number; value: number }>;
    teethRaw: Array<{ time: number; value: number }>;
    lipsRaw: Array<{ time: number; value: number }>;
    showJaw: boolean;
    showTeeth: boolean;
    showLips: boolean;
    jawColor: string;
    teethColor: string;
    lipsColor: string;
    jawLineWidth: number;
    teethLineWidth: number;
    lipsLineWidth: number;
  };
  
  /**
   * Williams Fractals data for overlay rendering
   * Fractal high/low markers
   */
  _fractalsData?: {
    highs: WilliamsFractalPoint[];
    lows: WilliamsFractalPoint[];
    showUpFractals: boolean;
    showDownFractals: boolean;
    upColor: string;
    downColor: string;
  };
  
  /**
   * RSI Divergence data for separate pane rendering
   * RSI line + divergence signals + background/levels/labels
   */
  _rsiDivData?: {
    signals: RSIDivergenceSignal[];
    pivotHighs: Array<{ index: number; time: number; rsi: number; price: number }>;
    pivotLows: Array<{ index: number; time: number; rsi: number; price: number }>;
    rsiData: Array<{ time: number; value: number }>;
    bullColor: string;
    bearColor: string;
    showBullish: boolean;
    showHiddenBullish: boolean;
    showBearish: boolean;
    showHiddenBearish: boolean;
    showBullLabel: boolean;
    showBearLabel: boolean;
    showBackground: boolean;
    showLevels: boolean;
    upperLevel: number;
    middleLevel: number;
    lowerLevel: number;
    backgroundFillColor: string;
    levelColor: string;
  };
  
  /**
   * Knoxville Divergence data for overlay rendering
   * Divergence lines + +KD and -KD markers
   */
  _knoxvilleData?: {
    bullish: KnoxvilleDivergenceSignal[];
    bearish: KnoxvilleDivergenceSignal[];
    showBullish: boolean;
    showBearish: boolean;
    showLines: boolean;
    bullColor: string;
    bearColor: string;
  };
  
  /**
   * VRVP (Visible Range Volume Profile) data for overlay rendering
   * Volume histogram + POC/VAH/VAL lines
   */
  _vrvpData?: {
    /** Indicates this is a VP indicator that needs special handling */
    isVolumeProfile: true;
    /** Style configuration */
    style: {
      upColor: string;
      downColor: string;
      pocColor: string;
      vaColor: string;
      valueAreaColor: string;
      widthPercent: number;
      placement: "Left" | "Right";
      showHistogram: boolean;
      showPOC: boolean;
      showVALines: boolean;
      showValueArea: boolean;
      extendPOC: boolean;
      extendVA: boolean;
      valueAreaPercent: number;
      volumeMode: "Up/Down" | "Total" | "Delta";
      numRows: number;
      rowsLayout: "Number of Rows" | "Ticks Per Row";
    };
  };
}

/**
 * Per-line style configuration for indicators
 * Used to customize individual output lines (e.g., MACD line vs signal line)
 */
export interface LineStyleConfig {
  color?: string;
  lineWidth?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  visible?: boolean;
}

export interface IndicatorInstance {
  id: string;
  kind: IndicatorKind;
  pane: IndicatorPane;
  color: string;
  hidden?: boolean;
  params: Record<string, number | string>;
  /**
   * Per-line style overrides (keyed by output line id, e.g., "macd", "signal", "histogram")
   * Style changes update series.applyOptions() WITHOUT triggering recompute
   */
  styleByLineId?: Record<string, LineStyleConfig>;
}

// ============================================================================
// Compute Cache
// ============================================================================

interface CacheKey {
  indicatorId: string;
  kind: IndicatorKind;
  paramsHash: string;
  dataHash: string;
}

interface CacheEntry {
  key: CacheKey;
  result: IndicatorWorkerResponse;
  timestamp: number;
}

const computeCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function hashParams(params: Record<string, number | string>): string {
  return JSON.stringify(params);
}

function hashData(data: ComputeBar[]): string {
  if (data.length === 0) return "empty";
  // Use length + first/last bar times as lightweight hash
  const first = data[0];
  const last = data[data.length - 1];
  return `${data.length}:${first.time}:${last.time}:${last.close}`;
}

function makeCacheKey(key: CacheKey): string {
  return `${key.indicatorId}|${key.kind}|${key.paramsHash}|${key.dataHash}`;
}

function getCached(key: CacheKey): IndicatorWorkerResponse | null {
  const cacheKey = makeCacheKey(key);
  const entry = computeCache.get(cacheKey);
  if (!entry) return null;
  
  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    computeCache.delete(cacheKey);
    return null;
  }
  
  return entry.result;
}

function setCache(key: CacheKey, result: IndicatorWorkerResponse): void {
  const cacheKey = makeCacheKey(key);
  
  // Evict oldest if at max size
  if (computeCache.size >= MAX_CACHE_SIZE) {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of computeCache) {
      if (v.timestamp < oldestTime) {
        oldest = k;
        oldestTime = v.timestamp;
      }
    }
    if (oldest) computeCache.delete(oldest);
  }
  
  computeCache.set(cacheKey, {
    key,
    result,
    timestamp: Date.now(),
  });
}

export function clearIndicatorCache(): void {
  computeCache.clear();
}

// ============================================================================
// Compute Counter (for testing that style changes don't trigger recompute)
// ============================================================================

let computeCounter = 0;

/** Get the total number of indicator computations (for testing) */
export function getComputeCount(): number {
  return computeCounter;
}

/** Reset the compute counter (for testing) */
export function resetComputeCount(): void {
  computeCounter = 0;
}

// ============================================================================
// Intrabar Data Types (for Volume Delta / CVD parity)
// ============================================================================

/** Single intrabar point (lower timeframe data) */
export interface IntrabarPoint {
  time: number;   // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Map from chart bar time to its intrabars */
export type IntrabarMap = Map<number, IntrabarPoint[]>;

/** Single breadth data point from exchange */
export interface BreadthBarData {
  time: number;       // Unix timestamp in seconds
  advances: number;   // Number of advancing stocks
  declines: number;   // Number of declining stocks
  unchanged: number;  // Number of unchanged stocks
}

/** Map from chart bar time to breadth data for that day */
export type BreadthMap = Map<number, BreadthBarData>;

// ============================================================================
// Unified Compute Function
// ============================================================================

interface ComputeOptions {
  indicator: IndicatorInstance;
  data: ComputeBar[];
  /** Optional intrabar data for Volume Delta/CVD parity */
  intrabars?: IntrabarMap;
  /** Optional market breadth data for ADR/ADL parity */
  breadthData?: BreadthMap;
  /** Optional ADL seed for cumulative offset parity */
  adlSeed?: number;
}

export function computeIndicator({ indicator, data, intrabars, breadthData, adlSeed }: ComputeOptions): IndicatorWorkerResponse {
  // Check cache
  const cacheKey: CacheKey = {
    indicatorId: indicator.id,
    kind: indicator.kind,
    paramsHash: hashParams(indicator.params),
    dataHash: hashData(data),
  };
  
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Increment counter BEFORE compute - tracks actual recomputes (not cache hits)
  // This ensures style changes (which don't call computeIndicator at all) don't increment
  computeCounter++;
  
  // Compute
  const result = doCompute(indicator, data, intrabars, breadthData, adlSeed);
  
  // Cache result
  setCache(cacheKey, result);
  
  return result;
}

function doCompute(
  indicator: IndicatorInstance, 
  data: ComputeBar[], 
  intrabars?: IntrabarMap, 
  breadthData?: BreadthMap, 
  adlSeed?: number
): IndicatorWorkerResponse {
  
  const manifest = getIndicatorManifest(indicator.kind);
  const pane: IndicatorPane = manifest?.panePolicy === "overlay" ? "price" : "separate";
  
  try {
    switch (indicator.kind) {
      case "sma": {
        // === Extract params (TV-style) ===
        const length = Number(indicator.params.length ?? indicator.params.period) || 9;
        const source = (indicator.params.source as string) || "close";
        const offset = Number(indicator.params.offset) || 0;
        const smoothingType = (indicator.params.smoothingType as SMASmoothingType) || "none";
        const smoothingLength = Number(indicator.params.smoothingLength) || 14;
        const bbStdDev = Number(indicator.params.bbStdDev) || 2;
        
        // Style toggles
        const showSMA = indicator.params.showSMA !== false;
        const showSmoothing = indicator.params.showSmoothing !== false;
        const showBBUpper = indicator.params.showBBUpper !== false;
        const showBBLower = indicator.params.showBBLower !== false;
        const showBBFill = indicator.params.showBBFill !== false;
        
        // Colors
        const smaColor = (indicator.params.smaColor as string) || "#2962FF";
        const smoothingColor = (indicator.params.smoothingColor as string) || "#FDD835";
        const bbUpperColor = (indicator.params.bbUpperColor as string) || "#4CAF50";
        const bbLowerColor = (indicator.params.bbLowerColor as string) || "#4CAF50";
        const bbFillColor = (indicator.params.bbFillColor as string) || "rgba(76, 175, 80, 0.1)";
        
        // Compute advanced SMA
        const result = computeSMAAdvanced(
          data,
          length,
          source as any,
          offset,
          smoothingType,
          smoothingLength,
          bbStdDev
        );
        
        // Build label: "SMA {length} {source}" (TV-style)
        const labelText = `SMA ${length} ${source}`;
        
        // Convert NaN to WhitespaceData for autoscale safety
        const safeSma = result.sma
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time, value: p.value }));
        
        const safeSmoothing = result.smoothing
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time, value: p.value }));
        
        const safeBbUpper = result.bbUpper
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time, value: p.value }));
        
        const safeBbLower = result.bbLower
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time, value: p.value }));
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // Main SMA line
        if (showSMA && safeSma.length > 0) {
          lines.push({
            id: "sma",
            label: labelText,
            pane: "price",
            color: smaColor,
            style: "line",
            lineWidth: 1,
            values: safeSma,
          });
        }
        
        // Smoothing line (only when smoothingType != none)
        if (smoothingType !== "none" && showSmoothing && safeSmoothing.length > 0) {
          lines.push({
            id: "smaSmoothing",
            label: `Smoothing`,
            pane: "price",
            color: smoothingColor,
            style: "line",
            lineWidth: 1,
            values: safeSmoothing,
          });
        }
        
        // BB Upper (only when smoothingType == sma_bb)
        if (smoothingType === "sma_bb" && showBBUpper && safeBbUpper.length > 0) {
          lines.push({
            id: "smaBbUpper",
            label: `BB Upper`,
            pane: "price",
            color: bbUpperColor,
            style: "line",
            lineWidth: 1,
            values: safeBbUpper,
          });
        }
        
        // BB Lower (only when smoothingType == sma_bb)
        if (smoothingType === "sma_bb" && showBBLower && safeBbLower.length > 0) {
          lines.push({
            id: "smaBbLower",
            label: `BB Lower`,
            pane: "price",
            color: bbLowerColor,
            style: "line",
            lineWidth: 1,
            values: safeBbLower,
          });
        }
        
        // Return with fill config
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Serializable fill config (no functions!)
          _smaFill: smoothingType === "sma_bb" ? {
            bbUpper: safeBbUpper,
            bbLower: safeBbLower,
            fillColor: bbFillColor,
            showBBFill,
          } : undefined,
        };
      }
      
      case "ema": {
        // === Extract params (TV-style) ===
        const length = Number(indicator.params.length ?? indicator.params.period) || 9;
        const source = (indicator.params.source as string) || "close";
        const offset = Number(indicator.params.offset) || 0;
        const smoothingType = (indicator.params.smoothingType as EMASmoothingType) || "none";
        const smoothingLength = Number(indicator.params.smoothingLength) || 14;
        const bbStdDev = Number(indicator.params.bbStdDev) || 2;
        
        // Style toggles
        const showEMA = indicator.params.showEMA !== false;
        const showSmoothing = indicator.params.showSmoothing !== false;
        const showBBUpper = indicator.params.showBBUpper !== false;
        const showBBLower = indicator.params.showBBLower !== false;
        const showBBFill = indicator.params.showBBFill !== false;
        
        // Colors
        const emaColor = (indicator.params.emaColor as string) || "#2962FF";
        const smoothingColor = (indicator.params.smoothingColor as string) || "#FDD835";
        const bbUpperColor = (indicator.params.bbUpperColor as string) || "#2962FF";
        const bbLowerColor = (indicator.params.bbLowerColor as string) || "#2962FF";
        const bbFillColor = (indicator.params.bbFillColor as string) || "rgba(41, 98, 255, 0.1)";
        
        // Compute advanced EMA
        const result = computeEMAAdvanced(
          data,
          length,
          source as any,
          offset,
          smoothingType,
          smoothingLength,
          bbStdDev
        );
        
        // Build label: "EMA {length} {source}" (TV-style)
        const labelText = `EMA ${length} ${source}`;
        
        // Convert NaN to WhitespaceData for autoscale safety
        const safeEma = result.ema
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time, value: p.value }));
        
        const safeSmoothing = result.smoothing
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time, value: p.value }));
        
        const safeBBUpper = result.bbUpper
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time, value: p.value }));
        
        const safeBBLower = result.bbLower
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time, value: p.value }));
        
        // Build output lines
        const lines: IndicatorLineResult[] = [];
        
        // Main EMA line (always present if showEMA)
        if (showEMA) {
          lines.push({
            id: "ema",
            label: labelText,
            pane: "price",
            color: emaColor,
            style: "line",
            lineWidth: 1,
            values: safeEma,
          });
        }
        
        // Smoothing line (if smoothingType != none and showSmoothing)
        if (smoothingType !== "none" && showSmoothing && safeSmoothing.length > 0) {
          lines.push({
            id: "smoothing",
            label: `MA(${smoothingLength})`,
            pane: "price",
            color: smoothingColor,
            style: "line",
            lineWidth: 1,
            values: safeSmoothing,
          });
        }
        
        // BB Upper (if sma_bb and showBBUpper)
        if (smoothingType === "sma_bb" && showBBUpper && safeBBUpper.length > 0) {
          lines.push({
            id: "bbUpper",
            label: "Upper",
            pane: "price",
            color: bbUpperColor,
            style: "line",
            lineWidth: 1,
            values: safeBBUpper,
          });
        }
        
        // BB Lower (if sma_bb and showBBLower)
        if (smoothingType === "sma_bb" && showBBLower && safeBBLower.length > 0) {
          lines.push({
            id: "bbLower",
            label: "Lower",
            pane: "price",
            color: bbLowerColor,
            style: "line",
            lineWidth: 1,
            values: safeBBLower,
          });
        }
        
        // Build response with fill data for SMA+BB
        const response: IndicatorWorkerResponse = {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
        
        // Add BB fill data if smoothingType = sma_bb
        if (smoothingType === "sma_bb" && showBBFill) {
          response._emaFill = {
            showBBFill: true,
            bbFillColor,
            upper: safeBBUpper.map(p => ({ time: p.time as number, value: p.value })),
            lower: safeBBLower.map(p => ({ time: p.time as number, value: p.value })),
          };
        }
        
        return response;
      }
      
      case "smma": {
        const period = Number(indicator.params.period) || 14;
        const source = (indicator.params.source as string) || "close";
        const values = computeSMMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "smma",
            label: `SMMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.blue,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "wma": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeWMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "wma",
            label: `WMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "dema": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeDEMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "dema",
            label: `DEMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.teal,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "tema": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeTEMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "tema",
            label: `TEMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.pink,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "hma": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeHMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "hma",
            label: `HMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.green,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "kama": {
        const period = Number(indicator.params.period) || 10;
        const fast = Number(indicator.params.fast) || 2;
        const slow = Number(indicator.params.slow) || 30;
        const source = (indicator.params.source as string) || "close";
        const values = computeKAMA(data, period, fast, slow, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "kama",
            label: `KAMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.orange,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "vwma": {
        const period = Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "close";
        const values = computeVWMA(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "vwma",
            label: `VWMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "mcginley": {
        const period = Number(indicator.params.period) || 14;
        const source = (indicator.params.source as string) || "close";
        const values = computeMcGinley(data, period, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "mcginley",
            label: `McGinley(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.teal,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "alma": {
        const period = Number(indicator.params.period) || 9;
        const offset = Number(indicator.params.offset) || 0.85;
        const sigma = Number(indicator.params.sigma) || 6;
        const source = (indicator.params.source as string) || "close";
        const values = computeALMA(data, period, offset, sigma, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "alma",
            label: `ALMA(${period})`,
            pane: "price",
            color: indicator.color || TV_COLORS.blue,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "lsma": {
        const length = Number(indicator.params.length) || 25;
        const offset = Number(indicator.params.offset) ?? 0;
        const source = (indicator.params.source as string) || "close";
        const values = computeLSMA(data, length, offset, source as any);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "lsma",
            label: `LSMA(${length})`,
            pane: "price",
            color: indicator.color || TV_COLORS.blue,
            style: "line",
            lineWidth: 2,
            values,
          }],
        };
      }
      
      case "maribbon": {
        const maType = (indicator.params.maType as MARibbonType) || "ema";
        const basePeriod = Number(indicator.params.basePeriod) || 20;
        const periodStep = Number(indicator.params.periodStep) || 5;
        const source = (indicator.params.source as string) || "close";
        const result = computeMARibbon(data, maType, basePeriod, periodStep, source as any);
        
        // TV gradient colors: green (fastest) → red → purple → indigo (slowest)
        const colors = [
          "#22C55E", // green-500 (MA1, period 20)
          "#84CC16", // lime-500 (MA2, period 25)
          "#EAB308", // yellow-500 (MA3, period 30)
          "#F97316", // orange-500 (MA4, period 35)
          "#EF4444", // red-500 (MA5, period 40)
          "#EC4899", // pink-500 (MA6, period 45)
          "#A855F7", // purple-500 (MA7, period 50)
          "#6366F1", // indigo-500 (MA8, period 55)
        ];
        
        const periods = Array.from({ length: 8 }, (_, i) => basePeriod + i * periodStep);
        const maTypeLabel = maType.toUpperCase();
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            { id: "ma1", label: `${maTypeLabel}(${periods[0]})`, pane: "price" as const, color: colors[0], style: "line" as const, lineWidth: 1, values: result.ma1 },
            { id: "ma2", label: `${maTypeLabel}(${periods[1]})`, pane: "price" as const, color: colors[1], style: "line" as const, lineWidth: 1, values: result.ma2 },
            { id: "ma3", label: `${maTypeLabel}(${periods[2]})`, pane: "price" as const, color: colors[2], style: "line" as const, lineWidth: 1, values: result.ma3 },
            { id: "ma4", label: `${maTypeLabel}(${periods[3]})`, pane: "price" as const, color: colors[3], style: "line" as const, lineWidth: 1, values: result.ma4 },
            { id: "ma5", label: `${maTypeLabel}(${periods[4]})`, pane: "price" as const, color: colors[4], style: "line" as const, lineWidth: 1, values: result.ma5 },
            { id: "ma6", label: `${maTypeLabel}(${periods[5]})`, pane: "price" as const, color: colors[5], style: "line" as const, lineWidth: 1, values: result.ma6 },
            { id: "ma7", label: `${maTypeLabel}(${periods[6]})`, pane: "price" as const, color: colors[6], style: "line" as const, lineWidth: 1, values: result.ma7 },
            { id: "ma8", label: `${maTypeLabel}(${periods[7]})`, pane: "price" as const, color: colors[7], style: "line" as const, lineWidth: 1, values: result.ma8 },
          ],
        };
      }
      
      case "maribbon4": {
        const maType = (indicator.params.maType as MARibbonType) || "ema";
        const len1 = Number(indicator.params.len1) || 20;
        const len2 = Number(indicator.params.len2) || 50;
        const len3 = Number(indicator.params.len3) || 100;
        const len4 = Number(indicator.params.len4) || 200;
        const source = (indicator.params.source as string) || "close";
        const result = computeMARibbon4(data, maType, len1, len2, len3, len4, source as any);
        
        // TV-style colors: yellow → orange → deep orange → red
        const colors = [
          "#FFEB3B", // yellow (MA1, fastest)
          "#FF9800", // orange (MA2)
          "#FF5722", // deep orange (MA3)
          "#F44336", // red (MA4, slowest)
        ];
        
        const periods = [len1, len2, len3, len4];
        const maTypeLabel = maType.toUpperCase();
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            { id: "ma1", label: `${maTypeLabel}(${periods[0]})`, pane: "price" as const, color: colors[0], style: "line" as const, lineWidth: 1, values: result.ma1 },
            { id: "ma2", label: `${maTypeLabel}(${periods[1]})`, pane: "price" as const, color: colors[1], style: "line" as const, lineWidth: 1, values: result.ma2 },
            { id: "ma3", label: `${maTypeLabel}(${periods[2]})`, pane: "price" as const, color: colors[2], style: "line" as const, lineWidth: 1, values: result.ma3 },
            { id: "ma4", label: `${maTypeLabel}(${periods[3]})`, pane: "price" as const, color: colors[3], style: "line" as const, lineWidth: 1, values: result.ma4 },
          ],
        };
      }
      
      case "sar": {
        // === Extract params (TV-style) ===
        const start = Number(indicator.params.start) || 0.02;
        const increment = Number(indicator.params.increment) || 0.02;
        const maxValue = Number(indicator.params.maxValue ?? indicator.params.maximum) || 0.2;
        const plotStyle = (indicator.params.plotStyle as SARPlotStyle) || "circles";
        const priceLine = indicator.params.priceLine === true;
        const sarColor = (indicator.params.sarColor as string) || "#2962FF";
        const lineWidth = Number(indicator.params.lineWidth) || 1;
        
        // Compute SAR with trend info
        const result = computeSAR(data, start, increment, maxValue);
        
        // Format numbers TV-style: trim trailing zeros
        const formatNum = (n: number) => {
          // Show 2 decimals for start/increment, 1 for max if it's 0.X
          const s = n.toFixed(3);
          return parseFloat(s).toString(); // Removes trailing zeros
        };
        
        // TV label format: "SAR 0.02 0.02 0.2" (spaces, no parens)
        const labelText = `SAR ${formatNum(start)} ${formatNum(increment)} ${formatNum(maxValue)}`;
        
        // Build line values based on plotStyle
        let lineValues: Array<{ time: UTCTimestamp; value?: number }> = [];
        
        if (plotStyle === "circles" || plotStyle === "cross") {
          // For marker-based styles, we still need line values for legend/hover
          // But actual rendering will be via canvas overlay
          lineValues = result.points.map(p => ({ time: p.time, value: p.value }));
        } else if (plotStyle === "lineWithBreaks" || plotStyle === "stepLineWithBreaks") {
          // Break line at trend reversals - inject WhitespaceData
          for (let i = 0; i < result.points.length; i++) {
            const pt = result.points[i];
            
            // Check for reversal (trend changed from previous bar)
            if (i > 0 && result.points[i].isUpTrend !== result.points[i - 1].isUpTrend) {
              // Inject whitespace to break the line
              lineValues.push({ time: pt.time });
            }
            
            lineValues.push({ time: pt.time, value: pt.value });
          }
        } else {
          // line, stepLine, columns - continuous line
          lineValues = result.points.map(p => ({ time: p.time, value: p.value }));
        }
        
        // Build response
        const response: IndicatorWorkerResponse = {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "sar",
            label: labelText,
            pane: "price",
            color: sarColor,
            style: plotStyle === "columns" ? "histogram" : "line",
            lineWidth,
            values: lineValues,
          }],
        };
        
        // Add SAR data for canvas overlay (circles/cross)
        if (plotStyle === "circles" || plotStyle === "cross") {
          response._sarData = {
            plotStyle,
            color: sarColor,
            lineWidth,
            priceLine,
            points: result.points.map(p => ({
              time: p.time as number,
              value: p.value,
              isUpTrend: p.isUpTrend,
            })),
          };
        }
        
        return response;
      }
      
      // Legacy "psar" alias for backward compatibility
      case "psar": {
        const start = Number(indicator.params.start) || 0.02;
        const increment = Number(indicator.params.increment) || 0.02;
        const maximum = Number(indicator.params.maximum) || 0.2;
        const values = computePSAR(data, start, increment, maximum);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "psar",
            label: `PSAR(${start},${increment},${maximum})`,
            pane: "price",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 1,
            values,
          }],
        };
      }
      
      case "supertrend": {
        const atrLength = Number(indicator.params.atrLength) || 10;
        const factor = Number(indicator.params.factor) || 3.0;
        const highlight = indicator.params.highlight !== false; // default true
        const result = computeSupertrend(data, atrLength, factor);
        
        // TV-style linebr: Use WhitespaceData { time } for inactive bars
        // This creates proper line breaks without diagonal bridges
        const upValues = result.up.map(pt => 
          Number.isFinite(pt.value) ? { time: pt.time, value: pt.value } : { time: pt.time }
        );
        const downValues = result.down.map(pt => 
          Number.isFinite(pt.value) ? { time: pt.time, value: pt.value } : { time: pt.time }
        );
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          highlight, // Pass highlight setting for fill overlay
          lines: [
            {
              id: "supertrend_up",
              label: `ST Up(${atrLength},${factor})`,
              pane: "price",
              color: TV_COLORS.green,
              style: "line",
              lineWidth: 1, // TV uses 1px
              values: upValues,
            },
            {
              id: "supertrend_down",
              label: `ST Down(${atrLength},${factor})`,
              pane: "price",
              color: TV_COLORS.red,
              style: "line",
              lineWidth: 1, // TV uses 1px
              values: downValues,
            },
          ],
        };
      }
      
      case "ichimoku": {
        const tenkanPeriod = Number(indicator.params.tenkanPeriod) || 9;
        const kijunPeriod = Number(indicator.params.kijunPeriod) || 26;
        const senkouBPeriod = Number(indicator.params.senkouBPeriod) || 52;
        const displacement = Number(indicator.params.displacement) || 26;
        
        // Visibility toggles (default all true for TV parity)
        const showTenkan = indicator.params.showTenkan !== false;
        const showKijun = indicator.params.showKijun !== false;
        const showChikou = indicator.params.showChikou !== false;
        const showSpanA = indicator.params.showSpanA !== false;
        const showSpanB = indicator.params.showSpanB !== false;
        const showCloudFill = indicator.params.showCloudFill !== false;
        
        const result = computeIchimoku(data, tenkanPeriod, kijunPeriod, senkouBPeriod, displacement);
        
        // WhitespaceData pattern for TV parity - NaN becomes { time } only
        const toWhitespace = (pts: LinePoint[]) =>
          pts.map(pt => Number.isFinite(pt.value) ? { time: pt.time, value: pt.value } : { time: pt.time });
        
        // Build lines array based on visibility toggles
        const lines: IndicatorLineResult[] = [];
        
        // TV colors (verified against TradingView)
        const TV_ICHIMOKU_COLORS = {
          tenkan: "#2962FF",   // Blue
          kijun: "#B71C1C",    // Dark red  
          senkouA: "#43A047",  // Green
          senkouB: "#FF5252",  // Red
          chikou: "#43A047",   // Green (same as Span A in TV)
        };
        
        if (showTenkan) {
          lines.push({
            id: "tenkan",
            label: `Conversion(${tenkanPeriod})`,
            pane: "price",
            color: TV_ICHIMOKU_COLORS.tenkan,
            style: "line",
            lineWidth: 1,
            values: toWhitespace(result.tenkan),
          });
        }
        
        if (showKijun) {
          lines.push({
            id: "kijun",
            label: `Base(${kijunPeriod})`,
            pane: "price",
            color: TV_ICHIMOKU_COLORS.kijun,
            style: "line",
            lineWidth: 1,
            values: toWhitespace(result.kijun),
          });
        }
        
        // Senkou spans always included for cloud rendering (but may be hidden via visibility)
        if (showSpanA) {
          lines.push({
            id: "senkouA",
            label: `Lead A`,
            pane: "price",
            color: TV_ICHIMOKU_COLORS.senkouA,
            style: "line",
            lineWidth: 1,
            values: toWhitespace(result.senkouA),
          });
        }
        
        if (showSpanB) {
          lines.push({
            id: "senkouB",
            label: `Lead B`,
            pane: "price",
            color: TV_ICHIMOKU_COLORS.senkouB,
            style: "line",
            lineWidth: 1,
            values: toWhitespace(result.senkouB),
          });
        }
        
        if (showChikou) {
          lines.push({
            id: "chikou",
            label: `Lagging`,
            pane: "price",
            color: TV_ICHIMOKU_COLORS.chikou,
            style: "line",
            lineWidth: 1,
            values: toWhitespace(result.chikou),
          });
        }
        
        // Always include full span data for cloud overlay (even if lines hidden)
        // Store in special _cloudData property for the overlay
        return {
          id: indicator.id,
          kind: indicator.kind,
          showCloudFill,
          _cloudData: {
            senkouA: toWhitespace(result.senkouA),
            senkouB: toWhitespace(result.senkouB),
          },
          lines,
        };
      }
      
      case "rsi": {
        const period = Number(indicator.params.period) || 14;
        const source = (indicator.params.source as string) || "close";
        const smoothingType = (indicator.params.smoothingType as string) || "sma";
        const smoothingLength = Number(indicator.params.smoothingLength) || 14;
        const upperBandValue = Number(indicator.params.upperBandValue) || 70;
        const middleBandValue = Number(indicator.params.middleBandValue) || 50;
        const lowerBandValue = Number(indicator.params.lowerBandValue) || 30;
        
        // Style toggles
        const showRSI = indicator.params.showRSI !== false;
        const showRSIMA = indicator.params.showRSIMA !== false;
        const showUpperBand = indicator.params.showUpperBand !== false;
        const showMiddleBand = indicator.params.showMiddleBand !== false;
        const showLowerBand = indicator.params.showLowerBand !== false;
        
        // Colors
        const rsiColor = (indicator.params.rsiColor as string) || "#7E57C2";
        const rsiMAColor = (indicator.params.rsiMAColor as string) || "#F7B924";
        const upperBandColor = (indicator.params.upperBandColor as string) || "#B2B5BE";
        const middleBandColor = (indicator.params.middleBandColor as string) || "#B2B5BE";
        const lowerBandColor = (indicator.params.lowerBandColor as string) || "#B2B5BE";
        
        // Line widths
        const rsiLineWidth = Number(indicator.params.rsiLineWidth) || 2;
        const rsiMALineWidth = Number(indicator.params.rsiMALineWidth) || 2;
        
        // Fill settings (passed through _rsiFill config)
        const showBackgroundFill = indicator.params.showBackgroundFill !== false;
        const backgroundFillColor = (indicator.params.backgroundFillColor as string) || "#7E57C2";
        const backgroundFillOpacity = Number(indicator.params.backgroundFillOpacity) ?? 0.1;
        const showOverboughtFill = indicator.params.showOverboughtFill !== false;
        const overboughtFillColor = (indicator.params.overboughtFillColor as string) || "#26A69A";
        const showOversoldFill = indicator.params.showOversoldFill !== false;
        const oversoldFillColor = (indicator.params.oversoldFillColor as string) || "#EF5350";
        
        const result = computeRSI(
          data,
          period,
          source as any,
          smoothingType as any,
          smoothingLength,
          upperBandValue,
          middleBandValue,
          lowerBandValue
        );
        
        // Convert NaN values to WhitespaceData for proper autoscale
        const mapToWhitespace = (points: { time: any; value: number }[]) => 
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Get style overrides
        const rsiStyle = indicator.styleByLineId?.["rsi"];
        const maStyle = indicator.styleByLineId?.["rsiMa"];
        const upperStyle = indicator.styleByLineId?.["upperBand"];
        const middleStyle = indicator.styleByLineId?.["middleBand"];
        const lowerStyle = indicator.styleByLineId?.["lowerBand"];
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "rsi",
              label: `RSI(${period})`,
              pane: "separate",
              color: rsiStyle?.color ?? rsiColor,
              style: "line",
              lineWidth: rsiStyle?.lineWidth ?? rsiLineWidth,
              values: (showRSI && rsiStyle?.visible !== false) ? mapToWhitespace(result.rsi) : [],
            },
            {
              id: "rsiMa",
              label: `RSI MA(${smoothingLength})`,
              pane: "separate",
              color: maStyle?.color ?? rsiMAColor,
              style: "line",
              lineWidth: maStyle?.lineWidth ?? rsiMALineWidth,
              values: (showRSIMA && maStyle?.visible !== false) ? mapToWhitespace(result.rsiMa) : [],
            },
            {
              id: "upperBand",
              label: `Upper (${upperBandValue})`,
              pane: "separate",
              color: upperStyle?.color ?? upperBandColor,
              style: "line",
              lineWidth: 1,
              lineStyle: 2, // Dashed line
              values: (showUpperBand && upperStyle?.visible !== false) ? result.upperBand : [],
            },
            {
              id: "middleBand",
              label: `Middle (${middleBandValue})`,
              pane: "separate",
              color: middleStyle?.color ?? middleBandColor,
              style: "line",
              lineWidth: 1,
              lineStyle: 2, // Dashed line
              values: (showMiddleBand && middleStyle?.visible !== false) ? result.middleBand : [],
            },
            {
              id: "lowerBand",
              label: `Lower (${lowerBandValue})`,
              pane: "separate",
              color: lowerStyle?.color ?? lowerBandColor,
              style: "line",
              lineWidth: 1,
              lineStyle: 2, // Dashed line
              values: (showLowerBand && lowerStyle?.visible !== false) ? result.lowerBand : [],
            },
          ],
          // RSI fill configuration for canvas overlay
          _rsiFill: {
            showBackgroundFill,
            backgroundFillColor,
            backgroundFillOpacity,
            showOverboughtFill,
            overboughtFillColor,
            showOversoldFill,
            oversoldFillColor,
            upperBandValue,
            middleBandValue,
            lowerBandValue,
            // Pass RSI values for fill calculations
            rsiValues: result.rsi,
          },
        };
      }
      
      case "macd": {
        const source = (indicator.params.source as string) || "close";
        const fast = Number(indicator.params.fast) || 12;
        const slow = Number(indicator.params.slow) || 26;
        const signal = Number(indicator.params.signal) || 9;
        const oscMAType = (indicator.params.oscMAType as "ema" | "sma") || "ema";
        const signalMAType = (indicator.params.signalMAType as "ema" | "sma") || "ema";
        
        // Custom histogram colors from params (TV-style 4-color)
        const histColors = {
          bullStrong: (indicator.params.histColor0 as string) || "#26A69A",
          bullWeak: (indicator.params.histColor1 as string) || "#B2DFDB",
          bearWeak: (indicator.params.histColor2 as string) || "#FFCDD2",
          bearStrong: (indicator.params.histColor3 as string) || "#EF5350",
        };
        
        const showZeroLine = indicator.params.showZeroLine !== false;
        
        const result = computeMACD(data, fast, slow, signal, source as any, oscMAType, signalMAType, histColors);
        
        // Get style overrides for lines
        const macdStyle = indicator.styleByLineId?.["macd"];
        const signalStyle = indicator.styleByLineId?.["signal"];
        const histStyle = indicator.styleByLineId?.["histogram"];
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "histogram",
              label: "Histogram",
              pane: "separate",
              color: histColors.bullStrong, // default color for legend
              style: "histogram",
              lineWidth: 1,
              values: (histStyle?.visible === false) ? [] : result.histogram,
            },
            {
              id: "macd",
              label: `MACD`,
              pane: "separate",
              color: macdStyle?.color ?? "#2962FF",  // TV blue
              style: "line",
              lineWidth: macdStyle?.lineWidth ?? 2,
              values: (macdStyle?.visible === false) ? [] : result.macd,
            },
            {
              id: "signal",
              label: `Signal`,
              pane: "separate",
              color: signalStyle?.color ?? "#FF6D00",  // TV orange
              style: "line",
              lineWidth: signalStyle?.lineWidth ?? 2,
              values: (signalStyle?.visible === false) ? [] : result.signal,
            },
          ],
          _zeroLine: {
            visible: showZeroLine,
            color: "#787B86",
            lineStyle: "dashed",
            lineWidth: 1,
          },
        };
      }
      
      case "ao": {
        // TradingView-style Awesome Oscillator
        // AO = SMA(HL2, 5) - SMA(HL2, 34)
        // Color based on rising/falling (not above/below zero)
        
        const showAO = indicator.params.showAO !== false;
        const showZeroLine = indicator.params.showZeroLine !== false;
        
        // Custom colors from params (TV-style 2-color: rising/falling)
        const aoColors = {
          growing: (indicator.params.growingColor as string) || "#089981",  // TV green
          falling: (indicator.params.fallingColor as string) || "#F23645",  // TV red
        };
        
        const result = computeAO(data, 5, 34, aoColors);
        
        // Get style overrides for histogram
        const aoStyle = indicator.styleByLineId?.["ao"];
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "ao",
              label: "AO",
              pane: "separate",
              color: aoColors.growing,  // default color for legend
              style: "histogram",
              lineWidth: 1,
              values: (aoStyle?.visible === false || !showAO) ? [] : result.histogram,
            },
          ],
          _zeroLine: {
            visible: showZeroLine,
            color: "#787B86",
            lineStyle: "dashed",
            lineWidth: 1,
          },
        };
      }
      
      case "bb": {
        // TradingView-style Bollinger Bands
        const length = Number(indicator.params.length) || Number(indicator.params.period) || 20;
        const stdDev = Number(indicator.params.stdDev) || 2;
        const source = (indicator.params.source as string) || "close";
        const basisMaType = (indicator.params.basisMaType as BBMaType) || "sma";
        const offset = Number(indicator.params.offset) || 0;
        
        // Style settings
        const showBasis = indicator.params.showBasis !== false;
        const showUpper = indicator.params.showUpper !== false;
        const showLower = indicator.params.showLower !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors (TV defaults)
        const basisColor = (indicator.params.basisColor as string) || "#2962FF"; // TV blue
        const upperColor = (indicator.params.upperColor as string) || "#F23645"; // TV red
        const lowerColor = (indicator.params.lowerColor as string) || "#089981"; // TV green
        const backgroundColor = (indicator.params.backgroundColor as string) || "rgba(33, 150, 243, 0.1)";
        
        // Line widths
        const basisLineWidth = Number(indicator.params.basisLineWidth) || 1;
        const upperLineWidth = Number(indicator.params.upperLineWidth) || 1;
        const lowerLineWidth = Number(indicator.params.lowerLineWidth) || 1;
        
        // Compute BB
        const result = computeBollingerBands(data, length, stdDev, source as any, basisMaType);
        
        // Apply offset if non-zero
        let upperValues: Array<{ time: UTCTimestamp; value?: number }>;
        let middleValues: Array<{ time: UTCTimestamp; value?: number }>;
        let lowerValues: Array<{ time: UTCTimestamp; value?: number }>;
        
        if (offset !== 0) {
          upperValues = shiftSeriesByBars(result.upper, data, offset);
          middleValues = shiftSeriesByBars(result.middle, data, offset);
          lowerValues = shiftSeriesByBars(result.lower, data, offset);
        } else {
          // Map NaN to WhitespaceData
          upperValues = result.upper.map(p => 
            Number.isFinite(p.value) ? p : { time: p.time }
          );
          middleValues = result.middle.map(p => 
            Number.isFinite(p.value) ? p : { time: p.time }
          );
          lowerValues = result.lower.map(p => 
            Number.isFinite(p.value) ? p : { time: p.time }
          );
        }
        
        // Get style overrides
        const basisStyle = indicator.styleByLineId?.["middle"];
        const upperStyle = indicator.styleByLineId?.["upper"];
        const lowerStyle = indicator.styleByLineId?.["lower"];
        
        // Build label: "BB 20 SMA close 2" (TV-style)
        const maTypeLabel = basisMaType.toUpperCase();
        const labelText = `BB ${length} ${maTypeLabel} ${source} ${stdDev}`;
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "upper",
              label: "Upper",
              pane: "price",
              color: upperStyle?.color ?? upperColor,
              style: "line",
              lineWidth: upperStyle?.lineWidth ?? upperLineWidth,
              values: (showUpper && upperStyle?.visible !== false) ? upperValues : [],
            },
            {
              id: "middle",
              label: labelText,
              pane: "price",
              color: basisStyle?.color ?? basisColor,
              style: "line",
              lineWidth: basisStyle?.lineWidth ?? basisLineWidth,
              values: (showBasis && basisStyle?.visible !== false) ? middleValues : [],
            },
            {
              id: "lower",
              label: "Lower",
              pane: "price",
              color: lowerStyle?.color ?? lowerColor,
              style: "line",
              lineWidth: lowerStyle?.lineWidth ?? lowerLineWidth,
              values: (showLower && lowerStyle?.visible !== false) ? lowerValues : [],
            },
          ],
          // Pass BB data for fill overlay
          _bbData: showBackground ? {
            upper: upperValues,
            lower: lowerValues,
            backgroundColor,
          } : undefined,
        };
      }
      
      case "atr": {
        // TradingView-style ATR with smoothing selection
        const length = Number(indicator.params.length) || Number(indicator.params.period) || 14;
        const smoothing = (indicator.params.smoothing as string) || "rma";
        
        // Style settings
        const showATR = indicator.params.showATR !== false;
        const atrColor = (indicator.params.atrColor as string) || "#FF5252"; // TV red
        const atrLineWidth = Number(indicator.params.atrLineWidth) || 1;
        const labelsOnPriceScale = indicator.params.labelsOnPriceScale !== false;
        const inputsInStatusLine = indicator.params.inputsInStatusLine !== false;
        
        const values = computeATR(data, length, smoothing as any);
        
        // Convert NaN to WhitespaceData for autoscale protection
        const mappedValues = values.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        
        // Get style overrides
        const atrStyle = indicator.styleByLineId?.["atr"];
        
        // Build label: "ATR 14 RMA" (TV-style with inputs)
        const smoothingLabel = smoothing.toUpperCase();
        const labelText = inputsInStatusLine ? `ATR ${length} ${smoothingLabel}` : "ATR";
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "atr",
            label: labelText,
            pane: "separate",
            color: atrStyle?.color ?? atrColor,
            style: "line",
            lineWidth: atrStyle?.lineWidth ?? atrLineWidth,
            values: (showATR && atrStyle?.visible !== false) ? mappedValues : [],
            // Store lastValueVisible for price scale label
            _lastValueVisible: labelsOnPriceScale,
          }],
        };
      }
      
      case "dc": {
        // TradingView-style Donchian Channels
        const length = Number(indicator.params.length) || 20;
        const offset = Number(indicator.params.offset) || 0;
        
        // Style settings
        const showBasis = indicator.params.showBasis !== false;
        const showUpper = indicator.params.showUpper !== false;
        const showLower = indicator.params.showLower !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors (TV defaults)
        const basisColor = (indicator.params.basisColor as string) || "#FF6D00"; // TV orange
        const upperColor = (indicator.params.upperColor as string) || "#2962FF"; // TV blue
        const lowerColor = (indicator.params.lowerColor as string) || "#2962FF"; // TV blue
        const backgroundColor = (indicator.params.backgroundColor as string) || "rgba(41, 98, 255, 0.1)";
        
        // Line widths
        const basisLineWidth = Number(indicator.params.basisLineWidth) || 1;
        const upperLineWidth = Number(indicator.params.upperLineWidth) || 1;
        const lowerLineWidth = Number(indicator.params.lowerLineWidth) || 1;
        
        // Visibility toggles
        const labelsOnPriceScale = indicator.params.labelsOnPriceScale !== false;
        const inputsInStatusLine = indicator.params.inputsInStatusLine !== false;
        
        // Compute Donchian Channels
        const result = computeDonchianChannels(data, length);
        
        // Apply offset if non-zero
        let upperValues: Array<{ time: UTCTimestamp; value?: number }>;
        let basisValues: Array<{ time: UTCTimestamp; value?: number }>;
        let lowerValues: Array<{ time: UTCTimestamp; value?: number }>;
        
        if (offset !== 0) {
          upperValues = shiftSeriesByBars(result.upper, data, offset);
          basisValues = shiftSeriesByBars(result.basis, data, offset);
          lowerValues = shiftSeriesByBars(result.lower, data, offset);
        } else {
          // Map NaN to WhitespaceData
          upperValues = result.upper.map(p => 
            Number.isFinite(p.value) ? p : { time: p.time }
          );
          basisValues = result.basis.map(p => 
            Number.isFinite(p.value) ? p : { time: p.time }
          );
          lowerValues = result.lower.map(p => 
            Number.isFinite(p.value) ? p : { time: p.time }
          );
        }
        
        // Get style overrides
        const basisStyle = indicator.styleByLineId?.["basis"];
        const upperStyle = indicator.styleByLineId?.["upper"];
        const lowerStyle = indicator.styleByLineId?.["lower"];
        
        // Build label: "DC 20 0" (TV-style with inputs)
        const labelText = inputsInStatusLine ? `DC ${length} ${offset}` : "DC";
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "upper",
              label: "Upper",
              pane: "price",
              color: upperStyle?.color ?? upperColor,
              style: "line",
              lineWidth: upperStyle?.lineWidth ?? upperLineWidth,
              values: (showUpper && upperStyle?.visible !== false) ? upperValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "basis",
              label: labelText,
              pane: "price",
              color: basisStyle?.color ?? basisColor,
              style: "line",
              lineWidth: basisStyle?.lineWidth ?? basisLineWidth,
              values: (showBasis && basisStyle?.visible !== false) ? basisValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "lower",
              label: "Lower",
              pane: "price",
              color: lowerStyle?.color ?? lowerColor,
              style: "line",
              lineWidth: lowerStyle?.lineWidth ?? lowerLineWidth,
              values: (showLower && lowerStyle?.visible !== false) ? lowerValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
          ],
          // Pass DC data for fill overlay
          _dcFill: showBackground ? {
            upper: upperValues,
            lower: lowerValues,
            backgroundColor,
          } : undefined,
        };
      }

      case "kc": {
        // TradingView-style Keltner Channels
        const length = Number(indicator.params.length) || 20;
        const multiplier = Number(indicator.params.multiplier) || 2;
        const source = (indicator.params.source as "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4") || "close";
        const useExp = indicator.params.useExp !== false;
        const bandsStyle = (indicator.params.bandsStyle as "atr" | "tr" | "range") || "atr";
        const atrLength = Number(indicator.params.atrLength) || 10;
        
        // Style settings
        const showUpper = indicator.params.showUpper !== false;
        const showBasis = indicator.params.showBasis !== false;
        const showLower = indicator.params.showLower !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors (TV defaults - all blue)
        const upperColor = (indicator.params.upperColor as string) || "#2962FF";
        const basisColor = (indicator.params.basisColor as string) || "#2962FF";
        const lowerColor = (indicator.params.lowerColor as string) || "#2962FF";
        const backgroundColor = (indicator.params.backgroundColor as string) || "rgba(33, 150, 243, 0.05)";
        
        // Line widths
        const upperLineWidth = Number(indicator.params.upperLineWidth) || 1;
        const basisLineWidth = Number(indicator.params.basisLineWidth) || 1;
        const lowerLineWidth = Number(indicator.params.lowerLineWidth) || 1;
        
        // Line styles
        const upperLineStyle = (indicator.params.upperLineStyle as string) || "solid";
        const basisLineStyle = (indicator.params.basisLineStyle as string) || "solid";
        const lowerLineStyle = (indicator.params.lowerLineStyle as string) || "solid";
        
        // Visibility toggles
        const labelsOnPriceScale = indicator.params.labelsOnPriceScale !== false;
        const inputsInStatusLine = indicator.params.inputsInStatusLine !== false;
        
        // Compute Keltner Channels
        const result = computeKeltnerChannels(data, length, multiplier, source, useExp, bandsStyle, atrLength);
        
        // Map NaN to WhitespaceData
        const upperValues = result.upper.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const basisValues = result.basis.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const lowerValues = result.lower.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        
        // Build label: "KC 20 2 close" (TV-style)
        const labelText = inputsInStatusLine ? `KC ${length} ${multiplier} ${source}` : "KC";
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "upper",
              label: "Upper",
              pane: "price",
              color: upperColor,
              style: upperLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: upperLineWidth,
              values: showUpper ? upperValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "basis",
              label: labelText,
              pane: "price",
              color: basisColor,
              style: basisLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: basisLineWidth,
              values: showBasis ? basisValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "lower",
              label: "Lower",
              pane: "price",
              color: lowerColor,
              style: lowerLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: lowerLineWidth,
              values: showLower ? lowerValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
          ],
          // Pass KC data for fill overlay
          _kcFill: showBackground ? {
            upper: upperValues,
            lower: lowerValues,
            backgroundColor,
          } : undefined,
        };
      }
      
      case "vstop": {
        // TradingView-style Volatility Stop
        const length = Number(indicator.params.length) || 20;
        const multiplier = Number(indicator.params.multiplier) || 2;
        const source = (indicator.params.source as "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4") || "close";
        
        // Style settings
        const plotStyle = (indicator.params.plotStyle as "cross" | "circles" | "line") || "cross";
        const uptrendColor = (indicator.params.uptrendColor as string) || "#089981";
        const downtrendColor = (indicator.params.downtrendColor as string) || "#F23645";
        const lineWidth = Number(indicator.params.lineWidth) || 1;
        const priceLineVisible = indicator.params.priceLineVisible === true;
        const labelsOnPriceScale = indicator.params.labelsOnPriceScale !== false;
        const inputsInStatusLine = indicator.params.inputsInStatusLine !== false;
        
        // Compute Volatility Stop
        const result = computeVolatilityStop(data, length, multiplier, source);
        
        // TV label format: "VStop 20 close 2"
        const labelText = inputsInStatusLine ? `VStop ${length} ${source} ${multiplier}` : "VStop";
        
        // Build line values - filter NaN for warmup
        const lineValues: Array<{ time: UTCTimestamp; value?: number; color?: string }> = [];
        for (const pt of result.points) {
          if (!Number.isFinite(pt.value)) {
            lineValues.push({ time: pt.time });
          } else {
            // Per-bar color based on trend direction
            const color = pt.isUpTrend ? uptrendColor : downtrendColor;
            lineValues.push({ time: pt.time, value: pt.value, color });
          }
        }
        
        // Build response
        const response: IndicatorWorkerResponse = {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "vstop",
            label: labelText,
            pane: "price",
            color: uptrendColor, // Default color (actual per-bar coloring via _vstopData)
            style: plotStyle === "line" ? "line" : "line", // For legend purposes
            lineWidth,
            values: lineValues,
            _lastValueVisible: labelsOnPriceScale,
            _priceLineVisible: priceLineVisible,
          }],
        };
        
        // Add VStop data for canvas overlay (cross/circles rendering with per-bar colors)
        if (plotStyle === "cross" || plotStyle === "circles") {
          response._vstopData = {
            plotStyle,
            uptrendColor,
            downtrendColor,
            lineWidth,
            priceLineVisible,
            points: result.points
              .filter(p => Number.isFinite(p.value))
              .map(p => ({
                time: p.time as number,
                value: p.value,
                isUpTrend: p.isUpTrend,
              })),
          };
        }
        
        return response;
      }
      
      case "chop": {
        // === TradingView-style Choppiness Index ===
        // Input params
        const length = Number(indicator.params.length) || 14;
        const offset = Number(indicator.params.offset) || 0;
        
        // Band values
        const upperBandValue = Number(indicator.params.upperBandValue) ?? 61.8;
        const middleBandValue = Number(indicator.params.middleBandValue) ?? 50;
        const lowerBandValue = Number(indicator.params.lowerBandValue) ?? 38.2;
        
        // Style toggles
        const showChop = indicator.params.showChop !== false;
        const showUpperBand = indicator.params.showUpperBand !== false;
        const showMiddleBand = indicator.params.showMiddleBand !== false;
        const showLowerBand = indicator.params.showLowerBand !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors
        const chopColor = (indicator.params.chopColor as string) || indicator.color || TV_COLORS.blue;
        const upperBandColor = (indicator.params.upperBandColor as string) || TV_COLORS.gray;
        const middleBandColor = (indicator.params.middleBandColor as string) || TV_COLORS.gray;
        const lowerBandColor = (indicator.params.lowerBandColor as string) || TV_COLORS.gray;
        const backgroundFillColor = (indicator.params.backgroundFillColor as string) || TV_COLORS.blue;
        const backgroundFillOpacity = Number(indicator.params.backgroundFillOpacity) ?? 0.1;
        
        // Line widths and styles
        const chopLineWidth = Number(indicator.params.chopLineWidth) || 1;
        const chopLineStyleStr = (indicator.params.chopLineStyle as string) || "solid";
        const upperBandLineStyleStr = (indicator.params.upperBandLineStyle as string) || "dashed";
        const middleBandLineStyleStr = (indicator.params.middleBandLineStyle as string) || "dotted";
        const lowerBandLineStyleStr = (indicator.params.lowerBandLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const chopLineStyle = styleToNum(chopLineStyleStr);
        const upperBandLineStyle = styleToNum(upperBandLineStyleStr);
        const middleBandLineStyle = styleToNum(middleBandLineStyleStr);
        const lowerBandLineStyle = styleToNum(lowerBandLineStyleStr);
        
        // Compute CHOP
        const result = computeChoppinessIndex(data, length, offset, upperBandValue, middleBandValue, lowerBandValue);
        
        // Build TV-style label: "CHOP {length} {offset}"
        const labelText = offset === 0 ? `CHOP ${length}` : `CHOP ${length} ${offset}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // CHOP line
        if (showChop) {
          lines.push({
            id: "chop",
            label: labelText,
            pane: "separate",
            color: chopColor,
            style: "line",
            lineWidth: chopLineWidth,
            lineStyle: chopLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.chop),
          });
        }
        
        // Upper Band (61.8)
        if (showUpperBand && result.upperBand.length > 0) {
          lines.push({
            id: "chopUpperBand",
            label: `Upper (${upperBandValue})`,
            pane: "separate",
            color: upperBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: upperBandLineStyle,
            lastValueVisible: false,
            values: result.upperBand,
          });
        }
        
        // Middle Band (50)
        if (showMiddleBand && result.middleBand.length > 0) {
          lines.push({
            id: "chopMiddleBand",
            label: `Middle (${middleBandValue})`,
            pane: "separate",
            color: middleBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: middleBandLineStyle,
            lastValueVisible: false,
            values: result.middleBand,
          });
        }
        
        // Lower Band (38.2)
        if (showLowerBand && result.lowerBand.length > 0) {
          lines.push({
            id: "chopLowerBand",
            label: `Lower (${lowerBandValue})`,
            pane: "separate",
            color: lowerBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: lowerBandLineStyle,
            lastValueVisible: false,
            values: result.lowerBand,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Serializable fill config for canvas overlay
          _chopFill: {
            showBackground,
            backgroundFillColor,
            backgroundFillOpacity,
            upperBandValue,
            middleBandValue,
            lowerBandValue,
          },
        };
      }
      
      case "hv": {
        // === TradingView-style Historical Volatility ===
        // Input params
        const length = Number(indicator.params.length) || 10;
        
        // Style toggles
        const showHV = indicator.params.showHV !== false;
        
        // Colors
        const hvColor = (indicator.params.hvColor as string) || indicator.color || TV_COLORS.blue;
        
        // Line widths and styles
        const hvLineWidth = Number(indicator.params.hvLineWidth) || 1;
        const hvLineStyleStr = (indicator.params.hvLineStyle as string) || "solid";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const hvLineStyle = styleToNum(hvLineStyleStr);
        
        // TradingView HV annualization factor investigation:
        // Observed: TV shows ~69.12, we showed ~60.54 with 252 (ratio 1.1417)
        // Testing with 329 days: sqrt(329/252) = 1.143 → 60.54 * 1.143 = 69.18 ≈ 69.12
        // TradingView may use 329 (~365 * 0.9) or similar for daily charts
        // 
        // Alternative hypothesis: TV uses sqrt(365) for calendar days
        // sqrt(365/252) = 1.203 → would give 72.83 (too high)
        //
        // After parity testing with META 1D, using 329 gives best match
        const periodsPerYear = 329;
        
        // Compute Historical Volatility
        const result = computeHistoricalVolatility(data, length, periodsPerYear);
        
        // Build TV-style label: "HV {length}"
        const labelText = `HV ${length}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // HV line (blue)
        if (showHV) {
          lines.push({
            id: "hv",
            label: labelText,
            pane: "separate",
            color: hvColor,
            style: "line",
            lineWidth: hvLineWidth,
            lineStyle: hvLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.hv),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "bbw": {
        // === TradingView-style Bollinger BandWidth ===
        // Input params
        const length = Number(indicator.params.length) || 20;
        const source = (indicator.params.source as SourceType) || "close";
        const stdDev = Number(indicator.params.stdDev) || 2.0;
        const highestExpansionLength = Number(indicator.params.highestExpansionLength) || 125;
        const lowestContractionLength = Number(indicator.params.lowestContractionLength) || 125;

        // Style toggles
        const showBbw = indicator.params.showBbw !== false;
        const showHighestExpansion = indicator.params.showHighestExpansion !== false;
        const showLowestContraction = indicator.params.showLowestContraction !== false;

        // Colors
        const bbwColor = (indicator.params.bbwColor as string) || indicator.color || TV_COLORS.blue;
        const highestExpansionColor = (indicator.params.highestExpansionColor as string) || TV_COLORS.red;
        const lowestContractionColor = (indicator.params.lowestContractionColor as string) || "#26A69A";

        // Line widths and styles
        const bbwLineWidth = Number(indicator.params.bbwLineWidth) || 1;
        const highestExpansionLineWidth = Number(indicator.params.highestExpansionLineWidth) || 1;
        const lowestContractionLineWidth = Number(indicator.params.lowestContractionLineWidth) || 1;

        const bbwLineStyleStr = (indicator.params.bbwLineStyle as string) || "solid";
        const highestExpansionLineStyleStr = (indicator.params.highestExpansionLineStyle as string) || "solid";
        const lowestContractionLineStyleStr = (indicator.params.lowestContractionLineStyle as string) || "solid";

        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const bbwLineStyle = styleToNum(bbwLineStyleStr);
        const highestExpansionLineStyle = styleToNum(highestExpansionLineStyleStr);
        const lowestContractionLineStyle = styleToNum(lowestContractionLineStyleStr);

        // Compute BBW
        const result = computeBBW(data, length, source, stdDev, highestExpansionLength, lowestContractionLength);

        // Build TV-style label: "BBW {length}, {stdDev}"
        const labelText = `BBW ${length}, ${stdDev}`;

        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });

        // Build lines array
        const lines: IndicatorLineResult[] = [];

        // BBW line (blue)
        if (showBbw) {
          lines.push({
            id: "bbw",
            label: labelText,
            pane: "separate",
            color: bbwColor,
            style: "line",
            lineWidth: bbwLineWidth,
            lineStyle: bbwLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.bbw),
          });
        }

        // Highest Expansion line (red)
        if (showHighestExpansion) {
          lines.push({
            id: "highestExpansion",
            label: `Highest Expansion ${highestExpansionLength}`,
            pane: "separate",
            color: highestExpansionColor,
            style: "line",
            lineWidth: highestExpansionLineWidth,
            lineStyle: highestExpansionLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.highestExpansion),
          });
        }

        // Lowest Contraction line (teal)
        if (showLowestContraction) {
          lines.push({
            id: "lowestContraction",
            label: `Lowest Contraction ${lowestContractionLength}`,
            pane: "separate",
            color: lowestContractionColor,
            style: "line",
            lineWidth: lowestContractionLineWidth,
            lineStyle: lowestContractionLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.lowestContraction),
          });
        }

        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "bbtrend": {
        // === TradingView-style BBTrend (Bollinger Bands Trend) ===
        // Input params
        const shortLength = Number(indicator.params.shortLength) || 20;
        const longLength = Number(indicator.params.longLength) || 50;
        const stdDev = Number(indicator.params.stdDev) || 2.0;

        // Style toggles
        const showBbtrend = indicator.params.showBbtrend !== false;
        const showZeroLine = indicator.params.showZeroLine !== false;

        // 4-color histogram colors (TradingView style)
        // Color0 = positive, growing (dark green)
        // Color1 = positive, falling (light green)
        // Color2 = negative, falling (dark red)
        // Color3 = negative, rising (light red)
        const color0 = (indicator.params.color0 as string) || "#26A69A"; // Dark green
        const color1 = (indicator.params.color1 as string) || "#B2DFDB"; // Light green
        const color2 = (indicator.params.color2 as string) || "#FF5252"; // Dark red
        const color3 = (indicator.params.color3 as string) || "#FFCDD2"; // Light red

        // Zero line styling
        const zeroLineColor = (indicator.params.zeroLineColor as string) || "#787B86";
        const zeroLineStyleStr = (indicator.params.zeroLineStyle as string) || "dashed";
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const zeroLineStyle = styleToNum(zeroLineStyleStr);

        // Line width
        const bbtrendLineWidth = Number(indicator.params.bbtrendLineWidth) || 1;

        // Compute BBTrend
        const result = computeBBTrend(data, shortLength, longLength, stdDev);

        // Build TV-style label: "BBTrend {shortLength} {longLength} {stdDev}"
        const labelText = `BBTrend ${shortLength} ${longLength} ${stdDev}`;

        // Build lines array
        const lines: IndicatorLineResult[] = [];

        // BBTrend histogram with per-bar coloring
        if (showBbtrend) {
          // Create histogram data with per-bar colors
          const histogramData = result.bbtrend.map((point, i) => {
            const current = point.value;
            const prev = i > 0 ? result.bbtrend[i - 1].value : 0;

            // Determine color based on TV logic:
            // - Positive and growing = color0 (dark green)
            // - Positive and falling = color1 (light green)
            // - Negative and falling = color2 (dark red)
            // - Negative and rising = color3 (light red)
            let barColor: string;
            if (current >= 0) {
              barColor = current > prev ? color0 : color1;
            } else {
              barColor = current < prev ? color2 : color3;
            }

            if (!Number.isFinite(current)) {
              return { time: point.time };
            }

            return {
              time: point.time,
              value: current,
              color: barColor,
            };
          });

          lines.push({
            id: "bbtrend",
            label: labelText,
            pane: "separate",
            color: color0, // Default color for legend
            style: "histogram",
            lineWidth: bbtrendLineWidth,
            lastValueVisible: true,
            values: histogramData,
          });
        }

        // Zero line (horizontal constant line at 0)
        if (showZeroLine) {
          const zeroLineData = result.bbtrend.map(point => ({
            time: point.time,
            value: 0,
          }));

          lines.push({
            id: "zeroline",
            label: "Zero Line",
            pane: "separate",
            color: zeroLineColor,
            style: "line",
            lineWidth: 1,
            lineStyle: zeroLineStyle,
            lastValueVisible: false,
            values: zeroLineData,
          });
        }

        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "ulcer": {
        // === TradingView-style Ulcer Index ===
        // Measures downside volatility as RMS of percentage drawdowns
        
        // Input params
        const source = (indicator.params.source as SourceType) || "close";
        const length = Number(indicator.params.length) || 14;
        
        // Style toggles
        const showUlcer = indicator.params.showUlcer !== false;
        const showZero = indicator.params.showZero !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors
        const ulcerColor = (indicator.params.ulcerColor as string) || indicator.color || TV_COLORS.blue;
        const zeroColor = (indicator.params.zeroColor as string) || TV_COLORS.gray;
        const backgroundFillColor = (indicator.params.backgroundFillColor as string) || TV_COLORS.blue;
        const backgroundFillOpacity = Number(indicator.params.backgroundFillOpacity) ?? 0.1;
        
        // Line widths and styles
        const ulcerLineWidth = Number(indicator.params.ulcerLineWidth) || 1;
        const ulcerLineStyleStr = (indicator.params.ulcerLineStyle as string) || "solid";
        const zeroLineStyleStr = (indicator.params.zeroLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const ulcerLineStyle = styleToNum(ulcerLineStyleStr);
        const zeroLineStyle = styleToNum(zeroLineStyleStr);
        
        // Compute Ulcer Index
        const result = computeUlcerIndex(data, length, source);
        
        // Build TV-style label: "Ulcer Index {source} {length}"
        const labelText = `Ulcer Index ${source} ${length}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // Ulcer Index line (blue)
        if (showUlcer) {
          lines.push({
            id: "ulcer",
            label: labelText,
            pane: "separate",
            color: ulcerColor,
            style: "line",
            lineWidth: ulcerLineWidth,
            lineStyle: ulcerLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.ulcer),
          });
        }
        
        // Zero line (gray dashed)
        if (showZero) {
          lines.push({
            id: "zero",
            label: "Zero",
            pane: "separate",
            color: zeroColor,
            style: "line",
            lineWidth: 1,
            lineStyle: zeroLineStyle,
            lastValueVisible: false,
            values: result.zero,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Serializable fill config for canvas overlay
          _ulcerFill: {
            showBackground,
            backgroundFillColor,
            backgroundFillOpacity,
            ulcerValues: result.ulcer,
          },
        };
      }
      
      case "adx": {
        const period = Number(indicator.params.period) || 14;
        const smoothing = Number(indicator.params.smoothing) || 14;
        const result = computeADX(data, period, smoothing);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "adx",
              label: `ADX(${period})`,
              pane: "separate",
              color: indicator.color || TV_COLORS.blue,
              style: "line",
              lineWidth: 2,
              values: result.adx,
            },
            {
              id: "plusDI",
              label: "+DI",
              pane: "separate",
              color: TV_COLORS.green,
              style: "line",
              lineWidth: 1,
              values: result.plusDI,
            },
            {
              id: "minusDI",
              label: "-DI",
              pane: "separate",
              color: TV_COLORS.red,
              style: "line",
              lineWidth: 1,
              values: result.minusDI,
            },
          ],
        };
      }
      
      case "dmi": {
        const adxSmoothing = Number(indicator.params.adxSmoothing) || 14;
        const diLength = Number(indicator.params.diLength) || 14;
        const result = computeDMI(data, adxSmoothing, diLength);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "adx",
              label: "ADX",
              pane: "separate",
              color: TV_COLORS.red,
              style: "line",
              lineWidth: 1,
              values: result.adx,
            },
            {
              id: "plusDI",
              label: "+DI",
              pane: "separate",
              color: TV_COLORS.blue,
              style: "line",
              lineWidth: 1,
              values: result.plusDI,
            },
            {
              id: "minusDI",
              label: "-DI",
              pane: "separate",
              color: TV_COLORS.orange,
              style: "line",
              lineWidth: 1,
              values: result.minusDI,
            },
          ],
        };
      }
      
      case "vortex": {
        const length = Number(indicator.params.length) || 14;
        const result = computeVortex(data, length);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "viPlus",
              label: "VI+",
              pane: "separate",
              color: TV_COLORS.blue,
              style: "line",
              lineWidth: 1,
              values: result.viPlus,
            },
            {
              id: "viMinus",
              label: "VI-",
              pane: "separate",
              color: TV_COLORS.red,
              style: "line",
              lineWidth: 1,
              values: result.viMinus,
            },
          ],
        };
      }
      
      case "aroon": {
        const length = Number(indicator.params.length) || 14;
        const result = computeAroon(data, length);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "aroonUp",
              label: "Aroon Up",
              pane: "separate",
              color: TV_COLORS.blue,
              style: "line",
              lineWidth: 1,
              values: result.aroonUp,
            },
            {
              id: "aroonDown",
              label: "Aroon Down",
              pane: "separate",
              color: TV_COLORS.orange,
              style: "line",
              lineWidth: 1,
              values: result.aroonDown,
            },
          ],
        };
      }
      
      case "aroonosc": {
        const length = Number(indicator.params.length) || 14;
        const result = computeAroonOsc(data, length);
        
        // Line coloring config (TV-style: sign-based)
        const lineAboveColor = String(indicator.params.lineAboveColor || TV_COLORS.green);
        const lineBelowColor = String(indicator.params.lineBelowColor || TV_COLORS.red);
        const lineWidth = Number(indicator.params.lineWidth) || 1;
        
        // Level config
        const showUpperLevel = indicator.params.showUpperLevel !== false;
        const showMiddleLevel = indicator.params.showMiddleLevel !== false;
        const showLowerLevel = indicator.params.showLowerLevel !== false;
        const upperLevel = Number(indicator.params.upperLevel) || 90;
        const lowerLevel = Number(indicator.params.lowerLevel) || -90;
        const upperLevelColor = String(indicator.params.upperLevelColor || TV_COLORS.gray);
        const middleLevelColor = String(indicator.params.middleLevelColor || TV_COLORS.gray);
        const lowerLevelColor = String(indicator.params.lowerLevelColor || TV_COLORS.gray);
        
        // Fill config
        const showFill = indicator.params.showFill !== false;
        const fillAboveColor = String(indicator.params.fillAboveColor || "rgba(38, 166, 154, 0.2)");
        const fillBelowColor = String(indicator.params.fillBelowColor || "rgba(239, 83, 80, 0.2)");
        
        // Build level lines (marked as decorative to exclude from legend)
        const levelLines: Line[] = [];
        if (showUpperLevel) {
          levelLines.push({
            id: "upperLevel",
            label: `${upperLevel}`,
            pane: "separate",
            color: upperLevelColor,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // Dashed
            isLevelLine: true, // Exclude from legend
            values: result.oscillator.map(p => ({ time: p.time, value: upperLevel })),
          });
        }
        if (showMiddleLevel) {
          levelLines.push({
            id: "middleLevel",
            label: "0",
            pane: "separate",
            color: middleLevelColor,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // Dashed
            isLevelLine: true, // Exclude from legend
            values: result.oscillator.map(p => ({ time: p.time, value: 0 })),
          });
        }
        if (showLowerLevel) {
          levelLines.push({
            id: "lowerLevel",
            label: `${lowerLevel}`,
            pane: "separate",
            color: lowerLevelColor,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // Dashed
            isLevelLine: true, // Exclude from legend
            values: result.oscillator.map(p => ({ time: p.time, value: lowerLevel })),
          });
        }
        
        // Determine last value color for price scale label
        const lastOscValue = result.oscillator.length > 0 
          ? result.oscillator[result.oscillator.length - 1].value 
          : 0;
        const lastValueColor = lastOscValue >= 0 ? lineAboveColor : lineBelowColor;
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "oscillator",
              label: `Aroon Osc(${length})`,
              pane: "separate",
              // Use last value's sign-based color for LWC series (affects y-axis label)
              color: lastValueColor,
              style: "line",
              lineWidth: lineWidth,
              // The actual line is drawn by AroonOscFillOverlay with sign-based coloring
              // LWC series provides coordinate conversion + y-axis label
              values: result.oscillator,
            },
            ...levelLines,
          ],
          // Full fill config for AroonOscFillOverlay canvas overlay
          _aroonOscFill: {
            oscillatorValues: result.oscillator,
            lineAboveColor,
            lineBelowColor,
            lineWidth,
            showFill,
            fillAboveColor,
            fillBelowColor,
          },
        };
      }
      
      case "vwap": {
        // === TradingView-style VWAP ===
        
        // === Param normalization (handle index→string from UI) ===
        const ANCHOR_PERIODS = ["session", "week", "month", "quarter", "year"] as const;
        const SOURCES = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4", "hlcc4"] as const;
        const BANDS_MODES = ["stdev", "percentage"] as const;
        
        const normalizeAnchorPeriod = (val: unknown): typeof ANCHOR_PERIODS[number] => {
          if (typeof val === "number" && val >= 0 && val < ANCHOR_PERIODS.length) {
            return ANCHOR_PERIODS[val];
          }
          if (typeof val === "string" && ANCHOR_PERIODS.includes(val as any)) {
            return val as typeof ANCHOR_PERIODS[number];
          }
          return "session";
        };
        
        const normalizeSource = (val: unknown): typeof SOURCES[number] => {
          if (typeof val === "number" && val >= 0 && val < SOURCES.length) {
            return SOURCES[val];
          }
          if (typeof val === "string" && SOURCES.includes(val as any)) {
            return val as typeof SOURCES[number];
          }
          return "hlc3";
        };
        
        const normalizeBandsMode = (val: unknown): typeof BANDS_MODES[number] => {
          if (typeof val === "number" && val >= 0 && val < BANDS_MODES.length) {
            return BANDS_MODES[val];
          }
          if (typeof val === "string" && BANDS_MODES.includes(val as any)) {
            return val as typeof BANDS_MODES[number];
          }
          return "stdev";
        };
        
        const normalizeColor = (val: unknown, defaultColor: string): string => {
          if (typeof val === "string" && (val.startsWith("#") || val.startsWith("rgb"))) {
            return val;
          }
          // If numeric index, map to TV colors palette
          if (typeof val === "number") {
            const palette = ["#2962FF", "#4CAF50", "#808000", "#00897B", "#FF6D00", "#9C27B0"];
            return palette[val % palette.length] || defaultColor;
          }
          return defaultColor;
        };
        
        // Input params with normalization
        const anchorPeriod = normalizeAnchorPeriod(indicator.params.anchorPeriod);
        const source = normalizeSource(indicator.params.source);
        const bandsMode = normalizeBandsMode(indicator.params.bandsMode);
        const offset = Number(indicator.params.offset) || 0;
        
        // Hide on 1D or above logic
        const hideOn1DOrAbove = indicator.params.hideOn1DOrAbove === true || indicator.params.hideOn1DOrAbove === 1;
        
        // Band multipliers
        const m1 = Number(indicator.params.bandMultiplier1) || 1.0;
        const m2 = Number(indicator.params.bandMultiplier2) || 2.0;
        const m3 = Number(indicator.params.bandMultiplier3) || 3.0;
        
        // Band enable toggles (backwards compat: check old showBands param)
        const legacyShowBands = indicator.params.showBands !== false;
        const band1Enabled = (indicator.params.band1Enabled !== false) && legacyShowBands;
        const band2Enabled = (indicator.params.band2Enabled !== false) && legacyShowBands;
        const band3Enabled = (indicator.params.band3Enabled !== false) && legacyShowBands;
        
        // Style toggles
        const showVwap = indicator.params.showVwap !== false;
        const showBand1 = indicator.params.showBand1 !== false && band1Enabled;
        const showBand2 = indicator.params.showBand2 !== false && band2Enabled;
        const showBand3 = indicator.params.showBand3 !== false && band3Enabled;
        
        // Colors (TV-style) with normalization
        const vwapColor = normalizeColor(indicator.params.vwapColor, indicator.color || "#2962FF");
        const band1Color = normalizeColor(indicator.params.band1Color, "#4CAF50");
        const band2Color = normalizeColor(indicator.params.band2Color, "#808000");
        const band3Color = normalizeColor(indicator.params.band3Color, "#00897B");
        
        // Fill toggles and colors
        const showFill1 = indicator.params.showFill1 !== false && showBand1;
        const showFill2 = indicator.params.showFill2 !== false && showBand2;
        const showFill3 = indicator.params.showFill3 !== false && showBand3;
        const fill1Color = normalizeColor(indicator.params.fill1Color, band1Color);
        const fill2Color = normalizeColor(indicator.params.fill2Color, band2Color);
        const fill3Color = normalizeColor(indicator.params.fill3Color, band3Color);
        const fill1Opacity = Number(indicator.params.fill1Opacity) || 0.1;
        const fill2Opacity = Number(indicator.params.fill2Opacity) || 0.1;
        const fill3Opacity = Number(indicator.params.fill3Opacity) || 0.1;
        
        // Line width
        const vwapLineWidth = Number(indicator.params.vwapLineWidth) || 1;
        
        // === Hide on 1D or above logic ===
        // Check current timeframe - if 1D or above and hideOn1DOrAbove is true, return empty
        // We detect daily+ by checking if bar duration is >= 86400 seconds (1 day)
        if (hideOn1DOrAbove && data.length >= 2) {
          const barDuration = (data[1].time as number) - (data[0].time as number);
          if (barDuration >= 86400) {
            // Return empty result - VWAP hidden on daily+ timeframes
            return {
              id: indicator.id,
              kind: indicator.kind,
              lines: [],
            };
          }
        }
        
        // Compute VWAP with TV-style parameters
        const result = computeVWAP(
          data,
          anchorPeriod,
          [m1, m2, m3],
          [band1Enabled, band2Enabled, band3Enabled],
          bandsMode as any,
          source as any
        );
        
        // Apply offset if needed
        const applyOffset = (values: { time: any; value: number }[]) => {
          if (offset === 0) return values;
          return shiftSeriesByBars(values, data, offset);
        };
        
        // Convert NaN values to WhitespaceData { time } to prevent autoscale issues
        const toWhitespace = (pt: { time: any; value: number }) => 
          Number.isFinite(pt.value) ? { time: pt.time, value: pt.value } : { time: pt.time };
        
        // Build TV-style label: "VWAP ({AnchorPeriod})"
        const anchorLabel = anchorPeriod.charAt(0).toUpperCase() + anchorPeriod.slice(1);
        const labelText = `VWAP (${anchorLabel})`;
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // VWAP main line
        if (showVwap) {
          lines.push({
            id: "vwap",
            label: labelText,
            pane: "price",
            color: vwapColor,
            style: "line",
            lineWidth: vwapLineWidth,
            lastValueVisible: true,
            values: applyOffset(result.vwap).map(toWhitespace),
          });
        }
        
        // Band #1
        if (showBand1) {
          lines.push({
            id: "upper1",
            label: "Upper #1",
            pane: "price",
            color: band1Color,
            style: "line",
            lineWidth: 1,
            lastValueVisible: true,
            values: applyOffset(result.upper1).map(toWhitespace),
          });
          lines.push({
            id: "lower1",
            label: "Lower #1",
            pane: "price",
            color: band1Color,
            style: "line",
            lineWidth: 1,
            lastValueVisible: true,
            values: applyOffset(result.lower1).map(toWhitespace),
          });
        }
        
        // Band #2
        if (showBand2) {
          lines.push({
            id: "upper2",
            label: "Upper #2",
            pane: "price",
            color: band2Color,
            style: "line",
            lineWidth: 1,
            lastValueVisible: true,
            values: applyOffset(result.upper2).map(toWhitespace),
          });
          lines.push({
            id: "lower2",
            label: "Lower #2",
            pane: "price",
            color: band2Color,
            style: "line",
            lineWidth: 1,
            lastValueVisible: true,
            values: applyOffset(result.lower2).map(toWhitespace),
          });
        }
        
        // Band #3
        if (showBand3) {
          lines.push({
            id: "upper3",
            label: "Upper #3",
            pane: "price",
            color: band3Color,
            style: "line",
            lineWidth: 1,
            lastValueVisible: true,
            values: applyOffset(result.upper3).map(toWhitespace),
          });
          lines.push({
            id: "lower3",
            label: "Lower #3",
            pane: "price",
            color: band3Color,
            style: "line",
            lineWidth: 1,
            lastValueVisible: true,
            values: applyOffset(result.lower3).map(toWhitespace),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Serializable fill config for canvas overlay (no functions!)
          _vwapFill: {
            fills: [
              { enabled: showFill1, color: fill1Color, opacity: fill1Opacity, upperLineId: "upper1", lowerLineId: "lower1" },
              { enabled: showFill2, color: fill2Color, opacity: fill2Opacity, upperLineId: "upper2", lowerLineId: "lower2" },
              { enabled: showFill3, color: fill3Color, opacity: fill3Opacity, upperLineId: "upper3", lowerLineId: "lower3" },
            ],
            anchorPeriod,
          },
        };
      }
      
      case "avwap": {
        // Calculate anchor timestamp based on anchorDate setting
        const anchorDate = (indicator.params.anchorDate as string) || "first";
        const showBands = indicator.params.showBands !== "false"; // Default: true
        const m1 = Number(indicator.params.bandMultiplier1) || 1.0;
        const m2 = Number(indicator.params.bandMultiplier2) || 2.0;
        const m3 = Number(indicator.params.bandMultiplier3) || 3.0;
        
        // Calculate anchor timestamp based on relative date
        let anchorTimestamp: number;
        const now = data.length > 0 ? data[data.length - 1].time : Math.floor(Date.now() / 1000);
        const firstBarTime = data.length > 0 ? data[0].time : now;
        
        switch (anchorDate) {
          case "week":
            anchorTimestamp = now - 7 * 24 * 60 * 60;
            break;
          case "month":
            anchorTimestamp = now - 30 * 24 * 60 * 60;
            break;
          case "quarter":
            anchorTimestamp = now - 90 * 24 * 60 * 60;
            break;
          case "year":
            anchorTimestamp = now - 365 * 24 * 60 * 60;
            break;
          case "first":
          default:
            anchorTimestamp = firstBarTime;
            break;
        }
        
        const result = computeAnchoredVWAP(data, anchorTimestamp, [m1, m2, m3], showBands);
        
        // CRITICAL: Convert NaN values to WhitespaceData { time } to prevent autoscale issues
        // This ensures pre-anchor bars don't affect the y-axis scale
        const toWhitespace = (pt: LinePoint) => 
          Number.isFinite(pt.value) ? { time: pt.time, value: pt.value } : { time: pt.time };
        
        const mainColor = indicator.color || TV_COLORS.teal;
        const bandColor = TV_COLORS.teal;
        
        const lines = [
          {
            id: "vwap",
            label: "AVWAP",
            pane: "price" as const,
            color: mainColor,
            style: "line" as const,
            lineWidth: 2,
            values: result.vwap.map(toWhitespace),
          },
        ];
        
        if (showBands) {
          lines.push(
            {
              id: "upper1",
              label: "Upper Band 1",
              pane: "price" as const,
              color: lightenColor(bandColor, 0.15),
              style: "line" as const,
              lineWidth: 1,
              values: result.upper1.map(toWhitespace),
            },
            {
              id: "lower1",
              label: "Lower Band 1",
              pane: "price" as const,
              color: lightenColor(bandColor, 0.15),
              style: "line" as const,
              lineWidth: 1,
              values: result.lower1.map(toWhitespace),
            },
            {
              id: "upper2",
              label: "Upper Band 2",
              pane: "price" as const,
              color: lightenColor(bandColor, 0.3),
              style: "line" as const,
              lineWidth: 1,
              values: result.upper2.map(toWhitespace),
            },
            {
              id: "lower2",
              label: "Lower Band 2",
              pane: "price" as const,
              color: lightenColor(bandColor, 0.3),
              style: "line" as const,
              lineWidth: 1,
              values: result.lower2.map(toWhitespace),
            },
            {
              id: "upper3",
              label: "Upper Band 3",
              pane: "price" as const,
              color: lightenColor(bandColor, 0.45),
              style: "line" as const,
              lineWidth: 1,
              values: result.upper3.map(toWhitespace),
            },
            {
              id: "lower3",
              label: "Lower Band 3",
              pane: "price" as const,
              color: lightenColor(bandColor, 0.45),
              style: "line" as const,
              lineWidth: 1,
              values: result.lower3.map(toWhitespace),
            }
          );
        }
        
        // Add fill config for AVWAP bands (similar to VWAP)
        // Fills between upper/lower band pairs with subtle colors
        const avwapFillConfig = showBands ? {
          fills: [
            {
              enabled: true,
              color: "#4CAF50", // Green for Band #1
              opacity: 0.1,
              upperLineId: "upper1",
              lowerLineId: "lower1",
            },
            {
              enabled: true,
              color: "#808000", // Olive for Band #2
              opacity: 0.08,
              upperLineId: "upper2",
              lowerLineId: "lower2",
            },
            {
              enabled: true,
              color: "#00897B", // Teal for Band #3
              opacity: 0.06,
              upperLineId: "upper3",
              lowerLineId: "lower3",
            },
          ],
        } : null;
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Expose fill config for AvwapBandsFillOverlay (or reuse VwapBandsFillOverlay)
          _avwapFill: avwapFillConfig,
        };
      }
      
      case "obv": {
        // ============================================================================
        // OBV TradingView-style with Smoothing + Optional BB
        // ============================================================================
        
        // Normalize smoothingType (handle index or string)
        const SMOOTHING_TYPES = ["none", "sma", "sma_bb", "ema", "smma", "wma", "vwma"] as const;
        const normalizeSmoothingType = (val: unknown): OBVSmoothingType => {
          if (typeof val === "number" && val >= 0 && val < SMOOTHING_TYPES.length) {
            return SMOOTHING_TYPES[val];
          }
          if (typeof val === "string" && SMOOTHING_TYPES.includes(val as OBVSmoothingType)) {
            return val as OBVSmoothingType;
          }
          return "none";
        };
        
        const smoothingType = normalizeSmoothingType(indicator.params.smoothingType);
        const smoothingLength = Number(indicator.params.smoothingLength) || 14;
        const bbStdDev = Number(indicator.params.bbStdDev) || 2;
        
        // Style params
        const showObv = indicator.params.showObv !== false;
        const obvColor = (indicator.params.obvColor as string) || indicator.color || TV_COLORS.blue;
        const obvLineWidth = Number(indicator.params.obvLineWidth) || 1;
        const obvLineStyleStr = (indicator.params.obvLineStyle as string) || "solid";
        const obvLineStyle = obvLineStyleStr === "dashed" ? 2 : obvLineStyleStr === "dotted" ? 3 : 0;
        
        // Smoothing style
        const showSmoothing = indicator.params.showSmoothing !== false;
        const smoothingColor = (indicator.params.smoothingColor as string) || TV_COLORS.orange;
        const smoothingLineWidth = Number(indicator.params.smoothingLineWidth) || 1;
        const smoothingLineStyleStr = (indicator.params.smoothingLineStyle as string) || "solid";
        const smoothingLineStyle = smoothingLineStyleStr === "dashed" ? 2 : smoothingLineStyleStr === "dotted" ? 3 : 0;
        
        // BB style
        const showBBUpper = indicator.params.showBBUpper !== false;
        const showBBLower = indicator.params.showBBLower !== false;
        const bbColor = (indicator.params.bbColor as string) || TV_COLORS.blue;
        const bbLineWidth = Number(indicator.params.bbLineWidth) || 1;
        const bbLineStyleStr = (indicator.params.bbLineStyle as string) || "solid";
        const bbLineStyle = bbLineStyleStr === "dashed" ? 2 : bbLineStyleStr === "dotted" ? 3 : 0;
        
        // BB fill
        const showBBFill = indicator.params.showBBFill !== false;
        const bbFillColor = (indicator.params.bbFillColor as string) || TV_COLORS.blue;
        const bbFillOpacity = Number(indicator.params.bbFillOpacity) ?? 0.1;
        
        // Compute OBV with optional smoothing
        const result = computeOBVAdvanced(data, smoothingType, smoothingLength, bbStdDev);
        
        // Convert to WhitespaceData format (remove NaN values)
        const toWhitespace = (pt: { time: any; value: number }) =>
          Number.isFinite(pt.value) ? pt : { time: pt.time };
        
        const lines: IndicatorLineResult[] = [];
        
        // OBV line
        if (showObv) {
          lines.push({
            id: "obv",
            label: "OBV",
            pane: "separate",
            color: obvColor,
            style: "line",
            lineWidth: obvLineWidth,
            lineStyle: obvLineStyle,
            lastValueVisible: true,
            values: result.obv.map(toWhitespace),
          } as IndicatorLineResult);
        }
        
        // Smoothing line (when smoothingType !== none)
        if (smoothingType !== "none" && showSmoothing) {
          lines.push({
            id: "smoothing",
            label: `${smoothingType.toUpperCase()}(${smoothingLength})`,
            pane: "separate",
            color: smoothingColor,
            style: "line",
            lineWidth: smoothingLineWidth,
            lineStyle: smoothingLineStyle,
            lastValueVisible: true,
            values: result.smoothing.map(toWhitespace),
          } as IndicatorLineResult);
        }
        
        // BB lines (when sma_bb mode)
        if (smoothingType === "sma_bb") {
          if (showBBUpper) {
            lines.push({
              id: "bbUpper",
              label: `Upper BB(${smoothingLength}, ${bbStdDev})`,
              pane: "separate",
              color: bbColor,
              style: "line",
              lineWidth: bbLineWidth,
              lineStyle: bbLineStyle,
              lastValueVisible: false,
              values: result.bbUpper.map(toWhitespace),
            } as IndicatorLineResult);
          }
          if (showBBLower) {
            lines.push({
              id: "bbLower",
              label: `Lower BB(${smoothingLength}, ${bbStdDev})`,
              pane: "separate",
              color: bbColor,
              style: "line",
              lineWidth: bbLineWidth,
              lineStyle: bbLineStyle,
              lastValueVisible: false,
              values: result.bbLower.map(toWhitespace),
            } as IndicatorLineResult);
          }
        }
        
        // Build response
        const response: IndicatorWorkerResponse = {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          _compactFormatter: true, // OBV uses K/M/B/T formatting
        };
        
        // Add BB fill config when sma_bb mode
        if (smoothingType === "sma_bb" && showBBFill) {
          response._obvFill = {
            showBBFill: true,
            bbFillColor,
            bbFillOpacity,
            bbUpper: result.bbUpper.map((pt) => ({
              time: pt.time as number,
              value: Number.isFinite(pt.value) ? pt.value : undefined,
            })),
            bbLower: result.bbLower.map((pt) => ({
              time: pt.time as number,
              value: Number.isFinite(pt.value) ? pt.value : undefined,
            })),
          };
        }
        
        return response;
      }

      case "mfi": {
        // === TradingView-style Money Flow Index ===
        // Input params
        const length = Number(indicator.params.length) || 14;
        
        // Band values
        const overboughtValue = Number(indicator.params.overboughtValue) ?? 80;
        const middleBandValue = Number(indicator.params.middleBandValue) ?? 50;
        const oversoldValue = Number(indicator.params.oversoldValue) ?? 20;
        
        // Style toggles
        const showMF = indicator.params.showMF !== false;
        const showOverbought = indicator.params.showOverbought !== false;
        const showMiddleBand = indicator.params.showMiddleBand !== false;
        const showOversold = indicator.params.showOversold !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors
        const mfColor = (indicator.params.mfColor as string) || indicator.color || TV_COLORS.purpleTv;
        const overboughtColor = (indicator.params.overboughtColor as string) || TV_COLORS.gray;
        const middleBandColor = (indicator.params.middleBandColor as string) || TV_COLORS.gray;
        const oversoldColor = (indicator.params.oversoldColor as string) || TV_COLORS.gray;
        const backgroundFillColor = (indicator.params.backgroundFillColor as string) || TV_COLORS.purpleTv;
        const backgroundFillOpacity = Number(indicator.params.backgroundFillOpacity) ?? 0.1;
        
        // Line widths and styles
        const mfLineWidth = Number(indicator.params.mfLineWidth) || 1;
        const mfLineStyleStr = (indicator.params.mfLineStyle as string) || "solid";
        const overboughtLineStyleStr = (indicator.params.overboughtLineStyle as string) || "dashed";
        const middleBandLineStyleStr = (indicator.params.middleBandLineStyle as string) || "dotted";
        const oversoldLineStyleStr = (indicator.params.oversoldLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const mfLineStyle = styleToNum(mfLineStyleStr);
        const overboughtLineStyle = styleToNum(overboughtLineStyleStr);
        const middleBandLineStyle = styleToNum(middleBandLineStyleStr);
        const oversoldLineStyle = styleToNum(oversoldLineStyleStr);
        
        // Compute MFI
        const result = computeMFI(data, length, overboughtValue, middleBandValue, oversoldValue);
        
        // Build TV-style label: "MFI {length}"
        const labelText = `MFI ${length}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // MF line
        if (showMF) {
          lines.push({
            id: "mf",
            label: labelText,
            pane: "separate",
            color: mfColor,
            style: "line",
            lineWidth: mfLineWidth,
            lineStyle: mfLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.mfi),
          });
        }
        
        // Overbought line (80)
        if (showOverbought && result.overbought.length > 0) {
          lines.push({
            id: "mfiOverbought",
            label: `Overbought (${overboughtValue})`,
            pane: "separate",
            color: overboughtColor,
            style: "line",
            lineWidth: 1,
            lineStyle: overboughtLineStyle,
            lastValueVisible: false,
            values: result.overbought,
          });
        }
        
        // Middle Band (50)
        if (showMiddleBand && result.middle.length > 0) {
          lines.push({
            id: "mfiMiddleBand",
            label: `Middle (${middleBandValue})`,
            pane: "separate",
            color: middleBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: middleBandLineStyle,
            lastValueVisible: false,
            values: result.middle,
          });
        }
        
        // Oversold line (20)
        if (showOversold && result.oversold.length > 0) {
          lines.push({
            id: "mfiOversold",
            label: `Oversold (${oversoldValue})`,
            pane: "separate",
            color: oversoldColor,
            style: "line",
            lineWidth: 1,
            lineStyle: oversoldLineStyle,
            lastValueVisible: false,
            values: result.oversold,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Serializable fill config for canvas overlay
          _mfiFill: {
            showBackground,
            backgroundFillColor,
            backgroundFillOpacity,
            overboughtValue,
            middleBandValue,
            oversoldValue,
          },
        };
      }

      case "trix": {
        // === TradingView-style TRIX ===
        // Input params
        const length = Number(indicator.params.length) || 18;
        
        // Zero line value
        const zeroValue = Number(indicator.params.zeroValue) ?? 0;
        
        // Style toggles
        const showTrix = indicator.params.showTrix !== false;
        const showZero = indicator.params.showZero !== false;
        
        // Colors
        const trixColor = (indicator.params.trixColor as string) || indicator.color || TV_COLORS.red;
        const zeroColor = (indicator.params.zeroColor as string) || TV_COLORS.gray;
        
        // Line widths and styles
        const trixLineWidth = Number(indicator.params.trixLineWidth) || 1;
        const trixLineStyleStr = (indicator.params.trixLineStyle as string) || "solid";
        const zeroLineStyleStr = (indicator.params.zeroLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const trixLineStyle = styleToNum(trixLineStyleStr);
        const zeroLineStyle = styleToNum(zeroLineStyleStr);
        
        // Compute TRIX
        const result = computeTRIX(data, length, zeroValue);
        
        // Build TV-style label: "TRIX {length}"
        const labelText = `TRIX ${length}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // TRIX line (red)
        if (showTrix) {
          lines.push({
            id: "trix",
            label: labelText,
            pane: "separate",
            color: trixColor,
            style: "line",
            lineWidth: trixLineWidth,
            lineStyle: trixLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.trix),
          });
        }
        
        // Zero line (gray dashed)
        if (showZero && result.zero.length > 0) {
          lines.push({
            id: "trixZero",
            label: `Zero (${zeroValue})`,
            pane: "separate",
            color: zeroColor,
            style: "line",
            lineWidth: 1,
            lineStyle: zeroLineStyle,
            lastValueVisible: false,
            values: result.zero,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "tsi": {
        // === TradingView-style True Strength Index ===
        // Input params
        const longLength = Number(indicator.params.longLength) || 25;
        const shortLength = Number(indicator.params.shortLength) || 13;
        const signalLength = Number(indicator.params.signalLength) || 13;
        
        // Zero line value
        const zeroValue = Number(indicator.params.zeroValue) ?? 0;
        
        // Style toggles
        const showTsi = indicator.params.showTsi !== false;
        const showSignal = indicator.params.showSignal !== false;
        const showZero = indicator.params.showZero !== false;
        
        // Colors
        const tsiColor = (indicator.params.tsiColor as string) || indicator.color || TV_COLORS.blue;
        const signalColor = (indicator.params.signalColor as string) || TV_COLORS.red;
        const zeroColor = (indicator.params.zeroColor as string) || TV_COLORS.gray;
        
        // Line widths and styles
        const tsiLineWidth = Number(indicator.params.tsiLineWidth) || 1;
        const signalLineWidth = Number(indicator.params.signalLineWidth) || 1;
        const tsiLineStyleStr = (indicator.params.tsiLineStyle as string) || "solid";
        const signalLineStyleStr = (indicator.params.signalLineStyle as string) || "solid";
        const zeroLineStyleStr = (indicator.params.zeroLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const tsiLineStyle = styleToNum(tsiLineStyleStr);
        const signalLineStyle = styleToNum(signalLineStyleStr);
        const zeroLineStyle = styleToNum(zeroLineStyleStr);
        
        // Compute TSI
        const result = computeTSI(data, longLength, shortLength, signalLength, zeroValue);
        
        // Build TV-style label: "TSI {long} {short} {signal}"
        const labelText = `TSI ${longLength} ${shortLength} ${signalLength}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // TSI line (blue)
        if (showTsi) {
          lines.push({
            id: "tsi",
            label: labelText,
            pane: "separate",
            color: tsiColor,
            style: "line",
            lineWidth: tsiLineWidth,
            lineStyle: tsiLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.tsi),
          });
        }
        
        // Signal line (red)
        if (showSignal) {
          lines.push({
            id: "tsiSignal",
            label: "Signal",
            pane: "separate",
            color: signalColor,
            style: "line",
            lineWidth: signalLineWidth,
            lineStyle: signalLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.signal),
          });
        }
        
        // Zero line (gray dashed)
        if (showZero && result.zero.length > 0) {
          lines.push({
            id: "tsiZero",
            label: `Zero (${zeroValue})`,
            pane: "separate",
            color: zeroColor,
            style: "line",
            lineWidth: 1,
            lineStyle: zeroLineStyle,
            lastValueVisible: false,
            values: result.zero,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "smii": {
        // === TradingView-style SMI Ergodic Indicator ===
        // Input params
        const longLength = Number(indicator.params.longLength) || 20;
        const shortLength = Number(indicator.params.shortLength) || 5;
        const signalLength = Number(indicator.params.signalLength) || 5;
        
        // Style toggles
        const showSmi = indicator.params.showSmi !== false;
        const showSignal = indicator.params.showSignal !== false;
        
        // Colors (TV defaults: blue for SMI, orange for Signal)
        const smiColor = (indicator.params.smiColor as string) || indicator.color || TV_COLORS.blue;
        const signalColor = (indicator.params.signalColor as string) || TV_COLORS.orange;
        
        // Line widths and styles
        const smiLineWidth = Number(indicator.params.smiLineWidth) || 1;
        const signalLineWidth = Number(indicator.params.signalLineWidth) || 1;
        const smiLineStyleStr = (indicator.params.smiLineStyle as string) || "solid";
        const signalLineStyleStr = (indicator.params.signalLineStyle as string) || "solid";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const smiLineStyle = styleToNum(smiLineStyleStr);
        const signalLineStyle = styleToNum(signalLineStyleStr);
        
        // Compute SMII (returns smi and signal, NO ×100 scaling)
        const result = computeSMII(data, longLength, shortLength, signalLength);
        
        // Build TV-style label: "SMII {long} {short} {signal}"
        const labelText = `SMII ${longLength} ${shortLength} ${signalLength}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // SMI line (blue)
        if (showSmi) {
          lines.push({
            id: "smi",
            label: labelText,
            pane: "separate",
            color: smiColor,
            style: "line",
            lineWidth: smiLineWidth,
            lineStyle: smiLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.smi),
          });
        }
        
        // Signal line (orange)
        if (showSignal) {
          lines.push({
            id: "smiiSignal",
            label: "Signal",
            pane: "separate",
            color: signalColor,
            style: "line",
            lineWidth: signalLineWidth,
            lineStyle: signalLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.signal),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "smio": {
        // === TradingView-style SMI Ergodic Oscillator ===
        // Input params
        const longLength = Number(indicator.params.longLength) || 20;
        const shortLength = Number(indicator.params.shortLength) || 5;
        const signalLength = Number(indicator.params.signalLength) || 5;
        
        // Style toggles
        const showOscillator = indicator.params.showOscillator !== false;
        
        // Color (TV default: red)
        const oscillatorColor = (indicator.params.oscillatorColor as string) || indicator.color || TV_COLORS.red;
        
        // Plot style (default: histogram)
        const plotStyleStr = (indicator.params.oscillatorPlotStyle as string) || "histogram";
        
        // Line width
        const oscillatorLineWidth = Number(indicator.params.oscillatorLineWidth) || 1;
        
        // Compute SMIO (returns oscillator = SMI - Signal)
        const result = computeSMIO(data, longLength, shortLength, signalLength);
        
        // Build TV-style label: "SMIO {long} {short} {signal}"
        const labelText = `SMIO ${longLength} ${shortLength} ${signalLength}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // Oscillator (histogram by default)
        if (showOscillator) {
          lines.push({
            id: "oscillator",
            label: labelText,
            pane: "separate",
            color: oscillatorColor,
            style: plotStyleStr as "line" | "histogram" | "columns" | "area" | "stepline",
            lineWidth: oscillatorLineWidth,
            lastValueVisible: true,
            values: mapToWhitespace(result.oscillator),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "coppock": {
        // === TradingView-style Coppock Curve ===
        // Input params
        const wmaLength = Number(indicator.params.wmaLength) || 10;
        const longRocLength = Number(indicator.params.longRocLength) || 14;
        const shortRocLength = Number(indicator.params.shortRocLength) || 11;
        
        // Style toggles
        const showCoppock = indicator.params.showCoppock !== false;
        
        // Color (TV default: blue)
        const coppockColor = (indicator.params.coppockColor as string) || indicator.color || TV_COLORS.blue;
        
        // Plot style (default: line)
        const plotStyleStr = (indicator.params.coppockPlotStyle as string) || "line";
        
        // Line width
        const coppockLineWidth = Number(indicator.params.coppockLineWidth) || 1;
        
        // Compute Coppock Curve
        const result = computeCoppockCurve(data, wmaLength, longRocLength, shortRocLength);
        
        // Build TV-style label: "Coppock Curve {wma} {longRoc} {shortRoc}"
        const labelText = `Coppock Curve ${wmaLength} ${longRocLength} ${shortRocLength}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // Coppock Curve line
        if (showCoppock) {
          lines.push({
            id: "coppock",
            label: labelText,
            pane: "separate",
            color: coppockColor,
            style: plotStyleStr as "line" | "histogram" | "columns" | "area" | "stepline",
            lineWidth: coppockLineWidth,
            lastValueVisible: true,
            values: mapToWhitespace(result.coppock),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "cmo": {
        // === TradingView-style Chande Momentum Oscillator ===
        // Input params
        const length = Number(indicator.params.length) || 9;
        const source = (indicator.params.source as "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4") || "close";
        
        // Style toggles
        const showCmo = indicator.params.showCmo !== false;
        const showZero = indicator.params.showZero !== false;
        
        // CMO line style
        const cmoColor = (indicator.params.cmoColor as string) || indicator.color || TV_COLORS.blue;
        const cmoPlotStyle = (indicator.params.cmoPlotStyle as string) || "line";
        const cmoLineWidth = Number(indicator.params.cmoLineWidth) || 1;
        
        // Zero line style
        const zeroLevel = Number(indicator.params.zeroLevel) ?? 0;
        const zeroColor = (indicator.params.zeroColor as string) || TV_COLORS.gray;
        const zeroLineWidth = Number(indicator.params.zeroLineWidth) || 1;
        const zeroLineStyle = (indicator.params.zeroLineStyle as string) || "dashed";
        
        // Compute CMO
        const result = computeCMO(data, length, source);
        
        // Build TV-style label: "ChandeMO {length} {source}"
        const labelText = `ChandeMO ${length} ${source}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Zero line data (constant across all times)
        const zeroLineData: { time: any; value: number }[] = data.map(d => ({
          time: d.time,
          value: zeroLevel,
        }));
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // CMO line
        if (showCmo) {
          lines.push({
            id: "cmo",
            label: labelText,
            pane: "separate",
            color: cmoColor,
            style: cmoPlotStyle as "line" | "histogram" | "columns" | "area" | "stepline",
            lineWidth: cmoLineWidth,
            lastValueVisible: true,
            values: mapToWhitespace(result.cmo),
          });
        }
        
        // Zero line
        if (showZero) {
          lines.push({
            id: "zero",
            label: `Zero (${zeroLevel})`,
            pane: "separate",
            color: zeroColor,
            style: zeroLineStyle as "solid" | "dashed" | "dotted",
            lineWidth: zeroLineWidth,
            lastValueVisible: false,
            values: zeroLineData,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "uo": {
        // === TradingView-style Ultimate Oscillator ===
        // Input params
        const fastLength = Number(indicator.params.fastLength) || 7;
        const middleLength = Number(indicator.params.middleLength) || 14;
        const slowLength = Number(indicator.params.slowLength) || 28;
        
        // Style toggles
        const showUo = indicator.params.showUo !== false;
        
        // UO line style
        const uoColor = (indicator.params.uoColor as string) || indicator.color || TV_COLORS.red;
        const uoPlotStyle = (indicator.params.uoPlotStyle as string) || "line";
        const uoLineWidth = Number(indicator.params.uoLineWidth) || 1;
        
        // Compute UO
        const result = computeUO(data, fastLength, middleLength, slowLength);
        
        // Build TV-style label: "UO 7 14 28"
        const labelText = `UO ${fastLength} ${middleLength} ${slowLength}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // UO line
        if (showUo) {
          lines.push({
            id: "uo",
            label: labelText,
            pane: "separate",
            color: uoColor,
            style: uoPlotStyle as "line" | "histogram" | "columns" | "area" | "stepline",
            lineWidth: uoLineWidth,
            lastValueVisible: true,
            values: mapToWhitespace(result.uo),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "cmf": {
        // === TradingView-style Chaikin Money Flow ===
        // Input params
        const length = Number(indicator.params.length) || 20;
        
        // Zero line value
        const zeroValue = Number(indicator.params.zeroValue) ?? 0;
        
        // Style toggles
        const showCmf = indicator.params.showCmf !== false;
        const showZero = indicator.params.showZero !== false;
        
        // Colors
        const cmfColor = (indicator.params.cmfColor as string) || indicator.color || TV_COLORS.green;
        const zeroColor = (indicator.params.zeroColor as string) || TV_COLORS.gray;
        
        // Line widths and styles
        const cmfLineWidth = Number(indicator.params.cmfLineWidth) || 1;
        const cmfLineStyleStr = (indicator.params.cmfLineStyle as string) || "solid";
        const zeroLineStyleStr = (indicator.params.zeroLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const cmfLineStyle = styleToNum(cmfLineStyleStr);
        const zeroLineStyle = styleToNum(zeroLineStyleStr);
        
        // Compute CMF
        const result = computeCMF(data, length, zeroValue);
        
        // Build TV-style label: "CMF {length}"
        const labelText = `CMF ${length}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // CMF line (green)
        if (showCmf) {
          lines.push({
            id: "cmf",
            label: labelText,
            pane: "separate",
            color: cmfColor,
            style: "line",
            lineWidth: cmfLineWidth,
            lineStyle: cmfLineStyle,
            lastValueVisible: true,
            values: mapToWhitespace(result.cmf),
          });
        }
        
        // Zero line (gray dashed)
        if (showZero && result.zero.length > 0) {
          lines.push({
            id: "cmfZero",
            label: `Zero (${zeroValue})`,
            pane: "separate",
            color: zeroColor,
            style: "line",
            lineWidth: 1,
            lineStyle: zeroLineStyle,
            lastValueVisible: false,
            values: result.zero,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "pvt": {
        // === TradingView-style Price Volume Trend ===
        // Style toggles
        const showPvt = indicator.params.showPvt !== false;
        
        // Colors
        const pvtColor = (indicator.params.pvtColor as string) || indicator.color || TV_COLORS.blue;
        
        // Line widths and styles
        const pvtLineWidth = Number(indicator.params.pvtLineWidth) || 1;
        const pvtLineStyleStr = (indicator.params.pvtLineStyle as string) || "solid";
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const pvtLineStyle = styleToNum(pvtLineStyleStr);
        
        // Compute PVT
        const result = computePVT(data);
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // PVT line (blue)
        if (showPvt) {
          lines.push({
            id: "pvt",
            label: "PVT",
            pane: "separate",
            color: pvtColor,
            style: "line",
            lineWidth: pvtLineWidth,
            lineStyle: pvtLineStyle,
            lastValueVisible: true,
            values: result,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Use compact formatter for volume-style K/M/B display
          _compactFormatter: true,
        };
      }

      case "pvi": {
        // === TradingView-style Positive Volume Index ===
        // Input params
        const emaLength = Number(indicator.params.emaLength) || 255;
        
        // Style toggles
        const showPvi = indicator.params.showPvi !== false;
        const showEma = indicator.params.showEma !== false;
        
        // Colors
        const pviColor = (indicator.params.pviColor as string) || indicator.color || TV_COLORS.blue;
        const emaColor = (indicator.params.emaColor as string) || TV_COLORS.orange;
        
        // Line widths and styles
        const pviLineWidth = Number(indicator.params.pviLineWidth) || 1;
        const emaLineWidth = Number(indicator.params.emaLineWidth) || 1;
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const pviLineStyle = styleToNum((indicator.params.pviLineStyle as string) || "solid");
        const emaLineStyle = styleToNum((indicator.params.emaLineStyle as string) || "solid");
        
        // Convert to WhitespaceData format (remove NaN values)
        const toWhitespace = (pt: { time: any; value: number }) =>
          Number.isFinite(pt.value) ? pt : { time: pt.time };
        
        // Compute PVI
        const result = computePVI(data, emaLength);
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // PVI line (blue)
        if (showPvi) {
          lines.push({
            id: "pvi",
            label: "PVI",
            pane: "separate",
            color: pviColor,
            style: "line",
            lineWidth: pviLineWidth,
            lineStyle: pviLineStyle,
            lastValueVisible: true,
            values: result.pvi.map(toWhitespace),
          });
        }
        
        // PVI EMA line (orange)
        if (showEma) {
          lines.push({
            id: "pviEma",
            label: `EMA(${emaLength})`,
            pane: "separate",
            color: emaColor,
            style: "line",
            lineWidth: emaLineWidth,
            lineStyle: emaLineStyle,
            lastValueVisible: true,
            values: result.pviEma.map(toWhitespace),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "nvi": {
        // === TradingView-style Negative Volume Index ===
        // Input params
        const emaLength = Number(indicator.params.emaLength) || 255;
        
        // Style toggles
        const showNvi = indicator.params.showNvi !== false;
        const showEma = indicator.params.showEma !== false;
        
        // Colors
        const nviColor = (indicator.params.nviColor as string) || indicator.color || TV_COLORS.blue;
        const emaColor = (indicator.params.emaColor as string) || TV_COLORS.orange;
        
        // Line widths and styles
        const nviLineWidth = Number(indicator.params.nviLineWidth) || 1;
        const emaLineWidth = Number(indicator.params.emaLineWidth) || 1;
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const nviLineStyle = styleToNum((indicator.params.nviLineStyle as string) || "solid");
        const emaLineStyle = styleToNum((indicator.params.emaLineStyle as string) || "solid");
        
        // Convert to WhitespaceData format (remove NaN values)
        const toWhitespace = (pt: { time: any; value: number }) =>
          Number.isFinite(pt.value) ? pt : { time: pt.time };
        
        // Compute NVI
        const result = computeNVI(data, emaLength);
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // NVI line (blue)
        if (showNvi) {
          lines.push({
            id: "nvi",
            label: "NVI",
            pane: "separate",
            color: nviColor,
            style: "line",
            lineWidth: nviLineWidth,
            lineStyle: nviLineStyle,
            lastValueVisible: true,
            values: result.nvi.map(toWhitespace),
          });
        }
        
        // NVI EMA line (orange)
        if (showEma) {
          lines.push({
            id: "nviEma",
            label: `EMA(${emaLength})`,
            pane: "separate",
            color: emaColor,
            style: "line",
            lineWidth: emaLineWidth,
            lineStyle: emaLineStyle,
            lastValueVisible: true,
            values: result.nviEma.map(toWhitespace),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "relvol": {
        // === TradingView-style Relative Volume at Time ===
        // Input params
        const anchorTf = (indicator.params.anchorTimeframe as string) || "1D";
        const length = Number(indicator.params.length) || 10;
        const calcMode = (indicator.params.calculationMode as string) || "cumulative";
        
        // Style toggles
        const showHistogram = indicator.params.showHistogram !== false;
        const showLevel = indicator.params.showLevel !== false;
        
        // Colors
        const histAboveColor = (indicator.params.histogramAboveColor as string) || indicator.color || TV_COLORS.green;
        const histBelowColor = (indicator.params.histogramBelowColor as string) || TV_COLORS.red;
        const levelColor = (indicator.params.levelColor as string) || TV_COLORS.gray;
        
        // Level value
        const levelValue = Number(indicator.params.levelValue) ?? 1;
        
        // Line styles
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const levelLineStyle = styleToNum((indicator.params.levelLineStyle as string) || "dashed");
        
        // Cast anchor and calcMode to expected types
        type RelVolAnchorTimeframe = "session" | "week" | "month" | "year" | "1D" | "1W" | "1M";
        type RelVolCalculationMode = "cumulative" | "regular";
        
        // Compute RelVol
        const result = computeRelVolAtTime(
          data,
          anchorTf as RelVolAnchorTimeframe,
          length,
          calcMode as RelVolCalculationMode
        );
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // RelVol histogram with conditional coloring
        if (showHistogram) {
          // Create histogram data with conditional coloring
          // For above/below level, we need to use histogramColor which is evaluated per-bar
          const histogramData = result.relVol.map((pt) => {
            if (!Number.isFinite(pt.value)) {
              return { time: pt.time };
            }
            return {
              time: pt.time,
              value: pt.value,
              color: pt.value >= levelValue ? histAboveColor : histBelowColor,
            };
          });
          
          lines.push({
            id: "relVol",
            label: "RelVol",
            pane: "separate",
            color: histAboveColor,
            style: "histogram",
            values: histogramData,
            lastValueVisible: true,
          } as IndicatorLineResult);
        }
        
        // Level line (baseline at 1.0)
        if (showLevel && data.length > 0) {
          lines.push({
            id: "level",
            label: `Level (${levelValue})`,
            pane: "separate",
            color: levelColor,
            style: "line",
            lineWidth: 1,
            lineStyle: levelLineStyle,
            lastValueVisible: false,
            values: data.map(bar => ({ time: bar.time, value: levelValue })),
          } as IndicatorLineResult);
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "klinger": {
        // === TradingView-style Klinger Oscillator ===
        // Input params
        const fastLength = Number(indicator.params.fastLength) || 34;
        const slowLength = Number(indicator.params.slowLength) || 55;
        const signalLength = Number(indicator.params.signalLength) || 13;
        
        // Style toggles
        const showKlinger = indicator.params.showKlinger !== false;
        const showSignal = indicator.params.showSignal !== false;
        
        // Colors - TV uses blue for KO, green (#26A69A) for Signal
        const klingerColor = (indicator.params.klingerColor as string) || indicator.color || TV_COLORS.blue;
        const signalColor = (indicator.params.signalColor as string) || TV_COLORS.green;
        
        // Line widths and styles
        const klingerLineWidth = Number(indicator.params.klingerLineWidth) || 1;
        const signalLineWidth = Number(indicator.params.signalLineWidth) || 1;
        const klingerLineStyleStr = (indicator.params.klingerLineStyle as string) || "solid";
        const signalLineStyleStr = (indicator.params.signalLineStyle as string) || "solid";
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const klingerLineStyle = styleToNum(klingerLineStyleStr);
        const signalLineStyle = styleToNum(signalLineStyleStr);
        
        // Compute Klinger Oscillator
        const result = computeKlingerOscillator(data, fastLength, slowLength, signalLength);
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // Klinger line (blue)
        if (showKlinger) {
          lines.push({
            id: "klinger",
            label: "Klinger Oscillator",
            pane: "separate",
            color: klingerColor,
            style: "line",
            lineWidth: klingerLineWidth,
            lineStyle: klingerLineStyle,
            lastValueVisible: true,
            values: result.klinger,
          });
        }
        
        // Signal line (orange)
        if (showSignal) {
          lines.push({
            id: "klingerSignal",
            label: "Signal",
            pane: "separate",
            color: signalColor,
            style: "line",
            lineWidth: signalLineWidth,
            lineStyle: signalLineStyle,
            lastValueVisible: true,
            values: result.signal,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Use compact formatter for volume-style K/M/B display
          _compactFormatter: true,
        };
      }

      // ── Batch 2: Momentum Indicators ──────────────────────────────────
      
      case "stoch": {
        // === TradingView-style Stochastic ===
        // Input params (TV naming) with backwards compatibility
        const kLength = Number(indicator.params.kLength ?? indicator.params.kPeriod) || 14;
        const kSmoothing = Number(indicator.params.kSmoothing ?? indicator.params.kSmooth) || 1;
        const dSmoothing = Number(indicator.params.dSmoothing ?? indicator.params.dSmooth) || 3;
        
        // Band values
        const upperBandValue = Number(indicator.params.upperBandValue) ?? 80;
        const middleBandValue = Number(indicator.params.middleBandValue) ?? 50;
        const lowerBandValue = Number(indicator.params.lowerBandValue) ?? 20;
        
        // Style toggles
        const showK = indicator.params.showK !== false;
        const showD = indicator.params.showD !== false;
        const showUpperBand = indicator.params.showUpperBand !== false;
        const showMiddleBand = indicator.params.showMiddleBand !== false;
        const showLowerBand = indicator.params.showLowerBand !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors
        const kColor = (indicator.params.kColor as string) || indicator.color || TV_COLORS.blue;
        const dColor = (indicator.params.dColor as string) || TV_COLORS.orange;
        const upperBandColor = (indicator.params.upperBandColor as string) || TV_COLORS.gray;
        const middleBandColor = (indicator.params.middleBandColor as string) || TV_COLORS.gray;
        const lowerBandColor = (indicator.params.lowerBandColor as string) || TV_COLORS.gray;
        const backgroundFillColor = (indicator.params.backgroundFillColor as string) || TV_COLORS.blue;
        const backgroundFillOpacity = Number(indicator.params.backgroundFillOpacity) ?? 0.1;
        
        // Line widths
        const kLineWidth = Number(indicator.params.kLineWidth) || 1;
        const dLineWidth = Number(indicator.params.dLineWidth) || 1;
        
        // Line styles (0 = solid, 2 = dashed, 3 = dotted)
        const kLineStyleStr = (indicator.params.kLineStyle as string) || "solid";
        const dLineStyleStr = (indicator.params.dLineStyle as string) || "solid";
        const upperBandLineStyleStr = (indicator.params.upperBandLineStyle as string) || "dashed";
        const middleBandLineStyleStr = (indicator.params.middleBandLineStyle as string) || "dotted";
        const lowerBandLineStyleStr = (indicator.params.lowerBandLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const kLineStyle = styleToNum(kLineStyleStr);
        const dLineStyle = styleToNum(dLineStyleStr);
        const upperBandLineStyle = styleToNum(upperBandLineStyleStr);
        const middleBandLineStyle = styleToNum(middleBandLineStyleStr);
        const lowerBandLineStyle = styleToNum(lowerBandLineStyleStr);
        
        // Compute Stochastic
        const result = computeStochastic(data, kLength, kSmoothing, dSmoothing);
        
        // Build TV-style label: "Stoch {kLength} {kSmoothing} {dSmoothing}"
        const labelText = `Stoch ${kLength} ${kSmoothing} ${dSmoothing}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build values
        const kValues = mapToWhitespace(result.k);
        const dValues = mapToWhitespace(result.d);
        
        // Use K values times for bands (or D if K is empty)
        const bandTimes = kValues.length > 0 ? kValues : dValues;
        const upperBandValues = bandTimes.map(p => ({ time: p.time, value: upperBandValue }));
        const middleBandValues = bandTimes.map(p => ({ time: p.time, value: middleBandValue }));
        const lowerBandValues = bandTimes.map(p => ({ time: p.time, value: lowerBandValue }));
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // K line
        if (showK) {
          lines.push({
            id: "stochK",
            label: labelText, // Main label on K line
            pane: "separate",
            color: kColor,
            style: "line",
            lineWidth: kLineWidth,
            lineStyle: kLineStyle,
            lastValueVisible: true,
            values: kValues,
          });
        }
        
        // D line
        if (showD) {
          lines.push({
            id: "stochD",
            label: "%D", // Secondary label for D
            pane: "separate",
            color: dColor,
            style: "line",
            lineWidth: dLineWidth,
            lineStyle: dLineStyle,
            lastValueVisible: true,
            values: dValues,
          });
        }
        
        // Upper Band (80)
        if (showUpperBand && upperBandValues.length > 0) {
          lines.push({
            id: "stochUpperBand",
            label: `Upper (${upperBandValue})`,
            pane: "separate",
            color: upperBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: upperBandLineStyle,
            values: upperBandValues,
          });
        }
        
        // Middle Band (50)
        if (showMiddleBand && middleBandValues.length > 0) {
          lines.push({
            id: "stochMiddleBand",
            label: `Middle (${middleBandValue})`,
            pane: "separate",
            color: middleBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: middleBandLineStyle,
            values: middleBandValues,
          });
        }
        
        // Lower Band (20)
        if (showLowerBand && lowerBandValues.length > 0) {
          lines.push({
            id: "stochLowerBand",
            label: `Lower (${lowerBandValue})`,
            pane: "separate",
            color: lowerBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: lowerBandLineStyle,
            values: lowerBandValues,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Serializable fill config for canvas overlay (no functions!)
          _stochFill: {
            showBackground,
            backgroundFillColor,
            backgroundFillOpacity,
            upperBandValue,
            middleBandValue,
            lowerBandValue,
          },
        };
      }
      
      case "stochrsi": {
        // === TradingView-style Stochastic RSI ===
        // Input params (TV naming)
        const kSmooth = Number(indicator.params.k ?? indicator.params.kSmooth) || 3;
        const dSmooth = Number(indicator.params.d ?? indicator.params.dSmooth) || 3;
        const rsiLength = Number(indicator.params.rsiLength ?? indicator.params.rsiPeriod) || 14;
        const stochasticLength = Number(indicator.params.stochasticLength ?? indicator.params.stochPeriod) || 14;
        const source = (indicator.params.source as string) || "close";
        
        // Band values
        const upperBandValue = Number(indicator.params.upperBandValue) ?? 80;
        const middleBandValue = Number(indicator.params.middleBandValue) ?? 50;
        const lowerBandValue = Number(indicator.params.lowerBandValue) ?? 20;
        
        // Style toggles
        const showK = indicator.params.showK !== false;
        const showD = indicator.params.showD !== false;
        const showUpperBand = indicator.params.showUpperBand !== false;
        const showMiddleBand = indicator.params.showMiddleBand !== false;
        const showLowerBand = indicator.params.showLowerBand !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors
        const kColor = (indicator.params.kColor as string) || indicator.color || TV_COLORS.blue;
        const dColor = (indicator.params.dColor as string) || TV_COLORS.orange;
        const upperBandColor = (indicator.params.upperBandColor as string) || TV_COLORS.gray;
        const middleBandColor = (indicator.params.middleBandColor as string) || TV_COLORS.gray;
        const lowerBandColor = (indicator.params.lowerBandColor as string) || TV_COLORS.gray;
        const backgroundFillColor = (indicator.params.backgroundFillColor as string) || TV_COLORS.blue;
        const backgroundFillOpacity = Number(indicator.params.backgroundFillOpacity) ?? 0.1;
        
        // Line widths
        const kLineWidth = Number(indicator.params.kLineWidth) || 1;
        const dLineWidth = Number(indicator.params.dLineWidth) || 1;
        
        // Line styles (0 = solid, 2 = dashed, 3 = dotted)
        const kLineStyleStr = (indicator.params.kLineStyle as string) || "solid";
        const dLineStyleStr = (indicator.params.dLineStyle as string) || "solid";
        const upperBandLineStyleStr = (indicator.params.upperBandLineStyle as string) || "dashed";
        const middleBandLineStyleStr = (indicator.params.middleBandLineStyle as string) || "dotted";
        const lowerBandLineStyleStr = (indicator.params.lowerBandLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const kLineStyle = styleToNum(kLineStyleStr);
        const dLineStyle = styleToNum(dLineStyleStr);
        const upperBandLineStyle = styleToNum(upperBandLineStyleStr);
        const middleBandLineStyle = styleToNum(middleBandLineStyleStr);
        const lowerBandLineStyle = styleToNum(lowerBandLineStyleStr);
        
        // Compute Stochastic RSI with source support
        const result = computeStochRSI(data, rsiLength, stochasticLength, kSmooth, dSmooth, source as any);
        
        // Build TV-style label: "Stoch RSI {k} {d} {rsiLen} {stochLen} {source}"
        const labelText = `Stoch RSI ${kSmooth} ${dSmooth} ${rsiLength} ${stochasticLength} ${source}`;
        
        // Convert NaN values to WhitespaceData
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build band constant arrays (same length as K values for proper alignment)
        const kValues = mapToWhitespace(result.k);
        const dValues = mapToWhitespace(result.d);
        
        // Use K values times for bands (or D if K is empty)
        const bandTimes = kValues.length > 0 ? kValues : dValues;
        const upperBandValues = bandTimes.map(p => ({ time: p.time, value: upperBandValue }));
        const middleBandValues = bandTimes.map(p => ({ time: p.time, value: middleBandValue }));
        const lowerBandValues = bandTimes.map(p => ({ time: p.time, value: lowerBandValue }));
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // K line
        if (showK) {
          lines.push({
            id: "stochRsiK",
            label: labelText, // Main label on K line
            pane: "separate",
            color: kColor,
            style: "line",
            lineWidth: kLineWidth,
            lineStyle: kLineStyle,
            lastValueVisible: true,
            values: kValues,
          });
        }
        
        // D line
        if (showD) {
          lines.push({
            id: "stochRsiD",
            label: "D", // Secondary label for D
            pane: "separate",
            color: dColor,
            style: "line",
            lineWidth: dLineWidth,
            lineStyle: dLineStyle,
            lastValueVisible: true,
            values: dValues,
          });
        }
        
        // Upper Band (80)
        if (showUpperBand && upperBandValues.length > 0) {
          lines.push({
            id: "stochRsiUpperBand",
            label: `Upper (${upperBandValue})`,
            pane: "separate",
            color: upperBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: upperBandLineStyle,
            values: upperBandValues,
          });
        }
        
        // Middle Band (50)
        if (showMiddleBand && middleBandValues.length > 0) {
          lines.push({
            id: "stochRsiMiddleBand",
            label: `Middle (${middleBandValue})`,
            pane: "separate",
            color: middleBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: middleBandLineStyle,
            values: middleBandValues,
          });
        }
        
        // Lower Band (20)
        if (showLowerBand && lowerBandValues.length > 0) {
          lines.push({
            id: "stochRsiLowerBand",
            label: `Lower (${lowerBandValue})`,
            pane: "separate",
            color: lowerBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: lowerBandLineStyle,
            values: lowerBandValues,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Serializable fill config for canvas overlay (no functions!)
          _stochrsiFill: {
            showBackground,
            backgroundFillColor,
            backgroundFillOpacity,
            upperBandValue,
            middleBandValue,
            lowerBandValue,
          },
        };
      }
      
      case "cci": {
        // TradingView-style CCI with all inputs
        const length = Number(indicator.params.length) || Number(indicator.params.period) || 20;
        const source = (indicator.params.source as string) || "hlc3";
        const smoothingType = (indicator.params.smoothingType as CCISmoothingType) || "none";
        const smoothingLength = Number(indicator.params.smoothingLength) || 14;
        const bbStdDev = Number(indicator.params.bbStdDev) || 2;
        
        // Band values (configurable, TV-style)
        const upperBandValue = Number(indicator.params.upperBandValue) ?? 100;
        const middleBandValue = Number(indicator.params.middleBandValue) ?? 0;
        const lowerBandValue = Number(indicator.params.lowerBandValue) ?? -100;
        
        // Style toggles
        const showCCI = indicator.params.showCCI !== false;
        const showCCIMA = indicator.params.showCCIMA !== false && smoothingType !== "none";
        const showUpperBand = indicator.params.showUpperBand !== false;
        const showMiddleBand = indicator.params.showMiddleBand !== false;
        const showLowerBand = indicator.params.showLowerBand !== false;
        const showBackgroundFill = indicator.params.showBackgroundFill !== false;
        
        // Colors (TV-style)
        const cciColor = (indicator.params.cciColor as string) || "#2962FF"; // TV blue
        const cciMAColor = (indicator.params.cciMAColor as string) || "#FDD835"; // TV yellow
        const upperBandColor = (indicator.params.upperBandColor as string) || "#787B86"; // TV gray
        const middleBandColor = (indicator.params.middleBandColor as string) || "#787B86";
        const lowerBandColor = (indicator.params.lowerBandColor as string) || "#787B86";
        const backgroundFillColor = (indicator.params.backgroundFillColor as string) || "#2962FF";
        const backgroundFillOpacity = Number(indicator.params.backgroundFillOpacity) ?? 0.1;
        
        // Line widths
        const cciLineWidth = Number(indicator.params.cciLineWidth) || 1;
        const cciMALineWidth = Number(indicator.params.cciMALineWidth) || 1;
        
        // Compute CCI
        const result = computeCCI(
          data,
          length,
          source as any,
          smoothingType,
          smoothingLength,
          bbStdDev,
          upperBandValue,
          middleBandValue,
          lowerBandValue
        );
        
        // Convert NaN values to WhitespaceData for proper autoscale
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Get style overrides
        const cciStyle = indicator.styleByLineId?.["cci"];
        const maStyle = indicator.styleByLineId?.["cciMa"];
        const upperStyle = indicator.styleByLineId?.["upperBand"];
        const middleStyle = indicator.styleByLineId?.["middleBand"];
        const lowerStyle = indicator.styleByLineId?.["lowerBand"];
        
        // Build label: "CCI {length} {source}" (TV-style)
        const labelText = `CCI ${length} ${source}`;
        
        // Smoothing type label for MA
        const smoothingLabel = smoothingType !== "none" 
          ? smoothingType === "sma_bb" ? "SMA" : smoothingType.toUpperCase()
          : "";
        
        const lines: IndicatorLineResult[] = [
          {
            id: "cci",
            label: labelText,
            pane: "separate",
            color: cciStyle?.color ?? cciColor,
            style: "line",
            lineWidth: cciStyle?.lineWidth ?? cciLineWidth,
            values: (showCCI && cciStyle?.visible !== false) ? mapToWhitespace(result.cci) : [],
          },
          {
            id: "cciMa",
            label: smoothingType !== "none" ? `${smoothingLabel}(${smoothingLength})` : "",
            pane: "separate",
            color: maStyle?.color ?? cciMAColor,
            style: "line",
            lineWidth: maStyle?.lineWidth ?? cciMALineWidth,
            values: (showCCIMA && maStyle?.visible !== false) ? mapToWhitespace(result.cciMa) : [],
          },
          {
            id: "upperBand",
            label: `Upper (${upperBandValue})`,
            pane: "separate",
            color: upperStyle?.color ?? upperBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // Dashed
            values: (showUpperBand && upperStyle?.visible !== false) ? result.upperBand : [],
          },
          {
            id: "middleBand",
            label: `Middle (${middleBandValue})`,
            pane: "separate",
            color: middleStyle?.color ?? middleBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // Dashed
            values: (showMiddleBand && middleStyle?.visible !== false) ? result.middleBand : [],
          },
          {
            id: "lowerBand",
            label: `Lower (${lowerBandValue})`,
            pane: "separate",
            color: lowerStyle?.color ?? lowerBandColor,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // Dashed
            values: (showLowerBand && lowerStyle?.visible !== false) ? result.lowerBand : [],
          },
        ];
        
        // Add BB lines if sma_bb mode
        if (smoothingType === "sma_bb") {
          lines.push(
            {
              id: "bbUpper",
              label: `BB Upper`,
              pane: "separate",
              color: cciMAColor,
              style: "line",
              lineWidth: 1,
              lineStyle: 2, // Dashed
              values: showCCIMA ? mapToWhitespace(result.bbUpper) : [],
            },
            {
              id: "bbLower",
              label: `BB Lower`,
              pane: "separate",
              color: cciMAColor,
              style: "line",
              lineWidth: 1,
              lineStyle: 2, // Dashed
              values: showCCIMA ? mapToWhitespace(result.bbLower) : [],
            }
          );
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // CCI fill configuration for canvas overlay
          _cciFill: showBackgroundFill ? {
            showBackgroundFill,
            backgroundFillColor,
            backgroundFillOpacity,
            upperBandValue,
            lowerBandValue,
          } : undefined,
        };
      }
      
      case "roc": {
        // TV-style inputs: length (not period), source
        const length = Number(indicator.params.length) || Number(indicator.params.period) || 9;
        const source = (indicator.params.source as string) || "close";
        
        // Style settings
        const rocColor = (indicator.params.rocColor as string) || "#2962FF";
        const rocLineWidth = Number(indicator.params.rocLineWidth) || 1;
        const rocLineStyle = (indicator.params.rocLineStyle as string) || "solid";
        
        // Zero line settings
        const showZeroLine = indicator.params.showZeroLine !== false;
        const zeroLineColor = (indicator.params.zeroLineColor as string) || "#787B86";
        const zeroLineStyle = (indicator.params.zeroLineStyle as string) || "dashed";
        
        // Compute ROC values
        const rawValues = computeROC(data, length, source);
        
        // Build full-length output with WhitespaceData for warmup (NaN handling)
        const values: Array<LinePoint | WhitespaceData> = [];
        const warmupBars = length;
        
        for (let i = 0; i < data.length; i++) {
          if (i < warmupBars) {
            // Warmup period: emit whitespace
            values.push({ time: data[i].time });
          } else {
            // Find matching computed value
            const computed = rawValues.find(v => v.time === data[i].time);
            if (computed && Number.isFinite(computed.value)) {
              values.push(computed);
            } else {
              values.push({ time: data[i].time });
            }
          }
        }
        
        // TV-style label: "ROC 9 close" (lowercase source)
        const label = `ROC ${length} ${source}`;
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "roc",
            label,
            pane: "separate",
            color: rocColor,
            style: "line",
            lineWidth: rocLineWidth,
            lineStyle: rocLineStyle,
            values,
            lastValueVisible: true, // TV shows blue label on price axis
          }],
          _zeroLine: {
            visible: showZeroLine,
            color: zeroLineColor,
            lineStyle: zeroLineStyle,
            lineWidth: 1,
          },
        };
      }
      
      case "mom": {
        const period = Number(indicator.params.period) || 10;
        const source = (indicator.params.source as string) || "close";
        const values = computeMomentum(data, period, source);
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [{
            id: "mom",
            label: `MOM(${period})`,
            pane: "separate",
            color: indicator.color || TV_COLORS.purple,
            style: "line",
            lineWidth: 1,
            values,
          }],
        };
      }
      
      case "willr": {
        // === Extract params (TV-style) ===
        const length = Number(indicator.params.length ?? indicator.params.period) || 14;
        const source = (indicator.params.source as string) || "hlcc4";
        
        // Band levels (Williams %R uses -20/-80 as defaults)
        const upperBand = Number(indicator.params.upperBand) ?? -20;
        const lowerBand = Number(indicator.params.lowerBand) ?? -80;
        
        // Fill toggles
        const showBackgroundFill = indicator.params.showBackgroundFill !== false;
        const showOverboughtFill = indicator.params.showOverboughtFill !== false;
        const showOversoldFill = indicator.params.showOversoldFill !== false;
        
        // Colors - use TV oscillator purple (#7E57C2)
        const lineColor = (indicator.params.lineColor as string) || indicator.color || TV_COLORS.purpleTv;
        const upperBandColor = (indicator.params.upperBandColor as string) || TV_COLORS.gray;
        const lowerBandColor = (indicator.params.lowerBandColor as string) || TV_COLORS.gray;
        const backgroundFillColor = (indicator.params.backgroundFillColor as string) || TV_COLORS.purpleTv;
        const backgroundFillOpacity = Number(indicator.params.backgroundFillOpacity) ?? 0.06;
        const overboughtFillColor = (indicator.params.overboughtFillColor as string) || "#26A69A"; // TV teal/green
        const oversoldFillColor = (indicator.params.oversoldFillColor as string) || "#EF5350"; // TV red
        
        // Compute Williams %R
        const values = computeWilliamsR(data, length);
        
        // Build label (TV-style)
        const labelText = `%R ${length} ${source}`;
        
        // Filter for valid values (remove NaN)
        const safeValues = values
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time as number, value: p.value }));
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // Main %R line
        lines.push({
          id: "willr",
          label: labelText,
          pane: "separate",
          color: lineColor,
          style: "line",
          lineWidth: 2,
          values: safeValues,
        });
        
        // Upper band line (-20 default)
        const upperBandValues = safeValues.map(p => ({ time: p.time, value: upperBand }));
        lines.push({
          id: "willrUpperBand",
          label: `Upper (${upperBand})`,
          pane: "separate",
          color: upperBandColor,
          style: "line",
          lineWidth: 1,
          lineStyle: "dashed",
          values: upperBandValues,
        });
        
        // Lower band line (-80 default)
        const lowerBandValues = safeValues.map(p => ({ time: p.time, value: lowerBand }));
        lines.push({
          id: "willrLowerBand",
          label: `Lower (${lowerBand})`,
          pane: "separate",
          color: lowerBandColor,
          style: "line",
          lineWidth: 1,
          lineStyle: "dashed",
          values: lowerBandValues,
        });
        
        // Return with fill config for canvas overlay
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Serializable fill config (no functions!)
          _willrFill: {
            showBackgroundFill,
            backgroundFillColor,
            backgroundFillOpacity,
            showOverboughtFill,
            overboughtFillColor,
            showOversoldFill,
            oversoldFillColor,
            upperBandValue: upperBand,
            lowerBandValue: lowerBand,
            willrValues: safeValues,
          },
        };
      }
      
      case "fisher": {
        // === Extract params (TV-style) ===
        const length = Number(indicator.params.length ?? indicator.params.period) || 9;
        
        // Level line values (configurable)
        const level1_5Value = Number(indicator.params.level1_5Value) ?? 1.5;
        const level0_75Value = Number(indicator.params.level0_75Value) ?? 0.75;
        const level0Value = Number(indicator.params.level0Value) ?? 0;
        const levelNeg0_75Value = Number(indicator.params.levelNeg0_75Value) ?? -0.75;
        const levelNeg1_5Value = Number(indicator.params.levelNeg1_5Value) ?? -1.5;
        
        // Level line visibility toggles
        const showLevel1_5 = indicator.params.showLevel1_5 !== false;
        const showLevel0_75 = indicator.params.showLevel0_75 !== false;
        const showLevel0 = indicator.params.showLevel0 !== false;
        const showLevelNeg0_75 = indicator.params.showLevelNeg0_75 !== false;
        const showLevelNeg1_5 = indicator.params.showLevelNeg1_5 !== false;
        
        // Main line visibility
        const showFisher = indicator.params.showFisher !== false;
        const showTrigger = indicator.params.showTrigger !== false;
        
        // Colors - TV defaults
        const fisherColor = (indicator.params.fisherColor as string) || TV_COLORS.blue;
        const triggerColor = (indicator.params.triggerColor as string) || TV_COLORS.orange;
        const level1_5Color = (indicator.params.level1_5Color as string) || TV_COLORS.pink;
        const level0_75Color = (indicator.params.level0_75Color as string) || TV_COLORS.gray;
        const level0Color = (indicator.params.level0Color as string) || TV_COLORS.gray;
        const levelNeg0_75Color = (indicator.params.levelNeg0_75Color as string) || TV_COLORS.gray;
        const levelNeg1_5Color = (indicator.params.levelNeg1_5Color as string) || TV_COLORS.pink;
        
        // Line styles
        const fisherLineWidth = Number(indicator.params.fisherLineWidth) || 1;
        const triggerLineWidth = Number(indicator.params.triggerLineWidth) || 1;
        const fisherLineStyleStr = (indicator.params.fisherLineStyle as string) || "solid";
        const triggerLineStyleStr = (indicator.params.triggerLineStyle as string) || "solid";
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const fisherLineStyle = styleToNum(fisherLineStyleStr);
        const triggerLineStyle = styleToNum(triggerLineStyleStr);
        
        // Compute Fisher Transform
        const { fisher: fisherValues, trigger: triggerValues } = computeFisherTransform(data, length);
        
        // Build label (TV-style)
        const labelText = `Fisher Transform (${length})`;
        
        // Convert NaN to whitespace data for proper chart gaps during warmup
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? { time: p.time, value: p.value } : { time: p.time });
        
        const safeFisher = mapToWhitespace(fisherValues);
        const safeTrigger = mapToWhitespace(triggerValues);
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // Main Fisher line (blue)
        if (showFisher) {
          lines.push({
            id: "fisher",
            label: labelText,
            pane: "separate",
            color: fisherColor,
            style: "line",
            lineWidth: fisherLineWidth,
            lineStyle: fisherLineStyle,
            lastValueVisible: true,
            values: safeFisher.filter(p => 'value' in p),
          });
        }
        
        // Trigger line (orange)
        if (showTrigger) {
          lines.push({
            id: "fisherTrigger",
            label: "Trigger",
            pane: "separate",
            color: triggerColor,
            style: "line",
            lineWidth: triggerLineWidth,
            lineStyle: triggerLineStyle,
            lastValueVisible: true,
            values: safeTrigger.filter(p => 'value' in p),
          });
        }
        
        // Use fisher times for level lines (full data array for proper alignment)
        const levelTimes = safeFisher.filter(p => 'value' in p);
        
        // Level line: +1.5 (pink, dashed)
        if (showLevel1_5 && levelTimes.length > 0) {
          lines.push({
            id: "fisherLevelPlus15",
            label: `${level1_5Value}`,
            pane: "separate",
            color: level1_5Color,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // dashed
            lastValueVisible: false,
            values: levelTimes.map(p => ({ time: p.time, value: level1_5Value })),
          });
        }
        
        // Level line: +0.75 (gray, dashed)
        if (showLevel0_75 && levelTimes.length > 0) {
          lines.push({
            id: "fisherLevelPlus075",
            label: `${level0_75Value}`,
            pane: "separate",
            color: level0_75Color,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // dashed
            lastValueVisible: false,
            values: levelTimes.map(p => ({ time: p.time, value: level0_75Value })),
          });
        }
        
        // Level line: 0 (pink, dashed)
        if (showLevel0 && levelTimes.length > 0) {
          lines.push({
            id: "fisherLevelZero",
            label: `${level0Value}`,
            pane: "separate",
            color: level0Color,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // dashed
            lastValueVisible: false,
            values: levelTimes.map(p => ({ time: p.time, value: level0Value })),
          });
        }
        
        // Level line: -0.75 (gray, dashed)
        if (showLevelNeg0_75 && levelTimes.length > 0) {
          lines.push({
            id: "fisherLevelMinus075",
            label: `${levelNeg0_75Value}`,
            pane: "separate",
            color: levelNeg0_75Color,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // dashed
            lastValueVisible: false,
            values: levelTimes.map(p => ({ time: p.time, value: levelNeg0_75Value })),
          });
        }
        
        // Level line: -1.5 (pink, dashed)
        if (showLevelNeg1_5 && levelTimes.length > 0) {
          lines.push({
            id: "fisherLevelMinus15",
            label: `${levelNeg1_5Value}`,
            pane: "separate",
            color: levelNeg1_5Color,
            style: "line",
            lineWidth: 1,
            lineStyle: 2, // dashed
            lastValueVisible: false,
            values: levelTimes.map(p => ({ time: p.time, value: levelNeg1_5Value })),
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "volumeDelta": {
        // ============================================================================
        // Volume Delta - TradingView-style with OHLC candles
        // 
        // When intrabar data is available (via useIntrabarData hook), uses real
        // intrabar-level classification for TV parity.
        // Falls back to chart-level approximation when intrabars unavailable.
        // ============================================================================
        
        // Style params
        const bodyUpColor = (indicator.params.bodyUpColor as string) || "#26A69A";
        const bodyDownColor = (indicator.params.bodyDownColor as string) || "#EF5350";
        const wickUpColor = (indicator.params.wickUpColor as string) || "#26A69A";
        const wickDownColor = (indicator.params.wickDownColor as string) || "#EF5350";
        const borderUpColor = (indicator.params.borderUpColor as string) || "#26A69A";
        const borderDownColor = (indicator.params.borderDownColor as string) || "#EF5350";
        
        // Zero line style
        const showZeroLine = indicator.params.showZeroLine !== false;
        const zeroLineColor = (indicator.params.zeroLineColor as string) || "#787B86";
        const zeroLineStyleStr = (indicator.params.zeroLineStyle as string) || "dashed";
        const zeroLineStyle = zeroLineStyleStr as "solid" | "dashed" | "dotted";
        
        // Compute Volume Delta
        // Use real intrabars if available, otherwise fall back to chart-level approximation
        const hasIntrabars = intrabars && intrabars.size > 0;
        const result = hasIntrabars
          ? computeVolumeDelta(data, intrabars, 0)
          : computeVolumeDeltaFromChartBars(data, 0);
        
        // Build lines array (zero line only - candles are in _volumeDeltaCandles)
        const lines: IndicatorLineResult[] = [];
        
        // Zero line 
        if (showZeroLine && result.zeroLine.length > 0) {
          const zeroLineStyleNum = zeroLineStyle === "dashed" ? 2 : zeroLineStyle === "dotted" ? 3 : 0;
          lines.push({
            id: "volumeDeltaZero",
            label: "Zero",
            pane: "separate",
            color: zeroLineColor,
            style: "line",
            lineWidth: 1,
            lineStyle: zeroLineStyleNum,
            lastValueVisible: false,
            values: result.zeroLine,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Expose candle data for IndicatorPane to render as candlestick series
          _volumeDeltaCandles: {
            candles: result.candles,
            upColor: bodyUpColor,
            downColor: bodyDownColor,
            wickUpColor,
            wickDownColor,
            borderUpColor,
            borderDownColor,
            showZeroLine,
            zeroLineColor,
            zeroLineStyle,
          },
          // Use compact formatter for volume-style K/M/B display
          _compactFormatter: true,
        };
      }

      case "cvd": {
        // ============================================================================
        // Cumulative Volume Delta (CVD) - TradingView-style with OHLC candles
        // 
        // Accumulates Volume Delta within anchor period, resets at period boundary.
        // TradingView doc: https://www.tradingview.com/support/solutions/43000725058-cumulative-volume-delta/
        //
        // When intrabar data is available (via useIntrabarData hook), uses real
        // intrabar-level classification for TV parity.
        // Falls back to chart-level approximation when intrabars unavailable.
        // ============================================================================
        
        // Anchor period
        const anchorPeriod = (indicator.params.anchorPeriod as string) || "Session";
        
        // Style params
        const bodyUpColor = (indicator.params.bodyUpColor as string) || "#26A69A";
        const bodyDownColor = (indicator.params.bodyDownColor as string) || "#EF5350";
        const wickUpColor = (indicator.params.wickUpColor as string) || "#26A69A";
        const wickDownColor = (indicator.params.wickDownColor as string) || "#EF5350";
        const borderUpColor = (indicator.params.borderUpColor as string) || "#26A69A";
        const borderDownColor = (indicator.params.borderDownColor as string) || "#EF5350";
        
        // Level 0 line style
        const showLevelZero = indicator.params.showLevelZero !== false;
        const levelZeroColor = (indicator.params.levelZeroColor as string) || "#787B86";
        const levelZeroStyleStr = (indicator.params.levelZeroStyle as string) || "dashed";
        const levelZeroStyle = levelZeroStyleStr as "solid" | "dashed" | "dotted";
        
        // Compute CVD
        // Use real intrabars if available, otherwise fall back to chart-level approximation
        const hasIntrabars = intrabars && intrabars.size > 0;
        const result = hasIntrabars
          ? computeCVD(data, intrabars, anchorPeriod as CVDAnchorPeriod)
          : computeCVDFromChartBars(data, anchorPeriod as CVDAnchorPeriod);
        
        // Build lines array (level 0 line only - candles are in _cvdCandles)
        const lines: IndicatorLineResult[] = [];
        
        // Level 0 line 
        if (showLevelZero && result.zeroLine.length > 0) {
          const levelZeroStyleNum = levelZeroStyle === "dashed" ? 2 : levelZeroStyle === "dotted" ? 3 : 0;
          lines.push({
            id: "cvdLevelZero",
            label: "Level 0",
            pane: "separate",
            color: levelZeroColor,
            style: "line",
            lineWidth: 1,
            lineStyle: levelZeroStyleNum,
            lastValueVisible: false,
            values: result.zeroLine,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Expose candle data for IndicatorPane to render as candlestick series
          _cvdCandles: {
            candles: result.candles,
            upColor: bodyUpColor,
            downColor: bodyDownColor,
            wickUpColor,
            wickDownColor,
            borderUpColor,
            borderDownColor,
            showLevelZero,
            levelZeroColor,
            levelZeroStyle,
            anchorPeriod,
          },
          // Use compact formatter for volume-style K/M/B display
          _compactFormatter: true,
        };
      }

      case "cvi": {
        // ============================================================================
        // Cumulative Volume Index (CVI) - TradingView-style line
        // 
        // CVI = Previous CVI + (Advancing Volume – Declining Volume)
        // TradingView doc: https://www.tradingview.com/support/solutions/43000589126-cumulative-volume-index-cvi/
        // 
        // ⚠️ PARITY LIMITATION:
        // TradingView CVI requires exchange-level breadth data (advancing/declining 
        // volume for all stocks on NYSE, NASDAQ, etc.). Without a breadth data API,
        // exact parity is NOT possible. Current implementation uses a proxy based on
        // the symbol's bar direction, which gives shape similarity but NOT value parity.
        // TV shows ~533B, we show ~431M - different by orders of magnitude.
        // 
        // For true parity, need: backend endpoint for exchange breadth timeseries.
        // ============================================================================
        
        const exchange = (indicator.params.exchange as string) || "NYSE";
        const lineColor = (indicator.params.lineColor as string) || "#2962FF";
        const lineWidth = (indicator.params.lineWidth as number) || 1;
        
        // Compute CVI (using chart-level proxy - NOT true breadth data!)
        const result = computeCVIFromChartBars(data);
        
        const lines: IndicatorLineResult[] = [];
        
        if (result.line.length > 0) {
          lines.push({
            id: "cvi",
            label: `CVI ${exchange} (approx)`,  // Mark as approximate
            pane: "separate",
            color: lineColor,
            style: "line",
            lineWidth,
            lastValueVisible: true,
            values: result.line,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
          // Use compact formatter for large volume values
          _compactFormatter: true,
        };
      }
      
      case "pivotPointsStandard": {
        // ============================================================================
        // Pivot Points Standard
        // 
        // TradingView doc: https://www.tradingview.com/support/solutions/43000521824-pivot-points-standard/
        //
        // Calculates support and resistance levels based on previous period OHLC.
        // Supports: Traditional, Fibonacci, Woodie, Classic, DM, Camarilla.
        // 
        // This is an overlay indicator with horizontal line segments per period.
        // ============================================================================
        
        // Extract params
        const pivotType = (indicator.params.pivotType as PivotPointType) || "traditional";
        const timeframe = (indicator.params.timeframe as PivotTimeframe) || "auto";
        const pivotsBack = Number(indicator.params.pivotsBack) || 15;
        const useDailyBased = indicator.params.useDailyBased !== false;
        
        // Label/display settings
        const showLabels = indicator.params.showLabels !== false;
        const showPrices = indicator.params.showPrices !== false;
        const labelsPosition = (indicator.params.labelsPosition as "left" | "right") || "left";
        const lineWidth = Number(indicator.params.lineWidth) || 1;
        
        // Level visibility (default all visible)
        const levelVisibility: Record<PivotLevelKey, boolean> = {
          P: indicator.params.showP !== false,
          S1: indicator.params.showS1 !== false,
          S2: indicator.params.showS2 !== false,
          S3: indicator.params.showS3 !== false,
          S4: indicator.params.showS4 !== false,
          S5: indicator.params.showS5 !== false,
          R1: indicator.params.showR1 !== false,
          R2: indicator.params.showR2 !== false,
          R3: indicator.params.showR3 !== false,
          R4: indicator.params.showR4 !== false,
          R5: indicator.params.showR5 !== false,
        };
        
        // Level colors (default orange #FF6D00)
        const levelColors: Record<PivotLevelKey, string> = {
          P: (indicator.params.colorP as string) || "#FF6D00",
          S1: (indicator.params.colorS1 as string) || "#FF6D00",
          S2: (indicator.params.colorS2 as string) || "#FF6D00",
          S3: (indicator.params.colorS3 as string) || "#FF6D00",
          S4: (indicator.params.colorS4 as string) || "#FF6D00",
          S5: (indicator.params.colorS5 as string) || "#FF6D00",
          R1: (indicator.params.colorR1 as string) || "#FF6D00",
          R2: (indicator.params.colorR2 as string) || "#FF6D00",
          R3: (indicator.params.colorR3 as string) || "#FF6D00",
          R4: (indicator.params.colorR4 as string) || "#FF6D00",
          R5: (indicator.params.colorR5 as string) || "#FF6D00",
        };
        
        // Determine chart resolution from data
        // Default to daily (1440 minutes) if can't determine
        let chartResolutionMinutes = 1440;
        if (data.length >= 2) {
          const timeDiff = (data[1].time as number) - (data[0].time as number);
          chartResolutionMinutes = timeDiff / 60; // seconds to minutes
        }
        
        // Compute pivot points
        const result = computePivotPointsStandard(
          data,
          pivotType,
          timeframe,
          chartResolutionMinutes,
          pivotsBack,
          useDailyBased
        );
        
        // Return special pivot data for overlay rendering
        // Note: No standard lines - rendering is handled by PivotPointsOverlay
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [], // No standard line series - overlay handles rendering
          _pivotPointsData: {
            periods: result.periods,
            validLevels: result.validLevels,
            pivotType: result.pivotType,
            showLabels,
            showPrices,
            labelsPosition,
            lineWidth,
            levelVisibility,
            levelColors,
          },
        };
      }
      
      case "pivotPointsHighLow": {
        // ============================================================================
        // Pivot Points High Low
        // 
        // Detects swing highs and lows based on left/right bar counts.
        // ============================================================================
        
        const source = (indicator.params.source as "hl" | "close") || "hl";
        const highLeftBars = Number(indicator.params.highLeftBars) || 10;
        const highRightBars = Number(indicator.params.highRightBars) || 10;
        const lowLeftBars = Number(indicator.params.lowLeftBars) || 10;
        const lowRightBars = Number(indicator.params.lowRightBars) || 10;
        const showPrices = indicator.params.showPrices !== false;
        const highColor = (indicator.params.highColor as string) || "#26A69A";
        const lowColor = (indicator.params.lowColor as string) || "#EF5350";
        
        const result = computePivotPointsHighLow(
          data,
          highLeftBars,
          highRightBars,
          lowLeftBars,
          lowRightBars,
          source
        );
        
        // Return special pivot data for overlay rendering
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [],
          _pivotPointsHLData: {
            pivots: result.pivots,
            highs: result.highs,
            lows: result.lows,
            showPrices,
            highColor,
            lowColor,
          },
        };
      }
      
      case "zigzag": {
        // ============================================================================
        // Zig Zag
        // 
        // Swing detection using deviation and depth parameters.
        // ============================================================================
        
        const deviation = Number(indicator.params.deviation) || 5;
        const depth = Number(indicator.params.depth) || 10;
        const lineColor = (indicator.params.lineColor as string) || "#2962FF";
        const lineWidth = Number(indicator.params.lineWidth) || 2;
        const extendToLastBar = indicator.params.extendToLastBar !== false;
        const showPrice = indicator.params.showPrice !== false;
        const showVolume = indicator.params.showVolume !== false;
        const priceChangeMode = (indicator.params.priceChangeMode as "absolute" | "percent") || "absolute";
        const upColor = (indicator.params.upColor as string) || "#26A69A";
        const downColor = (indicator.params.downColor as string) || "#EF5350";
        
        const result = computeZigZag(data, deviation, depth, extendToLastBar);
        
        // Debug logging
        if (process.env.NODE_ENV === "development") {
          console.log(`[registryV2:zigzag] deviation=${deviation}, depth=${depth}, bars=${data.length}, swings=${result.swings.length}, lines=${result.lines.length}`);
        }
        
        // Return special zigzag data for overlay rendering
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [],
          _zigzagData: {
            swings: result.swings,
            lineSegments: result.lines,
            lineColor,
            lineWidth,
            showPrice,
            showVolume,
            priceChangeMode,
            upColor,
            downColor,
          },
        };
      }
      
      case "autoFib": {
        // ============================================================================
        // Auto Fib Retracement
        // 
        // Automatically draws Fibonacci retracement from detected swings.
        // ============================================================================
        
        const deviation = Number(indicator.params.deviation) || 3;
        const depth = Number(indicator.params.depth) || 10;
        const reverse = indicator.params.reverse === true;
        const extendLeft = indicator.params.extendLeft === true;
        const extendRight = indicator.params.extendRight !== false;
        const showPrices = indicator.params.showPrices !== false;
        const showLevels = (indicator.params.showLevels as "values" | "percent") || "values";
        const labelsPosition = (indicator.params.labelsPosition as "left" | "right") || "left";
        const backgroundTransparency = Number(indicator.params.backgroundTransparency) ?? 85;
        const lineWidth = Number(indicator.params.lineWidth) || 1;
        
        // Level visibility
        const levelVisibility: Record<string, boolean> = {
          "0": indicator.params.show0 !== false,
          "0.236": indicator.params.show0236 !== false,
          "0.382": indicator.params.show0382 !== false,
          "0.5": indicator.params.show05 !== false,
          "0.618": indicator.params.show0618 !== false,
          "0.786": indicator.params.show0786 !== false,
          "1": indicator.params.show1 !== false,
          "1.618": indicator.params.show1618 !== false,
          "2.618": indicator.params.show2618 !== false,
          "3.618": indicator.params.show3618 !== false,
          "4.236": indicator.params.show4236 !== false,
        };
        
        // Level colors
        const levelColors: Record<string, string> = {
          "0": (indicator.params.color0 as string) || "#787B86",
          "0.236": (indicator.params.color0236 as string) || "#F23645",
          "0.382": (indicator.params.color0382 as string) || "#FF9800",
          "0.5": (indicator.params.color05 as string) || "#4CAF50",
          "0.618": (indicator.params.color0618 as string) || "#2196F3",
          "0.786": (indicator.params.color0786 as string) || "#9C27B0",
          "1": (indicator.params.color1 as string) || "#787B86",
          "1.618": (indicator.params.color1618 as string) || "#00BCD4",
          "2.618": (indicator.params.color2618 as string) || "#FFEB3B",
          "3.618": (indicator.params.color3618 as string) || "#FF5722",
          "4.236": (indicator.params.color4236 as string) || "#795548",
        };
        
        const result = computeAutoFibRetracement(
          data,
          deviation,
          depth,
          reverse,
          levelVisibility,
          levelColors
        );
        
        // Return special fib data for overlay rendering
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [],
          _autoFibData: {
            startPoint: result.startPoint,
            endPoint: result.endPoint,
            levels: result.levels,
            isUpward: result.isUpward,
            extendLeft,
            extendRight,
            showPrices,
            showLevels,
            labelsPosition,
            backgroundTransparency,
            lineWidth,
          },
        };
      }
      
      case "env": {
        // ============================================================================
        // Envelope (ENV) - TradingView Parity
        // 
        // Moving average with percentage-based upper and lower bands.
        // ============================================================================
        
        const length = Number(indicator.params.length) || 20;
        const percent = Number(indicator.params.percent) || 10;
        const source = (indicator.params.source as "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4") || "close";
        const exponential = indicator.params.exponential === true;
        
        // Style settings
        const showBasis = indicator.params.showBasis !== false;
        const showUpper = indicator.params.showUpper !== false;
        const showLower = indicator.params.showLower !== false;
        const showBackground = indicator.params.showBackground !== false;
        
        // Colors (TV defaults)
        const basisColor = (indicator.params.basisColor as string) || "#FF6D00";
        const upperColor = (indicator.params.upperColor as string) || "#2962FF";
        const lowerColor = (indicator.params.lowerColor as string) || "#2962FF";
        const backgroundColor = (indicator.params.backgroundColor as string) || "rgba(33, 150, 243, 0.1)";
        
        // Line widths
        const basisLineWidth = Number(indicator.params.basisLineWidth) || 1;
        const upperLineWidth = Number(indicator.params.upperLineWidth) || 1;
        const lowerLineWidth = Number(indicator.params.lowerLineWidth) || 1;
        
        // Line styles
        const basisLineStyle = (indicator.params.basisLineStyle as string) || "solid";
        const upperLineStyle = (indicator.params.upperLineStyle as string) || "solid";
        const lowerLineStyle = (indicator.params.lowerLineStyle as string) || "solid";
        
        // Visibility toggles
        const labelsOnPriceScale = indicator.params.labelsOnPriceScale !== false;
        const inputsInStatusLine = indicator.params.inputsInStatusLine !== false;
        
        // Compute Envelope
        const result = computeEnvelope(data, length, percent, source, exponential);
        
        // Map NaN to WhitespaceData
        const basisValues = result.basis.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const upperValues = result.upper.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const lowerValues = result.lower.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        
        // Build label: "ENV 20 10" (TV-style)
        const labelText = inputsInStatusLine ? `ENV ${length} ${percent}` : "ENV";
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "basis",
              label: labelText,
              pane: "price",
              color: basisColor,
              style: basisLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: basisLineWidth,
              values: showBasis ? basisValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "upper",
              label: "Upper",
              pane: "price",
              color: upperColor,
              style: upperLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: upperLineWidth,
              values: showUpper ? upperValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "lower",
              label: "Lower",
              pane: "price",
              color: lowerColor,
              style: lowerLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: lowerLineWidth,
              values: showLower ? lowerValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
          ],
          // Pass ENV data for fill overlay
          _envFill: showBackground ? {
            upper: upperValues,
            lower: lowerValues,
            backgroundColor,
          } : undefined,
        };
      }
      
      case "median": {
        // ============================================================================
        // Median Indicator - TradingView Parity
        // 
        // Rolling median with EMA and ATR-based bands.
        // Cloud fill between median and medianEma that switches color on crossings.
        // ============================================================================
        
        const medianLength = Number(indicator.params.medianLength) || 3;
        const atrLength = Number(indicator.params.atrLength) || 14;
        const atrMultiplier = Number(indicator.params.atrMultiplier) || 2;
        const medianSource = (indicator.params.medianSource as "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4") || "hl2";
        
        // Style settings
        const showMedian = indicator.params.showMedian !== false;
        const showMedianEma = indicator.params.showMedianEma !== false;
        const showUpper = indicator.params.showUpper !== false;
        const showLower = indicator.params.showLower !== false;
        const showCloud = indicator.params.showCloud !== false;
        
        // Colors (TV defaults)
        const medianColor = (indicator.params.medianColor as string) || "#F23645";
        const medianEmaColor = (indicator.params.medianEmaColor as string) || "#2962FF";
        const upperColor = (indicator.params.upperColor as string) || "#089981";
        const lowerColor = (indicator.params.lowerColor as string) || "#9C27B0";
        const cloudUpColor = (indicator.params.cloudUpColor as string) || "rgba(8, 153, 129, 0.3)";
        const cloudDownColor = (indicator.params.cloudDownColor as string) || "rgba(156, 39, 176, 0.3)";
        
        // Line widths
        const medianLineWidth = Number(indicator.params.medianLineWidth) || 1;
        const medianEmaLineWidth = Number(indicator.params.medianEmaLineWidth) || 1;
        const upperLineWidth = Number(indicator.params.upperLineWidth) || 1;
        const lowerLineWidth = Number(indicator.params.lowerLineWidth) || 1;
        
        // Line styles
        const medianLineStyle = (indicator.params.medianLineStyle as string) || "solid";
        const medianEmaLineStyle = (indicator.params.medianEmaLineStyle as string) || "solid";
        const upperLineStyle = (indicator.params.upperLineStyle as string) || "solid";
        const lowerLineStyle = (indicator.params.lowerLineStyle as string) || "solid";
        
        // Visibility toggles
        const labelsOnPriceScale = indicator.params.labelsOnPriceScale !== false;
        const inputsInStatusLine = indicator.params.inputsInStatusLine !== false;
        
        // Compute Median indicator
        const result = computeMedianIndicator(data, medianLength, atrLength, atrMultiplier, medianSource);
        
        // Map NaN to WhitespaceData
        const medianValues = result.median.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const medianEmaValues = result.medianEma.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const upperValues = result.upper.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const lowerValues = result.lower.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        
        // Build label: "Median 3 14 2" (TV-style)
        const labelText = inputsInStatusLine ? `Median ${medianLength} ${atrLength} ${atrMultiplier}` : "Median";
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "median",
              label: labelText,
              pane: "price",
              color: medianColor,
              style: medianLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: medianLineWidth,
              values: showMedian ? medianValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "medianEma",
              label: "Median EMA",
              pane: "price",
              color: medianEmaColor,
              style: medianEmaLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: medianEmaLineWidth,
              values: showMedianEma ? medianEmaValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "upper",
              label: "Upper",
              pane: "price",
              color: upperColor,
              style: upperLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: upperLineWidth,
              values: showUpper ? upperValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "lower",
              label: "Lower",
              pane: "price",
              color: lowerColor,
              style: lowerLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: lowerLineWidth,
              values: showLower ? lowerValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
          ],
          // Pass Median cloud data for fill overlay
          _medianCloud: showCloud ? {
            median: medianValues,
            medianEma: medianEmaValues,
            cloudUpColor,
            cloudDownColor,
          } : undefined,
        };
      }
      
      case "linreg": {
        // ============================================================================
        // Linear Regression Channel - TradingView Parity
        // 
        // Best-fit regression line with deviation bands and Pearson's R.
        // Canvas overlay fills the channel between upper and lower bands.
        // ============================================================================
        
        const count = Number(indicator.params.count) || 100;
        const upperDeviation = Number(indicator.params.upperDeviation) ?? 2;
        const lowerDeviation = Number(indicator.params.lowerDeviation) ?? 2;
        const source = (indicator.params.source as "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4") || "close";
        
        // Style settings
        const showLinreg = indicator.params.showLinreg !== false;
        const showUpper = indicator.params.showUpper !== false;
        const showLower = indicator.params.showLower !== false;
        const showFill = indicator.params.showFill !== false;
        const showPearsonsR = indicator.params.showPearsonsR !== false;
        
        // Colors (TV defaults)
        const linregColor = (indicator.params.linregColor as string) || "#2962FF";
        const upperColor = (indicator.params.upperColor as string) || "#F23645";
        const lowerColor = (indicator.params.lowerColor as string) || "#089981";
        const fillColor = (indicator.params.fillColor as string) || "rgba(41, 98, 255, 0.1)";
        const pearsonsRColor = (indicator.params.pearsonsRColor as string) || "#FF6D00";
        
        // Line widths
        const linregLineWidth = Number(indicator.params.linregLineWidth) || 1;
        const upperLineWidth = Number(indicator.params.upperLineWidth) || 1;
        const lowerLineWidth = Number(indicator.params.lowerLineWidth) || 1;
        const pearsonsRLineWidth = Number(indicator.params.pearsonsRLineWidth) || 1;
        
        // Line styles
        const linregLineStyle = (indicator.params.linregLineStyle as string) || "solid";
        const upperLineStyle = (indicator.params.upperLineStyle as string) || "solid";
        const lowerLineStyle = (indicator.params.lowerLineStyle as string) || "solid";
        
        // Visibility toggles
        const labelsOnPriceScale = indicator.params.labelsOnPriceScale !== false;
        const inputsInStatusLine = indicator.params.inputsInStatusLine !== false;
        
        // Compute Linear Regression
        const result = computeLinearRegression(data, count, upperDeviation, lowerDeviation, source);
        
        // Map NaN to WhitespaceData
        const linregValues = result.linreg.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const upperValues = result.upper.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const lowerValues = result.lower.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        const pearsonsRValues = result.pearsonsR.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        
        // Build label: "LinReg 100 2 2" (TV-style)
        const labelText = inputsInStatusLine ? `LinReg ${count} ${upperDeviation} ${lowerDeviation}` : "LinReg";
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "linreg",
              label: labelText,
              pane: "price",
              color: linregColor,
              style: linregLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: linregLineWidth,
              values: showLinreg ? linregValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "upper",
              label: "Upper Dev",
              pane: "price",
              color: upperColor,
              style: upperLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: upperLineWidth,
              values: showUpper ? upperValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "lower",
              label: "Lower Dev",
              pane: "price",
              color: lowerColor,
              style: lowerLineStyle as "line" | "solid" | "dashed" | "dotted",
              lineWidth: lowerLineWidth,
              values: showLower ? lowerValues : [],
              _lastValueVisible: labelsOnPriceScale,
            },
            {
              id: "pearsonsR",
              label: "Pearson's R",
              pane: "sub",
              color: pearsonsRColor,
              style: "line",
              lineWidth: pearsonsRLineWidth,
              values: showPearsonsR ? pearsonsRValues : [],
              _lastValueVisible: false,
            },
          ],
          // Pass LinReg fill data for overlay
          _linregFill: showFill ? {
            upper: upperValues,
            lower: lowerValues,
            fillColor,
          } : undefined,
        };
      }
      
      case "williamsAlligator": {
        // ============================================================================
        // Williams Alligator - TradingView Parity
        // 
        // Three SMMA lines (Jaw, Teeth, Lips) with forward offsets.
        // Uses canvas overlay to render forward-shifted lines into whitespace.
        // ============================================================================
        
        const jawLength = Number(indicator.params.jawLength) || 13;
        const teethLength = Number(indicator.params.teethLength) || 8;
        const lipsLength = Number(indicator.params.lipsLength) || 5;
        const jawOffset = Number(indicator.params.jawOffset) || 8;
        const teethOffset = Number(indicator.params.teethOffset) || 5;
        const lipsOffset = Number(indicator.params.lipsOffset) || 3;
        
        // Style settings
        const showJaw = indicator.params.showJaw !== false;
        const showTeeth = indicator.params.showTeeth !== false;
        const showLips = indicator.params.showLips !== false;
        
        // Colors (TV defaults)
        const jawColor = (indicator.params.jawColor as string) || "#2962FF";
        const teethColor = (indicator.params.teethColor as string) || "#E91E63";
        const lipsColor = (indicator.params.lipsColor as string) || "#66BB6A";
        
        // Line widths
        const jawLineWidth = Number(indicator.params.jawLineWidth) || 1;
        const teethLineWidth = Number(indicator.params.teethLineWidth) || 1;
        const lipsLineWidth = Number(indicator.params.lipsLineWidth) || 1;
        
        // Compute Williams Alligator
        const result = computeWilliamsAlligator(
          data, jawLength, teethLength, lipsLength, jawOffset, teethOffset, lipsOffset
        );
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [], // Lines rendered via overlay
          _alligatorData: {
            jaw: result.jaw.map(p => ({ time: p.time as number, value: p.value })),
            teeth: result.teeth.map(p => ({ time: p.time as number, value: p.value })),
            lips: result.lips.map(p => ({ time: p.time as number, value: p.value })),
            jawRaw: result.jawRaw.map(p => ({ time: p.time as number, value: p.value })),
            teethRaw: result.teethRaw.map(p => ({ time: p.time as number, value: p.value })),
            lipsRaw: result.lipsRaw.map(p => ({ time: p.time as number, value: p.value })),
            showJaw,
            showTeeth,
            showLips,
            jawColor,
            teethColor,
            lipsColor,
            jawLineWidth,
            teethLineWidth,
            lipsLineWidth,
          },
        };
      }
      
      case "williamsFractals": {
        // ============================================================================
        // Williams Fractals - TradingView Parity
        // 
        // Pivot high/low markers rendered as up/down triangles.
        // ============================================================================
        
        const periods = Number(indicator.params.periods) || 2;
        
        // Style settings
        const showUpFractals = indicator.params.showUpFractals !== false;
        const showDownFractals = indicator.params.showDownFractals !== false;
        
        // Colors (TV defaults)
        const upColor = (indicator.params.upColor as string) || "#089981";
        const downColor = (indicator.params.downColor as string) || "#F23645";
        
        // Compute Williams Fractals
        const result = computeWilliamsFractals(data, periods);
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [], // Markers rendered via overlay
          _fractalsData: {
            highs: result.highs,
            lows: result.lows,
            showUpFractals,
            showDownFractals,
            upColor,
            downColor,
          },
        };
      }
      
      case "rsiDivergence": {
        // ============================================================================
        // RSI Divergence Indicator - TradingView Parity
        // 
        // RSI oscillator in separate pane with divergence detection.
        // Background fill, level lines, divergence lines, and labels rendered via overlay.
        // ============================================================================
        
        const rsiPeriod = Number(indicator.params.rsiPeriod) || 14;
        const source = (indicator.params.source as "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4") || "close";
        const lbL = Number(indicator.params.lbL) || 5;
        const lbR = Number(indicator.params.lbR) || 5;
        const rangeMax = Number(indicator.params.rangeMax) || 60;
        const rangeMin = Number(indicator.params.rangeMin) || 5;
        
        // Divergence toggles
        const plotBullish = indicator.params.plotBullish !== false;
        const plotHiddenBullish = indicator.params.plotHiddenBullish === true;
        const plotBearish = indicator.params.plotBearish !== false;
        const plotHiddenBearish = indicator.params.plotHiddenBearish === true;
        
        // Label toggles
        const showBullLabel = indicator.params.showBullLabel !== false;
        const showBearLabel = indicator.params.showBearLabel !== false;
        
        // Background and levels
        const showBackground = indicator.params.showBackground !== false;
        const showLevels = indicator.params.showLevels !== false;
        
        // Colors
        const rsiColor = (indicator.params.rsiColor as string) || "#7E57C2";
        const bullColor = (indicator.params.bullColor as string) || "#089981";
        const bearColor = (indicator.params.bearColor as string) || "#F23645";
        
        // Level lines
        const upperLevel = Number(indicator.params.upperLevel) || 70;
        const middleLevel = Number(indicator.params.middleLevel) || 50;
        const lowerLevel = Number(indicator.params.lowerLevel) || 30;
        
        // Compute RSI Divergence
        const result = computeRSIDivergence(
          data, rsiPeriod, source, lbL, lbR, rangeMax, rangeMin,
          plotBullish, plotHiddenBullish, plotBearish, plotHiddenBearish
        );
        
        // Map NaN to WhitespaceData
        const rsiValues = result.rsi.map(p => 
          Number.isFinite(p.value) ? p : { time: p.time }
        );
        
        // Prepare RSI data for overlay coordinate conversion
        const rsiDataForOverlay = result.rsi
          .filter(p => Number.isFinite(p.value))
          .map(p => ({ time: p.time as number, value: p.value }));
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [
            {
              id: "rsi",
              label: `RSI ${rsiPeriod}`,
              pane: "separate",
              color: rsiColor,
              style: "line",
              lineWidth: 1,
              values: rsiValues,
            },
            // Level lines still rendered to establish price scale range
            {
              id: "upperBand",
              label: "",
              pane: "separate",
              color: "transparent",
              style: "line",
              lineWidth: 0,
              values: result.upperBand.map(p => ({ time: p.time, value: upperLevel })),
              isLevelLine: true,
            },
            {
              id: "lowerBand",
              label: "",
              pane: "separate",
              color: "transparent",
              style: "line",
              lineWidth: 0,
              values: result.lowerBand.map(p => ({ time: p.time, value: lowerLevel })),
              isLevelLine: true,
            },
          ],
          _rsiDivData: {
            signals: result.signals,
            pivotHighs: result.pivotHighs.map(p => ({
              index: p.index,
              time: p.time as number,
              rsi: p.rsi,
              price: p.price,
            })),
            pivotLows: result.pivotLows.map(p => ({
              index: p.index,
              time: p.time as number,
              rsi: p.rsi,
              price: p.price,
            })),
            rsiData: rsiDataForOverlay,
            bullColor,
            bearColor,
            showBullish: plotBullish,
            showHiddenBullish: plotHiddenBullish,
            showBearish: plotBearish,
            showHiddenBearish: plotHiddenBearish,
            showBullLabel,
            showBearLabel,
            showBackground,
            showLevels,
            upperLevel,
            middleLevel,
            lowerLevel,
            backgroundFillColor: "rgba(41, 98, 255, 0.1)", // TV-like light blue
            levelColor: "#787B86", // Grey for level lines
          },
        };
      }
      
      case "knoxvilleDivergence": {
        // ============================================================================
        // Knoxville Divergence (Rob Booker) - TradingView Parity
        // 
        // Momentum divergence with RSI OB/OS confirmation.
        // Draws divergence lines connecting the relevant highs/lows, plus markers.
        // ============================================================================
        
        const lookback = Number(indicator.params.lookback) || 150;
        const rsiPeriod = Number(indicator.params.rsiPeriod) || 21;
        const momPeriod = Number(indicator.params.momPeriod) || 20;
        
        // Style settings
        const showBullish = indicator.params.showBullish !== false;
        const showBearish = indicator.params.showBearish !== false;
        const showLines = indicator.params.showLines !== false; // Default: ON
        
        // Colors
        const bullColor = (indicator.params.bullColor as string) || "#26A69A";
        const bearColor = (indicator.params.bearColor as string) || "#F23645";
        
        // Compute Knoxville Divergence
        const result = computeKnoxvilleDivergence(data, lookback, rsiPeriod, momPeriod);
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [], // Lines + markers rendered via overlay
          _knoxvilleData: {
            bullish: result.bullish,
            bearish: result.bearish,
            showBullish,
            showBearish,
            showLines,
            bullColor,
            bearColor,
          },
        };
      }

      // ========================================================================
      // Volume Profile Indicators
      // ========================================================================

      case "vrvp": {
        // ============================================================================
        // Visible Range Volume Profile (VRVP) - TradingView Parity
        // 
        // TV Reference: https://www.tradingview.com/support/solutions/43000703076-visible-range-volume-profile/
        //
        // Displays horizontal histogram of volume distribution for visible chart range.
        // Requires LTF data to be fetched externally and profile computed in ChartViewport.
        // This registry case just passes the style configuration to the overlay.
        // ============================================================================
        
        // Style settings
        const rowsLayout = (indicator.params.rowsLayout as "Number of Rows" | "Ticks Per Row") || "Number of Rows";
        const numRows = Number(indicator.params.numRows) || 24;
        const valueAreaPercent = Number(indicator.params.valueAreaPercent) || 70;
        const volumeMode = (indicator.params.volumeMode as "Up/Down" | "Total" | "Delta") || "Up/Down";
        const placement = (indicator.params.placement as "Left" | "Right") || "Left";
        const widthPercent = Number(indicator.params.widthPercent) || 70;
        
        // Toggles
        const showHistogram = indicator.params.showHistogram !== false;
        const showPOC = indicator.params.showPOC !== false;
        const showVALines = indicator.params.showVALines !== false;
        const showValueArea = indicator.params.showValueArea !== false;
        const extendPOC = indicator.params.extendPOC === true;
        const extendVA = indicator.params.extendVA === true;
        
        // Colors
        const upColor = (indicator.params.upColor as string) || "#26A69A";
        const downColor = (indicator.params.downColor as string) || "#EF5350";
        const pocColor = (indicator.params.pocColor as string) || "#FFEB3B";
        const vaColor = (indicator.params.vaColor as string) || "#2962FF";
        const valueAreaColor = (indicator.params.valueAreaColor as string) || "#2962FF";
        
        // VRVP doesn't produce standard lines - it uses a special overlay
        // The actual profile computation happens in ChartViewport with LTF data
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [], // No standard lines - rendered via VolumeProfileOverlay
          _vrvpData: {
            isVolumeProfile: true as const,
            style: {
              upColor,
              downColor,
              pocColor,
              vaColor,
              valueAreaColor,
              widthPercent,
              placement,
              showHistogram,
              showPOC,
              showVALines,
              showValueArea,
              extendPOC,
              extendVA,
              valueAreaPercent,
              volumeMode,
              numRows,
              rowsLayout,
            },
          },
        };
      }

      case "vpfr":
      case "aavp":
      case "svp":
      case "svphd":
      case "pvp": {
        // ============================================================================
        // Volume Profile Variants (VPFR, AAVP, SVP, SVP HD, PVP)
        // 
        // All VP variants use the same style configuration as VRVP.
        // The actual computation and rendering happens in ChartViewport overlays.
        // ============================================================================
        
        // Style settings (same as VRVP)
        const rowsLayout = (indicator.params.rowsLayout as "Number of Rows" | "Ticks Per Row") || "Number of Rows";
        const numRows = Number(indicator.params.numRows) || 24;
        const valueAreaPercent = Number(indicator.params.valueAreaPercent) || 70;
        const volumeMode = (indicator.params.volumeMode as "Up/Down" | "Total" | "Delta") || "Up/Down";
        const placement = (indicator.params.placement as "Left" | "Right") || "Left";
        const widthPercent = Number(indicator.params.widthPercent) || 70;
        
        // Toggles
        const showHistogram = indicator.params.showHistogram !== false;
        const showPOC = indicator.params.showPOC !== false;
        const showVALines = indicator.params.showVALines !== false;
        const showValueArea = indicator.params.showValueArea !== false;
        const extendPOC = indicator.params.extendPOC === true;
        const extendVA = indicator.params.extendVA === true;
        
        // Colors
        const upColor = (indicator.params.upColor as string) || "#26A69A";
        const downColor = (indicator.params.downColor as string) || "#EF5350";
        const pocColor = (indicator.params.pocColor as string) || "#FFEB3B";
        const vaColor = (indicator.params.vaColor as string) || "#2962FF";
        const valueAreaColor = (indicator.params.valueAreaColor as string) || "#2962FF";
        
        // Variant-specific params (passed through for overlay)
        const variantParams: Record<string, unknown> = {};
        
        // VPFR specific
        if (indicator.kind === "vpfr") {
          variantParams.rangeStart = indicator.params.rangeStart;
          variantParams.rangeEnd = indicator.params.rangeEnd;
          variantParams.extendRight = indicator.params.extendRight === true;
        }
        
        // AAVP specific
        if (indicator.kind === "aavp") {
          variantParams.anchorPeriod = indicator.params.anchorPeriod || "Auto";
          variantParams.length = Number(indicator.params.length) || 100;
        }
        
        // SVP/SVP HD specific
        if (indicator.kind === "svp" || indicator.kind === "svphd") {
          variantParams.sessions = indicator.params.sessions || "All";
          variantParams.customStart = indicator.params.customStart || "09:30";
          variantParams.customEnd = indicator.params.customEnd || "16:00";
          variantParams.timezone = indicator.params.timezone || "Exchange";
        }
        
        // PVP specific
        if (indicator.kind === "pvp") {
          variantParams.periodMultiplier = Number(indicator.params.periodMultiplier) || 1;
          variantParams.periodUnit = indicator.params.periodUnit || "Day";
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [], // No standard lines - rendered via VolumeProfileOverlay
          _vrvpData: {
            isVolumeProfile: true as const,
            variant: indicator.kind,
            style: {
              upColor,
              downColor,
              pocColor,
              vaColor,
              valueAreaColor,
              widthPercent,
              placement,
              showHistogram,
              showPOC,
              showVALines,
              showValueArea,
              extendPOC,
              extendVA,
              valueAreaPercent,
              volumeMode,
              numRows,
              rowsLayout,
            },
            variantParams,
          },
        };
      }

      // ========================================================================
      // Market Breadth Indicators: ADR_B, ADR, ADL
      // ========================================================================

      case "adrb": {
        // ============================================================================
        // Advance/Decline Ratio (Bars) - ADR_B
        // 
        // TradingView doc: https://www.tradingview.com/support/solutions/43000644914-advance-decline-ratio-bars/
        //
        // Counts green (close > open) vs red (close < open) bars in rolling window.
        // ratio = greenCount / redCount; Doji excluded; redCount=0 → NaN
        // ============================================================================
        
        const length = Number(indicator.params.length) || 9;
        
        // Style toggles
        const showLine = indicator.params.showLine !== false;
        const showEquality = indicator.params.showEquality !== false;
        
        // Colors & styles
        const lineColor = (indicator.params.lineColor as string) || TV_COLORS.blue;
        const lineWidth = Number(indicator.params.lineWidth) || 1;
        const lineStyleStr = (indicator.params.lineStyle as string) || "solid";
        const equalityColor = (indicator.params.equalityColor as string) || TV_COLORS.gray;
        const equalityLineStyleStr = (indicator.params.equalityLineStyle as string) || "dashed";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const lineStyle = styleToNum(lineStyleStr);
        const equalityLineStyle = styleToNum(equalityLineStyleStr);
        
        // Compute ADR_B
        const result = computeAdvanceDeclineRatioBars(data, length);
        
        // Build TV-style label: "ADR_B {length}"
        const labelText = `ADR_B ${length}`;
        
        // Convert NaN values to WhitespaceData for clean line breaks
        const mapToWhitespace = (points: { time: any; value: number }[]) =>
          points.map(p => Number.isFinite(p.value) ? p : { time: p.time });
        
        // Build lines array
        const lines: IndicatorLineResult[] = [];
        
        // ADR_B ratio line (blue)
        if (showLine) {
          lines.push({
            id: "adrb",
            label: labelText,
            pane: "separate",
            color: lineColor,
            style: "line",
            lineWidth,
            lineStyle,
            values: mapToWhitespace(result.ratio),
          });
        }
        
        // Equality line at 1 (gray dashed)
        if (showEquality) {
          lines.push({
            id: "equality",
            label: "Equality Line",
            pane: "separate",
            color: equalityColor,
            style: "line",
            lineWidth: 1,
            lineStyle: equalityLineStyle,
            isLevelLine: true, // Exclude from legend
            values: result.equalityLine,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "adr": {
        // ============================================================================
        // Advance/Decline Ratio (Breadth) - ADR
        // 
        // TradingView doc: https://www.tradingview.com/support/solutions/43000589093-advance-decline-ratio/
        //
        // ratio = advances / declines; declines=0 → NaN
        // Uses real breadth data when available, falls back to mock data.
        // ============================================================================
        
        // Style toggles
        const showLine = indicator.params.showLine !== false;
        
        // Colors & styles
        const lineColor = (indicator.params.lineColor as string) || TV_COLORS.blue;
        const lineWidth = Number(indicator.params.lineWidth) || 1;
        const lineStyleStr = (indicator.params.lineStyle as string) || "solid";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const lineStyle = styleToNum(lineStyleStr);
        
        // Try to use real breadth data if available
        let result: ADRBreadthResult;
        if (breadthData && breadthData.size > 0) {
          // Extract breadth data aligned with chart bars
          const advances: number[] = [];
          const declines: number[] = [];
          const times: UTCTimestamp[] = [];
          
          for (const bar of data) {
            const bd = breadthData.get(bar.time);
            if (bd) {
              advances.push(bd.advances);
              declines.push(bd.declines);
              times.push(bar.time as UTCTimestamp);
            }
          }
          
          if (times.length > 0) {
            result = computeAdvanceDeclineRatioBreadth(advances, declines, times);
          } else {
            // No matching breadth data, fall back to mock
            result = computeADRFromChartBars(data);
          }
        } else {
          // No breadth data, fall back to mock
          result = computeADRFromChartBars(data);
        }
        
        // Build TV-style label
        const labelText = "ADR";
        
        const lines: IndicatorLineResult[] = [];
        
        if (showLine) {
          lines.push({
            id: "adr",
            label: labelText,
            pane: "separate",
            color: lineColor,
            style: "line",
            lineWidth,
            lineStyle,
            values: result.ratio,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }

      case "adl": {
        // ============================================================================
        // Advance/Decline Line (Breadth) - ADL
        // 
        // TradingView doc: https://www.tradingview.com/support/solutions/43000589092-advance-decline-line/
        //
        // ADL = cumulative sum of (advances - declines)
        // Uses real breadth data when available, falls back to mock data.
        // ============================================================================
        
        // Style toggles
        const showLine = indicator.params.showLine !== false;
        
        // Colors & styles
        const lineColor = (indicator.params.lineColor as string) || TV_COLORS.blue;
        const lineWidth = Number(indicator.params.lineWidth) || 1;
        const lineStyleStr = (indicator.params.lineStyle as string) || "solid";
        
        // Convert style strings to LWC line style numbers
        const styleToNum = (s: string) => s === "dashed" ? 2 : s === "dotted" ? 3 : 0;
        const lineStyle = styleToNum(lineStyleStr);
        
        // Try to use real breadth data if available
        let result: ADLBreadthResult;
        if (breadthData && breadthData.size > 0) {
          // Extract breadth data aligned with chart bars
          const advances: number[] = [];
          const declines: number[] = [];
          const times: UTCTimestamp[] = [];
          
          for (const bar of data) {
            const bd = breadthData.get(bar.time);
            if (bd) {
              advances.push(bd.advances);
              declines.push(bd.declines);
              times.push(bar.time as UTCTimestamp);
            }
          }
          
          if (times.length > 0) {
            // Use ADL seed for cumulative parity
            result = computeAdvanceDeclineLineBreadth(advances, declines, times, adlSeed || 0);
          } else {
            // No matching breadth data, fall back to mock
            result = computeADLFromChartBars(data);
          }
        } else {
          // No breadth data, fall back to mock
          result = computeADLFromChartBars(data);
        }
        
        // Build TV-style label
        const labelText = "ADL";
        
        const lines: IndicatorLineResult[] = [];
        
        if (showLine) {
          lines.push({
            id: "adl",
            label: labelText,
            pane: "separate",
            color: lineColor,
            style: "line",
            lineWidth,
            lineStyle,
            values: result.adl,
          });
        }
        
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines,
        };
      }
      
      default:
        return {
          id: indicator.id,
          kind: indicator.kind,
          lines: [],
          error: `Unknown indicator kind: ${indicator.kind}`,
        };
    }
  } catch (error) {
    return {
      id: indicator.id,
      kind: indicator.kind,
      lines: [],
      error: error instanceof Error ? error.message : "Compute failed",
    };
  }
}

// ============================================================================
// Color Helpers
// ============================================================================

function lightenColor(hex: string, amount: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const amt = Math.max(0, Math.min(1, amount));
  const num = Number.parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const lerp = (channel: number) => Math.round(channel + (255 - channel) * amt);
  return `rgb(${lerp(r)}, ${lerp(g)}, ${lerp(b)})`;
}

// ============================================================================
// Default Params Helper
// ============================================================================

export function getDefaultParams(kind: IndicatorKind): Record<string, number | string> {
  const manifest = getIndicatorManifest(kind);
  if (!manifest) {
    // Fallback for legacy kinds
    switch (kind) {
      case "sma": return { length: 9, source: "close", offset: 0, smoothingType: "none", smoothingLength: 14, bbStdDev: 2 };
      case "ema": return { length: 9, source: "close", offset: 0, smoothingType: "none", smoothingLength: 14, bbStdDev: 2 };
      case "smma": return { period: 14, source: "close" };
      case "wma": return { period: 20, source: "close" };
      case "dema": return { period: 20, source: "close" };
      case "tema": return { period: 20, source: "close" };
      case "hma": return { period: 20, source: "close" };
      case "kama": return { period: 10, fast: 2, slow: 30, source: "close" };
      case "vwma": return { period: 20, source: "close" };
      case "mcginley": return { period: 14, source: "close" };
      case "alma": return { period: 9, offset: 0.85, sigma: 6, source: "close" };
      case "lsma": return { length: 25, offset: 0, source: "close" };
      case "rsi": return { period: 14 };
      case "macd": return { fast: 12, slow: 26, signal: 9 };
      case "ao": return { showAO: true, growingColor: "#089981", fallingColor: "#F23645", showZeroLine: true };
      case "bb": return { period: 20, stdDev: 2, source: "close" };
      case "atr": return { length: 14, smoothing: "rma" };
      case "dc": return { 
        length: 20, 
        offset: 0,
        showBasis: true,
        showUpper: true,
        showLower: true,
        showBackground: true,
        basisColor: "#FF6D00",
        upperColor: "#2962FF",
        lowerColor: "#2962FF",
        backgroundColor: "rgba(41, 98, 255, 0.1)",
        basisLineWidth: 1,
        upperLineWidth: 1,
        lowerLineWidth: 1,
        labelsOnPriceScale: true,
        valuesInStatusLine: true,
        inputsInStatusLine: true,
      };
      case "kc": return {
        length: 20,
        multiplier: 2,
        source: "close",
        useExp: true,
        bandsStyle: "atr",
        atrLength: 10,
        showUpper: true,
        showBasis: true,
        showLower: true,
        showBackground: true,
        upperColor: "#2962FF",
        basisColor: "#2962FF",
        lowerColor: "#2962FF",
        backgroundColor: "rgba(33, 150, 243, 0.05)",
        upperLineWidth: 1,
        basisLineWidth: 1,
        lowerLineWidth: 1,
        upperLineStyle: "solid",
        basisLineStyle: "solid",
        lowerLineStyle: "solid",
        labelsOnPriceScale: true,
        valuesInStatusLine: true,
        inputsInStatusLine: true,
      };
      case "vstop": return {
        length: 20,
        source: "close",
        multiplier: 2,
        plotStyle: "cross",
        uptrendColor: "#089981",
        downtrendColor: "#F23645",
        lineWidth: 1,
        priceLineVisible: false,
        labelsOnPriceScale: true,
        valuesInStatusLine: true,
        inputsInStatusLine: true,
      };
      case "chop": return {
        length: 14,
        offset: 0,
        timeframe: "chart",
        waitForClose: true,
        showChop: true,
        chopColor: TV_COLORS.blue,
        chopLineWidth: 1,
        chopLineStyle: "solid",
        showUpperBand: true,
        upperBandValue: 61.8,
        upperBandColor: TV_COLORS.gray,
        upperBandLineStyle: "dashed",
        showMiddleBand: true,
        middleBandValue: 50,
        middleBandColor: TV_COLORS.gray,
        middleBandLineStyle: "dotted",
        showLowerBand: true,
        lowerBandValue: 38.2,
        lowerBandColor: TV_COLORS.gray,
        lowerBandLineStyle: "dashed",
        showBackground: true,
        backgroundFillColor: TV_COLORS.blue,
        backgroundFillOpacity: 0.1,
        labelsOnPriceScale: true,
        valuesInStatusLine: true,
        inputsInStatusLine: true,
      };
      case "hv": return {
        length: 10,
        timeframe: "chart",
        waitForClose: true,
        showHV: true,
        hvColor: TV_COLORS.blue,
        hvLineWidth: 1,
        hvLineStyle: "solid",
        labelsOnPriceScale: true,
        valuesInStatusLine: true,
        inputsInStatusLine: true,
      };
      case "bbw": return {
        length: 20,
        source: "close",
        stdDev: 2.0,
        highestExpansionLength: 125,
        lowestContractionLength: 125,
        timeframe: "chart",
        waitForClose: true,
        showBbw: true,
        bbwColor: TV_COLORS.blue,
        bbwLineWidth: 1,
        bbwLineStyle: "solid",
        showHighestExpansion: true,
        highestExpansionColor: TV_COLORS.red,
        highestExpansionLineWidth: 1,
        highestExpansionLineStyle: "solid",
        showLowestContraction: true,
        lowestContractionColor: "#26A69A",
        lowestContractionLineWidth: 1,
        lowestContractionLineStyle: "solid",
        labelsOnPriceScale: true,
        valuesInStatusLine: true,
        inputsInStatusLine: true,
      };
      case "bbtrend": return {
        shortLength: 20,
        longLength: 50,
        stdDev: 2.0,
        timeframe: "chart",
        waitForClose: true,
        showBbtrend: true,
        bbtrendPlotStyle: "histogram",
        color0: "#26A69A", // Positive, growing (dark green)
        color1: "#B2DFDB", // Positive, falling (light green)
        color2: "#FF5252", // Negative, falling (dark red)
        color3: "#FFCDD2", // Negative, rising (light red)
        bbtrendLineWidth: 1,
        showZeroLine: true,
        zeroLineColor: "#787B86",
        zeroLineStyle: "dashed",
        zeroLineValue: 0,
        labelsOnPriceScale: true,
        valuesInStatusLine: true,
        inputsInStatusLine: true,
      };
      case "ulcer": return {
        source: "close",
        length: 14,
        timeframe: "chart",
        waitForClose: true,
        showUlcer: true,
        ulcerColor: "#2962FF",
        ulcerLineWidth: 1,
        ulcerLineStyle: "solid",
        showZero: true,
        zeroColor: "#787B86",
        zeroLineStyle: "dashed",
        zeroValue: 0,
        showBackground: true,
        backgroundFillColor: "#2962FF",
        backgroundFillOpacity: 0.1,
        labelsOnPriceScale: true,
        valuesInStatusLine: true,
        inputsInStatusLine: true,
      };
      case "adx": return { period: 14, smoothing: 14 };
      case "vwap": return { 
        hideOn1DOrAbove: false,  // IMPORTANT: Default OFF so VWAP shows on daily charts
        anchorPeriod: "session",
        source: "hlc3",
        offset: 0,
        bandsMode: "stdev",
        band1Enabled: true,
        bandMultiplier1: 1.0,
        band2Enabled: true,
        bandMultiplier2: 2.0,
        band3Enabled: true,
        bandMultiplier3: 3.0,
        showVwap: true,
        vwapColor: "#2962FF",
        vwapLineWidth: 1,
        showBand1: true,
        band1Color: "#4CAF50",
        showBand2: true,
        band2Color: "#808000",
        showBand3: true,
        band3Color: "#00897B",
        showFill1: true,
        fill1Color: "#4CAF50",
        fill1Opacity: 0.1,
        showFill2: true,
        fill2Color: "#808000",
        fill2Opacity: 0.1,
        showFill3: true,
        fill3Color: "#00897B",
        fill3Opacity: 0.1,
      };
      case "obv": return {
        // Smoothing
        smoothingType: "none",
        smoothingLength: 14,
        bbStdDev: 2,
        // Calculation (no-op, TV-parity)
        timeframe: "chart",
        waitForClose: true,
        // Style: OBV line
        showObv: true,
        obvColor: TV_COLORS.blue,
        obvLineWidth: 1,
        obvLineStyle: "solid",
        obvPlotStyle: "line",
        obvPriceLine: true,
        // Style: Smoothing line
        showSmoothing: true,
        smoothingColor: TV_COLORS.orange,
        smoothingLineWidth: 1,
        smoothingLineStyle: "solid",
        // Style: BB lines
        showBBUpper: true,
        showBBLower: true,
        bbColor: TV_COLORS.blue,
        bbLineWidth: 1,
        bbLineStyle: "solid",
        showBBFill: true,
        bbFillColor: TV_COLORS.blue,
        bbFillOpacity: 0.1,
      };
      case "mfi": return {
        length: 14,
        timeframe: "chart",
        waitForClose: true,
        showMF: true,
        mfColor: TV_COLORS.purpleTv,
        mfLineWidth: 1,
        mfLineStyle: "solid",
        showOverbought: true,
        overboughtValue: 80,
        overboughtColor: TV_COLORS.gray,
        overboughtLineStyle: "dashed",
        showMiddleBand: true,
        middleBandValue: 50,
        middleBandColor: TV_COLORS.gray,
        middleBandLineStyle: "dotted",
        showOversold: true,
        oversoldValue: 20,
        oversoldColor: TV_COLORS.gray,
        oversoldLineStyle: "dashed",
        showBackground: true,
        backgroundFillColor: TV_COLORS.purpleTv,
        backgroundFillOpacity: 0.1,
      };
      // Batch 2: Momentum fallbacks
      case "stoch": return { 
        kLength: 14, 
        kSmoothing: 1, 
        dSmoothing: 3,
        showK: true,
        kColor: TV_COLORS.blue,
        kLineWidth: 1,
        kLineStyle: "solid",
        showD: true,
        dColor: TV_COLORS.orange,
        dLineWidth: 1,
        dLineStyle: "solid",
        showUpperBand: true,
        upperBandValue: 80,
        upperBandColor: TV_COLORS.gray,
        upperBandLineStyle: "dashed",
        showMiddleBand: true,
        middleBandValue: 50,
        middleBandColor: TV_COLORS.gray,
        middleBandLineStyle: "dotted",
        showLowerBand: true,
        lowerBandValue: 20,
        lowerBandColor: TV_COLORS.gray,
        lowerBandLineStyle: "dashed",
        showBackground: true,
        backgroundFillColor: TV_COLORS.blue,
        backgroundFillOpacity: 0.1,
      };
      case "stochrsi": return { 
        k: 3, 
        d: 3, 
        rsiLength: 14, 
        stochasticLength: 14, 
        source: "close",
        showK: true,
        kColor: TV_COLORS.blue,
        showD: true,
        dColor: TV_COLORS.orange,
        showUpperBand: true,
        upperBandValue: 80,
        upperBandColor: TV_COLORS.gray,
        showMiddleBand: true,
        middleBandValue: 50,
        middleBandColor: TV_COLORS.gray,
        showLowerBand: true,
        lowerBandValue: 20,
        lowerBandColor: TV_COLORS.gray,
        showBackground: true,
        backgroundFillColor: TV_COLORS.blue,
        backgroundFillOpacity: 0.1,
      };
      case "cci": return { length: 20, source: "hlc3", smoothingType: "none", smoothingLength: 14, bbStdDev: 2 };
      case "roc": return { length: 9, source: "close", showZeroLine: true };
      case "mom": return { period: 10, source: "close" };
      case "willr": return { 
        length: 14, 
        source: "hlcc4", 
        upperBand: -20, 
        lowerBand: -80,
        showBackgroundFill: true,
        showOverboughtFill: true,
        showOversoldFill: true,
      };
      case "fisher": return {
        length: 9,
        showLevel1_5: true,
        level1_5Value: 1.5,
        showLevel0_75: true,
        level0_75Value: 0.75,
        showLevel0: true,
        level0Value: 0,
        showLevelNeg0_75: true,
        levelNeg0_75Value: -0.75,
        showLevelNeg1_5: true,
        levelNeg1_5Value: -1.5,
      };
      case "trix": return {
        length: 18,
        showTrix: true,
        trixColor: TV_COLORS.red,
        trixLineWidth: 1,
        trixLineStyle: "solid",
        showZero: true,
        zeroValue: 0,
        zeroColor: TV_COLORS.gray,
        zeroLineStyle: "dashed",
      };
      case "tsi": return {
        longLength: 25,
        shortLength: 13,
        signalLength: 13,
        showTsi: true,
        tsiColor: TV_COLORS.blue,
        tsiLineWidth: 1,
        tsiLineStyle: "solid",
        showSignal: true,
        signalColor: TV_COLORS.red,
        signalLineWidth: 1,
        signalLineStyle: "solid",
        showZero: true,
        zeroValue: 0,
        zeroColor: TV_COLORS.gray,
        zeroLineStyle: "dashed",
      };
      case "smii": return {
        longLength: 20,
        shortLength: 5,
        signalLength: 5,
        showSmi: true,
        smiColor: TV_COLORS.blue,
        smiLineWidth: 1,
        smiLineStyle: "solid",
        showSignal: true,
        signalColor: TV_COLORS.orange,
        signalLineWidth: 1,
        signalLineStyle: "solid",
      };
      case "smio": return {
        longLength: 20,
        shortLength: 5,
        signalLength: 5,
        showOscillator: true,
        oscillatorColor: TV_COLORS.red,
        oscillatorPlotStyle: "histogram",
        oscillatorLineWidth: 1,
      };
      case "coppock": return {
        wmaLength: 10,
        longRocLength: 14,
        shortRocLength: 11,
        showCoppock: true,
        coppockColor: TV_COLORS.blue,
        coppockPlotStyle: "line",
        coppockLineWidth: 1,
      };
      case "cmo": return {
        length: 9,
        source: "close",
        showCmo: true,
        cmoColor: TV_COLORS.blue,
        cmoPlotStyle: "line",
        cmoLineWidth: 1,
        showZero: true,
        zeroLevel: 0,
        zeroColor: TV_COLORS.gray,
        zeroLineWidth: 1,
        zeroLineStyle: "dashed",
      };
      case "uo": return {
        fastLength: 7,
        middleLength: 14,
        slowLength: 28,
        showUo: true,
        uoColor: TV_COLORS.red,
        uoPlotStyle: "line",
        uoLineWidth: 1,
        uoLineStyle: "solid",
        showPriceLine: false,
      };
      case "cmf": return {
        length: 20,
        showCmf: true,
        cmfColor: TV_COLORS.green,
        cmfLineWidth: 1,
        cmfLineStyle: "solid",
        showZero: true,
        zeroValue: 0,
        zeroColor: TV_COLORS.gray,
        zeroLineStyle: "dashed",
      };
      case "sar": return { start: 0.02, increment: 0.02, maxValue: 0.2, plotStyle: "circles", priceLine: false };
      default: return {};
    }
  }
  const result: Record<string, number | string> = {};
  for (const input of manifest.inputs) {
    result[input.key] = input.default;
  }
  return result;
}

export function getDefaultColor(kind: IndicatorKind): string {
  const manifest = getIndicatorManifest(kind);
  if (manifest && manifest.outputs.length > 0) {
    return manifest.outputs[0].defaultColor;
  }
  return TV_COLORS.blue;
}

export function getDefaultPane(kind: IndicatorKind): IndicatorPane {
  const manifest = getIndicatorManifest(kind);
  return manifest?.panePolicy === "overlay" ? "price" : "separate";
}

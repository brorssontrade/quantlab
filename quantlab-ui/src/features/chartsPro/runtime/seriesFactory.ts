/**
 * seriesFactory.ts
 *
 * Sprint TV-3 Steg 1C: Chart Type Switcher
 *
 * Factory for creating/removing LightweightCharts series based on chartType.
 * Supports: bars, candles, hollowCandles, line, area, baseline, columns, heikinAshi, renko
 *
 * Architecture:
 * - Maps chartType → series constructor (addBarSeries, addCandlestickSeries, etc.)
 * - Provides type-safe config for each series type
 * - Handles series lifecycle: create, update, remove
 */

import type { IChartApi, ISeriesApi } from '@/lib/lightweightCharts';

/**
 * Full set of chart types supported by seriesFactory
 */
export type ChartType =
  | 'bars'
  | 'candles'
  | 'hollowCandles'
  | 'line'
  | 'lineWithMarkers'
  | 'stepLine'
  | 'area'
  | 'baseline'
  | 'columns'
  | 'heikinAshi'
  | 'renko';

/**
 * TV-21.4a: UI-exposed chart types (subset of ChartType)
 * Single source of truth for ChartTypeSelector and ChartViewport
 */
export type UIChartType = 
  | 'candles' 
  | 'bars' 
  | 'hollowCandles' 
  | 'line' 
  | 'area' 
  | 'heikinAshi' 
  | 'renko';

/** Type guard to check if a ChartType is a valid UIChartType */
export function isUIChartType(type: string): type is UIChartType {
  return ['candles', 'bars', 'hollowCandles', 'line', 'area', 'heikinAshi', 'renko'].includes(type);
}

export type BaseSeriesApi =
  | ISeriesApi<'Bar'>
  | ISeriesApi<'Candlestick'>
  | ISeriesApi<'Line'>
  | ISeriesApi<'Area'>
  | ISeriesApi<'Baseline'>
  | ISeriesApi<'Histogram'>;

export interface SeriesConfig {
  upColor: string;
  downColor: string;
  borderUpColor?: string;
  borderDownColor?: string;
  wickUpColor?: string;
  wickDownColor?: string;
}

/**
 * Create a new base series based on chartType
 */
export function createBaseSeries(
  chart: IChartApi,
  chartType: ChartType,
  config: SeriesConfig
): BaseSeriesApi | null {
  try {
    switch (chartType) {
      case 'bars': {
        return chart.addBarSeries({
          upColor: config.upColor,
          downColor: config.downColor,
          thinBars: false,
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor, // Line color matches up candle
        }) as BaseSeriesApi;
      }

      case 'candles': {
        return chart.addCandlestickSeries({
          upColor: config.upColor,
          downColor: config.downColor,
          borderUpColor: config.borderUpColor ?? config.upColor,
          borderDownColor: config.borderDownColor ?? config.downColor,
          wickUpColor: config.wickUpColor ?? config.upColor,
          wickDownColor: config.wickDownColor ?? config.downColor,
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor, // Line color matches up candle
        }) as BaseSeriesApi;
      }

      case 'hollowCandles': {
        return chart.addCandlestickSeries({
          upColor: 'transparent',
          downColor: config.downColor,
          borderUpColor: config.upColor,
          borderDownColor: config.downColor,
          wickUpColor: config.upColor,
          wickDownColor: config.downColor,
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor, // Line color matches up candle
        }) as BaseSeriesApi;
      }

      case 'line': {
        return chart.addLineSeries({
          color: config.upColor,
          lineWidth: 2,
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor,
        }) as BaseSeriesApi;
      }

      case 'lineWithMarkers': {
        return chart.addLineSeries({
          color: config.upColor,
          lineWidth: 2,
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor,
        }) as BaseSeriesApi;
      }

      case 'stepLine': {
        return chart.addLineSeries({
          color: config.upColor,
          lineWidth: 2,
          lineType: 1, // LineType.WithSteps (1 = steps)
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor,
        }) as BaseSeriesApi;
      }

      case 'area': {
        return chart.addAreaSeries({
          topColor: config.upColor,
          bottomColor: 'rgba(41, 98, 255, 0.05)',
          lineColor: config.upColor,
          lineWidth: 2,
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor,
        }) as BaseSeriesApi;
      }

      case 'baseline': {
        return chart.addBaselineSeries({
          topLineColor: config.upColor,
          topFillColor1: config.upColor + '80',
          topFillColor2: config.upColor + '20',
          bottomLineColor: config.downColor,
          bottomFillColor1: config.downColor + '80',
          bottomFillColor2: config.downColor + '20',
          baseValue: { type: 'price', price: 0 },
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor,
        }) as BaseSeriesApi;
      }

      case 'columns': {
        return chart.addHistogramSeries({
          color: config.upColor,
          priceFormat: {
            type: 'price',
          },
          priceScaleId: 'right',
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor,
        }) as BaseSeriesApi;
      }

      case 'heikinAshi': {
        return chart.addCandlestickSeries({
          upColor: config.upColor,
          downColor: config.downColor,
          borderUpColor: config.borderUpColor ?? config.upColor,
          borderDownColor: config.borderDownColor ?? config.downColor,
          wickUpColor: config.wickUpColor ?? config.upColor,
          wickDownColor: config.wickDownColor ?? config.downColor,
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor, // Line color matches up candle
        }) as BaseSeriesApi;
      }

      case 'renko': {
        // TV-21.4: Renko uses candlestick series for brick rendering
        // Data transformation happens in ChartViewport before setData
        return chart.addCandlestickSeries({
          upColor: config.upColor,
          downColor: config.downColor,
          borderUpColor: config.borderUpColor ?? config.upColor,
          borderDownColor: config.borderDownColor ?? config.downColor,
          wickUpColor: config.wickUpColor ?? config.upColor,
          wickDownColor: config.wickDownColor ?? config.downColor,
          // TV-42: LWC handles last price label + line for TV-parity
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: config.upColor, // Line color matches up candle
        }) as BaseSeriesApi;
      }

      default:
        console.warn(`[seriesFactory] Unknown chartType: ${chartType}`);
        return null;
    }
  } catch (error) {
    console.error(`[seriesFactory] Error creating series for ${chartType}:`, error);
    return null;
  }
}

/**
 * Remove a series from the chart
 */
export function removeBaseSeries(chart: IChartApi, series: BaseSeriesApi): void {
  try {
    chart.removeSeries(series);
  } catch (error) {
    console.error('[seriesFactory] Error removing series:', error);
  }
}

/**
 * Get series type string for dump()
 */
export function getSeriesTypeString(chartType: ChartType): string {
  const typeMap: Record<ChartType, string> = {
    bars: 'Bar',
    candles: 'Candlestick',
    hollowCandles: 'Hollow Candlestick',
    lineWithMarkers: 'Line (Markers)',
    stepLine: 'Step Line',
    line: 'Line',
    area: 'Area',
    baseline: 'Baseline',
    columns: 'Histogram',
    heikinAshi: 'Heikin Ashi',
  };
  return typeMap[chartType] ?? 'Unknown';
}

/**
 * Check if chartType is valid
 */
export function isValidChartType(type: string): type is ChartType {
  return [
    'bars',
    'candles',
    'hollowCandles',
    'line',
    'lineWithMarkers',
    'stepLine',
    'area',
    'baseline',
    'columns',
    'heikinAshi',
  ].includes(type);
}

/**
 * Get default chartType
 */
export function getDefaultChartType(): ChartType {
  return 'candles';
}

/**
 * Load chartType from localStorage
 */
export function loadChartType(): ChartType {
  try {
    const stored = localStorage.getItem('chartspro:chartType');
    if (stored && isValidChartType(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return getDefaultChartType();
}

/**
 * Save chartType to localStorage
 */
export function saveChartType(chartType: ChartType): void {
  try {
    localStorage.setItem('chartspro:chartType', chartType);
  } catch {
    // ignore
  }
}

/**
 * seriesFactory.ts
 *
 * Sprint TV-3 Steg 1C: Chart Type Switcher
 *
 * Factory for creating/removing LightweightCharts series based on chartType.
 * Supports: bars, candles, hollowCandles, line, area, baseline, columns
 *
 * Architecture:
 * - Maps chartType → series constructor (addBarSeries, addCandlestickSeries, etc.)
 * - Provides type-safe config for each series type
 * - Handles series lifecycle: create, update, remove
 */

import type { IChartApi, ISeriesApi } from '@/lib/lightweightCharts';

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
  | 'heikinAshi';

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
        }) as BaseSeriesApi;
      }

      case 'line': {
        return chart.addLineSeries({
          color: config.upColor,
          lineWidth: 2,
        }) as BaseSeriesApi;
      }

      case 'lineWithMarkers': {
        return chart.addLineSeries({
          color: config.upColor,
          lineWidth: 2,
        }) as BaseSeriesApi;
      }

      case 'stepLine': {
        return chart.addLineSeries({
          color: config.upColor,
          lineWidth: 2,
          lineType: 1, // LineType.WithSteps (1 = steps)
        }) as BaseSeriesApi;
      }

      case 'area': {
        return chart.addAreaSeries({
          topColor: config.upColor,
          bottomColor: 'rgba(41, 98, 255, 0.05)',
          lineColor: config.upColor,
          lineWidth: 2,
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
        }) as BaseSeriesApi;
      }

      case 'columns': {
        return chart.addHistogramSeries({
          color: config.upColor,
          priceFormat: {
            type: 'price',
          },
          priceScaleId: 'right',
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

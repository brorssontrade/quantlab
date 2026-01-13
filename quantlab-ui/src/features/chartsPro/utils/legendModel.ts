/**
 * legendModel.ts - Legend state management, id-mapping, and persistence helpers.
 * Used by LegendOverlay and ChartViewport for deterministic legend interactions.
 */

import { encodeId, decodeCompareId } from '../state/compare';

/**
 * Compute legend row ID from symbol (base or compare).
 * Format: "base" | "compare-ENCODED_SYMBOL"
 */
export const getLegendRowId = (symbol: string, isBase: boolean = false): string => {
  if (isBase) return 'base';
  return `compare-${encodeId(symbol)}`;
};

/**
 * Extract symbol from legend row ID.
 * Handles "base" and "compare-*" formats.
 */
export const getSymbolFromLegendRowId = (
  id: string,
  compareSymbols: string[] = []
): string | null => {
  if (id === 'base') return 'base';
  if (id.startsWith('compare-')) {
    const sym = decodeCompareId(id, compareSymbols);
    return sym ?? null;
  }
  return null;
};

/**
 * Persist legend visibility state to localStorage.
 */
export const persistLegendVisibility = (visibility: Record<string, boolean>) => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('chartspro.legendVisibility', JSON.stringify(visibility));
    }
  } catch {
    // ignore quota errors
  }
};

/**
 * Load legend visibility state from localStorage.
 */
export const loadLegendVisibility = (): Record<string, boolean> => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      const stored = window.localStorage.getItem('chartspro.legendVisibility');
      return stored ? JSON.parse(stored) : {};
    }
  } catch {
    // ignore
  }
  return {};
};

/**
 * Persist series styles to localStorage.
 */
export const persistSeriesStyles = (
  styles: Record<string, { colorHint?: string; width?: number; lineStyle?: string }>
) => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('chartspro.seriesStyles', JSON.stringify(styles));
    }
  } catch {
    // ignore quota errors
  }
};

/**
 * Load series styles from localStorage.
 */
export const loadSeriesStyles = (): Record<
  string,
  { colorHint?: string; width?: number; lineStyle?: string }
> => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      const stored = window.localStorage.getItem('chartspro.seriesStyles');
      return stored ? JSON.parse(stored) : {};
    }
  } catch {
    // ignore
  }
  return {};
};

/**
 * Convert hex color to rgba string with given alpha (0–1).
 */
export const hexToRgba = (hex: string, alpha: number): string => {
  try {
    const h = hex.replace('#', '');
    const fullHex = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const bigint = parseInt(fullHex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch {
    return hex;
  }
};

/**
 * Apply dimming to a color by reducing its alpha without muddying the hue.
 * Used in legend hover state to dim non-hovered series.
 * @param hex color in hex format (#RRGGBB)
 * @param alpha target alpha (0-1, where 0.35 is "subtle dim")
 * @returns rgba string
 */
export const applyDimColor = (hex: string, alpha: number = 0.35): string => {
  return hexToRgba(hex, alpha);
};

export interface LegendRowData {
  id: string; // "base" | "compare-xxx"
  symbol: string; // "BASE" | "AAPL" etc
  isBase: boolean;
  visible: boolean;
  lastValue: string | null; // "1234.56" or "+2.34%"
  colorHint: string; // "#888888"
  orderIndex: number;
  status?: 'idle' | 'loading' | 'ready' | 'error'; // compare status
  statusError?: string; // error message if status === 'error'
}

export interface LegendRowState {
  hoverId: string | null;
  soloId: string | null;
  visibility: Record<string, boolean>; // id -> bool
  soloStateRef: Record<string, boolean> | null; // backup for restore
}

/**
 * Persist legend row order to localStorage.
 * @param order array of legend row IDs in visual order
 */
export const persistLegendOrder = (order: string[]) => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('chartspro.legendOrder', JSON.stringify(order));
    }
  } catch {
    // ignore quota errors
  }
};

/**
 * Load legend row order from localStorage.
 * @returns array of legend row IDs or empty array if not stored
 */
export const loadLegendOrder = (): string[] => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      const stored = window.localStorage.getItem('chartspro.legendOrder');
      return stored ? JSON.parse(stored) : [];
    }
  } catch {
    // ignore
  }
  return [];
};

/**
 * Persist series placement (pane + scale) to localStorage.
 * @param placement Record mapping series ID to { pane, scale, paneId? }
 */
export const persistSeriesPlacement = (
  placement: Record<string, { pane?: 'main' | 'own'; scale?: 'left' | 'right'; paneId?: string }>
) => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('chartspro.seriesPlacement', JSON.stringify(placement));
    }
  } catch {
    // ignore quota errors
  }
};

/**
 * Load series placement from localStorage.
 */
export const loadSeriesPlacement = (): Record<
  string,
  { pane?: 'main' | 'own'; scale?: 'left' | 'right'; paneId?: string }
> => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      const stored = window.localStorage.getItem('chartspro.seriesPlacement');
      return stored ? JSON.parse(stored) : {};
    }
  } catch {
    // ignore
  }
  return {};
};


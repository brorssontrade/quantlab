/**
 * legendRuntime.ts
 *
 * Legend state management and interactions.
 * Exports:
 * - buildLegendRows: Constructs legend row models from base + compares
 * - applyLegendInteraction: Handles hover/solo/visibility/reorder
 * - computeLegendDimming: Determines which series should be dimmed based on hover/solo state
 *
 * QA Primitives:
 * - window.__lwcharts._qaLegendHover(id)
 * - window.__lwcharts._qaLegendToggle(id)
 * - window.__lwcharts._qaLegendSolo(id)
 * - window.__lwcharts._qaLegendReorder(fromId, toIndex)
 */

export interface LegendRowModel {
  id: string;
  symbol: string;
  isBase: boolean;
  visible: boolean;
  lastValue: number | null;
  colorHint: string;
  orderIndex: number;
}

export interface LegendDimmingDecision {
  id: string;
  isDimmed: boolean;
  alpha?: number;
}

/**
 * Builds legend row models from base symbol and compare items.
 * Respects visibility state and assigns order indices.
 */
export const buildLegendRows = (
  baseSymbol: string | null,
  baseColor: string,
  compareItems: Array<{ symbol: string; hidden?: boolean; color?: string }>,
  visibilityMap: Record<string, boolean>,
  orderMap: string[],
): LegendRowModel[] => {
  const rows: LegendRowModel[] = [];

  // Base series always first if exists
  if (baseSymbol) {
    const id = `base:${baseSymbol}`;
    rows.push({
      id,
      symbol: baseSymbol,
      isBase: true,
      visible: visibilityMap[id] !== false, // default visible
      lastValue: null, // populated elsewhere
      colorHint: baseColor,
      orderIndex: 0,
    });
  }

  // Compare series
  const compareOrder = orderMap.filter((id) => !id.startsWith("base:"));
  compareOrder.forEach((id, idx) => {
    const compare = compareItems.find((c) => {
      const compareId = `compare:${c.symbol}`;
      return compareId === id;
    });
    if (compare) {
      rows.push({
        id,
        symbol: compare.symbol,
        isBase: false,
        visible: !compare.hidden && visibilityMap[id] !== false,
        lastValue: null, // populated elsewhere
        colorHint: compare.color ?? "#888",
        orderIndex: rows.length,
      });
    }
  });

  return rows;
};

/**
 * Determines which series should be dimmed based on hover/solo state.
 * Solo mode: dim everything except soloId
 * Hover mode: dim everything except hoverId
 * Neither: nothing dimmed
 */
export const computeLegendDimming = (
  rows: LegendRowModel[],
  hoverId: string | null,
  soloId: string | null,
): LegendDimmingDecision[] => {
  const decisions: LegendDimmingDecision[] = [];

  // If solo is active, dim everything except solo
  if (soloId) {
    decisions.push(
      ...rows.map((row) => ({
        id: row.id,
        isDimmed: row.id !== soloId,
        alpha: row.id === soloId ? 1 : 0.4,
      })),
    );
  }
  // If hovering, dim everything except hovered
  else if (hoverId) {
    decisions.push(
      ...rows.map((row) => ({
        id: row.id,
        isDimmed: row.id !== hoverId,
        alpha: row.id === hoverId ? 1 : 0.4,
      })),
    );
  }
  // Nothing dimmed
  else {
    decisions.push(...rows.map((row) => ({ id: row.id, isDimmed: false, alpha: 1 })));
  }

  return decisions;
};

/**
 * Reorder legend rows by moving fromId to a new position.
 * Reassigns orderIndex to all rows to maintain sequence.
 * @param rows Current legend rows
 * @param fromId ID of row to move
 * @param toIndex Target position (0-based)
 * @returns New sorted rows with updated orderIndex
 */
export const reorderLegendRows = (
  rows: LegendRowModel[],
  fromId: string,
  toIndex: number,
): LegendRowModel[] => {
  const fromIndex = rows.findIndex((r) => r.id === fromId);
  if (fromIndex === -1 || toIndex < 0 || toIndex >= rows.length) {
    return rows; // Invalid reorder, return unchanged
  }

  const newRows = [...rows];
  const [movedRow] = newRows.splice(fromIndex, 1);
  newRows.splice(toIndex, 0, movedRow);

  // Reassign orderIndex to all rows
  return newRows.map((row, idx) => ({
    ...row,
    orderIndex: idx,
  }));
};

/**
 * QA instrumentation helpers
 */
export const setQaLegendHover = (id: string | null) => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaLegendHoverId = id;
};

export const setQaLegendSolo = (id: string | null) => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaLegendSoloId = id;
};

export const setQaLegendToggle = (id: string) => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaLegendLastToggle = id;
};

export const setQaLegendReorder = (fromId: string, toIndex: number) => {
  if (typeof window === "undefined") return;
  (window as any).__lwcharts = (window as any).__lwcharts || {};
  (window as any).__lwcharts._qaLegendLastReorder = { fromId, toIndex };
};

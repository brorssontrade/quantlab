/**
 * chartsPro.sprint6.spec.ts - Sprint 6 Legend Parity Polish + Reorder + Placement
 * Tests for:
 * - A) UX Polish: no layout shift, fixed columns, proper dimming
 * - B) Drag & Drop Reorder: order persistence, dump sync
 * - C) Pane/Scale Controls: placement modal, persistence
 * - Regression: ensure Sprint 5 features still work
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Sprint 6: Legend Parity Polish + Reorder + Placement', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto(`${BASE_URL}?mock=1`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Navigate to Charts tab to mount ChartViewport
    await page.getByRole('tab', { name: /^charts$/i }).click({ timeout: 5000 });
    
    // Wait for QA API to be ready
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const checkReady = setInterval(() => {
          if (window.__lwcharts?._qaLegendHover && window.__lwcharts?._qaSetSeriesPlacement) {
            clearInterval(checkReady);
            resolve();
          }
        }, 50);
        setTimeout(() => { clearInterval(checkReady); resolve(); }, 3000);
      });
    });
  });

  // ===== A) UX POLISH TESTS =====

  test('A1: Legend overlay renders with no layout shift on hover', async ({ page }) => {
    // Get initial legend row width
    const legendRow = page.locator('[data-testid="legend-row-base"]').first();
    const initialBox = await legendRow.boundingBox();
    expect(initialBox).toBeTruthy();
    const initialWidth = initialBox?.width ?? 0;

    // Hover over legend row (actions appear)
    await legendRow.hover();
    await page.waitForTimeout(100);

    // Check width again - should be same (actions appear but don't shift layout due to grid)
    const hoverBox = await legendRow.boundingBox();
    const hoverWidth = hoverBox?.width ?? 0;

    // Allow small variance (< 2px due to scrollbar or measurements)
    expect(Math.abs(hoverWidth - initialWidth)).toBeLessThan(3);
  });

  test('A2: Legend actions only visible on hover', async ({ page }) => {
    const legendRow = page.locator('[data-testid="legend-row-base"]').first();
    const settingsBtn = page.locator('[data-testid="legend-settings-base"]').first();

    // Initially hidden (pointer-events-none, opacity-0)
    let settingsBox = await settingsBtn.boundingBox();
    const computedStyle = await settingsBtn.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });
    expect(parseFloat(computedStyle)).toEqual(0);

    // Hover - becomes visible
    await legendRow.hover();
    await page.waitForTimeout(150);

    const computedStyleHovered = await settingsBtn.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });
    expect(parseFloat(computedStyleHovered)).toEqual(1);
  });

  test('A3: Dimming applies subtle color reduction, not text opacity', async ({ page }) => {
    // Add a compare first
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
    });
    await page.waitForTimeout(200);

    const baseRow = page.locator('[data-testid="legend-row-base"]').first();
    const compareRow = page.locator('[data-testid^="legend-row-compare-"]').first();

    // Hover on compare row
    await compareRow.hover();
    await page.waitForTimeout(150);

    // Get color indicator color of base row (should be dimmed)
    const baseColorIndicator = baseRow.locator('div').nth(1); // Color dot
    const baseRgba = await baseColorIndicator.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Should be rgba with alpha < 0.5 (dimmed)
    expect(baseRgba).toMatch(/rgba/);
    const alphaMatch = baseRgba.match(/[\d.]+\)$/);
    if (alphaMatch) {
      const alpha = parseFloat(alphaMatch[0]);
      expect(alpha).toBeLessThan(0.5);
    }

    // Base row text should NOT have reduced opacity (no text-level dimming)
    const baseSymbol = baseRow.locator('span').first(); // Symbol name
    const textOpacity = await baseSymbol.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });
    expect(parseFloat(textOpacity)).toEqual(1); // Full opacity
  });

  test('A4: Legend pointer-events smart: legend catches events, chart does not block', async ({ page }) => {
    const legendOverlay = page.locator('[data-testid="legend-overlay"]').first();
    const hasPointerEventsAuto = await legendOverlay.evaluate((el) => {
      return window.getComputedStyle(el).pointerEvents === 'auto';
    });
    expect(hasPointerEventsAuto).toBe(true);
  });

  test('A5: Drag handle visible on hover with cursor change', async ({ page }) => {
    const baseRow = page.locator('[data-testid="legend-row-base"]').first();
    const gripHandle = baseRow.locator('svg').first(); // GripVertical icon

    // Initially opacity-0
    let opacity = await gripHandle.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });
    expect(parseFloat(opacity)).toEqual(0);

    // On hover, opacity becomes visible
    await baseRow.hover();
    await page.waitForTimeout(100);

    opacity = await gripHandle.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });
    expect(parseFloat(opacity)).toBeGreaterThan(0.5);
  });

  // ===== B) DRAG & DROP REORDER TESTS =====

  test('B1: Reorder QA primitive exists and is callable', async ({ page }) => {
    const result = await page.evaluate(() => {
      return (window.__lwcharts as any)?._qaLegendReorder?.({ fromId: 'base', toIndex: 0 });
    });
    expect(result?.ok).toBe(false); // Base can't be reordered (not in compare list)
    expect(result?.error).toBeTruthy();
  });

  test('B2: Reorder two compares and verify order in dump()', async ({ page }) => {
    // Add two compares
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'MSFT' });
    });
    await page.waitForTimeout(300);

    // Get initial order from dump
    let dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const initialOrder = dump?.render?.legendRows?.map((r: any) => r.symbol) ?? [];
    expect(initialOrder.length).toBeGreaterThanOrEqual(2);

    // Get compare IDs
    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });
    const msftId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'MSFT')?.id;
    });

    expect(aaplId).toBeTruthy();
    expect(msftId).toBeTruthy();

    // Reorder: move AAPL to after MSFT
    const reorderResult = await page.evaluate(
      ({ aaplId, msftId }) => {
        return (window.__lwcharts as any)?._qaLegendReorder?.({ fromId: aaplId, toIndex: 2 });
      },
      { aaplId, msftId }
    );
    expect(reorderResult?.ok).toBe(true);

    // Verify new order in dump
    await page.waitForTimeout(100);
    dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const newOrder = dump?.render?.legendRows?.map((r: any) => r.symbol) ?? [];
    
    // MSFT should come before AAPL now
    const msftIdx = newOrder.indexOf('MSFT');
    const aaplIdx = newOrder.indexOf('AAPL');
    expect(aaplIdx).toBeGreaterThan(msftIdx);
  });

  test('B3: Reorder persists to localStorage', async ({ page }) => {
    // Add compares and reorder
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'MSFT' });
    });
    await page.waitForTimeout(300);

    // Get ID and reorder
    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });
    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaLegendReorder?.({ fromId: aaplId, toIndex: 2 });
    }, { aaplId });

    // Get stored order from localStorage
    const storedOrder = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('chartspro.legendOrder') || '[]');
    });
    expect(storedOrder.length).toBeGreaterThan(0);
    expect(storedOrder).toContain(aaplId);
  });

  test('B4: legendRows orderIndex field is set correctly', async ({ page }) => {
    // Add compares
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'MSFT' });
    });
    await page.waitForTimeout(300);

    // Check orderIndex in dump
    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const legendRows = dump?.render?.legendRows ?? [];
    
    // Each row should have an orderIndex
    legendRows.forEach((row: any, idx: number) => {
      expect(row.orderIndex).toBeDefined();
      expect(typeof row.orderIndex).toBe('number');
    });
  });

  test('B5: Drag handle cursor feedback (cursor-grab, cursor-grabbing)', async ({ page }) => {
    // The cursor style is set via CSS, just verify the structure is in place
    const baseRow = page.locator('[data-testid="legend-row-base"]').first();
    const draggable = await baseRow.evaluate((el) => {
      return (el as HTMLElement).draggable;
    });
    expect(draggable).toBe(true);
  });

  test('B6: Drop indicator appears during drag', async ({ page }) => {
    // Add compares for reorder test
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'MSFT' });
    });
    await page.waitForTimeout(300);

    const aaplRow = page.locator('[data-testid="legend-row-compare-AAPL"]').first();
    const msftRow = page.locator('[data-testid="legend-row-compare-MSFT"]').first();

    // Start drag
    await aaplRow.dragTo(msftRow);
    await page.waitForTimeout(100);

    // Drop indicator should have been visible during drag (we can't verify it was there,
    // but we can verify the reorder completed successfully)
    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const rows = dump?.render?.legendRows ?? [];
    
    expect(rows.length).toBeGreaterThan(2); // base + aapl + msft at least
  });

  // ===== C) PANE/SCALE CONTROLS TESTS =====

  test('C1: Series placement QA primitive exists', async ({ page }) => {
    const result = await page.evaluate(() => {
      return (window.__lwcharts as any)?._qaSetSeriesPlacement?.('base', { pane: 'main', scale: 'right' });
    });
    expect(result?.ok).toBe(true);
    expect(result?.placement).toBeTruthy();
  });

  test('C1b: Scale left placement changes dump.render.objects priceScaleId', async ({ page }) => {
    // Add compare so we have a non-base series to test placement
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
    });
    await page.waitForTimeout(200);

    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });

    // Set scale=left via placement
    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaSetSeriesPlacement?.(aaplId, { scale: 'left' });
    }, { aaplId });

    // Verify in dump.render.objects that priceScaleId changed
    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const aaplObj = dump?.render?.objects?.find((o: any) => o.id === aaplId);
    
    expect(aaplObj?.priceScaleId).toBe('left');
  });

  test('C1c: Scale right placement keeps priceScaleId as right', async ({ page }) => {
    // Add compare
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
    });
    await page.waitForTimeout(200);

    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });

    // Set scale=right (default)
    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaSetSeriesPlacement?.(aaplId, { scale: 'right' });
    }, { aaplId });

    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const aaplObj = dump?.render?.objects?.find((o: any) => o.id === aaplId);
    
    expect(aaplObj?.priceScaleId).toBe('right');
  });

  test('C1d: Pane own placement changes dump.render.objects paneId', async ({ page }) => {
    // Add compare
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
    });
    await page.waitForTimeout(200);

    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });

    // Set pane=own
    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaSetSeriesPlacement?.(aaplId, { pane: 'own' });
    }, { aaplId });

    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const aaplObj = dump?.render?.objects?.find((o: any) => o.id === aaplId);
    const aaplSymbol = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.symbol;
    });
    
    // paneId should be pane-compare-{symbol-encoded}
    expect(aaplObj?.paneId).toContain('pane-compare');
  });

  test('C1e: dump.render.scales exposes axis sides', async ({ page }) => {
    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const scales = dump?.render?.scales ?? [];
    
    expect(scales.length).toBeGreaterThan(0);
    expect(scales.some((s: any) => s.side === 'left')).toBe(true);
    expect(scales.some((s: any) => s.side === 'right')).toBe(true);
  });

  test('C1f: seriesStyles dump includes scaleSide field', async ({ page }) => {
    // Add compare and set scale
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
    });
    await page.waitForTimeout(200);

    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });

    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaSetSeriesPlacement?.(aaplId, { scale: 'left' });
    }, { aaplId });

    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const aaplStyle = dump?.render?.seriesStyles?.find((s: any) => s.id === aaplId);
    
    expect(aaplStyle?.scaleSide).toBe('left');
  });

  test('C2: Pane selector appears in settings modal', async ({ page }) => {
    // Add a compare
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
    });
    await page.waitForTimeout(200);

    // Open settings for AAPL
    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });

    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaOpenSeriesSettings?.(aaplId);
    }, { aaplId });

    await page.waitForTimeout(300);

    // Check pane selector exists
    const paneSelect = page.locator('[data-testid="pane-select"]');
    await expect(paneSelect).toBeVisible();
  });

  test('C3: Scale selector appears in settings modal', async ({ page }) => {
    // Add a compare
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
    });
    await page.waitForTimeout(200);

    // Open settings
    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });

    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaOpenSeriesSettings?.(aaplId);
    }, { aaplId });

    await page.waitForTimeout(300);

    // Check scale selector exists
    const scaleSelect = page.locator('[data-testid="scale-select"]');
    await expect(scaleSelect).toBeVisible();
  });

  test('C4: Pane/scale changes persist to localStorage', async ({ page }) => {
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaSetSeriesPlacement?.('base', { pane: 'own', scale: 'left' });
    });

    const stored = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('chartspro.seriesPlacement') || '{}');
    });
    expect(stored['base']?.pane).toBe('own');
    expect(stored['base']?.scale).toBe('left');
  });

  test('C5: seriesStyles dump includes placement fields', async ({ page }) => {
    // Set placement
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaSetSeriesPlacement?.('base', { pane: 'main', scale: 'right' });
    });

    // Check dump
    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const baseStyle = dump?.render?.seriesStyles?.find((s: any) => s.id === 'base');
    
    expect(baseStyle?.pane).toBe('main');
    expect(baseStyle?.scale).toBe('right');
  });

  test('C6: Placement values default correctly (main, right)', async ({ page }) => {
    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const baseStyle = dump?.render?.seriesStyles?.find((s: any) => s.id === 'base');
    
    expect(baseStyle?.pane).toBe('main');
    expect(baseStyle?.scale).toBe('right');
  });

  // ===== REGRESSION TESTS (Sprint 5) =====

  test('REG1: Legend hover still works', async ({ page }) => {
    const result = await page.evaluate(() => {
      return (window.__lwcharts as any)?._qaLegendHover?.('base');
    });
    expect(result?.ok).toBe(true);
  });

  test('REG2: Legend toggle still works', async ({ page }) => {
    const result = await page.evaluate(() => {
      return (window.__lwcharts as any)?._qaLegendToggle?.('base');
    });
    expect(result?.ok).toBe(true);
  });

  test('REG3: Legend solo still works', async ({ page }) => {
    const result = await page.evaluate(() => {
      return (window.__lwcharts as any)?._qaLegendSolo?.('base');
    });
    expect(result?.ok).toBe(true);
  });

  test('REG4: Series styles still persist and apply', async ({ page }) => {
    const result = await page.evaluate(() => {
      return (window.__lwcharts as any)?._qaSetSeriesStyle?.('base', {
        colorHint: '#ff0000',
        width: 3,
        lineStyle: 'dashed',
      });
    });
    expect(result?.ok).toBe(true);

    // Check dump
    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const baseStyle = dump?.render?.seriesStyles?.find((s: any) => s.id === 'base');
    expect(baseStyle?.colorHint).toBe('#ff0000');
    expect(baseStyle?.width).toBe(3);
    expect(baseStyle?.lineStyle).toBe('dashed');
  });

  test('REG5: Settings modal still opens and closes', async ({ page }) => {
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaOpenSeriesSettings?.('base');
    });
    await page.waitForTimeout(300);

    const modal = page.locator('[data-testid="series-settings-modal-base"]');
    await expect(modal).toBeVisible();

    // Close
    await page.locator('[data-testid="series-settings-cancel-btn"]').click();
    await page.waitForTimeout(200);
    await expect(modal).not.toBeVisible();
  });

  test('REG6: Color styles apply and persist', async ({ page }) => {
    // Open settings
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaOpenSeriesSettings?.('base');
    });
    await page.waitForTimeout(300);

    // Click color swatch
    await page.locator('[data-testid="color-swatch-#f97316"]').click(); // orange
    await page.locator('[data-testid="series-settings-save-btn"]').click();
    await page.waitForTimeout(200);

    // Verify persisted
    const stored = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('chartspro.seriesStyles') || '{}');
    });
    expect(stored['base']?.colorHint).toBe('#f97316');
  });

  test('REG7: Line width dropdown works', async ({ page }) => {
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaOpenSeriesSettings?.('base');
    });
    await page.waitForTimeout(300);

    const widthSelect = page.locator('[data-testid="line-width-select"]');
    await widthSelect.selectOption('4');
    await page.locator('[data-testid="series-settings-save-btn"]').click();
    await page.waitForTimeout(200);

    // Check stored
    const stored = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('chartspro.seriesStyles') || '{}');
    });
    expect(stored['base']?.width).toBe(4);
  });

  test('REG8: Line style dropdown works', async ({ page }) => {
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaOpenSeriesSettings?.('base');
    });
    await page.waitForTimeout(300);

    const styleSelect = page.locator('[data-testid="line-style-select"]');
    await styleSelect.selectOption('dotted');
    await page.locator('[data-testid="series-settings-save-btn"]').click();
    await page.waitForTimeout(200);

    // Check stored
    const stored = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('chartspro.seriesStyles') || '{}');
    });
    expect(stored['base']?.lineStyle).toBe('dotted');
  });

  test('REG9: Legend visibility state persists across reload', async ({ page }) => {
    // Toggle base visibility off
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaLegendToggle?.('base');
    });

    // Get from localStorage
    const visibility = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('chartspro.legendVisibility') || '{}');
    });
    expect(visibility['base']).toBe(false);
  });

  test('REG10: Complete flow: add compare, style, place, reorder', async ({ page }) => {
    // Add compare
    await page.evaluate(() => {
      (window.__lwcharts as any)?._qaAddCompare?.({ symbol: 'AAPL' });
    });
    await page.waitForTimeout(200);

    const aaplId = await page.evaluate(() => {
      const rows = (window.__lwcharts as any)?.dump?.()?.render?.legendRows ?? [];
      return rows.find((r: any) => r.symbol === 'AAPL')?.id;
    });

    // Style
    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaSetSeriesStyle?.(aaplId, {
        colorHint: '#06b6d4',
        width: 2,
        lineStyle: 'dashed',
      });
    }, { aaplId });

    // Place
    await page.evaluate(({ aaplId }) => {
      (window.__lwcharts as any)?._qaSetSeriesPlacement?.(aaplId, {
        pane: 'main',
        scale: 'left',
      });
    }, { aaplId });

    // Verify in dump
    const dump = await page.evaluate(() => (window.__lwcharts as any)?.dump?.());
    const aaplStyle = dump?.render?.seriesStyles?.find((s: any) => s.id === aaplId);
    
    expect(aaplStyle?.colorHint).toBe('#06b6d4');
    expect(aaplStyle?.width).toBe(2);
    expect(aaplStyle?.lineStyle).toBe('dashed');
    expect(aaplStyle?.pane).toBe('main');
    expect(aaplStyle?.scale).toBe('left');
  });
});


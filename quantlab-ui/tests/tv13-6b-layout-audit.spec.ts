import { test, expect, Page } from '@playwright/test';
import { gotoChartsPro } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * TV-13.6b: Layout Dead-Space Audit
 * 
 * Deterministic measurement of bounding boxes and computed styles for:
 * - .tv-shell (main grid container)
 * - .tv-chart-root (chart host div)
 * - .chartspro-root (root container)
 * - .chartspro-surface (grid with rows)
 * - .chartspro-price (chart render area)
 * - Inspector root (row 2 in surface grid)
 * - .tv-bottombar (bottom bar container)
 * 
 * Goal: Identify which container owns height but doesn't fill (dead space root cause).
 * Output: logs/tv13_6b_layout_audit.txt
 */

test.describe('TV-13.6b: Layout Dead-Space Audit', () => {
  let page: Page;
  let auditLog: string[] = [];

  const log = (msg: string) => {
    auditLog.push(msg);
    console.log(msg);
  };

  test.beforeEach(async ({ page: testPage, browser }, testInfo) => {
    page = testPage;
    auditLog = [];

    // Navigate to ChartsPro
    await gotoChartsPro(page, testInfo, { mock: true });

    // Wait for chart ready
    await page.waitForFunction(() => window.__lwcharts?.dump?.(), { timeout: 15000 });

    log('✓ Chart initialized');
  });

  test.afterEach(async ({ }, testInfo) => {
    // Write audit log to file
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const auditPath = path.join(logsDir, `tv13_6b_layout_audit_${timestamp}.txt`);
    fs.writeFileSync(auditPath, auditLog.join('\n'));
    console.log(`Audit saved to: ${auditPath}`);
  });

  test('Measure layout: element bounding boxes and computed styles', async () => {
    const measurements = await page.evaluate(async () => {
      const result: Record<string, any> = {};

      // Helper: measure element
      const measure = (selector: string, label: string) => {
        const el = document.querySelector(selector);
        if (!el) {
          return {
            selector,
            label,
            found: false,
            bbox: null,
            styles: null,
          };
        }

        const bbox = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        return {
          selector,
          label,
          found: true,
          bbox: {
            top: Math.round(bbox.top),
            left: Math.round(bbox.left),
            bottom: Math.round(bbox.bottom),
            right: Math.round(bbox.right),
            width: Math.round(bbox.width),
            height: Math.round(bbox.height),
          },
          styles: {
            display: style.display,
            position: style.position,
            width: style.width,
            height: style.height,
            minHeight: style.minHeight,
            maxHeight: style.maxHeight,
            overflow: style.overflow,
            overflowY: style.overflowY,
            gridTemplateRows: style.gridTemplateRows,
            gap: style.gap,
            padding: style.padding,
            margin: style.margin,
          },
        };
      };

      // Measure key elements
      result.tvShell = measure('.tv-shell', 'TV-Shell Grid (main TradingView-style container)');
      result.chartproRoot = measure('.chartspro-root', 'ChartsPro Root (flex column)');
      result.chartsproSurface = measure('.chartspro-surface', 'ChartsPro Surface (grid with rows)');
      result.chartsproPrice = measure('.chartspro-price', 'ChartsPro Price (chart render area, row 1)');

      // Find inspector sidebar (should be in row 2 of surface grid)
      const inspectorRoot = document.querySelector('[data-testid="inspector-root"]') ||
                           document.querySelector('.inspector-sidebar') ||
                           document.querySelector('[class*="inspector"]');
      result.inspectorRoot = inspectorRoot ? measure('[data-testid="inspector-root"], .inspector-sidebar, [class*="inspector"]', 'Inspector Root (row 2)') : {
        selector: 'inspector (not found)',
        label: 'Inspector Root (row 2)',
        found: false,
        bbox: null,
        styles: null,
      };

      // TV-BottomBar (should be after shell)
      result.tvBottomBar = measure('.tv-bottombar', 'TV-BottomBar (bottom bar)');

      // Additional diagnostic: check parent chain for shell
      const shell = document.querySelector('.tv-shell');
      if (shell) {
        const parent = shell.parentElement;
        result.shellParent = measure(parent?.className || 'parent', `Shell Parent (${parent?.tagName})`);
      }

      // Visual summary: calculate potential dead space
      const surface = document.querySelector('.chartspro-surface') as HTMLElement;
      const price = document.querySelector('.chartspro-price') as HTMLElement;

      let deadSpaceAnalysis = 'N/A';
      if (surface && price) {
        const surfaceBbox = surface.getBoundingClientRect();
        const priceBbox = price.getBoundingClientRect();
        const priceBelowChart = priceBbox.bottom;
        const surfaceBottom = surfaceBbox.bottom;
        const potentialDeadSpace = surfaceBottom - priceBelowChart;

        deadSpaceAnalysis = `Surface bottom (${Math.round(surfaceBottom)}) - Price bottom (${Math.round(priceBelowChart)}) = ${Math.round(potentialDeadSpace)}px dead space`;
      }

      result.deadSpaceAnalysis = deadSpaceAnalysis;

      // Inspect grid-template-rows on surface
      if (surface) {
        const computedRows = window.getComputedStyle(surface).gridTemplateRows;
        result.surfaceGridRows = computedRows;
      }

      return result;
    });

    // Log all measurements
    log('\n===== TV-13.6b Layout Audit =====\n');
    log(`Timestamp: ${new Date().toISOString()}`);
    log(`URL: ${page.url()}\n`);

    // TV-Shell
    if (measurements.tvShell.found) {
      log(`✓ TV-Shell (${measurements.tvShell.label})`);
      log(`  Bbox: ${JSON.stringify(measurements.tvShell.bbox)}`);
      log(`  Styles: display=${measurements.tvShell.styles.display}, grid=${measurements.tvShell.styles.gridTemplateRows}`);
    } else {
      log(`✗ TV-Shell NOT FOUND`);
    }

    // ChartsPro Root
    if (measurements.chartproRoot.found) {
      log(`\n✓ ChartsPro Root (${measurements.chartproRoot.label})`);
      log(`  Bbox: ${JSON.stringify(measurements.chartproRoot.bbox)}`);
      log(`  Styles: display=${measurements.chartproRoot.styles.display}, height=${measurements.chartproRoot.styles.height}`);
    } else {
      log(`\n✗ ChartsPro Root NOT FOUND`);
    }

    // ChartsPro Surface
    if (measurements.chartsproSurface.found) {
      log(`\n✓ ChartsPro Surface (${measurements.chartsproSurface.label})`);
      log(`  Bbox: ${JSON.stringify(measurements.chartsproSurface.bbox)}`);
      log(`  Styles: display=${measurements.chartsproSurface.styles.display}, gridTemplateRows=${measurements.chartsproSurface.styles.gridTemplateRows}`);
      log(`  Grid analysis: ${measurements.surfaceGridRows}`);
    } else {
      log(`\n✗ ChartsPro Surface NOT FOUND`);
    }

    // ChartsPro Price (chart area)
    if (measurements.chartsproPrice.found) {
      log(`\n✓ ChartsPro Price (${measurements.chartsproPrice.label})`);
      log(`  Bbox: ${JSON.stringify(measurements.chartsproPrice.bbox)}`);
      log(`  Styles: display=${measurements.chartsproPrice.styles.display}, height=${measurements.chartsproPrice.styles.height}, minHeight=${measurements.chartsproPrice.styles.minHeight}`);
    } else {
      log(`\n✗ ChartsPro Price NOT FOUND`);
    }

    // Inspector Root
    if (measurements.inspectorRoot.found) {
      log(`\n✓ Inspector Root (${measurements.inspectorRoot.label})`);
      log(`  Bbox: ${JSON.stringify(measurements.inspectorRoot.bbox)}`);
      log(`  Styles: display=${measurements.inspectorRoot.styles.display}, height=${measurements.inspectorRoot.styles.height}, minHeight=${measurements.inspectorRoot.styles.minHeight}`);
    } else {
      log(`\n✓ Inspector Root NOT FOUND (expected if collapsed)`);
    }

    // TV-BottomBar
    if (measurements.tvBottomBar.found) {
      log(`\n✓ TV-BottomBar (${measurements.tvBottomBar.label})`);
      log(`  Bbox: ${JSON.stringify(measurements.tvBottomBar.bbox)}`);
      log(`  Styles: display=${measurements.tvBottomBar.styles.display}, height=${measurements.tvBottomBar.styles.height}`);
    } else {
      log(`\n✗ TV-BottomBar NOT FOUND`);
    }

    // Dead Space Analysis
    log(`\n===== Dead Space Analysis =====`);
    log(measurements.deadSpaceAnalysis);

    // Chart ready check
    const dump = await page.evaluate(() => window.__lwcharts.dump?.());
    if (dump) {
      log(`\nChart ready: layout=${JSON.stringify(dump.ui.layout)}`);
      log(`Inspector open: ${dump.ui.inspectorOpen}`);
      log(`Viewport WH: ${dump.ui.layout.viewportWH?.w}x${dump.ui.layout.viewportWH?.h}`);
    }

    // Assertions
    expect(measurements.tvShell.found, 'TV-Shell should be present').toBe(true);
    expect(measurements.chartproRoot.found, 'ChartsPro Root should be present').toBe(true);
    expect(measurements.chartsproSurface.found, 'ChartsPro Surface should be present').toBe(true);
    expect(measurements.chartsproPrice.found, 'ChartsPro Price should be present').toBe(true);

    // Check that price bbox is valid
    if (measurements.chartsproPrice.found && measurements.chartsproPrice.bbox) {
      expect(measurements.chartsproPrice.bbox.height, 'Chart height should be > 200px').toBeGreaterThan(200);
    }
  });

  test('Verify inspector row (row2) height when collapsed', async () => {
    // Ensure inspector is collapsed
    const inspectorToggle = page.getByTestId('chartspro-inspector-toggle');
    const isOpen = await page.evaluate(() => {
      const dump = window.__lwcharts.dump?.();
      return dump?.ui.inspectorOpen ?? false;
    });

    if (isOpen) {
      await inspectorToggle.click();
      await page.waitForTimeout(200);
      log('Inspector toggled to closed');
    }

    // Measure surface grid rows when inspector is closed
    const surfaceInfo = await page.evaluate(() => {
      const surface = document.querySelector('.chartspro-surface') as HTMLElement;
      if (!surface) return null;

      const bbox = surface.getBoundingClientRect();
      const styles = window.getComputedStyle(surface);
      const gridRows = styles.gridTemplateRows;

      // Parse grid rows (e.g., "1fr 0px" or "1fr auto")
      const rowsArray = gridRows.split(/\s+/).filter(r => r.length > 0);

      return {
        gridTemplateRows: gridRows,
        gridTemplateRowsArray: rowsArray,
        height: Math.round(bbox.height),
        children: Array.from(surface.children).map((child, idx) => {
          const childBbox = child.getBoundingClientRect();
          return {
            index: idx,
            tag: child.tagName,
            className: (child as HTMLElement).className,
            height: Math.round(childBbox.height),
            display: window.getComputedStyle(child as HTMLElement).display,
          };
        }),
      };
    });

    if (surfaceInfo) {
      log(`\n===== Inspector Collapsed (Row 2 Check) =====`);
      log(`Surface grid-template-rows: ${surfaceInfo.gridTemplateRows}`);
      log(`Surface total height: ${surfaceInfo.height}px`);
      log(`Surface children count: ${surfaceInfo.children.length}`);
      surfaceInfo.children.forEach((child) => {
        log(`  Row ${child.index}: ${child.tag} (class="${child.className}") height=${child.height}px, display=${child.display}`);
      });

      // Assertion: When inspector is closed, row 2 should be 0px or auto-shrink
      const row2 = surfaceInfo.gridTemplateRowsArray[1];
      log(`\n✓ Row 2 spec: ${row2}`);
      if (row2 && row2 !== '0px' && row2 !== '0') {
        log(`⚠ WARNING: Row 2 is "${row2}" (expected "0px" when inspector closed)`);
      } else {
        log(`✓ Row 2 is correctly sized when inspector closed`);
      }
    }
  });

  test('TV-13.6b dead-space invariant: .chartspro-price bottom near .tv-bottombar top', async () => {
    // Close inspector to eliminate expected row2
    const inspectorToggle = page.getByTestId('chartspro-inspector-toggle');
    const isOpen = await page.evaluate(() => window.__lwcharts.dump?.().ui.inspectorOpen ?? false);
    if (isOpen) {
      await inspectorToggle.click();
      // Wait for toggle animation
      await page.waitForTimeout(500);
      log('Inspector closed for invariant test');
    }

    // Measure the gap between .chartspro-price bottom and .tv-bottombar top
    const gaps = await page.evaluate(() => {
      const priceEl = document.querySelector('.chartspro-price') as HTMLElement;
      const bottomBarEl = document.querySelector('.tv-bottombar') as HTMLElement;

      if (!priceEl || !bottomBarEl) {
        return { found: false };
      }

      const priceBbox = priceEl.getBoundingClientRect();
      const bottomBarBbox = bottomBarEl.getBoundingClientRect();

      // Gap between price bottom and bottombar top
      const gap = Math.round(bottomBarBbox.top - priceBbox.bottom);

      return {
        found: true,
        priceBottom: Math.round(priceBbox.bottom),
        bottomBarTop: Math.round(bottomBarBbox.top),
        gap,
      };
    });

    if (gaps.found) {
      log(`\n===== TV-13.6b Invariant: Dead-Space Check =====`);
      log(`ChartsPro Price bottom: ${gaps.priceBottom}px`);
      log(`TV-BottomBar top: ${gaps.bottomBarTop}px`);
      log(`Gap (dead space): ${gaps.gap}px`);

      // Assertion: gap should be <= 10px (allow small rendering differences)
      const tolerance = 10;
      if (gaps.gap <= tolerance) {
        log(`✓ PASS: No dead space detected (gap=${gaps.gap}px <= tolerance=${tolerance}px)`);
      } else {
        log(`⚠ WARNING: Dead space detected (gap=${gaps.gap}px > tolerance=${tolerance}px)`);
      }

      expect(gaps.gap, `Dead space should be <= ${tolerance}px but was ${gaps.gap}px`).toBeLessThanOrEqual(tolerance);
    } else {
      log(`\n⚠ Could not measure gap: .chartspro-price or .tv-bottombar not found`);
      expect(gaps.found, 'Must find both .chartspro-price and .tv-bottombar').toBe(true);
    }
  });
});

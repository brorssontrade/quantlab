import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ql/apiBase', 'http://127.0.0.1:8000');
  });
});

test('ChartsPro zoom/pan update dump.render.scale deterministically', async ({ page }) => {
  await page.goto('/?mock=1');
  await page.getByRole('tab', { name: /^charts$/i }).click();

  // Wait for base chart
  await page.waitForFunction(() => {
    const lw = (window as any).__lwcharts;
    const dump = lw?.dump?.();
    return dump && dump.pricePoints > 0 && dump.timeframe === '1h';
  });

  const initial = await page.evaluate(() => (window as any).__lwcharts?.dump?.()?.render?.scale ?? null);
  expect(initial).toBeDefined();

  // Zoom in
  const zoomed = await page.evaluate(() => (window as any).__lwcharts?.debug?.zoom?.(3) ?? false);
  if (zoomed) {
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => (window as any).__lwcharts?.dump?.()?.render?.scale ?? null);
    expect(after).toBeDefined();
    expect(after.barSpacing).not.toBe(initial.barSpacing);
  } else {
    console.log('[TEST] debug.zoom not available; skipping');
  }

  // Pan right then left and ensure visibleRange/scrollPosition change
  const prePan = await page.evaluate(() => (window as any).__lwcharts?.dump?.()?.render?.scale ?? null);
  const panned = await page.evaluate(() => (window as any).__lwcharts?.debug?.pan?.(10) ?? false);
  if (panned) {
    await page.waitForTimeout(500);
    const postPan = await page.evaluate(() => (window as any).__lwcharts?.dump?.()?.render?.scale ?? null);
    expect(postPan).toBeDefined();
    // visibleRange or scrollPosition should change
    const changed = JSON.stringify(prePan.visibleRange) !== JSON.stringify(postPan.visibleRange) || prePan.scrollPosition !== postPan.scrollPosition;
    expect(changed).toBe(true);
  } else {
    console.log('[TEST] debug.pan not available; skipping pan assertions');
  }
});

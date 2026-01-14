import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

test('ChartsPro percent mode - 0% baseline snapshot', async ({ page }) => {
  // Resolve test directory in ESM-safe way
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const snapshotDir = path.join(thisDir, 'snapshots');
  const snapshotPath = path.join(snapshotDir, 'chartspro-percent-0line.png');
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });

  await page.goto('/?mock=1');
  await page.getByRole('tab', { name: /^charts$/i }).click();

  // Wait for base to load
  await page.waitForFunction(() => {
    const lw = (window as any).__lwcharts;
    const dump = lw?.dump?.();
    return dump && dump.pricePoints > 0 && dump.timeframe === '1h';
  });

  // Add compare and switch to percent mode
  await page.evaluate(async () => {
    const lw = (window as any).__lwcharts;
    await lw?.compare?.add?.('AAPL.US');
    lw?.set?.({ compareScaleMode: 'percent' });
  });

  // Wait for percent rendering
  await page.waitForTimeout(1500);

  const chartEl = page.locator('.chartspro-price');
  await expect(chartEl).toBeVisible();

  // Capture screenshot and either create baseline or compare
  const buffer = await chartEl.screenshot();
  if (!fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, buffer);
    console.log('[snapshot] Baseline created:', snapshotPath);
  } else {
    const existing = fs.readFileSync(snapshotPath);
    expect(buffer.equals(existing)).toBe(true);
  }
});


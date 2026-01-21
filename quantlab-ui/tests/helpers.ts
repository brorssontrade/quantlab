import { Page, TestInfo, expect } from "@playwright/test";

/**
 * Robust helper to navigate to the ChartsPro tab.
 * Tries multiple selectors in order (testid, role=tab, role=button, role=link).
 * If navigation fails, takes screenshot, dumps DOM, logs URL/body, and throws with clear error.
 */
type GotoOpts = { mock?: boolean };

export async function gotoChartsPro(page: Page, testInfo: TestInfo, opts: GotoOpts = {}): Promise<void> {
  const useMock = opts.mock ?? true;
  // Navigate with deterministic flags - use "/" as base
  const url = `/?mock=${useMock ? "1" : "0"}`;
  await page.goto(url, { waitUntil: "networkidle" });
  const selectors = [
    { type: "testid", selector: page.getByTestId("tab-charts"), desc: "getByTestId('tab-charts')" },
    { type: "role-tab", selector: page.getByRole("tab", { name: /charts/i }), desc: "getByRole('tab', { name: /charts/i })" },
    { type: "role-button", selector: page.getByRole("button", { name: /charts/i }), desc: "getByRole('button', { name: /charts/i })" },
    { type: "role-link", selector: page.getByRole("link", { name: /charts/i }), desc: "getByRole('link', { name: /charts/i })" },
  ];

  for (const { type, selector, desc } of selectors) {
    const count = await selector.count();
    if (count > 0) {
      console.log(`[gotoChartsPro] Found Charts tab via ${desc}`);
      await selector.first().click();
      // Wait for LW dump to be available and price canvas visible
      await page.waitForFunction(() => typeof (window as any).__lwcharts?.dump === "function");
      const canvas = page.locator(".tv-lightweight-charts canvas").first();
      await canvas.waitFor({ state: "visible" });
      await canvas.scrollIntoViewIfNeeded();
      // Sanity: hover should update hover state
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      }
      const hover = await page.evaluate(() => (window as any).__lwcharts?.dump?.()?.hover ?? null);
      expect(hover).not.toBeNull();
      return;
    }
  }

  // No selector matched – take debug dumps before failing
  console.error("[gotoChartsPro] FAIL: No Charts tab found via any selector");
  
  const screenshotPath = testInfo.outputPath("ui-before-nav.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.error(`[gotoChartsPro] Screenshot saved: ${screenshotPath}`);

  const content = await page.content();
  console.error(`[gotoChartsPro] DOM (first 4000 chars):\n${content.slice(0, 4000)}`);

  console.error(`[gotoChartsPro] URL: ${page.url()}`);

  const bodyText = await page.locator("body").innerText();
  console.error(`[gotoChartsPro] BODY TEXT (first 500 chars):\n${bodyText.slice(0, 500)}`);

  throw new Error(
    `gotoChartsPro: Could not find Charts tab via any selector (testid, role=tab, role=button, role=link). ` +
    `Check screenshot at ${screenshotPath} and DOM dump above.`
  );
}

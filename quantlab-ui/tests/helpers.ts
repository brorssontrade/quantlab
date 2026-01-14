import { Page, TestInfo } from "@playwright/test";

/**
 * Robust helper to navigate to the ChartsPro tab.
 * Tries multiple selectors in order (testid, role=tab, role=button, role=link).
 * If navigation fails, takes screenshot, dumps DOM, logs URL/body, and throws with clear error.
 */
export async function gotoChartsPro(page: Page, testInfo: TestInfo): Promise<void> {
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

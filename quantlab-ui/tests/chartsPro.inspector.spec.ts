import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ql/apiBase", "http://127.0.0.1:8000");
  });
  page.on("pageerror", (err) => console.log("PAGEERROR:", err));
  page.on("console", (msg) => console.log("BROWSER:", msg.type(), msg.text()));
});

test("Inspector: height stability, object toggling, data window hover", async ({ page }) => {
  await page.goto("/?mock=1");
  await page.getByRole("tab", { name: /^charts$/i }).click();

  await page.waitForFunction(() => {
    const lw = (window as any).__lwcharts;
    const dump = lw?.dump?.();
    return dump && dump.pricePoints > 0;
  });

  const before = await page.evaluate(() => (window as any).__lwcharts.dump().render?.layout?.canvasWH ?? null);
  expect(before).not.toBeNull();

  // Open inspector via toggle
  await page.getByTestId("chartspro-inspector-toggle").click();
  await page.waitForFunction(() => (window as any).__lwcharts.dump().ui?.inspectorOpen === true);
  const after = await page.evaluate(() => (window as any).__lwcharts.dump().render?.layout?.canvasWH ?? null);
  expect(after).not.toBeNull();
  expect(after.h).toBe(before.h);
  expect(after.w).toBeLessThanOrEqual(before.w);

  // Switch to Data Window tab and assert height stable
  await page.getByTestId("chartspro-inspector-tab-datawindow").click();
  await page.waitForFunction(() => (window as any).__lwcharts.dump().ui?.inspectorTab === "data");
  const afterTab = await page.evaluate(() => (window as any).__lwcharts.dump().render?.layout?.canvasWH ?? null);
  expect(afterTab.h).toBe(before.h);

  // Add a compare symbol and wait for it to appear in objects
  const addViaToolbar = async (symbol: string, mode: string = "percent") => {
    await page.fill('[data-testid="compare-add-symbol"]', symbol);
    await page.selectOption('[data-testid="compare-add-timeframe"]', "1h");
    await page.selectOption('[data-testid="compare-add-mode"]', mode);
    await page.getByTestId("compare-add-submit").click();
  };

  await addViaToolbar("META.US", "percent");
  await page.waitForFunction(() => {
    const dump = (window as any).__lwcharts.dump();
    return dump && Array.isArray(dump.render?.objects) && dump.render.objects.some((o: any) => o.id === "compare-META.US");
  });

  // Toggle visibility via inspector row
  await page.getByTestId("obj-toggle-compare-META.US").click();
  await page.waitForFunction(() => {
    const objs = (window as any).__lwcharts.dump().render?.objects ?? [];
    const found = objs.find((o: any) => o.id === "compare-META.US");
    return found ? found.visible === false : false;
  });

  // Ensure Data Window responds to hover
  await page.getByTestId("chartspro-inspector-tab-datawindow").click();
  // trigger hover at mid
  await page.evaluate(() => (window as any).__lwcharts.hoverAt?.("mid"));
  await page.waitForFunction(() => (window as any).__lwcharts.dump().hover != null);
  const hover = await page.evaluate(() => (window as any).__lwcharts.dump().hover);
  expect(hover).not.toBeNull();
  await expect(page.getByTestId("chartspro-datawindow")).toBeVisible();
});

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ql/apiBase", "http://127.0.0.1:8000");
  });
  page.on("pageerror", (err) => console.log("PAGEERROR:", err));
  page.on("console", (msg) => console.log("BROWSER:", msg.type(), msg.text()));
});

async function waitForDump(page: any) {
  await page.waitForFunction(() => {
    const lw = (window as any).__lwcharts;
    const dump = lw?.dump?.();
    return dump && dump.pricePoints > 0;
  });
}

test("compare add modes: samePercent, newPriceScale, newPane", async ({ page }) => {
  await page.goto("/?mock=1");
  await page.getByRole("tab", { name: /^charts$/i }).click();
  await waitForDump(page);

  // 1) samePercent
  await page.evaluate(async () => {
    try {
      await (window as any).__lwcharts?.compare?.add?.("AAPL.US", { addMode: "samePercent" });
    } catch (e) {
      console.error(e);
    }
  });
  await page.waitForTimeout(1500);
  let dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
  const aapl = dump?.render?.objects?.find((o: any) => o.kind === "compare" && o.title === "AAPL.US");
  expect(aapl).toBeDefined();
  expect(aapl?.addMode).toBe("samePercent");
  expect(dump?.percent).toBeDefined();
  console.log("✓ samePercent addMode applied and percent block present");

  // 2) newPriceScale
  await page.evaluate(async () => {
    try {
      await (window as any).__lwcharts?.compare?.add?.("MSFT.US", { addMode: "newPriceScale" });
    } catch (e) {
      console.error(e);
    }
  });
  await page.waitForTimeout(1500);
  dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
  const msft = dump?.render?.objects?.find((o: any) => o.kind === "compare" && o.title === "MSFT.US");
  expect(msft).toBeDefined();
  expect(msft?.addMode).toBe("newPriceScale");
  expect(msft?.paneId).toBe("price");
  console.log("✓ newPriceScale applied, compare in main pane with own price scale (addMode set)");

  // 3) newPane
  await page.evaluate(async () => {
    try {
      await (window as any).__lwcharts?.compare?.add?.("TSLA.US", { addMode: "newPane" });
    } catch (e) {
      console.error(e);
    }
  });
  await page.waitForTimeout(2000);
  dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
  const tsla = dump?.render?.objects?.find((o: any) => o.kind === "compare" && o.title === "TSLA.US");
  expect(tsla).toBeDefined();
  expect(tsla?.addMode).toBe("newPane");
  // layout panes length should be >= 2 now
  const panes = dump?.render?.layout?.panes ?? [];
  expect(Array.isArray(panes)).toBe(true);
  expect(panes.length).toBeGreaterThan(1);
  const expectedPaneId = `pane-compare-${("TSLA.US".toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))}`;
  // Check that compare object paneId matches the pane id pattern
  expect(tsla?.paneId).toBeDefined();
  expect(tsla?.paneId.startsWith("pane-compare-")).toBe(true);
  console.log("✓ newPane created and paneId assigned; layout.panes increased");

  console.log("\n✅ compareModes checks passed");
});

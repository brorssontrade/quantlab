const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/?mock=1');
  await page.waitForFunction(() => {
    const dump = window.__lwcharts?.dump?.();
    return dump && dump.render?.hasChart;
  }, null, { timeout: 20000 });
  const result = await page.evaluate(async () => {
    const dbg = window.__lwcharts?.debug;
    const dumpBindings = dbg?.dumpBindings?.() ?? null;
    const sample = (await window.__lwcharts?.samplePixel?.()) || null;
    const helperSample = window.__chartsHelpers?.debug?.lastSample ?? null;
    return {
      debugKeys: dbg ? Object.keys(dbg) : null,
      dumpBindings,
      sample,
      helperSample,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();

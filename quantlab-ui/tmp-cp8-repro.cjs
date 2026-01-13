const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/?mock=1');
  await page.getByRole('tab', { name: /^charts$/i }).click();
  await page.waitForFunction(() => {
    const dump = window.__lwcharts?.dump?.();
    return dump && dump.render?.pricePoints > 0;
  }, null, { timeout: 20000 });
  const addCompare = async (symbol, mode = 'percent') => {
    await page.fill('[data-testid="compare-add-symbol"]', symbol);
    await page.selectOption('[data-testid="compare-add-timeframe"]', '1h');
    await page.selectOption('[data-testid="compare-add-mode"]', mode);
    await page.getByTestId('compare-add-submit').click();
    await page.waitForFunction((sym) => {
      const dump = window.__lwcharts?.dump?.();
      return dump && typeof dump.compares?.[sym] === 'number';
    }, symbol);
  };
  await addCompare('META.US');
  await addCompare('GOOG.US');
  await page.getByTestId('overlay-toggle-sma-20').click();
  await page.getByTestId('overlay-toggle-ema-12').click();
  await page.evaluate(() => window.__lwcharts?.hoverAt?.('mid'));
  await page.getByRole('button', { name: /^Light$/i }).click();
  await page.waitForFunction(() => window.__lwcharts?.dump?.().styles?.theme === 'light');
  await page.fill('#charts-pro-symbol', 'MSFT.US');
  await page.getByRole('button', { name: /^4h$/i }).click();
  await page.selectOption('[data-testid="compare-META_US-mode"]', 'price');
  await page.reload();
  const chartsTab = page.getByRole('tab', { name: /^charts$/i });
  console.log('Charts tab count:', await chartsTab.count());
  await page.screenshot({ path: 'tmp-after-reload.png' });
  await chartsTab.click({ timeout: 5000 });
  console.log('Clicked charts tab after reload');
  await browser.close();
})();

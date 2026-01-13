import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('CONSOLE['+msg.type()+']', msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR', err));
  try {
    await page.goto('http://127.0.0.1:4173/?mock=1', { waitUntil: 'load', timeout: 30000 });
    console.log('loaded');
    await page.waitForTimeout(5000);
  } catch(e) {
    console.error('NAV ERROR', e);
  }
  await browser.close();
})();

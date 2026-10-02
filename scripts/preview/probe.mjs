import { chromium } from '@playwright/test';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url()));
page.on('response', (r) => {
  if (r.status() >= 400) console.log('[http]', r.status(), r.url());
});
await page.goto(url);
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => ({ mode: window.__mf42?.mode, ready: window.__mf42?.ready }));
  console.log('state', JSON.stringify(st));
  if (st.ready) break;
}
await page.screenshot({ path: process.argv[3] ?? '/tmp/probe.png' });
await browser.close();

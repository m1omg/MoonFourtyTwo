// Usage: node scripts/preview/shoot.mjs <model path relative to repo> <outPrefix> [views...]
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const [model, out, ...viewsArg] = process.argv.slice(2);
const views = viewsArg.length ? viewsArg : ['+z', '+x', '-z', '-x'];
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const srv = http
  .createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  })
  .listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 768, height: 768 } });
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto(`http://localhost:${port}/scripts/preview/preview.html?m=/${model}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(() => window.info)));
for (const v of views) {
  await page.evaluate((v) => window.shot(v), v);
  await page.locator('canvas').screenshot({ path: `${out}_${v.replace('+', 'p').replace('-', 'm')}.png` });
}
await browser.close();
srv.close();

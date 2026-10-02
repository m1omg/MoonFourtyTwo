// Renders the rigged friend in a sitting/drinking pose to validate bone axes.
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const [model, out] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const srv = http
  .createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  })
  .listen(0);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 768, height: 768 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[err]', e.message));
await page.goto(`http://localhost:${srv.address().port}/scripts/preview/preview.html?m=/${model}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
const info = await page.evaluate(() => {
  const bones = {};
  window.root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const out = {};
  for (const [n, b] of Object.entries(bones)) {
    const wp = new window.THREE.Vector3();
    b.getWorldPosition(wp);
    out[n] = {
      world: wp.toArray().map((x) => +x.toFixed(3)),
      localQuat: b.quaternion.toArray().map((x) => +x.toFixed(3)),
    };
  }
  return out;
});
console.log(JSON.stringify(info, null, 0));
await page.evaluate(() => {
  window.shot('+z');
});
await page.locator('canvas').screenshot({ path: `${out}_bind.png` });
await browser.close();
srv.close();

// Usage: node scripts/preview/shot-reality.mjs "<hash>" <out.png> [steps...] where step = "teleport:x,y,z,yaw" | "wait:s" | "look:dx,dy" | "noise:x,y,z,loudness" | "use:id" | "give:id,n" | "press:action" | "move:x,y[,seconds]" | "info" | "shot"
import { chromium } from '@playwright/test';
const [hash, out, ...steps] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 200));
});
await page.goto(`http://localhost:4173/#${hash}`);
await page.waitForFunction(() => window.__mf42?.ready === true, null, { timeout: 180000 });
const t0 = Date.now();
await page.evaluate(() => window.__mf42.sim(1.5));
console.log('sim 1.5s took', Date.now() - t0, 'ms');
let shot = 0;
for (const s of steps) {
  const [k, ...rest] = s.split(':');
  const v = rest.join(':');
  if (k === 'teleport') {
    const [x, y, z, yaw] = v.split(',').map(Number);
    await page.evaluate(([x, y, z, yaw]) => window.__mf42.teleport(x, y, z, yaw), [x, y, z, yaw]);
    await page.evaluate(() => window.__mf42.sim(0.3));
  } else if (k === 'wait') await page.evaluate((s) => window.__mf42.sim(s), Number(v));
  else if (k === 'look') {
    const [dx, dy] = v.split(',').map(Number);
    await page.evaluate(
      ([dx, dy]) => {
        window.__mf42.look(dx, dy);
        window.__mf42.sim(0.05);
      },
      [dx, dy],
    );
  } else if (k === 'noise') {
    const [x, y, z, l, kind] = v.split(',');
    await page.evaluate(
      ([x, y, z, l, kind]) => window.__mf42.noise(+x, +y, +z, +l, kind || 'object'),
      [x, y, z, l, kind],
    );
  } else if (k === 'give') {
    const [id, n] = v.split(',');
    await page.evaluate(([id, n]) => window.__mf42.give(id, Number(n ?? 1)), [id, n]);
  } else if (k === 'move') {
    const [x, y, secs] = v.split(',').map(Number);
    await page.evaluate(
      ([x, y, secs]) => {
        window.__mf42.move(x, y);
        window.__mf42.sim(secs || 0.2);
        window.__mf42.move(0, 0);
        window.__mf42.sim(0.1);
      },
      [x, y, secs],
    );
  } else if (k === 'press') {
    await page.evaluate((a) => window.__mf42.press(a), v);
  } else if (k === 'use') {
    console.log('use', v, await page.evaluate((id) => window.__mf42.use(id), v));
  } else if (k === 'info') {
    const i = await page.evaluate(() => ({ ...window.__mf42.info(), sub: window.__mf42.subtitle() }));
    console.log(JSON.stringify({ pos: i.pos, entities: i.entities, flags: i.flags, sub: i.sub }));
  } else if (k === 'shot') {
    await page.screenshot({ path: out.replace('.png', `_${shot++}.png`), timeout: 180000 });
  }
}
await page.screenshot({ path: out, timeout: 180000 });
console.log(JSON.stringify(await page.evaluate(() => window.__mf42.info().render)));
await browser.close();

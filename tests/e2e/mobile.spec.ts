import { test, expect, type Page } from '@playwright/test';

type Info = { pos: number[]; yaw: number };
type W = {
  __mf42: { ready: boolean; sim(s: number): void; frames(n: number, hz: number): void; info(): Info };
};

const info = (page: Page) => page.evaluate(() => (window as unknown as W).__mf42.info());

/** A one-finger drag through CDP (real touch events, as a phone sends them). */
async function drag(page: Page, from: [number, number], to: [number, number], hold: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(...from) });
  for (let i = 1; i <= 6; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / 6;
    const y = from[1] + ((to[1] - from[1]) * i) / 6;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x, y) });
  }
  await hold();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('touch: the stick walks, the right half looks, portrait asks to rotate', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'mobile');
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r0&test&q=low&seed=3');
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  await page.evaluate(() => (window as unknown as W).__mf42.sim(0.5));
  await expect(page.locator('.touch')).toBeVisible();
  await expect(page.locator('.rotate')).toBeHidden();

  // push the stick (left half) forward and keep it there for a second of game time
  const a = await info(page);
  await drag(page, [160, 260], [160, 180], () => page.evaluate(() => (window as unknown as W).__mf42.sim(1)));
  const b = await info(page);
  expect(Math.hypot(b.pos[0]! - a.pos[0]!, b.pos[2]! - a.pos[2]!)).toBeGreaterThan(1);

  // drag across the right half: the view turns
  await drag(page, [700, 200], [560, 200], () =>
    page.evaluate(() => (window as unknown as W).__mf42.frames(3, 60)),
  );
  await page.evaluate(() => (window as unknown as W).__mf42.frames(2, 60));
  const c = await info(page);
  expect(Math.abs(c.yaw - b.yaw)).toBeGreaterThan(0.1);

  // holding the phone upright: the game asks to turn it
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.locator('.rotate')).toBeVisible();
  expect(errors).toEqual([]);
});

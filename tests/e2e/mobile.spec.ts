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

test('touch: the stick walks, the right half looks, also held upright', async ({ page }, ti) => {
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

  // held upright the game goes on: the stick (above the hotbar) still walks, nothing overlaps
  await page.setViewportSize({ width: 412, height: 915 });
  await page.evaluate(() => (window as unknown as W).__mf42.frames(2, 60));
  await page.waitForTimeout(500); // the stick glides up to its new place (a 0.2 s CSS transition)
  await expect(page.locator('.touch')).toBeVisible();
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('.touch .tbtn, .touch .stick-base, .hotbar')].map((e) => {
      const r = e.getBoundingClientRect();
      return { name: e.className, l: r.left, t: r.top, r: r.right, b: r.bottom };
    }),
  );
  for (const x of boxes) {
    expect(x.l, x.name).toBeGreaterThanOrEqual(0);
    expect(x.r, x.name).toBeLessThanOrEqual(412);
    for (const y of boxes)
      if (x !== y)
        expect(
          x.r <= y.l || y.r <= x.l || x.b <= y.t || y.b <= x.t,
          `${x.name} / ${y.name}: ${JSON.stringify([x, y])}`,
        ).toBe(true);
  }
  const d = await info(page);
  await drag(page, [110, 700], [110, 610], () => page.evaluate(() => (window as unknown as W).__mf42.sim(1)));
  const e = await info(page);
  expect(Math.hypot(e.pos[0]! - d.pos[0]!, e.pos[2]! - d.pos[2]!)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('touch, the other way round: a swipe walks, the stick turns the view', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'mobile');
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Nastavenia → Dotykové ovládanie: „Ťahaním chodíš, joystick otáča kameru"
  await page.addInitScript(() =>
    localStorage.setItem(
      'este-jedno.settings.v1',
      JSON.stringify({ v: 1, touchScheme: 'swipe', warned: true }),
    ),
  );
  await page.goto('./#r0&test&q=low&seed=3');
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  await page.evaluate(() => (window as unknown as W).__mf42.sim(0.5));

  // a swipe up on the right half walks forward while the finger stays down
  const a = await info(page);
  // (clear of the buttons in the bottom-right corner)
  await drag(page, [560, 220], [560, 140], () => page.evaluate(() => (window as unknown as W).__mf42.sim(1)));
  await page.evaluate(() => (window as unknown as W).__mf42.sim(1)); // coming to a stop
  const b = await info(page);
  expect(Math.hypot(b.pos[0]! - a.pos[0]!, b.pos[2]! - a.pos[2]!)).toBeGreaterThan(1);

  // the stick (bottom left) turns the view, at a rate, for as long as it is held (and walks nowhere)
  await drag(page, [108, 280], [170, 280], () =>
    page.evaluate(() => (window as unknown as W).__mf42.frames(30, 60)),
  );
  const c = await info(page);
  expect(Math.abs(c.yaw - b.yaw)).toBeGreaterThan(0.3);
  expect(Math.hypot(c.pos[0]! - b.pos[0]!, c.pos[2]! - b.pos[2]!)).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

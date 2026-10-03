import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  press(a: string): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  info(): {
    reality: string;
    checkpoint: string;
    pos: number[];
    flags: Record<string, number>;
    entities: Array<{ id: string; state: string; pos: number[] }>;
  };
};
type W = { __mf42: Api };

const api = (page: Page) => ({
  sim: (s: number) => page.evaluate((s) => (window as unknown as W).__mf42.sim(s), s),
  use: (id: string) => page.evaluate((id) => (window as unknown as W).__mf42.use(id), id),
  press: (a: string) => page.evaluate((a) => (window as unknown as W).__mf42.press(a), a),
  teleport: (x: number, y: number, z: number, yaw = 0) =>
    page.evaluate(
      ([x, y, z, yaw]) => (window as unknown as W).__mf42.teleport(x!, y!, z!, yaw),
      [x, y, z, yaw],
    ),
  info: () => page.evaluate(() => (window as unknown as W).__mf42.info()),
  mode: () => page.evaluate(() => (window as unknown as W).__mf42.mode),
});

async function until(page: Page, cond: () => Promise<boolean>, maxSeconds = 60, chunk = 1): Promise<boolean> {
  const a = api(page);
  for (let t = 0; t < maxSeconds; t += chunk) {
    if (await cond()) return true;
    await a.sim(chunk);
  }
  return cond();
}

/** Why each blackout happened (the game logs „okno: <reason>"). */
const oknos: string[] = [];

async function open(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  oknos.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const hit = /^okno: (.*)$/.exec(m.text());
    if (hit) oknos.push(hit[1]!);
  });
  await page.goto(`./#r10${extra}&test&q=low&seed=10`);
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  return errors;
}

test('the silent sea: three eons of Čierne, the path of light and the window', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  // the crawlers and the water are tested on their own below
  const errors = await open(page, '&god');
  const a = api(page);
  expect((await a.info()).reality).toBe('r10');

  // a shot of Čierne at a time: each one an eon, and the two lights turn a little further
  for (let i = 0; i < 3; i++) {
    expect(await a.use(`cierne:${i}`)).toBe(true);
    await a.press('drink');
    expect(await until(page, async () => !!(await a.info()).flags[`more.skip${i + 1}`], 20, 0.5)).toBe(true);
    await a.sim(1);
  }
  // one behind the other now: a path of frozen light leads over the water to the window
  await a.teleport(0, 0.2, -150, 0);
  await a.sim(1);
  expect((await a.info()).pos[1]!).toBeGreaterThan(-0.3);
  await a.teleport(0, 0.2, -222, 0);
  // reality 11 isn't built yet, so the preview ends
  expect(
    await until(page, () => page.evaluate(() => !!document.querySelector('.ending-text')), 30, 0.5),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('standing still on the pier, something climbs out of the water', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  await a.teleport(0, 0, -40, 0);
  expect(await until(page, async () => (await a.mode()) === 'okno', 40, 0.5)).toBe(true);
  expect(oknos).toHaveLength(1);
  expect(oknos[0]).toMatch(/^lezec-/);
  expect(errors).toEqual([]);
});

test('the black water takes whoever steps into it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  // into the hole where the planks are missing (the left half of the row at z ≈ -14.5)
  await a.teleport(-0.5, 0.1, -14.5, 0);
  expect(await until(page, async () => (await a.mode()) === 'okno', 10, 0.25)).toBe(true);
  expect(oknos).toEqual(['voda']);
  expect(errors).toEqual([]);
});

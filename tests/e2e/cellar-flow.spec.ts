import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  noise(x: number, y: number, z: number, loudness?: number): void;
  inventory(): Array<{ item: string | null; count: number }>;
  info(): {
    reality: string;
    flags: Record<string, number>;
    entities: Array<{ id: string; state: string; pos: number[] }>;
  };
};

type W = { __mf42: Api };

const api = (page: Page) => ({
  sim: (s: number) => page.evaluate((s) => (window as unknown as W).__mf42.sim(s), s),
  use: (id: string) => page.evaluate((id) => (window as unknown as W).__mf42.use(id), id),
  teleport: (x: number, y: number, z: number, yaw = 0) =>
    page.evaluate(
      ([x, y, z, yaw]) => (window as unknown as W).__mf42.teleport(x!, y!, z!, yaw),
      [x, y, z, yaw],
    ),
  noise: (x: number, y: number, z: number, l: number) =>
    page.evaluate(([x, y, z, l]) => (window as unknown as W).__mf42.noise(x!, y!, z!, l), [x, y, z, l]),
  info: () => page.evaluate(() => (window as unknown as W).__mf42.info()),
  mode: () => page.evaluate(() => (window as unknown as W).__mf42.mode),
  inv: () => page.evaluate(() => (window as unknown as W).__mf42.inventory()),
});

/** Simulates in chunks until `cond` holds (or gives up). */
async function until(page: Page, cond: () => Promise<boolean>, maxSeconds = 60, chunk = 1): Promise<boolean> {
  const a = api(page);
  for (let t = 0; t < maxSeconds; t += chunk) {
    if (await cond()) return true;
    await a.sim(chunk);
  }
  return cond();
}

test('the cellar: bottles, the creature, Ežo, the valve puzzle and the way on', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r4&test&q=low&seed=5');
  await page.waitForFunction(() => (window as unknown as { __mf42: Api }).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  const a = api(page);
  expect((await a.info()).reality).toBe('r4');

  // empty bottles to throw
  expect(await a.use('bottles')).toBe(true);
  expect((await a.inv()).find((s) => s.item === 'flasa')?.count).toBe(4);

  // a noise near a vent brings the creature out; when it stays quiet it goes back in
  await a.teleport(0, -3, -14.5, 0);
  await a.noise(0, -3, -21, 1.2);
  await a.sim(0.3);
  expect((await a.info()).entities[0]!.state).not.toBe('hidden');
  expect(await until(page, async () => (await a.info()).entities[0]!.state === 'hidden', 30)).toBe(true);

  // Ežo greets you in the boiler room (the creature never comes in)
  await a.teleport(0, -3, -50.5, 0);
  expect(await until(page, async () => !!(await a.info()).flags['cellar.ezo'], 60)).toBe(true);

  // his logbook holds the valve order
  expect(await until(page, () => a.use('logbook'), 20, 0.5)).toBe(true);
  await page.waitForSelector('.doc', { timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.doc', { state: 'detached', timeout: 10_000 });

  // a wrong valve resets the sequence
  expect(await until(page, () => a.use('valve0'), 20, 0.5)).toBe(true);
  await a.sim(2);
  // the right order: the end (10^100), the beginning (10^14), the middle (10^40)
  for (const v of ['valve2', 'valve0', 'valve1']) {
    expect(await until(page, () => a.use(v), 30, 0.5)).toBe(true);
    await a.sim(1.5);
  }
  expect(await until(page, async () => !!(await a.info()).flags['cellar.solved'], 30)).toBe(true);

  // the water rises and the overflow pipe carries you on to the spa
  await a.sim(8);
  expect(await a.use('pipe')).toBe(true);
  expect(
    await until(page, async () => (await a.info()).reality === 'r5' && (await a.mode()) === 'play', 120, 0.5),
  ).toBe(true);
  expect(errors).toEqual([]);
});

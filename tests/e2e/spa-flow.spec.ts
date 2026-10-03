import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  noise(x: number, y: number, z: number, loudness?: number, kind?: string): void;
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
  splash: (x: number, y: number, z: number) =>
    page.evaluate(([x, y, z]) => (window as unknown as W).__mf42.noise(x!, y!, z!, 0.6, 'splash'), [x, y, z]),
  info: () => page.evaluate(() => (window as unknown as W).__mf42.info()),
  mode: () => page.evaluate(() => (window as unknown as W).__mf42.mode),
  inv: () => page.evaluate(() => (window as unknown as W).__mf42.inventory()),
});

async function until(page: Page, cond: () => Promise<boolean>, maxSeconds = 60, chunk = 1): Promise<boolean> {
  const a = api(page);
  for (let t = 0; t < maxSeconds; t += chunk) {
    if (await cond()) return true;
    await a.sim(chunk);
  }
  return cond();
}

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r5&test&q=low&seed=5');
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  return errors;
}

const flag = (page: Page, k: string) => async () => !!(await api(page).info()).flags[k];

test('the spa: ducks, Ežo, the pump room, the key, the door and the whirlpool', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  expect((await a.info()).reality).toBe('r5');

  expect(await a.use('ducks')).toBe(true);
  expect((await a.inv()).find((s) => s.item === 'kacka')?.count).toBe(3);

  // Ežo in the warm pool gives absinthe and the way on
  await a.teleport(1.7, 0, -52.6, 2.09);
  expect(await until(page, flag(page, 'spa.ezo'), 90)).toBe(true);
  expect((await a.inv()).some((s) => s.item === 'absint')).toBe(true);

  // the pump room: open the drain of the diving pool and lower the big pool
  await a.teleport(-24.5, 0, -22, -Math.PI / 2);
  expect(await until(page, () => a.use('vypust'), 10, 0.5)).toBe(true);
  expect(await until(page, flag(page, 'spa.vypust'), 10, 0.5)).toBe(true);
  expect(await until(page, () => a.use('prepad'), 10, 0.5)).toBe(true);
  expect(await until(page, flag(page, 'spa.prepad'), 10, 0.5)).toBe(true);

  // the key hangs under the lifeguard: look away until he slips into the water, then take it
  await a.teleport(2, 0, -13, Math.PI);
  expect(await until(page, async () => (await a.info()).entities[0]!.state !== 'chair', 20)).toBe(true);
  expect(await a.use('key')).toBe(true);
  expect(await flag(page, 'spa.key')()).toBe(true);

  expect(await a.use('diveDoor')).toBe(true);
  expect(await flag(page, 'spa.door')()).toBe(true);

  // off the springboard into the whirlpool; reality 6 isn't built yet, so the preview ends
  await a.teleport(28, 0.9, -20.8, 0);
  await a.sim(0.3);
  expect(await a.use('board')).toBe(true);
  expect(
    await until(page, () => page.evaluate(() => !!document.querySelector('.ending-text')), 40, 0.25),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('the lifeguard pulls a wader under', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  // nobody watches the chair: he slips into the water
  await a.teleport(2, 0, -13, Math.PI);
  expect(await until(page, async () => (await a.info()).entities[0]!.state !== 'chair', 20)).toBe(true);
  // wading on the flooded deck, splashing
  await a.teleport(-15.5, -0.34, -22, Math.PI / 2);
  const caught = await until(
    page,
    async () => {
      if ((await a.mode()) === 'okno') return true;
      await a.splash(-15.5, -0.34, -22);
      return false;
    },
    40,
    0.4,
  );
  expect(caught).toBe(true);
  expect(errors).toEqual([]);
});

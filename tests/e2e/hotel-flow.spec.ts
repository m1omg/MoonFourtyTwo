import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  subtitle(): string;
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
  subtitle: () => page.evaluate(() => (window as unknown as W).__mf42.subtitle()),
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

async function open(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./#r7&test&q=low&seed=7${extra}`);
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  return errors;
}

const flag = (page: Page, k: string) => async () => !!(await api(page).info()).flags[k];

test('the hotel: the guestbook, three keys, Ežo by the fire and out of the window', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  // the chambermaid is tested on her own below; here she must not end the walk early
  const errors = await open(page, '&god');
  const a = api(page);
  expect((await a.info()).reality).toBe('r7');

  // read the guestbook, then sign it (a checkpoint)
  expect(await a.use('guestbook')).toBe(true);
  expect(await a.use('guestbook')).toBe(true);
  expect((await a.info()).checkpoint).toBe('book');

  // the salónik is locked until you have its three keys
  expect(await a.use('salonDoor')).toBe(true);
  expect(await flag(page, 'hotel.salon')()).toBe(false);
  for (const era of ['1906', '1e14', 'tallies']) expect(await a.use(`key:${era}`)).toBe(true);
  expect(await a.use('salonDoor')).toBe(true);
  expect(await flag(page, 'hotel.salon')()).toBe(true);

  // Ežo by the dying fire
  await a.teleport(-1.5, 0, -42.5, -0.99);
  expect(await until(page, flag(page, 'hotel.ezo'), 60)).toBe(true);
  expect((await a.info()).checkpoint).toBe('salon');

  // out of the window, into the snow of reality 8
  expect(await a.use('salonWindow')).toBe(true);
  expect(
    await until(page, async () => (await a.mode()) === 'play' && (await a.info()).reality === 'r8', 60, 0.5),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('hiding in a wardrobe, and the chambermaid who sees you', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  // into the wardrobe of the 2026 room and out again
  await a.teleport(-2.2, 0, -12.6, 0.85);
  await a.sim(0.3);
  expect(await a.use('hide:2026:wardrobe')).toBe(true);
  const inside = (await a.info()).pos;
  expect(inside[0]!).toBeLessThan(-6.5);
  expect(await a.use('hide:2026:wardrobe')).toBe(true);
  expect((await a.info()).pos[0]!).toBeGreaterThan(inside[0]!);
  // stand in the corridor in front of her: she comes for you
  const maid = (await a.info()).entities.find((e) => e.id === 'chyzna')!;
  await a.teleport(0, 0, maid.pos[2]! + 4, 0);
  expect(await until(page, async () => (await a.mode()) === 'okno', 30, 0.5)).toBe(true);
  expect(errors).toEqual([]);
});

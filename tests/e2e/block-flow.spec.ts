import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  choosing: boolean;
  sim(s: number): void;
  move(x: number, y: number): void;
  use(id: string): boolean;
  pick(i: number): boolean;
  setBac(v: number): void;
  subtitle(): string;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  inventory(): Array<{ item: string | null; count: number }>;
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
  pick: (i: number) => page.evaluate((i) => (window as unknown as W).__mf42.pick(i), i),
  choosing: () => page.evaluate(() => (window as unknown as W).__mf42.choosing),
  setBac: (v: number) => page.evaluate((v) => (window as unknown as W).__mf42.setBac(v), v),
  subtitle: () => page.evaluate(() => (window as unknown as W).__mf42.subtitle()),
  teleport: (x: number, y: number, z: number, yaw = 0) =>
    page.evaluate(
      ([x, y, z, yaw]) => (window as unknown as W).__mf42.teleport(x!, y!, z!, yaw),
      [x, y, z, yaw],
    ),
  standUp: () =>
    page.evaluate(() => {
      const m = (window as unknown as W).__mf42;
      m.move(0, 1);
      m.sim(0.2);
      m.move(0, 0);
      m.sim(0.3);
    }),
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
  await page.goto('./#r6&test&q=low&seed=6');
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  return errors;
}

const flag = (page: Page, k: string) => async () => !!(await api(page).info()).flags[k];
const count = async (page: Page, item: string) =>
  (await api(page).inv()).find((s) => s.item === item)?.count ?? 0;

test("the housing estate: the bathtub, the intercom, the caretaker's key and the lift to ∞", async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  expect((await a.info()).reality).toBe('r6');

  // out of the tub
  await a.standUp();
  expect((await a.info()).checkpoint).toBe('flat');

  // the slivovica behind the glass and two beers in the fridge
  expect(await a.use('wallunit')).toBe(true);
  expect(await count(page, 'slivovica')).toBe(1);
  expect(await a.use('fridge')).toBe(true);
  expect(await count(page, 'pivo')).toBe(2);

  // out into the stairwell; down to the ground floor
  expect(await a.use('flatDoor')).toBe(true);
  expect(await flag(page, 'blok.out')()).toBe(true);
  await a.teleport(0.2, 0, -1.8, 0);
  expect(await until(page, flag(page, 'blok.ground'), 3, 0.5)).toBe(true);

  // Ežo answers the intercom
  await a.teleport(-1.0, 0, -5.4, -Math.PI / 2);
  expect(await a.use('intercom')).toBe(true);
  expect(await until(page, flag(page, 'blok.ezo'), 40)).toBe(true);

  // his flat is open; the lift key lies on the desk
  await a.teleport(2.2, 0, -2.6, -Math.PI / 2);
  expect(await a.use('caretakerDoor')).toBe(true);
  await a.sim(1);
  await a.teleport(5.6, 0, -2.6, 0);
  expect(await a.use('key')).toBe(true);
  expect(await flag(page, 'blok.key')()).toBe(true);

  // the lift opens with the key; sober, its buttons go nowhere
  await a.teleport(-2.0, 0, -2.6, Math.PI / 2);
  expect(await a.use('lift')).toBe(true);
  await a.sim(1.5);
  await a.teleport(-3.8, 0, -2.6, Math.PI);
  await a.sim(0.3);
  expect(await a.use('panel')).toBe(true);
  await a.sim(0.3);
  expect(await a.subtitle()).toContain('Gombíky');

  // drunk, the panel has more buttons; the last one leads on (reality 7 isn't built yet)
  await a.setBac(1.6);
  expect(await a.use('panel')).toBe(true);
  expect(await until(page, a.choosing, 20, 0.5)).toBe(true);
  expect(await a.pick(3)).toBe(true);
  expect(
    await until(page, () => page.evaluate(() => !!document.querySelector('.ending-text')), 40, 0.25),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('the stairs above the eighth floor only lead back to the ninth', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  await a.standUp();
  for (let i = 1; i <= 6; i++) {
    // step onto the tenth landing: you are on the ninth again, and it counts on
    await a.teleport(-1.6, 28.0, -2.0, Math.PI);
    await a.sim(0.2);
    const now = await a.info();
    expect(now.pos[1]!).toBeLessThan(26);
    expect(now.flags['blok.loop']).toBe(i);
  }
  // the ninth landing now says 40
  expect(await until(page, async () => (await a.subtitle()).includes('Štyridsiate'), 4, 0.5)).toBe(true);
  // back on the eighth floor the count starts over
  await a.teleport(0.2, 22.4, -1.8, 0);
  await a.sim(0.3);
  expect((await a.info()).flags['blok.loop']).toBe(0);
  expect(errors).toEqual([]);
});

test('a neighbour takes someone who lingers on a dark landing', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  await a.standUp();
  await a.teleport(0.6, 14, -1.6, 0);
  expect(await until(page, async () => (await a.mode()) === 'okno', 40, 0.5)).toBe(true);
  expect(errors).toEqual([]);
});

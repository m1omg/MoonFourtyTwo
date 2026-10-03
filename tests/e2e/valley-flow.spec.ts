import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  press(a: string): void;
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

async function open(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./#r8&test&q=low&seed=8${extra}`);
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  return errors;
}

const figure = async (page: Page, id: string) => (await api(page).info()).entities.find((e) => e.id === id)!;

test('the valley: Ežo’s torch, batteries, Čierne at the shelter and the bus', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  // the figures are tested on their own below; here they must not end the walk early
  const errors = await open(page, '&god');
  const a = api(page);
  expect((await a.info()).reality).toBe('r8');

  // the torch on the first barrel, then a battery from the snow
  expect(await a.use('flashlight')).toBe(true);
  expect((await a.info()).flags['dol.torch']).toBe(1);
  expect(await a.use('battery:0')).toBe(true);
  expect((await a.info()).flags['dol.bat0']).toBe(1);

  // the shot of Čierne on the shelter's bench (a checkpoint), drunk where you stand
  await a.teleport(-0.4, 0, -263.4, Math.PI);
  await a.sim(0.3);
  expect(await a.use('cierne')).toBe(true);
  expect((await a.info()).checkpoint).toBe('shelter');
  await a.press('drink');
  // the hole evaporates, the dark, the bus (reality 9 isn't built yet, so the preview ends)
  expect(
    await until(page, () => page.evaluate(() => !!document.querySelector('.ending-text')), 40, 0.5),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('a frost figure stands still in your light and comes for you in the dark', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page);
  const a = api(page);
  expect(await a.use('flashlight')).toBe(true);
  // face the first figure from a few metres, torch on: it does not move
  const f0 = await figure(page, 'mrazivec-0');
  await a.teleport(f0.pos[0]!, 0, f0.pos[2]! + 5, 0);
  await a.press('light');
  await a.sim(3);
  const lit = await figure(page, 'mrazivec-0');
  expect(lit.state).toBe('still');
  expect(Math.hypot(lit.pos[0]! - f0.pos[0]!, lit.pos[2]! - f0.pos[2]!)).toBeLessThan(0.1);
  // light off: it comes
  await a.press('light');
  expect(await until(page, async () => (await a.mode()) === 'okno', 20, 0.5)).toBe(true);
  expect(errors).toEqual([]);
});

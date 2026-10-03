import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  choosing: boolean;
  sim(s: number): void;
  use(id: string): boolean;
  pick(i: number): boolean;
  look(dx: number, dy: number): void;
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
  pick: (i: number) => page.evaluate((i) => (window as unknown as W).__mf42.pick(i), i),
  choosing: () => page.evaluate(() => (window as unknown as W).__mf42.choosing),
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

const oknos: string[] = [];

async function open(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  oknos.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const hit = /^okno: (.*)$/.exec(m.text());
    if (hit) oknos.push(hit[1]!);
  });
  await page.goto(`./#r11${extra}&test&q=low&seed=11`);
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  return errors;
}

const endingText = (page: Page) =>
  page.evaluate(() => document.querySelector('.ending-text')?.textContent ?? '');

test('the last round: the truth, the stove, the last two shots and „Na zdravie"', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  // the shades are tested on their own below; here they must not end the round early
  const errors = await open(page, '&god');
  const a = api(page);
  expect((await a.info()).reality).toBe('r11');

  // sit down with Ežo; he tells it; ask nothing more
  expect(await a.use('seat')).toBe(true);
  expect(await until(page, () => a.choosing(), 120, 0.5)).toBe(true);
  expect(await a.pick(3)).toBe(true);
  // they come: keep the stove burning for a minute and a half
  expect(await until(page, async () => !!(await a.info()).flags['round.talked'], 90, 0.5)).toBe(true);
  for (const key of ['cigs', 'photo', 'dart', 'chair0', 'chair1', 'bull']) {
    await a.sim(14);
    expect(await a.use(`fuel:${key}`)).toBe(true);
    expect(await a.use('stove')).toBe(true);
  }
  expect(await until(page, async () => !!(await a.info()).flags['round.survived'], 60)).toBe(true);
  expect((await a.info()).checkpoint).toBe('last');
  // the last two: clink
  expect(await a.use('seat')).toBe(true);
  expect(await until(page, () => a.choosing(), 30, 0.5)).toBe(true);
  expect(await a.pick(0)).toBe(true);
  expect(await until(page, async () => !!(await a.info()).flags['round.cheers'], 30, 0.5)).toBe(true);
  // into the light: the epilogue
  expect(
    await until(page, async () => (await a.mode()) === 'play' && (await a.info()).reality === 'r12', 60, 0.5),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('„Ešte chvíľu": they stay, and the pub goes out around them', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page, ':last&god');
  const a = api(page);
  expect(await a.use('seat')).toBe(true);
  expect(await until(page, () => a.choosing(), 30, 0.5)).toBe(true);
  expect(await a.pick(1)).toBe(true);
  expect(await until(page, async () => (await endingText(page)).includes('Navždy'), 120)).toBe(true);
  expect(errors).toEqual([]);
});

test('when the stove goes out, they come for you', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors = await open(page, ':siege');
  const a = api(page);
  expect(await until(page, async () => (await a.mode()) === 'okno', 120)).toBe(true);
  expect(oknos).toHaveLength(1);
  expect(oknos[0]).toMatch(/^tien-/);
  expect(errors).toEqual([]);
});

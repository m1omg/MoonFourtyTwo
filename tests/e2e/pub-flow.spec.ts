import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  pick(i: number): boolean;
  choosing: boolean;
  press(a: string): void;
  setBac(v: number): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  inventory(): Array<{ item: string | null; count: number }>;
  info(): { flags: Record<string, number>; bac: number; pos: number[]; checkpoint: string };
  subtitle(): string;
};

const api = (page: Page) => ({
  sim: (s: number) => page.evaluate((s) => (window as unknown as { __mf42: Api }).__mf42.sim(s), s),
  use: (id: string) => page.evaluate((id) => (window as unknown as { __mf42: Api }).__mf42.use(id), id),
  pick: (i: number) => page.evaluate((i) => (window as unknown as { __mf42: Api }).__mf42.pick(i), i),
  choosing: () => page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.choosing),
  press: (a: string) => page.evaluate((a) => (window as unknown as { __mf42: Api }).__mf42.press(a), a),
  setBac: (v: number) => page.evaluate((v) => (window as unknown as { __mf42: Api }).__mf42.setBac(v), v),
  teleport: (x: number, y: number, z: number, yaw = 0) =>
    page.evaluate(
      ([x, y, z, yaw]) => (window as unknown as { __mf42: Api }).__mf42.teleport(x!, y!, z!, yaw),
      [x, y, z, yaw],
    ),
  info: () => page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.info()),
  standUp: () =>
    page.evaluate(() => {
      const m = (window as unknown as { __mf42: Api & { move(x: number, y: number): void } }).__mf42;
      m.move(0, -1);
      m.sim(0.3);
      m.move(0, 0);
      m.sim(0.2);
    }),
  inv: () => page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.inventory()),
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

test('the pub evening plays through to the frozen pub', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r1&test&q=low&seed=11');
  await page.waitForFunction(() => (window as unknown as { __mf42: Api }).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  const a = api(page);

  // intro: Ežo toasts, we drink the beer
  await a.sim(12);
  await a.press('drink');
  expect(await until(page, async () => ((await a.info()).flags['pub.intro'] ?? 0) === 1, 90)).toBe(true);

  // stand up, order two borovičky at the bar
  await a.standUp();
  await a.teleport(-1.2, 0, -1.7, 0);
  await a.sim(0.5);
  expect(await a.use('vierka')).toBe(true);
  expect(await until(page, () => a.choosing(), 20, 0.5)).toBe(true);
  await a.pick(0);
  expect(
    await until(page, async () => (await a.inv()).some((s) => s.item === 'borovicka' && s.count === 2), 30),
  ).toBe(true);

  // back to the table and toast
  await a.teleport(3.0, 0, 2.0, Math.PI);
  await a.sim(0.5);
  expect(await a.use('seat')).toBe(true);
  await a.sim(1);
  await a.use('ezo');
  expect(await until(page, async () => ((await a.info()).flags['pub.rounds'] ?? 0) >= 1, 60)).toBe(true);

  // fast-forward: drunk enough after two rounds -> the glyph appears and Ežo comments
  await page.evaluate(() => {
    const w = window as unknown as { game?: unknown };
    void w;
  });
  await a.setBac(1.35);
  // second round
  await a.sim(3);
  await a.standUp();
  await a.teleport(-1.2, 0, -1.7, 0);
  await a.sim(0.5);
  // Ežo may still be musing after the first round: order once he is done
  expect(await until(page, () => a.use('vierka'), 30, 0.5)).toBe(true);
  expect(await until(page, () => a.choosing(), 20, 0.5)).toBe(true);
  await a.pick(2); // two beers
  await until(page, async () => (await a.inv()).some((s) => s.item === 'pivo' && s.count === 2), 30);
  await a.teleport(3.0, 0, 2.0, Math.PI);
  await a.sim(0.5);
  await a.use('seat');
  await a.sim(1);
  await a.use('ezo');
  expect(await until(page, async () => ((await a.info()).flags['pub.rounds'] ?? 0) >= 2, 60)).toBe(true);
  await a.setBac(1.35);
  expect(await until(page, async () => ((await a.info()).flags['pub.glyph'] ?? 0) === 1, 30)).toBe(true);

  // the WC: peeking in and straight back out leaves its door open (it used to shut with you
  // outside, and then nothing happened when you came back)
  await a.sim(8);
  await a.standUp();
  const wcDoorOpen = () =>
    page.evaluate(() => {
      const g = (window as unknown as { __game: { interactions: { get(id: string): { prompt: unknown } } } })
        .__game;
      const p = g.interactions.get('wcDoor')!.prompt;
      return (typeof p === 'function' ? (p as () => string)() : p) === 'Zavrieť';
    });
  await a.teleport(-5.4, 0, -1.2, Math.PI / 2);
  expect(await a.use('wcDoor')).toBe(true);
  await a.sim(1);
  expect(await wcDoorOpen()).toBe(true);
  await a.teleport(-7.0, 0, -1.8, Math.PI / 2);
  await a.sim(0.6);
  await a.teleport(-5.0, 0, -1.2, -Math.PI / 2);
  for (let i = 0; i < 8; i++) await a.sim(0.5);
  expect(await wcDoorOpen()).toBe(true);
  // in properly: the door shuts behind you, something knocks, the stall is empty, the pub
  // freezes behind the closed door
  await a.teleport(-7.6, 0, -1.6, Math.PI / 2);
  expect(await until(page, async () => !(await wcDoorOpen()), 8, 0.25)).toBe(true);
  const subtitle = () => page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.subtitle());
  expect(await until(page, async () => (await subtitle()).includes('klope'), 15, 0.25)).toBe(true);
  await a.use('stall');
  expect(await until(page, async () => ((await a.info()).flags['pub.r2'] ?? 0) === 1, 40)).toBe(true);
  expect((await a.info()).checkpoint).toBe('frozen');
  await page.screenshot({ path: 'test-results/pub-flow-frozen.png' });
  expect(errors, errors.join('\n')).toHaveLength(0);
});

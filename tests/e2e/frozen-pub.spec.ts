import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  aim(x: number, y: number, z: number): void;
  info(): {
    flags: Record<string, number>;
    pos: number[];
    checkpoint: string;
    entities: Array<{ id: string; state: string; pos: number[] }>;
  };
};

const mf = (page: Page) => ({
  sim: (s: number) => page.evaluate((s) => (window as unknown as { __mf42: Api }).__mf42.sim(s), s),
  use: (id: string) => page.evaluate((id) => (window as unknown as { __mf42: Api }).__mf42.use(id), id),
  mode: () => page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.mode),
  info: () => page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.info()),
  teleport: (x: number, z: number, yaw = 0) =>
    page.evaluate(
      ([x, z, yaw]) => (window as unknown as { __mf42: Api }).__mf42.teleport(x!, 0, z!, yaw),
      [x, z, yaw],
    ),
  aim: (x: number, y: number, z: number) =>
    page.evaluate(([x, y, z]) => (window as unknown as { __mf42: Api }).__mf42.aim(x!, y!, z!), [x, y, z]),
});

async function until(
  page: Page,
  cond: () => Promise<boolean>,
  maxSeconds = 60,
  chunk = 0.5,
): Promise<boolean> {
  const a = mf(page);
  for (let t = 0; t < maxSeconds; t += chunk) {
    if (await cond()) return true;
    await a.sim(chunk);
  }
  return cond();
}

test('a blackout in the frozen pub wakes you by Ežo, not in a loop in the WC', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r1:frozen&test&q=low&seed=5');
  await page.waitForFunction(() => (window as unknown as { __mf42: Api }).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  const a = mf(page);
  const standUp = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __mf42: Api & { move(x: number, y: number): void } }).__mf42;
      m.move(0, -1);
      m.sim(0.3);
      m.move(0, 0);
      m.sim(0.2);
    });
  await a.sim(1);

  // walk up to Ežo's table: he is stuck repeating himself, and you sit down mid-sentence. He
  // finishes the sentence and then talks to you (that talk used to be dropped).
  await a.teleport(3.0, 2.0, Math.PI);
  const subtitle = () => page.evaluate(() => document.querySelector('.subtitles')?.textContent ?? '');
  expect(await until(page, async () => (await subtitle()).includes('Sadni si'), 20, 0.25)).toBe(true);
  expect(await a.use('seat2')).toBe(true);
  expect(await until(page, async () => ((await a.info()).flags['pub.r2talk'] ?? 0) === 1, 60)).toBe(true);
  expect((await a.info()).checkpoint).toBe('frozenTable');
  await standUp();

  // the regulars cannot come through the closed WC door (nor its walls), even unwatched
  await a.teleport(-8.4, -2.6, 0);
  await a.aim(-8.9, 1.0, -3.2);
  await a.sim(10);
  expect(await a.mode()).toBe('play');
  for (const e of (await a.info()).entities) expect(e.pos[0]!).toBeGreaterThan(-6.0);

  // stand in the middle of the room looking at the wall: they come for you
  await a.teleport(0.5, 1.0, 0);
  await a.aim(0.5, 1.5, -4.4);
  expect(await until(page, async () => (await a.mode()) !== 'play', 30, 0.25)).toBe(true);
  // the blackout passes (fade on sim time, the screen on wall time, then the reload)
  await a.sim(1);
  await page.waitForFunction(() => (window as unknown as { __mf42: Api }).__mf42.mode === 'play', null, {
    timeout: 120_000,
  });

  // you wake beside Ežo's table, facing the regulars, who wait at their table
  const woke = await a.info();
  expect(woke.checkpoint).toBe('frozenTable');
  expect(Math.hypot(woke.pos[0]! - 2.2, woke.pos[2]! - 2.3)).toBeLessThan(0.3);
  for (const e of woke.entities) expect(Math.hypot(e.pos[0]! + 4.3, e.pos[2]! - 2.6)).toBeLessThan(1.5);
  // and as long as you keep your eyes on them, they stay put
  await a.sim(6);
  expect(await a.mode()).toBe('play');
  expect(errors, errors.join('\n')).toHaveLength(0);
});

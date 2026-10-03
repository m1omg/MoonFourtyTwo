import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  subtitle(): string;
  info(): { reality: string; pos: number[] };
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
  info: () => page.evaluate(() => (window as unknown as W).__mf42.info()),
  subtitle: () => page.evaluate(() => (window as unknown as W).__mf42.subtitle()),
});

async function until(page: Page, cond: () => Promise<boolean>, maxSeconds = 60, chunk = 1): Promise<boolean> {
  const a = api(page);
  for (let t = 0; t < maxSeconds; t += chunk) {
    if (await cond()) return true;
    await a.sim(chunk);
  }
  return cond();
}

test('the epilogue: from the light back to the pub, one more, and the credits', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r12&test&q=low&seed=12');
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  const a = api(page);
  expect((await a.info()).reality).toBe('r12');
  // the film, then the town (in short steps: the script's waits chain between them)
  expect(await until(page, async () => (await a.subtitle()).includes('Mestečko'), 70)).toBe(true);
  // the door is not even locked
  expect(await a.use('frontDoor')).toBe(true);
  await a.teleport(2.4, 0, 1.4, Math.PI);
  await a.sim(6);
  // sit down with Ežo: one more, and the screen goes to the title and the credits
  expect(await a.use('seat')).toBe(true);
  expect(
    await until(page, () => page.evaluate(() => !!document.querySelector('.credits-roll')), 60, 0.5),
  ).toBe(true);
  await page.click('.credits-roll ~ button, .screen button');
  expect(errors).toEqual([]);
});

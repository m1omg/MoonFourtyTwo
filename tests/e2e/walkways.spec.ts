import { test, expect, type Page } from '@playwright/test';

/**
 * Ways the player must be able to walk, checked with the player's own capsule over the real
 * colliders (the story tests teleport, so they never notice a blocked way).
 */
type Api = {
  ready: boolean;
  sim(s: number): void;
  use(id: string): boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  aim(x: number, y: number, z: number): void;
  reachable(x: number, z: number, margin?: number): boolean;
  info(): { reality: string; focused: string | null };
};
type W = { __mf42: Api };

const api = (page: Page) => ({
  sim: (s: number) => page.evaluate((s) => (window as unknown as W).__mf42.sim(s), s),
  use: (id: string) => page.evaluate((id) => (window as unknown as W).__mf42.use(id), id),
  teleport: (x: number, z: number, yaw = 0) =>
    page.evaluate(([x, z, yaw]) => (window as unknown as W).__mf42.teleport(x!, 0, z!, yaw), [x, z, yaw]),
  aim: (x: number, y: number, z: number) =>
    page.evaluate(([x, y, z]) => (window as unknown as W).__mf42.aim(x!, y!, z!), [x, y, z]),
  reachable: (x: number, z: number, margin = 4) =>
    page.evaluate(([x, z, m]) => (window as unknown as W).__mf42.reachable(x!, z!, m), [x, z, margin]),
  info: () => page.evaluate(() => (window as unknown as W).__mf42.info()),
});

async function open(page: Page, hash: string): Promise<ReturnType<typeof api>> {
  await page.goto(`./#${hash}&test&q=low&seed=7`);
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  return api(page);
}

/** From the floor by Ežo's table to the front door, and its prompt from there. */
async function toTheFrontDoor(a: ReturnType<typeof api>): Promise<void> {
  await a.teleport(2.2, 1.6, Math.PI);
  await a.sim(0.2);
  expect(await a.reachable(-4.2, 3.9, 5)).toBe(true);
  await a.teleport(-4.2, 3.7, Math.PI);
  await a.aim(-4.2, 1.05, 4.5);
  await a.sim(0.1);
  expect((await a.info()).focused).toBe('frontDoor');
}

test('the pub: the front door can be walked to from inside', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const a = await open(page, 'r1');
  await toTheFrontDoor(a);
  // and out onto the square, once it is open
  expect(await a.use('frontDoor')).toBe(true);
  await a.sim(1.5);
  await a.teleport(2.2, 1.6, Math.PI);
  expect(await a.reachable(-4.2, 6.2, 6)).toBe(true);
  expect(errors).toEqual([]);
});

test('the frozen pub: the front door can be walked to past the regulars', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const a = await open(page, 'r1:frozenTable');
  await toTheFrontDoor(a);
  expect(errors).toEqual([]);
});

test('the epilogue: from the square in through the door to the seat', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const a = await open(page, 'r12:square');
  expect((await a.info()).reality).toBe('r12');
  await a.sim(1);
  expect(await a.use('frontDoor')).toBe(true);
  await a.sim(1.5);
  await a.teleport(-4.2, 6.5, 0);
  expect(await a.reachable(3.0, 1.95, 5)).toBe(true);
  expect(errors).toEqual([]);
});

import { test, expect, type Page } from '@playwright/test';

type Info = {
  pos: number[];
  checkpoint: string;
  flags: Record<string, number>;
  entities: Array<{ id: string; state: string }>;
};
type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  info(): Info;
};
type W = { __mf42: Api };

const ready = (page: Page) =>
  page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, { timeout: 180_000 });
const sim = (page: Page, s: number) => page.evaluate((s) => (window as unknown as W).__mf42.sim(s), s);
const info = (page: Page) => page.evaluate(() => (window as unknown as W).__mf42.info());
const mode = (page: Page) => page.evaluate(() => (window as unknown as W).__mf42.mode);
const inWc = (p: number[]) => p[0]! < -6.15 && p[2]! < 0.2 && p[2]! > -3.2;

test('after an okno in the frozen pub, the two regulars wait until you leave the WC', async ({
  page,
}, ti) => {
  test.skip(ti.project.name !== 'desktop');
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r1:frozen&test&q=low&saves');
  await ready(page);
  await sim(page, 0.5);

  // sit with Ežo: he explains, then the regulars wake up and come for you while you listen
  expect(await page.evaluate(() => (window as unknown as W).__mf42.use('seat2'))).toBe(true);
  for (let i = 0; i < 40 && !(await info(page)).flags['pub.r2talk']; i++) await sim(page, 1);
  expect((await info(page)).flags['pub.r2talk']).toBe(1);
  for (let i = 0; i < 30 && (await mode(page)) === 'play'; i++) await sim(page, 0.5);
  expect(await mode(page)).not.toBe('play');

  // the okno plays out (game time has to keep going for its fade), then you are back
  for (let i = 0; i < 240 && (await mode(page)) !== 'play'; i++) {
    await sim(page, 0.25);
    await page.waitForTimeout(250);
  }
  await ready(page);

  // back at the checkpoint in the WC: nobody comes while you stay there
  const back = await info(page);
  expect(back.checkpoint).toBe('frozen');
  expect(inWc(back.pos)).toBe(true);
  await sim(page, 15);
  expect(await mode(page)).toBe('play');
  expect(inWc((await info(page)).pos)).toBe(true);

  // out of the WC they wake again
  await page.evaluate(() => (window as unknown as W).__mf42.teleport(-5.4, 0, -1.4, -Math.PI / 2));
  await sim(page, 2.5);
  const states = (await info(page)).entities.map((e) => e.state);
  expect(states.some((s) => s === 'creep' || s === 'frozen')).toBe(true);
  expect(errors).toEqual([]);
});

import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  sim(s: number): void;
  use(id: string): boolean;
  info(): { reality: string; mats: string[] };
};
type W = { __mf42: Api };

const api = (page: Page) => ({
  sim: (s: number) => page.evaluate((s) => (window as unknown as W).__mf42.sim(s), s),
  use: (id: string) => page.evaluate((id) => (window as unknown as W).__mf42.use(id), id),
  info: () => page.evaluate(() => (window as unknown as W).__mf42.info()),
});

test('a beer mat with Ežo’s note: picked up once, counted, gone', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r10&test&q=low&seed=10');
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 180_000,
  });
  const a = api(page);
  await a.sim(0.5);
  expect((await a.info()).mats).toEqual([]);
  expect(await a.use('beermat:r10')).toBe(true);
  // the note on its back
  await expect(page.locator('.doc h3')).toHaveText('Podtácka č. 10');
  await page.locator('.doc').click();
  expect((await a.info()).mats).toEqual(['r10']);
  // it is in your pocket now, not on the bench
  expect(await a.use('beermat:r10')).toBe(false);
  expect(errors).toEqual([]);
});

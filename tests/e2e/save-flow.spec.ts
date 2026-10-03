import { test, expect, type Page } from '@playwright/test';

type Api = {
  ready: boolean;
  sim(s: number): void;
  use(id: string): boolean;
  info(): { reality: string; checkpoint: string; mats: string[] };
};
type W = { __mf42: Api };

const ready = (page: Page) =>
  page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, { timeout: 180_000 });
const use = (page: Page, id: string) => page.evaluate((id) => (window as unknown as W).__mf42.use(id), id);
const info = (page: Page) => page.evaluate(() => (window as unknown as W).__mf42.info());

test('a checkpoint and a found beer mat outlive closing the game: „Pokračovať"', async ({ page }, ti) => {
  test.skip(ti.project.name !== 'desktop');
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // play a little of the hall (checkpoints are saved even in test mode with &saves)
  await page.goto('./#r3&test&q=low&saves');
  await ready(page);
  await page.evaluate(() => (window as unknown as W).__mf42.sim(0.5));
  expect(await use(page, 'beermat:r3')).toBe(true);
  await page.locator('.doc').click();

  // close the game and open it again, as a player would (no debug start)
  await page.goto('./?again#test&q=low');
  const ok = page.getByRole('button', { name: 'Rozumiem' });
  const cont = page.getByRole('button', { name: 'Pokračovať', exact: true });
  await expect(ok.or(cont)).toBeVisible({ timeout: 120_000 });
  if (await ok.isVisible()) await ok.click();
  await cont.click();
  await ready(page);

  const i = await info(page);
  expect(i.reality).toBe('r3');
  expect(i.mats).toEqual(['r3']);
  // the mat is in your pocket, not on Ežo's table
  expect(await use(page, 'beermat:r3')).toBe(false);
  expect(errors).toEqual([]);
});

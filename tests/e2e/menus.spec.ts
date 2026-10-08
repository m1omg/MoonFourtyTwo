import { test, expect } from '@playwright/test';

type Api = {
  ready: boolean;
  mode: string;
  sim(s: number): void;
  use(id: string): boolean;
  choosing: boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  give(id: string, n?: number): void;
  inventory(): Array<{ item: string | null; count: number }>;
};
test('Esc during a choice does not pause over it; the number keys answer on any keyboard layout', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#r1&test&q=low&seed=5');
  await page.waitForFunction(() => (window as unknown as { __mf42: Api }).__mf42?.ready === true, null, {
    timeout: 120_000,
  });
  const sim = (s: number) => page.evaluate((s) => (window as unknown as { __mf42: Api }).__mf42.sim(s), s);
  await sim(1);
  // the jukebox asks which song
  await page.evaluate(() =>
    (window as unknown as { __mf42: Api }).__mf42.teleport(5.0, 0, 0.8, -Math.PI / 2),
  );
  await sim(0.5);
  // (not while Ežo is still telling his first stories)
  let asked = false;
  for (let i = 0; i < 120 && !asked; i++) {
    asked = await page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.use('jukebox'));
    if (!asked) await sim(1);
  }
  expect(asked).toBe(true);
  await sim(0.2);
  expect(await page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.choosing)).toBe(true);
  // Esc: no pause menu over the question
  await page.keyboard.press('Escape');
  await sim(0.3);
  const pauseMenu = page.locator('.screen .menu');
  await expect(pauseMenu).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.choosing)).toBe(true);
  // the key in the top row's third place answers, whatever it types (on SK it types š)
  await page.keyboard.down('Digit3');
  await page.keyboard.up('Digit3');
  await sim(0.3);
  expect(await page.evaluate(() => (window as unknown as { __mf42: Api }).__mf42.choosing)).toBe(false);
  // and no pause after it either
  await sim(0.5);
  await expect(pauseMenu).toHaveCount(0);
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('a seventh kind of drink gets a seventh slot instead of vanishing', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(180_000);
  await page.goto('./#r1&test&q=low&seed=5');
  await page.waitForFunction(() => (window as unknown as { __mf42: Api }).__mf42?.ready === true, null, {
    timeout: 120_000,
  });
  const kinds = ['pivo', 'borovicka', 'slivovica', 'fernet', 'horskyCaj', 'kacka', 'cierne'];
  const inv = await page.evaluate((kinds) => {
    const m = (window as unknown as { __mf42: Api }).__mf42;
    for (const k of kinds) m.give(k, 1);
    m.sim(0.1);
    return m.inventory();
  }, kinds);
  expect(inv.filter((s) => s.item).map((s) => s.item)).toEqual(expect.arrayContaining(kinds));
  await expect(page.locator('.hotbar .slot')).toHaveCount(7);
});

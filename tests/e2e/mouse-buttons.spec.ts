import { test, expect, type Page } from '@playwright/test';

type W = {
  __mf42: {
    ready: boolean;
    sim(s: number): void;
    press(a: string): void;
    frames(n: number, hz: number): void;
  };
};

test.use({ viewport: { width: 640, height: 360 } });

async function open(page: Page): Promise<void> {
  await page.goto(`./#r0&test&q=low&seed=3`);
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 120_000,
  });
}

test('the side mouse buttons never take the browser away from the game', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(300_000);
  const cdp = await context.newCDPSession(page);
  const click = async (button: 'back' | 'forward', bit: number) => {
    for (const type of ['mousePressed', 'mouseReleased'] as const)
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x: 320,
        y: 180,
        button,
        buttons: type === 'mousePressed' ? bit : 0,
        clickCount: 1,
      });
    await page.waitForTimeout(1500);
  };
  const stillHere = async (url: string) => {
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => (window as unknown as W).__mf42?.ready === true)).toBe(true);
  };
  // a page to go back to
  await page.goto('about:blank');
  await open(page);
  const url = page.url();
  await click('back', 8);
  await stillHere(url);
  // and one to go forward to
  await page.goto('about:blank');
  await page.goBack();
  await page.waitForFunction(() => (window as unknown as W).__mf42?.ready === true, null, {
    timeout: 120_000,
  });
  await click('forward', 16);
  await stillHere(url);
});

test('a control can be moved to the middle mouse button in the settings', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(240_000);
  await open(page);
  // pause → Nastavenia → Ovládanie: the sprint key takes the middle button
  await page.evaluate(() => {
    const m = (window as unknown as W).__mf42;
    m.press('pause');
    m.sim(0.1);
    m.frames(2, 60);
  });
  await page.getByRole('button', { name: 'Nastavenia' }).click();
  const keys = page.locator('.keys .btn.key');
  await expect(keys.first()).toBeVisible();
  const sprint = keys.nth(4); // forward, back, left, right, sprint
  await sprint.click();
  await expect(sprint).toHaveText(/myši/);
  const box = await sprint.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await expect(keys.nth(4)).toHaveText('Myš 3 (stredné)');
  const saved = await page.evaluate(() =>
    Object.values(localStorage).find((v) => v.includes('"keys"') && v.includes('MouseMiddle')),
  );
  expect(saved).toBeTruthy();
});

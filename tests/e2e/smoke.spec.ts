import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __mf42: {
      ready: boolean;
      mode: string;
      step(seconds: number, hz?: number): void;
      sim(seconds: number): void;
      frames(n: number, hz: number): void;
      move(x: number, y: number, sprint?: boolean): void;
      look(dx: number, dy: number): void;
      press(a: string): void;
      info(): Record<string, unknown>;
      goto(id: string, cp?: string): Promise<void>;
    };
  }
}

const REALITIES = (process.env.REALITIES ?? 'r0').split(',');
/** Checkpoints where the player can walk right away (the pub opens seated, covered by pub-flow). */
const START: Record<string, string> = { r1: 'r1:frozen' };

for (const id of REALITIES) {
  test(`reality ${id} loads and renders`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`./#${START[id] ?? id}&test&q=low&seed=7`);
    await page.waitForFunction(() => window.__mf42?.ready === true, null, { timeout: 120_000 });
    // simulate without rendering every frame (software GL is slow), then render a few frames
    await page.evaluate(() => {
      window.__mf42.sim(3);
      window.__mf42.frames(12, 60);
    });
    const before = (await page.evaluate(() => window.__mf42.info())) as {
      pos: number[];
      render: { calls: number };
    };
    await page.evaluate(() => {
      window.__mf42.move(0, 1);
      window.__mf42.sim(1.5);
      window.__mf42.move(0, 0);
      window.__mf42.sim(0.5);
      window.__mf42.frames(6, 60);
    });
    const after = (await page.evaluate(() => window.__mf42.info())) as {
      pos: number[];
      render: { calls: number };
    };
    await page.screenshot({ path: `test-results/${id}.png` });
    expect(errors, errors.join('\n')).toHaveLength(0);
    expect(after.render.calls).toBeGreaterThan(0);
    expect(after.render.calls).toBeLessThan(400);
    const moved = Math.hypot(after.pos[0]! - before.pos[0]!, after.pos[2]! - before.pos[2]!);
    expect(moved).toBeGreaterThan(0.5);
  });
}

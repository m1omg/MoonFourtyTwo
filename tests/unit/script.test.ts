import { describe, expect, it } from 'vitest';
import { ScriptClock, runScript } from '../../src/sim/narrative/ScriptRunner.ts';

describe('ScriptClock', () => {
  it('resumes waits on the exact tick', async () => {
    const c = new ScriptClock();
    const log: number[] = [];
    void runScript(async () => {
      await c.wait(0.5);
      log.push(c.time);
      await c.wait(1);
      log.push(c.time);
    });
    for (let i = 0; i < 120; i++) {
      c.step(1 / 60);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(log.length).toBe(2);
    expect(log[0]).toBeCloseTo(0.5, 6);
    expect(log[1]).toBeCloseTo(1.5, 6);
  });

  it('cancels pending scripts', async () => {
    const c = new ScriptClock();
    let reached = false;
    const p = runScript(async () => {
      await c.wait(1);
      reached = true;
    });
    c.cancelAll();
    await p;
    for (let i = 0; i < 120; i++) c.step(1 / 60);
    expect(reached).toBe(false);
  });

  it('until() resolves when the condition holds', async () => {
    const c = new ScriptClock();
    let flag = false;
    let done = false;
    void c.until(() => flag).then(() => (done = true));
    c.step(1 / 60);
    await Promise.resolve();
    expect(done).toBe(false);
    flag = true;
    c.step(1 / 60);
    await Promise.resolve();
    expect(done).toBe(true);
  });
});

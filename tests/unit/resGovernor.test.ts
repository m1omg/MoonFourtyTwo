import { describe, expect, it } from 'vitest';
import { ResolutionGovernor } from '../../src/render/resGovernor.ts';

/** Runs frames of `dt(t)` seconds for `seconds`; `draw` = false for menus (nothing rendered). */
function run(g: ResolutionGovernor, seconds: number, dt: (t: number) => number, draw = true): number[] {
  const scales: number[] = [];
  for (let t = 0, i = 0; t < seconds; i++) {
    // a little timing jitter, deterministic
    const d = dt(t) * (1 + 0.03 * Math.sin(i * 1.7));
    g.noteFrame(d);
    if (draw) g.update(d);
    scales.push(g.scale);
    t += d;
  }
  return scales;
}

const hz = (f: number) => () => 1 / f;

describe('dynamic resolution at any refresh rate', () => {
  it('leaves a 60 Hz display that keeps up alone', () => {
    const g = new ResolutionGovernor(0.5);
    run(g, 3, hz(60), false);
    expect(Math.min(...run(g, 30, hz(60)))).toBe(1);
  });

  it('does not mistake a 30 Hz display (e.g. a phone saving power) for an overloaded one', () => {
    const g = new ResolutionGovernor(0.5);
    run(g, 3, hz(30), false);
    expect(Math.min(...run(g, 60, hz(30)))).toBe(1);
  });

  it('does not chase 144 Hz when the game already runs at 100 fps', () => {
    const g = new ResolutionGovernor(0.5);
    run(g, 3, hz(144), false);
    expect(Math.min(...run(g, 30, hz(100)))).toBe(1);
  });

  it('lowers the resolution when frames miss a 60 Hz display, and recovers afterwards', () => {
    const g = new ResolutionGovernor(0.5);
    run(g, 3, hz(60), false);
    run(g, 20, hz(25));
    expect(g.scale).toBe(0.5);
    run(g, 30, hz(60));
    expect(g.scale).toBe(1);
  });

  it('lowers the resolution when frames miss a 30 Hz display', () => {
    const g = new ResolutionGovernor(0.5);
    run(g, 3, hz(30), false);
    run(g, 20, hz(18));
    expect(g.scale).toBeLessThan(0.75);
  });
});

import { describe, expect, it } from 'vitest';
import { FixedStepper, SIM_DT } from '../../src/core/loop.ts';
import { Rng } from '../../src/core/rng.ts';

function runAt(hz: number, seconds: number): number {
  const s = new FixedStepper();
  let steps = 0;
  const frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) s.advance(1 / hz, () => steps++);
  return steps;
}

describe('FixedStepper', () => {
  it('runs the same number of steps at 30/60/144/240 Hz', () => {
    for (const hz of [30, 60, 75, 120, 144, 165, 240]) {
      expect(runAt(hz, 10)).toBe(600);
    }
  });

  it('handles jittery frame times', () => {
    const rng = new Rng(42);
    const s = new FixedStepper();
    let steps = 0;
    let total = 0;
    while (total < 5) {
      const f = (1 / 144) * rng.range(0.5, 1.5);
      total += f;
      s.advance(f, () => steps++);
    }
    expect(Math.abs(steps - Math.floor(total / SIM_DT))).toBeLessThanOrEqual(1);
  });

  it('clamps long hitches instead of spiralling', () => {
    const s = new FixedStepper();
    let steps = 0;
    s.advance(0.3, () => steps++);
    expect(steps).toBe(8); // maxSteps
    expect(s.alpha).toBeLessThan(1);
  });

  it('interpolation alpha stays within [0,1]', () => {
    const s = new FixedStepper();
    for (let i = 0; i < 100; i++) {
      s.advance(1 / 144, () => {});
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
  });
});

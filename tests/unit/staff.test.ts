import { describe, expect, it } from 'vitest';
import { Staff } from '../../src/sim/ai/behaviors/Staff.ts';
import { DEFAULT_CONTROLLER } from '../../src/sim/player/Controller.ts';

describe('Staff tuning', () => {
  it('is a little quicker than before, and a sprint still outruns her', () => {
    const s = new Staff('s');
    expect(s.patrolSpeed).toBeGreaterThan(1.25);
    expect(s.chaseSpeed).toBeGreaterThan(3.25);
    expect(s.chaseSpeed).toBeLessThan(DEFAULT_CONTROLLER.sprintSpeed * 0.9);
  });
});

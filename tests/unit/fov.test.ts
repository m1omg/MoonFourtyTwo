import { describe, expect, it } from 'vitest';
import { fitFov } from '../../src/render/fov.ts';

const across = (fov: number, aspect: number) =>
  (2 * Math.atan(Math.tan(((fov / 2) * Math.PI) / 180) * aspect) * 180) / Math.PI;

describe('field of view on a tall screen', () => {
  it('leaves a wide screen as set', () => {
    expect(fitFov(72, 16 / 9)).toBe(72);
    expect(fitFov(90, 1)).toBe(90);
  });

  it('shows at least 60° across when held upright, up to 100° tall', () => {
    // a tablet held upright (800 × 1280)
    const tablet = fitFov(72, 0.625);
    expect(across(tablet, 0.625)).toBeCloseTo(60, 5);
    // a phone held upright (412 × 915): capped at 100° tall
    expect(fitFov(72, 412 / 915)).toBe(100);
    // a wide setting is kept
    expect(fitFov(95, 0.8)).toBe(95);
  });
});

import { describe, expect, it } from 'vitest';
import { wallSegments } from '../../src/world/kit/Builder.ts';

const area = (segs: Array<[number, number, number, number]>) =>
  segs.reduce((a, [s0, s1, y0, y1]) => a + (s1 - s0) * (y1 - y0), 0);

describe('wallSegments', () => {
  it('leaves a single door open and the rest solid', () => {
    const segs = wallSegments(6, 0, 3, [{ at: 3, width: 1, bottom: 0, top: 2 }]);
    expect(area(segs)).toBeCloseTo(6 * 3 - 1 * 2, 6);
    // nothing solid inside the doorway
    for (const [s0, s1, y0, y1] of segs) expect(s1 <= 2.5 || s0 >= 3.5 || y0 >= 2 || y1 <= 0).toBe(true);
  });

  it('keeps doors stacked on every floor open', () => {
    const floors = [0, 2.8, 5.6, 8.4];
    const segs = wallSegments(
      8,
      0,
      11.2,
      floors.map((y) => ({ at: 1.4, width: 0.9, bottom: y, top: y + 2.05 })),
    );
    expect(area(segs)).toBeCloseTo(8 * 11.2 - 4 * 0.9 * 2.05, 6);
    for (const y of floors) {
      const blocked = segs.some(([s0, s1, y0, y1]) => s0 < 1.4 && s1 > 1.4 && y0 < y + 1 && y1 > y + 1);
      expect(blocked).toBe(false);
    }
  });

  it('handles side-by-side openings like before', () => {
    const segs = wallSegments(6, 0, 3, [
      { at: 1.5, width: 0.9, bottom: 0, top: 2 },
      { at: 4.5, width: 0.9, bottom: 0.9, top: 2.1 },
    ]);
    expect(area(segs)).toBeCloseTo(18 - 0.9 * 2 - 0.9 * 1.2, 6);
  });
});

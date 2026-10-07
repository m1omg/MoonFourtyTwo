import { describe, expect, it } from 'vitest';
import { Watcher } from '../../src/sim/ai/behaviors/Watcher.ts';
import { dangerNear } from '../../src/sim/ai/danger.ts';

describe('danger nearby (no autosave beside a threat)', () => {
  const at = { x: 0, z: 0 };
  const watcher = (x: number, awake: boolean) => {
    const w = new Watcher('w');
    w.place(x, 0, 0);
    w.awake = awake;
    return w;
  };

  it('counts a threat that is awake and within 5 m', () => {
    expect(dangerNear([watcher(3, true)], at)).toBe(true);
    expect(dangerNear([watcher(6, true)], at)).toBe(false);
  });

  it('ignores one that is asleep, switched off or hidden', () => {
    expect(dangerNear([watcher(1, false)], at)).toBe(false);
    const off = watcher(1, true);
    off.active = false;
    const hidden = watcher(1, true);
    hidden.visible = false;
    expect(dangerNear([off, hidden], at)).toBe(false);
  });
});

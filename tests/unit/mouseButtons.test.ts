import { describe, expect, it } from 'vitest';
import { InputManager, mouseCode } from '../../src/input/InputManager.ts';
import { keyName } from '../../src/ui/UI.ts';

/** Drives the manager's private mouse handlers the way the browser would. */
type MouseHandlers = {
  onMouseDown(e: { button: number; preventDefault(): void }): void;
  onMouseUp(e: { button: number; preventDefault(): void }): void;
  onAnyMouseDown(e: { button: number; target: unknown; preventDefault(): void }): void;
};
const ev = (button: number) => {
  const e = { button, prevented: false, target: null as unknown, preventDefault: () => (e.prevented = true) };
  return e;
};

describe('extra mouse buttons as controls', () => {
  it('names the middle and side buttons; left and right stay fixed', () => {
    expect(mouseCode(0)).toBeNull();
    expect(mouseCode(2)).toBeNull();
    expect(mouseCode(1)).toBe('MouseMiddle');
    expect(mouseCode(3)).toBe('MouseBack');
    expect(mouseCode(4)).toBe('MouseForward');
    expect(keyName('MouseMiddle')).toBe('Myš 3 (stredné)');
    expect(keyName('MouseBack')).toBe('Myš 4 (späť)');
    expect(keyName('MouseForward')).toBe('Myš 5 (vpred)');
  });

  it('a bound side button holds like a key and a bound middle button presses like one', () => {
    const input = new InputManager();
    input.setBinds({ sprint: 'MouseBack', light: 'MouseMiddle', crouch: 'MouseForward' });
    input.pointerLocked = true;
    const h = input as unknown as MouseHandlers;

    h.onMouseDown(ev(3));
    h.onMouseDown(ev(1));
    let snap = input.snapshot();
    expect(snap.sprint).toBe(true);
    expect(snap.pressed.has('light')).toBe(true);
    // held across ticks, pressed only once
    snap = input.snapshot();
    expect(snap.sprint).toBe(true);
    expect(snap.pressed.has('light')).toBe(false);

    h.onMouseUp(ev(3));
    h.onMouseUp(ev(1));
    expect(input.snapshot().sprint).toBe(false);

    h.onMouseDown(ev(4));
    expect(input.snapshot().crouch).toBe(true);
    h.onMouseUp(ev(4));
    expect(input.snapshot().crouch).toBe(false);
  });

  it('the side buttons never take the browser back or forward; the others are left alone', () => {
    const input = new InputManager();
    const h = input as unknown as MouseHandlers;
    for (const b of [3, 4]) {
      const down = ev(b);
      h.onAnyMouseDown(down);
      const up = ev(b);
      h.onMouseUp(up);
      expect(down.prevented && up.prevented).toBe(true);
    }
    for (const b of [0, 2]) {
      const up = ev(b);
      h.onMouseUp(up);
      expect(up.prevented).toBe(false);
    }
  });

  it('unbound extra buttons do nothing in the game', () => {
    const input = new InputManager();
    input.pointerLocked = true;
    const h = input as unknown as MouseHandlers;
    h.onMouseDown(ev(1));
    const snap = input.snapshot();
    expect(snap.pressed.size).toBe(0);
    expect(snap.sprint || snap.crouch).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from '../../src/sim/physics/CollisionWorld.ts';
import { PlayerController } from '../../src/sim/player/Controller.ts';
import { FixedStepper } from '../../src/core/loop.ts';
import { worldBox, colliderCopy } from '../../src/world/kit/geometry.ts';
import { InputManager, withDefaults } from '../../src/input/InputManager.ts';
import type { InputSnapshot } from '../../src/input/actions.ts';

const still: InputSnapshot = { moveX: 0, moveY: 0, sprint: false, crouch: false, pressed: new Set() };
const mods = { speedMul: 1, swayAngle: 0, canSprint: true };

/** A floor with a ledge `h` high from z = -3 to -8 (the player walks -Z towards it). */
function ledge(h: number): CollisionWorld {
  const parts: BufferGeometry[] = [
    colliderCopy(worldBox(new Vector3(-10, -0.2, -20), new Vector3(10, 0, 10), 1)),
    colliderCopy(worldBox(new Vector3(-10, 0, -8), new Vector3(10, h, -3), 1)),
  ];
  const w = new CollisionWorld();
  w.addStatic(mergeGeometries(parts)!);
  return w;
}

function standing(world: CollisionWorld, z = 5): PlayerController {
  const p = new PlayerController(world);
  p.teleport(new Vector3(0, 0, z), 0);
  for (let i = 0; i < 10; i++) p.step(1 / 60, still, mods);
  return p;
}

/** Highest the feet get after a jump asked for at sim time `at`, stepped from frames of 1/hz. */
function apexAt(hz: number, at = 0.5): number {
  const p = standing(ledge(0.01));
  const stepper = new FixedStepper();
  let t = 0;
  let asked = false;
  let apex = 0;
  for (let i = 0; i < Math.round(2 * hz); i++)
    stepper.advance(1 / hz, (dt) => {
      if (!asked && t >= at) asked = p.jump();
      p.step(dt, still, mods);
      t += dt;
      apex = Math.max(apex, p.pos.y);
    });
  return apex;
}

describe('jumping', () => {
  it('is a hop of about a third of a metre, the same at any refresh rate', () => {
    const ref = apexAt(60);
    expect(ref).toBeGreaterThan(0.29);
    expect(ref).toBeLessThan(0.35);
    for (const hz of [30, 75, 144, 240]) expect(apexAt(hz)).toBe(ref);
  });

  it('lands with a sound, and only jumps from the ground', () => {
    const p = standing(ledge(0.01));
    expect(p.jump()).toBe(true);
    p.step(1 / 60, still, mods);
    expect(p.jump()).toBe(false); // no second jump in the air
    let landing = null;
    for (let i = 0; i < 60 && !landing; i++) landing = p.step(1 / 60, still, mods);
    expect(landing).not.toBeNull();
    expect(landing!.loudness).toBeGreaterThan(0.5);
    expect(p.grounded).toBe(true);
  });

  it('not while crouched, held by a scene or seated', () => {
    const p = standing(ledge(0.01));
    p.frozen = true;
    expect(p.jump()).toBe(false);
    p.frozen = false;
    p.forcedHeight = 1.2;
    expect(p.jump()).toBe(false);
    p.forcedHeight = null;
    p.step(1 / 60, { ...still, crouch: true }, mods);
    expect(p.jump()).toBe(false);
  });

  /** Can a running (or walking) jump, taken anywhere before it, get onto a ledge `h` high? */
  function mounts(h: number): boolean {
    for (const sprint of [false, true]) {
      for (let d = 0.2; d <= 1.6; d += 0.1) {
        const p = new PlayerController(ledge(h));
        p.teleport(new Vector3(0, 0, 2), 0);
        const run: InputSnapshot = { ...still, moveY: 1, sprint };
        let jumped = false;
        for (let i = 0; i < 240; i++) {
          if (!jumped && p.grounded && p.pos.z - 0.32 <= -3 + d) jumped = p.jump();
          p.step(1 / 60, run, mods);
        }
        if (p.pos.y > h - 0.05 && p.pos.z < -3.5) return true;
      }
    }
    return false;
  }

  it('gets you onto a ledge a little higher than a step, but nothing 0.42 m or higher', () => {
    expect(mounts(0.38)).toBe(true);
    expect(mounts(0.42)).toBe(false);
    expect(mounts(0.6)).toBe(false);
  });
});

describe('the jump key', () => {
  type Keys = { onKeyDown(e: { code: string; repeat: boolean; preventDefault(): void }): void };
  const key = (code: string) => ({ code, repeat: false, preventDefault: () => {} });

  it('Space jumps; in a menu or a scene it skips a line, as it always did', () => {
    const input = new InputManager();
    const h = input as unknown as Keys;
    h.onKeyDown(key('Space'));
    expect(input.snapshot().pressed.has('jump')).toBe(true);
    input.setEnabled(false);
    h.onKeyDown(key('Space'));
    const snap = input.snapshot();
    expect(snap.pressed.has('skip')).toBe(true);
    expect(snap.pressed.has('jump')).toBe(false);
  });

  it('old saved keys keep working: jump gets Space unless a control already has it', () => {
    expect(withDefaults({}).jump).toBe('Space');
    expect(withDefaults({ crouch: 'KeyX' }).jump).toBe('Space');
    const taken = withDefaults({ crouch: 'Space' });
    expect(taken.crouch).toBe('Space');
    expect(taken.jump).toBe('');
    expect(withDefaults({ jump: 'KeyV' }).jump).toBe('KeyV');
  });
});

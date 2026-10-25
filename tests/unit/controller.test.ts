import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from '../../src/sim/physics/CollisionWorld.ts';
import { PlayerController } from '../../src/sim/player/Controller.ts';
import { FixedStepper } from '../../src/core/loop.ts';
import { worldBox, colliderCopy } from '../../src/world/kit/geometry.ts';
import type { InputSnapshot } from '../../src/input/actions.ts';

function room(): CollisionWorld {
  const parts: BufferGeometry[] = [
    colliderCopy(worldBox(new Vector3(-20, -0.2, -20), new Vector3(20, 0, 20), 1)), // floor
    colliderCopy(worldBox(new Vector3(-20, 0, -10.2), new Vector3(20, 3, -10), 1)), // wall ahead (-Z)
  ];
  // a ramp-like step block to walk onto
  parts.push(colliderCopy(worldBox(new Vector3(4, 0, -2), new Vector3(6, 0.12, 2), 1)));
  const w = new CollisionWorld();
  w.addStatic(mergeGeometries(parts)!);
  return w;
}

const forward: InputSnapshot = { moveX: 0, moveY: 1, sprint: false, crouch: false, pressed: new Set() };
const mods = { speedMul: 1, swayAngle: 0, canSprint: true };

function simulate(hz: number, seconds: number): Vector3 {
  const world = room();
  const p = new PlayerController(world);
  p.teleport(new Vector3(0, 0.05, 0), 0);
  const stepper = new FixedStepper();
  const frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) stepper.advance(1 / hz, (dt) => p.step(dt, forward, mods));
  return p.pos.clone();
}

describe('PlayerController', () => {
  it('ends in exactly the same place at any refresh rate', () => {
    const ref = simulate(60, 3);
    for (const hz of [30, 144, 240]) {
      const p = simulate(hz, 3);
      expect(p.x).toBe(ref.x);
      expect(p.y).toBe(ref.y);
      expect(p.z).toBe(ref.z);
    }
  });

  it('walks forward, stays grounded and is stopped by the wall', () => {
    const world = room();
    const p = new PlayerController(world);
    p.teleport(new Vector3(0, 0.05, 0), 0);
    for (let i = 0; i < 60 * 8; i++) p.step(1 / 60, forward, mods);
    expect(p.grounded).toBe(true);
    expect(p.pos.y).toBeGreaterThan(-0.05);
    expect(p.pos.y).toBeLessThan(0.1);
    // wall face at z = -10, capsule radius 0.32
    expect(p.pos.z).toBeGreaterThan(-10 + 0.25);
    expect(p.pos.z).toBeLessThan(-9.5);
  });

  it('steps up onto a low platform', () => {
    const world = room();
    const p = new PlayerController(world);
    p.teleport(new Vector3(2, 0.05, 0), -Math.PI / 2); // facing +X
    for (let i = 0; i < 60 * 2; i++) p.step(1 / 60, forward, mods);
    expect(p.pos.x).toBeGreaterThan(4.5);
    expect(p.pos.y).toBeGreaterThan(0.08);
  });

  /**
   * A basin sunk into the floor, built like the pools in the game: its floor `depth` below the
   * deck, 0.2 m walls round it whose tops stop 4 mm under the deck, the deck on top.
   */
  function basin(depth: number): CollisionWorld {
    const d = -depth;
    const parts: BufferGeometry[] = [
      colliderCopy(worldBox(new Vector3(-3, d - 0.2, -2), new Vector3(3, d, 2), 1)), // basin floor
      colliderCopy(worldBox(new Vector3(-3.1, d, -2.1), new Vector3(3.1, -0.004, -1.9), 1)),
      colliderCopy(worldBox(new Vector3(-3.1, d, 1.9), new Vector3(3.1, -0.004, 2.1), 1)),
      colliderCopy(worldBox(new Vector3(-3.1, d, -2.1), new Vector3(-2.9, -0.004, 2.1), 1)),
      colliderCopy(worldBox(new Vector3(2.9, d, -2.1), new Vector3(3.1, -0.004, 2.1), 1)),
      // the deck round it
      colliderCopy(worldBox(new Vector3(-10, -0.2, -10), new Vector3(10, 0, -2), 1)),
      colliderCopy(worldBox(new Vector3(-10, -0.2, 2), new Vector3(10, 0, 10), 1)),
      colliderCopy(worldBox(new Vector3(-10, -0.2, -2), new Vector3(-3, 0, 2), 1)),
      colliderCopy(worldBox(new Vector3(3, -0.2, -2), new Vector3(10, 0, 2), 1)),
    ];
    const w = new CollisionWorld();
    w.addStatic(mergeGeometries(parts)!);
    return w;
  }

  it('climbs out of a basin up to a step deep, head-on or at an angle, walking or wading', () => {
    // yaw 0 faces -Z (the near wall, 2 m away); the angled tries hit the same wall obliquely
    for (const depth of [0.1, 0.15, 0.3, 0.34]) {
      for (const yaw of [0, 0.5, -0.9, Math.PI, Math.PI / 2 + 0.3]) {
        for (const speedMul of [1, 0.78, 0.55]) {
          const p = new PlayerController(basin(depth));
          p.teleport(new Vector3(0, -depth, 0), yaw);
          for (let i = 0; i < 60 * 3; i++) p.step(1 / 60, forward, { ...mods, speedMul });
          const what = `depth ${depth} yaw ${yaw} speed ${speedMul}`;
          expect(p.pos.y, what).toBeGreaterThan(-0.01);
          expect(p.grounded, what).toBe(true);
        }
      }
    }
  });

  it('climbs a ledge in one quick step, without a lunge', () => {
    const p = new PlayerController(basin(0.3));
    p.teleport(new Vector3(0, -0.3, 0), 0);
    let extra = 0;
    for (let i = 0; i < 60 * 3; i++) {
      const z = p.pos.z;
      p.step(1 / 60, forward, mods);
      const d = Math.abs(p.pos.z - z);
      expect(d).toBeLessThan(0.11);
      extra += Math.max(0, d - 2.15 / 60 - 1e-3);
    }
    // a few centimetres more than walking, all in a tenth of a second
    expect(extra).toBeLessThan(0.2);
    expect(p.pos.y).toBeGreaterThan(-0.01);
  });

  it('slides along a wall it walks into at an angle', () => {
    const p = new PlayerController(room());
    p.teleport(new Vector3(0, 0.05, -9), 0.6); // a step from the wall, heading into it at ~34°
    for (let i = 0; i < 60 * 2; i++) p.step(1 / 60, forward, mods);
    expect(p.pos.y).toBeLessThan(0.05);
    expect(p.pos.z).toBeGreaterThan(-10 + 0.25);
    // the walk's sideways part carries on along the wall (2 s at 2.15 m/s · sin 34°)
    expect(p.pos.x).toBeLessThan(-1.8);
  });

  it('does not climb a ledge higher than a step', () => {
    const p = new PlayerController(basin(0.45));
    p.teleport(new Vector3(0, -0.45, 0), 0);
    for (let i = 0; i < 60 * 3; i++) p.step(1 / 60, forward, mods);
    expect(p.pos.y).toBeLessThan(-0.4);
  });

  it('emits footsteps by distance, not by time', () => {
    const world = room();
    const p = new PlayerController(world);
    p.teleport(new Vector3(0, 0.05, 0), 0);
    let steps = 0;
    for (let i = 0; i < 60 * 4; i++) if (p.step(1 / 60, forward, mods)) steps++;
    const dist = Math.abs(p.pos.z);
    expect(steps).toBeGreaterThan(dist / 0.78 - 2);
    expect(steps).toBeLessThan(dist / 0.78 + 2);
  });
});

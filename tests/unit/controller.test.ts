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

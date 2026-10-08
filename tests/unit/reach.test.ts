import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { BoxGeometry, Matrix4, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from '../../src/sim/physics/CollisionWorld.ts';
import { capsuleReachable } from '../../src/sim/physics/reach.ts';
import { worldBox, colliderCopy } from '../../src/world/kit/geometry.ts';

const box = (a: [number, number, number], b: [number, number, number]) =>
  colliderCopy(worldBox(new Vector3(...a), new Vector3(...b), 1));

/** A floor and a wall across z = 0 with a gap of `gap` metres at x = 0 (plus a low kerb and a high block). */
function world(gap: number): CollisionWorld {
  const parts: BufferGeometry[] = [
    box([-10, -0.2, -10], [10, 0, 10]),
    box([-10, 0, -0.1], [-gap / 2, 3, 0.1]),
    box([gap / 2, 0, -0.1], [10, 3, 0.1]),
    // a kerb you step over and a block you cannot climb, both on the far side
    box([-10, 0, 2], [10, 0.12, 2.3]),
    box([-10, 0, 5], [10, 0.6, 5.3]),
  ];
  const w = new CollisionWorld();
  w.addStatic(mergeGeometries(parts)!);
  return w;
}

describe('capsuleReachable', () => {
  const from = { x: 0, y: 0, z: -3 };
  it('passes a gap wider than the capsule and stops at a narrower one', () => {
    expect(capsuleReachable(world(0.8), from, { x: 0, z: 3 })).toBe(true);
    expect(capsuleReachable(world(0.6), from, { x: 0, z: 3 })).toBe(false);
  });

  it('steps over a kerb but not onto a high block', () => {
    expect(capsuleReachable(world(1), from, { x: 0, z: 4 })).toBe(true);
    expect(capsuleReachable(world(1), from, { x: 0, z: 6 })).toBe(false);
  });

  it('counts bodies that only stop capsules (and lets the floor ray through them)', () => {
    const w = world(1.2);
    const g = new BoxGeometry(0.6, 1.2, 0.6);
    g.translate(0, 0.6, 0);
    const body = w.addDynamic(g, new Matrix4().makeTranslation(0, 0, 0));
    body.sight = false;
    expect(capsuleReachable(w, from, { x: 0, z: 3 })).toBe(false);
    w.updateDynamic(body, new Matrix4().makeTranslation(0, 0, -6));
    expect(capsuleReachable(w, from, { x: 0, z: 3 })).toBe(true);
  });
});

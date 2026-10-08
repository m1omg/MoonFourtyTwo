import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Interactions } from '../../src/sim/interaction/Interactions.ts';
import { CollisionWorld } from '../../src/sim/physics/CollisionWorld.ts';

describe('Interactions focus', () => {
  const setup = () => {
    const I = new Interactions();
    I.add({ id: 'wardrobe', pos: new Vector3(0, 1.2, -2), radius: 0.55, prompt: '', onUse: () => {} });
    I.add({ id: 'key', pos: new Vector3(0.3, 1.25, -2), radius: 0.15, prompt: '', onUse: () => {} });
    return I;
  };
  const eye = new Vector3(0, 1.4, 0);
  const world = new CollisionWorld();
  const lookAt = (x: number, y: number, z: number, offYaw = 0) => {
    const d = new Vector3(x, y, z).sub(eye).normalize();
    return d.applyAxisAngle(new Vector3(0, 1, 0), offYaw);
  };

  it('a small target the look falls on wins over the big one around it, a little off too', () => {
    const I = setup();
    expect(I.update(eye, lookAt(0.3, 1.25, -2), world, 1)?.id).toBe('key');
    // 3.4° off towards the wardrobe, still on the key (this took the wardrobe before)
    expect(I.update(eye, lookAt(0.3, 1.25, -2, 0.06), world, 1)?.id).toBe('key');
  });

  it('looking at the big one away from the small one still picks the big one', () => {
    const I = setup();
    expect(I.update(eye, lookAt(-0.2, 1.1, -2), world, 1)?.id).toBe('wardrobe');
  });
});

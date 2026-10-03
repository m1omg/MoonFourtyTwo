import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, PointLight, Scene } from 'three';
import { LightBudget } from '../../src/world/lightBudget.ts';

function pub(n: number): { scene: Scene; lamps: PointLight[] } {
  const scene = new Scene();
  const lamps: PointLight[] = [];
  for (let i = 0; i < n; i++) {
    const l = new PointLight(0xffd6a8, 3, 7, 1.6);
    l.position.set(i * 2, 2, 0); // a row of lamps, 2 m apart
    scene.add(l);
    lamps.push(l);
  }
  scene.updateMatrixWorld(true);
  return { scene, lamps };
}

const litBy = (scene: Scene, cam: PerspectiveCamera) => {
  const out: PointLight[] = [];
  scene.traverse((o) => {
    const l = o as PointLight;
    if (l.isPointLight && l.layers.test(cam.layers)) out.push(l);
  });
  return out;
};

describe('light budget', () => {
  it('leaves a scene with few enough lights alone', () => {
    const { scene } = pub(4);
    const cam = new PerspectiveCamera();
    const b = new LightBudget(scene, 5, new Set());
    expect(b.active).toBe(false);
    expect(litBy(scene, cam)).toHaveLength(4);
  });

  it('lights with a fixed number of lights, taken from the nearest lamps', () => {
    const { scene, lamps } = pub(18);
    const keep = new PointLight();
    scene.add(keep);
    const cam = new PerspectiveCamera();
    cam.position.set(20, 1.6, 0); // standing under lamp 10
    const b = new LightBudget(scene, 5, new Set([keep]));
    expect(b.standInCount).toBe(18);
    // the shaders only ever see the pool and the player's own light
    expect(litBy(scene, cam)).toHaveLength(6);
    b.update(cam);
    const pool = litBy(scene, cam).filter((l) => l !== keep);
    const xs = pool.filter((l) => l.intensity > 0).map((l) => l.position.x);
    for (const x of xs) expect(Math.abs(x - 20)).toBeLessThanOrEqual(4);
    expect(xs).toContain(20);
    // a lamp switched off, or hidden, is not chosen
    lamps[10]!.intensity = 0;
    lamps[11]!.visible = false;
    b.update(cam);
    const xs2 = pool.filter((l) => l.intensity > 0).map((l) => l.position.x);
    expect(xs2).not.toContain(20);
    expect(xs2).not.toContain(22);
  });

  it('hands the last place over smoothly instead of popping', () => {
    const { scene } = pub(2);
    const cam = new PerspectiveCamera();
    // two equally strong candidates for one place: neither may light at full strength
    const b = new LightBudget(scene, 1, new Set());
    cam.position.set(1, 2, 0); // exactly between the two lamps
    b.update(cam);
    const pool = litBy(scene, cam);
    expect(pool).toHaveLength(1);
    expect(pool[0]!.intensity).toBeLessThan(0.1);
    // walk under one of them: it takes the place at full strength
    cam.position.set(0, 2, 0);
    b.update(cam);
    expect(pool[0]!.intensity).toBeCloseTo(3);
    expect(pool[0]!.position.x).toBe(0);
  });
});

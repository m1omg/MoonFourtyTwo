import { PointLight } from 'three';
import type { Scene, Vector3 } from 'three';
import { comfort } from '../render/comfort.ts';

export interface Fixture {
  pos: Vector3;
  color: number;
  intensity: number;
  distance: number;
  /** Optional flicker seed; 0 = steady. */
  flicker?: number;
}

/**
 * A fixed pool of real point lights reassigned to the fixtures nearest the camera: many lamps,
 * constant shader cost (no recompiles because the light count never changes).
 */
export class LightPool {
  readonly lights: PointLight[] = [];

  constructor(
    scene: Scene,
    private readonly fixtures: Fixture[],
    size: number,
    decay = 1.6,
  ) {
    for (let i = 0; i < size; i++) {
      const l = new PointLight(0xffffff, 0, 10, decay);
      scene.add(l);
      this.lights.push(l);
    }
  }

  update(cam: Vector3, t: number, dim = 1): void {
    // lamps switched off (intensity 0) give their slot to the next nearest one
    const ranked = this.fixtures
      .filter((f) => f.intensity > 0)
      .map((f) => ({ f, d: f.pos.distanceToSquared(cam) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lights.length);
    this.lights.forEach((l, i) => {
      const r = ranked[i];
      if (!r) {
        l.intensity = 0;
        return;
      }
      l.position.copy(r.f.pos);
      l.color.setHex(r.f.color);
      l.distance = r.f.distance;
      const fl =
        r.f.flicker && !comfort.reduceFlashes
          ? Math.sin(t * 31 + r.f.flicker * 7) * Math.sin(t * 7.3 + r.f.flicker) > 0.85
            ? 0.15
            : 1
          : 1;
      l.intensity = r.f.intensity * fl * dim;
    });
  }
}

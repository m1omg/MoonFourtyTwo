import { PointLight, Vector3 } from 'three';
import type { Camera, Object3D, Scene } from 'three';

/** Layer the camera never lights with: the scene's own point lights wait there as stand-ins. */
const STAND_IN_LAYER = 31;

const _p = new Vector3();
const _fwd = new Vector3();

interface Candidate {
  light: PointLight;
  score: number;
}

const shown = (o: Object3D | null): boolean => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Every lit shader loops over every point light in the scene, for every pixel; a pub with eighteen
 * lamps costs a phone its frame rate. The budget keeps that number fixed: the scene's own point
 * lights become stand-ins (on a layer the camera does not light with) and a few real lights take
 * the place of the ones that matter most where the camera is. Realities keep switching, dimming and
 * moving their lights as before; the real ones follow every frame. The weakest of the chosen lights
 * fades while another is close behind it, so lights hand over without popping.
 */
export class LightBudget {
  private readonly pool: PointLight[] = [];
  private readonly standIns: Array<{ light: PointLight; mask: number }> = [];
  private readonly candidates: Candidate[] = [];

  /** @param keep lights that stay real (the player's own light). */
  constructor(scene: Scene, size: number, keep: ReadonlySet<Object3D>) {
    const found: PointLight[] = [];
    scene.traverse((o) => {
      const l = o as PointLight;
      if (l.isPointLight && !keep.has(l) && !l.castShadow) found.push(l);
    });
    if (found.length <= size) return;
    for (const light of found) {
      this.standIns.push({ light, mask: light.layers.mask });
      light.layers.set(STAND_IN_LAYER);
      this.candidates.push({ light, score: 0 });
    }
    for (let i = 0; i < size; i++) {
      const l = new PointLight(0xffffff, 0, 10, 2);
      scene.add(l);
      this.pool.push(l);
    }
  }

  /** Whether the budget took over any lights. */
  get active(): boolean {
    return this.pool.length > 0;
  }

  /** How many real point lights the budget lights with. */
  get size(): number {
    return this.pool.length;
  }

  /** How many of the scene's point lights stand in for the real ones. */
  get standInCount(): number {
    return this.standIns.length;
  }

  /** Picks the lights that matter most from `camera`'s point of view (call once per frame). */
  update(camera: Camera): void {
    if (!this.pool.length) return;
    const eye = camera.position;
    camera.getWorldDirection(_fwd);
    let n = 0;
    for (const s of this.standIns) {
      const l = s.light;
      // switched off, hidden, or on a layer this camera does not see at all
      if (l.intensity <= 0 || !shown(l) || !(s.mask & camera.layers.mask)) continue;
      l.getWorldPosition(_p);
      const d = Math.max(1, _p.distanceTo(eye));
      // what lies ahead matters more than what lights the wall behind you
      const ahead = smooth((_p.sub(eye).normalize().dot(_fwd) + 0.2) / 0.8);
      const c = this.candidates[n++]!;
      c.light = l;
      c.score = ((0.35 + 0.65 * ahead) * l.intensity) / Math.pow(d, Math.max(1, l.decay));
    }
    const ranked = this.candidates.slice(0, n).sort((a, b) => b.score - a.score);
    const last = this.pool.length - 1;
    this.pool.forEach((p, i) => {
      const c = ranked[i];
      if (!c) {
        p.intensity = 0;
        return;
      }
      const l = c.light;
      l.getWorldPosition(p.position);
      p.color.copy(l.color);
      p.distance = l.distance;
      p.decay = l.decay;
      // the weakest chosen light fades out as the next one catches up (and in as it pulls ahead)
      const next = i === last ? ranked[i + 1] : undefined;
      const k = next ? smooth((1 - next.score / c.score) / 0.35) : 1;
      p.intensity = l.intensity * k;
    });
  }
}

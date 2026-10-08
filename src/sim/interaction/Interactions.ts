import { Vector3 } from 'three';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';

export interface Interactable {
  id: string;
  /** World position of the focus point. */
  pos: Vector3;
  /** Focus radius (how big the target is). */
  radius: number;
  /** Max distance from the eye. */
  range?: number;
  /** Prompt text (Slovak) or a function computing it. */
  prompt: string | (() => string);
  enabled?: () => boolean;
  onUse: () => void;
  /** Collision layer mask required to see it (absinthe-only objects etc.). */
  layer?: number;
  /** Ignore walls between eye and target (e.g. targets embedded in geometry). */
  ignoreOcclusion?: boolean;
}

const _to = new Vector3();

/** Picks the interactable the player is looking at. */
export class Interactions {
  private items = new Map<string, Interactable>();
  focused: Interactable | null = null;

  add(i: Interactable): Interactable {
    this.items.set(i.id, i);
    return i;
  }

  remove(id: string): void {
    this.items.delete(id);
    if (this.focused?.id === id) this.focused = null;
  }

  clear(): void {
    this.items.clear();
    this.focused = null;
  }

  get(id: string): Interactable | undefined {
    return this.items.get(id);
  }

  /** @param activeMask collision/visibility layers currently active. */
  update(eye: Vector3, lookDir: Vector3, world: CollisionWorld, activeMask: number): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const it of this.items.values()) {
      if (it.enabled && !it.enabled()) continue;
      if (it.layer !== undefined && !(it.layer & activeMask)) continue;
      _to.subVectors(it.pos, eye);
      const dist = _to.length();
      const range = it.range ?? 2.3;
      if (dist > range + it.radius) continue;
      if (dist < 1e-4) {
        best = it;
        break;
      }
      _to.divideScalar(dist);
      const cos = _to.dot(lookDir);
      // angular radius of the target
      const ang = Math.atan2(it.radius, dist);
      const off = Math.acos(Math.min(1, Math.max(-1, cos)));
      if (off > ang + 0.06) continue;
      const score = -off / Math.max(ang, 0.02) - dist * 0.15;
      if (score <= bestScore) continue;
      if (!it.ignoreOcclusion) {
        const hit = world.raycast(eye, _to, Math.max(0, dist - it.radius - 0.05));
        if (hit !== Infinity) continue;
      }
      best = it;
      bestScore = score;
    }
    this.focused = best;
    return best;
  }

  use(): boolean {
    const f = this.focused;
    if (!f || (f.enabled && !f.enabled())) return false;
    f.onUse();
    return true;
  }
}

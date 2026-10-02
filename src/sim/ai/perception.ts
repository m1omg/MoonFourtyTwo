import { Vector3 } from 'three';
import type { AIContext, NoiseEvent, PlayerView } from './types.ts';
import { Area } from './nav/NavGrid.ts';

const _to = new Vector3();
const _pt = new Vector3();
const _eye = new Vector3();

export interface SightConfig {
  range: number;
  /** Half angle of the vision cone in radians. */
  halfAngle: number;
  eyeHeight: number;
}

/**
 * True if the entity at `pos` facing `yaw` can see the player. Checks range (scaled by player
 * visibility), cone and line of sight to head, chest and feet.
 */
export function canSeePlayer(pos: Vector3, yaw: number, cfg: SightConfig, ctx: AIContext): boolean {
  const p = ctx.player;
  if (p.dead) return false;
  if (p.hidden) return false;
  const vis = p.glowing ? 1 : p.visibility;
  const range = cfg.range * (0.25 + 0.75 * vis);
  _eye.set(pos.x, pos.y + cfg.eyeHeight, pos.z);
  _to.subVectors(p.eye, _eye);
  const dist = _to.length();
  if (dist > range) return false;
  if (dist > 1.2) {
    // forward = -Z rotated by yaw
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const len = Math.hypot(_to.x, _to.z) || 1;
    const cos = (fx * _to.x + fz * _to.z) / len;
    if (cos < Math.cos(cfg.halfAngle)) return false;
  }
  const h = p.crouched ? 0.75 : 1.2;
  for (const yOff of [0, -h * 0.5, -h]) {
    _pt.set(p.eye.x, p.eye.y + yOff + 0.05, p.eye.z);
    if (ctx.world.lineOfSight(_eye, _pt)) return true;
  }
  return false;
}

/** Loudest noise this tick the entity can hear, with an attenuated loudness, or null. */
export function hearNoise(
  pos: Vector3,
  hearingRange: number,
  ctx: AIContext,
  aroundCorners = true,
): NoiseEvent | null {
  let best: NoiseEvent | null = null;
  let bestScore = 0;
  for (const n of ctx.noises) {
    const straight = Math.hypot(n.x - pos.x, n.y - pos.y, n.z - pos.z);
    const reach = hearingRange * n.loudness;
    if (straight > reach) continue;
    let dist = straight;
    if (aroundCorners && ctx.nav && straight > 2) {
      dist = ctx.nav.pathDistance(pos.x, pos.z, n.x, n.z, Area.WALK | Area.PIPE | Area.WATER);
      if (!Number.isFinite(dist)) dist = straight * 1.6;
    }
    if (dist > reach) continue;
    const score = n.loudness * (1 - dist / reach);
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

/** Horizontal distance to the player. */
export function distToPlayer(pos: Vector3, p: PlayerView): number {
  return Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
}

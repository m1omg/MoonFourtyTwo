import type { Vector3 } from 'three';

/**
 * Frame-rate independent exponential smoothing: moves `a` toward `b`.
 * `lambda` is the rate (1/s); larger = faster. Never use a per-frame lerp factor.
 */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return b + (a - b) * Math.exp(-lambda * dt);
}

export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * (1 - Math.exp(-lambda * dt));
}

export function dampVec3(out: Vector3, target: Vector3, lambda: number, dt: number): Vector3 {
  const k = 1 - Math.exp(-lambda * dt);
  out.x += (target.x - out.x) * k;
  out.y += (target.y - out.y) * k;
  out.z += (target.z - out.z) * k;
  return out;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Move `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

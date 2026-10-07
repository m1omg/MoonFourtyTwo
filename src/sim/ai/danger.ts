import type { Entity } from './Entity.ts';

/** How close a threat may be before the game holds back an autosave (metres). */
export const DANGER_RADIUS = 5;

/** Is anything that can hurt you (active, shown, not dormant) within `radius` of `at`, on the ground? */
export function dangerNear(
  entities: readonly Entity[],
  at: { x: number; z: number },
  radius = DANGER_RADIUS,
): boolean {
  return entities.some(
    (e) => e.active && e.visible && !e.dormant && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < radius,
  );
}

/**
 * How far the carried lights reach. The lights you see and the light that counts for whatever
 * fears it are the same numbers (the beam visibly lit things it did not count as lit).
 */

/** The lighter's glow (its point light's distance). */
export const LIGHTER_REACH = 7;

/** The torch beam's half angle (radians). */
export const TORCH_HALF_ANGLE = 0.62;

/** The torch beam's reach at a battery level 0..1. */
export function torchReach(level: number): number {
  return 9 + 11 * Math.min(1, Math.max(0, level));
}

const D = Math.PI / 180;

/** At least this much of the world fits across a tall screen (degrees). */
const MIN_ACROSS = 60;
/** …but the view never gets taller than this (degrees; wider distorts too much). */
const MAX_TALL = 100;

/**
 * Vertical field of view (degrees) for a screen of this shape. The setting is meant for a wide
 * screen; held upright, a phone would show only a slit of the world (about 36° across at 72°), so
 * the view grows until at least 60° fit across, up to 100° tall.
 */
export function fitFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const across = (2 * Math.atan(Math.tan((MIN_ACROSS / 2) * D) / aspect)) / D;
  return Math.max(fov, Math.min(across, MAX_TALL));
}

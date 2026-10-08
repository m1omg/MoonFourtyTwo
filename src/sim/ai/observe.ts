import { Vector3 } from 'three';

const _right = new Vector3();
const _up = new Vector3();

/**
 * Whether a sphere is (at least partly) inside the camera's view: the screen's own frustum, not a
 * narrower cone, so what the player can see at the sides of the screen counts as seen.
 *
 * @param to from the eye to the sphere's centre
 * @param lookDir unit view direction (no roll)
 * @param yaw the view's yaw (its right vector is (cos yaw, 0, −sin yaw))
 * @param vfovDeg vertical field of view in degrees
 * @param aspect width / height
 */
export function onScreen(
  to: Vector3,
  lookDir: Vector3,
  yaw: number,
  vfovDeg: number,
  aspect: number,
  radius: number,
): boolean {
  const tv = Math.tan((vfovDeg * Math.PI) / 360);
  const th = tv * aspect;
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  _up.crossVectors(_right, lookDir);
  const z = to.dot(lookDir);
  if (z < -radius) return false;
  if (Math.abs(to.dot(_right)) - th * z > radius * Math.hypot(1, th)) return false;
  return Math.abs(to.dot(_up)) - tv * z <= radius * Math.hypot(1, tv);
}

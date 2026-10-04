import type { PerspectiveCamera } from 'three';
import type { PlayerController } from '../sim/player/Controller.ts';
import { clamp, damp, lerp } from '../core/damp.ts';

export interface CameraFx {
  /** Blood alcohol in ‰. */
  bac: number;
  /** Steady buff active (hruškovica). */
  steady: boolean;
  /** 0..1 fear. */
  fear: number;
  /** User comfort scale 0..1 for bob/sway. */
  motion: number;
  /** Extra shake 0..1 (scares, impacts). */
  shake: number;
  renderTime: number;
}

const PITCH_LIMIT = 1.45;

/**
 * Places the camera from the interpolated player state. Look input is applied here at display
 * rate from raw deltas; head bob is driven by distance travelled (stride phase), drunk sway by
 * render time — nothing depends on the frame rate.
 */
export class CameraRig {
  yaw = 0;
  pitch = 0;
  /** When set, look input is ignored and the camera eases toward this target (dialogue focus). */
  lockTarget: { yaw: number; pitch: number } | null = null;
  lookEnabled = true;
  private bobAmp = 0;
  private roll = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly player: PlayerController,
  ) {}

  applyLook(dx: number, dy: number): void {
    if (!this.lookEnabled || this.lockTarget) return;
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -PITCH_LIMIT, PITCH_LIMIT);
  }

  setOrientation(yaw: number, pitch = 0): void {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  update(frameDt: number, alpha: number, fx: CameraFx): void {
    const p = this.player;
    if (this.lockTarget) {
      this.yaw = dampAngleShort(this.yaw, this.lockTarget.yaw, 5, frameDt);
      this.pitch = damp(this.pitch, this.lockTarget.pitch, 5, frameDt);
    }
    p.yaw = this.yaw;
    p.pitch = this.pitch;

    const x = lerp(p.prevPos.x, p.pos.x, alpha);
    const y = lerp(p.prevPos.y, p.pos.y, alpha);
    const z = lerp(p.prevPos.z, p.pos.z, alpha);
    const h = lerp(p.prevHeight, p.height, alpha);
    const eye = h - p.cfg.eyeBelowTop;

    // Head bob from the stride phase (distance based).
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const targetAmp = p.grounded ? clamp(speed / p.cfg.sprintSpeed, 0, 1) : 0;
    this.bobAmp = damp(this.bobAmp, targetAmp, 8, frameDt);
    const ph = p.stridePhase * Math.PI;
    const m = fx.motion;
    const bobY = Math.abs(Math.sin(ph)) * 0.045 * this.bobAmp * m - 0.02 * this.bobAmp * m;
    const bobX = Math.sin(ph) * 0.025 * this.bobAmp * m;

    // Drunk sway (render time based).
    const t = fx.renderTime;
    const drunk = fx.steady ? 0 : clamp((fx.bac - 0.8) / 2.2, 0, 1) * m;
    const swayX = (Math.sin(t * 0.61) * 0.6 + Math.sin(t * 1.37) * 0.4) * 0.05 * drunk;
    const swayY = Math.sin(t * 0.83 + 1.2) * 0.025 * drunk;
    const targetRoll = (Math.sin(t * 0.47) * 0.6 + Math.sin(t * 1.13 + 0.5) * 0.4) * 0.06 * drunk;
    this.roll = damp(this.roll, targetRoll, 3, frameDt);
    const shake = fx.shake * m;
    const shX = (Math.sin(t * 37.1) + Math.sin(t * 23.7)) * 0.006 * shake;
    const shY = (Math.sin(t * 41.3) + Math.sin(t * 29.9)) * 0.006 * shake;

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const lateral = bobX + swayX;
    this.camera.position.set(x + cy * lateral, y + eye + bobY + swayY + shY, z - sy * lateral);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + shY * 2 + swayY * 0.3, this.yaw + shX * 2, this.roll + bobX * 0.15);
    this.camera.updateMatrixWorld();
  }
}

function dampAngleShort(a: number, b: number, lambda: number, dt: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

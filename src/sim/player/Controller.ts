import { Line3, Vector3 } from 'three';
import type { CollisionWorld, CapsuleResolve } from '../physics/CollisionWorld.ts';
import type { InputSnapshot } from '../../input/actions.ts';
import { damp } from '../../core/damp.ts';

export type Surface =
  'wood' | 'tile' | 'concrete' | 'metal' | 'carpet' | 'snow' | 'water' | 'grass' | 'gravel';

export const SURFACE_LOUDNESS: Record<Surface, number> = {
  wood: 1,
  tile: 1.15,
  concrete: 0.95,
  metal: 1.6,
  carpet: 0.55,
  snow: 0.75,
  water: 1.4,
  grass: 0.6,
  gravel: 1.2,
};

export interface ControllerConfig {
  radius: number;
  standHeight: number;
  crouchHeight: number;
  eyeBelowTop: number;
  walkSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  groundAccel: number;
  gravity: number;
}

export const DEFAULT_CONTROLLER: ControllerConfig = {
  radius: 0.32,
  standHeight: 1.78,
  crouchHeight: 1.12,
  eyeBelowTop: 0.12,
  walkSpeed: 2.15,
  sprintSpeed: 4.3,
  crouchSpeed: 1.05,
  groundAccel: 12,
  gravity: 22,
};

export interface FootstepEvent {
  position: Vector3;
  /** 0..~1.6, already includes speed, crouch and surface factors. */
  loudness: number;
  surface: Surface;
  foot: 0 | 1;
}

export interface MoveModifiers {
  /** Multiplies all speeds (cold, hangover, story beats). */
  speedMul: number;
  /** Sideways drift angle (radians) from intoxication. */
  swayAngle: number;
  /** When false the player cannot sprint (exhausted, panicked). */
  canSprint: boolean;
}

const _seg = new Line3();
const _res: CapsuleResolve = { push: new Vector3(), maxNormalY: -1 };
const _wish = new Vector3();
const _up = new Vector3(0, 1, 0);
const _start = new Vector3();
const _try = new Vector3();
const _push = new Vector3();
const STEP_HEIGHT = 0.36;

/** Kinematic first-person capsule controller. Runs in fixed sim steps only. */
export class PlayerController {
  readonly cfg: ControllerConfig;
  /** Feet position. */
  readonly pos = new Vector3();
  readonly prevPos = new Vector3();
  readonly vel = new Vector3();
  /** View yaw (radians); written by the camera rig from look input. */
  yaw = 0;
  pitch = 0;
  height: number;
  prevHeight: number;
  grounded = false;
  crouched = false;
  sprinting = false;
  stamina = 1;
  private staminaDelay = 0;
  /** Distance-driven gait phase in strides (drives footsteps and head bob). */
  stridePhase = 0;
  surface: Surface = 'wood';
  /** Frozen players (dialogue, cutscenes) ignore movement input but still fall. */
  frozen = false;
  noclip = false;
  /** Overrides the capsule height (e.g. sitting). */
  forcedHeight: number | null = null;

  constructor(
    private readonly world: CollisionWorld,
    cfg: Partial<ControllerConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_CONTROLLER, ...cfg };
    this.height = this.cfg.standHeight;
    this.prevHeight = this.height;
  }

  teleport(p: Vector3, yaw?: number): void {
    this.pos.copy(p);
    this.prevPos.copy(p);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
  }

  eyeHeight(height = this.height): number {
    return height - this.cfg.eyeBelowTop;
  }

  step(dt: number, input: InputSnapshot, mods: MoveModifiers): FootstepEvent | null {
    this.prevPos.copy(this.pos);
    this.prevHeight = this.height;
    const c = this.cfg;

    // Crouch (stand up only with headroom).
    const wantCrouch = input.crouch && !this.frozen;
    if (wantCrouch) this.crouched = true;
    else if (this.crouched && this.hasHeadroom()) this.crouched = false;
    const targetH = this.forcedHeight ?? (this.crouched ? c.crouchHeight : c.standHeight);
    this.height = damp(this.height, targetH, this.forcedHeight !== null ? 6 : 14, dt);

    // Desired horizontal velocity.
    const moving = !this.frozen && (input.moveX !== 0 || input.moveY !== 0);
    const wantSprint = moving && input.sprint && !this.crouched && input.moveY > 0.1 && mods.canSprint;
    if (wantSprint && this.stamina > 0.02) {
      this.sprinting = true;
      this.stamina = Math.max(0, this.stamina - dt * 0.17);
      this.staminaDelay = 1.1;
    } else {
      this.sprinting = false;
      if (this.staminaDelay > 0) this.staminaDelay -= dt;
      else this.stamina = Math.min(1, this.stamina + dt * 0.14);
    }
    const speed =
      (this.crouched ? c.crouchSpeed : this.sprinting ? c.sprintSpeed : c.walkSpeed) * mods.speedMul;
    const yaw = this.yaw + mods.swayAngle;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // Forward is -Z at yaw 0 (three.js camera convention).
    const mx = this.frozen ? 0 : input.moveX;
    const my = this.frozen ? 0 : input.moveY;
    _wish.set(mx * cos - my * sin, 0, -mx * sin - my * cos).multiplyScalar(speed);

    const accel = this.grounded ? c.groundAccel : c.groundAccel * 0.25;
    this.vel.x = damp(this.vel.x, _wish.x, accel, dt);
    this.vel.z = damp(this.vel.z, _wish.z, accel, dt);
    if (this.noclip) {
      this.vel.y = 0;
    } else if (this.grounded) {
      this.vel.y = -2.5; // keeps the capsule glued to ramps and stairs
    } else {
      this.vel.y -= c.gravity * dt;
      if (this.vel.y < -30) this.vel.y = -30;
    }

    const wasGrounded = this.grounded;
    _start.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);

    if (!this.noclip) {
      this.collide(this.pos);
      this.grounded = _res.maxNormalY > 0.55;
      const pushLen = _res.push.length();
      _push.copy(_res.push);
      // Step up onto low ledges (kerbs, platforms) when blocked while walking.
      const wishLen = Math.hypot(_wish.x, _wish.z);
      const wantH = Math.hypot(this.vel.x, this.vel.z) * dt;
      const gotH = Math.hypot(this.pos.x - _start.x, this.pos.z - _start.z);
      if (wasGrounded && wishLen > 0.1 && gotH < Math.max(wantH, 1e-4) * 0.6) {
        const probe = Math.max(wantH, 0.1);
        _try.copy(_start);
        _try.y += STEP_HEIGHT;
        this.collide(_try);
        const headClear = _try.y - _start.y > STEP_HEIGHT - 0.02;
        if (headClear) {
          _try.x += (_wish.x / wishLen) * probe;
          _try.z += (_wish.z / wishLen) * probe;
          this.collide(_try);
          _try.y -= STEP_HEIGHT + 0.08;
          this.collide(_try);
          const rise = _try.y - _start.y;
          const stepH = Math.hypot(_try.x - _start.x, _try.z - _start.z);
          if (_res.maxNormalY > 0.55 && stepH > gotH + 0.02 && rise > 0.01 && rise <= STEP_HEIGHT + 0.01) {
            // keep the real (speed-limited) horizontal advance, but take the raised height
            const k = Math.min(1, Math.max(wantH, 1e-4) / stepH);
            this.pos.set(_start.x + (_try.x - _start.x) * k, _try.y, _start.z + (_try.z - _start.z) * k);
            this.collide(this.pos);
            this.grounded = true;
            _push.set(0, 0, 0);
          }
        }
      }
      const pl = pushLen > 1e-6 ? _push.length() : 0;
      if (pl > 1e-6) {
        _push.divideScalar(pl);
        if (_push.y > 0.55) {
          // floor contact: only kill downward speed
          if (this.vel.y < 0) this.vel.y = 0;
        } else {
          // wall contact: remove the horizontal component pushing into it
          const hl = Math.hypot(_push.x, _push.z);
          if (hl > 1e-6) {
            const nx = _push.x / hl;
            const nz = _push.z / hl;
            const into = this.vel.x * nx + this.vel.z * nz;
            if (into < 0) {
              this.vel.x -= into * nx;
              this.vel.z -= into * nz;
            }
          }
          if (_push.y < -0.3 && this.vel.y > 0) this.vel.y = 0;
        }
      }
      if (this.grounded && this.vel.y < 0) this.vel.y = Math.max(this.vel.y, -2.5);
      // Safety net: never fall forever.
      if (this.pos.y < -60) this.vel.set(0, 0, 0);
    }

    // Gait / footsteps.
    const hx = this.pos.x - this.prevPos.x;
    const hz = this.pos.z - this.prevPos.z;
    const moved = Math.hypot(hx, hz);
    if (this.grounded && moved > 1e-4) {
      const stride = this.sprinting ? 1.05 : this.crouched ? 0.55 : 0.78;
      const before = Math.floor(this.stridePhase);
      this.stridePhase += moved / stride;
      if (Math.floor(this.stridePhase) !== before) {
        const horizSpeed = moved / dt;
        const base = this.crouched ? 0.18 : this.sprinting ? 1.0 : 0.45;
        const speedFactor = Math.min(1.2, horizSpeed / Math.max(0.5, c.walkSpeed));
        return {
          position: this.pos.clone(),
          loudness: base * (0.6 + 0.4 * speedFactor) * SURFACE_LOUDNESS[this.surface],
          surface: this.surface,
          foot: (Math.floor(this.stridePhase) % 2) as 0 | 1,
        };
      }
    }
    return null;
  }

  /** Resolves the capsule standing at `feet` (mutates it); result in `_res`. */
  private collide(feet: Vector3): void {
    const r = this.cfg.radius;
    _seg.start.set(feet.x, feet.y + r, feet.z);
    _seg.end.set(feet.x, feet.y + Math.max(this.height - r, r + 0.01), feet.z);
    this.world.resolveCapsule(_seg, r, _res);
    feet.set(_seg.start.x, _seg.start.y - r, _seg.start.z);
  }

  private hasHeadroom(): boolean {
    const top = this.pos.clone().addScaledVector(_up, this.height - 0.05);
    const need = this.cfg.standHeight - this.height + 0.05;
    return this.world.raycast(top, _up, need) === Infinity;
  }
}

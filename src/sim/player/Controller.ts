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
  /** Take-off speed of a jump (m/s): a hop of about 0.32 m, onto nothing higher than ~0.4 m. */
  jumpSpeed: number;
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
  jumpSpeed: 3.55,
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
const _alt = new Vector3();
const _fall = new Vector3();
const _ray = new Vector3();
const _down = new Vector3(0, -1, 0);
const STEP_HEIGHT = 0.36;
/** The step-up comes down in this many drops of ~4 cm. */
const STEP_DROPS = 11;

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
  /** A jump asked for, taken on the next step. */
  private jumpQueued = false;
  /** Seconds since the feet left the ground (a landing after a real fall is heard). */
  private airTime = 0;

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

  /** Jumps on the next step if standing on something and free to move; false if not. */
  jump(): boolean {
    if (!this.grounded || this.frozen || this.crouched || this.forcedHeight !== null || this.noclip)
      return false;
    this.jumpQueued = true;
    return true;
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
    } else if (this.jumpQueued) {
      this.vel.y = c.jumpSpeed;
      this.grounded = false;
    } else if (this.grounded) {
      this.vel.y = -2.5; // keeps the capsule glued to ramps and stairs
    } else {
      this.vel.y -= c.gravity * dt;
      if (this.vel.y < -30) this.vel.y = -30;
    }

    this.jumpQueued = false;
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    _start.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);

    if (!this.noclip) {
      this.collide(this.pos);
      this.grounded = _res.maxNormalY > 0.55;
      const pushLen = _res.push.length();
      _push.copy(_res.push);
      // Step up onto low ledges (kerbs, platforms) when blocked while walking, or when walking
      // into a low one at an angle (otherwise the walk slides along it).
      const wishLen = Math.hypot(_wish.x, _wish.z);
      const wantH = Math.hypot(this.vel.x, this.vel.z) * dt;
      const gotH = Math.hypot(this.pos.x - _start.x, this.pos.z - _start.z);
      const blocked = gotH < Math.max(wantH, 1e-4) * 0.6;
      const faceH = Math.hypot(_push.x, _push.z);
      // 1 when the walk meets the face that pushed back head-on, 0 when it runs along it
      const into =
        faceH > 1e-6 && wishLen > 1e-6 ? -(_push.x * _wish.x + _push.z * _wish.z) / (faceH * wishLen) : 0;
      const ledge = wasGrounded && wishLen > 0.1 && (blocked || into > 0.35) ? this.ledgeAhead(wishLen) : 0;
      if (
        wasGrounded &&
        wishLen > 0.1 &&
        ledge <= STEP_HEIGHT + 0.01 &&
        (blocked || (into > 0.35 && ledge > 0.01))
      ) {
        // far enough into the ledge, also at an angle
        const probe = Math.max(wantH, 0.1 / Math.max(into, 0.5));
        _try.copy(_start);
        _try.y += STEP_HEIGHT;
        this.collide(_try);
        const headClear = _try.y - _start.y > STEP_HEIGHT - 0.02;
        if (headClear) {
          _try.x += (_wish.x / wishLen) * probe;
          _try.z += (_wish.z / wishLen) * probe;
          this.collide(_try);
          // Come down in short drops, so the capsule settles on the ledge's edge. In one long
          // drop it ended beside a ledge higher than ~0.24 m, in its face, and the step failed.
          // (no use when the raised probe got no further than the walk: a wall, not a ledge)
          const past = Math.hypot(_try.x - _start.x, _try.z - _start.z) > gotH + 0.02;
          let landed = false;
          for (let i = 0; past && i < STEP_DROPS && !landed; i++) {
            _try.y -= (STEP_HEIGHT + 0.08) / STEP_DROPS;
            this.collide(_try);
            landed = _res.maxNormalY > 0.55;
          }
          const rise = _try.y - _start.y;
          const stepH = Math.hypot(_try.x - _start.x, _try.z - _start.z);
          if (landed && stepH > gotH + 0.02 && rise > 0.01 && rise <= STEP_HEIGHT + 0.01) {
            // keep the real (speed-limited) horizontal advance, but take the raised height
            const k = Math.min(1, Math.max(wantH, 1e-4) / stepH);
            _alt.set(_start.x + (_try.x - _start.x) * k, _try.y, _start.z + (_try.z - _start.z) * k);
            // ...unless that leaves the capsule on the ledge's very edge, where it would slide back
            // off (a short fall from there doesn't stay up on the ledge): then take the whole
            // probe, a few centimetres more, once
            _fall.copy(_alt);
            _fall.y -= 0.08;
            this.collide(_fall);
            const stays = _res.maxNormalY > 0.55 && _fall.y > _start.y + 0.01;
            this.pos.copy(stays ? _alt : _try);
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

    // Landing after a jump or a fall: heard like a heavy step.
    const air = this.airTime;
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.grounded && !wasGrounded && air > 0.2 && fallSpeed > 2) {
      return {
        position: this.pos.clone(),
        loudness: Math.min(1.5, 0.35 + fallSpeed * 0.12) * SURFACE_LOUDNESS[this.surface],
        surface: this.surface,
        foot: 0,
      };
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

  /**
   * How high the ledge that stopped the walk is, above the floor: measured from above, just past
   * the face that pushed back (0 when nothing is found there). Keeps ledges higher than a step
   * out of reach: resting on such a ledge's edge, the capsule's round bottom sits lower than its
   * top, so the height it climbs to looks like a step.
   */
  private ledgeAhead(wishLen: number): number {
    let nx = -_push.x;
    let nz = -_push.z;
    let hl = Math.hypot(nx, nz);
    if (hl < 1e-6) {
      nx = _wish.x;
      nz = _wish.z;
      hl = wishLen;
    }
    // measured from the floor under the capsule's middle: resting on a ledge's edge (landed
    // there from a jump, say) the feet are partway up it, and a step from there would mount
    // more than a step
    _ray.set(_start.x, _start.y + 0.3, _start.z);
    const under = this.world.raycast(_ray, _down, 1.3);
    const base = under === Infinity ? _start.y : Math.min(_start.y, _ray.y - under);
    const reach = this.cfg.radius + 0.03;
    const above = STEP_HEIGHT + 0.15;
    _ray.set(_start.x + (nx / hl) * reach, _start.y + above, _start.z + (nz / hl) * reach);
    const d = this.world.raycast(_ray, _down, above + (_start.y - base));
    return d === Infinity ? 0 : _ray.y - d - base;
  }

  private hasHeadroom(): boolean {
    const top = this.pos.clone().addScaledVector(_up, this.height - 0.05);
    const need = this.cfg.standHeight - this.height + 0.05;
    return this.world.raycast(top, _up, need) === Infinity;
  }
}

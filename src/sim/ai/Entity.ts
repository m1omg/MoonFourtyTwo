import { Vector3 } from 'three';
import type { AIContext } from './types.ts';
import { Area } from './nav/NavGrid.ts';
import { dampAngle } from '../../core/damp.ts';

/** Base class for hostile entities. Pure simulation; a renderer reads pos/yaw/anim and interpolates. */
export abstract class Entity {
  readonly pos = new Vector3();
  readonly prevPos = new Vector3();
  yaw = 0;
  prevYaw = 0;
  state = 'idle';
  stateTime = 0;
  active = true;
  /** Hidden from rendering (e.g. watchers when they "blink" away). */
  visible = true;
  radius = 0.35;
  /** Navigation area mask this entity may walk on. */
  navMask: number = Area.WALK;
  /** Presentation hints: 0..1 values the visual can use. */
  readonly anim = { move: 0, alert: 0, reach: 0 };

  protected path: Array<[number, number]> | null = null;
  protected pathIdx = 0;
  protected repath = 0;
  private lastTarget = new Vector3(Infinity, 0, 0);

  constructor(
    readonly id: string,
    readonly kind: string,
  ) {}

  /** Can't hurt anyone right now (asleep): being near it is safe, for saving too. */
  get dormant(): boolean {
    return false;
  }

  setState(s: string): void {
    if (s === this.state) return;
    this.state = s;
    this.stateTime = 0;
  }

  /** Called once per fixed tick by the reality. */
  tick(dt: number, ctx: AIContext): void {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.stateTime += dt;
    if (!this.active) return;
    this.step(dt, ctx);
  }

  protected abstract step(dt: number, ctx: AIContext): void;

  place(x: number, y: number, z: number, yaw = 0): void {
    this.pos.set(x, y, z);
    this.prevPos.copy(this.pos);
    this.yaw = this.prevYaw = yaw;
    this.path = null;
  }

  /**
   * Moves toward a target along the nav grid (or straight if there is no grid).
   * Returns remaining straight-line distance.
   */
  protected moveTo(target: Vector3, speed: number, dt: number, ctx: AIContext, turnRate = 8): number {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      this.anim.move = 0;
      return dist;
    }
    let wx = target.x;
    let wz = target.z;
    if (ctx.nav) {
      this.repath -= dt;
      if (!this.path || this.repath <= 0 || this.lastTarget.distanceToSquared(target) > 0.5) {
        this.path = ctx.nav.findPath(this.pos.x, this.pos.z, target.x, target.z, this.navMask);
        this.pathIdx = 1;
        this.repath = 0.6;
        this.lastTarget.copy(target);
      }
      if (this.path === null) {
        // unreachable: stay put
        this.anim.move = 0;
        return dist;
      }
      // A target outside our area (an off-limits room) only draws us to the nearest edge,
      // never through the doorway.
      const [tcx, tcz] = ctx.nav.toCell(target.x, target.z);
      const inArea = (ctx.nav.get(tcx, tcz) & this.navMask) !== 0;
      const end = this.path[this.path.length - 1]!;
      if (this.path.length > 1) {
        while (this.pathIdx < this.path.length - 1) {
          const wp = this.path[this.pathIdx]!;
          if (Math.hypot(wp[0] - this.pos.x, wp[1] - this.pos.z) < 0.35) this.pathIdx++;
          else break;
        }
        const wp = this.path[Math.min(this.pathIdx, this.path.length - 1)]!;
        const last = this.pathIdx >= this.path.length - 1;
        wx = last ? (inArea ? target.x : end[0]) : wp[0];
        wz = last ? (inArea ? target.z : end[1]) : wp[1];
      } else if (!inArea) {
        wx = end[0];
        wz = end[1];
      }
    }
    const sx = wx - this.pos.x;
    const sz = wz - this.pos.z;
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-3) {
      this.anim.move = 0;
      return dist;
    }
    const step = Math.min(speed * dt, sl);
    this.pos.x += (sx / sl) * step;
    this.pos.z += (sz / sl) * step;
    const desiredYaw = Math.atan2(-sx, -sz);
    this.yaw = dampAngle(this.yaw, desiredYaw, turnRate, dt);
    this.anim.move = speed > 0 ? Math.min(1, speed / 3) : 0;
    return dist - step;
  }

  protected face(target: Vector3, dt: number, rate = 8): void {
    const desired = Math.atan2(-(target.x - this.pos.x), -(target.z - this.pos.z));
    this.yaw = dampAngle(this.yaw, desired, rate, dt);
  }
}

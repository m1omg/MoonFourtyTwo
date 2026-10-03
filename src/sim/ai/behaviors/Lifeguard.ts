import { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext, NoiseEvent } from '../types.ts';
import { Area } from '../nav/NavGrid.ts';

const _head = new Vector3();

/**
 * "Plavčík" — the lifeguard. While you watch him he sits in his chair. Look away and he slips into
 * the water: a shadow that moves only through water, hunts splashes and pulls waders under. After a
 * long quiet he climbs back into the chair, but only while nobody is looking at it.
 */
export class Lifeguard extends Entity {
  /** Where he sits (feet level); his head is ~1.5 m above. */
  readonly chair = new Vector3();
  /** Water point at the foot of the chair where he slips in and climbs out. */
  readonly dive = new Vector3();
  /** Points in the water he drifts between while searching. */
  wanderPoints: Vector3[] = [];
  /** He only leaves the chair while the player is inside this area (the pool hall). */
  watchArea: { x0: number; z0: number; x1: number; z1: number } | null = null;
  /** Splashes carry far through water; other sounds barely reach him. */
  hearing = 24;
  dryHearing = 6;
  swimSpeed = 2.0;
  huntSpeed = 3.2;
  reach = 1.1;
  /** Seconds unwatched before he leaves the chair on his own. */
  patience = 5;
  private unseen = 0;
  private quiet = 0;
  private sinceReach = 99;
  private readonly target = new Vector3();
  private hasTarget = false;
  private wanderT = 0;

  constructor(id: string) {
    super(id, 'lifeguard');
    this.state = 'chair';
    this.navMask = Area.WATER | Area.DEEP;
  }

  /** True while he is in the water (the chair is empty). */
  get inWater(): boolean {
    return this.state !== 'chair';
  }

  get chairHead(): Vector3 {
    return _head.copy(this.chair).setY(this.chair.y + 1.5);
  }

  /** Loudest sound he can hear right now. */
  private listen(ctx: AIContext): NoiseEvent | null {
    let best: NoiseEvent | null = null;
    let bestScore = 0;
    const from = this.state === 'chair' ? this.chair : this.pos;
    for (const n of ctx.noises) {
      const reach = (n.kind === 'splash' ? this.hearing : this.dryHearing) * n.loudness;
      const d = Math.hypot(n.x - from.x, n.z - from.z);
      if (d > reach) continue;
      const score = n.loudness * (1 - d / reach);
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  private inArea(p: Vector3): boolean {
    const a = this.watchArea;
    return !a || (p.x >= a.x0 && p.x <= a.x1 && p.z >= a.z0 && p.z <= a.z1);
  }

  private heads(target: Vector3 | NoiseEvent): void {
    this.target.set(target.x, target.y, target.z);
    this.hasTarget = true;
  }

  protected step(dt: number, ctx: AIContext): void {
    const p = ctx.player;
    const heard = this.listen(ctx);
    this.sinceReach += dt;
    switch (this.state) {
      case 'chair': {
        this.visible = true;
        this.anim.alert = 0;
        this.place(this.chair.x, this.chair.y, this.chair.z, this.yaw);
        if (ctx.isObserved(this.chairHead, 0.45)) {
          this.unseen = 0;
          break;
        }
        this.unseen += dt;
        if (!this.inArea(p.pos)) break;
        if (this.unseen > this.patience || (heard && heard.kind === 'splash' && this.unseen > 0.4)) {
          this.place(this.dive.x, this.dive.y, this.dive.z, this.yaw);
          this.hasTarget = false;
          if (heard) this.heads(heard);
          this.quiet = 0;
          this.setState('dive');
          ctx.signal(this.id, 'dive');
        }
        break;
      }
      case 'dive': {
        this.visible = false;
        this.anim.alert = 0.4;
        if (this.stateTime > 0.8) this.setState('swim');
        break;
      }
      case 'swim': {
        this.anim.alert = 0.4;
        if (heard) {
          this.heads(heard);
          this.quiet = 0;
          const fromPlayer = Math.hypot(heard.x - p.pos.x, heard.z - p.pos.z) < 1.5;
          if (heard.kind === 'splash' && fromPlayer) {
            this.setState('hunt');
            ctx.signal(this.id, 'hunt');
            break;
          }
        } else this.quiet += dt;
        this.wanderT -= dt;
        if ((!this.hasTarget || this.wanderT <= 0) && this.wanderPoints.length && this.quiet > 3) {
          this.heads(ctx.rng.pick(this.wanderPoints));
          this.wanderT = 6 + ctx.rng.range(0, 5);
        }
        if (this.hasTarget) this.moveTo(this.target, this.swimSpeed, dt, ctx, 4);
        if (this.quiet > 22) this.setState('return');
        break;
      }
      case 'hunt': {
        this.anim.alert = 1;
        if (heard) {
          this.heads(heard);
          this.quiet = 0;
        } else this.quiet += dt;
        this.moveTo(this.target, this.huntSpeed, dt, ctx, 8);
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (d < this.reach && !p.dead) {
          if (p.inWater && p.waterDepth > 0.2) ctx.catchPlayer(this.id);
          else if (this.sinceReach > 6) {
            // the player is on the dry edge: a hand breaks the surface, but cannot follow
            this.sinceReach = 0;
            ctx.signal(this.id, 'reach');
          }
        }
        if (this.quiet > 5) this.setState('swim');
        break;
      }
      case 'return': {
        this.anim.alert = 0.2;
        if (heard && heard.kind === 'splash') {
          this.heads(heard);
          this.quiet = 0;
          this.setState('swim');
          break;
        }
        const rem = this.moveTo(this.dive, this.swimSpeed, dt, ctx, 4);
        if (rem < 0.6 && !ctx.isObserved(this.chairHead, 0.45)) {
          this.unseen = 0;
          this.setState('chair');
          ctx.signal(this.id, 'seated');
        }
        break;
      }
    }
  }
}

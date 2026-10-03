import { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext, NoiseEvent } from '../types.ts';
import { hearNoise } from '../perception.ts';
import { Area } from '../nav/NavGrid.ts';

/**
 * "Syčiak" — lives in the pipes and hunts by sound. Hidden in a vent until it hears something,
 * then slithers to the noise; footsteps close by turn investigation into a hunt. Steam stuns it.
 */
export class Hisser extends Entity {
  vents: Vector3[] = [];
  hearing = 13;
  investigateSpeed = 1.9;
  huntSpeed = 3.3;
  /** Trail of head positions for the body (newest first), sampled by distance. */
  readonly trail: Vector3[] = [];
  private target = new Vector3();
  private quiet = 0;
  private ventIdx = 0;

  get currentVent(): number {
    return this.ventIdx;
  }

  constructor(id: string) {
    super(id, 'hisser');
    this.state = 'hidden';
    this.visible = false;
    this.navMask = Area.WALK | Area.PIPE;
  }

  stun(): void {
    if (this.state === 'hidden') return;
    this.setState('stunned');
  }

  get exposed(): boolean {
    return this.state !== 'hidden';
  }

  protected step(dt: number, ctx: AIContext): void {
    const heard = this.state === 'hidden' ? null : hearNoise(this.pos, this.hearing, ctx);
    const p = ctx.player;
    switch (this.state) {
      case 'hidden': {
        this.visible = false;
        this.anim.alert = 0;
        if (ctx.noises.length === 0) break;
        // The pipes carry sound: listen at every vent and surface at the one nearest the noise.
        let best = -1;
        let bd = Infinity;
        let noise: NoiseEvent | null = null;
        this.vents.forEach((v, i) => {
          const n = hearNoise(v, this.hearing, ctx);
          if (!n) return;
          const d = Math.hypot(v.x - n.x, v.z - n.z);
          if (d < bd) {
            bd = d;
            best = i;
            noise = n;
          }
        });
        const n = noise as NoiseEvent | null;
        if (best < 0 || !n) break;
        this.ventIdx = best;
        const v = this.vents[best]!;
        this.place(v.x, v.y, v.z, Math.atan2(v.x - n.x, v.z - n.z));
        this.trail.length = 0;
        this.target.set(n.x, n.y, n.z);
        this.visible = true;
        this.setState('emerge');
        ctx.signal(this.id, 'emerge');
        break;
      }
      case 'emerge': {
        this.anim.alert = 0.6;
        if (this.stateTime > 1.1) this.setState('investigate');
        break;
      }
      case 'investigate': {
        this.anim.alert = 0.6;
        if (heard) {
          this.target.set(heard.x, heard.y, heard.z);
          this.quiet = 0;
          const fromPlayer = Math.hypot(heard.x - p.pos.x, heard.z - p.pos.z) < 1.5;
          if (fromPlayer && Math.hypot(heard.x - this.pos.x, heard.z - this.pos.z) < 7) {
            this.setState('hunt');
            ctx.signal(this.id, 'hunt');
            break;
          }
        } else this.quiet += dt;
        const rem = this.moveTo(this.target, this.investigateSpeed, dt, ctx, 6);
        if (rem < 0.5 && this.quiet > 2.8) this.setState('retreat');
        if (this.quiet > 9) this.setState('retreat');
        break;
      }
      case 'hunt': {
        this.anim.alert = 1;
        if (heard) {
          this.target.set(heard.x, heard.y, heard.z);
          this.quiet = 0;
        } else this.quiet += dt;
        this.moveTo(this.target, this.huntSpeed, dt, ctx, 10);
        const dp = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (dp < 0.9 && !p.dead && !p.hidden) ctx.catchPlayer(this.id);
        if (this.quiet > 4) this.setState('investigate');
        break;
      }
      case 'stunned': {
        this.anim.alert = 0.2;
        if (this.stateTime > 0.6) this.setState('retreat');
        break;
      }
      case 'retreat': {
        this.anim.alert = 0.2;
        let best = this.vents[0] ?? this.pos;
        let bd = Infinity;
        for (const v of this.vents) {
          const d = v.distanceTo(this.pos);
          if (d < bd) {
            bd = d;
            best = v;
          }
        }
        const rem = this.moveTo(best, this.huntSpeed * 0.9, dt, ctx, 8);
        if (rem < 0.4) {
          this.ventIdx = this.vents.indexOf(best);
          this.setState('hidden');
          ctx.signal(this.id, 'hide');
        }
        break;
      }
    }
    // body trail (sampled every 0.12 m of head travel)
    const last = this.trail[0];
    if (!last || last.distanceTo(this.pos) > 0.12) {
      this.trail.unshift(this.pos.clone());
      if (this.trail.length > 36) this.trail.pop();
    }
  }
}

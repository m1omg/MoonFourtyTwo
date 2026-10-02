import { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext } from '../types.ts';
import { canSeePlayer, distToPlayer } from '../perception.ts';

/**
 * "Obsluha" — the waitress of the endless pub. Ignores guests who sit at a table with a drink;
 * anyone standing that she sees gets "Ešte niečo?" and a chase. Sitting too long near her
 * means she brings you a drink you did not order.
 */
export class Staff extends Entity {
  readonly sight = { range: 15, halfAngle: 0.95, eyeHeight: 1.9 };
  patrolSpeed = 1.25;
  chaseSpeed = 3.25;
  /** Candidate patrol points (table aisles). */
  waypoints: Vector3[] = [];
  private target = new Vector3();
  private lastSeen = new Vector3();
  private lostFor = 0;
  private seatedNear = 0;
  private servedCooldown = 0;

  constructor(id: string) {
    super(id, 'staff');
    this.radius = 0.35;
  }

  protected step(dt: number, ctx: AIContext): void {
    const p = ctx.player;
    const protectedSeat = p.seated && p.seatedWithDrink;
    const sees = !protectedSeat && !p.dead && canSeePlayer(this.pos, this.yaw, this.sight, ctx);
    const dist = distToPlayer(this.pos, p);
    if (this.servedCooldown > 0) this.servedCooldown -= dt;
    this.anim.alert = this.state === 'chase' || this.state === 'notice' ? 1 : 0;

    switch (this.state) {
      case 'idle':
      case 'patrol': {
        if (sees) {
          this.setState('notice');
          this.lastSeen.copy(p.pos);
          ctx.signal(this.id, 'notice');
          break;
        }
        if (protectedSeat && dist < 7) {
          this.seatedNear += dt;
          if (this.seatedNear > 24 && this.servedCooldown <= 0) {
            this.setState('serve');
            break;
          }
        } else this.seatedNear = Math.max(0, this.seatedNear - dt * 0.5);
        if (this.state === 'idle' || this.pos.distanceTo(this.target) < 0.6 || this.stateTime > 25)
          this.pickTarget(ctx);
        this.setState('patrol');
        this.moveTo(this.target, this.patrolSpeed, dt, ctx);
        break;
      }
      case 'notice': {
        this.face(p.pos, dt, 10);
        this.anim.move = 0;
        if (this.stateTime > 0.75) this.setState('chase');
        break;
      }
      case 'chase': {
        if (protectedSeat) {
          this.setState('search');
          ctx.signal(this.id, 'lost');
          break;
        }
        if (sees) {
          this.lastSeen.copy(p.pos);
          this.lostFor = 0;
        } else {
          this.lostFor += dt;
          if (p.ward || this.lostFor > 3.5) {
            this.setState('search');
            break;
          }
        }
        const rem = this.moveTo(sees ? p.pos : this.lastSeen, this.chaseSpeed, dt, ctx, 12);
        if (sees && rem < 0.75 && dist < 0.95) ctx.catchPlayer(this.id);
        break;
      }
      case 'search': {
        const rem = this.moveTo(this.lastSeen, this.patrolSpeed * 1.4, dt, ctx);
        if (sees) {
          this.setState('notice');
          ctx.signal(this.id, 'notice');
        } else if (rem < 0.6 || this.stateTime > 8) this.setState('patrol');
        break;
      }
      case 'serve': {
        if (!protectedSeat) {
          this.setState('patrol');
          break;
        }
        const rem = this.moveTo(p.pos, this.patrolSpeed * 1.2, dt, ctx);
        if (rem < 1.3) {
          ctx.signal(this.id, 'serve');
          this.seatedNear = 0;
          this.servedCooldown = 40;
          this.setState('patrol');
          this.pickTarget(ctx);
        }
        break;
      }
    }
  }

  private pickTarget(ctx: AIContext): void {
    if (!this.waypoints.length) {
      this.target.copy(this.pos);
      return;
    }
    // prefer waypoints within ~20 m so she stays around
    for (let i = 0; i < 8; i++) {
      const w = ctx.rng.pick(this.waypoints);
      if (w.distanceTo(this.pos) < 22) {
        this.target.copy(w);
        return;
      }
    }
    this.target.copy(ctx.rng.pick(this.waypoints));
  }
}

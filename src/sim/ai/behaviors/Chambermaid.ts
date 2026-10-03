import { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext, HidingSpot } from '../types.ts';
import { canSeePlayer, distToPlayer } from '../perception.ts';

/** A room she cleans: the spot in the corridor before its door and the spot inside she wipes. */
export interface MaidRoom {
  index: number;
  front: Vector3;
  inside: Vector3;
}

/**
 * "Chyžná" — pushes a squeaking cart up and down the hotel corridor and now and then knocks on a
 * room („Upratovanie!"), goes in and cleans it: whatever she wipes is gone (the reality erases it).
 * Whoever she sees, she comes for. She does not see into wardrobes or under beds — unless she
 * saw you get in; then she opens it.
 */
export class Chambermaid extends Entity {
  readonly sight = { range: 11, halfAngle: 0.85, eyeHeight: 1.6 };
  patrolSpeed = 1.0;
  chaseSpeed = 2.9;
  reach = 0.85;
  /** Corridor and lobby points she walks between. */
  patrol: Vector3[] = [];
  rooms: MaidRoom[] = [];
  /** Seconds of patrolling between two rooms. */
  cleanEvery = 18;
  /** Where her cart stands (pushed ahead of her, left behind when she runs). */
  readonly cartPos = new Vector3();
  cartYaw = 0;
  private wp = 0;
  private sinceClean = 0;
  private room: MaidRoom | null = null;
  private spot: HidingSpot | null = null;
  private opened = false;
  private lostFor = 0;
  private readonly lastSeen = new Vector3();
  /** Did she see the player this tick (e.g. climbing into a wardrobe)? */
  seesPlayer = false;

  constructor(id: string) {
    super(id, 'chambermaid');
    this.state = 'patrol';
  }

  /** The room she is busy with (its door should open while she is in there). */
  get busyRoom(): number | null {
    return this.room && ['knock', 'enter', 'clean', 'leave'].includes(this.state) ? this.room.index : null;
  }

  private get pushing(): boolean {
    return this.state === 'patrol' || this.state === 'toRoom';
  }

  protected step(dt: number, ctx: AIContext): void {
    const p = ctx.player;
    const sees = !p.dead && canSeePlayer(this.pos, this.yaw, this.sight, ctx);
    this.seesPlayer = sees;
    this.anim.alert = this.state === 'chase' || this.state === 'notice' || this.state === 'open' ? 1 : 0;
    if (sees && this.state !== 'notice' && this.state !== 'chase' && this.state !== 'open') {
      this.lastSeen.copy(p.pos);
      this.room = null;
      this.setState('notice');
      ctx.signal(this.id, 'notice');
    }
    switch (this.state) {
      case 'patrol': {
        this.sinceClean += dt;
        if (this.sinceClean > this.cleanEvery && this.rooms.length > 0) {
          this.room = this.rooms[ctx.rng.int(0, this.rooms.length)]!;
          this.setState('toRoom');
          break;
        }
        if (this.patrol.length === 0) break;
        const t = this.patrol[this.wp % this.patrol.length]!;
        if (this.moveTo(t, this.patrolSpeed, dt, ctx) < 0.4) this.wp++;
        break;
      }
      case 'toRoom': {
        if (this.moveTo(this.room!.front, this.patrolSpeed, dt, ctx) < 0.3) {
          this.setState('knock');
          ctx.signal(this.id, 'knock', this.room!.index);
        }
        break;
      }
      case 'knock': {
        this.anim.move = 0;
        this.face(this.room!.inside, dt, 6);
        if (this.stateTime > 2) this.setState('enter');
        break;
      }
      case 'enter': {
        if (this.moveTo(this.room!.inside, this.patrolSpeed, dt, ctx) < 0.3) this.setState('clean');
        break;
      }
      case 'clean': {
        this.anim.move = 0;
        if (this.stateTime > 5) {
          ctx.signal(this.id, 'clean', this.room!.index);
          this.setState('leave');
        }
        break;
      }
      case 'leave': {
        if (this.moveTo(this.room!.front, this.patrolSpeed, dt, ctx) < 0.3) {
          ctx.signal(this.id, 'leave', this.room!.index);
          this.room = null;
          this.sinceClean = 0;
          this.setState('patrol');
        }
        break;
      }
      case 'notice': {
        this.anim.move = 0;
        this.face(p.pos, dt, 10);
        if (this.stateTime > 0.6) {
          this.lostFor = 0;
          this.setState('chase');
        }
        break;
      }
      case 'chase': {
        if (p.hidden) {
          if (p.hiddenWitnessed) {
            this.spot = p.hidden;
            this.opened = false;
            this.setState('open');
          } else this.setState('search');
          break;
        }
        if (sees) {
          this.lastSeen.copy(p.pos);
          this.lostFor = 0;
        } else {
          this.lostFor += dt;
          if (p.ward || this.lostFor > 3) {
            this.setState('search');
            break;
          }
        }
        const rem = this.moveTo(sees ? p.pos : this.lastSeen, this.chaseSpeed, dt, ctx, 12);
        if (sees && !p.dead && distToPlayer(this.pos, p) < this.reach) ctx.catchPlayer(this.id);
        else if (!sees && rem < 0.3) this.setState('search');
        break;
      }
      case 'open': {
        const spot = this.spot!;
        if (!this.opened) {
          if (this.moveTo(spot.approach, this.chaseSpeed, dt, ctx, 12) < 0.35) {
            this.opened = true;
            this.stateTime = 0;
            ctx.signal(this.id, 'open', spot.id);
          }
          break;
        }
        this.anim.move = 0;
        this.face(spot.pos, dt, 10);
        if (this.stateTime > 0.7) {
          if (p.hidden?.id === spot.id && !p.dead) ctx.catchPlayer(this.id);
          else this.setState('search');
        }
        break;
      }
      case 'search': {
        this.anim.alert = 0.5;
        const rem = this.moveTo(this.lastSeen, this.patrolSpeed * 1.4, dt, ctx);
        if (rem < 0.3) this.anim.move = 0;
        if (this.stateTime > 7) {
          // back to the nearest patrol point
          let best = 0;
          let bestD = Infinity;
          this.patrol.forEach((pt, i) => {
            const d = pt.distanceToSquared(this.pos);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          this.wp = best;
          this.setState('patrol');
        }
        break;
      }
    }
    // the cart rolls ahead of her while she pushes it; otherwise it stays where she left it
    if (this.pushing) {
      this.cartPos.set(
        this.pos.x - Math.sin(this.yaw) * 0.85,
        this.pos.y,
        this.pos.z - Math.cos(this.yaw) * 0.85,
      );
      this.cartYaw = this.yaw;
    }
  }
}

import type { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext } from '../types.ts';
import { distToPlayer } from '../perception.ts';

/**
 * "Revízorka", the ticket inspector — boards at the rear door and works up the aisle, stopping at every passenger
 * („Lístok."). When it reaches you it asks for your ticket: a validated one and it thanks you and
 * walks back out; none, and you are taken. In the dark between two flickers it walks much faster.
 */
export class Inspector extends Entity {
  speed = 0.8;
  darkSpeed = 2.6;
  reach = 1.1;
  /** Aisle points from the rear door to the front. */
  route: Vector3[] = [];
  /** Route indices where a passenger sits (a pause to check their ticket). */
  checks = new Set<number>();
  checkSeconds = 1.6;
  /** Seconds it waits in front of you for the ticket. */
  askSeconds = 1.3;
  /** Set by the reality every tick: the lights are out. */
  dark = false;
  /** Set by the reality: your ticket is validated. */
  ticketOk = false;
  private wp = 0;

  constructor(id: string) {
    super(id, 'inspector');
    this.state = 'wait';
    this.visible = false;
  }

  /** Steps in at the rear door and starts the round. */
  board(): void {
    const start = this.route[0];
    if (start) this.place(start.x, start.y, start.z, 0);
    this.wp = 1;
    this.visible = true;
    this.setState('walk');
  }

  protected step(dt: number, ctx: AIContext): void {
    const p = ctx.player;
    const d = distToPlayer(this.pos, p);
    const speed = this.dark ? this.darkSpeed : this.speed;
    switch (this.state) {
      case 'wait':
      case 'gone':
        this.anim.move = 0;
        break;
      case 'walk': {
        if (!p.dead && d < this.reach + 0.3) {
          this.setState('ask');
          ctx.signal(this.id, 'ask');
          break;
        }
        const target = this.route[this.wp];
        if (!target) {
          // you slipped past it: it turns round and comes for you
          this.setState('seek');
          break;
        }
        if (this.moveTo(target, speed, dt, ctx) < 0.15) {
          if (this.checks.has(this.wp)) {
            this.setState('check');
            ctx.signal(this.id, 'check', this.wp);
          }
          this.wp++;
        }
        break;
      }
      case 'check': {
        this.anim.move = 0;
        if (!p.dead && d < this.reach + 0.3) {
          this.setState('ask');
          ctx.signal(this.id, 'ask');
        } else if (this.stateTime > (this.dark ? 0.3 : this.checkSeconds)) this.setState('walk');
        break;
      }
      case 'seek': {
        if (p.dead) break;
        this.moveTo(p.pos, speed, dt, ctx);
        if (d < this.reach + 0.3) {
          this.setState('ask');
          ctx.signal(this.id, 'ask');
        }
        break;
      }
      case 'ask': {
        this.anim.move = 0;
        this.face(p.pos, dt, 10);
        if (p.dead) break;
        if (d > this.reach + 1.2) {
          // walking away does not help
          this.setState('seek');
          break;
        }
        if (this.stateTime > this.askSeconds) {
          if (this.ticketOk) {
            ctx.signal(this.id, 'thanks');
            this.wp = this.nearestRouteIndex();
            this.setState('leave');
          } else ctx.catchPlayer(this.id);
        }
        break;
      }
      case 'leave': {
        // back down the aisle to the rear door
        const target = this.route[this.wp];
        if (!target) break;
        if (this.moveTo(target, this.speed * 1.2, dt, ctx) < 0.15) {
          if (this.wp === 0) {
            this.visible = false;
            this.setState('gone');
            ctx.signal(this.id, 'gone');
          } else this.wp--;
        }
        break;
      }
    }
  }

  private nearestRouteIndex(): number {
    let best = 0;
    let bestD = Infinity;
    this.route.forEach((pt, i) => {
      const dd = pt.distanceToSquared(this.pos);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    return best;
  }
}

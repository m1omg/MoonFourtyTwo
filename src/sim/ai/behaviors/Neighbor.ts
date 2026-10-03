import { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext } from '../types.ts';

const _to = new Vector3();

/**
 * "Sused" — waits behind a flat door on the stairwell. In the dark it rattles the chain, opens up,
 * stands in the doorway and then shuffles toward you across its landing. When the stairwell light
 * comes on it goes back inside; a burning lighter holds it at arm's length and juniper (the ward)
 * keeps it from noticing you at all. Someone glowing after Horský čaj draws it out sooner. It never
 * leaves its own landing, and gives up when you have been gone a while.
 */
export class Neighbor extends Entity {
  /** Where it stands just inside its door (y = the landing's floor). */
  readonly home = new Vector3();
  /** Its landing (it never steps off it). */
  area = { x0: -3, z0: -4, x1: 3, z1: -1 };
  /** Where you must stand for it to notice you (null: anywhere near its door). */
  zone: { x0: number; z0: number; x1: number; z1: number } | null = null;
  /** Set by the reality every tick: is the stairwell light on? */
  lit = true;
  speed = 0.9;
  /** Seconds of darkness (with you near) before it opens up. */
  courage = 3;
  /** How close a lighter lets it come. */
  lighterReach = 2.2;
  reach = 0.8;
  private waited = 0;
  private readonly target = new Vector3();

  constructor(id: string) {
    super(id, 'neighbor');
    this.state = 'inside';
    this.visible = false;
  }

  /** True while its door should stand open. */
  get doorOpen(): boolean {
    return this.state !== 'inside' && this.state !== 'rattle';
  }

  /** 0..1 how intently it watches through the peephole (it is about to come out at 1). */
  get watching(): number {
    if (this.state === 'rattle') return 1;
    if (this.state !== 'inside') return 0;
    return Math.min(1, this.waited / this.courage);
  }

  /** Someone knocked: in the dark it is nearly ready to come out. */
  provoke(): void {
    if (this.state === 'inside' && !this.lit) this.waited = Math.max(this.waited, this.courage * 0.7);
  }

  /** Back behind a closed door at once (e.g. when the floor is swapped for another). */
  reset(): void {
    this.place(this.home.x, this.home.y, this.home.z, this.yaw);
    this.visible = false;
    this.waited = 0;
    this.anim.move = 0;
    this.anim.alert = 0;
    this.setState('inside');
  }

  protected step(dt: number, ctx: AIContext): void {
    const p = ctx.player;
    const sameFloor = Math.abs(p.pos.y - this.home.y) < 1.2;
    const dist = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const z = this.zone;
    const inZone = !z || (p.pos.x > z.x0 && p.pos.x < z.x1 && p.pos.z > z.z0 && p.pos.z < z.z1);
    const near = sameFloor && inZone && Math.hypot(p.pos.x - this.home.x, p.pos.z - this.home.z) < 7;
    switch (this.state) {
      case 'inside': {
        this.visible = false;
        this.anim.alert = 0;
        if (!this.lit && near && !p.dead && !p.ward) {
          this.waited += dt * (p.glowing ? 3 : 1);
          if (this.waited > this.courage) {
            this.setState('rattle');
            ctx.signal(this.id, 'rattle');
          }
        } else this.waited = Math.max(0, this.waited - dt * 2);
        break;
      }
      case 'rattle': {
        if (this.lit) {
          this.setState('inside');
          break;
        }
        if (this.stateTime > 1.2) {
          this.place(this.home.x, this.home.y, this.home.z, this.yaw);
          this.visible = true;
          this.setState('doorway');
          ctx.signal(this.id, 'open');
        }
        break;
      }
      case 'doorway': {
        this.anim.alert = 0.4;
        this.face(p.pos, dt, 3);
        if (this.lit || (!near && this.stateTime > 8)) this.setState('retreat');
        else if (this.stateTime > 1.5 && near && !p.ward) this.setState('approach');
        break;
      }
      case 'approach': {
        this.anim.alert = 1;
        if (this.lit) {
          this.setState('retreat');
          break;
        }
        if (!near || p.ward || (p.lightOn && dist < this.lighterReach)) {
          this.setState('hold');
          break;
        }
        this.walkTo(p.pos, this.speed, dt);
        if (dist < this.reach && !p.dead && sameFloor) ctx.catchPlayer(this.id);
        break;
      }
      case 'hold': {
        this.anim.alert = 0.7;
        this.anim.move = 0;
        this.face(p.pos, dt, 4);
        if (this.lit || (!near && this.stateTime > 8)) this.setState('retreat');
        else if (near && !p.ward && !(p.lightOn && dist < this.lighterReach + 0.3) && this.stateTime > 0.5)
          this.setState('approach');
        break;
      }
      case 'retreat': {
        this.anim.alert = 0.2;
        if (this.walkTo(this.home, this.speed * 2.5, dt) < 0.1) {
          this.visible = false;
          this.waited = 0;
          this.setState('inside');
          ctx.signal(this.id, 'close');
        }
        break;
      }
    }
  }

  /** Straight-line shuffle across the landing, clamped to it. Returns the remaining distance. */
  private walkTo(goal: Vector3, speed: number, dt: number): number {
    const a = this.area;
    this.target.set(
      Math.min(a.x1, Math.max(a.x0, goal.x)),
      this.home.y,
      Math.min(a.z1, Math.max(a.z0, goal.z)),
    );
    _to.subVectors(this.target, this.pos).setY(0);
    const d = _to.length();
    if (d < 1e-3) {
      this.anim.move = 0;
      return 0;
    }
    const s = Math.min(d, speed * dt);
    this.pos.addScaledVector(_to, s / d);
    this.pos.y = this.home.y;
    this.face(this.target, dt, 6);
    this.anim.move = Math.min(1, speed / 2);
    return d - s;
  }
}

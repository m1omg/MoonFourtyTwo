import { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext } from '../types.ts';

/**
 * "Moves only when nobody is looking." Frozen while observed; glides toward the player when
 * unobserved (including during light flickers). Juniper ward makes it lose interest.
 */
export class Watcher extends Entity {
  awake = false;
  speed = 2.2;
  reach = 0.85;
  readonly home = new Vector3();
  /** Extra observation test supplied by the reality (e.g. lights must be on). */
  canBeSeen: () => boolean = () => true;
  /** Seconds the watcher has been unobserved. */
  unseen = 0;
  /** Head height used for the observation test. */
  headHeight = 1.1;
  /** The other watchers: it never walks into one (they queue rather than pass through each other). */
  others: readonly Watcher[] = [];
  private readonly head = new Vector3();
  private readonly tmp = new Vector3();

  override get dormant(): boolean {
    return !this.awake;
  }

  constructor(id: string) {
    super(id, 'watcher');
    this.radius = 0.4;
  }

  protected step(dt: number, ctx: AIContext): void {
    if (!this.awake) return;
    this.head.set(this.pos.x, this.pos.y + this.headHeight, this.pos.z);
    const seen =
      this.canBeSeen() &&
      (ctx.isObserved(this.head, 0.45) ||
        ctx.isObserved(this.tmp.set(this.pos.x, this.pos.y + 0.5, this.pos.z), 0.45));
    this.anim.alert = 1;
    if (seen) {
      this.unseen = 0;
      this.anim.move = 0;
      this.setState('frozen');
      return;
    }
    this.unseen += dt;
    if (this.unseen < 0.2) return;
    const p = ctx.player;
    if (p.ward) {
      this.setState('return');
      this.moveTo(this.home, this.speed * 0.7, dt, ctx, 20);
      this.keepApart();
      return;
    }
    this.setState('creep');
    this.moveTo(p.pos, this.speed, dt, ctx, 20);
    this.keepApart();
    this.face(p.pos, dt, 30);
    const remaining = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (remaining < this.reach && !p.dead) ctx.catchPlayer(this.id);
  }

  /** Takes back this tick's step if it walked into another watcher (it waits behind instead). */
  private keepApart(): void {
    for (const o of this.others) {
      if (o === this) continue;
      const min = this.radius + o.radius;
      const now = Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z);
      if (now >= min) continue;
      if (now < Math.hypot(this.prevPos.x - o.pos.x, this.prevPos.z - o.pos.z)) {
        this.pos.x = this.prevPos.x;
        this.pos.z = this.prevPos.z;
        return;
      }
    }
  }
}

import { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext } from '../types.ts';
import { distToPlayer } from '../perception.ts';

const _to = new Vector3();

/**
 * "Mrazivec" — a figure standing in the snow. It moves only while no light falls on it (your
 * lighter or torch in front of you, a burning barrel, a flash in the sky); in the dark it walks
 * straight at you. Nobody ever sees one move: lit, it is always just standing there, facing you.
 * Juniper makes it lose interest.
 */
export class FrostFigure extends Entity {
  speed = 1.5;
  reach = 0.9;
  /** It only stirs for someone this close. */
  wakeRange = 26;
  /** Set by the reality every tick. */
  lit = false;

  constructor(id: string) {
    super(id, 'frost');
    this.state = 'still';
  }

  protected step(dt: number, ctx: AIContext): void {
    const p = ctx.player;
    const d = distToPlayer(this.pos, p);
    if (this.lit || p.dead || p.ward || d > this.wakeRange) {
      this.anim.move = 0;
      this.setState('still');
      return;
    }
    this.setState('creep');
    _to.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    const len = _to.length();
    if (len > 1e-4) {
      const step = Math.min(this.speed * dt, len);
      this.pos.x += (_to.x / len) * step;
      this.pos.z += (_to.z / len) * step;
      // unseen, it does not need to turn slowly
      this.yaw = Math.atan2(-_to.x, -_to.z);
    }
    this.anim.move = 1;
    if (d < this.reach) ctx.catchPlayer(this.id);
  }
}

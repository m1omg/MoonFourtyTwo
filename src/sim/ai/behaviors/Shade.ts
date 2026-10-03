import { Vector3 } from 'three';
import { Entity } from '../Entity.ts';
import type { AIContext } from '../types.ts';
import { distToPlayer } from '../perception.ts';

const _head = new Vector3();

/**
 * One of the fluctuations that come out of the void in the last round: everyone from the memories
 * at once. Out of the void they walk toward you, faster the colder the pub gets; under your gaze
 * they all but stop; a burning lighter keeps them at arm's length and juniper (borovička) makes
 * them lose interest. When the stove goes out, they rush.
 */
export class Shade extends Entity {
  speed = 0.75;
  rushSpeed = 2.8;
  reach = 0.75;
  /** How close a burning lighter lets them come. */
  lightRadius = 2.6;
  /** Set by the reality every tick: 0 (stove out) .. 1 (burning well). */
  warmth = 1;

  constructor(id: string) {
    super(id, 'shade');
    this.state = 'void';
    this.visible = false;
  }

  /** Steps out of the void at (x, z). */
  release(x: number, z: number): void {
    this.place(x, 0, z, 0);
    this.visible = true;
    this.setState('come');
  }

  /** Back into the void, all of them, when the round is over. */
  banish(): void {
    if (this.state === 'void' || this.state === 'gone') return;
    this.setState('gone');
  }

  protected step(dt: number, ctx: AIContext): void {
    const p = ctx.player;
    if (this.state === 'void') return;
    if (this.state === 'gone') {
      // they sink away into the dark
      this.pos.y -= dt * 0.8;
      if (this.pos.y < -2.2) this.visible = false;
      return;
    }
    if (p.dead) return;
    const d = distToPlayer(this.pos, p);
    const dx = (p.pos.x - this.pos.x) / Math.max(d, 1e-4);
    const dz = (p.pos.z - this.pos.z) / Math.max(d, 1e-4);
    this.yaw = Math.atan2(-dx, -dz);
    let v: number;
    if (this.warmth <= 0) {
      this.setState('rush');
      v = this.rushSpeed;
    } else if (p.ward) {
      this.setState('lost');
      v = 0;
    } else if (p.lightOn && d < this.lightRadius) {
      // the flame pushes them back
      this.setState('held');
      v = -this.speed * 0.8;
    } else {
      _head.set(this.pos.x, 1.5, this.pos.z);
      const seen = ctx.isObserved(_head, 0.4);
      this.setState(seen ? 'watched' : 'come');
      v = this.speed * (seen ? 0.15 : 1.6 - this.warmth);
    }
    const step = v > 0 ? Math.min(v * dt, Math.max(0, d - this.reach * 0.5)) : v * dt;
    this.pos.x += dx * step;
    this.pos.z += dz * step;
    this.anim.move = Math.min(1, Math.abs(v) / this.speed);
    if (d < this.reach) ctx.catchPlayer(this.id);
  }
}

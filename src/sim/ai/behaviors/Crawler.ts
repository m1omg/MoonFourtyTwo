import { Entity } from '../Entity.ts';
import type { AIContext } from '../types.ts';
import { distToPlayer } from '../perception.ts';

/** Water level below the pier deck (the deck is at y = 0). */
export const CRAWL_WATER_Y = -0.6;

/**
 * A fluctuation from the black sea. It climbs up onto the pier beside someone who has stood still
 * too long and crawls to them; whoever keeps walking, it lets go of and it slides back into the
 * water. The reality decides when and where it rises (it knows the pier); its touch is an „okno".
 */
export class Crawler extends Entity {
  speed = 0.9;
  reach = 0.7;
  /** Seconds the player has to keep walking before it gives up. */
  patience = 1.6;
  /** Seconds of climbing out of the water. */
  riseSeconds = 1.4;
  /** Set by the reality every tick: how long the player has been standing still. */
  playerStill = 0;
  private walking = 0;
  private readonly from = { x: 0, z: 0 };

  constructor(id: string) {
    super(id, 'crawler');
    this.state = 'under';
    this.visible = false;
  }

  /** Climbs out of the water at the pier's edge (x, z). */
  rise(x: number, z: number): void {
    this.place(x, CRAWL_WATER_Y, z, this.yaw);
    this.from.x = x;
    this.from.z = z;
    this.walking = 0;
    this.visible = true;
    this.setState('rise');
  }

  get submerged(): boolean {
    return this.state === 'under';
  }

  /** Lets go and slides back into the water (wherever it is). */
  sink(): void {
    if (this.state !== 'under' && this.state !== 'sink') this.setState('sink');
  }

  protected step(dt: number, ctx: AIContext): void {
    const p = ctx.player;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    switch (this.state) {
      case 'under':
        this.anim.move = 0;
        break;
      case 'rise': {
        const k = Math.min(1, this.stateTime / this.riseSeconds);
        this.pos.y = CRAWL_WATER_Y * (1 - k);
        this.yaw = Math.atan2(-dx, -dz);
        this.anim.move = 0.4;
        if (k >= 1) this.setState('crawl');
        break;
      }
      case 'crawl': {
        if (p.dead) {
          this.anim.move = 0;
          break;
        }
        this.walking = this.playerStill > 0.25 ? 0 : this.walking + dt;
        if (this.walking > this.patience || p.ward) {
          this.setState('sink');
          break;
        }
        const d = distToPlayer(this.pos, p);
        if (d > 1e-3) {
          const s = Math.min(this.speed * dt, d);
          this.pos.x += (dx / d) * s;
          this.pos.z += (dz / d) * s;
          this.yaw = Math.atan2(-dx, -dz);
        }
        this.anim.move = 1;
        if (d < this.reach) ctx.catchPlayer(this.id);
        break;
      }
      case 'sink': {
        // back over the edge it came from, and down
        const k = Math.min(1, this.stateTime / 1.2);
        this.pos.x += (this.from.x - this.pos.x) * Math.min(1, dt * 3);
        this.pos.z += (this.from.z - this.pos.z) * Math.min(1, dt * 3);
        this.pos.y = CRAWL_WATER_Y * k;
        this.anim.move = 0.5;
        if (k >= 1) {
          this.visible = false;
          this.setState('under');
        }
        break;
      }
    }
  }
}

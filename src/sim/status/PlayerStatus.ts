import { Buffs, Intoxication, BAC_DRUNK } from './Intoxication.ts';
import { Fear, Cold } from './Fear.ts';
import { ITEMS, type ItemId } from '../items/items.data.ts';

export interface StatusEnv {
  /** 0..1 threat from entities. */
  threat: number;
  /** 0..1 darkness around the player. */
  darkness: number;
  /** 0..1 cold exposure (0 = indoors/warm). */
  coldExposure: number;
  /** 0..1 nearby warmth (fire, stove). */
  warmth: number;
}

export type StatusEvent = 'okno' | 'frozen' | 'eon' | 'absintheEnd' | 'revealEnd';

/** Aggregates intoxication, buffs, fear and cold. Pure sim. */
export class PlayerStatus {
  readonly intox = new Intoxication();
  readonly buffs = new Buffs();
  readonly fear = new Fear();
  readonly cold = new Cold();
  /** Set when the last drink was the mystery one (UI shows ∞). */
  mysteryShown = false;

  consume(id: ItemId): StatusEvent[] {
    const def = ITEMS[id];
    const events: StatusEvent[] = [];
    if (def.abv > 0) this.intox.drink(def.ml, def.abv, def.absorbSec);
    this.mysteryShown = !!def.mystery;
    for (const e of def.effects) {
      switch (e.type) {
        case 'buff':
          if (e.buff === 'clarity') this.buffs.remove('absinthe');
          if (e.buff === 'absinthe' && this.buffs.has('clarity')) break;
          this.buffs.add(e.buff, e.seconds, e.strength ?? 1);
          break;
        case 'composure':
          this.fear.calm(e.amount);
          break;
        case 'heat':
          this.cold.add(e.amount);
          break;
        case 'eon':
          events.push('eon');
          break;
      }
    }
    return events;
  }

  /** Courage from alcohol itself plus the beer buff. */
  get courage(): number {
    return Math.min(1, this.buffs.strength('courage') + Math.min(0.4, this.intox.bac * 0.18));
  }

  get layerVisionActive(): boolean {
    return this.intox.bac >= BAC_DRUNK || this.buffs.has('reveal');
  }

  step(dt: number, env: StatusEnv): StatusEvent[] {
    const out: StatusEvent[] = [];
    const expired = this.buffs.step(dt);
    if (expired.includes('absinthe')) out.push('absintheEnd');
    if (expired.includes('reveal')) out.push('revealEnd');
    this.intox.step(dt, this.buffs.strength('sober'));
    this.fear.step(dt, env.threat, env.darkness, this.courage);
    const warmth = Math.min(1, env.warmth + this.buffs.strength('warmth') * 0.6);
    this.cold.step(dt, env.coldExposure, warmth);
    if (this.intox.okno) out.push('okno');
    if (this.cold.frozen) out.push('frozen');
    return out;
  }

  reset(bac = 0): void {
    this.intox.set(bac);
    this.buffs.clear();
    this.fear.value = 0;
    this.cold.heat = 1;
    this.cold.freezingFor = 0;
  }
}

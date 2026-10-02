import type { BuffType } from '../items/items.data.ts';

/**
 * Blood alcohol in per-mille (‰) using the Widmark formula with a gameplay scale.
 * Absorption is spread over time; elimination is linear (faster with sobering buffs).
 */
export const BODY_MASS_KG = 85;
export const WIDMARK_R = 0.68;
export const ETHANOL_DENSITY = 0.789;
/** Gameplay multiplier so a handful of drinks matters within one reality. */
export const GAME_SCALE = 1.6;
/** Base elimination per second (‰/s): 0.15 ‰ per minute. */
export const BASE_ELIMINATION = 0.15 / 60;

export const BAC_TIPSY = 0.5;
export const BAC_DRUNK = 1.2;
export const BAC_WASTED = 2.0;
export const BAC_OKNO = 3.0;

export function gramsOfAlcohol(ml: number, abv: number): number {
  return ml * abv * ETHANOL_DENSITY;
}

/** Peak ‰ contributed by grams of alcohol. */
export function permilleFromGrams(grams: number): number {
  return (grams / (BODY_MASS_KG * WIDMARK_R)) * GAME_SCALE;
}

interface Pending {
  remaining: number; // ‰ still to absorb
  rate: number; // ‰ per second
}

export class Intoxication {
  bac = 0;
  private pending: Pending[] = [];

  drink(ml: number, abv: number, absorbSec: number): void {
    const total = permilleFromGrams(gramsOfAlcohol(ml, abv));
    if (total <= 0) return;
    this.pending.push({ remaining: total, rate: total / Math.max(absorbSec, 0.001) });
  }

  /** ‰ still sitting in the stomach (will be absorbed). */
  get pendingTotal(): number {
    let s = 0;
    for (const p of this.pending) s += p.remaining;
    return s;
  }

  set(value: number): void {
    this.bac = Math.max(0, value);
    this.pending = [];
  }

  /** @param soberStrength extra elimination multiplier from sobering buffs (0 = none). */
  step(dt: number, soberStrength: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]!;
      const add = Math.min(p.remaining, p.rate * dt);
      p.remaining -= add;
      this.bac += add;
      if (p.remaining <= 1e-9) this.pending.splice(i, 1);
    }
    const elim = BASE_ELIMINATION * (1 + soberStrength * 3);
    this.bac = Math.max(0, this.bac - elim * dt);
  }

  get level(): 'sober' | 'tipsy' | 'drunk' | 'wasted' {
    if (this.bac >= BAC_WASTED) return 'wasted';
    if (this.bac >= BAC_DRUNK) return 'drunk';
    if (this.bac >= BAC_TIPSY) return 'tipsy';
    return 'sober';
  }

  get okno(): boolean {
    return this.bac >= BAC_OKNO;
  }
}

export interface ActiveBuff {
  type: BuffType;
  remaining: number;
  strength: number;
}

export class Buffs {
  readonly list: ActiveBuff[] = [];

  add(type: BuffType, seconds: number, strength = 1): void {
    const existing = this.list.find((b) => b.type === type);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, seconds);
      existing.strength = Math.max(existing.strength, strength);
      return;
    }
    this.list.push({ type, remaining: seconds, strength });
  }

  remove(type: BuffType): void {
    const i = this.list.findIndex((b) => b.type === type);
    if (i >= 0) this.list.splice(i, 1);
  }

  has(type: BuffType): boolean {
    return this.list.some((b) => b.type === type);
  }

  strength(type: BuffType): number {
    const b = this.list.find((x) => x.type === type);
    return b ? b.strength : 0;
  }

  remaining(type: BuffType): number {
    const b = this.list.find((x) => x.type === type);
    return b ? b.remaining : 0;
  }

  step(dt: number): BuffType[] {
    const expired: BuffType[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]!;
      b.remaining -= dt;
      if (b.remaining <= 0) {
        expired.push(b.type);
        this.list.splice(i, 1);
      }
    }
    return expired;
  }

  clear(): void {
    this.list.length = 0;
  }
}

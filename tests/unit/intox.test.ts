import { describe, expect, it } from 'vitest';
import {
  Intoxication,
  permilleFromGrams,
  gramsOfAlcohol,
  BAC_OKNO,
} from '../../src/sim/status/Intoxication.ts';
import { PlayerStatus } from '../../src/sim/status/PlayerStatus.ts';

const env = { threat: 0, darkness: 0, coldExposure: 0, warmth: 0 };

describe('Intoxication', () => {
  it('uses the Widmark formula with the game scale', () => {
    const beer = permilleFromGrams(gramsOfAlcohol(500, 0.045));
    expect(beer).toBeGreaterThan(0.45);
    expect(beer).toBeLessThan(0.55);
  });

  it('absorbs over time and then eliminates linearly', () => {
    const i = new Intoxication();
    i.drink(500, 0.045, 40);
    for (let k = 0; k < 60 * 20; k++) i.step(1 / 60, 0);
    const mid = i.bac;
    expect(mid).toBeGreaterThan(0.15);
    for (let k = 0; k < 60 * 60; k++) i.step(1 / 60, 0);
    const later = i.bac;
    expect(later).toBeLessThan(mid + 0.4);
    expect(later).toBeGreaterThan(0);
  });

  it('is identical regardless of step size grouping', () => {
    const a = new Intoxication();
    const b = new Intoxication();
    a.drink(40, 0.52, 10);
    b.drink(40, 0.52, 10);
    for (let k = 0; k < 600; k++) a.step(1 / 60, 0.5);
    for (let k = 0; k < 600; k++) b.step(1 / 60, 0.5);
    expect(a.bac).toBe(b.bac);
  });

  it('triggers okno at the threshold', () => {
    const s = new PlayerStatus();
    s.intox.set(BAC_OKNO - 0.01);
    expect(s.step(1 / 60, env)).not.toContain('okno');
    s.intox.set(BAC_OKNO + 0.01);
    expect(s.step(1 / 60, env)).toContain('okno');
  });

  it('fernet cancels absinthe and blocks it while active', () => {
    const s = new PlayerStatus();
    s.consume('absint');
    expect(s.buffs.has('absinthe')).toBe(true);
    s.consume('fernet');
    expect(s.buffs.has('absinthe')).toBe(false);
    s.consume('absint');
    expect(s.buffs.has('absinthe')).toBe(false);
  });

  it('slivovica restores composure', () => {
    const s = new PlayerStatus();
    s.fear.scare(0.9);
    s.consume('slivovica');
    expect(s.fear.value).toBe(0);
  });
});

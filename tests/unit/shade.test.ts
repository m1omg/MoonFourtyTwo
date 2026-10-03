import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Shade } from '../../src/sim/ai/behaviors/Shade.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, PlayerView } from '../../src/sim/ai/types.ts';

const DT = 1 / 60;

function setup(opts: { observed?: boolean } = {}) {
  const player = {
    pos: new Vector3(0, 0, 0),
    eye: new Vector3(0, 1.66, 0),
    vel: new Vector3(),
    lookDir: new Vector3(0, 0, -1),
    hidden: null,
    ward: false,
    dead: false,
    lightOn: false,
  } as unknown as PlayerView;
  const caught: string[] = [];
  const ctx = {
    world: { lineOfSight: () => true },
    nav: null,
    rng: new Rng(1),
    player,
    noises: [],
    isObserved: () => !!opts.observed,
    catchPlayer: (by: string) => {
      caught.push(by);
      player.dead = true;
    },
    signal: () => {},
  } as unknown as AIContext;
  const s = new Shade('tien');
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) s.tick(DT, ctx);
  };
  return { s, player, caught, run };
}

describe('Shade', () => {
  it('waits in the void until it is let out', () => {
    const t = setup();
    t.run(30);
    expect(t.s.state).toBe('void');
    expect(t.caught).toEqual([]);
  });

  it('walks up to you while the stove is warm, faster when it is cold', () => {
    const warm = setup();
    warm.s.release(0, -10);
    warm.run(3);
    const cold = setup();
    cold.s.warmth = 0.2;
    cold.s.release(0, -10);
    cold.run(3);
    expect(warm.s.pos.z).toBeGreaterThan(-10);
    expect(cold.s.pos.z).toBeGreaterThan(warm.s.pos.z);
  });

  it('nearly stops while you look at it', () => {
    const t = setup({ observed: true });
    t.s.release(0, -10);
    t.run(10);
    expect(t.s.state).toBe('watched');
    expect(t.s.pos.z).toBeLessThan(-8);
    expect(t.caught).toEqual([]);
  });

  it('is kept at arm’s length by a burning lighter', () => {
    const t = setup();
    t.player.lightOn = true;
    t.s.release(0, -6);
    t.run(30);
    expect(t.caught).toEqual([]);
    expect(Math.abs(t.s.pos.z)).toBeGreaterThan(2.2);
  });

  it('rushes when the stove goes out', () => {
    const t = setup({ observed: true });
    t.player.lightOn = true;
    t.s.warmth = 0;
    t.s.release(0, -8);
    t.run(4);
    expect(t.caught).toEqual(['tien']);
  });

  it('sinks away when the round is over', () => {
    const t = setup();
    t.s.release(0, -10);
    t.run(1);
    t.s.banish();
    t.run(4);
    expect(t.s.state).toBe('gone');
    expect(t.s.visible).toBe(false);
    expect(t.caught).toEqual([]);
  });
});

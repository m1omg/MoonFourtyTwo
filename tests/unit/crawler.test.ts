import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Crawler, CRAWL_WATER_Y } from '../../src/sim/ai/behaviors/Crawler.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, PlayerView } from '../../src/sim/ai/types.ts';

const DT = 1 / 60;

function setup() {
  const player = {
    pos: new Vector3(0, 0, 0),
    eye: new Vector3(0, 1.66, 0),
    vel: new Vector3(),
    lookDir: new Vector3(0, 0, -1),
    hidden: null,
    ward: false,
    dead: false,
  } as unknown as PlayerView;
  const caught: string[] = [];
  const ctx = {
    world: { lineOfSight: () => true },
    nav: null,
    rng: new Rng(1),
    player,
    noises: [],
    isObserved: () => false,
    catchPlayer: (by: string) => {
      caught.push(by);
      player.dead = true;
    },
    signal: () => {},
  } as unknown as AIContext;
  const c = new Crawler('lezec');
  const run = (seconds: number, still = true) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      c.playerStill = still ? c.playerStill + DT : 0;
      c.tick(DT, ctx);
    }
  };
  return { c, player, caught, run };
}

describe('Crawler', () => {
  it('stays under the water until it is told to rise', () => {
    const s = setup();
    s.run(20);
    expect(s.c.state).toBe('under');
    expect(s.c.visible).toBe(false);
  });

  it('climbs out of the water and takes someone who stands still', () => {
    const s = setup();
    s.c.rise(1, -6);
    expect(s.c.pos.y).toBeCloseTo(CRAWL_WATER_Y, 6);
    s.run(1);
    expect(s.c.state).toBe('rise');
    s.run(12);
    expect(s.caught).toEqual(['lezec']);
  });

  it('lets go of someone who keeps walking and slides back into the water', () => {
    const s = setup();
    s.c.rise(1, -6);
    s.run(2);
    expect(s.c.state).toBe('crawl');
    s.run(3, false);
    expect(['sink', 'under']).toContain(s.c.state);
    s.run(2, false);
    expect(s.c.state).toBe('under');
    expect(s.c.visible).toBe(false);
    expect(s.caught).toEqual([]);
  });

  it('a short step does not shake it off', () => {
    const s = setup();
    s.c.rise(1, -6);
    s.run(2);
    s.run(0.8, false);
    s.run(0.5);
    expect(s.c.state).toBe('crawl');
  });
});

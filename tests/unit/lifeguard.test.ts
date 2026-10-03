import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { NavGrid, Area } from '../../src/sim/ai/nav/NavGrid.ts';
import { Lifeguard } from '../../src/sim/ai/behaviors/Lifeguard.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, NoiseEvent, PlayerView } from '../../src/sim/ai/types.ts';

const DT = 1 / 60;

/** A pool x[0,10] z[0,6] (water) with a dry deck around it; the chair stands at the east end. */
function setup() {
  const nav = new NavGrid(30, 20, 0.5, -2, -2);
  nav.fillRect(-2, -2, 13, 8, Area.WALK);
  nav.fillRect(0, 0, 10, 6, Area.WATER, true);
  const player = {
    pos: new Vector3(5, 0, 7),
    eye: new Vector3(5, 1.6, 7),
    vel: new Vector3(),
    lookDir: new Vector3(0, 0, -1),
    crouched: false,
    seated: false,
    seatedWithDrink: false,
    hidden: null,
    hiddenWitnessed: false,
    visibility: 1,
    ward: false,
    glowing: false,
    lightOn: false,
    lightPower: 1,
    inWater: false,
    waterDepth: 0,
    dead: false,
  } as PlayerView;
  const noises: NoiseEvent[] = [];
  const caught: string[] = [];
  const signals: string[] = [];
  let observed = false;
  const ctx = {
    world: { lineOfSight: () => true },
    nav,
    rng: new Rng(4),
    time: 0,
    dt: DT,
    player,
    get noises() {
      return noises;
    },
    isObserved: () => observed,
    catchPlayer: (by: string) => {
      caught.push(by);
      player.dead = true; // the blackout ends the chase
    },
    signal: (_id: string, name: string) => signals.push(name),
  } as unknown as AIContext;
  const g = new Lifeguard('plavcik');
  g.chair.set(11, 0, 3);
  g.dive.set(9.5, 0, 3);
  g.wanderPoints = [new Vector3(2, 0, 2), new Vector3(8, 0, 4)];
  g.watchArea = { x0: -2, z0: -2, x1: 13, z1: 8 };
  const run = (seconds: number, each?: (i: number) => void) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      each?.(i);
      g.tick(DT, ctx);
      noises.length = 0;
    }
  };
  return {
    g,
    player,
    noises,
    caught,
    signals,
    run,
    setObserved: (v: boolean) => (observed = v),
  };
}

describe('Lifeguard', () => {
  it('stays in his chair while watched, even when you splash', () => {
    const s = setup();
    s.setObserved(true);
    s.run(10, (i) => {
      if (i % 30 === 0) s.noises.push({ x: 5, y: 0, z: 1, loudness: 1, kind: 'splash' });
    });
    expect(s.g.state).toBe('chair');
  });

  it('slips into the water when nobody watches him', () => {
    const s = setup();
    s.run(6);
    expect(s.g.inWater).toBe(true);
    expect(s.signals).toContain('dive');
  });

  it('pulls a wader under, but only reaches for someone on the dry edge', () => {
    const s = setup();
    s.run(1); // not long enough to leave on his own
    expect(s.g.state).toBe('chair');
    // the player wades in the pool, splashing
    s.player.pos.set(4, -0.5, 3);
    s.player.inWater = true;
    s.player.waterDepth = 0.5;
    s.run(15, (i) => {
      if (i % 20 === 0) s.noises.push({ x: 4, y: -0.5, z: 3, loudness: 0.6, kind: 'splash' });
    });
    expect(s.caught).toEqual(['plavcik']);
  });

  it('cannot take you on dry ground', () => {
    const s = setup();
    s.run(6);
    // standing on the deck right at the pool edge, making splashes by throwing things in
    s.player.pos.set(5, 0, 6.3);
    s.player.inWater = false;
    s.player.waterDepth = 0;
    s.run(15, (i) => {
      if (i % 20 === 0) s.noises.push({ x: 5, y: 0, z: 5.6, loudness: 1, kind: 'splash' });
    });
    expect(s.caught).toEqual([]);
  });

  it('climbs back into the chair after a long quiet, but not while you watch the chair', () => {
    const s = setup();
    s.run(6);
    expect(s.g.inWater).toBe(true);
    s.setObserved(true);
    s.run(40);
    expect(s.g.state).not.toBe('chair');
    s.setObserved(false);
    s.run(2);
    expect(s.g.state).toBe('chair');
    expect(s.signals).toContain('seated');
    // and if you still don't watch him, he soon goes back in
    s.run(6);
    expect(s.g.inWater).toBe(true);
  });
});

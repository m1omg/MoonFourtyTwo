import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { FrostFigure } from '../../src/sim/ai/behaviors/FrostFigure.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, PlayerView } from '../../src/sim/ai/types.ts';

const DT = 1 / 60;

function setup(distance = 10) {
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
  const f = new FrostFigure('mrazivec');
  f.place(0, 0, -distance);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) f.tick(DT, ctx);
  };
  return { f, player, caught, run };
}

describe('FrostFigure', () => {
  it('walks at you in the dark and takes you', () => {
    const s = setup(10);
    s.run(10);
    expect(s.caught).toEqual(['mrazivec']);
  });

  it('does not move while light falls on it', () => {
    const s = setup(10);
    s.f.lit = true;
    s.run(20);
    expect(s.f.pos.z).toBeCloseTo(-10, 6);
    expect(s.f.state).toBe('still');
    expect(s.caught).toEqual([]);
  });

  it('moves only in the moments between lights', () => {
    const s = setup(10);
    for (let i = 0; i < 10; i++) {
      s.f.lit = i % 2 === 1;
      s.run(0.5);
    }
    // half of 5 s in the dark at 1.5 m/s
    expect(s.f.pos.z).toBeCloseTo(-10 + 2.5 * 1.5, 1);
  });

  it('ignores someone far away, and someone warded by juniper', () => {
    const far = setup(40);
    far.run(10);
    expect(far.f.pos.z).toBeCloseTo(-40, 6);
    const warded = setup(8);
    warded.player.ward = true;
    warded.run(10);
    expect(warded.caught).toEqual([]);
    expect(warded.f.pos.z).toBeCloseTo(-8, 6);
  });
});

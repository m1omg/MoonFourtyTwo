import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Inspector } from '../../src/sim/ai/behaviors/Inspector.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, PlayerView } from '../../src/sim/ai/types.ts';

const DT = 1 / 60;

/** An aisle along z from the rear door (z = 5) to the front (z = -5); the player stands at `pz`. */
function setup(pz = -4) {
  const player = {
    pos: new Vector3(0, 0, pz),
    eye: new Vector3(0, 1.66, pz),
    vel: new Vector3(),
    lookDir: new Vector3(0, 0, 1),
    hidden: null,
    ward: false,
    dead: false,
  } as unknown as PlayerView;
  const caught: string[] = [];
  const signals: string[] = [];
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
    signal: (_id: string, name: string) => signals.push(name),
  } as unknown as AIContext;
  const r = new Inspector('revizor');
  for (let z = 5; z >= -5; z -= 1) r.route.push(new Vector3(0, 0, z));
  r.checks = new Set([2, 5]);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) r.tick(DT, ctx);
  };
  return { r, player, caught, signals, run };
}

describe('Inspector', () => {
  it('waits unseen until it boards', () => {
    const s = setup();
    s.run(10);
    expect(s.r.state).toBe('wait');
    expect(s.r.visible).toBe(false);
  });

  it('works up the aisle, checking passengers, and takes you without a ticket', () => {
    const s = setup(-4);
    s.r.board();
    s.run(60);
    expect(s.signals.filter((n) => n === 'check')).toHaveLength(2);
    expect(s.signals).toContain('ask');
    expect(s.caught).toEqual(['revizor']);
  });

  it('thanks you for a validated ticket and walks back out', () => {
    const s = setup(-4);
    s.r.ticketOk = true;
    s.r.board();
    s.run(60);
    expect(s.caught).toEqual([]);
    expect(s.signals).toContain('thanks');
    expect(s.signals).toContain('gone');
    expect(s.r.state).toBe('gone');
    expect(s.r.visible).toBe(false);
  });

  it('hurries in the dark', () => {
    const lit = setup(-20);
    lit.r.checks = new Set();
    lit.r.board();
    lit.run(2);
    const dark = setup(-20);
    dark.r.checks = new Set();
    dark.r.dark = true;
    dark.r.board();
    dark.run(2);
    expect(5 - dark.r.pos.z).toBeGreaterThan((5 - lit.r.pos.z) * 2);
  });

  it('turns round for a player it walked past', () => {
    // the player is behind its starting point (the rear seat): it reaches the front, then comes back
    const s = setup(6.5);
    s.r.checks = new Set();
    s.r.route = s.r.route.map((p) => p.clone().setZ(p.z - 1));
    s.r.board();
    s.run(5);
    expect(['seek', 'ask', 'walk']).toContain(s.r.state);
    s.run(60);
    expect(s.caught).toEqual(['revizor']);
  });
});

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { NavGrid, Area } from '../../src/sim/ai/nav/NavGrid.ts';
import { Hisser } from '../../src/sim/ai/behaviors/Hisser.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, NoiseEvent, PlayerView } from '../../src/sim/ai/types.ts';

/**
 * A corridor (WALK) ending in a doorway to a safe room (DOOR only). The creature hunts a player
 * standing just inside the safe room.
 */
function setup() {
  const nav = new NavGrid(40, 20, 0.5, -10, -5);
  nav.fillRect(-10, -1, 0, 1, Area.WALK); // corridor x[-10,0]
  nav.fillRect(0, -5, 10, 5, Area.DOOR, true); // safe room x[0,10]
  const player = {
    pos: new Vector3(1.0, 0, 0),
    eye: new Vector3(1.0, 1.6, 0),
    vel: new Vector3(),
    lookDir: new Vector3(-1, 0, 0),
    crouched: false,
    seated: false,
    seatedWithDrink: false,
    hidden: null,
    hiddenWitnessed: false,
    visibility: 1,
    ward: false,
    glowing: false,
    dead: false,
  } as unknown as PlayerView;
  const noises: NoiseEvent[] = [];
  const caught: string[] = [];
  const ctx = {
    world: { lineOfSight: () => true },
    nav,
    rng: new Rng(1),
    time: 0,
    dt: 1 / 60,
    player,
    noises,
    isObserved: () => false,
    catchPlayer: (by: string) => caught.push(by),
    signal: () => {},
  } as unknown as AIContext;
  const h = new Hisser('h');
  h.vents = [new Vector3(-8, 0, 0)];
  return { nav, player, noises, caught, ctx, h };
}

describe('Hisser', () => {
  it('surfaces at the vent nearest a noise and goes back when it stays quiet', () => {
    const { ctx, noises, h } = setup();
    h.vents = [new Vector3(-8, 0, 0), new Vector3(-3, 0, 0)];
    noises.push({ x: -2.5, y: 0, z: 0, loudness: 1, kind: 'object' });
    h.tick(1 / 60, ctx);
    noises.length = 0;
    expect(h.state).toBe('emerge');
    expect(h.pos.x).toBe(-3);
    for (let i = 0; i < 60 * 20 && h.state !== 'hidden'; i++) h.tick(1 / 60, ctx);
    expect(h.state).toBe('hidden');
  });

  it('never follows a noise through the doorway of an off-limits room', () => {
    const { ctx, noises, caught, h, nav } = setup();
    // the player keeps making noise just inside the safe room
    for (let i = 0; i < 60 * 30; i++) {
      if (i % 20 === 0) noises.push({ x: 1.0, y: 0, z: 0, loudness: 1, kind: 'step' });
      h.tick(1 / 60, ctx);
      noises.length = 0;
      const [cx, cz] = nav.toCell(h.pos.x, h.pos.z);
      expect(nav.get(cx, cz) & (Area.WALK | Area.PIPE)).not.toBe(0);
    }
    expect(caught).toEqual([]);
    // it got as close as the edge of its own area
    expect(h.pos.x).toBeGreaterThan(-1);
  });
});

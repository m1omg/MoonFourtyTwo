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

describe('Hisser tuning (gentler at the owner request)', () => {
  /** An open corridor, no safe room: a player walking and making footsteps. */
  function corridor() {
    const s = setup();
    s.nav.fillRect(-10, -1, 10, 1, Area.WALK, true);
    return s;
  }

  it('footsteps a few metres off do not start a hunt, close ones do', () => {
    const { ctx, noises, h, player } = corridor();
    h.vents = [new Vector3(0, 0, 0)];
    // surfaces at the noise, then hears steps from 6 m away: it searches, but does not hunt
    player.pos.set(6, 0, 0);
    noises.push({ x: 6, y: 0, z: 0, loudness: 1, kind: 'step' });
    h.tick(1 / 60, ctx);
    noises.length = 0;
    for (let i = 0; i < 60 * 2.2; i++) h.tick(1 / 60, ctx);
    h.place(0, 0, 0);
    for (let i = 0; i < 30; i++) {
      if (i % 15 === 0) noises.push({ x: 6, y: 0, z: 0, loudness: 1, kind: 'step' });
      h.tick(1 / 60, ctx);
      noises.length = 0;
      h.place(0, 0, 0);
    }
    expect(h.state).toBe('investigate');
    // the same steps 3 m away: a hunt
    player.pos.set(3, 0, 0);
    noises.push({ x: 3, y: 0, z: 0, loudness: 1, kind: 'step' });
    h.tick(1 / 60, ctx);
    expect(h.state).toBe('hunt');
  });

  it('waits at the vent before setting off, and gives up a hunt soon when you go quiet', () => {
    const { ctx, noises, h, player } = corridor();
    h.vents = [new Vector3(0, 0, 0)];
    player.pos.set(2, 0, 0);
    noises.push({ x: 2, y: 0, z: 0, loudness: 1, kind: 'step' });
    h.tick(1 / 60, ctx);
    noises.length = 0;
    expect(h.state).toBe('emerge');
    for (let i = 0; i < 60 * 1.5; i++) h.tick(1 / 60, ctx);
    expect(h.state).toBe('emerge');
    for (let i = 0; i < 60 * 0.5; i++) h.tick(1 / 60, ctx);
    // a step close by: hunt; then silence (you stand still, out of reach): it stops hunting
    player.pos.set(h.pos.x + 3, 0, 0);
    noises.push({ x: player.pos.x, y: 0, z: 0, loudness: 1, kind: 'step' });
    h.tick(1 / 60, ctx);
    noises.length = 0;
    expect(h.state).toBe('hunt');
    player.pos.set(9.5, 0, 0);
    for (let i = 0; i < 60 * 2.7; i++) h.tick(1 / 60, ctx);
    expect(h.state).not.toBe('hunt');
  });

  it('is slower than a sprint and only a little faster than a walk when it hunts', () => {
    const h = new Hisser('h');
    expect(h.huntSpeed).toBeLessThan(2.6);
    expect(h.huntSpeed).toBeLessThan(4.3 * 0.6);
  });
});

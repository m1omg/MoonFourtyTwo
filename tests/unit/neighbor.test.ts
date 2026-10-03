import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Neighbor } from '../../src/sim/ai/behaviors/Neighbor.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, PlayerView } from '../../src/sim/ai/types.ts';

const DT = 1 / 60;

/** A landing x[-3,3] z[-4,-1] at y = 5.6 with one door in the north wall. */
function setup() {
  const player = {
    pos: new Vector3(0, 5.6, -1.5),
    eye: new Vector3(0, 7.2, -1.5),
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
  const caught: string[] = [];
  const signals: string[] = [];
  const ctx = {
    world: { lineOfSight: () => true },
    nav: null,
    rng: new Rng(2),
    time: 0,
    dt: DT,
    player,
    noises: [],
    isObserved: () => false,
    catchPlayer: (by: string) => {
      caught.push(by);
      player.dead = true;
    },
    signal: (_id: string, name: string) => signals.push(name),
  } as unknown as AIContext;
  const n = new Neighbor('sused');
  n.home.set(-1.5, 5.6, -3.6);
  n.place(-1.5, 5.6, -3.6);
  n.area = { x0: -2.8, z0: -3.8, x1: 2.8, z1: -1.0 };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) n.tick(DT, ctx);
  };
  return { n, player, caught, signals, run };
}

describe('Neighbor', () => {
  it('stays behind its door while the stairwell light is on', () => {
    const s = setup();
    s.n.lit = true;
    s.run(20);
    expect(s.n.state).toBe('inside');
    expect(s.signals).toEqual([]);
  });

  it('comes out in the dark and takes someone who stands still', () => {
    const s = setup();
    s.n.lit = false;
    s.run(30);
    expect(s.signals.slice(0, 2)).toEqual(['rattle', 'open']);
    expect(s.caught).toEqual(['sused']);
  });

  it('goes back inside when the light comes on', () => {
    const s = setup();
    s.n.lit = false;
    s.run(6.5); // out of the door and on its way
    expect(['doorway', 'approach']).toContain(s.n.state);
    s.n.lit = true;
    s.run(5);
    expect(s.n.state).toBe('inside');
    expect(s.signals).toContain('close');
    expect(s.caught).toEqual([]);
  });

  it('keeps its distance from a burning lighter', () => {
    const s = setup();
    s.player.lightOn = true;
    s.n.lit = false;
    s.run(40);
    expect(s.caught).toEqual([]);
    const d = Math.hypot(s.n.pos.x - s.player.pos.x, s.n.pos.z - s.player.pos.z);
    expect(d).toBeGreaterThan(1.8);
  });

  it('watches through the peephole before it comes out', () => {
    const s = setup();
    s.n.lit = false;
    s.run(1.5);
    expect(s.n.state).toBe('inside');
    expect(s.n.watching).toBeGreaterThan(0.4);
    expect(s.n.watching).toBeLessThan(0.6);
  });

  it('does not notice someone warded by juniper', () => {
    const s = setup();
    s.player.ward = true;
    s.n.lit = false;
    s.run(30);
    expect(s.n.state).toBe('inside');
    expect(s.signals).toEqual([]);
    expect(s.caught).toEqual([]);
  });

  it('comes out sooner for someone glowing after Horský čaj', () => {
    const s = setup();
    s.player.glowing = true;
    s.n.lit = false;
    s.run(1.3);
    expect(s.signals).toEqual(['rattle']);
  });

  it('gives up and shuts its door when you have gone', () => {
    const s = setup();
    s.n.lit = false;
    s.run(6.5);
    expect(['doorway', 'approach']).toContain(s.n.state);
    s.player.pos.set(0, 5.6 + 1.4, 3); // up on the half landing
    s.run(14);
    expect(s.n.state).toBe('inside');
    expect(s.signals).toContain('close');
  });

  it('a knock in the dark brings it out sooner', () => {
    const s = setup();
    s.n.lit = false;
    s.n.provoke();
    s.run(1.2);
    expect(s.signals).toEqual(['rattle']);
  });

  it('a knock while the light is on does nothing', () => {
    const s = setup();
    s.n.lit = true;
    s.n.provoke();
    s.run(5);
    expect(s.n.state).toBe('inside');
    expect(s.n.watching).toBe(0);
  });

  it('does not notice you through a wall (outside its zone)', () => {
    const s = setup();
    s.n.zone = { x0: -3, z0: -4, x1: 3, z1: 0.6 };
    s.player.pos.set(-1.5, 5.6, -6); // in the flat behind the door
    s.n.lit = false;
    s.run(30);
    expect(s.n.state).toBe('inside');
    expect(s.signals).toEqual([]);
  });

  it('never leaves its own floor', () => {
    const s = setup();
    s.player.pos.set(0, 5.6 + 2.8, -1.5); // the floor above
    s.n.lit = false;
    s.run(30);
    expect(s.n.state).toBe('inside');
  });
});

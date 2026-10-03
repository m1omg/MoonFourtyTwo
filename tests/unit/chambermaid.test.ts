import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Chambermaid } from '../../src/sim/ai/behaviors/Chambermaid.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, HidingSpot, PlayerView } from '../../src/sim/ai/types.ts';

const DT = 1 / 60;

/** A corridor along z with one room to the west; line of sight is switched by hand. */
function setup() {
  const player = {
    pos: new Vector3(0, 0, -30),
    eye: new Vector3(0, 1.66, -30),
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
  const los = { clear: false };
  const caught: string[] = [];
  const signals: Array<[string, unknown]> = [];
  const ctx = {
    world: { lineOfSight: () => los.clear },
    nav: null,
    rng: new Rng(4),
    time: 0,
    dt: DT,
    player,
    noises: [],
    isObserved: () => false,
    catchPlayer: (by: string) => {
      caught.push(by);
      player.dead = true;
    },
    signal: (_id: string, name: string, data?: unknown) => signals.push([name, data]),
  } as unknown as AIContext;
  const m = new Chambermaid('chyzna');
  m.place(0, 0, -2, Math.PI);
  m.patrol = [new Vector3(0, 0, -2), new Vector3(0, 0, -20)];
  m.rooms = [{ index: 3, front: new Vector3(0, 0, -10), inside: new Vector3(-4, 0, -11) }];
  m.cleanEvery = 6;
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) m.tick(DT, ctx);
  };
  const lookAt = () => {
    player.eye.set(player.pos.x, 1.66, player.pos.z);
  };
  return { m, player, los, caught, signals, run, lookAt };
}

const wardrobe: HidingSpot = {
  id: 'w',
  kind: 'wardrobe',
  pos: new Vector3(-6, 0, -12),
  approach: new Vector3(-5, 0, -12),
};

describe('Chambermaid', () => {
  it('patrols, then knocks, cleans a room and leaves it', () => {
    const s = setup();
    s.run(60);
    const names = s.signals.map(([n]) => n);
    const k = names.indexOf('knock');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(names.slice(k, k + 3)).toEqual(['knock', 'clean', 'leave']);
    expect(s.signals[k]![1]).toBe(3);
    expect(s.caught).toEqual([]);
  });

  it('comes for someone she sees and takes them', () => {
    const s = setup();
    s.player.pos.set(0, 0, -8);
    s.lookAt();
    s.los.clear = true;
    s.run(10);
    expect(s.signals.map(([n]) => n)).toContain('notice');
    expect(s.caught).toEqual(['chyzna']);
  });

  it('gives up on someone who hid unseen', () => {
    const s = setup();
    s.player.pos.set(0, 0, -8);
    s.lookAt();
    s.los.clear = true;
    s.run(0.8); // she noticed
    expect(['notice', 'chase']).toContain(s.m.state);
    s.player.hidden = wardrobe;
    s.player.hiddenWitnessed = false;
    s.los.clear = false;
    s.run(20);
    expect(s.caught).toEqual([]);
    // back on her rounds (walking the corridor or already busy with a room)
    expect(['patrol', 'toRoom', 'knock', 'enter', 'clean', 'leave']).toContain(s.m.state);
  });

  it('opens the wardrobe she saw you climb into', () => {
    const s = setup();
    s.player.pos.set(0, 0, -8);
    s.lookAt();
    s.los.clear = true;
    s.run(1.0);
    s.player.hidden = wardrobe;
    s.player.hiddenWitnessed = true;
    s.los.clear = false;
    s.run(15);
    expect(s.signals.some(([n, d]) => n === 'open' && d === 'w')).toBe(true);
    expect(s.caught).toEqual(['chyzna']);
  });

  it('leaves her cart behind when she runs', () => {
    const s = setup();
    s.run(3);
    const cart = s.m.cartPos.clone();
    s.player.pos.set(0, 0, -12);
    s.lookAt();
    s.los.clear = true;
    s.run(2);
    expect(s.m.state).toBe('chase');
    expect(s.m.cartPos.distanceTo(cart)).toBeLessThan(1.2);
  });
});

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Watcher } from '../../src/sim/ai/behaviors/Watcher.ts';
import { onScreen } from '../../src/sim/ai/observe.ts';
import { Rng } from '../../src/core/rng.ts';
import type { AIContext, PlayerView } from '../../src/sim/ai/types.ts';

const DT = 1 / 60;
const FWD = new Vector3(0, 0, -1);

/** A point `deg` degrees to the side (or up) of the view, `d` metres away. */
const at = (deg: number, d = 5, vertical = false) => {
  const a = (deg * Math.PI) / 180;
  return vertical
    ? new Vector3(0, Math.sin(a) * d, -Math.cos(a) * d)
    : new Vector3(Math.sin(a) * d, 0, -Math.cos(a) * d);
};

describe('onScreen', () => {
  // a 16:9 screen with a 72° vertical view reaches about 52° to each side
  it('counts what the sides of a wide screen show', () => {
    expect(onScreen(at(45), FWD, 0, 72, 16 / 9, 0)).toBe(true);
    expect(onScreen(at(-50), FWD, 0, 72, 16 / 9, 0)).toBe(true);
    expect(onScreen(at(56), FWD, 0, 72, 16 / 9, 0)).toBe(false);
  });

  it('counts a body partly in view at the edge', () => {
    expect(onScreen(at(54, 2), FWD, 0, 72, 16 / 9, 0.45)).toBe(true);
    expect(onScreen(at(70, 2), FWD, 0, 72, 16 / 9, 0.45)).toBe(false);
  });

  it('stops at the top of the screen and behind you', () => {
    expect(onScreen(at(30, 5, true), FWD, 0, 72, 16 / 9, 0)).toBe(true);
    expect(onScreen(at(45, 5, true), FWD, 0, 72, 16 / 9, 0)).toBe(false);
    expect(onScreen(new Vector3(0, 0, 3), FWD, 0, 72, 16 / 9, 0.45)).toBe(false);
  });

  it('follows the view as it turns', () => {
    // facing +x (yaw −90°): a point ahead on +x is seen, one on −z at 90° is not
    const yaw = -Math.PI / 2;
    const look = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    expect(onScreen(new Vector3(5, 0, 0), look, yaw, 72, 16 / 9, 0)).toBe(true);
    expect(onScreen(new Vector3(0, 0, -5), look, yaw, 72, 16 / 9, 0)).toBe(false);
  });

  it('a narrow (upright) screen sees less to the sides', () => {
    expect(onScreen(at(30), FWD, 0, 72, 9 / 16, 0)).toBe(false);
    expect(onScreen(at(15), FWD, 0, 72, 9 / 16, 0)).toBe(true);
  });
});

describe('Watcher', () => {
  function setup(observed = false) {
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
      isObserved: () => observed,
      catchPlayer: (by: string) => caught.push(by),
      signal: () => {},
    } as unknown as AIContext;
    const a = new Watcher('jano');
    const b = new Watcher('fero');
    for (const w of [a, b]) {
      w.awake = true;
      w.speed = 0.75;
      w.others = [a, b];
    }
    const run = (seconds: number, each?: () => void) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        a.tick(DT, ctx);
        b.tick(DT, ctx);
        each?.();
      }
    };
    return { a, b, run, caught };
  }

  it('never walks through the other one on the way to you', () => {
    const t = setup();
    // one right behind the other, both coming straight for you
    t.a.place(0, 0, 6);
    t.b.place(0.05, 0, 7);
    let closest = Infinity;
    t.run(9, () => {
      closest = Math.min(closest, Math.hypot(t.a.pos.x - t.b.pos.x, t.a.pos.z - t.b.pos.z));
    });
    expect(closest).toBeGreaterThan(0.79);
    expect(t.caught.length).toBeGreaterThan(0);
  });

  it('holds still while seen, and moves once it is not', () => {
    const seen = setup(true);
    seen.a.place(0, 0, 4);
    seen.run(2);
    expect(seen.a.pos.z).toBe(4);
    const unseen = setup(false);
    unseen.a.place(0, 0, 4);
    unseen.run(2);
    expect(unseen.a.pos.z).toBeLessThan(4);
  });
});

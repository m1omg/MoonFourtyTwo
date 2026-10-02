import { describe, expect, it } from 'vitest';
import { NavGrid, Area } from '../../src/sim/ai/nav/NavGrid.ts';
import { Rng } from '../../src/core/rng.ts';

/** Reference shortest path length (8-neighbour Dijkstra, no corner cutting). */
function dijkstra(g: NavGrid, s: [number, number], t: [number, number]): number {
  const W = g.width;
  const dist = new Float64Array(W * g.height).fill(Infinity);
  const done = new Uint8Array(W * g.height);
  dist[g.idx(...s)] = 0;
  for (;;) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < dist.length; i++)
      if (!done[i] && dist[i]! < bd) {
        bd = dist[i]!;
        best = i;
      }
    if (best < 0) return Infinity;
    if (best === g.idx(...t)) return bd;
    done[best] = 1;
    const cx = best % W;
    const cz = (best / W) | 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!(g.get(nx, nz) & Area.WALK)) continue;
        if (dx && dz && (!(g.get(cx + dx, cz) & Area.WALK) || !(g.get(cx, cz + dz) & Area.WALK))) continue;
        const ni = g.idx(nx, nz);
        const nd = bd + (dx && dz ? Math.SQRT2 : 1);
        if (nd < dist[ni]!) dist[ni] = nd;
      }
  }
}

describe('NavGrid', () => {
  it('finds paths whenever Dijkstra does, never through walls', () => {
    const rng = new Rng(7);
    for (let trial = 0; trial < 40; trial++) {
      const g = new NavGrid(20, 20, 1, 0, 0);
      for (let z = 0; z < 20; z++) for (let x = 0; x < 20; x++) g.set(x, z, rng.chance(0.25) ? 0 : Area.WALK);
      const s: [number, number] = [0, 0];
      const t: [number, number] = [19, 19];
      g.set(...s, Area.WALK);
      g.set(...t, Area.WALK);
      const ref = dijkstra(g, s, t);
      const path = g.findPath(0.5, 0.5, 19.5, 19.5);
      if (!Number.isFinite(ref)) {
        expect(path).toBeNull();
        continue;
      }
      expect(path).not.toBeNull();
      for (let i = 1; i < path!.length; i++)
        expect(g.clearLine(path![i - 1]!, path![i]!, Area.WALK)).toBe(true);
      let len = 0;
      for (let i = 1; i < path!.length; i++)
        len += Math.hypot(path![i]![0] - path![i - 1]![0], path![i]![1] - path![i - 1]![1]);
      expect(len).toBeLessThanOrEqual(ref + 1e-6);
    }
  });

  it('respects area masks', () => {
    const g = new NavGrid(10, 1, 1, 0, 0);
    for (let x = 0; x < 10; x++) g.set(x, 0, x === 5 ? Area.WATER : Area.WALK);
    expect(g.findPath(0.5, 0.5, 9.5, 0.5, Area.WALK)).toBeNull();
    expect(g.findPath(0.5, 0.5, 9.5, 0.5, Area.WALK | Area.WATER)).not.toBeNull();
  });
});

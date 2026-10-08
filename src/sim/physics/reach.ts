import { Line3, Vector3 } from 'three';
import type { CapsuleResolve, CollisionWorld } from './CollisionWorld.ts';

export interface ReachOptions {
  /** Capsule radius and standing height (the player's by default). */
  radius?: number;
  height?: number;
  /** Cell size of the flood fill (m). */
  cell?: number;
  /** Highest step between neighbouring floors (the controller steps up 0.36 m). */
  climb?: number;
  /** How far around the two points the search may go (m). */
  margin?: number;
  /** How close to `to` counts as arriving (m). */
  within?: number;
  /** Diagnostics: receives the grid. */
  out?: ReachGrid;
}

export interface ReachGrid {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Per cell: 0 not looked at, 1 open, 2 shut. */
  state: Uint8Array;
  /** Per cell: 1 where the fill got to. */
  seen: Uint8Array;
  floor: Float32Array;
}

/**
 * Can a standing capsule walk from `from` to `to` (feet positions)? A flood fill over the real
 * colliders: a cell is open where the capsule fits standing on whatever a ray finds under it
 * (whatever is lower than a step is stepped over), and neighbouring open cells connect when their
 * floors differ by no more than a step. For tests and level checks; never used in play.
 */
export function capsuleReachable(
  world: CollisionWorld,
  from: { x: number; y: number; z: number },
  to: { x: number; z: number },
  opts: ReachOptions = {},
): boolean {
  const r = opts.radius ?? 0.32;
  const h = opts.height ?? 1.78;
  const cell = opts.cell ?? 0.1;
  const climb = opts.climb ?? 0.36;
  const margin = opts.margin ?? 4;
  const within = opts.within ?? 0.25;
  const x0 = Math.min(from.x, to.x) - margin;
  const z0 = Math.min(from.z, to.z) - margin;
  const nx = Math.ceil((Math.max(from.x, to.x) + margin - x0) / cell) + 1;
  const nz = Math.ceil((Math.max(from.z, to.z) + margin - z0) / cell) + 1;
  const floor = new Float32Array(nx * nz);
  // 0 not tested yet, 1 open, 2 shut
  const state = new Uint8Array(nx * nz);
  const seen = new Uint8Array(nx * nz);
  const seg = new Line3();
  const res: CapsuleResolve = { push: new Vector3(), maxNormalY: -1 };
  const o = new Vector3();
  const down = new Vector3(0, -1, 0);
  /** The floor under a cell is looked for from a step above the floor you come from. */
  const open = (i: number, j: number, fromFloor: number): boolean => {
    const k = j * nx + i;
    if (state[k]) return state[k] === 1;
    const x = x0 + i * cell;
    const z = z0 + j * cell;
    // the capsule stands on whatever is under any part of it (it bridges a crack): the highest
    // of a few rays across its footprint
    const top = fromFloor + climb + 0.05;
    let d = Infinity;
    for (const [dx, dz] of FOOT) {
      o.set(x + dx * r, top, z + dz * r);
      d = Math.min(d, world.raycast(o, down, 4));
    }
    if (d === Infinity) {
      state[k] = 2;
      return false;
    }
    const f = top - d;
    floor[k] = f;
    seg.start.set(x, f + climb + r, z);
    seg.end.set(x, f + Math.max(h - r, climb + r + 0.01), z);
    world.resolveCapsule(seg, r, res);
    state[k] = res.push.lengthSq() < 1e-4 ? 1 : 2;
    return state[k] === 1;
  };
  if (opts.out) Object.assign(opts.out, { x0, z0, nx, nz, state, seen, floor });
  const si = Math.round((from.x - x0) / cell);
  const sj = Math.round((from.z - z0) / cell);
  if (!open(si, sj, from.y)) return false;
  const queue: number[] = [sj * nx + si];
  seen[sj * nx + si] = 1;
  while (queue.length) {
    const k = queue.pop()!;
    const i = k % nx;
    const j = (k - i) / nx;
    if (Math.hypot(x0 + i * cell - to.x, z0 + j * cell - to.z) <= within) return true;
    for (const [di, dj] of NEIGHBOURS) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const kk = b * nx + a;
      if (seen[kk]) continue;
      if (!open(a, b, floor[k]!) || Math.abs(floor[kk]! - floor[k]!) > climb) continue;
      seen[kk] = 1;
      queue.push(kk);
    }
  }
  return false;
}

/** Ray offsets across the capsule's footprint, in radii. */
const FOOT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.6, 0],
  [-0.6, 0],
  [0, 0.6],
  [0, -0.6],
];

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

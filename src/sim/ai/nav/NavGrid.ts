/**
 * 2D navigation grid (XZ plane) with A*. Cells carry area flags so special entities can be
 * restricted (e.g. a water-only creature). Deterministic and DOM-free.
 */

export const Area = {
  WALK: 1,
  WATER: 2,
  DEEP: 4,
  PIPE: 8,
  DOOR: 16,
} as const;

export class NavGrid {
  readonly flags: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cell: number,
    readonly originX: number,
    readonly originZ: number,
  ) {
    this.flags = new Uint8Array(width * height);
  }

  idx(cx: number, cz: number): number {
    return cz * this.width + cx;
  }

  inBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.width && cz < this.height;
  }

  set(cx: number, cz: number, flags: number): void {
    if (this.inBounds(cx, cz)) this.flags[this.idx(cx, cz)] = flags;
  }

  get(cx: number, cz: number): number {
    return this.inBounds(cx, cz) ? this.flags[this.idx(cx, cz)]! : 0;
  }

  toCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.originX) / this.cell), Math.floor((z - this.originZ) / this.cell)];
  }

  cellCenter(cx: number, cz: number): [number, number] {
    return [this.originX + (cx + 0.5) * this.cell, this.originZ + (cz + 0.5) * this.cell];
  }

  /** Marks a world-space rectangle with flags (OR) or clears it (flags = 0, replace). */
  fillRect(x0: number, z0: number, x1: number, z1: number, flags: number, replace = false): void {
    const [ax, az] = this.toCell(Math.min(x0, x1), Math.min(z0, z1));
    const [bx, bz] = this.toCell(Math.max(x0, x1) - 1e-6, Math.max(z0, z1) - 1e-6);
    for (let z = az; z <= bz; z++)
      for (let x = ax; x <= bx; x++) {
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        this.flags[i] = replace ? flags : this.flags[i]! | flags;
      }
  }

  /** Nearest cell matching mask (spiral search), for snapping off-grid positions. */
  nearestWalkable(cx: number, cz: number, mask: number, maxR = 6): [number, number] | null {
    if (this.get(cx, cz) & mask) return [cx, cz];
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.get(cx + dx, cz + dz) & mask) return [cx + dx, cz + dz];
        }
    }
    return null;
  }

  /**
   * A* with octile heuristic; diagonal moves only when both orthogonal neighbours are open
   * (no corner cutting). Returns world-space waypoints (cell centres) or null.
   */
  findPath(
    sx: number,
    sz: number,
    tx: number,
    tz: number,
    mask: number = Area.WALK,
    maxNodes = 20000,
  ): Array<[number, number]> | null {
    const s0 = this.toCell(sx, sz);
    const t0 = this.toCell(tx, tz);
    const s = this.nearestWalkable(s0[0], s0[1], mask);
    const t = this.nearestWalkable(t0[0], t0[1], mask);
    if (!s || !t) return null;
    const W = this.width;
    const N = W * this.height;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const si = this.idx(s[0], s[1]);
    const ti = this.idx(t[0], t[1]);
    g[si] = 0;
    heap.push(si, this.h(s[0], s[1], t[0], t[1]));
    let expanded = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === ti) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++expanded > maxNodes) return null;
      const cx = cur % W;
      const cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.inBounds(nx, nz)) continue;
          const ni = this.idx(nx, nz);
          if (closed[ni] || !(this.flags[ni]! & mask)) continue;
          if (dx && dz && (!(this.get(cx + dx, cz) & mask) || !(this.get(cx, cz + dz) & mask))) continue;
          const cost = g[cur]! + (dx && dz ? Math.SQRT2 : 1);
          if (cost < g[ni]!) {
            g[ni] = cost;
            came[ni] = cur;
            heap.push(ni, cost + this.h(nx, nz, t[0], t[1]));
          }
        }
    }
    if (came[ti] === -1 && si !== ti) return null;
    const cells: number[] = [];
    for (let c = ti; c !== -1; c = c === si ? -1 : came[c]!) cells.push(c);
    cells.reverse();
    return this.smooth(
      cells.map((c) => this.cellCenter(c % W, (c / W) | 0)),
      mask,
    );
  }

  /** Grid path length in metres (for hearing around corners). */
  pathDistance(sx: number, sz: number, tx: number, tz: number, mask: number = Area.WALK): number {
    const p = this.findPath(sx, sz, tx, tz, mask, 6000);
    if (!p) return Infinity;
    let d = Math.hypot(p[0]![0] - sx, p[0]![1] - sz);
    for (let i = 1; i < p.length; i++) d += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]);
    return d;
  }

  private h(ax: number, az: number, bx: number, bz: number): number {
    const dx = Math.abs(ax - bx);
    const dz = Math.abs(az - bz);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  }

  /** String-pulling: drop waypoints that have a clear grid line to a later one. */
  private smooth(pts: Array<[number, number]>, mask: number): Array<[number, number]> {
    if (pts.length <= 2) return pts;
    const out: Array<[number, number]> = [pts[0]!];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.clearLine(pts[anchor]!, pts[i]!, mask)) {
        out.push(pts[i - 1]!);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]!);
    return out;
  }

  clearLine(a: [number, number], b: [number, number], mask: number): boolean {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.cell * 0.35));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const [cx, cz] = this.toCell(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (!(this.get(cx, cz) & mask)) return false;
    }
    return true;
  }
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0]!;
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}

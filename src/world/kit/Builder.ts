import { Box3, Group, Mesh, Vector3 } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { colliderCopy, Face, worldBox } from './geometry.ts';
import type { Surface } from '../../sim/player/Controller.ts';
import { Layer } from '../../sim/physics/CollisionWorld.ts';

export interface KitMaterial {
  material: Material;
  /** Metres per texture repeat. */
  uvScale: number;
  surface: Surface;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface Opening {
  /** Distance along the wall from its start point to the opening's centre. */
  at: number;
  width: number;
  bottom: number;
  top: number;
}

interface SurfaceZone {
  box: Box3;
  surface: Surface;
}

/**
 * Collects level geometry: render geometry is merged per material, collision geometry is merged
 * per layer into BVHs, and walkable surfaces are recorded for footstep sounds.
 */
export class Builder {
  readonly group = new Group();
  private batches = new Map<KitMaterial, BufferGeometry[]>();
  private colliders = new Map<number, BufferGeometry[]>();
  readonly surfaces: SurfaceZone[] = [];

  box(
    min: [number, number, number],
    max: [number, number, number],
    mat: KitMaterial | null,
    opts: { collide?: boolean; faces?: number; layer?: number; rotY?: number; walkSurface?: boolean } = {},
  ): void {
    const a = new Vector3(...min);
    const b = new Vector3(...max);
    const faces = opts.faces ?? Face.ALL;
    if (mat) {
      const g = worldBox(a, b, mat.uvScale, faces, opts.rotY ?? 0);
      this.push(mat, g);
    }
    if (opts.collide !== false) {
      const c = worldBox(a, b, 1, Face.ALL, opts.rotY ?? 0);
      this.addCollider(colliderCopy(c), opts.layer ?? Layer.BASE);
    }
    if (mat && opts.walkSurface)
      this.surfaces.push({
        box: new Box3(a.clone().setY(b.y - 0.2), b.clone().setY(b.y + 0.4)),
        surface: mat.surface,
      });
  }

  /** Floor slab whose top is at y. */
  floor(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    mat: KitMaterial,
    thickness = 0.2,
    layer: number = Layer.BASE,
  ): void {
    this.box(
      [Math.min(x0, x1), y - thickness, Math.min(z0, z1)],
      [Math.max(x0, x1), y, Math.max(z0, z1)],
      mat,
      {
        faces: Face.PY,
        layer,
        walkSurface: true,
      },
    );
  }

  ceiling(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    mat: KitMaterial,
    thickness = 0.2,
  ): void {
    this.box(
      [Math.min(x0, x1), y, Math.min(z0, z1)],
      [Math.max(x0, x1), y + thickness, Math.max(z0, z1)],
      mat,
      {
        faces: Face.NY,
      },
    );
  }

  /**
   * Axis-aligned wall from (ax,az) to (bx,bz) with thickness, between y0 and y1, with optional
   * openings (doors/windows) cut as gaps. Both faces are rendered.
   */
  wall(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y0: number,
    y1: number,
    mat: KitMaterial,
    thickness = 0.15,
    openings: Opening[] = [],
    opts: { collide?: boolean; faces?: number } = {},
  ): void {
    const alongX = Math.abs(bz - az) < 1e-6;
    const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    const dir = alongX ? Math.sign(bx - ax) || 1 : Math.sign(bz - az) || 1;
    const segs: Array<[number, number, number, number]> = []; // [s0, s1, y0, y1] along-wall
    const sorted = [...openings].sort((p, q) => p.at - q.at);
    let cursor = 0;
    for (const o of sorted) {
      const s0 = Math.max(0, o.at - o.width / 2);
      const s1 = Math.min(len, o.at + o.width / 2);
      if (s0 > cursor) segs.push([cursor, s0, y0, y1]);
      if (o.bottom > y0) segs.push([s0, s1, y0, o.bottom]);
      if (o.top < y1) segs.push([s0, s1, o.top, y1]);
      cursor = s1;
    }
    if (cursor < len) segs.push([cursor, len, y0, y1]);
    const h = thickness / 2;
    for (const [s0, s1, sy0, sy1] of segs) {
      if (s1 - s0 < 1e-4 || sy1 - sy0 < 1e-4) continue;
      if (alongX) {
        const xA = ax + dir * s0;
        const xB = ax + dir * s1;
        this.box([Math.min(xA, xB), sy0, az - h], [Math.max(xA, xB), sy1, az + h], mat, {
          collide: opts.collide ?? true,
          faces: opts.faces ?? Face.ALL,
        });
      } else {
        const zA = az + dir * s0;
        const zB = az + dir * s1;
        this.box([ax - h, sy0, Math.min(zA, zB)], [ax + h, sy1, Math.max(zA, zB)], mat, {
          collide: opts.collide ?? true,
          faces: opts.faces ?? Face.ALL,
        });
      }
    }
  }

  /** A collision-only ramp (for stairs). Visual steps are added separately. */
  ramp(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    yStart: number,
    yEnd: number,
    axis: 'x' | 'z',
    layer: number = Layer.BASE,
  ): void {
    const g = worldBox(new Vector3(0, -0.1, 0), new Vector3(1, 0, 1), 1);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const w = pos.getZ(i);
      const y = pos.getY(i);
      const t = axis === 'x' ? u : w;
      const x = x0 + (x1 - x0) * u;
      const z = z0 + (z1 - z0) * w;
      pos.setXYZ(i, x, y + yStart + (yEnd - yStart) * t, z);
    }
    this.addCollider(colliderCopy(g), layer);
  }

  /** Visual + collision staircase going along +axis from start. */
  stairs(
    x0: number,
    z0: number,
    width: number,
    run: number,
    yStart: number,
    yEnd: number,
    axis: '+x' | '-x' | '+z' | '-z',
    mat: KitMaterial,
    steps: number,
  ): void {
    const rise = (yEnd - yStart) / steps;
    const tread = run / steps;
    for (let i = 0; i < steps; i++) {
      const y = yStart + rise * (i + 1);
      let a: [number, number, number];
      let b: [number, number, number];
      const s0 = tread * i;
      const s1 = tread * (i + 1);
      switch (axis) {
        case '+x':
          a = [x0 + s0, yStart, z0];
          b = [x0 + s1, y, z0 + width];
          break;
        case '-x':
          a = [x0 - s1, yStart, z0];
          b = [x0 - s0, y, z0 + width];
          break;
        case '+z':
          a = [x0, yStart, z0 + s0];
          b = [x0 + width, y, z0 + s1];
          break;
        default:
          a = [x0, yStart, z0 - s1];
          b = [x0 + width, y, z0 - s0];
      }
      this.box(a, b, mat, { collide: false, walkSurface: true });
    }
    // smooth collision ramp so the capsule glides up
    if (axis === '+x') this.ramp(x0, z0, x0 + run, z0 + width, yStart, yEnd, 'x');
    else if (axis === '-x') this.ramp(x0, z0, x0 - run, z0 + width, yStart, yEnd, 'x');
    else if (axis === '+z') this.ramp(x0, z0, x0 + width, z0 + run, yStart, yEnd, 'z');
    else this.ramp(x0, z0, x0 + width, z0 - run, yStart, yEnd, 'z');
  }

  push(mat: KitMaterial, g: BufferGeometry): void {
    let list = this.batches.get(mat);
    if (!list) {
      list = [];
      this.batches.set(mat, list);
    }
    list.push(g);
  }

  addCollider(g: BufferGeometry, layer: number = Layer.BASE): void {
    let list = this.colliders.get(layer);
    if (!list) {
      list = [];
      this.colliders.set(layer, list);
    }
    list.push(g);
  }

  /** Adds an object's world-space bounding box as a collider. */
  colliderFromObject(obj: Object3D, shrink = 0, layer: number = Layer.BASE): Box3 {
    obj.updateMatrixWorld(true);
    const bb = new Box3().setFromObject(obj);
    bb.min.addScalar(shrink);
    bb.max.addScalar(-shrink);
    const g = worldBox(bb.min, bb.max, 1);
    this.addCollider(colliderCopy(g), layer);
    return bb;
  }

  surfaceAt(p: Vector3): Surface | null {
    let best: Surface | null = null;
    let bestY = -Infinity;
    for (const z of this.surfaces) {
      if (
        p.x >= z.box.min.x &&
        p.x <= z.box.max.x &&
        p.z >= z.box.min.z &&
        p.z <= z.box.max.z &&
        p.y >= z.box.min.y &&
        p.y <= z.box.max.y
      ) {
        if (z.box.max.y > bestY) {
          bestY = z.box.max.y;
          best = z.surface;
        }
      }
    }
    return best;
  }

  /** Merges batches into meshes (added to `group`) and returns merged collider geometry per layer. */
  finish(): Map<number, BufferGeometry> {
    for (const [mat, list] of this.batches) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, mat.material);
      mesh.castShadow = mat.castShadow ?? true;
      mesh.receiveShadow = mat.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      for (const g of list) g.dispose();
    }
    this.batches.clear();
    const out = new Map<number, BufferGeometry>();
    for (const [layer, list] of this.colliders) {
      const merged = mergeGeometries(list, false);
      if (merged) out.set(layer, merged);
      for (const g of list) g.dispose();
    }
    this.colliders.clear();
    return out;
  }
}

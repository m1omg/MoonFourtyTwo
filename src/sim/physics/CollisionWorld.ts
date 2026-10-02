import { Box3, DoubleSide, Line3, Matrix4, Ray, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Triangle } from 'three';

/** Collision layers: some geometry only exists in hallucination / reveal states. */
export const Layer = {
  BASE: 1,
  ABSINTHE: 2,
  REVEAL: 4,
} as const;

export interface StaticBody {
  bvh: MeshBVH;
  layer: number;
}

export interface DynamicBody {
  bvh: MeshBVH;
  /** World transform of the body (e.g. a door). */
  matrix: Matrix4;
  inverse: Matrix4;
  enabled: boolean;
  layer: number;
  /** Bounding box in world space (refresh with updateBounds after moving). */
  worldBox: Box3;
}

const _box = new Box3();
const _seg = new Line3();
const _triPoint = new Vector3();
const _capPoint = new Vector3();
const _dir = new Vector3();
const _ray = new Ray();
const _inv = new Matrix4();

export interface CapsuleResolve {
  /** Push applied to the capsule (world space). */
  push: Vector3;
  /** Strongest upward-facing contact normal y (for ground detection). */
  maxNormalY: number;
}

/**
 * Static world geometry in BVHs plus a few movable bodies. Pure math (three + three-mesh-bvh),
 * so it runs in Node tests.
 */
export class CollisionWorld {
  readonly statics: StaticBody[] = [];
  readonly dynamics: DynamicBody[] = [];
  /** Bitmask of layers that currently collide. */
  activeMask: number = Layer.BASE;

  addStatic(geometry: BufferGeometry, layer: number = Layer.BASE): StaticBody {
    const bvh = new MeshBVH(geometry, { targetLeafSize: 12 });
    const body = { bvh, layer };
    this.statics.push(body);
    return body;
  }

  addDynamic(geometry: BufferGeometry, matrix: Matrix4, layer: number = Layer.BASE): DynamicBody {
    const bvh = new MeshBVH(geometry, { targetLeafSize: 12 });
    const body: DynamicBody = {
      bvh,
      matrix: matrix.clone(),
      inverse: matrix.clone().invert(),
      enabled: true,
      layer,
      worldBox: new Box3(),
    };
    this.updateDynamic(body, matrix);
    this.dynamics.push(body);
    return body;
  }

  updateDynamic(body: DynamicBody, matrix: Matrix4): void {
    body.matrix.copy(matrix);
    body.inverse.copy(matrix).invert();
    body.bvh.getBoundingBox(body.worldBox);
    body.worldBox.applyMatrix4(matrix);
  }

  clear(): void {
    this.statics.length = 0;
    this.dynamics.length = 0;
  }

  /**
   * Pushes a capsule (segment + radius, world space) out of all active geometry.
   * Mutates `segment` in place. Iterates a couple of times for corners.
   */
  resolveCapsule(segment: Line3, radius: number, out: CapsuleResolve, iterations = 2): void {
    out.push.set(0, 0, 0);
    out.maxNormalY = -1;
    const startX = segment.start.x;
    const startY = segment.start.y;
    const startZ = segment.start.z;
    for (let it = 0; it < iterations; it++) {
      for (const body of this.statics) {
        if (!(body.layer & this.activeMask)) continue;
        this.pushOut(body.bvh, segment, radius, out, null);
      }
      for (const body of this.dynamics) {
        if (!body.enabled || !(body.layer & this.activeMask)) continue;
        _box.makeEmpty();
        _box.expandByPoint(segment.start).expandByPoint(segment.end);
        _box.min.addScalar(-radius);
        _box.max.addScalar(radius);
        if (!_box.intersectsBox(body.worldBox)) continue;
        this.pushOut(body.bvh, segment, radius, out, body);
      }
    }
    out.push.set(segment.start.x - startX, segment.start.y - startY, segment.start.z - startZ);
  }

  private pushOut(
    bvh: MeshBVH,
    segment: Line3,
    radius: number,
    out: CapsuleResolve,
    body: DynamicBody | null,
  ): void {
    _seg.copy(segment);
    if (body) {
      _seg.start.applyMatrix4(body.inverse);
      _seg.end.applyMatrix4(body.inverse);
    }
    _box.makeEmpty();
    _box.expandByPoint(_seg.start).expandByPoint(_seg.end);
    _box.min.addScalar(-radius);
    _box.max.addScalar(radius);
    bvh.shapecast({
      intersectsBounds: (box: Box3) => box.intersectsBox(_box),
      intersectsTriangle: (tri: Triangle) => {
        const d = (
          tri as unknown as { closestPointToSegment(s: Line3, a: Vector3, b: Vector3): number }
        ).closestPointToSegment(_seg, _triPoint, _capPoint);
        if (d < radius) {
          const depth = radius - d;
          _dir.subVectors(_capPoint, _triPoint);
          if (_dir.lengthSq() < 1e-12) tri.getNormal(_dir);
          else _dir.normalize();
          _seg.start.addScaledVector(_dir, depth);
          _seg.end.addScaledVector(_dir, depth);
          if (_dir.y > out.maxNormalY) out.maxNormalY = _dir.y;
        }
        return false;
      },
    });
    if (body) {
      _seg.start.applyMatrix4(body.matrix);
      _seg.end.applyMatrix4(body.matrix);
      // normals were in local space; good enough for ground detection on doors (rarely walked on)
    }
    segment.copy(_seg);
  }

  /**
   * Distance to the first hit along a ray within maxDist, or Infinity.
   * Used for line of sight and interaction occlusion.
   */
  raycast(origin: Vector3, direction: Vector3, maxDist: number, mask: number = this.activeMask): number {
    let best = Infinity;
    _ray.origin.copy(origin);
    _ray.direction.copy(direction);
    for (const body of this.statics) {
      if (!(body.layer & mask)) continue;
      const hit = body.bvh.raycastFirst(_ray, DoubleSide, 0, maxDist);
      if (hit && hit.distance < best) best = hit.distance;
    }
    for (const body of this.dynamics) {
      if (!body.enabled || !(body.layer & mask)) continue;
      _inv.copy(body.inverse);
      const localRay = _ray.clone().applyMatrix4(_inv);
      const hit = body.bvh.raycastFirst(localRay, DoubleSide);
      if (hit) {
        const p = hit.point.applyMatrix4(body.matrix);
        const dist = p.distanceTo(origin);
        if (dist <= maxDist && dist < best) best = dist;
      }
    }
    return best <= maxDist ? best : Infinity;
  }

  /** True if the straight segment a→b is unobstructed. */
  lineOfSight(a: Vector3, b: Vector3, mask: number = this.activeMask): boolean {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-6) return true;
    _dir.divideScalar(len);
    return this.raycast(a, _dir, len - 0.05, mask) === Infinity;
  }
}

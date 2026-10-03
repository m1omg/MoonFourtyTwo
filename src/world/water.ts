import {
  CanvasTexture,
  CircleGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from 'three';
import type { BufferGeometry, Scene, Vector3 } from 'three';
import type { Scope } from '../core/scope.ts';

export type WaterShape =
  | { kind: 'rect'; x0: number; z0: number; x1: number; z1: number }
  | { kind: 'circle'; x: number; z: number; r: number };

export interface WaterBody {
  id: string;
  shape: WaterShape;
  /** Current surface height. */
  level: number;
  /** Height the surface is draining or filling towards. */
  target: number;
  /** Metres per second the level moves towards the target. */
  rate: number;
  mesh: Mesh;
}

/** Metres per repeat of the ripple normal map. */
const TILE = 3;

/**
 * Pools and puddles: axis-aligned rectangles or circles of water with a surface level that can
 * drain or fill over time. Answers "how deep is it here" for wading, splashes and creatures.
 */
export class Waters {
  readonly bodies: WaterBody[] = [];
  private readonly normals: CanvasTexture;
  private readonly mats = new Map<string, MeshStandardMaterial>();

  constructor(
    private readonly scene: Scene,
    private readonly scope: Scope,
  ) {
    this.normals = scope.add(rippleNormals(256));
  }

  add(
    id: string,
    shape: WaterShape,
    level: number,
    look: { color?: number; opacity?: number; roughness?: number } = {},
  ): WaterBody {
    const key = `${look.color ?? 0x2a8f8a}:${look.opacity ?? 0.8}:${look.roughness ?? 0.06}`;
    let mat = this.mats.get(key);
    if (!mat) {
      mat = this.scope.add(
        new MeshStandardMaterial({
          color: new Color(look.color ?? 0x2a8f8a),
          roughness: look.roughness ?? 0.06,
          metalness: 0.15,
          transparent: true,
          opacity: look.opacity ?? 0.8,
          normalMap: this.normals,
          depthWrite: false,
        }),
      );
      mat.normalScale.set(0.35, 0.35);
      this.mats.set(key, mat);
    }
    let geo: BufferGeometry;
    if (shape.kind === 'rect') {
      geo = new PlaneGeometry(shape.x1 - shape.x0, shape.z1 - shape.z0, 1, 1);
      geo.rotateX(-Math.PI / 2);
      geo.translate((shape.x0 + shape.x1) / 2, 0, (shape.z0 + shape.z1) / 2);
    } else {
      geo = new CircleGeometry(shape.r, 48);
      geo.rotateX(-Math.PI / 2);
      geo.translate(shape.x, 0, shape.z);
    }
    // world-space UVs so every body shares one ripple scale
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / TILE, pos.getZ(i) / TILE);
    this.scope.add(geo);
    const mesh = new Mesh(geo, mat);
    mesh.position.y = level;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    const body: WaterBody = { id, shape, level, target: level, rate: 0, mesh };
    this.bodies.push(body);
    return body;
  }

  get(id: string): WaterBody | undefined {
    return this.bodies.find((b) => b.id === id);
  }

  /** Starts draining/filling a body towards `level` at `rate` m/s. */
  setTarget(id: string, level: number, rate: number): void {
    const b = this.get(id);
    if (!b) return;
    b.target = level;
    b.rate = rate;
  }

  contains(b: WaterBody, x: number, z: number): boolean {
    const s = b.shape;
    if (s.kind === 'rect') return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
    return (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r;
  }

  /** Highest water surface covering (x, z), or null on dry ground. */
  surfaceAt(x: number, z: number): number | null {
    let best: number | null = null;
    for (const b of this.bodies)
      if (this.contains(b, x, z) && (best === null || b.level > best)) best = b.level;
    return best;
  }

  /** Water body covering (x, z) (the highest one), if any. */
  bodyAt(x: number, z: number): WaterBody | null {
    let best: WaterBody | null = null;
    for (const b of this.bodies) if (this.contains(b, x, z) && (!best || b.level > best.level)) best = b;
    return best;
  }

  /** Depth of water above a point standing at `p` (0 when dry or above the surface). */
  depthAt(p: Vector3): number {
    const s = this.surfaceAt(p.x, p.z);
    return s === null ? 0 : Math.max(0, s - p.y);
  }

  /** Fixed-step update: levels approach their targets. */
  step(dt: number): void {
    for (const b of this.bodies) {
      if (b.level === b.target) continue;
      const d = b.target - b.level;
      const move = Math.sign(d) * Math.min(Math.abs(d), b.rate * dt);
      b.level += move;
      b.mesh.position.y = b.level;
    }
  }

  /** Per-frame: ripples drift (render time, refresh-rate independent). */
  frame(t: number): void {
    this.normals.offset.set(t * 0.013, t * 0.021);
  }
}

/** A tileable ripple normal map: a few integer-frequency waves so the edges wrap seamlessly. */
function rippleNormals(size: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const waves = [
    [3, 1, 0.0],
    [1, 4, 1.3],
    [5, -2, 2.1],
    [-2, 7, 0.7],
    [6, 5, 4.2],
  ] as const;
  const h = (x: number, y: number) => {
    let v = 0;
    for (const [kx, ky, ph] of waves)
      v += Math.sin(((kx * x + ky * y) / size) * Math.PI * 2 + ph) / Math.hypot(kx, ky);
    return v;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const s = 6;
      const nx = -dx * s;
      const ny = -dy * s;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

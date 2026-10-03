import { Box3, Vector3 } from 'three';
import type {
  BufferGeometry,
  CompressedTexture,
  Material,
  Mesh,
  Object3D,
  Scene,
  SkinnedMesh,
  Texture,
} from 'three';
import { simplified } from './simplify.ts';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetLoader } from '../assets/Loader.ts';
import type { Scope } from '../core/scope.ts';
import type { Builder } from './kit/Builder.ts';
import { Layer } from '../sim/physics/CollisionWorld.ts';

export interface PlaceOptions {
  pos: [number, number, number];
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  scale?: number;
  collide?: 'box' | 'none';
  /** Shrinks the collision box (metres) so players can get close. */
  shrink?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  parent?: Object3D;
  layer?: number;
}

/**
 * Detail budget for loaded models; the low preset caps every model at `maxTris` triangles and its
 * textures at `maxTexture` pixels (a 1024² texture takes 5 MB of GPU memory, a 512² one 1.3 MB).
 */
export const propDetail = { maxTris: Infinity, maxTexture: Infinity };

/** Scales a model's (uncompressed) textures down to `max` pixels on their longer side. */
function shrinkTextures(root: Object3D, max: number): void {
  const seen = new Set<Texture>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as Material[])
      for (const v of Object.values(mat)) {
        const t = v as Texture | null;
        if (!t?.isTexture || seen.has(t) || (t as CompressedTexture).isCompressedTexture) continue;
        seen.add(t);
        const img = t.image as ImageBitmap | HTMLImageElement | HTMLCanvasElement | undefined;
        const drawable =
          (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) ||
          img instanceof HTMLImageElement ||
          img instanceof HTMLCanvasElement;
        if (!img || !drawable || Math.max(img.width, img.height) <= max) continue;
        const k = max / Math.max(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close();
        t.image = c;
        t.needsUpdate = true;
      }
  });
}

/**
 * Simplifies a model's (non-skinned) meshes so that together they stay within `maxTris` triangles
 * (meshoptimizer: texture seams and shading are kept). Shared geometries are simplified once.
 */
async function simplifyModel(root: Object3D, maxTris: number): Promise<void> {
  const users = new Map<BufferGeometry, Mesh[]>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || (m as SkinnedMesh).isSkinnedMesh || m.geometry.morphAttributes.position) return;
    const list = users.get(m.geometry) ?? [];
    list.push(m);
    users.set(m.geometry, list);
  });
  const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position!.count) / 3;
  let total = 0;
  for (const g of users.keys()) total += tris(g);
  if (total <= maxTris) return;
  const ratio = maxTris / total;
  for (const [g, meshes] of users) {
    // tiny parts are not worth it; multi-material ranges would not line up afterwards
    if (tris(g) < 300 || g.groups.length > 1 || meshes.some((m) => Array.isArray(m.material))) continue;
    const simple = await simplified(g, ratio);
    for (const m of meshes) m.geometry = simple;
    g.dispose();
  }
}

/** Loads Poly Haven / AI models once per reality and places shared-geometry clones. */
export class Props {
  private gltfs = new Map<string, GLTF>();

  constructor(
    private readonly loader: AssetLoader,
    private readonly scene: Scene,
    private readonly scope: Scope,
    private readonly builder: Builder,
  ) {}

  async load(ids: string[], onProgress?: (p: number) => void): Promise<void> {
    let done = 0;
    await Promise.all(
      ids.map(async (id) => {
        try {
          const g = await this.loader.loadGLTF(`assets/models/${id}.glb`);
          if (propDetail.maxTris < Infinity) await simplifyModel(g.scene, propDetail.maxTris);
          if (propDetail.maxTexture < Infinity) {
            // small things (a dartboard, a cigarette pack) never fill much of the screen
            const size = new Box3().setFromObject(g.scene).getSize(new Vector3());
            const small = Math.max(size.x, size.y, size.z) < 0.7;
            shrinkTextures(g.scene, small ? propDetail.maxTexture / 2 : propDetail.maxTexture);
          }
          this.gltfs.set(id, g);
          this.own(g);
        } catch (e) {
          console.warn('model failed', id, e);
        }
        done++;
        onProgress?.(done / ids.length);
      }),
    );
  }

  private own(g: GLTF): void {
    const seen = new Set<unknown>();
    g.scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (!seen.has(m.geometry)) {
        seen.add(m.geometry);
        this.scope.add(m.geometry);
      }
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        this.scope.add(mat);
        for (const v of Object.values(mat)) {
          const tex = v as Texture | null;
          if (tex && (tex as Texture).isTexture && !seen.has(tex)) {
            seen.add(tex);
            this.scope.add(tex);
          }
        }
      }
    });
  }

  has(id: string): boolean {
    return this.gltfs.has(id);
  }

  gltf(id: string): GLTF | undefined {
    return this.gltfs.get(id);
  }

  /** Places a clone (shared geometry/materials). Returns null if the model failed to load. */
  place(id: string, o: PlaceOptions): Object3D | null {
    const g = this.gltfs.get(id);
    if (!g) return null;
    const obj = g.scene.clone(true);
    // realities can find their props again (to move, burn or hide them)
    obj.userData.prop = id;
    obj.position.set(...o.pos);
    obj.rotation.set(o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0);
    if (o.scale) obj.scale.setScalar(o.scale);
    const cast = o.castShadow ?? true;
    const receive = o.receiveShadow ?? true;
    obj.traverse((c) => {
      const m = c as Mesh;
      if (m.isMesh) {
        m.castShadow = cast;
        m.receiveShadow = receive;
      }
    });
    (o.parent ?? this.scene).add(obj);
    obj.updateMatrixWorld(true);
    if ((o.collide ?? 'box') === 'box')
      this.builder.colliderFromObject(obj, o.shrink ?? 0.02, o.layer ?? Layer.BASE);
    return obj;
  }

  /** World-space size of a model at scale 1 (for fitting). */
  size(id: string): Vector3 {
    const g = this.gltfs.get(id);
    if (!g) return new Vector3();
    return new Box3().setFromObject(g.scene).getSize(new Vector3());
  }
}

import { Box3, Vector3 } from 'three';
import type { Material, Object3D, Scene, Texture, Mesh } from 'three';
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

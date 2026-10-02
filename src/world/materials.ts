import { Color, MeshStandardMaterial } from 'three';
import type { Texture } from 'three';
import type { KitMaterial } from './kit/Builder.ts';
import type { Surface } from '../sim/player/Controller.ts';
import { proceduralTexture, type ProcKind } from './proceduralTextures.ts';
import type { AssetLoader } from '../assets/Loader.ts';
import type { Scope } from '../core/scope.ts';

export interface MaterialSpec {
  /** Folder under public/assets/tex/ with diff/nor/arm maps (optional). */
  tex?: string;
  proc: ProcKind;
  color: number;
  uvScale: number;
  surface: Surface;
  roughness?: number;
  metalness?: number;
  /** Multiplies the albedo of the loaded texture (tinting). */
  tint?: number;
  emissive?: number;
  emissiveIntensity?: number;
  normalScale?: number;
  envMapIntensity?: number;
}

/**
 * Creates kit materials. Each starts with a procedural texture and is upgraded in place to the
 * PBR texture set when it finishes loading (so a missing asset never breaks a reality).
 */
export class MaterialLib {
  private cache = new Map<string, KitMaterial>();
  private seed = 1;
  readonly pending: Promise<unknown>[] = [];

  constructor(
    private readonly loader: AssetLoader,
    private readonly scope: Scope,
    private readonly textureSuffix: '1k' | '512' = '1k',
  ) {}

  get(key: string, spec: MaterialSpec): KitMaterial {
    let m = this.cache.get(key);
    if (m) return m;
    const proc = proceduralTexture(spec.proc, spec.color, this.seed++);
    this.scope.add(proc);
    const mat = new MeshStandardMaterial({
      map: proc,
      color: 0xffffff,
      roughness: spec.roughness ?? 0.85,
      metalness: spec.metalness ?? 0,
      envMapIntensity: spec.envMapIntensity ?? 1,
    });
    if (spec.emissive !== undefined) {
      mat.emissive = new Color(spec.emissive);
      mat.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    this.scope.add(mat);
    m = { material: mat, uvScale: spec.uvScale, surface: spec.surface };
    this.cache.set(key, m);
    if (spec.tex) this.pending.push(this.upgrade(mat, spec));
    return m;
  }

  private async upgrade(mat: MeshStandardMaterial, spec: MaterialSpec): Promise<void> {
    const base = `assets/tex/${spec.tex}/${this.textureSuffix}`;
    const [diff, nor, arm] = await Promise.all([
      this.loader.loadTexture(`${base}_diff.jpg`, true),
      this.loader.loadTexture(`${base}_nor.jpg`, false),
      this.loader.loadTexture(`${base}_arm.jpg`, false),
    ]);
    const own = (t: Texture | null) => {
      if (t) this.scope.add(t);
      return t;
    };
    if (diff) {
      mat.map = own(diff);
      if (spec.tint !== undefined) mat.color = new Color(spec.tint);
    }
    if (nor) {
      mat.normalMap = own(nor);
      const s = spec.normalScale ?? 1;
      mat.normalScale.set(s, s);
    }
    if (arm) {
      own(arm);
      mat.aoMap = arm;
      mat.roughnessMap = arm;
      mat.metalnessMap = spec.metalness ? arm : null;
      mat.roughness = 1;
      mat.aoMapIntensity = 0.8;
    }
    mat.needsUpdate = true;
  }
}

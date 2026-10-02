import { LinearSRGBColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three';
import type { Texture, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Resolves a public asset path against the page (works under /MoonFourtyTwo/ on Pages). */
export function assetUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), document.baseURI).href;
}

export class AssetLoader {
  private gltf: GLTFLoader;
  private ktx2: KTX2Loader;
  private tex = new TextureLoader();
  private gltfCache = new Map<string, Promise<GLTF>>();
  private texCache = new Map<string, Promise<Texture | null>>();
  private anisotropy = 4;

  constructor(renderer: WebGLRenderer) {
    // three r186 bundles the Basis transcoder via import.meta.url (no transcoder path needed).
    this.ktx2 = new KTX2Loader().detectSupport(renderer);
    this.gltf = new GLTFLoader().setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  loadGLTF(path: string): Promise<GLTF> {
    const url = assetUrl(path);
    let p = this.gltfCache.get(url);
    if (!p) {
      p = this.gltf.loadAsync(url);
      this.gltfCache.set(url, p);
    }
    return p;
  }

  /** Loads a texture; resolves null if missing so callers can fall back to procedural textures. */
  loadTexture(path: string, srgb: boolean, repeat = true): Promise<Texture | null> {
    const url = assetUrl(path);
    const key = `${url}|${srgb}|${repeat}`;
    let p = this.texCache.get(key);
    if (!p) {
      const loader = path.endsWith('.ktx2') ? this.ktx2 : this.tex;
      p = (loader.loadAsync(url) as Promise<Texture>)
        .then((t) => {
          t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
          if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
          t.anisotropy = this.anisotropy;
          return t;
        })
        .catch(() => null);
      this.texCache.set(key, p);
    }
    return p;
  }

  /** Drops cache entries (the textures themselves are disposed by the owning scope). */
  forget(paths: string[]): void {
    for (const p of paths) {
      const url = assetUrl(p);
      this.gltfCache.delete(url);
      for (const k of [...this.texCache.keys()]) if (k.startsWith(url)) this.texCache.delete(k);
    }
  }

  dispose(): void {
    this.ktx2.dispose();
  }
}

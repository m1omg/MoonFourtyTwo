import type { Material, Mesh, MeshPhysicalMaterial, Object3D } from 'three';

export type QualityTier = 'low' | 'med' | 'high';
export type QualitySetting = QualityTier | 'auto';

export interface QualityProfile {
  tier: QualityTier;
  pixelRatioCap: number;
  dynResMin: number;
  shadows: boolean;
  shadowMapSize: number;
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
  /** Texture resolution preference: 'half' drops the top mip level. */
  textures: 'half' | 'full';
  maxDrawDistance: number;
  /** Real point lights every lit pixel pays for; the rest stand in (see LightBudget). */
  maxPointLights: number;
}

export const PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: 'low',
    pixelRatioCap: 1,
    dynResMin: 0.5,
    shadows: false,
    shadowMapSize: 512,
    ao: false,
    bloom: true,
    smaa: false,
    textures: 'half',
    maxDrawDistance: 60,
    maxPointLights: 6,
  },
  med: {
    tier: 'med',
    pixelRatioCap: 1.5,
    dynResMin: 0.6,
    shadows: true,
    shadowMapSize: 1024,
    ao: false,
    bloom: true,
    smaa: true,
    textures: 'full',
    maxDrawDistance: 90,
    maxPointLights: 10,
  },
  high: {
    tier: 'high',
    pixelRatioCap: 2,
    dynResMin: 0.75,
    shadows: true,
    shadowMapSize: 2048,
    ao: true,
    bloom: true,
    smaa: true,
    textures: 'full',
    maxDrawDistance: 140,
    maxPointLights: Infinity,
  },
};

/** Picks a starting tier from device hints; the dynamic resolution then fine-tunes. */
export function detectTier(gl: WebGL2RenderingContext | null): QualityTier {
  const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  let renderer = '';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = String(
      ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    ).toLowerCase();
  }
  if (touch && coarse) return mem >= 6 && /apple|adreno 7|mali-g7|immortalis/.test(renderer) ? 'med' : 'low';
  if (/swiftshader|llvmpipe|software/.test(renderer)) return 'low';
  if (/intel|uhd|iris/.test(renderer) && !/arc/.test(renderer)) return 'med';
  return 'high';
}

/**
 * Real glass (transmission) makes three.js draw every opaque object a second time, for what shows
 * through it. On the low preset glass is merely see-through instead.
 */
export function cheapenGlass(root: Object3D): void {
  const done = new Set<Material>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const g = mat as MeshPhysicalMaterial;
      if (done.has(g) || !(g.transmission > 0)) continue;
      done.add(g);
      g.opacity = Math.min(g.opacity, 1 - 0.6 * g.transmission);
      g.transmission = 0;
      g.transparent = true;
      g.depthWrite = false;
      // one draw, not back faces and then front faces
      g.forceSinglePass = true;
    }
  });
}

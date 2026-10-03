import { Vector4 } from 'three';
import type { Material, Mesh, Object3D } from 'three';

/**
 * A world-space "dissolve": everything beyond a plane (with a ragged, glowing edge) is simply not
 * there. Patches the materials of a scene once, before they compile; the plane and the time are
 * shared uniforms, so moving the plane later eats or gives back the world without recompiling.
 */
export interface Dissolve {
  /** Plane as (normal xyz, offset w): points with dot(p, n) > w are gone. */
  readonly plane: Vector4;
  /** Seconds (render time) for the slow ripple of the edge. */
  time: number;
  /** Patches every mesh material under `root` (skipping the ones in `keep`). */
  apply(root: Object3D, keep?: Set<Material>): void;
}

export function makeDissolve(normal: [number, number, number], offset: number): Dissolve {
  const uniforms = {
    uDissolve: { value: new Vector4(...normal, offset) },
    uDissolveTime: { value: 0 },
  };
  const patched = new WeakSet<Material>();
  const patch = (m: Material) => {
    if (patched.has(m)) return;
    patched.add(m);
    const prev = m.onBeforeCompile.bind(m);
    m.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      shader.uniforms.uDissolve = uniforms.uDissolve;
      shader.uniforms.uDissolveTime = uniforms.uDissolveTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDissWorld;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 dissW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            dissW = instanceMatrix * dissW;
          #endif
          vDissWorld = (modelMatrix * dissW).xyz;`,
        );
      const edge = shader.fragmentShader.includes('totalEmissiveRadiance');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vDissWorld;
          uniform vec4 uDissolve;
          uniform float uDissolveTime;
          float dissHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          float dissNoise(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(mix(dissHash(i), dissHash(i + vec3(1, 0, 0)), f.x),
                  mix(dissHash(i + vec3(0, 1, 0)), dissHash(i + vec3(1, 1, 0)), f.x), f.y),
              mix(mix(dissHash(i + vec3(0, 0, 1)), dissHash(i + vec3(1, 0, 1)), f.x),
                  mix(dissHash(i + vec3(0, 1, 1)), dissHash(i + vec3(1, 1, 1)), f.x), f.y),
              f.z);
          }
          float dissolveDist() {
            vec3 p = vDissWorld;
            return dot(p, uDissolve.xyz) - uDissolve.w
              + (dissNoise(p * 1.6 + uDissolveTime * 0.05) - 0.5) * 1.1
              + (dissNoise(p * 6.0) - 0.5) * 0.3;
          }`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          float dissD = dissolveDist();
          if (dissD > 0.0) discard;`,
        );
      if (edge)
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // the edge smoulders: a thin line of embers, white-hot right at the brink
          float dissEdge = smoothstep(-0.1, 0.0, dissD);
          totalEmissiveRadiance += mix(vec3(0.9, 0.25, 0.05), vec3(1.0, 0.75, 0.45), dissEdge * dissEdge) * dissEdge * 1.4;`,
        );
    };
    const key = m.customProgramCacheKey.bind(m);
    m.customProgramCacheKey = () => `${key()}|dissolve`;
    m.needsUpdate = true;
  };
  return {
    plane: uniforms.uDissolve.value,
    get time() {
      return uniforms.uDissolveTime.value;
    },
    set time(v: number) {
      uniforms.uDissolveTime.value = v;
    },
    apply(root, keep) {
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) if (!keep?.has(m)) patch(m);
      });
    },
  };
}

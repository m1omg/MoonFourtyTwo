import { Group, InstancedMesh, LOD, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Material, Mesh, Object3D, Scene } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { floatAttribute, simplified } from './simplify.ts';
import type { Scope } from '../core/scope.ts';

export interface InstanceXform {
  x: number;
  y: number;
  z: number;
  rotY?: number;
  scale?: number;
}

export interface InstanceOptions {
  castShadow?: boolean;
  /** Owns the merged geometries (a model's parts welded together per material). */
  scope?: Scope;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const IDENTITY = new Matrix4();

export interface Part {
  geometry: BufferGeometry;
  material: Material | Material[];
  /** Placement of the part relative to the model's root. */
  local: Matrix4;
}

/**
 * The model's meshes, with the parts that share a material welded into one geometry (a table and
 * its four drawers become one draw call instead of six).
 */
function modelParts(model: Object3D, scope?: Scope): Part[] {
  model.updateMatrixWorld(true);
  const rootInv = model.matrixWorld.clone().invert();
  const parts: Part[] = [];
  const byMat = new Map<Material, Part[]>();
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const part = {
      geometry: mesh.geometry,
      material: mesh.material,
      local: new Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld),
    };
    if (Array.isArray(mesh.material) || !scope) {
      parts.push(part);
      return;
    }
    const list = byMat.get(mesh.material) ?? [];
    list.push(part);
    byMat.set(mesh.material, list);
  });
  for (const [material, list] of byMat) {
    if (list.length < 2) {
      parts.push(...list);
      continue;
    }
    const merged = weld(list);
    if (merged) parts.push({ geometry: scope!.add(merged), material, local: IDENTITY });
    else parts.push(...list);
  }
  return parts;
}

/** Bakes each part's placement and merges them; null if their vertex layouts do not match. */
function weld(list: Part[]): BufferGeometry | null {
  const names = Object.keys(list[0]!.geometry.attributes).filter((n) =>
    list.every((p) => p.geometry.attributes[n] !== undefined),
  );
  const indexed = list.every((p) => p.geometry.index);
  const geos = list.map((p) => {
    let g = p.geometry.clone();
    if (!indexed && g.index) g = g.toNonIndexed();
    for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
    g.morphAttributes = {};
    g.clearGroups();
    // quantized models (16-bit positions scaled by their node) must become floats before baking
    for (const n of names) g.setAttribute(n, floatAttribute(g.getAttribute(n)));
    return g.applyMatrix4(p.local);
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

/**
 * Turns a (multi-mesh) model into one InstancedMesh per material and places it at every
 * transform: hundreds of tables/chairs for a handful of draw calls.
 */
export function instanceModel(
  model: Object3D,
  xforms: InstanceXform[],
  scene: Scene,
  opts: InstanceOptions = {},
): InstancedMesh[] {
  return instanceParts(modelParts(model, opts.scope), xforms, scene, opts);
}

/** A model's parts again, simplified for drawing far away. */
export interface FarParts {
  parts: Part[];
  /** Distance (to a chunk's centre) from which the simple version is drawn. */
  distance: number;
}

/**
 * Simplifies a model's parts to about `ratio` of their triangles (meshoptimizer; texture seams and
 * shading are kept), for instanceModelChunked's far level.
 */
export async function farParts(
  model: Object3D,
  ratio: number,
  distance: number,
  scope: Scope,
): Promise<FarParts> {
  const parts: Part[] = [];
  for (const part of modelParts(model, scope)) {
    const many = Array.isArray(part.material) || part.geometry.groups.length > 1;
    parts.push(many ? part : { ...part, geometry: scope.add(await simplified(part.geometry, ratio)) });
  }
  return { parts, distance };
}

/**
 * Like instanceModel, but splits transforms into square chunks so frustum culling works. With
 * `far`, each chunk switches to the simplified parts beyond that distance.
 */
export function instanceModelChunked(
  model: Object3D,
  xforms: InstanceXform[],
  scene: Scene,
  chunk = 16,
  opts: InstanceOptions & { far?: FarParts } = {},
): InstancedMesh[] {
  const groups = new Map<string, { cx: number; cz: number; xs: InstanceXform[] }>();
  for (const x of xforms) {
    const ix = Math.floor(x.x / chunk);
    const iz = Math.floor(x.z / chunk);
    const k = `${ix},${iz}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { cx: (ix + 0.5) * chunk, cz: (iz + 0.5) * chunk, xs: [] }));
    g.xs.push(x);
  }
  // weld the model's parts once, not once per chunk
  const parts = modelParts(model, opts.scope);
  const out: InstancedMesh[] = [];
  for (const g of groups.values()) {
    if (!opts.far) {
      out.push(...instanceParts(parts, g.xs, scene, opts));
      continue;
    }
    // near and far versions of the chunk, placed relative to its centre (LOD measures from there)
    const lod = new LOD();
    lod.position.set(g.cx, 0, g.cz);
    const local = g.xs.map((x) => ({ ...x, x: x.x - g.cx, z: x.z - g.cz }));
    const near = new Group();
    const far = new Group();
    out.push(...instanceParts(parts, local, near, opts));
    out.push(...instanceParts(opts.far.parts, local, far, opts));
    lod.addLevel(near, 0);
    lod.addLevel(far, opts.far.distance, 0.1);
    scene.add(lod);
  }
  return out;
}

/** Removes the instances standing within `radius` of a point on the ground plan (e.g. a glass picked up). */
export function hideInstancesNear(meshes: InstancedMesh[], x: number, z: number, radius: number): void {
  const zero = new Matrix4().makeScale(0, 0, 0);
  for (const im of meshes) {
    let changed = false;
    // instances of a chunk with a far level are placed relative to the chunk's LOD
    im.updateWorldMatrix(true, false);
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, _m);
      _p.setFromMatrixPosition(_m).applyMatrix4(im.matrixWorld);
      if (Math.hypot(_p.x - x, _p.z - z) > radius) continue;
      im.setMatrixAt(i, zero);
      changed = true;
    }
    if (changed) im.instanceMatrix.needsUpdate = true;
  }
}

function instanceParts(
  parts: Part[],
  xforms: InstanceXform[],
  parent: Object3D,
  opts: InstanceOptions,
): InstancedMesh[] {
  const out: InstancedMesh[] = [];
  for (const part of parts) {
    const im = new InstancedMesh(part.geometry, part.material, xforms.length);
    xforms.forEach((x, i) => {
      _q.setFromAxisAngle(_p.set(0, 1, 0), x.rotY ?? 0);
      _s.setScalar(x.scale ?? 1);
      _m.compose(_p.set(x.x, x.y, x.z), _q, _s).multiply(part.local);
      im.setMatrixAt(i, _m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = opts.castShadow ?? false;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    parent.add(im);
    opts.scope?.onDispose(() => im.dispose());
    out.push(im);
  }
  return out;
}

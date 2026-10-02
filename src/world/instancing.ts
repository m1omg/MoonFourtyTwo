import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Material, Mesh, Object3D, Scene } from 'three';

export interface InstanceXform {
  x: number;
  y: number;
  z: number;
  rotY?: number;
  scale?: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _local = new Matrix4();

/**
 * Turns a (multi-mesh) model into one InstancedMesh per sub-mesh and places it at every
 * transform: hundreds of tables/chairs for a handful of draw calls.
 */
export function instanceModel(
  model: Object3D,
  xforms: InstanceXform[],
  scene: Scene,
  opts: { castShadow?: boolean } = {},
): InstancedMesh[] {
  const out: InstancedMesh[] = [];
  model.updateMatrixWorld(true);
  const rootInv = model.matrixWorld.clone().invert();
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    _local.multiplyMatrices(rootInv, mesh.matrixWorld);
    const im = new InstancedMesh(mesh.geometry as BufferGeometry, mesh.material as Material, xforms.length);
    xforms.forEach((x, i) => {
      _q.setFromAxisAngle(_p.set(0, 1, 0), x.rotY ?? 0);
      _s.setScalar(x.scale ?? 1);
      _m.compose(_p.set(x.x, x.y, x.z), _q, _s).multiply(_local);
      im.setMatrixAt(i, _m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = opts.castShadow ?? false;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
    out.push(im);
  });
  return out;
}

/** Like instanceModel, but splits transforms into square chunks so frustum culling works. */
export function instanceModelChunked(
  model: Object3D,
  xforms: InstanceXform[],
  scene: Scene,
  chunk = 16,
  opts: { castShadow?: boolean } = {},
): InstancedMesh[] {
  const groups = new Map<string, InstanceXform[]>();
  for (const x of xforms) {
    const k = `${Math.floor(x.x / chunk)},${Math.floor(x.z / chunk)}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(x);
  }
  const out: InstancedMesh[] = [];
  for (const g of groups.values()) out.push(...instanceModel(model, g, scene, opts));
  return out;
}

import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';

/** Face bit flags for boxes. */
export const Face = {
  PX: 1,
  NX: 2,
  PY: 4,
  NY: 8,
  PZ: 16,
  NZ: 32,
  ALL: 63,
} as const;

/**
 * Axis-aligned box with UVs in world metres (divided by `uvScale`), so textures tile at a
 * constant physical size regardless of box dimensions. Optional Y rotation around `pivot`.
 */
export function worldBox(
  min: Vector3,
  max: Vector3,
  uvScale: number,
  faces: number = Face.ALL,
  rotY = 0,
  pivot?: Vector3,
): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const s = 1 / uvScale;
  const quad = (p: [number, number, number][], n: [number, number, number], uvs: [number, number][]) => {
    const b = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      pos.push(...p[i]!);
      nor.push(...n);
      uv.push(uvs[i]![0] * s, uvs[i]![1] * s);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const [x0, y0, z0] = [min.x, min.y, min.z];
  const [x1, y1, z1] = [max.x, max.y, max.z];
  if (faces & Face.PX)
    quad(
      [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
      [1, 0, 0],
      [
        [-z1, y0],
        [-z0, y0],
        [-z0, y1],
        [-z1, y1],
      ],
    );
  if (faces & Face.NX)
    quad(
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      [-1, 0, 0],
      [
        [z0, y0],
        [z1, y0],
        [z1, y1],
        [z0, y1],
      ],
    );
  if (faces & Face.PY)
    quad(
      [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
      [0, 1, 0],
      [
        [x0, -z1],
        [x1, -z1],
        [x1, -z0],
        [x0, -z0],
      ],
    );
  if (faces & Face.NY)
    quad(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
      [0, -1, 0],
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
    );
  if (faces & Face.PZ)
    quad(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      [0, 0, 1],
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
    );
  if (faces & Face.NZ)
    quad(
      [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
      [0, 0, -1],
      [
        [-x1, y0],
        [-x0, y0],
        [-x0, y1],
        [-x1, y1],
      ],
    );
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  if (rotY) {
    const c = pivot ?? new Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const m = new Matrix4()
      .makeTranslation(c.x, 0, c.z)
      .multiply(new Matrix4().makeRotationY(rotY))
      .multiply(new Matrix4().makeTranslation(-c.x, 0, -c.z));
    g.applyMatrix4(m);
  }
  return g;
}

/** Positions-only copy for collision BVHs (keeps index). */
export function colliderCopy(g: BufferGeometry): BufferGeometry {
  const c = new BufferGeometry();
  c.setAttribute('position', g.getAttribute('position').clone());
  if (g.index) c.setIndex(g.index.clone());
  return c;
}

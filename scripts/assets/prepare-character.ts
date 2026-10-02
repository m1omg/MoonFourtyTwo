/**
 * Normalizes an AI-generated character GLB: bakes a Y rotation so the character faces +Z,
 * scales it to a target height with feet at y=0, and downsizes textures.
 * Usage: node scripts/assets/prepare-character.ts <in.glb> <out.glb> <rotateYDeg> <heightMeters> [maxTex=2048]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { transformMesh, textureCompress, prune, dedup } from '@gltf-transform/functions';
import sharp from 'sharp';

const [input, output, rotDegArg, heightArg, maxTexArg] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: prepare-character <in> <out> <rotYDeg> <height> [maxTex]');
const rot = ((Number(rotDegArg ?? 0) * Math.PI) / 180) as number;
const height = Number(heightArg ?? 1.8);
const maxTex = Number(maxTexArg ?? 2048);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

// Measure bounds after rotation.
const c = Math.cos(rot);
const s = Math.sin(rot);
let minY = Infinity;
let maxY = -Infinity;
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
const v: number[] = [0, 0, 0];
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!;
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      const x = v[0]! * c + v[2]! * s;
      const z = -v[0]! * s + v[2]! * c;
      minY = Math.min(minY, v[1]!);
      maxY = Math.max(maxY, v[1]!);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
}
const k = height / (maxY - minY);
const cx = (minX + maxX) / 2;
const cz = (minZ + maxZ) / 2;
// Column-major 4x4: scale * rotationY, then translate so feet sit at y=0 and the body is centred.
const m = [c * k, 0, -s * k, 0, 0, k, 0, 0, s * k, 0, c * k, 0, -cx * k, -minY * k, -cz * k, 1];
for (const mesh of root.listMeshes()) transformMesh(mesh, m as Parameters<typeof transformMesh>[1]);
for (const node of root.listNodes()) {
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}
await doc.transform(
  dedup(),
  prune(),
  textureCompress({
    encoder: sharp,
    resize: [maxTex, maxTex],
    targetFormat: 'jpeg',
    quality: 88,
    slots: /^(?!normalTexture).*$/,
  }),
  textureCompress({
    encoder: sharp,
    resize: [maxTex, maxTex],
    targetFormat: 'png',
    slots: /^normalTexture$/,
  }),
);
await io.write(output, doc);
console.log(`wrote ${output}: height ${height} m, scale ${k.toFixed(4)}, rotY ${rotDegArg}°`);

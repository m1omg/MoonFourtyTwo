/**
 * Prepares an AI character GLB for the game: WebP textures (base colour can stay larger than
 * normal/ORM maps), dedup/prune. Skinned meshes are kept unquantized.
 * Usage: node scripts/assets/optimize-character.ts <in.glb> <out.glb> [baseMax=2048] [otherMax=1024]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';

const [input, output, baseArg, otherArg] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: optimize-character <in> <out> [baseMax] [otherMax]');
const baseMax = Number(baseArg ?? 2048);
const otherMax = Number(otherArg ?? 1024);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await doc.transform(
  dedup(),
  prune(),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    quality: 84,
    resize: [baseMax, baseMax],
    slots: /^baseColorTexture$/,
  }),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    quality: 86,
    resize: [otherMax, otherMax],
    slots: /^(?!baseColorTexture).*$/,
  }),
);
await io.write(output, doc);
console.log(`${output}: ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);

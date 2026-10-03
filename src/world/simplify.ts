import { BufferAttribute } from 'three';
import type { BufferGeometry, InterleavedBufferAttribute } from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

/** A plain float copy of an attribute (normalized, integer or interleaved ones are decoded). */
export function floatAttribute(a: BufferAttribute | InterleavedBufferAttribute): BufferAttribute {
  const n = a.itemSize;
  const out = new Float32Array(a.count * n);
  for (let i = 0; i < a.count; i++) {
    out[i * n] = a.getX(i);
    if (n > 1) out[i * n + 1] = a.getY(i);
    if (n > 2) out[i * n + 2] = a.getZ(i);
    if (n > 3) out[i * n + 3] = a.getW(i);
  }
  return new BufferAttribute(out, n);
}

/** A float copy of a geometry (quantized models store 16-bit positions scaled by their node). */
export function floatGeometry(g: BufferGeometry): BufferGeometry {
  const c = g.clone();
  for (const n of Object.keys(c.attributes)) c.setAttribute(n, floatAttribute(c.getAttribute(n)));
  return c;
}

const modifier = new SimplifyModifier();

/**
 * A copy of `g` with about `ratio` of its triangles (meshoptimizer; texture seams and shading are
 * kept). Drops geometry groups, so use it on single-material geometry.
 */
export async function simplified(g: BufferGeometry, ratio: number): Promise<BufferGeometry> {
  const src = floatGeometry(g);
  const out = await modifier.modify(src, Math.floor(src.attributes.position!.count * (1 - ratio)));
  src.dispose();
  return out;
}

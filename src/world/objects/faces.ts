import { CanvasTexture, Matrix4, SRGBColorSpace, Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import type { Character } from '../../npc/Character.ts';

/*
 * Fluctuations wear the faces of people from the memories, smeared like a bad photograph. These
 * helpers put a smear over a character's face, rigged or not.
 */

/**
 * Puts the smear over the face, whatever way the rig's head bone is oriented: the place is worked out
 * in the character's own space (up from the head bone, a little forward) in the bind pose.
 */
export function attachFace(ch: Character, mask: Object3D, up = 0.085, forward = 0.035): boolean {
  const head = ch.bones.get('Head');
  if (!head) return false;
  ch.root.updateMatrixWorld(true);
  const p = new Vector3().setFromMatrixPosition(head.matrixWorld);
  ch.root.worldToLocal(p);
  const want = new Matrix4().makeTranslation(p.x, p.y + up, p.z + forward).premultiply(ch.root.matrixWorld);
  head.matrixWorld.clone().invert().multiply(want).decompose(mask.position, mask.quaternion, mask.scale);
  head.add(mask);
  return true;
}

/**
 * The same for a posed model without a skeleton: the face is found in the mesh itself, in the band
 * between 12 and 26 cm below the top of the head (eyes and nose, under any cap brim).
 */
export function maskStatic(ch: Character, mask: Mesh): void {
  ch.root.updateMatrixWorld(true);
  const inv = ch.root.matrixWorld.clone().invert();
  const v = new Vector3();
  const m = new Matrix4();
  const each = (fn: (p: Vector3) => void) =>
    ch.model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute('position');
      m.multiplyMatrices(inv, mesh.matrixWorld);
      for (let i = 0; i < pos.count; i++) fn(v.fromBufferAttribute(pos, i).applyMatrix4(m));
    });
  let top = -Infinity;
  each((p) => (top = Math.max(top, p.y)));
  let minX = Infinity;
  let maxX = -Infinity;
  let front = -Infinity;
  each((p) => {
    if (p.y < top - 0.26 || p.y > top - 0.12) return;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    front = Math.max(front, p.z);
  });
  if (front === -Infinity) return;
  mask.position.set((minX + maxX) / 2, top - 0.18, front - 0.085);
  ch.root.add(mask);
}

/** A face smeared sideways, like a bad photograph of someone who would not hold still. */
export function smearTexture(): CanvasTexture {
  return canvasTex(64, 80, (g) => {
    g.save();
    g.beginPath();
    g.ellipse(32, 40, 31, 39, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#c8a088';
    g.fillRect(0, 0, 64, 80);
    let s = 3;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
      const y = r() * 80;
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(120,80,64,${0.15 + v * 0.3})` : `rgba(230,200,180,${(v - 0.5) * 0.5})`;
      g.fillRect(0, y, 64, 1 + r() * 3);
    }
    // where the eyes and the mouth would be: dark smears pulled wide
    g.fillStyle = 'rgba(40,24,20,0.55)';
    g.fillRect(0, 30, 64, 5);
    g.fillRect(0, 34, 64, 2);
    g.fillStyle = 'rgba(70,34,30,0.45)';
    g.fillRect(4, 58, 56, 3);
    g.restore();
  });
}

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

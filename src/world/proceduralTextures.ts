import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { Rng } from '../core/rng.ts';

/** Canvas-drawn fallback textures so every reality renders even before PBR assets load. */
export type ProcKind =
  'planks' | 'plaster' | 'tiles' | 'concrete' | 'carpet' | 'panel' | 'metal' | 'noise' | 'brick' | 'terrazzo';

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function shade(color: number, k: number): string {
  const r = Math.min(255, Math.max(0, ((color >> 16) & 255) * k));
  const g = Math.min(255, Math.max(0, ((color >> 8) & 255) * k));
  const b = Math.min(255, Math.max(0, (color & 255) * k));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function proceduralTexture(kind: ProcKind, color: number, seed = 1, size = 512): CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(size);
  g.fillStyle = hex(color);
  g.fillRect(0, 0, size, size);
  const speckle = (n: number, a: number, r: number) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${rng.next() < 0.5 ? '0,0,0' : '255,255,255'},${a * rng.next()})`;
      g.fillRect(rng.next() * size, rng.next() * size, r * rng.next() + 1, r * rng.next() + 1);
    }
  };
  switch (kind) {
    case 'planks': {
      const n = 6;
      const w = size / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = shade(color, 0.82 + rng.next() * 0.3);
        g.fillRect(i * w, 0, w, size);
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        for (let k = 0; k < 18; k++) {
          g.beginPath();
          const x = i * w + rng.next() * w;
          g.moveTo(x, 0);
          g.bezierCurveTo(
            x + rng.range(-6, 6),
            size * 0.3,
            x + rng.range(-6, 6),
            size * 0.7,
            x + rng.range(-4, 4),
            size,
          );
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(i * w, 0, 2, size);
        const cut = rng.next() * size;
        g.fillRect(i * w, cut, w, 2);
      }
      break;
    }
    case 'panel': {
      const n = 4;
      const w = size / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = shade(color, 0.85 + rng.next() * 0.25);
        g.fillRect(i * w, 0, w, size);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(i * w, 0, 3, size);
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(i * w + 3, 0, 2, size);
      }
      speckle(3000, 0.08, 2);
      break;
    }
    case 'tiles':
    case 'terrazzo': {
      const n = kind === 'tiles' ? 8 : 1;
      const w = size / n;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = shade(color, 0.93 + rng.next() * 0.12);
          g.fillRect(x * w, y * w, w, w);
        }
      if (kind === 'terrazzo') {
        for (let i = 0; i < 2500; i++) {
          g.fillStyle = shade(rng.pick([0x9a8f80, 0x4c463f, 0xd8d0c0, 0x7a5a40]), 0.8 + rng.next() * 0.4);
          const r = rng.range(1, 6);
          g.beginPath();
          g.ellipse(
            rng.next() * size,
            rng.next() * size,
            r,
            r * rng.range(0.5, 1),
            rng.next() * 3,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
      } else {
        g.strokeStyle = 'rgba(40,40,40,0.55)';
        g.lineWidth = 3;
        for (let i = 0; i <= n; i++) {
          g.beginPath();
          g.moveTo(i * w, 0);
          g.lineTo(i * w, size);
          g.moveTo(0, i * w);
          g.lineTo(size, i * w);
          g.stroke();
        }
      }
      speckle(1200, 0.05, 2);
      break;
    }
    case 'brick': {
      const rows = 8;
      const h = size / rows;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? h : 0;
        for (let x = -1; x < 4; x++) {
          g.fillStyle = shade(color, 0.8 + rng.next() * 0.35);
          g.fillRect(x * h * 2 + off + 2, r * h + 2, h * 2 - 4, h - 4);
        }
      }
      speckle(3000, 0.12, 2);
      break;
    }
    case 'carpet': {
      speckle(30000, 0.12, 1.5);
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = 6;
      for (let i = 0; i < 8; i++) {
        g.strokeRect(i * 32 + 16, i * 32 + 16, size - i * 64 - 32, size - i * 64 - 32);
      }
      break;
    }
    case 'metal': {
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(255,255,255,${0.03 * rng.next()})`;
        g.fillRect(0, rng.next() * size, size, 1);
      }
      speckle(800, 0.15, 3);
      break;
    }
    default: {
      speckle(
        kind === 'concrete' ? 14000 : 9000,
        kind === 'concrete' ? 0.12 : 0.06,
        kind === 'concrete' ? 3 : 2,
      );
      for (let i = 0; i < 30; i++) {
        const x = rng.next() * size;
        const y = rng.next() * size;
        const grd = g.createRadialGradient(x, y, 0, x, y, rng.range(20, 90));
        grd.addColorStop(0, `rgba(0,0,0,${0.05 * rng.next()})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, size, size);
      }
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Text drawn onto a canvas texture (signs, labels, notes) with full Slovak diacritics. */
export function textTexture(
  lines: string[],
  opts: {
    width?: number;
    height?: number;
    bg?: string;
    fg?: string;
    font?: string;
    size?: number;
    align?: CanvasTextAlign;
    padding?: number;
    lineHeight?: number;
  } = {},
): CanvasTexture {
  const w = opts.width ?? 512;
  const h = opts.height ?? 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  } else g.clearRect(0, 0, w, h);
  const size = opts.size ?? 48;
  g.font = `${size}px ${opts.font ?? "'IBM Plex Sans Condensed', Arial, sans-serif"}`;
  g.fillStyle = opts.fg ?? '#efe6d4';
  g.textAlign = opts.align ?? 'center';
  g.textBaseline = 'middle';
  const lh = size * (opts.lineHeight ?? 1.2);
  const pad = opts.padding ?? 16;
  const total = lh * lines.length;
  const x = g.textAlign === 'left' ? pad : g.textAlign === 'right' ? w - pad : w / 2;
  lines.forEach((line, i) => g.fillText(line, x, h / 2 - total / 2 + lh * (i + 0.5)));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

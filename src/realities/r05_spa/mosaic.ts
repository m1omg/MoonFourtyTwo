import { CanvasTexture } from 'three';

const COLS = 40;
const ROWS = 30;
const TILE = 14;
const GROUT = 2;

type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** The cosmic history, panel by panel, in the order you read it around the dome. */
const PANELS: Paint[] = [
  // 1 · stars are born
  (g, w, h) => {
    g.fillStyle = '#0d1b4f';
    g.fillRect(0, 0, w, h);
    blob(g, w * 0.3, h * 0.4, w * 0.35, '#5a2a8a');
    blob(g, w * 0.7, h * 0.65, w * 0.3, '#2a5aa0');
    for (const [x, y, r] of [
      [0.2, 0.3, 3],
      [0.45, 0.55, 4],
      [0.7, 0.25, 3],
      [0.82, 0.7, 2],
      [0.3, 0.8, 2],
      [0.6, 0.45, 2],
      [0.12, 0.6, 1.5],
      [0.9, 0.4, 1.5],
    ] as const)
      star(g, x * w, y * h, r, '#ffffff', '#9fd0ff');
  },
  // 2 · a sun and its planets
  (g, w, h) => {
    g.fillStyle = '#10204a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4a6aa0';
    g.lineWidth = 1;
    for (const r of [9, 14, 19]) ring(g, w * 0.32, h * 0.5, r);
    star(g, w * 0.32, h * 0.5, 5, '#fff3a0', '#ffb020');
    dot(g, w * 0.32 + 9, h * 0.5, 1.5, '#d07a40');
    dot(g, w * 0.32 - 10, h * 0.5 - 9, 2, '#4aa0e0');
    dot(g, w * 0.32 + 13, h * 0.5 + 13, 2.5, '#d0b070');
  },
  // 3 · red dwarfs
  (g, w, h) => {
    g.fillStyle = '#1a0a10';
    g.fillRect(0, 0, w, h);
    for (const [x, y, r] of [
      [0.25, 0.35, 4],
      [0.6, 0.6, 5],
      [0.8, 0.3, 3],
      [0.4, 0.75, 2.5],
    ] as const)
      star(g, x * w, y * h, r, '#ff7050', '#901810');
  },
  // 4 · white dwarfs, embers
  (g, w, h) => {
    g.fillStyle = '#08080c';
    g.fillRect(0, 0, w, h);
    for (const [x, y] of [
      [0.2, 0.3],
      [0.55, 0.5],
      [0.8, 0.25],
      [0.35, 0.75],
      [0.7, 0.8],
    ] as const)
      dot(g, x * w, y * h, 1.4, '#e8f0ff');
    dot(g, w * 0.45, h * 0.2, 1, '#803020');
  },
  // 5 · black holes: the far half of the disc, the hole and its lit rim, the near half in front
  (g, w, h) => {
    g.fillStyle = '#050505';
    g.fillRect(0, 0, w, h);
    for (const [x, y, r] of [
      [0.36, 0.48, 6],
      [0.76, 0.66, 3.5],
    ] as const) {
      const cx = x * w;
      const cy = y * h;
      g.strokeStyle = '#ff8a20';
      g.lineWidth = r * 0.45;
      g.beginPath();
      g.ellipse(cx, cy, r * 2.3, r * 0.6, 0, Math.PI, Math.PI * 2);
      g.stroke();
      dot(g, cx, cy, r, '#000000');
      g.strokeStyle = '#ffd890';
      g.lineWidth = 1;
      ring(g, cx, cy, r + 0.6);
      g.strokeStyle = '#ffa040';
      g.lineWidth = r * 0.45;
      g.beginPath();
      g.ellipse(cx, cy, r * 2.3, r * 0.6, 0, 0, Math.PI);
      g.stroke();
    }
  },
  // 6 · darkness, a few last sparks
  (g, w, h) => {
    g.fillStyle = '#060606';
    g.fillRect(0, 0, w, h);
    for (const [x, y] of [
      [0.3, 0.4],
      [0.75, 0.7],
      [0.6, 0.2],
    ] as const)
      dot(g, x * w, y * h, 0.6, '#5a5a6a');
  },
  // 7 · two dots circling, and the flash
  (g, w, h) => {
    g.fillStyle = '#040404';
    g.fillRect(0, 0, w, h);
    const cx = w * 0.3;
    const cy = h * 0.5;
    g.strokeStyle = '#d8c890';
    g.lineWidth = 1;
    for (const r of [5, 9, 13]) ring(g, cx, cy, r);
    dot(g, cx - 5, cy, 1.6, '#f4ecd0');
    dot(g, cx + 5, cy, 1.6, '#f4ecd0');
    const grd = g.createRadialGradient(w * 0.78, h * 0.5, 0, w * 0.78, h * 0.5, w * 0.32);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, '#fff6e0');
    grd.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  },
];

export const MOSAIC_COUNT = PANELS.length;

/** A mosaic panel: the scene is painted at tile resolution, then laid out as tiles with grout. */
export function mosaicTexture(index: number): CanvasTexture {
  const small = document.createElement('canvas');
  small.width = COLS;
  small.height = ROWS;
  const sg = small.getContext('2d')!;
  PANELS[index % PANELS.length]!(sg, COLS, ROWS);
  const px = sg.getImageData(0, 0, COLS, ROWS).data;

  const c = document.createElement('canvas');
  c.width = COLS * TILE;
  c.height = ROWS * TILE;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9c6bc';
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const i = (y * COLS + x) * 4;
      // deterministic per-tile jitter in brightness
      const j = 0.9 + 0.2 * hash(x * 7.13 + y * 3.71 + index * 11.3);
      const r = Math.min(255, px[i]! * j);
      const gg = Math.min(255, px[i + 1]! * j);
      const b = Math.min(255, px[i + 2]! * j);
      g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
      const ox = (hash(x * 1.7 + y * 9.1 + index) - 0.5) * 1.5;
      const oy = (hash(x * 4.3 + y * 2.9 + index) - 0.5) * 1.5;
      g.fillRect(x * TILE + GROUT / 2 + ox, y * TILE + GROUT / 2 + oy, TILE - GROUT, TILE - GROUT);
    }
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  t.anisotropy = 4;
  return t;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
  g.fillStyle = c;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, c);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function star(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  core: string,
  halo: string,
): void {
  dot(g, x, y, r * 1.8, halo);
  dot(g, x, y, r, core);
}

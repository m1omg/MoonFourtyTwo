import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { Texture } from 'three';
import type { Scope } from '../../core/scope.ts';

function canvasTex(
  scope: Scope,
  w: number,
  h: number,
): [HTMLCanvasElement, CanvasRenderingContext2D, CanvasTexture] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = scope.add(new CanvasTexture(c));
  tex.colorSpace = SRGBColorSpace;
  return [c, c.getContext('2d')!, tex];
}

/** Old CRT showing an ice-hockey broadcast that keeps replaying the same goal. */
export class HockeyTV {
  readonly screen: Mesh;
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private lastDraw = -1;
  /** 0 normal; >0 glitch intensity. */
  glitch = 0;
  /** When set, the screen shows this texture instead (e.g. a ceiling camera). */
  override: Texture | null = null;
  /** Brightness flicker for the room light (0..1), read by the reality. */
  light = 0.5;
  goals = 0;

  constructor(scope: Scope, width: number, height: number) {
    const [, g, tex] = canvasTex(scope, 256, 192);
    this.g = g;
    this.tex = tex;
    this.screen = new Mesh(
      scope.add(new PlaneGeometry(width, height)),
      scope.add(new MeshBasicMaterial({ map: tex, toneMapped: false })),
    );
  }

  update(t: number): void {
    if (t - this.lastDraw < 1 / 15) return; // the broadcast itself runs at 15 fps
    this.lastDraw = t;
    const g = this.g;
    const loop = 11;
    const p = (t % loop) / loop;
    // ice
    g.fillStyle = '#dfe9ef';
    g.fillRect(0, 0, 256, 192);
    g.strokeStyle = '#c0392b';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(128, 20);
    g.lineTo(128, 172);
    g.stroke();
    g.strokeStyle = '#2c5aa0';
    for (const x of [70, 186]) {
      g.beginPath();
      g.moveTo(x, 20);
      g.lineTo(x, 172);
      g.stroke();
    }
    g.strokeStyle = '#c0392b';
    g.beginPath();
    g.arc(128, 96, 22, 0, Math.PI * 2);
    g.stroke();
    // goal on the right
    g.fillStyle = '#c0392b';
    g.fillRect(232, 82, 6, 28);
    // players
    const attack = Math.min(1, p * 1.6);
    const px = 60 + attack * 160;
    const py = 96 + Math.sin(p * 9) * 22;
    for (let i = 0; i < 5; i++) {
      g.fillStyle = '#1f3e8a';
      g.beginPath();
      g.arc(px - 30 - i * 18, py + ((i * 37) % 60) - 30, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f5f5f5';
      g.beginPath();
      g.arc(200 - i * 25 + Math.sin(t * 2 + i) * 6, 60 + i * 20, 5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#333';
      g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(Math.min(px + 8, 236), py, 2.5, 0, Math.PI * 2);
    g.fill();
    // scoreboard
    const scored = p > 0.62;
    g.fillStyle = 'rgba(10,15,40,0.85)';
    g.fillRect(6, 6, 118, 20);
    g.fillStyle = '#fff';
    g.font = "bold 13px 'IBM Plex Sans Condensed', Arial";
    const score = this.glitch > 0.5 ? 'SVK 10¹⁰⁰:0 FIN' : `SVK ${scored ? 1 : 0}:0 FIN`;
    g.fillText(score, 12, 21);
    g.fillStyle = '#ffd34d';
    g.fillText('2. TRETINA 14:32', 134, 21);
    if (scored && p < 0.85) {
      g.fillStyle = 'rgba(200,30,30,0.85)';
      g.fillRect(40, 150, 176, 30);
      g.fillStyle = '#fff';
      g.font = "bold 22px 'IBM Plex Sans Condensed', Arial";
      g.fillText('GÓÓÓÓL!', 80, 173);
    }
    // scanlines + noise
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < 192; y += 3) g.fillRect(0, y, 256, 1);
    if (this.glitch > 0) {
      for (let i = 0; i < 30 * this.glitch; i++) {
        const h = Math.sin(t * 91.7 + i * 12.9898) * 43758.5453;
        const r = h - Math.floor(h);
        g.fillStyle = `rgba(255,255,255,${r * 0.5})`;
        g.fillRect(0, r * 192, 256, 2);
      }
    }
    this.tex.needsUpdate = true;
    const mat = this.screen.material as MeshBasicMaterial;
    if (this.override && mat.map !== this.override) {
      mat.map = this.override;
      mat.needsUpdate = true;
    } else if (!this.override && mat.map !== this.tex) {
      mat.map = this.tex;
      mat.needsUpdate = true;
    }
    this.light = 0.45 + 0.2 * Math.sin(t * 3.1) * Math.sin(t * 1.7) + (scored && p < 0.85 ? 0.25 : 0);
  }
}

/** Procedural wall clock whose hands can stutter and step backwards. */
export class WallClock {
  readonly root = new Group();
  private hour: Mesh;
  private minute: Mesh;
  private second: Mesh;
  /** Seconds offset displayed (21:47:10 at start). */
  base = 21 * 3600 + 47 * 60 + 10;
  /** When true, the second hand occasionally ticks backwards. */
  wrong = false;
  /** Hide the hands entirely (frozen reality). */
  handsVisible = true;
  private shown = 0;
  backTicks = 0;

  constructor(scope: Scope, radius = 0.17) {
    const [, g, tex] = canvasTex(scope, 256, 256);
    g.fillStyle = '#f1ead9';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#222';
    g.fillStyle = '#222';
    g.font = "bold 26px 'Spectral', Georgia, serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillText(String(i), 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r0 = i % 5 ? 112 : 106;
      g.lineWidth = i % 5 ? 2 : 4;
      g.beginPath();
      g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0);
      g.lineTo(128 + Math.sin(a) * 120, 128 - Math.cos(a) * 120);
      g.stroke();
    }
    g.font = "12px 'IBM Plex Sans Condensed', Arial";
    g.fillText('PRIM', 128, 170);
    const face = new Mesh(
      scope.add(new CircleGeometry(radius, 40)),
      scope.add(new MeshStandardMaterial({ map: tex, roughness: 0.6 })),
    );
    const rim = new Mesh(
      scope.add(new CircleGeometry(radius * 1.08, 40)),
      scope.add(new MeshStandardMaterial({ color: 0x2a2520, roughness: 0.4, metalness: 0.6 })),
    );
    rim.position.z = -0.003;
    const handMat = scope.add(new MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    const redMat = scope.add(new MeshStandardMaterial({ color: 0xaa1111, roughness: 0.5 }));
    const mk = (len: number, w: number, mat: MeshStandardMaterial) => {
      const geo = scope.add(new BoxGeometry(w, len, 0.004));
      geo.translate(0, len / 2 - len * 0.12, 0);
      return new Mesh(geo, mat);
    };
    this.hour = mk(radius * 0.55, 0.012, handMat);
    this.minute = mk(radius * 0.82, 0.008, handMat);
    this.second = mk(radius * 0.9, 0.003, redMat);
    this.hour.position.z = 0.004;
    this.minute.position.z = 0.007;
    this.second.position.z = 0.01;
    this.root.add(rim, face, this.hour, this.minute, this.second);
  }

  /** `t` = seconds since the scene started (render time). Returns true when a tick happened. */
  update(t: number, rand: () => number): boolean {
    const target = Math.floor(t);
    let ticked = false;
    if (target !== this.shown) {
      const step = target - this.shown;
      this.shown = target;
      ticked = true;
      if (this.wrong && step > 0 && rand() < 0.12) {
        this.backTicks += 2;
      }
    }
    const s = this.base + this.shown - this.backTicks * 2;
    const sec = ((s % 60) + 60) % 60;
    const min = (((s / 60) % 60) + 60) % 60;
    const hr = (((s / 3600) % 12) + 12) % 12;
    this.second.rotation.z = -(sec / 60) * Math.PI * 2;
    this.minute.rotation.z = -(min / 60) * Math.PI * 2;
    this.hour.rotation.z = -(hr / 12) * Math.PI * 2;
    this.hour.visible = this.minute.visible = this.second.visible = this.handsVisible;
    return ticked;
  }

  get secondsShown(): number {
    return this.shown;
  }
}

/** Emissive canvas panel (neon signs, slot machine reels, jukebox list). */
export class CanvasPanel {
  readonly mesh: Mesh;
  readonly g: CanvasRenderingContext2D;
  readonly tex: CanvasTexture;
  readonly w: number;
  readonly h: number;

  constructor(scope: Scope, pxW: number, pxH: number, width: number, height: number, emissive = true) {
    const [, g, tex] = canvasTex(scope, pxW, pxH);
    this.g = g;
    this.tex = tex;
    this.w = pxW;
    this.h = pxH;
    const mat = emissive
      ? scope.add(new MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }))
      : scope.add(new MeshStandardMaterial({ map: tex, roughness: 0.85, transparent: true }));
    this.mesh = new Mesh(scope.add(new PlaneGeometry(width, height)), mat);
  }

  commit(): void {
    this.tex.needsUpdate = true;
  }
}

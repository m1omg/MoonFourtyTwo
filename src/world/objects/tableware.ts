import {
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
} from 'three';
import type { Scope } from '../../core/scope.ts';

/** Shared materials/geometries for glasses, bottles and beer mats (created once per reality). */
export class Tableware {
  readonly glass: MeshPhysicalMaterial;
  readonly beer: MeshStandardMaterial;
  readonly foam: MeshStandardMaterial;
  readonly spirit: MeshStandardMaterial;
  private mugGeo: LatheGeometry;
  private shotGeo: LatheGeometry;
  private handleGeo: TorusGeometry;
  private beerGeo: CylinderGeometry;
  private foamGeo: CylinderGeometry;
  private spiritGeo: CylinderGeometry;
  private bottleGeo: LatheGeometry;
  private matGeo: CylinderGeometry;

  constructor(private readonly scope: Scope) {
    this.glass = scope.add(
      new MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.06,
        metalness: 0,
        transmission: 0,
        transparent: true,
        opacity: 0.22,
        side: DoubleSide,
        envMapIntensity: 1.6,
        clearcoat: 1,
        depthWrite: false,
      }),
    );
    this.beer = scope.add(
      new MeshStandardMaterial({
        color: 0xd8941e,
        roughness: 0.25,
        emissive: 0x3a1c00,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.foam = scope.add(new MeshStandardMaterial({ color: 0xf6eedc, roughness: 0.9 }));
    this.spirit = scope.add(
      new MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.1, transparent: true, opacity: 0.55 }),
    );
    // half-litre mug profile
    const mug = [
      new Vector2(0, 0),
      new Vector2(0.042, 0),
      new Vector2(0.043, 0.01),
      new Vector2(0.045, 0.16),
      new Vector2(0.047, 0.165),
    ];
    this.mugGeo = scope.add(new LatheGeometry(mug, 20));
    this.shotGeo = scope.add(
      new LatheGeometry(
        [new Vector2(0, 0), new Vector2(0.018, 0), new Vector2(0.019, 0.012), new Vector2(0.022, 0.065)],
        16,
      ),
    );
    this.handleGeo = scope.add(new TorusGeometry(0.035, 0.008, 8, 16, Math.PI));
    this.beerGeo = scope.add(new CylinderGeometry(0.041, 0.039, 0.13, 16));
    this.foamGeo = scope.add(new CylinderGeometry(0.043, 0.041, 0.02, 16));
    this.spiritGeo = scope.add(new CylinderGeometry(0.019, 0.016, 0.035, 12));
    this.bottleGeo = scope.add(
      new LatheGeometry(
        [
          new Vector2(0, 0),
          new Vector2(0.036, 0),
          new Vector2(0.037, 0.2),
          new Vector2(0.03, 0.24),
          new Vector2(0.013, 0.27),
          new Vector2(0.012, 0.31),
          new Vector2(0.014, 0.315),
        ],
        16,
      ),
    );
    this.matGeo = scope.add(new CylinderGeometry(0.052, 0.052, 0.004, 24));
  }

  /** Half-litre mug with beer (fill 0..1). */
  mug(fill = 0.85): Group {
    const g = new Group();
    const glass = new Mesh(this.mugGeo, this.glass);
    const handle = new Mesh(this.handleGeo, this.glass);
    handle.position.set(0.052, 0.085, 0);
    handle.rotation.z = -Math.PI / 2;
    g.add(glass, handle);
    if (fill > 0.02) {
      const beer = new Mesh(this.beerGeo, this.beer);
      beer.scale.y = fill;
      beer.position.y = 0.012 + (0.13 * fill) / 2;
      const foam = new Mesh(this.foamGeo, this.foam);
      foam.position.y = 0.012 + 0.13 * fill + 0.008;
      g.add(beer, foam);
    }
    g.userData.kind = 'mug';
    return g;
  }

  shot(fill = 0.8, color = 0xf2efe6): Group {
    const g = new Group();
    g.add(new Mesh(this.shotGeo, this.glass));
    if (fill > 0.02) {
      const mat =
        color === 0xf2efe6
          ? this.spirit
          : this.scope.add(
              new MeshStandardMaterial({ color, roughness: 0.1, transparent: true, opacity: 0.7 }),
            );
      const s = new Mesh(this.spiritGeo, mat);
      s.scale.y = fill;
      s.position.y = 0.012 + (0.035 * fill) / 2;
      g.add(s);
    }
    return g;
  }

  bottle(color: number, labelTex?: CanvasTexture): Group {
    const g = new Group();
    const mat = this.scope.add(
      new MeshPhysicalMaterial({
        color,
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.75,
        envMapIntensity: 1.4,
        clearcoat: 1,
      }),
    );
    g.add(new Mesh(this.bottleGeo, mat));
    if (labelTex) {
      const label = new Mesh(
        this.scope.add(new CylinderGeometry(0.0375, 0.0375, 0.08, 16, 1, true)),
        this.scope.add(new MeshStandardMaterial({ map: labelTex, roughness: 0.8 })),
      );
      label.position.y = 0.11;
      g.add(label);
    }
    return g;
  }

  /** Beer mat with an optional texture (tallies). */
  mat(tex?: CanvasTexture): Mesh {
    const m = new Mesh(
      this.matGeo,
      tex ? this.scope.add(new MeshStandardMaterial({ map: tex, roughness: 0.95 })) : this.foam,
    );
    m.receiveShadow = true;
    return m;
  }
}

/** A beer mat texture with Vierka's tally marks ("čiarky"). Returns a redraw function. */
export function tallyTexture(
  scope: Scope,
  count: number,
  seed = 1,
): { tex: CanvasTexture; draw(n: number): void } {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const tex = scope.add(new CanvasTexture(c));
  tex.colorSpace = SRGBColorSpace;
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const draw = (n: number) => {
    g.fillStyle = '#efe4c9';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#7a1d1d';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(128, 128, 118, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#7a1d1d';
    g.font = "bold 30px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.fillText('U KOLESA', 128, 62);
    g.strokeStyle = '#1d2a4a';
    g.lineWidth = 4;
    g.lineCap = 'round';
    const draws = Math.min(n, 400);
    for (let i = 0; i < draws; i++) {
      const group = Math.floor(i / 5);
      const k = i % 5;
      const gx = 64 + (group % 6) * 24 + (n > 30 ? (rnd() - 0.5) * 6 : 0);
      const gy = 100 + Math.floor(group / 6) * 30 + (n > 30 ? (rnd() - 0.5) * 6 : 0);
      g.beginPath();
      if (k < 4) {
        g.moveTo(gx + k * 4, gy);
        g.lineTo(gx + k * 4 + 1, gy + 22);
      } else {
        g.moveTo(gx - 3, gy + 18);
        g.lineTo(gx + 17, gy + 4);
      }
      g.stroke();
    }
    tex.needsUpdate = true;
  };
  draw(count);
  return { tex, draw };
}

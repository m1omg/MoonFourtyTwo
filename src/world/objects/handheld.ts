import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  TorusGeometry,
  Vector2,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { ItemDef } from '../../sim/items/items.data.ts';

type Kind = 'mug' | 'glass' | 'shot' | 'bottle' | 'chlieb' | 'utopenec' | 'pagac';
interface Model {
  group: Group;
  /** Drains while you drink (scaled from its bottom). */
  liquid?: Mesh;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 0 → 1 → 0 around `c`. */
const bump = (x: number, c: number, w: number): number => smooth(c - w, c, x) * (1 - smooth(c, c + w, x));

const kindOf = (item: ItemDef): Kind => {
  if (item.kind === 'food') return item.id === 'chlieb' || item.id === 'utopenec' ? item.id : 'pagac';
  if (item.glass === 'shot' || item.glass === 'bottle' || item.glass === 'mug') return item.glass;
  return 'glass';
};

/** Bite points of food (fractions of the time it takes). */
const BITES = [0.32, 0.62];

/**
 * What you hold up to your face when you drink or eat, in first person (a child of the camera):
 * a mug of beer, a glass, a shot glass knocked back, a bottle of malinovka tipped up, or food taken
 * in two bites. Posed from the progress of the drink (game time), so it runs alike at any frame rate.
 */
export class Handheld {
  readonly root = new Group();
  /** Called at each bite of food. */
  onBite: (() => void) | null = null;
  private readonly models = new Map<Kind, Model>();
  private readonly liquidMat = new MeshStandardMaterial({
    color: 0xd9a53a,
    roughness: 0.3,
    transparent: true,
    opacity: 0.85,
  });
  private kind: Kind = 'mug';
  private bites = 0;

  constructor() {
    const glassMat = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const mat = (color: number, roughness = 0.7, metalness = 0) =>
      new MeshStandardMaterial({ color, roughness, metalness });
    const add = (g: Object3D, geo: BufferGeometry, m: Material | Material[], x = 0, y = 0, z = 0) => {
      const mesh = new Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    /** A liquid column standing on y = 0 (so it drains towards the bottom). */
    const liquid = (r0: number, r1: number, h: number) => {
      const geo = new CylinderGeometry(r1, r0, h, 14);
      geo.translate(0, h / 2, 0);
      return new Mesh(geo, this.liquidMat);
    };

    // a glass (and the beer mug: the same glass, bigger; its liquid drains around the middle)
    for (const kind of ['mug', 'glass'] as const) {
      const g = new Group();
      add(
        g,
        new LatheGeometry(
          [new Vector2(0, 0), new Vector2(0.03, 0), new Vector2(0.033, 0.11), new Vector2(0.035, 0.115)],
          18,
        ),
        glassMat,
      );
      const l = add(g, new CylinderGeometry(0.029, 0.027, 0.08, 14), this.liquidMat, 0, 0.045, 0);
      g.scale.setScalar(kind === 'mug' ? 1.3 : 1);
      this.models.set(kind, { group: g, liquid: l });
    }

    // a shot glass (štamperlík) with its thick bottom
    {
      const g = new Group();
      add(
        g,
        new LatheGeometry(
          [new Vector2(0, 0), new Vector2(0.02, 0), new Vector2(0.021, 0.003), new Vector2(0.023, 0.06)],
          16,
        ),
        glassMat,
      );
      add(
        g,
        new CylinderGeometry(0.019, 0.02, 0.012, 16),
        new MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.45 }),
        0,
        0.006,
        0,
      );
      const l = liquid(0.0195, 0.021, 0.04);
      l.position.y = 0.013;
      g.add(l);
      this.models.set('shot', { group: g, liquid: l });
    }

    // a small bottle of malinovka: label and crown cap
    {
      const g = new Group();
      add(
        g,
        new LatheGeometry(
          [
            new Vector2(0, 0),
            new Vector2(0.03, 0),
            new Vector2(0.031, 0.13),
            new Vector2(0.026, 0.165),
            new Vector2(0.012, 0.19),
            new Vector2(0.011, 0.215),
            new Vector2(0.013, 0.218),
          ],
          18,
        ),
        glassMat,
      );
      add(g, new CylinderGeometry(0.0315, 0.0315, 0.06, 18, 1, true), mat(0xf1ead8, 0.8), 0, 0.075, 0);
      add(g, new CylinderGeometry(0.0318, 0.0318, 0.012, 18, 1, true), mat(0xb0182c, 0.6), 0, 0.075, 0);
      add(g, new CylinderGeometry(0.0135, 0.0135, 0.008, 14), mat(0xa81c1c, 0.35, 0.6), 0, 0.222, 0);
      const l = liquid(0.029, 0.029, 0.16);
      l.position.y = 0.004;
      g.add(l);
      this.models.set('bottle', { group: g, liquid: l });
    }

    // chlieb s masťou: a slice of bread, lard, onion and a pinch of paprika
    {
      const g = new Group();
      const slice = new Shape();
      slice.moveTo(-0.05, 0);
      slice.lineTo(0.05, 0);
      slice.lineTo(0.052, 0.055);
      slice.bezierCurveTo(0.064, 0.1, -0.064, 0.1, -0.052, 0.055);
      slice.closePath();
      const bread = new ExtrudeGeometry(slice, {
        depth: 0.013,
        bevelEnabled: true,
        bevelThickness: 0.002,
        bevelSize: 0.002,
        bevelSegments: 1,
        curveSegments: 10,
      });
      bread.translate(0, -0.045, -0.0065);
      add(g, bread, [mat(0xe6d3a8, 0.95), mat(0x8a5527, 0.85)]);
      const lard = new ExtrudeGeometry(slice, { depth: 0.003, bevelEnabled: false, curveSegments: 10 });
      lard.scale(0.86, 0.86, 1);
      lard.translate(0, -0.039, 0.0085);
      add(g, lard, mat(0xf4efe4, 0.55));
      const onion = new BoxGeometry(0.008, 0.005, 0.003);
      const onionMat = mat(0xd9c4e8, 0.5);
      for (const [x, y] of [
        [-0.022, -0.02],
        [0.015, -0.012],
        [-0.004, 0.012],
        [0.026, 0.016],
        [-0.03, 0.01],
        [0.004, -0.028],
      ] as const)
        add(g, onion, onionMat, x, y, 0.0125).rotation.z = x * 60;
      const dot = new BoxGeometry(0.003, 0.003, 0.002);
      const paprika = mat(0xb4401c, 0.8);
      for (const [x, y] of [
        [-0.012, -0.004],
        [0.02, 0.0],
        [0.0, 0.024],
        [-0.026, -0.03],
        [0.03, -0.024],
      ] as const)
        add(g, dot, paprika, x, y, 0.0122);
      this.models.set('chlieb', { group: g });
    }

    // utopenec: a pickled sausage with onion rings and a slice of red pepper
    {
      const g = new Group();
      const u = new Group();
      u.rotation.z = 0.25;
      g.add(u);
      const s = add(u, new CapsuleGeometry(0.016, 0.075, 4, 10), mat(0xa65a48, 0.35));
      s.rotation.z = Math.PI / 2;
      const ring = new TorusGeometry(0.0195, 0.0028, 6, 18);
      const ringMat = mat(0xeee2f2, 0.4);
      for (const x of [-0.028, 0.004, 0.032]) add(u, ring, ringMat, x, 0, 0).rotation.y = Math.PI / 2;
      add(u, new TorusGeometry(0.015, 0.0026, 6, 16), mat(0xb02a1c, 0.4), 0.018, 0.004, 0).rotation.set(
        0.4,
        Math.PI / 2,
        0,
      );
      this.models.set('utopenec', { group: g });
    }

    // pagáč: round, glazed on top, scored criss-cross
    {
      const g = new Group();
      const body = add(g, new CylinderGeometry(0.034, 0.037, 0.024, 22), [
        mat(0xd4a055, 0.75),
        mat(0xb4752f, 0.55),
        mat(0xd9b070, 0.85),
      ]);
      body.rotation.x = Math.PI / 2 - 0.35;
      const score = mat(0x7d4c1c, 0.8);
      for (const d of [-0.014, 0, 0.014]) {
        const len = 2 * Math.sqrt(0.034 ** 2 - d * d) - 0.006;
        const a = add(body, new BoxGeometry(len, 0.002, 0.0018), score, 0, 0.0125, d);
        const b = add(body, new BoxGeometry(0.0018, 0.002, len), score, d, 0.0125, 0);
        a.rotation.y = b.rotation.y = 0.5;
      }
      this.models.set('pagac', { group: g });
    }

    for (const m of this.models.values()) {
      m.group.visible = false;
      this.root.add(m.group);
    }
  }

  /** How long drinking or eating `item` takes (seconds of game time). */
  static seconds(item: ItemDef): number {
    const k = kindOf(item);
    return k === 'mug' ? 2.2 : k === 'shot' ? 1.3 : 1.8;
  }

  start(item: ItemDef): void {
    this.hide();
    this.kind = kindOf(item);
    this.liquidMat.color.setHex(item.color);
    this.bites = 0;
  }

  hide(): void {
    for (const m of this.models.values()) m.group.visible = false;
  }

  /** Poses the held thing at `p` (0 → 1) of the drink. */
  pose(p: number): void {
    const m = this.models.get(this.kind)!;
    const g = m.group;
    g.visible = true;
    switch (this.kind) {
      case 'mug':
      case 'glass': {
        const up = Math.min(1, p * 2.2);
        g.position.set(0.12 - 0.1 * up, -0.38 + 0.3 * up, -0.42 + 0.17 * up);
        g.rotation.set(Math.max(0, p - 0.35) * 2.2, 0, -0.15 * (1 - up));
        m.liquid!.scale.y = Math.max(0.05, 1 - Math.max(0, p - 0.45) * 1.8);
        break;
      }
      case 'shot': {
        // up to the mouth, knocked back in one go, down again
        const raise = smooth(0, 0.3, p);
        const tip = smooth(0.34, 0.56, p);
        const lower = smooth(0.74, 1, p);
        g.position.set(
          0.09 - 0.08 * raise + 0.07 * lower,
          -0.3 + 0.25 * raise - 0.22 * lower,
          -0.34 + 0.11 * raise,
        );
        g.rotation.set(2.1 * tip * (1 - 0.7 * lower), 0, -0.25 * (1 - raise));
        m.liquid!.scale.y = Math.max(0.02, 1 - 1.1 * tip);
        break;
      }
      case 'bottle': {
        const raise = smooth(0, 0.25, p);
        const tilt = smooth(0.25, 0.6, p);
        const lower = smooth(0.82, 1, p);
        g.position.set(0.1 - 0.09 * raise, -0.44 + 0.32 * raise - 0.3 * lower, -0.44 + 0.12 * raise);
        g.rotation.set((0.15 + 1.45 * tilt) * (1 - 0.8 * lower), 0, -0.2 * (1 - raise));
        m.liquid!.scale.y = Math.max(0.05, 1 - 0.85 * smooth(0.3, 0.82, p));
        break;
      }
      default: {
        // food: up to the mouth, two bites, the rest goes down out of sight
        const raise = smooth(0, 0.2, p);
        const lower = smooth(0.8, 1, p);
        const bite = bump(p, BITES[0]!, 0.1) + bump(p, BITES[1]!, 0.1);
        g.position.set(
          0.07 - 0.06 * raise,
          -0.32 + 0.22 * raise - 0.26 * lower,
          -0.36 + 0.08 * raise + 0.08 * bite,
        );
        g.rotation.set(-0.25 + 0.3 * raise, 0.3 * (1 - raise), 0);
        while (this.bites < BITES.length && p >= BITES[this.bites]!) {
          this.bites++;
          this.onBite?.();
        }
        g.scale.setScalar(1 - 0.32 * this.bites);
      }
    }
  }
}

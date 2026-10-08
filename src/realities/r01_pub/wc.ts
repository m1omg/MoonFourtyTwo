import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, Scene } from 'three';
import type { RealityCtx } from '../../world/Reality.ts';
import type { Builder } from '../../world/kit/Builder.ts';

const lathe = (pts: Array<[number, number]>, segments = 24, phiStart = 0, phiLength = Math.PI * 2) =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    segments,
    phiStart,
    phiLength,
  );

/**
 * What makes the pub's toilet a toilet (it was tiles, a cubicle and a mirror over a shelf):
 * a bowl with a high cistern and a pull chain in the cubicle, toilet paper, a urinal, a washbasin
 * on a pedestal with taps and soap, a bin, a floor drain, and the enamel "WC" plate outside the
 * door. All in world space (the WC is x −9…−6, z −3.2…0.2; the cubicle x −9…−7.8, z −1.5…0.2,
 * with its door opening inwards: the bowl sits beyond the door's swing).
 */
export function wcFixtures(scope: RealityCtx['scope'], scene: Scene, b: Builder): void {
  const porcelain = scope.add(new MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.22 }));
  // the urinal's inside: yellowed by decades of regulars
  const porcelainIn = scope.add(
    new MeshStandardMaterial({ color: 0xd3cab2, roughness: 0.3, side: DoubleSide }),
  );
  const chrome = scope.add(new MeshStandardMaterial({ color: 0xb9bec2, metalness: 0.7, roughness: 0.3 }));
  const blackPlastic = scope.add(new MeshStandardMaterial({ color: 0x161514, roughness: 0.45 }));
  const iron = scope.add(new MeshStandardMaterial({ color: 0x2b2a28, metalness: 0.5, roughness: 0.6 }));
  const add = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number) => {
    const m = new Mesh(scope.add(geo), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // ── the cubicle: a bowl against the back wall, facing the door ──
  const tx = -8.36;
  const tz = -0.22;
  const bowl = add(
    lathe([
      [0.11, 0],
      [0.1, 0.06],
      [0.095, 0.18],
      [0.13, 0.28],
      [0.18, 0.36],
      [0.195, 0.4],
      [0.19, 0.412],
      [0.15, 0.405],
      [0.12, 0.33],
      [0.07, 0.26],
      [0, 0.245],
    ]),
    porcelain,
    tx,
    0,
    tz,
  );
  bowl.scale.z = 1.3; // oval, longer front to back
  const water = add(
    new CircleGeometry(0.075, 20),
    new MeshStandardMaterial({ color: 0x6d858f, roughness: 0.05 }),
    tx,
    0.256,
    tz,
  );
  scope.add(water.material as Material);
  water.rotation.x = -Math.PI / 2;
  water.scale.y = 1.3;
  const seat = add(new TorusGeometry(0.155, 0.022, 8, 28), blackPlastic, tx, 0.418, tz);
  seat.rotation.x = -Math.PI / 2;
  seat.scale.y = 1.3;
  // the lid stands open, leaning back against the flush pipe
  const lid = add(new CylinderGeometry(0.17, 0.17, 0.02, 28), blackPlastic, tx, 0.62, 0.0);
  lid.scale.z = 1.25;
  lid.rotation.x = -Math.PI / 2 + 0.14;
  // high cistern on iron brackets, with a flush pipe down to the bowl and a pull chain
  add(new BoxGeometry(0.46, 0.24, 0.18), porcelain, tx, 2.02, 0.01);
  add(new BoxGeometry(0.5, 0.03, 0.2), porcelain, tx, 2.155, 0.0);
  for (const dx of [-0.16, 0.16]) add(new BoxGeometry(0.03, 0.1, 0.17), iron, tx + dx, 1.85, 0.015);
  add(new CylinderGeometry(0.018, 0.018, 1.5, 10), chrome, tx, 1.17, 0.07);
  const elbow = add(new CylinderGeometry(0.018, 0.018, 0.12, 10), chrome, tx, 0.41, 0.03);
  elbow.rotation.x = Math.PI / 2;
  add(new CylinderGeometry(0.004, 0.004, 0.55, 5), chrome, tx + 0.19, 1.62, -0.06);
  add(new CylinderGeometry(0.014, 0.014, 0.09, 10), blackPlastic, tx + 0.19, 1.31, -0.06);
  b.box([tx - 0.21, 0, tz - 0.27], [tx + 0.21, 0.44, 0.1], null);
  // toilet paper on the cubicle's side wall
  const roll = add(
    new CylinderGeometry(0.055, 0.055, 0.1, 18),
    new MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.9 }),
    -7.92,
    0.72,
    -0.45,
  );
  scope.add(roll.material as Material);
  roll.rotation.x = Math.PI / 2;
  add(new BoxGeometry(0.02, 0.03, 0.14), chrome, -7.835, 0.72, -0.45);

  // ── a urinal on the north wall, beside the cubicle: the back half of a deep bowl, open to you,
  // with a rounded lip along its open edge ──
  const ux = -7.25;
  const uz = -0.22;
  const profile: Array<[number, number]> = [
    [0, 0.52],
    [0.12, 0.54],
    [0.17, 0.62],
    [0.2, 0.8],
    [0.19, 0.98],
    [0.17, 1.05],
  ];
  const urinal = add(lathe(profile, 14, -Math.PI / 2, Math.PI), porcelainIn, ux, 0, uz);
  urinal.scale.z = 1.6; // reaches the wall at its widest
  const side = profile.slice(1);
  const lip = [
    ...side.map(([r, y]) => new Vector3(ux - r, y, uz)).reverse(),
    new Vector3(ux, 0.528, uz),
    ...side.map(([r, y]) => new Vector3(ux + r, y, uz)),
  ];
  add(new TubeGeometry(new CatmullRomCurve3(lip), 48, 0.017, 6, false), porcelain, 0, 0, 0);
  const plughole = add(new CircleGeometry(0.025, 12), iron, ux, 0.531, uz + 0.08);
  plughole.rotation.x = -Math.PI / 2;
  add(new BoxGeometry(0.4, 0.56, 0.02), porcelain, ux, 0.79, 0.09);
  add(new CylinderGeometry(0.013, 0.013, 0.27, 8), chrome, ux, 1.185, 0.075);
  add(new CylinderGeometry(0.03, 0.03, 0.06, 12), chrome, ux, 1.34, 0.075);
  b.box([ux - 0.2, 0.5, -0.22], [ux + 0.2, 1.06, 0.1], null);

  // ── a washbasin on a pedestal under the mirror ──
  const sx = -7.9;
  const sz = -2.9;
  add(new CylinderGeometry(0.065, 0.085, 0.72, 16), porcelain, sx, 0.36, -2.98);
  const basin = add(
    lathe([
      [0.1, 0.7],
      [0.2, 0.74],
      [0.25, 0.82],
      [0.255, 0.86],
      [0.23, 0.866],
      [0.19, 0.8],
      [0.12, 0.765],
      [0, 0.755],
    ]),
    porcelain,
    sx,
    0,
    sz,
  );
  basin.scale.z = 0.75;
  add(new CylinderGeometry(0.015, 0.018, 0.1, 10), chrome, sx, 0.91, -3.05);
  const spout = add(new CylinderGeometry(0.011, 0.011, 0.13, 8), chrome, sx, 0.955, -2.99);
  spout.rotation.x = Math.PI / 2;
  for (const [dx, color] of [
    [-0.08, 0xb0281e],
    [0.08, 0x2a55a8],
  ] as const) {
    add(new CylinderGeometry(0.018, 0.018, 0.025, 12), chrome, sx + dx, 0.88, -3.05);
    const cap = add(
      new CylinderGeometry(0.012, 0.012, 0.006, 10),
      new MeshStandardMaterial({ color, roughness: 0.4 }),
      sx + dx,
      0.895,
      -3.05,
    );
    scope.add(cap.material as Material);
  }
  // the soap lies in a little wire dish on the wall beside the basin (the rim is too narrow)
  add(new BoxGeometry(0.12, 0.008, 0.075), chrome, -7.56, 0.976, -3.06);
  add(new BoxGeometry(0.12, 0.018, 0.006), chrome, -7.56, 0.985, -3.0215);
  const soap = add(
    new BoxGeometry(0.07, 0.022, 0.045),
    new MeshStandardMaterial({ color: 0xe6dfa4, roughness: 0.6 }),
    -7.56,
    0.991,
    -3.058,
  );
  scope.add(soap.material as Material);
  b.box([-8.16, 0, -3.1], [-7.64, 0.87, -2.7], null);

  // ── a bin in the corner by the door and a drain in the floor ──
  const tin = scope.add(
    new MeshStandardMaterial({ color: 0x8a8f93, metalness: 0.6, roughness: 0.45, side: DoubleSide }),
  );
  add(new CylinderGeometry(0.13, 0.11, 0.38, 16, 1, true), tin, -6.27, 0.19, -2.93);
  const binFloor = add(new CircleGeometry(0.11, 16), tin, -6.27, 0.01, -2.93);
  binFloor.rotation.x = -Math.PI / 2;
  b.box([-6.41, 0, -3.07], [-6.13, 0.5, -2.79], null);
  const drain = add(
    new CylinderGeometry(0.06, 0.06, 0.006, 16),
    new MeshStandardMaterial({ color: 0x3a3c3e, metalness: 0.5, roughness: 0.6 }),
    -7.6,
    0.003,
    -2.2,
  );
  scope.add(drain.material as Material);

  // ── outside: the enamel plate beside the door, on its hinge side (the picture hangs on the
  // other side, and the frame over the door belongs to the glyph) ──
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d4a86';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#f2efe6';
  g.lineWidth = 10;
  g.strokeRect(12, 12, 232, 136);
  g.fillStyle = '#f2efe6';
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('WC', 128, 84);
  const tex = scope.add(new CanvasTexture(c));
  tex.colorSpace = SRGBColorSpace;
  const plate = add(
    new PlaneGeometry(0.22, 0.14),
    scope.add(new MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 })),
    -5.885,
    1.6,
    -0.42,
  );
  plate.rotation.y = Math.PI / 2;
}

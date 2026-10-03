import {
  AdditiveBlending,
  AmbientLight,
  Box3,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RealityCtx } from '../../world/Reality.ts';
import { Props } from '../../world/props.ts';
import type { Fixture } from '../../world/lightPool.ts';
import { colliderCopy } from '../../world/kit/geometry.ts';
import { clamp } from '../../core/damp.ts';

/*
 * The valley runs north (-z). You land in the snow at z ≈ 6; the road leads 270 m north between
 * rising valley walls to a concrete bus shelter at z ≈ -264. Burning barrels Ežo left stand along
 * the road; giant white arcs (ribs) stand in the snow, some of them over the road.
 * Past |x| ≈ 30 the snow is too deep (invisible walls keep you on the valley floor).
 */
export const SHELTER_Z = -264;
export const WALL_X = 30;
/** Hemisphere light of the snow under the hole (flashes add to it). */
export const HEMI = 0.42;
/** Where the hole hangs, relative to the camera (it moves with you, like the sky; inside the far plane). */
export const HOLE_OFFSET = new Vector3(0, 300, -766).normalize().multiplyScalar(190);

export function groundHeight(x: number, z: number): number {
  const ax = Math.abs(x);
  const wall = ax > 14 ? Math.pow(ax - 14, 1.5) * 0.12 : 0;
  const roll =
    Math.sin(x * 0.09 + z * 0.05) * 0.5 +
    Math.sin(z * 0.13 + 1.3) * 0.35 +
    Math.sin(x * 0.31 - z * 0.07) * 0.15;
  const nearRoad = clamp(1 - (ax - 3) / 6, 0, 1);
  return wall + roll * (1 - nearRoad * 0.85);
}

export interface Barrel {
  pos: Vector3;
  fixture: Fixture;
  flames: Mesh[];
  burning: number;
}

export interface Valley {
  fixtures: Fixture[];
  barrels: Barrel[];
  figures: Vector3[];
  figureMesh: InstancedMesh;
  batteries: Object3D[];
  flashlight: Object3D;
  blackHole: Group;
  sparkles: InstancedMesh;
  village: Mesh[];
  hemi: HemisphereLight;
  lamp: Fixture;
  tube: Mesh;
  /** The light the bus throws ahead of it (off until it comes). */
  busLight: Fixture;
  cierne: Object3D;
  headlights: Group;
  spots: Record<string, Vector3>;
}

export async function buildValley(ctx: RealityCtx): Promise<Valley> {
  const { game, scene, scope, builder: b } = ctx;
  const props = new Props(game.loader, scene, scope, b);
  await props.load(['Barrel_01'], (p) => ctx.progress(p * 0.5));

  // ───────── the ground: a valley of snow ─────────
  const terrain = new PlaneGeometry(240, 330, 96, 132);
  terrain.rotateX(-Math.PI / 2);
  terrain.translate(0, 0, -132);
  const pos = terrain.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  terrain.computeVertexNormals();
  const uv = terrain.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
  scope.add(terrain);
  const snowTex = scope.add(snowTexture());
  snowTex.wrapS = snowTex.wrapT = RepeatWrapping;
  const snow = new Mesh(
    terrain,
    scope.add(new MeshStandardMaterial({ map: snowTex, color: 0xdfe8f4, roughness: 1, emissive: 0x111725 })),
  );
  snow.receiveShadow = true;
  scene.add(snow);
  b.addCollider(colliderCopy(terrain));
  // every step out here is in snow
  b.surfaces.push({
    box: new Box3(new Vector3(-200, -10, -400), new Vector3(200, 200, 100)),
    surface: 'snow',
  });
  // the road: packed snow between two rows of striped poles
  const road = new PlaneGeometry(5, 272, 2, 136);
  road.rotateX(-Math.PI / 2);
  road.translate(0, 0, -128);
  const rp = road.getAttribute('position');
  for (let i = 0; i < rp.count; i++) rp.setY(i, groundHeight(rp.getX(i), rp.getZ(i)) + 0.03);
  road.computeVertexNormals();
  scene.add(
    new Mesh(
      scope.add(road),
      scope.add(new MeshStandardMaterial({ color: 0xa8b0bc, roughness: 1, emissive: 0x080a10 })),
    ),
  );
  const poleGeo = scope.add(new CylinderGeometry(0.03, 0.03, 1.6, 6).translate(0, 0.8, 0));
  const poles: Matrix4[] = [];
  for (let z = 4; z > SHELTER_Z + 6; z -= 12)
    for (const x of [-3.6, 3.6]) poles.push(new Matrix4().makeTranslation(x, groundHeight(x, z) - 0.2, z));
  const poleMesh = new InstancedMesh(
    poleGeo,
    scope.add(
      new MeshStandardMaterial({ map: scope.add(poleTexture()), roughness: 0.7, emissive: 0x140404 }),
    ),
    poles.length,
  );
  poles.forEach((m, i) => poleMesh.setMatrixAt(i, m));
  scene.add(poleMesh);
  // keep to the valley floor
  for (const x of [-WALL_X, WALL_X]) b.box([x - 0.5, -5, SHELTER_Z - 14], [x + 0.5, 60, 14], null);
  b.box([-WALL_X, -5, 12], [WALL_X, 60, 13], null);
  b.box([-WALL_X, -5, SHELTER_Z - 14], [WALL_X, 60, SHELTER_Z - 13], null);

  // ───────── the ribs: white arcs out of the snow ─────────
  const arcGeo = scope.add(ribGeometry());
  const arcs: Matrix4[] = [];
  const arc = (x: number, z: number, radius: number, thick: number, yaw: number, tilt = 0) => {
    const q = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), yaw)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tilt));
    arcs.push(
      new Matrix4().compose(
        new Vector3(x, groundHeight(x, z) - radius * 0.12, z),
        q,
        new Vector3(radius, radius, (radius * thick) / 1),
      ),
    );
  };
  // two rib cages the road runs through
  for (let i = 0; i < 6; i++) arc(0, -54 - i * 7, 13 + Math.sin(i) * 1.5, 0.9, 0, 0.12 - i * 0.03);
  for (let i = 0; i < 5; i++) arc(1, -166 - i * 8, 17 - i * 0.8, 1.1, 0.08, 0.1);
  // single ribs out in the valley
  let s = 9;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    arc(
      side * (12 + r() * 14),
      10 - i * 17 - r() * 6,
      6 + r() * 12,
      0.7 + r() * 0.8,
      r() * Math.PI,
      (r() - 0.5) * 0.5,
    );
  }
  const arcMesh = new InstancedMesh(
    arcGeo,
    scope.add(new MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.85, emissive: 0x23221e })),
    arcs.length,
  );
  arcs.forEach((m, i) => arcMesh.setMatrixAt(i, m));
  arcMesh.frustumCulled = false;
  scene.add(arcMesh);

  // ───────── Ežo's barrels ─────────
  const barrelZ = [-8, -52, -98, -144, -190, -236];
  const flameMat = scope.add(
    new MeshBasicMaterial({
      map: scope.add(flameTexture()),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      side: DoubleSide,
    }),
  );
  const flameGeo = scope.add(new PlaneGeometry(0.7, 0.9).translate(0, 0.45, 0));
  const barrels: Barrel[] = barrelZ.map((z, i) => {
    const x = i % 2 ? -2.7 : 2.7;
    const y = groundHeight(x, z);
    props.place('Barrel_01', { pos: [x, y - 0.05, z], rotY: i });
    const flames = [0, Math.PI / 2].map((rot) => {
      const f = new Mesh(flameGeo, flameMat);
      f.position.set(x, y + 0.82, z);
      f.rotation.y = rot;
      scene.add(f);
      return f;
    });
    const fixture: Fixture = {
      pos: new Vector3(x, y + 1.3, z),
      color: 0xff8a3a,
      intensity: 6,
      distance: 13,
    };
    return { pos: new Vector3(x, y, z), fixture, flames, burning: 1 };
  });
  // on the first barrel: Ežo's torch, with a wheel sticker
  const flashlight = new Group();
  const body = new Mesh(
    scope.add(new CylinderGeometry(0.022, 0.022, 0.2, 12).rotateZ(Math.PI / 2)),
    scope.add(new MeshStandardMaterial({ color: 0x2a3a5a, metalness: 0.4, roughness: 0.4 })),
  );
  const head = new Mesh(
    scope.add(new CylinderGeometry(0.035, 0.024, 0.06, 12).rotateZ(Math.PI / 2).translate(0.12, 0, 0)),
    scope.add(new MeshStandardMaterial({ color: 0xb8b8b0, metalness: 0.8, roughness: 0.3 })),
  );
  flashlight.add(body, head);
  const b0 = barrels[0]!;
  flashlight.position.set(b0.pos.x - 0.45, b0.pos.y + 0.02, b0.pos.z + 0.1);
  scene.add(flashlight);
  const batteries = [
    [1.8, -75],
    [-2.0, -165],
    [2.2, -215],
  ].map(([x, z]) => {
    const g = new Group();
    for (const dx of [-0.02, 0.02]) {
      const c = new Mesh(
        scope.add(new CylinderGeometry(0.014, 0.014, 0.05, 10)),
        scope.add(
          new MeshStandardMaterial({ color: 0xc8a030, metalness: 0.6, roughness: 0.4, emissive: 0x201400 }),
        ),
      );
      c.position.set(dx, 0.025, 0);
      g.add(c);
    }
    g.position.set(x!, groundHeight(x!, z!) + 0.04, z!);
    scene.add(g);
    return g;
  });

  // ───────── the frost figures: pale, snow-crusted, very still ─────────
  const figures: Vector3[] = [];
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -28 - i * 19 - r() * 5;
    const x = side * (8 + r() * 9);
    figures.push(new Vector3(x, groundHeight(x, z), z));
  }
  const figureMesh = new InstancedMesh(
    scope.add(figureGeometry()),
    scope.add(
      new MeshStandardMaterial({
        map: scope.add(frostTexture()),
        color: 0xd2dce8,
        roughness: 0.95,
        emissive: 0x161a22,
      }),
    ),
    figures.length,
  );
  figureMesh.frustumCulled = false;
  scene.add(figureMesh);

  // ───────── the shelter ─────────
  const Z = SHELTER_Z;
  const gy = groundHeight(0, Z);
  const concrete = scope.add(
    new MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.95, emissive: 0x0a0a0a }),
  );
  const shell = new Group();
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new Mesh(scope.add(new BoxGeometry(w, h, d)), concrete);
    m.position.set(x, y, z);
    shell.add(m);
    b.box([x - w / 2, y - h / 2, z - d / 2], [x + w / 2, y + h / 2, z + d / 2], null);
  };
  part(6.4, 2.6, 0.25, 0, gy + 1.3, Z - 2);
  part(0.25, 2.6, 2.2, -3.1, gy + 1.3, Z - 1);
  part(0.25, 2.6, 2.2, 3.1, gy + 1.3, Z - 1);
  part(6.8, 0.2, 2.8, 0, gy + 2.7, Z - 0.9);
  part(5.4, 0.08, 0.5, 0, gy + 0.46, Z - 1.55);
  b.box([-3.3, gy - 0.2, Z - 2.2], [3.3, gy, Z + 0.3], null, { walkSurface: false });
  const floorSlab = new Mesh(scope.add(new BoxGeometry(6.6, 0.2, 2.6)), concrete);
  floorSlab.position.set(0, gy - 0.08, Z - 0.95);
  shell.add(floorSlab);
  scene.add(shell);
  const mosaic = new Mesh(
    scope.add(new PlaneGeometry(5.6, 2.1)),
    scope.add(
      new MeshStandardMaterial({ map: scope.add(mosaicTexture()), roughness: 0.6, emissive: 0x101010 }),
    ),
  );
  mosaic.position.set(0, gy + 1.35, Z - 1.86);
  scene.add(mosaic);
  const timetable = new Mesh(
    scope.add(new PlaneGeometry(0.6, 0.8)),
    scope.add(
      new MeshStandardMaterial({ map: scope.add(timetableTexture()), roughness: 0.7, emissive: 0x181818 }),
    ),
  );
  timetable.position.set(3.6, gy + 1.6, Z + 0.4);
  scene.add(timetable);
  const signPole = new Mesh(scope.add(new CylinderGeometry(0.04, 0.04, 2.2, 8)), concrete);
  signPole.position.set(3.6, gy + 1.1, Z + 0.35);
  scene.add(signPole);
  // a fluorescent tube under the roof: the last electric light in the valley
  const tube = new Mesh(
    scope.add(new BoxGeometry(1.2, 0.05, 0.08)),
    scope.add(new MeshBasicMaterial({ color: 0xe4f0ff, toneMapped: false })),
  );
  tube.position.set(0, gy + 2.57, Z - 1.3);
  scene.add(tube);
  const lamp: Fixture = {
    pos: new Vector3(0, gy + 2.3, Z - 0.9),
    color: 0xd4e2ff,
    intensity: 5,
    distance: 12,
    flicker: 5,
  };
  const cierne = new Group();
  const shot = new Mesh(
    scope.add(new CylinderGeometry(0.022, 0.018, 0.06, 12, 1, true)),
    scope.add(
      new MeshStandardMaterial({ color: 0xd8e4ec, transparent: true, opacity: 0.4, roughness: 0.05 }),
    ),
  );
  shot.position.y = 0.03;
  const tar = new Mesh(
    scope.add(new CylinderGeometry(0.02, 0.017, 0.045, 12)),
    scope.add(new MeshStandardMaterial({ color: 0x020202, roughness: 0.1 })),
  );
  tar.position.y = 0.024;
  const note = new Mesh(
    scope.add(new PlaneGeometry(0.1, 0.14).rotateX(-Math.PI / 2)),
    scope.add(new MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.9 })),
  );
  note.position.set(0.1, 0.001, 0);
  cierne.add(shot, tar, note);
  cierne.position.set(-0.4, gy + 0.5, Z - 1.5);
  scene.add(cierne);

  // ───────── the sky: no stars, a dead black hole, the last windows of a village ─────────
  const blackHole = new Group();
  const disc = new Mesh(
    scope.add(new CircleGeometry(51, 64)),
    scope.add(new MeshBasicMaterial({ color: 0x000000, fog: false })),
  );
  // the photon ring and a faint halo around it (one additive plane behind the disc)
  const halo = new Mesh(
    scope.add(new PlaneGeometry(162, 162)),
    scope.add(
      new MeshBasicMaterial({
        map: scope.add(haloTexture()),
        transparent: true,
        blending: AdditiveBlending,
        fog: false,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );
  halo.position.z = -0.5;
  blackHole.add(disc, halo);
  blackHole.position.copy(HOLE_OFFSET);
  blackHole.lookAt(0, 0, 0);
  scene.add(blackHole);
  const sparkles = new InstancedMesh(
    scope.add(new CircleGeometry(0.9, 8)),
    scope.add(new MeshBasicMaterial({ color: 0xf0f4ff, fog: false, toneMapped: false, transparent: true })),
    24,
  );
  sparkles.frustumCulled = false;
  for (let i = 0; i < 24; i++) sparkles.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0));
  blackHole.add(sparkles);
  const village: Mesh[] = [];
  const winMat = scope.add(new MeshBasicMaterial({ color: 0xffc070, fog: false, toneMapped: false }));
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -40 - i * 26;
    const x = side * (70 + r() * 30);
    const w = new Mesh(scope.add(new PlaneGeometry(1.4, 1.0)), winMat);
    w.position.set(x, groundHeight(x, z) + 1.5, z);
    w.lookAt(0, w.position.y, z);
    scene.add(w);
    village.push(w);
  }
  // headlights for the very end, far down the road
  const headlights = new Group();
  const glowMat = scope.add(
    new SpriteMaterial({
      map: scope.add(glowTexture()),
      color: 0xfff2d8,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  for (const x of [-0.9, 0.9]) {
    const l = new Mesh(
      scope.add(new SphereGeometry(0.13, 12, 8)),
      scope.add(new MeshBasicMaterial({ color: 0xfff6e0, fog: false, toneMapped: false })),
    );
    l.position.x = x;
    const glow = new Sprite(glowMat);
    glow.scale.setScalar(1.1);
    glow.position.x = x;
    headlights.add(l, glow);
  }
  // the destination sign above them, in amber dots
  const sign = new Mesh(
    scope.add(new PlaneGeometry(1.9, 0.34).rotateY(Math.PI)),
    scope.add(new MeshBasicMaterial({ map: scope.add(destinationTexture()), fog: false, toneMapped: false })),
  );
  sign.position.set(0, 1.62, -0.03);
  // the bus itself: a dark box behind its lights, seen only in its own light
  const bus = new Mesh(
    scope.add(new BoxGeometry(2.5, 2.85, 11)),
    scope.add(new MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.55, metalness: 0.3 })),
  );
  bus.position.set(0, 0.78, 5.8);
  headlights.add(sign, bus);
  headlights.position.set(0, groundHeight(0, Z + 60) + 1.0, Z + 60);
  headlights.visible = false;
  scene.add(headlights);
  const busLight: Fixture = {
    pos: new Vector3(0, gy + 1, Z + 60),
    color: 0xfff0d8,
    intensity: 0,
    distance: 34,
  };

  scene.background = new Color(0x070a11);
  scene.fog = new FogExp2(0x070a11, 0.02);
  const hemi = new HemisphereLight(0x8494bc, 0x161a24, HEMI);
  scene.add(hemi);
  scene.add(new AmbientLight(0x1a2030, 0.12));

  return {
    fixtures: [...barrels.map((bb) => bb.fixture), lamp, busLight],
    barrels,
    figures,
    figureMesh,
    batteries,
    flashlight,
    blackHole,
    sparkles,
    village,
    hemi,
    lamp,
    tube,
    busLight,
    cierne,
    headlights,
    spots: {
      land: new Vector3(0, groundHeight(0, 6), 6),
      shelter: new Vector3(0, gy, Z + 0.8),
      bench: new Vector3(-0.4, gy + 0.6, Z - 1.5),
      timetable: timetable.position.clone(),
      mosaic: mosaic.position.clone(),
      cierne: cierne.position.clone(),
      flashlight: flashlight.position.clone(),
    },
  };
}

/**
 * Half a torus bent into a rib: thick where it goes into the snow, thinning towards the top, with a
 * few knots along it and a flattened cross-section.
 */
function ribGeometry(): BufferGeometry {
  const g = new TorusGeometry(1, 0.06, 8, 48, Math.PI);
  const p = g.getAttribute('position');
  const c = new Vector3();
  const o = new Vector3();
  for (let i = 0; i < p.count; i++) {
    o.fromBufferAttribute(p, i);
    const phi = Math.atan2(o.y, o.x);
    c.set(Math.cos(phi), Math.sin(phi), 0);
    o.sub(c);
    const end = 1 - Math.sin(phi);
    const k = 0.75 + 0.9 * end * end + 0.07 * Math.sin(phi * 11);
    // flatter across the arc's plane (z), fuller along its radius
    o.set(o.x * k, o.y * k, o.z * k * 0.7);
    p.setXYZ(i, c.x + o.x, c.y + o.y, c.z + o.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A tall, thin standing figure, a little stooped, arms hanging past its knees (one merged geometry).
 */
function figureGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    // legs
    new CylinderGeometry(0.075, 0.06, 0.82, 8).translate(-0.1, 0.41, 0),
    new CylinderGeometry(0.075, 0.06, 0.82, 8).translate(0.1, 0.41, 0),
    // hips and a narrow chest, bent forward
    new CylinderGeometry(0.2, 0.17, 0.22, 10).translate(0, 0.9, 0),
    new CylinderGeometry(0.21, 0.18, 0.72, 10).translate(0, 0.36, 0).rotateX(0.16).translate(0, 0.98, 0),
    // neck and head, pushed forward
    new CylinderGeometry(0.045, 0.055, 0.2, 8).rotateX(0.5).translate(0, 1.76, 0.1),
    new SphereGeometry(0.13, 12, 10).scale(0.82, 1.22, 0.95).translate(0, 1.92, 0.17),
    // long arms
    new CylinderGeometry(0.05, 0.032, 1.12, 8).rotateZ(0.06).translate(-0.27, 1.12, 0.1),
    new CylinderGeometry(0.05, 0.032, 1.12, 8).rotateZ(-0.06).translate(0.27, 1.12, 0.1),
  ];
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  parts.forEach((p) => p.dispose());
  return merged;
}

// ───────── canvas textures ─────────

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function snowTexture(): CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#e6edf6';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = 200 + ((i * 37) % 55);
      g.fillStyle = `rgb(${v - 8},${v - 3},${v})`;
      g.fillRect((i * 53) % 128, (i * 97) % 128, 2, 2);
    }
  });
}

/** Crusted snow and ice for the figures. */
function frostTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#c8d2dc';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) {
      const v = 150 + ((i * 71) % 105);
      g.fillStyle = `rgba(${v - 10},${v},${v + 12},0.8)`;
      g.fillRect((i * 37) % 64, (i * 59) % 64, 1 + (i % 3), 1 + ((i * 7) % 4));
    }
  });
}

function destinationTexture(): CanvasTexture {
  return canvasTex(380, 68, (g) => {
    g.fillStyle = '#0a0806';
    g.fillRect(0, 0, 380, 68);
    g.fillStyle = '#ffae2a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = "bold 110px 'IBM Plex Sans Condensed', Arial";
    g.save();
    g.scale(2, 1);
    g.fillText('∞', 190 / 2, 40);
    g.restore();
    // the dot matrix
    g.fillStyle = 'rgba(10,8,6,0.35)';
    for (let x = 0; x < 380; x += 4) g.fillRect(x, 0, 1, 68);
    for (let y = 0; y < 68; y += 4) g.fillRect(0, y, 380, 1);
  });
}

function glowTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,250,235,1)');
    grd.addColorStop(0.2, 'rgba(255,235,200,0.55)');
    grd.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

function poleTexture(): CanvasTexture {
  return canvasTex(8, 64, (g) => {
    g.fillStyle = '#e8e4dc';
    g.fillRect(0, 0, 8, 64);
    g.fillStyle = '#b82018';
    for (let y = 0; y < 24; y += 8) g.fillRect(0, y, 8, 4);
  });
}

function flameTexture(): CanvasTexture {
  return canvasTex(64, 96, (g) => {
    const grd = g.createRadialGradient(32, 80, 2, 32, 60, 40);
    grd.addColorStop(0, 'rgba(255,230,160,0.95)');
    grd.addColorStop(0.35, 'rgba(255,140,40,0.7)');
    grd.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(32, 2);
    g.quadraticCurveTo(60, 50, 52, 92);
    g.lineTo(12, 92);
    g.quadraticCurveTo(4, 50, 32, 2);
    g.fill();
  });
}

/** Two figures and a wheel in tiles, the colours of a 70s bus-stop mosaic. */
function mosaicTexture(): CanvasTexture {
  const W = 336;
  const H = 126;
  return canvasTex(W, H, (g) => {
    const cell = 6;
    const colour = (x: number, y: number): string => {
      const cx = W / 2;
      const cy = H / 2 + 6;
      const d = Math.hypot(x - cx, y - cy);
      // the wheel: rim, hub and spokes
      if (Math.abs(d - 40) < 6 || d < 8) return '#7a4a22';
      const a = Math.atan2(y - cy, x - cx);
      if (d < 40 && Math.abs(((a / (Math.PI / 4)) % 1) + 1) % 1 < 0.08) return '#7a4a22';
      // two figures either side, the big one on the right
      const fig = (fx: number, scale: number) => {
        const head = Math.hypot(x - fx, y - (H * 0.28 - scale * 4)) < 9 * scale;
        const bodyHit = Math.abs(x - fx) < 13 * scale && y > H * 0.38 && y < H * 0.92;
        return head || bodyHit;
      };
      if (fig(70, 1)) return '#2a4a7a';
      if (fig(W - 70, 1.25)) return '#8a2a1a';
      return y < H * 0.5 ? '#c8b890' : '#d8c8a0';
    };
    for (let y = 0; y < H; y += cell)
      for (let x = 0; x < W; x += cell) {
        g.fillStyle = colour(x + cell / 2, y + cell / 2);
        g.fillRect(x, y, cell - 1, cell - 1);
      }
  });
}

function timetableTexture(): CanvasTexture {
  return canvasTex(150, 200, (g) => {
    g.fillStyle = '#f0ece0';
    g.fillRect(0, 0, 150, 200);
    g.fillStyle = '#1a3a7a';
    g.fillRect(0, 0, 150, 36);
    g.fillStyle = '#ffffff';
    g.font = "bold 22px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.fillText('LINKA ∞', 75, 26);
    g.fillStyle = '#1a1a1a';
    g.font = "15px 'IBM Plex Sans Condensed', Arial";
    g.fillText('odchod o', 75, 80);
    g.font = "bold 28px 'IBM Plex Sans Condensed', Arial";
    g.fillText('10¹⁰⁰', 75, 118);
    g.font = "15px 'IBM Plex Sans Condensed', Arial";
    g.fillText('rokov', 75, 144);
  });
}

/** A thin bright ring just outside the hole's edge and a faint glow fading out from it. */
function haloTexture(): CanvasTexture {
  return canvasTex(512, 512, (g) => {
    // the plane is 162 units wide: the hole's edge (51) sits at 161 px, the ring peak at 165 px
    const grd = g.createRadialGradient(256, 256, 150, 256, 256, 256);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.1, 'rgba(150,170,240,0.0)');
    grd.addColorStop(0.142, 'rgba(205,218,255,0.9)');
    grd.addColorStop(0.2, 'rgba(140,160,230,0.3)');
    grd.addColorStop(0.45, 'rgba(70,90,160,0.08)');
    grd.addColorStop(1, 'rgba(40,50,100,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
  });
}

import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  CanvasTexture,
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
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RealityCtx } from '../../world/Reality.ts';
import type { Fixture } from '../../world/lightPool.ts';
import type { DynamicBody } from '../../sim/physics/CollisionWorld.ts';

/*
 * A wooden pier runs north (-z) from where the bus let you off (z = 0) out over a black, still sea.
 * Halfway there is a bay with a bench; at the end, a wider head with a coin telescope. Far beyond,
 * two lights circle each other; off to the west, wheels within wheels turn under the water.
 */
export const WATER_Y = -0.6;
export const PIER = { x0: -1, x1: 1, z0: -100, z1: 1.5 };
export const BAY = { x0: -2.2, x1: 2.2, z0: -52, z1: -48 };
export const HEAD = { x0: -3, x1: 3, z0: -106, z1: -100 };
/** Missing planks: [z0, z1, side] (−1 the left half, 1 the right half). */
export const GAPS: Array<[number, number, number]> = [
  [-14.9, -14.1, -1],
  [-31.7, -30.6, 1],
  [-62.6, -61.6, -1],
  [-80.3, -79.3, 1],
  [-90.2, -89.4, -1],
];
/** Where the two lights circle each other. */
export const LIGHTS = new Vector3(0, 3, -230);
/** The path of frozen light, once the lights stand one behind the other. */
export const PATH = { x0: -1.1, x1: 1.1, z0: -227, z1: -105.5 };
export const WHEELS = new Vector3(-58, 0, -128);
const ROW = 0.26;

/** Half the width of the deck at z (the bay and the head are wider). */
export function deckHalfWidth(z: number): number {
  return z <= HEAD.z1 && z >= HEAD.z0 ? HEAD.x1 : z <= BAY.z1 && z >= BAY.z0 ? BAY.x1 : PIER.x1;
}

export interface Ring {
  pivot: Group;
  radius: number;
  /** Axis it turns about (in the pivot's parent space) and how fast. */
  axis: Vector3;
  speed: number;
}

export interface Sea {
  fixtures: Fixture[];
  /** Two lights and their reflections on the water. */
  lights: Sprite[];
  streaks: Mesh[];
  wheels: Group;
  rings: Ring[];
  eyes: InstancedMesh;
  /** Ring index and angle of every eye. */
  eyeSpots: Array<[number, number]>;
  crawlers: InstancedMesh;
  path: Group;
  pathBody: DynamicBody;
  window: Mesh;
  bus: Group;
  shots: Object3D[];
  hemi: HemisphereLight;
  spots: Record<string, Vector3>;
}

export async function buildSea(ctx: RealityCtx): Promise<Sea> {
  const { game, scene, scope, builder: b, mats } = ctx;
  ctx.progress(0.2);
  const wood = mats.get('pierWood', {
    tex: 'old_wood_floor',
    proc: 'planks',
    color: 0x5a4632,
    uvScale: 1.2,
    surface: 'wood',
    tint: 0xb0a090,
    emissive: 0x120e0a,
  });

  // ───────── the deck: half-planks, so a hole can take one side of a row ─────────
  const halfWidth = deckHalfWidth;
  const inGap = (z: number, side: number) => GAPS.some(([z0, z1, s]) => s === side && z > z0 && z < z1);
  const planks: Matrix4[] = [];
  for (let z = PIER.z1; z > HEAD.z0; z -= ROW) {
    const zc = z - ROW / 2;
    const hw = halfWidth(zc);
    for (const side of [-1, 1]) {
      if (inGap(zc, side)) continue;
      planks.push(new Matrix4().makeScale(hw - 0.01, 1, 1).setPosition((side * hw) / 2, -0.03, zc));
      b.box([side < 0 ? -hw : 0, -0.4, zc - ROW / 2], [side < 0 ? 0 : hw, 0, zc + ROW / 2], null);
    }
  }
  const plankMesh = new InstancedMesh(
    scope.add(new BoxGeometry(1, 0.06, ROW - 0.025)),
    wood.material,
    planks.length,
  );
  planks.forEach((m, i) => plankMesh.setMatrixAt(i, m));
  scene.add(plankMesh);
  b.surfaces.push({ box: new Box3(new Vector3(-4, -1, -110), new Vector3(4, 1, 3)), surface: 'wood' });
  // the sea floor, far down (only ever reached by someone the water did not take)
  b.box([-60, -9, -260], [60, -8, 20], null);
  // piles down into the water, and the beams the planks lie on
  const piles: Matrix4[] = [];
  for (let z = PIER.z1 - 0.5; z > HEAD.z0; z -= 3) {
    const hw = halfWidth(z) + 0.05;
    for (const x of [-hw, hw]) piles.push(new Matrix4().makeTranslation(x, -1.55, z));
  }
  const pileMesh = new InstancedMesh(
    scope.add(new CylinderGeometry(0.12, 0.13, 3, 8)),
    wood.material,
    piles.length,
  );
  piles.forEach((m, i) => pileMesh.setMatrixAt(i, m));
  scene.add(pileMesh);
  const beams: BufferGeometry[] = [];
  for (const x of [-0.95, 0.95])
    beams.push(new BoxGeometry(0.1, 0.16, PIER.z1 - HEAD.z0).translate(x, -0.14, (PIER.z1 + HEAD.z0) / 2));
  scene.add(new Mesh(scope.add(mergeGeometries(beams)!), wood.material));
  beams.forEach((g) => g.dispose());

  // ───────── lanterns on short posts, alternating sides ─────────
  const fixtures: Fixture[] = [];
  const postGeo: BufferGeometry[] = [];
  const glassGeo: BufferGeometry[] = [];
  const glowMat = scope.add(
    new SpriteMaterial({
      map: scope.add(glowTexture()),
      color: 0xffb060,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  for (let i = 0; i < 12; i++) {
    const z = -4 - i * 9;
    const x = (i % 2 ? -1 : 1) * (halfWidth(z) - 0.08);
    postGeo.push(new BoxGeometry(0.1, 1.1, 0.1).translate(x, 0.55, z));
    glassGeo.push(new BoxGeometry(0.16, 0.2, 0.16).translate(x, 1.2, z));
    const glow = new Sprite(glowMat);
    glow.scale.setScalar(0.9);
    glow.position.set(x, 1.2, z);
    scene.add(glow);
    fixtures.push({ pos: new Vector3(x, 1.25, z), color: 0xffa860, intensity: 6, distance: 12, flicker: 0 });
  }
  scene.add(new Mesh(scope.add(mergeGeometries(postGeo)!), wood.material));
  scene.add(
    new Mesh(
      scope.add(mergeGeometries(glassGeo)!),
      scope.add(new MeshStandardMaterial({ color: 0xffc880, emissive: 0xff9a40, emissiveIntensity: 1.2 })),
    ),
  );
  postGeo.forEach((g) => g.dispose());
  glassGeo.forEach((g) => g.dispose());

  // ───────── things on the pier ─────────
  // the lifebuoy on a post
  const buoyPost = new Mesh(scope.add(new BoxGeometry(0.1, 1.5, 0.1).translate(0, 0.75, 0)), wood.material);
  buoyPost.position.set(-0.95, 0, -7.5);
  const lifebuoy = new Mesh(
    scope.add(new TorusGeometry(0.3, 0.075, 10, 32).rotateY(Math.PI / 2)),
    scope.add(new MeshStandardMaterial({ map: scope.add(lifebuoyTexture()), roughness: 0.6 })),
  );
  lifebuoy.position.set(-0.86, 1.05, -7.5);
  scene.add(buoyPost, lifebuoy);
  // the bench in the bay, facing the water
  const bench = new Group();
  bench.add(
    new Mesh(scope.add(new BoxGeometry(0.45, 0.06, 1.6).translate(0, 0.45, 0)), wood.material),
    new Mesh(scope.add(new BoxGeometry(0.06, 0.5, 1.6).translate(-0.22, 0.75, 0)), wood.material),
    new Mesh(scope.add(new BoxGeometry(0.4, 0.42, 0.06).translate(0, 0.21, 0.7)), wood.material),
    new Mesh(scope.add(new BoxGeometry(0.4, 0.42, 0.06).translate(0, 0.21, -0.7)), wood.material),
  );
  bench.position.set(-1.85, 0, -50);
  scene.add(bench);
  b.box([-2.1, 0, -50.8], [-1.6, 0.48, -49.2], null);
  // a crate halfway between the bay and the head
  const crate = new Mesh(
    scope.add(new BoxGeometry(0.5, 0.45, 0.5).translate(0, 0.225, 0)),
    scope.add(new MeshStandardMaterial({ map: scope.add(crateTexture()), roughness: 0.9 })),
  );
  crate.position.set(0.6, 0, -76);
  crate.rotation.y = 0.3;
  scene.add(crate);
  b.box([0.3, 0, -76.3], [0.9, 0.45, -75.7], null);
  // the coin telescope on the head
  const scope3 = new Group();
  const steel = scope.add(new MeshStandardMaterial({ color: 0x3a4a58, metalness: 0.6, roughness: 0.45 }));
  scope3.add(
    new Mesh(scope.add(new CylinderGeometry(0.05, 0.08, 1.1, 10).translate(0, 0.55, 0)), steel),
    new Mesh(scope.add(new BoxGeometry(0.3, 0.22, 0.36).translate(0, 1.22, 0)), steel),
    new Mesh(
      scope.add(
        new CylinderGeometry(0.05, 0.06, 0.28, 10).rotateX(Math.PI / 2).translate(-0.07, 1.25, -0.28),
      ),
      steel,
    ),
    new Mesh(
      scope.add(new CylinderGeometry(0.05, 0.06, 0.28, 10).rotateX(Math.PI / 2).translate(0.07, 1.25, -0.28)),
      steel,
    ),
  );
  scope3.position.set(2.2, 0, -104.5);
  scene.add(scope3);
  b.box([2.0, 0, -104.7], [2.4, 1.1, -104.3], null);
  // three shots of Čierne: on the bench, on the crate, by the telescope
  const shots = [
    new Vector3(-1.75, 0.48, -50.4),
    new Vector3(0.6, 0.45, -76),
    new Vector3(2.45, 1.06, -104.1),
  ].map((p) => {
    const g = new Group();
    const glass = new Mesh(
      scope.add(new CylinderGeometry(0.022, 0.018, 0.06, 12, 1, true)),
      scope.add(
        new MeshStandardMaterial({ color: 0xd8e4ec, transparent: true, opacity: 0.4, roughness: 0.05 }),
      ),
    );
    glass.position.y = 0.03;
    const tar = new Mesh(
      scope.add(new CylinderGeometry(0.02, 0.017, 0.045, 12)),
      scope.add(new MeshStandardMaterial({ color: 0x020202, roughness: 0.1 })),
    );
    tar.position.y = 0.024;
    g.add(glass, tar);
    g.position.copy(p);
    scene.add(g);
    return g;
  });

  // ───────── the sea: black glass ─────────
  const water = new Mesh(
    scope.add(new PlaneGeometry(900, 900).rotateX(-Math.PI / 2)),
    scope.add(
      new MeshStandardMaterial({
        color: 0x020304,
        roughness: 0.05,
        metalness: 0.85,
        emissive: 0xffffff,
        emissiveMap: scope.add(seaTexture()),
        transparent: true,
        opacity: 0.9,
        fog: false,
      }),
    ),
  );
  water.position.set(0, WATER_Y, -120);
  // the see-through water is drawn before the other see-through things (glows over it stay
  // visible), after the eyes (those under the surface show faintly through it)
  water.renderOrder = -1;
  scene.add(water);

  // ───────── the two lights, their reflections, the window they turn out to be ─────────
  const lightMat = scope.add(
    new SpriteMaterial({
      map: scope.add(glowTexture()),
      color: 0xe2eaff,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  const lights = [0, 1].map(() => {
    const s = new Sprite(lightMat);
    s.scale.setScalar(3.2);
    scene.add(s);
    return s;
  });
  const streakMat = scope.add(
    new MeshBasicMaterial({
      map: scope.add(streakTexture()),
      color: 0xb8c8ff,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  const streaks = lights.map(() => {
    const m = new Mesh(
      scope.add(new PlaneGeometry(1.6, 70).rotateX(-Math.PI / 2).translate(0, 0, 35)),
      streakMat,
    );
    scene.add(m);
    return m;
  });
  const win = new Mesh(
    scope.add(new PlaneGeometry(2.6, 1.8)),
    scope.add(
      new MeshBasicMaterial({
        map: scope.add(windowTexture()),
        transparent: true,
        opacity: 0,
        fog: false,
        toneMapped: false,
        depthWrite: false,
      }),
    ),
  );
  win.position.set(0, 1.4, LIGHTS.z + 2);
  scene.add(win);

  // ───────── the path of frozen light ─────────
  const path = new Group();
  const len = PATH.z1 - PATH.z0;
  const slab = new Mesh(
    scope.add(new BoxGeometry(PATH.x1 - PATH.x0, 0.08, len)),
    scope.add(
      new MeshStandardMaterial({
        color: 0xb8d0f0,
        emissive: 0x5a7ab8,
        emissiveIntensity: 0.9,
        roughness: 0.15,
        transparent: true,
        opacity: 0.8,
      }),
    ),
  );
  slab.position.set(0, -0.04, (PATH.z0 + PATH.z1) / 2);
  const haloTex = scope.add(pathGlowTexture());
  haloTex.wrapT = RepeatWrapping;
  haloTex.repeat.set(1, len / 6);
  const halo = new Mesh(
    scope.add(new PlaneGeometry(5, len).rotateX(-Math.PI / 2)),
    scope.add(
      new MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
  halo.position.set(0, WATER_Y + 0.02, (PATH.z0 + PATH.z1) / 2);
  path.add(slab, halo);
  path.visible = false;
  scene.add(path);
  const pathBody = game.world.addDynamic(
    scope.add(new BoxGeometry(PATH.x1 - PATH.x0, 0.4, len)),
    new Matrix4().makeTranslation(0, -0.2, (PATH.z0 + PATH.z1) / 2),
  );
  pathBody.enabled = false;

  // ───────── the wheels within wheels, full of eyes ─────────
  const wheels = new Group();
  wheels.position.copy(WHEELS);
  const ringTex = scope.add(ringTexture());
  ringTex.wrapS = RepeatWrapping;
  ringTex.repeat.set(24, 1);
  const ringMat = scope.add(
    new MeshStandardMaterial({
      color: 0x3a2c1c,
      metalness: 0.6,
      roughness: 0.45,
      emissive: 0xffc070,
      emissiveMap: ringTex,
      emissiveIntensity: 0.9,
    }),
  );
  const rings: Ring[] = (
    [
      [44, new Vector3(0, 0, 1), 0.05],
      [34, new Vector3(1, 0.2, 0), -0.07],
      [24, new Vector3(0.3, 1, 0.2), 0.09],
    ] as const
  ).map(([radius, axis, speed], i) => {
    const pivot = new Group();
    const torus = new Mesh(scope.add(new TorusGeometry(radius, 1.5, 10, 96)), ringMat);
    pivot.add(torus);
    pivot.rotation.set(i * 0.9, i * 0.6, 0);
    wheels.add(pivot);
    return { pivot, radius, axis: axis.clone().normalize(), speed };
  });
  const eyeSpots: Array<[number, number]> = [];
  rings.forEach((_, ri) => {
    for (let k = 0; k < 20; k++) eyeSpots.push([ri, (k / 20) * Math.PI * 2]);
  });
  const eyes = new InstancedMesh(
    scope.add(new PlaneGeometry(4.6, 2.3)),
    scope.add(
      new MeshBasicMaterial({
        map: scope.add(eyeTexture()),
        transparent: true,
        toneMapped: false,
        side: DoubleSide,
      }),
    ),
    eyeSpots.length,
  );
  eyes.frustumCulled = false;
  eyes.renderOrder = -2;
  scene.add(wheels, eyes);

  // ───────── the crawlers (drawn instanced; the reality moves them) ─────────
  const crawlers = new InstancedMesh(
    scope.add(crawlerGeometry()),
    scope.add(new MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.55, emissive: 0x14181e })),
    8,
  );
  crawlers.frustumCulled = false;
  for (let i = 0; i < 8; i++) crawlers.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0));
  scene.add(crawlers);

  // ───────── the bus that brought you, behind you (it leaves) ─────────
  const bus = new Group();
  const body = new Mesh(
    scope.add(new BoxGeometry(12, 2.9, 2.5)),
    scope.add(new MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.3 })),
  );
  body.position.set(0, 1.0, 3.5);
  const panes = new Mesh(
    scope.add(new PlaneGeometry(11, 0.85)),
    scope.add(new MeshBasicMaterial({ map: scope.add(busWindowsTexture()), toneMapped: false })),
  );
  panes.position.set(0, 1.45, 2.24);
  panes.rotation.y = Math.PI;
  bus.add(body, panes);
  scene.add(bus);

  // ───────── light ─────────
  scene.background = new Color(0x000000);
  scene.fog = new FogExp2(0x010204, 0.011);
  const hemi = new HemisphereLight(0x7a8ab0, 0x0a0c10, 0.7);
  scene.add(hemi);
  ctx.progress(0.9);

  return {
    fixtures,
    lights,
    streaks,
    wheels,
    rings,
    eyes,
    eyeSpots,
    crawlers,
    path,
    pathBody,
    window: win,
    bus,
    shots,
    hemi,
    spots: {
      start: new Vector3(0, 0, -0.5),
      lifebuoy: lifebuoy.position.clone(),
      bench: new Vector3(-1.2, 0, -50),
      scope: new Vector3(2.2, 1.25, -104.5),
      head: new Vector3(0, 0, -103),
      window: win.position.clone(),
    },
  };
}

/** A long pale body low to the boards, a small head, six thin legs splayed out. */
function crawlerGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    new SphereGeometry(0.3, 12, 8).scale(0.55, 0.32, 1.7).translate(0, 0.2, 0),
    new SphereGeometry(0.12, 10, 8).scale(0.9, 0.8, 1.2).translate(0, 0.27, -0.55),
  ];
  for (const side of [-1, 1])
    for (const z of [-0.3, 0, 0.3]) {
      const leg = new CylinderGeometry(0.018, 0.012, 0.62, 5)
        .rotateZ(side * 1.05)
        .rotateY(side * z * 0.8)
        .translate(side * 0.38, 0.13, z);
      parts.push(leg);
    }
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

function glowTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,250,235,1)');
    grd.addColorStop(0.2, 'rgba(255,235,200,0.5)');
    grd.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

/** A faint sheen on the black water, growing toward the horizon. */
function seaTexture(): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 141, 0, 128, 141, 128);
    grd.addColorStop(0, '#000000');
    grd.addColorStop(0.08, '#010102');
    grd.addColorStop(0.3, '#04060c');
    grd.addColorStop(0.6, '#0c1220');
    grd.addColorStop(1, '#121a2c');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
}

function streakTexture(): CanvasTexture {
  return canvasTex(32, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.2)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 256);
    const side = g.createLinearGradient(0, 0, 32, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.5, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side;
    g.fillRect(0, 0, 32, 256);
  });
}

function pathGlowTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, 'rgba(120,160,255,0)');
    grd.addColorStop(0.5, 'rgba(160,190,255,0.5)');
    grd.addColorStop(1, 'rgba(120,160,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(220,235,255,${0.1 + ((i * 37) % 10) / 30})`;
      g.fillRect(20 + ((i * 13) % 24), (i * 29) % 64, 1, 3);
    }
  });
}

/** The pub window, from outside, at night: warm light, the cross of the frame, two at a table. */
function windowTexture(): CanvasTexture {
  return canvasTex(260, 180, (g) => {
    g.fillStyle = '#ffcf80';
    g.fillRect(0, 0, 260, 180);
    const grd = g.createRadialGradient(130, 100, 10, 130, 100, 160);
    grd.addColorStop(0, 'rgba(255,240,200,0.9)');
    grd.addColorStop(1, 'rgba(200,110,40,0.6)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 260, 180);
    // two figures at a table, a glass each
    g.fillStyle = 'rgba(60,30,14,0.85)';
    g.beginPath();
    g.arc(80, 88, 16, 0, Math.PI * 2);
    g.arc(184, 80, 20, 0, Math.PI * 2);
    g.fill();
    g.fillRect(58, 104, 44, 60);
    g.fillRect(158, 100, 54, 64);
    g.fillRect(40, 140, 180, 10);
    g.fillStyle = 'rgba(255,220,120,0.9)';
    g.fillRect(112, 124, 8, 16);
    g.fillRect(140, 122, 8, 18);
    // the frame
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, 260, 10);
    g.fillRect(0, 170, 260, 10);
    g.fillRect(0, 0, 10, 180);
    g.fillRect(250, 0, 10, 180);
    g.fillRect(126, 0, 8, 180);
    g.fillRect(0, 70, 260, 7);
  });
}

function ringTexture(): CanvasTexture {
  return canvasTex(64, 32, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#ffd890';
    g.fillRect(0, 6, 64, 2);
    g.fillRect(0, 24, 64, 2);
    for (let x = 4; x < 64; x += 16) g.fillRect(x, 12, 6, 8);
  });
}

function eyeTexture(): CanvasTexture {
  return canvasTex(128, 64, (g) => {
    g.save();
    g.beginPath();
    g.moveTo(4, 32);
    g.quadraticCurveTo(64, -14, 124, 32);
    g.quadraticCurveTo(64, 78, 4, 32);
    g.closePath();
    g.clip();
    g.fillStyle = '#e8e2d2';
    g.fillRect(0, 0, 128, 64);
    const iris = g.createRadialGradient(64, 32, 2, 64, 32, 20);
    iris.addColorStop(0, '#2a1a08');
    iris.addColorStop(0.3, '#b07a20');
    iris.addColorStop(1, '#5a3a10');
    g.fillStyle = iris;
    g.beginPath();
    g.arc(64, 32, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#050302';
    g.beginPath();
    g.arc(64, 32, 8, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
}

function lifebuoyTexture(): CanvasTexture {
  return canvasTex(256, 32, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#e8e2d4' : '#c02018';
      g.fillRect(i * 32, 0, 32, 32);
    }
    g.fillStyle = '#1a1a1a';
    g.font = "bold 20px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.fillText('U KOLESA', 128, 24);
  });
}

function crateTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#6a5038';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#4a3624';
    for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 2);
    g.fillRect(0, 0, 4, 64);
    g.fillRect(60, 0, 4, 64);
  });
}

function busWindowsTexture(): CanvasTexture {
  return canvasTex(440, 34, (g) => {
    g.fillStyle = '#16181c';
    g.fillRect(0, 0, 440, 34);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i === 4 ? '#fff4d8' : '#f0e2b8';
      g.fillRect(6 + i * 54, 3, 46, 28);
    }
  });
}

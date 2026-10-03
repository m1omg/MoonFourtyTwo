import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Sprite,
  SphereGeometry,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import type { Material, Scene, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RealityCtx } from '../../world/Reality.ts';
import { Props } from '../../world/props.ts';
import type { Fixture } from '../../world/lightPool.ts';
import type { KitMaterial } from '../../world/kit/Builder.ts';
import { Character } from '../../npc/Character.ts';
import type { DynamicBody } from '../../sim/physics/CollisionWorld.ts';
import type { Scope } from '../../core/scope.ts';
import { attachFace, maskStatic, smearTexture } from '../../world/objects/faces.ts';

/*
 * The inside of an old city bus. It drives toward -z; the doors (front, middle, rear) are on the
 * right side (+x); the driver's cabin is front left. The bus stands still in the world: the road,
 * the snow poles, the lamps and the houses scroll past outside, the sky changes from era to era.
 */
export const B = { x0: -1.2, x1: 1.2, z0: -5.8, z1: 5.8, h: 2.15 };
export const DOORS = [
  { z0: -5.35, z1: -4.45 },
  { z0: -0.6, z1: 0.6 },
  { z0: 3.95, z1: 4.85 },
];
/** The road is a step below the bus floor. */
export const ROAD_Y = -0.85;
/** Cruising speed (m/s) the outside scrolls by at. */
export const SPEED = 12;
const WIN_Y0 = 0.95;
const WIN_Y1 = 1.85;
/** Length of the strip of road outside; things scroll along it and wrap round. */
const STRIP = 240;
/** z of the strip's far end ahead of the bus. */
const STRIP_Z0 = -175;
const wrapZ = (base: number, dist: number) => STRIP_Z0 + ((((base + dist) % STRIP) + STRIP) % STRIP);

/**
 * What each one keeps doing. The rigged ones (Vierka) move their arm or head; the others are posed
 * models that can only rock in their seat or jerk round to the window and back.
 */
export type Habit = 'hand' | 'stare' | 'rock' | 'twitch' | 'still';

/** A fluctuation riding along: someone from the memories, with a smeared face and one habit. */
export interface Passenger {
  ch: Character;
  /** Where its face is (the flicker rule). */
  head: Vector3;
  habit: Habit;
  /** Offset so the loops do not run in step. */
  phase: number;
  /** The window it keeps looking out of ('window'). */
  window: Vector3;
  model: 'vierka' | 'jano' | 'fero';
}

export interface Door {
  leaves: Array<{ pivot: Object3D; dir: number }>;
  body: DynamicBody;
  /** 0 shut .. 1 open (animated by the reality). */
  open: number;
}

export interface Outside {
  /** 0 the stars, 1 the red dwarfs, 2 the black holes, 3 nothing, 4 the sea at the end of the line. */
  setEra(e: number): void;
  /** Scrolls everything by the distance driven; returns 0..1 how much lamp light falls in. */
  update(dist: number, t: number): number;
  /** The stop beside the middle door (moved by the reality as the bus pulls in and away). */
  stop: Group;
  setStopName(i: number): void;
}

export interface Bus {
  fixtures: Fixture[];
  tubeMat: MeshStandardMaterial;
  buttonMat: MeshStandardMaterial;
  hemi: HemisphereLight;
  sweep: DirectionalLight;
  passengers: Passenger[];
  inspector: Character | null;
  /** The inspector's way: in at the rear door, then up the aisle. */
  route: Vector3[];
  /** Route points beside a passenger (a ticket check). */
  checks: Set<number>;
  wheel: Object3D;
  doors: Door[];
  stopButtons: Vector3[];
  validators: Vector3[];
  cap: Object3D;
  ticket: Object3D;
  outside: Outside;
  spots: Record<string, Vector3>;
}

export const STOP_NAMES = ['Hviezdna éra', 'Degenerovaná éra', 'Éra čiernych dier', 'Temná éra', 'Konečná'];

export async function buildBus(ctx: RealityCtx): Promise<Bus> {
  const { game, scene, scope, builder: b, mats } = ctx;
  const props = new Props(game.loader, scene, scope, b);
  await props.load(['vierka', 'jano', 'fero'], (p) => ctx.progress(p * 0.6));

  // ───────── materials ─────────
  const floorMat = mats.get('busFloor', {
    tex: 'anti_skid_tiles',
    proc: 'tiles',
    color: 0x3c3e40,
    uvScale: 0.9,
    surface: 'metal',
    tint: 0x6c7076,
  });
  const panelMat = mats.get('busPanel', {
    proc: 'plaster',
    color: 0xd8cbaa,
    uvScale: 1.6,
    surface: 'metal',
    roughness: 0.55,
  });
  const ceilMat = mats.get('busCeiling', { proc: 'plaster', color: 0xe8dfca, uvScale: 2, surface: 'metal' });
  const seatMat = mats.get('busSeat', {
    tex: 'fabric_pattern_07',
    proc: 'carpet',
    color: 0x7a3420,
    uvScale: 0.45,
    surface: 'carpet',
    tint: 0xb85a3a,
  });
  const darkMat = kit(scope, new MeshStandardMaterial({ color: 0x2a2826, roughness: 0.7 }), 1, 'metal');
  const chrome = scope.add(new MeshStandardMaterial({ color: 0xc8c8c4, metalness: 0.85, roughness: 0.3 }));
  const yellow = scope.add(new MeshStandardMaterial({ color: 0xe0a820, metalness: 0.3, roughness: 0.45 }));

  // ───────── the shell ─────────
  b.floor(B.x0, B.z0, B.x1, B.z1, 0, floorMat);
  b.ceiling(B.x0, B.z0, B.x1, B.z1, B.h, ceilMat);
  const pane = (z0: number, z1: number) => ({
    at: (z0 + z1) / 2 - B.z0,
    width: z1 - z0,
    bottom: WIN_Y0,
    top: WIN_Y1,
  });
  const leftPanes: Array<[number, number]> = [
    [-5.6, -4.45],
    [-4.3, -3.0],
    [-2.85, -1.55],
    [-1.4, -0.1],
    [0.05, 1.35],
    [1.5, 2.8],
    [2.95, 4.25],
    [4.4, 5.55],
  ];
  const rightPanes: Array<[number, number]> = [
    [-4.3, -3.0],
    [-2.85, -1.55],
    [-1.4, -0.75],
    [0.75, 2.05],
    [2.2, 3.8],
    [5.0, 5.55],
  ];
  b.wall(
    B.x0,
    B.z0,
    B.x0,
    B.z1,
    0,
    B.h,
    panelMat,
    0.08,
    leftPanes.map(([a, c]) => pane(a, c)),
  );
  b.wall(B.x1, B.z0, B.x1, B.z1, 0, B.h, panelMat, 0.08, [
    ...rightPanes.map(([a, c]) => pane(a, c)),
    ...DOORS.map((d) => ({ at: (d.z0 + d.z1) / 2 - B.z0, width: d.z1 - d.z0, bottom: 0, top: 2.0 })),
  ]);
  b.wall(B.x0, B.z0, B.x1, B.z0, 0, B.h, panelMat, 0.08, [{ at: 1.2, width: 2.2, bottom: 0.9, top: 2.02 }]);
  b.wall(B.x0, B.z1, B.x1, B.z1, 0, B.h, panelMat, 0.08, [{ at: 1.2, width: 1.8, bottom: 1.0, top: 1.85 }]);
  // dark lower trim along both sides
  b.box([B.x0 + 0.04, 0, B.z0], [B.x0 + 0.07, 0.3, B.z1], darkMat, { collide: false });
  // frosted glass in every opening (one mesh)
  const glass: BufferGeometry[] = [];
  const sidePane = (x: number, z0: number, z1: number, inward: number) => {
    const g = new PlaneGeometry(z1 - z0, WIN_Y1 - WIN_Y0).rotateY((inward * Math.PI) / 2);
    glass.push(g.translate(x, (WIN_Y0 + WIN_Y1) / 2, (z0 + z1) / 2));
  };
  for (const [a, c] of leftPanes) sidePane(B.x0, a, c, 1);
  for (const [a, c] of rightPanes) sidePane(B.x1, a, c, -1);
  glass.push(new PlaneGeometry(2.2, 1.12).translate(0, 1.46, B.z0));
  glass.push(new PlaneGeometry(1.8, 0.85).rotateY(Math.PI).translate(0, 1.425, B.z1));
  const glassMesh = new Mesh(
    scope.add(mergeGeometries(glass)!),
    scope.add(
      new MeshStandardMaterial({
        map: scope.add(frostTexture()),
        transparent: true,
        depthWrite: false,
        roughness: 0.35,
        side: DoubleSide,
      }),
    ),
  );
  glassMesh.renderOrder = 2;
  scene.add(glassMesh);
  glass.forEach((g) => g.dispose());

  // ───────── the driver's cabin ─────────
  b.box([B.x0, 0, -4.42], [-0.3, 1.25, -4.32], panelMat);
  b.box([B.x0, 0, B.z0], [B.x1, 0.85, B.z0 + 0.42], darkMat);
  b.box([-1.02, 0.42, -4.95], [-0.5, 0.52, -4.55], seatMat, { collide: false });
  b.box([-1.02, 0.5, -4.55], [-0.5, 1.2, -4.46], seatMat, { collide: false });
  b.box([-0.86, 0, -4.85], [-0.66, 0.42, -4.65], darkMat, { collide: false });
  const wheel = new Group();
  const spin = new Group();
  spin.add(
    new Mesh(scope.add(new TorusGeometry(0.23, 0.018, 8, 32)), darkMat.material),
    new Mesh(scope.add(new CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2)), darkMat.material),
  );
  for (let i = 0; i < 3; i++) {
    const spoke = new Mesh(scope.add(new BoxGeometry(0.22, 0.025, 0.012).translate(0.11, 0, 0)), chrome);
    spoke.rotation.z = (i * Math.PI * 2) / 3 + Math.PI / 2;
    spin.add(spoke);
  }
  wheel.add(spin);
  wheel.position.set(-0.75, 1.0, -5.12);
  wheel.rotation.x = -1.13;
  wheel.userData.spin = spin;
  scene.add(wheel);
  const column = new Mesh(scope.add(new CylinderGeometry(0.035, 0.035, 0.5, 8)), darkMat.material);
  column.position.set(-0.75, 0.78, -5.28);
  column.rotation.x = -0.45;
  scene.add(column);
  // the ticket, on the dashboard beside the wheel
  const ticket = new Mesh(
    scope.add(new PlaneGeometry(0.075, 0.04).rotateX(-Math.PI / 2)),
    scope.add(new MeshStandardMaterial({ map: scope.add(ticketTexture()), roughness: 0.8 })),
  );
  ticket.position.set(-0.32, 0.853, -5.52);
  ticket.rotation.y = 0.3;
  scene.add(ticket);

  // ───────── seats ─────────
  const seat = (x0: number, x1: number, zc: number) => {
    b.box([x0 + 0.03, 0.42, zc - 0.22], [x1 - 0.03, 0.52, zc + 0.22], seatMat, { collide: false });
    b.box([x0 + 0.03, 0.5, zc + 0.2], [x1 - 0.03, 1.08, zc + 0.28], seatMat, { collide: false });
    b.box([x0 + 0.1, 0, zc - 0.12], [x1 - 0.1, 0.42, zc + 0.12], darkMat, { collide: false });
    // one solid block for walking into (a little narrower than the seat: the aisle is tight)
    b.box([x0 > 0 ? x0 + 0.05 : x0, 0, zc - 0.24], [x1 < 0 ? x1 - 0.05 : x1, 1.08, zc + 0.3], null);
  };
  const LEFT: Array<[number, number]> = [
    [B.x0, -0.36],
    [0.36, B.x1],
  ];
  const leftRows = [-3.7, -2.85, -2.0, -1.15, -0.3, 0.55, 1.4, 2.25, 3.1, 3.95];
  const rightRows = [-3.7, -2.85, -2.0, -1.15, 1.4, 2.25, 3.1];
  for (const z of leftRows) seat(LEFT[0]![0], LEFT[0]![1], z);
  for (const z of rightRows) seat(LEFT[1]![0], LEFT[1]![1], z);
  // the back bench across the whole width
  b.box([B.x0 + 0.03, 0.42, 4.98], [B.x1 - 0.03, 0.52, 5.42], seatMat, { collide: false });
  b.box([B.x0 + 0.03, 0.5, 5.42], [B.x1 - 0.03, 1.1, 5.52], seatMat, { collide: false });
  b.box([B.x0, 0, 4.96], [B.x1, 0.42, 5.44], darkMat);
  b.box([B.x0, 0.42, 5.42], [B.x1, 1.1, 5.6], null);

  // ───────── poles, rails, stop buttons, validators, tubes ─────────
  const metal: BufferGeometry[] = [];
  const poles: BufferGeometry[] = [];
  const pole = (x: number, z: number) =>
    poles.push(new CylinderGeometry(0.02, 0.02, B.h, 8).translate(x, B.h / 2, z));
  const stopButtons: Vector3[] = [];
  const buttonGeo: BufferGeometry[] = [];
  const button = (x: number, z: number, side: number) => {
    const p = new Vector3(x + side * 0.03, 1.35, z);
    buttonGeo.push(new BoxGeometry(0.035, 0.085, 0.06).translate(p.x, p.y, p.z));
    stopButtons.push(p);
  };
  for (const z of [-3.3, -1.6, 0.95, 2.65, 4.4]) {
    pole(-0.38, z);
    button(-0.38, z, 1);
  }
  for (const z of [-3.3, -1.6, 1.8]) {
    pole(0.38, z);
    button(0.38, z, -1);
  }
  for (const d of DOORS) {
    pole(B.x1 - 0.12, d.z0 - 0.08);
    pole(B.x1 - 0.12, d.z1 + 0.08);
  }
  for (const x of [-0.45, 0.45])
    metal.push(new CylinderGeometry(0.018, 0.018, 9.2, 8).rotateX(Math.PI / 2).translate(x, 1.95, 0.4));
  // grab handles along the seat backs
  for (const z of leftRows) metal.push(handle(-0.78, z + 0.24));
  for (const z of rightRows) metal.push(handle(0.78, z + 0.24));
  scene.add(new Mesh(scope.add(mergeGeometries(poles)!), yellow));
  scene.add(new Mesh(scope.add(mergeGeometries(metal)!), chrome));
  poles.forEach((g) => g.dispose());
  metal.forEach((g) => g.dispose());
  const buttonMat = scope.add(
    new MeshStandardMaterial({ color: 0xc81810, emissive: 0x900800, emissiveIntensity: 0.6, roughness: 0.4 }),
  );
  scene.add(new Mesh(scope.add(mergeGeometries(buttonGeo)!), buttonMat));
  buttonGeo.forEach((g) => g.dispose());
  // validators (označovače): orange boxes by the doors, a green light on each
  const validators: Vector3[] = [];
  const valGeo: BufferGeometry[] = [];
  const ledGeo: BufferGeometry[] = [];
  for (const d of DOORS) {
    const p = new Vector3(B.x1 - 0.2, 1.22, d.z0 - 0.25);
    validators.push(p);
    valGeo.push(new BoxGeometry(0.12, 0.24, 0.16).translate(p.x, p.y, p.z));
    ledGeo.push(new BoxGeometry(0.01, 0.015, 0.015).translate(p.x - 0.062, p.y + 0.08, p.z));
  }
  scene.add(
    new Mesh(
      scope.add(mergeGeometries(valGeo)!),
      scope.add(new MeshStandardMaterial({ color: 0xe06a14, roughness: 0.5 })),
    ),
  );
  scene.add(
    new Mesh(
      scope.add(mergeGeometries(ledGeo)!),
      scope.add(new MeshBasicMaterial({ color: 0x40ff60, toneMapped: false })),
    ),
  );
  valGeo.forEach((g) => g.dispose());
  ledGeo.forEach((g) => g.dispose());
  // two rows of fluorescent tubes; four real lights along the aisle
  const tubes: BufferGeometry[] = [];
  for (const x of [-0.55, 0.55])
    for (let z = -4.1; z < 5.2; z += 1.2)
      tubes.push(new BoxGeometry(0.07, 0.04, 1.05).translate(x, B.h - 0.03, z));
  const tubeMat = scope.add(
    new MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xf0f6ff, emissiveIntensity: 1.6 }),
  );
  scene.add(new Mesh(scope.add(mergeGeometries(tubes)!), tubeMat));
  tubes.forEach((g) => g.dispose());
  const fixtures: Fixture[] = [-3.6, -1.2, 1.2, 3.6].map((z) => ({
    pos: new Vector3(0, B.h - 0.45, z),
    color: 0xe6eeff,
    intensity: 2.6,
    distance: 7,
  }));

  // ───────── the doors: folding leaves, and an invisible wall while they are shut ─────────
  const leafMat = scope.add(new MeshStandardMaterial({ map: scope.add(doorTexture()), roughness: 0.5 }));
  const doors: Door[] = DOORS.map((d) => {
    const w = d.z1 - d.z0;
    const leaves = [
      { z: d.z0, dir: -1, off: w / 4 },
      { z: d.z1, dir: 1, off: -w / 4 },
    ].map(({ z, dir, off }) => {
      const pivot = new Group();
      pivot.position.set(B.x1 - 0.02, 0, z);
      const leaf = new Mesh(
        scope.add(new BoxGeometry(0.035, 1.98, w / 2 - 0.01).translate(0, 1.0, off)),
        leafMat,
      );
      pivot.add(leaf);
      scene.add(pivot);
      return { pivot, dir };
    });
    const body = game.world.addDynamic(
      scope.add(new BoxGeometry(0.14, 2.0, w)),
      new Matrix4().makeTranslation(B.x1, 1.0, (d.z0 + d.z1) / 2),
    );
    return { leaves, body, open: 0 };
  });
  // outside the middle door: the end of a wooden pier (only ever reached at the last stop)
  b.box([B.x1, -0.25, -0.75], [9, -0.05, 0.75], null);

  // ───────── Ežo's cap on the back bench ─────────
  const cap = new Group();
  const fur = scope.add(new MeshStandardMaterial({ map: scope.add(furTexture()), roughness: 1 }));
  const crown = new Mesh(scope.add(new CylinderGeometry(0.1, 0.115, 0.12, 16)), fur);
  crown.position.y = 0.06;
  const top = new Mesh(scope.add(new CircleGeometry(0.1, 16).rotateX(-Math.PI / 2)), fur);
  top.position.y = 0.121;
  cap.add(crown, top);
  cap.position.set(0.72, 0.52, 5.18);
  cap.rotation.z = 0.12;
  scene.add(cap);

  // ───────── the passengers ─────────
  const face = scope.add(
    new MeshStandardMaterial({ map: scope.add(smearTexture()), roughness: 0.8, transparent: true }),
  );
  // a mask curved round the front of the head (the smear wraps the face instead of floating on it)
  const faceGeo = scope.add(
    new SphereGeometry(0.105, 16, 12, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.95, 1.75).scale(0.88, 1.12, 1),
  );
  const greyed = new Map<Material, Material>();
  const fluctuation = (m: Material): Material => {
    let g = greyed.get(m);
    if (!g) {
      g = m.clone();
      const sm = g as MeshStandardMaterial;
      if (sm.color) sm.color.multiply(new Color(0x9aa2ac));
      scope.add(g);
      greyed.set(m, g);
    }
    return g;
  };
  const passengers: Passenger[] = [];
  const seated: Array<[Passenger['model'], number, number, Habit, number]> = [
    ['vierka', -0.98, -2.85, 'hand', -1],
    ['jano', 0.98, -2.0, 'twitch', 1],
    ['fero', -0.57, -0.3, 'rock', -1],
    ['fero', -0.98, 1.4, 'twitch', -1],
    ['vierka', 0.57, 2.25, 'stare', 1],
    ['jano', -0.72, 5.18, 'still', -1],
  ];
  seated.forEach(([model, x, z, habit, side], i) => {
    const g = props.gltf(model);
    if (!g) return;
    const ch = new Character(g);
    ch.pose = 'sit';
    ch.armOnTable = false;
    ch.root.position.set(x, 0.09, z - 0.04);
    ch.root.rotation.y = Math.PI;
    ch.model.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh)
        m.material = Array.isArray(m.material) ? m.material.map(fluctuation) : fluctuation(m.material);
    });
    const mask = new Mesh(faceGeo, face);
    if (!attachFace(ch, mask)) maskStatic(ch, mask);
    scene.add(ch.root);
    // settle into the pose once, then note where the face is (the flicker rule looks for it)
    ch.update(1, 0);
    ch.root.updateMatrixWorld(true);
    passengers.push({
      ch,
      head: mask.getWorldPosition(new Vector3()),
      habit,
      phase: i * 1.37,
      window: new Vector3(side * 1.4, 1.3, z - 0.6),
      model,
    });
  });

  // ───────── the inspector (boards later): a tall woman in a uniform and a cap ─────────
  let inspector: Character | null = null;
  const ig = props.gltf('vierka');
  if (ig) {
    inspector = new Character(ig);
    inspector.pose = 'stand';
    inspector.armOnTable = false;
    inspector.root.scale.set(1.04, 1.08, 1.04);
    const uniform = scope.add(new MeshStandardMaterial({ color: 0x151b28, roughness: 0.92 }));
    inspector.model.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = uniform;
    });
    attachFace(inspector, new Mesh(faceGeo, face));
    const hat = new Group();
    const brim = new Mesh(scope.add(new CylinderGeometry(0.13, 0.13, 0.012, 16)), uniform);
    brim.position.set(0, 0, 0.035);
    const band = new Mesh(scope.add(new CylinderGeometry(0.115, 0.11, 0.075, 16)), uniform);
    band.position.y = 0.04;
    hat.add(brim, band);
    attachFace(inspector, hat, 0.2, 0.0);
    inspector.root.visible = false;
    scene.add(inspector.root);
  }
  const route = [new Vector3(0.8, 0, 4.4), new Vector3(0, 0, 4.4)];
  for (const z of [3.95, 3.1, 2.25, 1.4, 0.55, -0.3, -1.15, -2.0, -2.85, -3.7, -4.6])
    route.push(new Vector3(0, 0, z));
  const checks = new Set<number>();
  route.forEach((p, i) => {
    if (i > 1 && passengers.some((ps) => Math.abs(ps.head.z + 0.06 - p.z) < 0.2 && ps.habit !== 'still'))
      checks.add(i);
  });

  // ───────── outside ─────────
  const outside = buildOutside(scope, scene);

  // ───────── light ─────────
  scene.background = new Color(0x020305);
  scene.fog = new FogExp2(0x040508, 0.012);
  const hemi = new HemisphereLight(0xfff0d8, 0x3a3428, 0.45);
  scene.add(hemi);
  scene.add(new AmbientLight(0x202430, 0.08));
  const sweep = new DirectionalLight(0xffc890, 0);
  sweep.position.set(6, 3, 0);
  scene.add(sweep, sweep.target);

  return {
    fixtures,
    tubeMat,
    buttonMat,
    hemi,
    sweep,
    passengers,
    inspector,
    route,
    checks,
    wheel,
    doors,
    stopButtons,
    validators,
    cap,
    ticket,
    outside,
    spots: {
      start: new Vector3(0.3, 0, 0.1),
      cap: cap.position.clone().setY(0.6),
      ticket: ticket.position.clone(),
      wheel: wheel.position.clone(),
      front: new Vector3(0.2, 0, -4.9),
      out: new Vector3(2.2, 0, 0),
    },
  };
}

function kit(
  scope: Scope,
  m: MeshStandardMaterial,
  uvScale: number,
  surface: KitMaterial['surface'],
): KitMaterial {
  return { material: scope.add(m), uvScale, surface };
}

function handle(x: number, z: number): BufferGeometry {
  return new CylinderGeometry(0.014, 0.014, 0.7, 8).rotateZ(Math.PI / 2).translate(x, 1.12, z);
}

// ───────── outside ─────────

function buildOutside(scope: Scope, scene: Scene): Outside {
  const all = new Group();
  scene.add(all);
  // the road, and the ground either side of it
  const roadTex = scope.add(roadTexture());
  roadTex.wrapS = roadTex.wrapT = RepeatWrapping;
  roadTex.repeat.set(1, STRIP / 16);
  const road = new Mesh(
    scope.add(new PlaneGeometry(7, STRIP).rotateX(-Math.PI / 2)),
    scope.add(new MeshBasicMaterial({ map: roadTex, color: 0x5a5c62 })),
  );
  road.position.set(0, ROAD_Y, STRIP_Z0 + STRIP / 2);
  const groundTex = scope.add(groundTexture());
  groundTex.wrapS = groundTex.wrapT = RepeatWrapping;
  groundTex.repeat.set(30, STRIP / 8);
  // outside is unlit: the bus's own lights must not light up the night
  const groundMat = scope.add(new MeshBasicMaterial({ map: groundTex, color: 0x30343e }));
  const ground = new Mesh(scope.add(new PlaneGeometry(240, STRIP).rotateX(-Math.PI / 2)), groundMat);
  ground.position.set(0, ROAD_Y - 0.03, STRIP_Z0 + STRIP / 2);
  // the bus's own headlights on the road ahead
  const pool = new Mesh(
    scope.add(new PlaneGeometry(5, 22).rotateX(-Math.PI / 2)),
    scope.add(
      new MeshBasicMaterial({
        map: scope.add(poolTexture()),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  pool.position.set(0, ROAD_Y + 0.02, B.z0 - 12);
  all.add(road, ground, pool);
  // snow poles along both sides
  const poleCount = 24;
  const poleMesh = new InstancedMesh(
    scope.add(new CylinderGeometry(0.03, 0.03, 1.5, 6).translate(0, 0.75, 0)),
    scope.add(new MeshBasicMaterial({ map: scope.add(poleTexture()), color: 0x6a6a6a })),
    poleCount,
  );
  poleMesh.frustumCulled = false;
  all.add(poleMesh);
  // street lamps on the right (the town, the first era only)
  const lampCount = 8;
  const lampPoles = new InstancedMesh(
    scope.add(
      mergeGeometries([
        new CylinderGeometry(0.07, 0.09, 6, 8).translate(0, 3, 0),
        new BoxGeometry(1.6, 0.08, 0.08).translate(-0.8, 6, 0),
      ])!,
    ),
    scope.add(new MeshBasicMaterial({ color: 0x1a1b1e })),
    lampCount,
  );
  const glowMat = scope.add(
    new SpriteMaterial({
      map: scope.add(glowTexture()),
      color: 0xffc070,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const lampGlows: Sprite[] = [];
  for (let i = 0; i < lampCount; i++) {
    const s = new Sprite(glowMat);
    s.scale.setScalar(2.4);
    lampGlows.push(s);
    all.add(s);
  }
  lampPoles.frustumCulled = false;
  all.add(lampPoles);
  // a little town: dark houses with lit windows
  const houseCount = 10;
  const houses = new InstancedMesh(
    scope.add(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
    scope.add(new MeshBasicMaterial({ color: 0x0c0d10 })),
    houseCount,
  );
  houses.frustumCulled = false;
  const winCount = houseCount * 3;
  const windows = new InstancedMesh(
    scope.add(new PlaneGeometry(1.1, 0.9)),
    scope.add(new MeshBasicMaterial({ color: 0xffb860, toneMapped: false })),
    winCount,
  );
  windows.frustumCulled = false;
  all.add(houses, windows);
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const houseSpec = Array.from({ length: houseCount }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    return {
      x: side * (15 + r() * 10),
      base: i * (STRIP / houseCount) + r() * 8,
      w: 7 + r() * 4,
      h: 4 + r() * 3,
      d: 6 + r() * 3,
      side,
      lit: [r() > 0.3, r() > 0.4, r() > 0.6],
    };
  });
  // the sky of each era
  const stars0 = starField(scope, 1600, 7, (rr) =>
    rr < 0.2 ? [0.7, 0.8, 1] : rr < 0.5 ? [1, 0.92, 0.75] : [1, 1, 1],
  );
  const stars1 = starField(
    scope,
    260,
    13,
    (rr) => (rr < 0.92 ? [0.75, 0.22, 0.12] : [0.85, 0.85, 0.9]),
    0.55,
  );
  const holes = new Group();
  const haloMat = scope.add(
    new MeshBasicMaterial({
      map: scope.add(haloTexture()),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  const discMat = scope.add(new MeshBasicMaterial({ color: 0x000000, fog: false }));
  for (const [x, y, z, rad] of [
    [-60, 70, -120, 9],
    [80, 50, -40, 5],
    [-20, 110, 60, 14],
  ] as const) {
    const g = new Group();
    const disc = new Mesh(scope.add(new CircleGeometry(rad, 40)), discMat);
    const halo = new Mesh(scope.add(new PlaneGeometry(rad * 3.2, rad * 3.2)), haloMat);
    halo.position.z = -0.3;
    g.add(disc, halo);
    g.position.set(x, y, z);
    g.lookAt(0, 1.5, 0);
    holes.add(g);
  }
  // the sea at the end of the line, two faint lights circling far out
  const sea = new Group();
  // black glass: a faint sheen only far out, where the water meets the sky
  const water = new Mesh(
    scope.add(new PlaneGeometry(500, 500).rotateX(-Math.PI / 2)),
    scope.add(new MeshBasicMaterial({ map: scope.add(seaTexture()), fog: false })),
  );
  water.position.y = ROAD_Y + 0.2;
  const pierMat = scope.add(
    new MeshStandardMaterial({ map: scope.add(plankTexture()), roughness: 0.9, emissive: 0x1a120c }),
  );
  const pier = new Mesh(scope.add(new BoxGeometry(60, 0.12, 1.5).translate(30 + B.x1, -0.11, 0)), pierMat);
  const posts = new InstancedMesh(scope.add(new CylinderGeometry(0.07, 0.08, 1.1, 8)), pierMat, 40);
  for (let i = 0; i < 40; i++)
    posts.setMatrixAt(i, new Matrix4().makeTranslation(B.x1 + 0.6 + (i >> 1) * 3, -0.45, i & 1 ? 0.8 : -0.8));
  sea.add(posts);
  // small lanterns along the pier, a dotted line out into the dark
  const lanternMat = scope.add(
    new SpriteMaterial({
      map: scope.add(glowTexture()),
      color: 0xffb060,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  for (let i = 0; i < 7; i++) {
    const l = new Sprite(lanternMat);
    l.scale.setScalar(0.7);
    l.position.set(B.x1 + 3.6 + i * 9, 0.25, 0.8);
    sea.add(l);
  }
  // the lights' reflections: streaks lying on the still water, toward you
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
  const streaks = [0, 1].map(() => {
    const m = new Mesh(
      scope.add(new PlaneGeometry(1.2, 40).rotateX(-Math.PI / 2).translate(0, 0, 20)),
      streakMat,
    );
    sea.add(m);
    return m;
  });
  const twins: Sprite[] = [];
  const twinMat = scope.add(
    new SpriteMaterial({
      map: scope.add(glowTexture()),
      color: 0xdfe8ff,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  for (let i = 0; i < 2; i++) {
    const t = new Sprite(twinMat);
    t.scale.setScalar(2.2);
    twins.push(t);
    sea.add(t);
  }
  sea.add(water, pier);
  sea.visible = false;
  all.add(stars0, stars1, holes, sea);
  // the stop: a sign on a pole, its name changes
  const stop = new Group();
  const signTex: CanvasTexture[] = STOP_NAMES.map((n) => scope.add(stopSignTexture(n)));
  const signMat = scope.add(
    new MeshStandardMaterial({ map: signTex[0], roughness: 0.6, emissive: 0x111111 }),
  );
  const signPole = new Mesh(
    scope.add(new CylinderGeometry(0.04, 0.04, 2.8, 8).translate(0, 1.4, 0)),
    scope.add(new MeshStandardMaterial({ color: 0x8a8c90, metalness: 0.5, roughness: 0.5 })),
  );
  const sign = new Mesh(scope.add(new PlaneGeometry(0.62, 0.62).rotateY(-Math.PI / 2)), signMat);
  sign.position.set(-0.03, 2.45, 0);
  stop.add(signPole, sign);
  stop.position.set(3.1, ROAD_Y, -400);
  all.add(stop);

  let era = 0;
  const m = new Matrix4();
  const setEra = (e: number) => {
    era = e;
    stars0.visible = e === 0;
    stars1.visible = e === 1;
    holes.visible = e === 2;
    lampPoles.visible = e === 0;
    lampGlows.forEach((g) => (g.visible = e === 0));
    houses.visible = windows.visible = e === 0;
    poleMesh.visible = e <= 2;
    road.visible = ground.visible = e <= 3;
    sea.visible = e === 4;
    // the snow gets darker as the light goes out of the world
    groundMat.color.setHex([0x30343e, 0x2a2224, 0x121318, 0x050506, 0x050506][e]!);
  };
  const update = (dist: number, t: number): number => {
    roadTex.offset.y = (dist / 16) % 1;
    groundTex.offset.y = (dist / 8) % 1;
    for (let i = 0; i < poleCount; i++) {
      const z = wrapZ((i >> 1) * 20 + (i & 1) * 10, dist);
      const x = i & 1 ? 4.0 : -4.0;
      poleMesh.setMatrixAt(i, m.makeTranslation(x, ROAD_Y - 0.1, z));
    }
    poleMesh.instanceMatrix.needsUpdate = true;
    let sweepK = 0;
    if (era === 0) {
      for (let i = 0; i < lampCount; i++) {
        const z = wrapZ(i * (STRIP / lampCount), dist);
        lampPoles.setMatrixAt(i, m.makeTranslation(5.4, ROAD_Y, z));
        lampGlows[i]!.position.set(3.9, ROAD_Y + 5.85, z);
        sweepK = Math.max(sweepK, Math.exp(-(z * z) / 40));
      }
      lampPoles.instanceMatrix.needsUpdate = true;
      let w = 0;
      for (const [i, h] of houseSpec.entries()) {
        const z = wrapZ(h.base, dist);
        houses.setMatrixAt(i, m.makeScale(h.w, h.h, h.d).setPosition(h.x, ROAD_Y, z));
        h.lit.forEach((on, k) => {
          const wz = z + (k - 1) * (h.d * 0.3);
          const wx = h.x - h.side * (h.w / 2 + 0.02);
          windows.setMatrixAt(
            w++,
            on
              ? m.makeRotationY((-h.side * Math.PI) / 2).setPosition(wx, ROAD_Y + h.h * 0.55, wz)
              : m.makeScale(0, 0, 0),
          );
        });
      }
      houses.instanceMatrix.needsUpdate = true;
      windows.instanceMatrix.needsUpdate = true;
    }
    if (era === 4) {
      // two lights circling each other, far out on the water
      const a = t * 0.35;
      twins[0]!.position.set(70 + Math.cos(a) * 4, 3, -30 + Math.sin(a) * 4);
      twins[1]!.position.set(70 - Math.cos(a) * 4, 3, -30 - Math.sin(a) * 4);
      twins.forEach((tw, i) => {
        // from the foot of the light toward the bus (local +z of the streak points at you)
        const st = streaks[i]!;
        st.position.set(tw.position.x, ROAD_Y + 0.21, tw.position.z);
        st.rotation.y = Math.atan2(-tw.position.x, -tw.position.z);
      });
    }
    return sweepK;
  };
  setEra(0);
  return {
    setEra,
    update,
    stop,
    setStopName: (i: number) => {
      signMat.map = signTex[Math.min(i, signTex.length - 1)]!;
      signMat.needsUpdate = true;
    },
  };
}

function starField(
  scope: Scope,
  count: number,
  seed: number,
  colour: (r: number) => [number, number, number],
  bright = 1,
): Points {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < count; i++) {
    // on a dome above the horizon
    const az = r() * Math.PI * 2;
    const el = Math.asin(0.04 + r() * 0.96);
    const R = 160;
    pos.push(Math.cos(az) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(az) * Math.cos(el) * R);
    const k = (0.35 + r() * 0.65) * bright;
    const [cr, cg, cb] = colour(r());
    col.push(cr * k, cg * k, cb * k);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return new Points(
    scope.add(g),
    scope.add(
      new PointsMaterial({
        size: 2,
        sizeAttenuation: false,
        vertexColors: true,
        fog: false,
        toneMapped: false,
        depthWrite: false,
      }),
    ),
  );
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

/** Ice grown in from the edges of the pane, clear in the middle. */
function frostTexture(): CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const img = g.createImageData(128, 128);
    let s = 5;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        // corners grow the most ice, the middle stays clear
        const ex = Math.min(x, 127 - x) / 64;
        const ey = Math.min(y, 127 - y) / 64;
        const e = Math.min(ex, ey) * 0.7 + Math.hypot(1 - ex, 1 - ey) * -0.25 + 0.18;
        const n = r();
        const a = Math.max(0, Math.min(1, (0.3 - e) * 3.2 + (n - 0.5) * 0.45));
        const i = (y * 128 + x) * 4;
        img.data[i] = 215 + n * 30;
        img.data[i + 1] = 228 + n * 25;
        img.data[i + 2] = 245;
        img.data[i + 3] = 10 + a * 175;
      }
    g.putImageData(img, 0, 0);
  });
}

function roadTexture(): CanvasTexture {
  return canvasTex(64, 256, (g) => {
    g.fillStyle = '#3a3a3c';
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 700; i++) {
      const v = 48 + ((i * 37) % 30);
      g.fillStyle = `rgb(${v},${v},${v + 2})`;
      g.fillRect((i * 53) % 64, (i * 97) % 256, 2, 2);
    }
    // snow along the edges, a dashed line in the middle (3 m of every 8)
    g.fillStyle = 'rgba(220,226,236,0.55)';
    g.fillRect(0, 0, 5, 256);
    g.fillRect(59, 0, 5, 256);
    g.fillStyle = '#d8d4c8';
    for (let y = 0; y < 256; y += 128) g.fillRect(30, y, 4, 48);
  });
}

function groundTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#c8ceda';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 300; i++) {
      const v = 170 + ((i * 41) % 70);
      g.fillStyle = `rgb(${v - 6},${v - 2},${v + 4})`;
      g.fillRect((i * 29) % 64, (i * 71) % 64, 2, 2);
    }
  });
}

function poolTexture(): CanvasTexture {
  return canvasTex(64, 256, (g) => {
    const grd = g.createLinearGradient(0, 256, 0, 0);
    grd.addColorStop(0, 'rgba(255,240,210,0.38)');
    grd.addColorStop(0.6, 'rgba(255,240,210,0.12)');
    grd.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 256);
    // soft sides
    const side = g.createLinearGradient(0, 0, 64, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.3, 'rgba(0,0,0,0)');
    side.addColorStop(0.7, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side;
    g.fillRect(0, 0, 64, 256);
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

function haloTexture(): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    // the disc's edge sits at 80 px (radius / plane = 1 / 3.2)
    const grd = g.createRadialGradient(128, 128, 74, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.1, 'rgba(150,170,240,0)');
    grd.addColorStop(0.16, 'rgba(210,222,255,0.9)');
    grd.addColorStop(0.3, 'rgba(140,160,230,0.25)');
    grd.addColorStop(1, 'rgba(40,50,100,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
}

function seaTexture(): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    // the plane is 500 m across and the camera sees 220 m: the sheen grows from about 40 m out
    grd.addColorStop(0, '#020304');
    grd.addColorStop(0.16, '#03050a');
    grd.addColorStop(0.5, '#111a2a');
    grd.addColorStop(0.8, '#1a2436');
    grd.addColorStop(1, '#1a2436');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
}

function streakTexture(): CanvasTexture {
  return canvasTex(32, 256, (g) => {
    // bright at the light's foot (far end, v = 1 → top of the canvas), fading toward you
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,255,255,0.7)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.18)');
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

function plankTexture(): CanvasTexture {
  const t = canvasTex(256, 64, (g) => {
    g.fillStyle = '#4a3a2a';
    g.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 16) {
      g.fillStyle = x % 32 ? '#3e3024' : '#54422e';
      g.fillRect(x, 0, 14, 64);
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(12, 1);
  return t;
}

function stopSignTexture(name: string): CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#f2efe6';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#1a3a7a';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 122);
    g.fillStyle = '#1a3a7a';
    g.beginPath();
    g.arc(64, 38, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2efe6';
    g.font = "bold 22px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.fillText('A', 64, 46);
    g.fillStyle = '#1a1a1a';
    g.font = "bold 15px 'IBM Plex Sans Condensed', Arial";
    const words = name.split(' ');
    words.forEach((w, i) => g.fillText(w, 64, 82 + i * 18 - (words.length - 1) * 4));
  });
}

function ticketTexture(): CanvasTexture {
  return canvasTex(150, 80, (g) => {
    g.fillStyle = '#efe6c8';
    g.fillRect(0, 0, 150, 80);
    g.fillStyle = '#2a4a8a';
    g.fillRect(0, 0, 150, 18);
    g.fillStyle = '#ffffff';
    g.font = "bold 13px 'IBM Plex Sans Condensed', Arial";
    g.fillText('CESTOVNÝ LÍSTOK', 8, 14);
    g.fillStyle = '#1a1a1a';
    g.font = "bold 26px 'IBM Plex Sans Condensed', Arial";
    g.fillText('∞', 10, 52);
    g.font = "12px 'IBM Plex Sans Condensed', Arial";
    g.fillText('platí pre dvoch', 48, 50);
  });
}

function doorTexture(): CanvasTexture {
  return canvasTex(64, 128, (g) => {
    g.fillStyle = '#d4c6a4';
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#10141a';
    g.fillRect(6, 6, 52, 72);
    g.fillStyle = '#3a3a38';
    g.fillRect(0, 120, 64, 8);
  });
}

function furTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#4a3c30';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 500; i++) {
      const v = 50 + ((i * 47) % 70);
      g.fillStyle = `rgb(${v + 20},${v + 8},${v - 4})`;
      g.fillRect((i * 23) % 64, (i * 61) % 64, 1, 3);
    }
  });
}

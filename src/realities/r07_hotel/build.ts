import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
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
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RealityCtx } from '../../world/Reality.ts';
import type { KitMaterial } from '../../world/kit/Builder.ts';
import type { Scope } from '../../core/scope.ts';
import type { HidingSpot } from '../../sim/ai/types.ts';
import { Props } from '../../world/props.ts';
import type { Fixture } from '../../world/lightPool.ts';
import { Door } from '../../world/objects/door.ts';
import { Tableware } from '../../world/objects/tableware.ts';
import { HockeyTV } from '../../world/objects/screens.ts';
import { Character } from '../../npc/Character.ts';
import { instanceModel, type InstanceXform } from '../../world/instancing.ts';
import { NavGrid, Area } from '../../sim/ai/nav/NavGrid.ts';

/*
 * Layout (metres, y = 0 everywhere). You arrive by lift in the lobby's south wall, facing north.
 *   restaurant x[-24,-10] z[0,14]   lobby x[-10,10] z[0,14]   dance hall x[10,24] z[0,14]
 *   corridor   x[-1.2,1.2] z[-40,0]  north from the lobby; four rooms on each side:
 *              west x[-7.2,-1.2], east x[1.2,7.2], room i spans z[-9-9i, -2-9i]
 *   salónik    x[-5,5] z[-48,-40]   behind a door with three locks at the corridor's end
 */
export const LOBBY = { x0: -10, z0: 0, x1: 10, z1: 14, h: 3.6 };
export const CORRIDOR = { x0: -1.2, z0: -40, x1: 1.2, z1: 0, h: 2.8 };
export const SALON = { x0: -5, z0: -48, x1: 5, z1: -40, h: 3.0 };
const ROOM_H = 2.7;

/** Unit offsets of a table's four corners (for legs). */
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

const _ray = new Raycaster();
const _from = new Vector3();
const DOWN = new Vector3(0, -1, 0);
/**
 * The top of a placed model under (x, z), where a thing put on it stands (the tables' tops were
 * guessed: glasses, a key and a lamp floated over some, others were sunk into them), or
 * `fallback` beside it.
 */
function topOf(obj: Object3D | null, x: number, z: number, fallback: number): number {
  if (!obj) return fallback;
  obj.updateMatrixWorld(true);
  _ray.set(_from.set(x, 3, z), DOWN);
  const hit = _ray.intersectObject(obj, true)[0];
  return hit ? hit.point.y : fallback;
}

export type Era = '1906' | '1986' | '2026' | '1e14' | '1e40' | '1e100' | 'tallies' | 'watching';
/** Rooms along the corridor: west 0, east 0, west 1, east 1, … */
export const ERAS: Era[] = ['1906', '1986', '2026', '1e14', '1e40', '1e100', 'tallies', 'watching'];
/** The rooms where the salónik keys lie. */
export const KEY_ROOMS: Era[] = ['1906', '1e14', 'tallies'];

export interface Room {
  era: Era;
  side: -1 | 1;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The doorway's centre in the corridor wall (y = 0). */
  door: Vector3;
  doorObj: Door;
  /** The memory table's centre (y = 0). */
  table: Vector3;
  /** Where a visitor stands to look at the table. */
  stand: Vector3;
  spots: HidingSpot[];
  /** Things the chambermaid can wipe away. */
  erasable: Object3D[];
  fixture: Fixture;
  key: Object3D | null;
}

export interface Hotel {
  rooms: Room[];
  nav: NavGrid;
  fixtures: Fixture[];
  salonDoor: Door;
  ezo: Character | null;
  watcher: Character | null;
  /** You, from behind, at the table in the room where Ežo looks up. */
  me: Character | null;
  maid: Character | null;
  cart: Object3D;
  tv: HockeyTV;
  mirrorBall: Object3D;
  specks: InstancedMesh;
  fire: { light: Fixture; embers: Mesh };
  blackHole: Object3D;
  guestbook: Mesh;
  keyboardHooks: Object3D[];
  /** Patrol points for the chambermaid (corridor and lobby). */
  patrol: Vector3[];
  spots: Record<string, Vector3>;
}

export async function buildHotel(ctx: RealityCtx): Promise<Hotel> {
  const { game, scene, scope, builder: b, mats } = ctx;
  const props = new Props(game.loader, scene, scope, b);
  await props.load(
    [
      'mid_century_lounge_chair',
      'sofa_03',
      'Chandelier_02',
      'old_bed_frame',
      'vintage_oil_lamp',
      'ornate_mirror_01',
      'portable_cassette_player',
      'painted_wooden_nightstand',
      'vintage_grandfather_clock_01',
      'WoodenTable_01',
      'WoodenTable_03',
      'WoodenChair_01',
      'painted_wooden_chair_02',
      'round_wooden_table_01',
      'dining_chair_02',
      'Television_01',
      'potted_plant_02',
      'ezo',
      'jano',
      'vierka',
    ],
    (p) => ctx.progress(p * 0.5),
  );
  const tw = new Tableware(scope);

  // ───────── materials ─────────
  const carpet = canvasMat(
    scope,
    carpetTexture(['#7a3a14', '#c8701e', '#e0a838', '#4a2410']),
    0.7,
    'carpet',
    0.95,
  );
  const redCarpet = canvasMat(
    scope,
    carpetTexture(['#5a1418', '#8a2a24', '#c8904a', '#2a0a0c']),
    0.8,
    'carpet',
    0.95,
  );
  const panel = mats.get('hotelPanel', {
    tex: 'dark_paneled_wood',
    proc: 'planks',
    color: 0x5a3a22,
    uvScale: 1.8,
    surface: 'wood',
    tint: 0xe8c098,
  });
  const paper = mats.get('hotelPaper', {
    tex: 'decrepit_wallpaper',
    proc: 'plaster',
    color: 0xc8b08a,
    uvScale: 2,
    surface: 'concrete',
    tint: 0xf0dcb8,
  });
  const plaster = mats.get('hotelCeiling', {
    proc: 'plaster',
    color: 0xe0d6c4,
    uvScale: 3,
    surface: 'concrete',
  });
  const parquet = mats.get('hotelParquet', {
    tex: 'herringbone_parquet',
    proc: 'planks',
    color: 0x8a5a30,
    uvScale: 1.4,
    surface: 'wood',
  });
  const planks = mats.get('hotelPlanks', {
    tex: 'dark_wooden_planks',
    proc: 'planks',
    color: 0x4a3020,
    uvScale: 1.6,
    surface: 'wood',
  });
  const brick = mats.get('hotelBrick', {
    tex: 'brick_wall_02',
    proc: 'brick',
    color: 0x7a4a3a,
    uvScale: 1.4,
    surface: 'concrete',
  });
  const voidMat = mats.get('hotelVoid', {
    proc: 'noise',
    color: 0x050505,
    uvScale: 2,
    surface: 'concrete',
    roughness: 1,
  });
  const counterWood = mats.get('hotelCounter', {
    proc: 'planks',
    color: 0x6a4228,
    uvScale: 1,
    surface: 'wood',
    roughness: 0.5,
  });
  const cloth = mats.get('hotelCloth', {
    proc: 'noise',
    color: 0xf0ece2,
    uvScale: 1,
    surface: 'carpet',
    roughness: 0.9,
  });
  const frostMat = mats.get('hotelFrost', {
    proc: 'noise',
    color: 0xdce8f2,
    uvScale: 1.5,
    surface: 'snow',
    roughness: 0.6,
  });
  const mossMat = mats.get('hotelMoss', {
    proc: 'carpet',
    color: 0x3a5a22,
    uvScale: 0.8,
    surface: 'carpet',
    roughness: 1,
  });
  const tallyMat = canvasMat(scope, tallyTexture(), 1.1, 'concrete', 0.9);
  const glassMat = scope.add(
    new MeshStandardMaterial({
      color: 0xd8e4ec,
      transparent: true,
      opacity: 0.25,
      roughness: 0.05,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  const snowMat = scope.add(new MeshBasicMaterial({ map: scope.add(snowPackTexture()), color: 0x9aa6b8 }));

  // ───────── the ground floor: restaurant, lobby, dance hall ─────────
  const H = LOBBY.h;
  b.floor(-24, 0, -10, 14, 0, redCarpet);
  b.floor(-10, 0, 10, 14, 0, carpet);
  b.floor(10, 0, 24, 14, 0, parquet);
  b.ceiling(-24, 0, 24, 14, H, plaster);
  // north wall with the corridor's mouth; south wall with the lift and windows onto the snow
  wallTwoTone(b, -24, 0, 24, 0, H, panel, paper, [{ at: 24, width: 2.4, bottom: 0, top: 2.5 }]);
  wallTwoTone(b, -24, 14, 24, 14, H, panel, paper, [
    { at: 24, width: 1.3, bottom: 0, top: 2.3 },
    { at: 7, width: 6, bottom: 0.9, top: 3.0 },
    { at: 18.5, width: 5, bottom: 0.9, top: 3.0 },
    { at: 29.5, width: 5, bottom: 0.9, top: 3.0 },
    { at: 41, width: 6, bottom: 0.9, top: 3.0 },
  ]);
  wallTwoTone(b, -24, 0, -24, 14, H, panel, paper, [{ at: 7, width: 6, bottom: 0.9, top: 3.0 }]);
  wallTwoTone(b, 24, 0, 24, 14, H, panel, paper);
  wallTwoTone(b, -10, 0, -10, 14, H, panel, paper, [{ at: 7, width: 5, bottom: 0, top: 2.8 }]);
  wallTwoTone(b, 10, 0, 10, 14, H, panel, paper, [{ at: 7, width: 5, bottom: 0, top: 2.8 }]);
  // packed snow behind every window
  // [x, z of the snow, x, z of the glass, width, facing]
  for (const [sx, sz, gx, gz, w, rotY] of [
    [-17, 14.35, -17, 14.0, 6, Math.PI],
    [-5.5, 14.35, -5.5, 14.0, 5, Math.PI],
    [5.5, 14.35, 5.5, 14.0, 5, Math.PI],
    [17, 14.35, 17, 14.0, 6, Math.PI],
    [-24.35, 7, -24.0, 7, 6, Math.PI / 2],
  ] as const) {
    const sn = new Mesh(scope.add(new PlaneGeometry(w, 2.4)), snowMat);
    sn.position.set(sx, 1.95, sz);
    sn.rotation.y = rotY;
    scene.add(sn);
    const gl = new Mesh(scope.add(new PlaneGeometry(w, 2.1)), glassMat);
    gl.position.set(gx, 1.95, gz);
    gl.rotation.y = rotY;
    scene.add(gl);
  }
  // the lift we came in by (doors shut behind us)
  const liftDoor = new Mesh(
    scope.add(new PlaneGeometry(1.3, 2.3)),
    scope.add(
      new MeshStandardMaterial({ map: scope.add(brassDoorTexture()), metalness: 0.7, roughness: 0.35 }),
    ),
  );
  liftDoor.position.set(0, 1.15, 13.93);
  liftDoor.rotation.y = Math.PI;
  scene.add(liftDoor);
  b.box([-0.7, 0, 13.9], [0.7, 2.3, 14.1], null);

  // reception: counter along the north wall east of the corridor, key board behind it
  b.box([3, 0, 2.0], [8.5, 1.05, 2.7], counterWood);
  b.box([2.9, 1.05, 1.95], [8.6, 1.1, 2.75], counterWood);
  const keyboard = new Mesh(
    scope.add(new PlaneGeometry(2.4, 1.0)),
    scope.add(new MeshStandardMaterial({ map: scope.add(keyboardTexture()), roughness: 0.7 })),
  );
  // on the wall's face (z 0.1): at 0.09 it was inside the wall and never drawn
  keyboard.position.set(5.8, 1.75, 0.105);
  scene.add(keyboard);
  const keyboardHooks: Object3D[] = [];
  const keyGeo = scope.add(new BoxGeometry(0.02, 0.09, 0.008));
  const keyMat = scope.add(new MeshStandardMaterial({ color: 0xb8902c, metalness: 0.9, roughness: 0.3 }));
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 8; c++) {
      if (r === 2 && c >= 5) continue; // the salónik's three hooks are empty
      const k = new Mesh(keyGeo, keyMat);
      k.position.set(4.85 + c * 0.27, 2.02 - r * 0.3, 0.12);
      scene.add(k);
      keyboardHooks.push(k);
    }
  const guestbook = new Mesh(
    scope.add(new PlaneGeometry(0.5, 0.34)),
    scope.add(new MeshStandardMaterial({ map: scope.add(guestbookTexture()), roughness: 0.85 })),
  );
  guestbook.rotation.x = -Math.PI / 2;
  guestbook.position.set(4.6, 1.112, 2.35);
  scene.add(guestbook);
  const bell = new Mesh(
    scope.add(new SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    scope.add(new MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.25 })),
  );
  bell.position.set(6.4, 1.11, 2.35);
  scene.add(bell);
  props.place('vintage_grandfather_clock_01', { pos: [-4.5, 0, 0.35], rotY: 0 });
  // the lounge: sofa, swivel chairs, a low table, plants
  props.place('sofa_03', { pos: [-6, 0, 11.5], rotY: Math.PI });
  props.place('mid_century_lounge_chair', { pos: [-8.2, 0, 8.6], rotY: Math.PI / 2 + 0.4 });
  props.place('mid_century_lounge_chair', { pos: [-3.8, 0, 8.6], rotY: -Math.PI / 2 - 0.4 });
  b.box([-7, 0.38, 8.6], [-5, 0.42, 10.2], counterWood);
  b.box([-6.9, 0, 8.7], [-5.1, 0.38, 10.1], null);
  for (const [lx, lz] of CORNERS)
    b.box(
      [-6 + lx * 0.9 - 0.03, 0, 9.4 + lz * 0.7 - 0.03],
      [-6 + lx * 0.9 + 0.03, 0.38, 9.4 + lz * 0.7 + 0.03],
      counterWood,
      {
        collide: false,
      },
    );
  for (const [x, z] of [
    [-9.3, 1],
    [9.2, 13.2],
    [-9.3, 13.2],
  ])
    props.place('potted_plant_02', { pos: [x!, 0, z!], rotY: x! * 0.7 });
  // a sign over the corridor
  const sign = new Mesh(
    scope.add(new PlaneGeometry(2.6, 0.45)),
    scope.add(
      new MeshBasicMaterial({ map: scope.add(signTexture('IZBY · ZIMMER · ROOMS')), transparent: true }),
    ),
  );
  sign.position.set(0, 2.85, 0.105);
  scene.add(sign);

  // the restaurant: set for two at every table
  const tables: Array<[number, number]> = [
    [-20.5, 3.5],
    [-20.5, 7],
    [-20.5, 10.5],
    [-15.5, 3.5],
    [-15.5, 7],
    [-15.5, 10.5],
  ];
  // chairs everywhere are one instanced draw; plates and glasses too
  const chairs: InstanceXform[] = [];
  const settings: Matrix4[] = [];
  for (const [x, z] of tables) {
    b.box([x - 0.6, 0.72, z - 0.6], [x + 0.6, 0.76, z + 0.6], cloth);
    b.box([x - 0.62, 0.45, z - 0.62], [x + 0.62, 0.72, z + 0.62], cloth, { collide: false });
    b.box([x - 0.55, 0, z - 0.55], [x + 0.55, 0.76, z + 0.55], null);
    // legs under the cloth (it hung in the air)
    for (const [lx, lz] of CORNERS)
      b.box(
        [x + lx * 0.5 - 0.025, 0, z + lz * 0.5 - 0.025],
        [x + lx * 0.5 + 0.025, 0.45, z + lz * 0.5 + 0.025],
        counterWood,
        {
          collide: false,
        },
      );
    chairs.push({ x, y: 0, z: z - 0.95, rotY: 0 }, { x, y: 0, z: z + 0.95, rotY: Math.PI });
    for (const dz of [-0.3, 0.3]) settings.push(new Matrix4().makeTranslation(x, 0.762, z + dz));
  }
  const plates = new InstancedMesh(
    scope.add(new CircleGeometry(0.13, 20).rotateX(-Math.PI / 2)),
    scope.add(new MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.3 })),
    settings.length,
  );
  const glassGeo = scope.add(new CylinderGeometry(0.035, 0.028, 0.12, 10, 1, true));
  glassGeo.translate(0.16, 0.06, 0);
  const glasses = new InstancedMesh(glassGeo, glassMat, settings.length);
  settings.forEach((m, i) => {
    plates.setMatrixAt(i, m);
    glasses.setMatrixAt(i, m);
  });
  scene.add(plates, glasses);
  for (const x of [-20.5, -15.5]) props.place('Chandelier_02', { pos: [x, H - 0.92, 7], collide: 'none' });

  // the dance hall: a stage, a mirror ball, chairs along the walls
  b.box([20.5, 0, 2], [24, 0.45, 12], planks, { walkSurface: true });
  const mirrorBall = new Mesh(
    scope.add(new SphereGeometry(0.32, 24, 16)),
    scope.add(
      new MeshStandardMaterial({
        map: scope.add(facetTexture()),
        metalness: 0.95,
        roughness: 0.15,
        emissive: 0x2a2a30,
      }),
    ),
  );
  mirrorBall.position.set(16.5, H - 0.6, 7);
  scene.add(mirrorBall);
  const rod = new Mesh(scope.add(new CylinderGeometry(0.008, 0.008, 0.3, 4)), counterWood.material);
  rod.position.set(16.5, H - 0.15, 7);
  scene.add(rod);
  const specks = new InstancedMesh(
    scope.add(new CircleGeometry(0.035, 6)),
    scope.add(new MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false, side: DoubleSide })),
    90,
  );
  specks.frustumCulled = false;
  scene.add(specks);
  for (let i = 0; i < 7; i++)
    chairs.push(
      { x: 11 + i * 1.3, y: 0, z: 0.5, rotY: 0 },
      { x: 11 + i * 1.3, y: 0, z: 13.5, rotY: Math.PI },
    );
  const chairSrc = props.gltf('painted_wooden_chair_02')?.scene;
  if (chairSrc) instanceModel(chairSrc, chairs, scene, { scope });

  // ───────── the corridor ─────────
  const C = CORRIDOR;
  b.floor(C.x0, C.z0, C.x1, C.z1, 0, carpet);
  b.ceiling(C.x0, C.z0, C.x1, C.z1, C.h, plaster);
  const doorHoles = [0, 1, 2, 3].map((i) => ({
    at: roomZ1(i) - 1.0 - C.z0,
    width: 0.9,
    bottom: 0,
    top: 2.1,
  }));
  wallTwoTone(b, C.x0, C.z0, C.x0, C.z1, C.h, panel, paper, doorHoles, 0.15);
  wallTwoTone(b, C.x1, C.z0, C.x1, C.z1, C.h, panel, paper, doorHoles, 0.15);
  props.place('ornate_mirror_01', { pos: [C.x0 + 0.08, 1.5, -5.6], rotY: Math.PI / 2, collide: 'none' });

  // ───────── the rooms ─────────
  const rooms: Room[] = [];
  const doorTex = scope.add(roomDoorTexture());
  const wardrobeAt: Matrix4[] = [];
  const glassAt: Array<{ x: number; y: number; z: number; fill: number; shot: boolean }> = [];
  /** Furniture footprints the chambermaid must walk around (x0, z0, x1, z1), cut from the nav below. */
  const navBlocks: Array<[number, number, number, number]> = [];
  ERAS.forEach((era, n) => {
    const side: -1 | 1 = n % 2 === 0 ? -1 : 1;
    const i = Math.floor(n / 2);
    const z1 = roomZ1(i);
    const z0 = z1 - 7;
    const x0 = side < 0 ? -7.2 : C.x1;
    const x1 = side < 0 ? C.x0 : 7.2;
    const outer = side < 0 ? x0 : x1;
    const inner = side < 0 ? x1 : x0;
    const zc = z1 - 1.0;
    const special: Partial<Record<Era, KitMaterial>> = {
      '1e40': frostMat,
      tallies: tallyMat,
      '1e100': voidMat,
    };
    const floorMat = special[era] ?? (era === '1e14' ? mossMat : carpet);
    const wallMat = special[era] ?? paper;
    b.floor(x0, z0, x1, z1, 0, floorMat);
    if (era !== '1e40') b.ceiling(x0, z0, x1, z1, ROOM_H, special[era] ?? plaster);
    else {
      // the roof is broken open over the table
      b.ceiling(x0, z0, x1, z0 + 2, ROOM_H, frostMat);
      b.ceiling(x0, z1 - 2, x1, z1, ROOM_H, frostMat);
    }
    b.wall(x0, z0, x1, z0, 0, ROOM_H, wallMat, 0.15);
    b.wall(x0, z1, x1, z1, 0, ROOM_H, wallMat, 0.15);
    b.wall(outer, z0, outer, z1, 0, ROOM_H, wallMat, 0.15);
    // inner face of the corridor wall, in the room's own finish
    b.wall(
      inner + side * 0.085,
      z0,
      inner + side * 0.085,
      z1,
      0,
      ROOM_H,
      wallMat,
      0.01,
      [{ at: zc - z0, width: 0.9, bottom: 0, top: 2.1 }],
      { collide: false },
    );
    // the door: hinged at the south jamb, opening into the room
    const doorObj = new Door(
      scope,
      game.world,
      [inner, 0, zc - 0.45],
      -Math.PI / 2,
      0.9,
      2.1,
      scope.add(new MeshStandardMaterial({ map: doorTex, roughness: 0.6 })),
      side < 0 ? -1 : 1,
    );
    scene.add(doorObj.pivot);
    const plate = new Mesh(
      scope.add(new PlaneGeometry(0.26, 0.12)),
      scope.add(
        new MeshStandardMaterial({ map: scope.add(platesTexture(era)), metalness: 0.6, roughness: 0.35 }),
      ),
    );
    // on the corridor side, beside the door
    plate.position.set(inner - side * 0.083, 1.6, zc + 0.75);
    plate.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(plate);

    const table = new Vector3((x0 + x1) / 2 + side * 0.4, 0, z0 + 3.4);
    const erasable: Object3D[] = [];
    const spots: HidingSpot[] = [];
    // wardrobe in the outer corner by the north wall, doors facing the room
    if (era !== '1e100' && era !== 'watching') {
      const wx = outer - side * 0.33;
      const wz = z0 + 0.95;
      wardrobeAt.push(
        new Matrix4().makeRotationY(side < 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(wx, 0, wz),
      );
      b.box([wx - 0.32, 0, wz - 0.62], [wx + 0.32, 2.0, wz + 0.62], null);
      navBlocks.push([wx - 0.32, wz - 0.62, wx + 0.32, wz + 0.62]);
      spots.push({
        id: `${era}:wardrobe`,
        kind: 'wardrobe',
        pos: new Vector3(wx, 0, wz),
        approach: new Vector3(wx - side * 0.95, 0, wz),
      });
    }
    // bed against the outer wall (you can slide under it)
    if (era !== '1e40' && era !== '1e100' && era !== 'watching') {
      const bx = outer - side * 0.55;
      const bz = z0 + 3.0;
      const bed = props.place('old_bed_frame', { pos: [bx, 0, bz], rotY: 0, collide: 'none' });
      if (bed && era === '1e14') tintAll(bed, mossMat.material);
      if (bed && era === 'tallies') tintAll(bed, tallyMat.material);
      b.box([bx - 0.46, 0.38, bz - 1.0], [bx + 0.46, 0.55, bz + 1.0], null);
      navBlocks.push([bx - 0.46, bz - 1.0, bx + 0.46, bz + 1.0]);
      spots.push({
        id: `${era}:bed`,
        kind: 'bed',
        pos: new Vector3(bx, 0, bz),
        approach: new Vector3(bx - side * 1.0, 0, bz),
      });
    }
    // the night itself, in this room's time
    const fixture: Fixture = { pos: table.clone().setY(2.2), color: 0xffd8a0, intensity: 2.6, distance: 7 };
    let key: Object3D | null = null;
    /** Two glasses standing on `t` (drawn together with every other room's glasses). */
    const two = (fill: number, t: Object3D | null, fallback: number, shot = false) => {
      for (const d of [-0.22, 0.22]) {
        const x = table.x + d;
        const z = table.z + (d > 0 ? 0.1 : -0.12);
        glassAt.push({ x, y: topOf(t, x, z, fallback), z, fill, shot });
      }
    };
    switch (era) {
      case '1906': {
        const t = props.place('WoodenTable_01', { pos: [table.x, 0, table.z], rotY: 0.05 });
        const c1 = props.place('WoodenChair_01', {
          pos: [table.x, 0, table.z - 0.75],
          rotY: 0,
          collide: 'none',
        });
        const c2 = props.place('WoodenChair_01', {
          pos: [table.x, 0, table.z + 0.75],
          rotY: Math.PI,
          collide: 'none',
        });
        const lampTop = topOf(t, table.x - 0.3, table.z + 0.15, 0.552);
        const lamp = props.place('vintage_oil_lamp', {
          pos: [table.x - 0.3, lampTop, table.z + 0.15],
          rotY: 0.4,
          collide: 'none',
        });
        erasable.push(...[c1, c2].filter(isObj));
        two(0.7, t, 0.552);
        if (lamp) erasable.push(lamp);
        fixture.color = 0xffb060;
        fixture.intensity = 2.2;
        fixture.flicker = 4;
        fixture.pos.set(table.x - 0.3, lampTop + 0.49, table.z + 0.15);
        key = keyObject(scope);
        key.position.set(
          table.x + 0.35,
          topOf(t, table.x + 0.35, table.z - 0.2, 0.552) + 0.004,
          table.z - 0.2,
        );
        break;
      }
      case '1986': {
        // (at full size its top stood a metre high, over the chairs, hiding what lay on it)
        const t = props.place('round_wooden_table_01', { pos: [table.x, 0, table.z], rotY: 0, scale: 0.79 });
        const c1 = props.place('dining_chair_02', {
          pos: [table.x, 0, table.z - 0.8],
          rotY: 0,
          collide: 'none',
        });
        const c2 = props.place('dining_chair_02', {
          pos: [table.x, 0, table.z + 0.8],
          rotY: Math.PI,
          collide: 'none',
        });
        const deck = props.place('portable_cassette_player', {
          pos: [table.x + 0.25, topOf(t, table.x + 0.25, table.z, 0.79), table.z],
          rotY: 1.2,
          collide: 'none',
        });
        erasable.push(...[c1, c2, deck].filter(isObj));
        two(0.5, t, 0.79);
        const ash = new Mesh(
          scope.add(new CylinderGeometry(0.07, 0.06, 0.03, 12)),
          scope.add(new MeshStandardMaterial({ color: 0x8a8a90, metalness: 0.6, roughness: 0.4 })),
        );
        ash.position.set(
          table.x - 0.2,
          topOf(t, table.x - 0.2, table.z + 0.05, 0.79) + 0.015,
          table.z + 0.05,
        );
        scene.add(ash);
        erasable.push(ash);
        // a low cabinet under the television
        const cx0 = Math.min(outer - side * 0.05, outer - side * 0.6);
        const cx1 = Math.max(outer - side * 0.05, outer - side * 0.6);
        // (clear of the bed's foot, which it used to cut into)
        b.box([cx0, 0, z1 - 2.95], [cx1, 0.9, z1 - 1.75], counterWood);
        navBlocks.push([cx0, z1 - 2.95, cx1, z1 - 1.75]);
        fixture.color = 0xffc890;
        break;
      }
      case '2026': {
        const t = props.place('WoodenTable_03', { pos: [table.x, 0, table.z], rotY: 0 });
        const c1 = props.place('painted_wooden_chair_02', {
          pos: [table.x, 0, table.z - 0.75],
          rotY: 0,
          collide: 'none',
        });
        const c2 = props.place('painted_wooden_chair_02', {
          pos: [table.x, 0, table.z + 0.75],
          rotY: Math.PI,
          collide: 'none',
        });
        erasable.push(...[c1, c2].filter(isObj));
        two(0.85, t, 0.832);
        const wheel = new Mesh(
          scope.add(new CircleGeometry(0.4, 32)),
          scope.add(
            new MeshStandardMaterial({
              map: scope.add(wheelSignTexture()),
              transparent: true,
              roughness: 0.7,
            }),
          ),
        );
        wheel.position.set(outer - side * 0.09, 1.7, table.z);
        wheel.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(wheel);
        erasable.push(wheel);
        break;
      }
      case '1e14': {
        const t = props.place('WoodenTable_01', { pos: [table.x, 0, table.z], rotY: -0.1 });
        const c1 = props.place('painted_wooden_chair_02', {
          pos: [table.x, 0, table.z - 0.75],
          rotY: 0.3,
          collide: 'none',
        });
        if (t) tintAll(t, mossMat.material);
        if (c1) tintAll(c1, mossMat.material);
        two(0, t, 0.552);
        mushrooms(scope, scene, table, x0, x1, z0, z1, (x, z) => topOf(t, x, z, 0));
        const stand = props.place('painted_wooden_nightstand', {
          pos: [outer - side * 0.35, 0, z0 + 4.5],
          rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        });
        if (stand) tintAll(stand, mossMat.material);
        fixture.color = 0xff3a1a;
        fixture.intensity = 1.6;
        fixture.distance = 6;
        key = keyObject(scope);
        key.position.set(
          outer - side * 0.35,
          topOf(stand, outer - side * 0.35, z0 + 4.5, 0.621) + 0.004,
          z0 + 4.5,
        );
        break;
      }
      case '1e40': {
        const t = props.place('WoodenTable_01', { pos: [table.x, -0.08, table.z], rotY: 0.6, rotZ: 0.12 });
        if (t) tintAll(t, frostMat.material);
        two(0, t, 0.47);
        fixture.color = 0x9ab8ff;
        fixture.intensity = 1.6;
        fixture.pos.set(table.x, 4, table.z);
        break;
      }
      case '1e100': {
        const t = props.place('WoodenTable_03', { pos: [table.x, 0, table.z], rotY: 0 });
        two(0, t, 0.832, true);
        fixture.color = 0x8090a0;
        fixture.intensity = 0.5;
        fixture.distance = 3;
        fixture.pos.set(table.x, 1.6, table.z);
        break;
      }
      case 'tallies': {
        const t = props.place('WoodenTable_03', { pos: [table.x, 0, table.z], rotY: 0 });
        if (t) tintAll(t, tallyMat.material);
        two(0.2, t, 0.832);
        fixture.color = 0xfff0d0;
        fixture.intensity = 2;
        key = keyObject(scope);
        key.position.set(outer - side * 0.33 + side * -0.36, 1.25, z0 + 0.95 + 0.3);
        key.rotation.z = Math.PI / 2;
        break;
      }
      case 'watching': {
        const t = props.place('WoodenTable_03', { pos: [table.x, 0, table.z], rotY: 0 });
        props.place('painted_wooden_chair_02', {
          pos: [table.x, 0, table.z - 0.75],
          rotY: 0,
          collide: 'none',
        });
        props.place('painted_wooden_chair_02', {
          pos: [table.x, 0, table.z + 0.75],
          rotY: Math.PI,
          collide: 'none',
        });
        two(0.85, t, 0.832);
        fixture.color = 0xffd49a;
        fixture.intensity = 2.4;
        break;
      }
    }
    if (key) scene.add(key);
    rooms.push({
      era,
      side,
      x0,
      x1,
      z0,
      z1,
      door: new Vector3(inner, 0, zc),
      doorObj,
      table,
      stand: new Vector3(table.x - side * 1.2, 0, table.z + 1.2),
      spots,
      erasable,
      fixture,
      key,
    });
  });

  // all wardrobes in two draws: open-fronted bodies and louvred doors
  const bodies: BufferGeometry[] = [];
  const doors: BufferGeometry[] = [];
  for (const m of wardrobeAt) {
    bodies.push(openBox(1.2, 2.0, 0.6).applyMatrix4(m));
    doors.push(new PlaneGeometry(1.14, 1.8).translate(0, 1.0, 0.3).applyMatrix4(m));
  }
  if (bodies.length) {
    const inside = scope.add(counterWood.material.clone());
    inside.side = DoubleSide;
    scene.add(new Mesh(scope.add(mergeGeometries(bodies)!), inside));
    scene.add(
      new Mesh(
        scope.add(mergeGeometries(doors)!),
        scope.add(
          new MeshStandardMaterial({
            map: scope.add(louvreTexture()),
            transparent: true,
            alphaTest: 0.5,
            side: DoubleSide,
          }),
        ),
      ),
    );
    bodies.forEach((g) => g.dispose());
    doors.forEach((g) => g.dispose());
  }
  // every glass on every table: one draw for the glass, one for what is left in it
  const mugGeo = scope.add(new CylinderGeometry(0.042, 0.036, 0.15, 14, 1, true).translate(0, 0.075, 0));
  const beerGeo = scope.add(new CylinderGeometry(0.038, 0.033, 1, 12).translate(0, 0.5, 0));
  const mugs = new InstancedMesh(mugGeo, tw.glass, glassAt.length);
  const beers = new InstancedMesh(beerGeo, tw.beer, glassAt.length);
  glassAt.forEach((gl, i) => {
    const sc = gl.shot ? 0.45 : 1;
    mugs.setMatrixAt(i, new Matrix4().makeScale(sc, sc, sc).setPosition(gl.x, gl.y, gl.z));
    beers.setMatrixAt(
      i,
      new Matrix4()
        .makeScale(sc, Math.max(0.0001, gl.fill * 0.13) * sc, sc)
        .setPosition(gl.x, gl.y + 0.004, gl.z),
    );
  });
  scene.add(mugs, beers);

  // the watching room: Ežo looks up from the table; the one with his back to the door is you
  const wroom = rooms.find((r) => r.era === 'watching')!;
  let watcher: Character | null = null;
  const eg = props.gltf('ezo');
  if (eg) {
    watcher = new Character(eg);
    watcher.pose = 'sit';
    watcher.root.position.set(wroom.table.x, -0.5 + 0.02, wroom.table.z - 0.7);
    watcher.root.rotation.y = 0;
    scene.add(watcher.root);
    watcher.holdOnTable(tw.mug(0.6), 0.834);
  }
  const jg = props.gltf('jano');
  let me: Character | null = null;
  if (jg) {
    me = new Character(jg);
    me.pose = 'sit';
    me.root.position.set(wroom.table.x, -0.5 + 0.02, wroom.table.z + 0.7);
    me.root.rotation.y = Math.PI;
    const shade = scope.add(new MeshStandardMaterial({ color: 0x1a1816, roughness: 0.9 }));
    me.model.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = shade;
    });
    scene.add(me.root);
    me.update(5, 0); // settle into the pose once; he never moves
  }
  // the black hole over the broken roof of 10⁴⁰
  const broken = rooms.find((r) => r.era === '1e40')!;
  const blackHole = new Group();
  const disc = new Mesh(
    scope.add(new CircleGeometry(5, 48)),
    scope.add(new MeshBasicMaterial({ color: 0x000000 })),
  );
  const ring = new Mesh(
    scope.add(new RingGeometry(5.2, 9, 64)),
    scope.add(
      new MeshBasicMaterial({
        map: scope.add(accretionTexture()),
        transparent: true,
        side: DoubleSide,
        toneMapped: false,
      }),
    ),
  );
  ring.rotation.x = -1.1;
  blackHole.add(ring, disc);
  blackHole.position.set(broken.table.x, 26, broken.table.z - 2);
  blackHole.lookAt(broken.table.x, 0, broken.table.z);
  scene.add(blackHole);
  const voidSky = new Mesh(
    scope.add(new PlaneGeometry(30, 30)),
    scope.add(new MeshBasicMaterial({ color: 0x020206, side: DoubleSide })),
  );
  voidSky.rotation.x = Math.PI / 2;
  voidSky.position.set(broken.table.x, 40, broken.table.z);
  scene.add(voidSky);

  // ───────── the salónik ─────────
  const S = SALON;
  b.floor(S.x0, S.z0, S.x1, S.z1, 0, planks);
  b.ceiling(S.x0, S.z0, S.x1, S.z1, S.h, plaster);
  wallTwoTone(b, S.x0, S.z0, S.x1, S.z0, S.h, panel, paper, [{ at: 5, width: 2.2, bottom: 0.8, top: 2.5 }]);
  wallTwoTone(b, S.x0, S.z0, S.x0, S.z1, S.h, panel, paper);
  wallTwoTone(b, S.x1, S.z0, S.x1, S.z1, S.h, panel, paper);
  wallTwoTone(b, S.x0, S.z1, S.x1, S.z1, S.h, panel, paper, [{ at: 5, width: 1.0, bottom: 0, top: 2.2 }]);
  const salonDoor = new Door(
    scope,
    game.world,
    [-0.5, 0, S.z1],
    0,
    1.0,
    2.2,
    scope.add(new MeshStandardMaterial({ map: scope.add(salonDoorTexture()), roughness: 0.5 })),
    1,
  );
  salonDoor.locked = true;
  scene.add(salonDoor.pivot);
  const salonWindow = new Mesh(scope.add(new PlaneGeometry(2.2, 1.7)), glassMat);
  salonWindow.position.set(0, 1.65, S.z0 - 0.02);
  scene.add(salonWindow);
  b.box([-1.1, 0, S.z0 - 0.1], [1.1, 0.8, S.z0 + 0.1], null);
  // the dying fire
  b.box([S.x1 - 0.6, 0, -45.4], [S.x1, 1.3, -42.6], brick);
  b.box([S.x1 - 0.65, 1.3, -45.6], [S.x1, 1.42, -42.4], counterWood);
  b.box([S.x1 - 0.4, 0.95, -45.4], [S.x1, 2.9, -42.6], brick);
  const hearth = new Mesh(
    scope.add(new PlaneGeometry(1.6, 0.8)),
    scope.add(new MeshBasicMaterial({ color: 0x050302 })),
  );
  hearth.position.set(S.x1 - 0.605, 0.5, -44);
  hearth.rotation.y = -Math.PI / 2;
  scene.add(hearth);
  const embers = new Mesh(
    scope.add(new PlaneGeometry(1.2, 0.32)),
    scope.add(
      new MeshBasicMaterial({ map: scope.add(emberTexture()), transparent: true, toneMapped: false }),
    ),
  );
  embers.position.set(S.x1 - 0.63, 0.2, -44);
  embers.rotation.y = -Math.PI / 2;
  scene.add(embers);
  // what is left of the flames
  const flame = new Mesh(
    scope.add(new PlaneGeometry(0.7, 0.55)),
    scope.add(
      new MeshBasicMaterial({
        map: scope.add(flameTexture()),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: AdditiveBlending,
      }),
    ),
  );
  flame.position.set(S.x1 - 0.65, 0.45, -44);
  flame.rotation.y = -Math.PI / 2;
  scene.add(flame);
  embers.userData.flame = flame;
  const fireLight: Fixture = {
    pos: new Vector3(S.x1 - 1.0, 0.6, -44),
    color: 0xff7a2a,
    intensity: 4.5,
    distance: 9,
    flicker: 6,
  };
  // two chairs by the fire; Ežo in the far one, facing the door
  const EZO_YAW = -0.47;
  props.place('mid_century_lounge_chair', { pos: [2.6, 0, -45.2], rotY: EZO_YAW });
  props.place('mid_century_lounge_chair', { pos: [0.9, 0, -44.3], rotY: 1.9 });
  let ezo: Character | null = null;
  if (eg) {
    ezo = new Character(eg);
    ezo.pose = 'sit';
    ezo.armOnTable = false;
    ezo.root.position.set(2.6, -0.55, -45.2);
    ezo.root.rotation.y = EZO_YAW;
    scene.add(ezo.root);
  }

  // ───────── the chambermaid and her cart ─────────
  let maid: Character | null = null;
  const vg = props.gltf('vierka');
  if (vg) {
    maid = new Character(vg);
    maid.pose = 'stand';
    maid.armOnTable = false;
    maid.root.scale.set(0.95, 1.08, 0.95);
    const uniform = scope.add(new MeshStandardMaterial({ color: 0xb8c0c4, roughness: 0.8 }));
    maid.model.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = uniform;
    });
    // where the face should be, an oval wiped clean
    const blank = new Mesh(
      scope.add(new CircleGeometry(0.1, 20)),
      scope.add(new MeshBasicMaterial({ color: 0xf6f6f2 })),
    );
    blank.scale.set(0.8, 1.05, 1);
    maid.attach('Head', blank, [0, 0.08, 0.115]);
    scene.add(maid.root);
  }
  const cart = buildCart(scope);
  scene.add(cart);

  // ───────── light ─────────
  scene.background = new Color(0x0a0806);
  scene.fog = new FogExp2(0x120c08, 0.018);
  scene.add(new HemisphereLight(0xffe0b8, 0x3a2a1c, 0.6));
  scene.add(new AmbientLight(0x4a3a2a, 0.3));
  const ORANGE = 0xffb070;
  const fixtures: Fixture[] = [
    { pos: new Vector3(-5, 3.0, 5), color: ORANGE, intensity: 8, distance: 14 },
    { pos: new Vector3(5, 3.0, 5), color: ORANGE, intensity: 8, distance: 14 },
    { pos: new Vector3(0, 3.0, 11), color: ORANGE, intensity: 6, distance: 12 },
    { pos: new Vector3(-20.5, 2.6, 7), color: 0xffd8a0, intensity: 7, distance: 13 },
    { pos: new Vector3(-15.5, 2.6, 7), color: 0xffd8a0, intensity: 7, distance: 13 },
    { pos: new Vector3(14, 3.0, 7), color: 0xff6a8a, intensity: 4.5, distance: 11, flicker: 2 },
    { pos: new Vector3(19, 3.0, 7), color: 0x6a8aff, intensity: 4.5, distance: 11 },
    { pos: new Vector3(22, 2.4, 7), color: 0xffc070, intensity: 3.5, distance: 8 },
    ...[-4, -10, -16, -22, -28, -34, -39].map((z, k): Fixture => ({
      pos: new Vector3(0, 2.4, z),
      color: ORANGE,
      intensity: 3.4,
      distance: 8,
      flicker: k === 3 ? 8 : 0,
    })),
    fireLight,
    { pos: new Vector3(-3.5, 2.6, -44), color: 0xffc890, intensity: 2.6, distance: 7 },
    // the reception lamp
    { pos: new Vector3(5.8, 1.7, 1.2), color: 0xffd8a0, intensity: 3, distance: 6 },
    ...rooms.map((r) => r.fixture),
  ];
  // orange glass globes for the corridor lamps
  const globeMat = scope.add(
    new MeshStandardMaterial({ color: 0xffa860, emissive: 0xff8a30, emissiveIntensity: 1.2 }),
  );
  const globes = new InstancedMesh(scope.add(new SphereGeometry(0.12, 12, 8)), globeMat, 7);
  [-4, -10, -16, -22, -28, -34, -39].forEach((z, k) =>
    globes.setMatrixAt(k, new Matrix4().makeTranslation(0, C.h - 0.15, z)),
  );
  scene.add(globes);
  for (const [x, z] of [
    [-5, 5],
    [5, 5],
    [0, 11],
  ]) {
    const g = new Mesh(scope.add(new SphereGeometry(0.22, 16, 10)), globeMat);
    g.position.set(x!, H - 0.35, z!);
    scene.add(g);
  }

  // ───────── navigation (the chambermaid): ground floor, corridor, the rooms ─────────
  const nav = new NavGrid(100, 128, 0.5, -25, -49);
  nav.fillRect(-23.6, 0.4, 23.6, 13.6, Area.WALK);
  nav.fillRect(C.x0 + 0.3, C.z0 + 0.3, C.x1 - 0.3, 0.5, Area.WALK);
  for (const r of rooms) {
    nav.fillRect(r.x0 + 0.4, r.z0 + 0.4, r.x1 - 0.4, r.z1 - 0.4, Area.WALK);
    nav.fillRect(r.door.x - 0.7, r.door.z - 0.35, r.door.x + 0.7, r.door.z + 0.35, Area.WALK);
  }
  // what the rectangles above do not know: she walked through these
  const cut = (x0: number, z0: number, x1: number, z1: number) => nav.fillRect(x0, z0, x1, z1, 0, true);
  // the lobby's side walls, all but their wide openings to the restaurant and the dance hall
  for (const x of [LOBBY.x0, LOBBY.x1]) {
    cut(x - 0.5, LOBBY.z0, x + 0.5, LOBBY.z1);
    nav.fillRect(x - 0.5, 4.75, x + 0.5, 9.25, Area.WALK);
  }
  cut(2.8, 1.8, 8.7, 2.9); // reception counter
  cut(-5.0, 0, -4.0, 0.9); // grandfather clock
  cut(-7.4, 10.8, -4.6, 12.3); // lounge: sofa
  cut(-7.2, 8.4, -4.8, 10.4); // low table
  for (const x of [-8.2, -3.8]) cut(x - 0.5, 8.1, x + 0.5, 9.1); // lounge chairs
  for (const [x, z] of tables) cut(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
  // the rooms' tables are up to 1.8 m long (she walked through their ends)
  for (const r of rooms) cut(r.table.x - 0.95, r.table.z - 0.5, r.table.x + 0.95, r.table.z + 0.5);
  for (const [x0, z0, x1, z1] of navBlocks) cut(x0, z0, x1, z1);
  cut(20.3, 1.8, 24, 12.2); // the dance hall's stage (she sank into it)
  const patrol = [
    new Vector3(0, 0, -2),
    new Vector3(0, 0, -12),
    new Vector3(0, 0, -22),
    new Vector3(0, 0, -32),
    new Vector3(0, 0, -38.5),
    new Vector3(0, 0, -26),
    new Vector3(0, 0, -6),
    new Vector3(-3, 0, 4),
    new Vector3(3, 0, 6),
  ];

  return {
    rooms,
    nav,
    fixtures,
    salonDoor,
    ezo,
    watcher,
    me,
    maid,
    cart,
    tv: buildTv(
      scope,
      scene,
      props,
      rooms.find((r) => r.era === '1986')!,
    ),
    mirrorBall,
    specks,
    fire: { light: fireLight, embers },
    blackHole,
    guestbook,
    keyboardHooks,
    patrol,
    spots: {
      arrive: new Vector3(0, 0, 12.4),
      guestbook: guestbook.position.clone(),
      bell: bell.position.clone(),
      keyboard: keyboard.position.clone(),
      reception: new Vector3(4.6, 0, 3.6),
      clock: new Vector3(-4.4, 1.6, 0.5),
      restaurant: new Vector3(-18, 1.0, 7),
      dancehall: new Vector3(16.5, 1.4, 7),
      mirrorBall: mirrorBall.position.clone(),
      snowWindow: new Vector3(-5.5, 1.8, 14.0),
      salonDoor: new Vector3(0, 1.1, S.z1 + 0.05),
      salonInside: new Vector3(-1.5, 0, -42.5),
      salonWindow: salonWindow.position.clone(),
      ezoSeat: new Vector3(2.62, 0, -45.2),
      fire: new Vector3(S.x1 - 0.6, 0.6, -44),
    },
  };
}

function roomZ1(i: number): number {
  return -2 - 9 * i;
}

function isObj(o: Object3D | null): o is Object3D {
  return o !== null;
}

/** Brown panelling below 1.1 m, paper above, both faces. */
function wallTwoTone(
  b: RealityCtx['builder'],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h: number,
  low: KitMaterial,
  high: KitMaterial,
  holes: Array<{ at: number; width: number; bottom: number; top: number }> = [],
  t = 0.2,
): void {
  b.wall(ax, az, bx, bz, 0, 1.1, low, t, holes);
  b.wall(ax, az, bx, bz, 1.1, h, high, t, holes);
}

function canvasMat(
  scope: Scope,
  tex: CanvasTexture,
  uvScale: number,
  surface: KitMaterial['surface'],
  roughness: number,
): KitMaterial {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return {
    material: scope.add(new MeshStandardMaterial({ map: scope.add(tex), roughness })),
    uvScale,
    surface,
  };
}

function tintAll(o: Object3D, m: Material): void {
  o.traverse((c) => {
    if ((c as Mesh).isMesh) (c as Mesh).material = m;
  });
}

function keyObject(scope: Scope): Group {
  const key = new Group();
  const brass = scope.add(
    new MeshStandardMaterial({ color: 0xc8a040, metalness: 0.9, roughness: 0.25, emissive: 0x2a1e08 }),
  );
  const blade = new Mesh(scope.add(new BoxGeometry(0.075, 0.006, 0.016)), brass);
  blade.position.x = 0.035;
  const bow = new Mesh(scope.add(new CylinderGeometry(0.018, 0.018, 0.006, 16)), brass);
  const fob = new Mesh(
    scope.add(new CylinderGeometry(0.032, 0.032, 0.008, 8)),
    scope.add(new MeshStandardMaterial({ color: 0x6a2a1a, roughness: 0.5 })),
  );
  fob.position.x = -0.055;
  key.add(blade, bow, fob);
  key.name = 'salonKey';
  return key;
}

/** A box without its +z face (a wardrobe body, open where the doors are), base at y = 0. */
function openBox(w: number, h: number, d: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const idx = g.getIndex()!;
  // index order: +x, -x, +y, -y, +z, -z (6 indices each)
  const keep = Array.from(idx.array as ArrayLike<number>).filter((_, i) => i < 24 || i >= 30);
  g.setIndex(keep);
  g.clearGroups();
  return g;
}

function mushrooms(
  scope: Scope,
  scene: RealityCtx['scene'],
  table: Vector3,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  /** Where one on the table stands (the table's top there; the floor beside it). */
  tableTop: (x: number, z: number) => number,
): void {
  const stem = scope.add(new CylinderGeometry(0.012, 0.018, 1, 6));
  stem.translate(0, 0.5, 0);
  const cap = scope.add(new ConeGeometry(1, 0.6, 10));
  const stemMat = scope.add(new MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.8 }));
  const capMat = scope.add(new MeshStandardMaterial({ color: 0xc86a3a, roughness: 0.6, emissive: 0x3a1004 }));
  const N = 60;
  const stems = new InstancedMesh(stem, stemMat, N);
  const caps = new InstancedMesh(cap, capMat, N);
  let s = 17;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const onTable = i < 12;
    const x = onTable ? table.x + (r() - 0.5) * 1.2 : x0 + 0.3 + r() * (x1 - x0 - 0.6);
    const z = onTable ? table.z + (r() - 0.5) * 0.7 : z0 + 0.3 + r() * (z1 - z0 - 0.6);
    const y = onTable ? tableTop(x, z) : 0;
    const h = 0.05 + r() * 0.12;
    const capR = 0.025 + r() * 0.05;
    stems.setMatrixAt(i, new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(1, h, 1)));
    caps.setMatrixAt(i, new Matrix4().makeScale(capR, capR, capR).setPosition(x, y + h + capR * 0.25, z));
  }
  scene.add(stems, caps);
}

/** The housekeeping cart: frame, towels and a bucket, merged into three draws. */
function buildCart(scope: Scope): Group {
  const frameParts: BufferGeometry[] = [];
  const towelParts: BufferGeometry[] = [];
  for (const y of [0.15, 0.55, 0.95]) frameParts.push(new BoxGeometry(0.9, 0.03, 0.5).translate(0, y, 0));
  for (const [x, z] of [
    [-0.43, -0.23],
    [0.43, -0.23],
    [-0.43, 0.23],
    [0.43, 0.23],
  ] as const) {
    frameParts.push(new CylinderGeometry(0.012, 0.012, 1.0, 6).translate(x, 0.55, z));
    frameParts.push(new CylinderGeometry(0.05, 0.05, 0.03, 10).rotateZ(Math.PI / 2).translate(x, 0.05, z));
  }
  frameParts.push(new CylinderGeometry(0.015, 0.015, 0.5, 6).rotateZ(Math.PI / 2).translate(0, 1.0, -0.28));
  for (let i = 0; i < 6; i++)
    towelParts.push(
      new BoxGeometry(0.26, 0.08, 0.36).translate(-0.28 + (i % 3) * 0.28, 0.25 + Math.floor(i / 3) * 0.4, 0),
    );
  const g = new Group();
  const merge = (parts: BufferGeometry[]) => {
    const m = scope.add(mergeGeometries(parts.map((p) => p.toNonIndexed()))!);
    parts.forEach((p) => p.dispose());
    return m;
  };
  g.add(
    new Mesh(
      merge(frameParts),
      scope.add(new MeshStandardMaterial({ color: 0x8a8e90, metalness: 0.6, roughness: 0.4 })),
    ),
  );
  g.add(
    new Mesh(merge(towelParts), scope.add(new MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.95 }))),
  );
  const bucket = new Mesh(
    scope.add(new CylinderGeometry(0.13, 0.11, 0.26, 14, 1, true)),
    scope.add(new MeshStandardMaterial({ color: 0x3a6a9a, roughness: 0.5, side: DoubleSide })),
  );
  bucket.position.set(0.25, 1.1, 0);
  g.add(bucket);
  return g;
}

function buildTv(scope: Scope, scene: RealityCtx['scene'], props: Props, room: Room): HockeyTV {
  const x = room.side < 0 ? room.x0 + 0.5 : room.x1 - 0.5;
  const z = room.z1 - 2.35; // on the middle of its cabinet
  const rotY = room.side < 0 ? Math.PI / 2 : -Math.PI / 2;
  props.place('Television_01', { pos: [x, 0.9, z], rotY, collide: 'none' });
  const tv = new HockeyTV(scope, 0.37, 0.28);
  // the screen sits 0.236 in front of the set's origin, 0.24 up, 0.065 to the side
  const fwd = new Vector3(Math.sin(rotY), 0, Math.cos(rotY));
  const right = new Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
  tv.screen.position
    .set(x, 0.9 + 0.24, z)
    .addScaledVector(fwd, 0.236)
    .addScaledVector(right, -0.065);
  tv.screen.rotation.y = rotY;
  scene.add(tv.screen);
  return tv;
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

/** A 1970s hotel carpet: interlocking orange and brown circles on a dark ground. */
function carpetTexture(cols: [string, string, string, string]): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const [base, mid, light, dark] = cols;
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const cx = 64 + x * 128;
        const cy = 64 + y * 128;
        for (const [r, c] of [
          [60, dark],
          [48, mid],
          [34, light],
          [20, dark],
          [9, mid],
        ] as const) {
          g.fillStyle = c;
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    g.strokeStyle = dark;
    g.lineWidth = 4;
    for (let k = 0; k <= 256; k += 128) {
      g.beginPath();
      g.arc(k, k, 40, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(k, 256 - k, 40, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(0,0,0,${0.04 + ((i * 7) % 5) * 0.012})`;
      g.fillRect((i * 97) % 256, (i * 61) % 256, 1, 1);
    }
  });
}

/** Tally marks in groups of five, wall to wall. */
function tallyTexture(): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#d8d0bc';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#3a3026';
    g.lineWidth = 1.6;
    let s = 3;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let row = 0; row < 16; row++)
      for (let col = 0; col < 10; col++) {
        const x = col * 25.6 + 3 + r() * 2;
        const y = row * 16 + 2 + r() * 2;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.moveTo(x + k * 4.5, y);
          g.lineTo(x + k * 4.5 + r() * 1.2, y + 11);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(x - 2, y + 10);
        g.lineTo(x + 16, y + 1);
        g.stroke();
      }
  });
}

function snowPackTexture(): CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#e8eef6';
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(150,170,200,${0.15 + (i % 4) * 0.06})`;
      g.lineWidth = 2;
      g.beginPath();
      const y = (i * 37) % 128;
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
      g.stroke();
    }
  });
}

function brassDoorTexture(): CanvasTexture {
  return canvasTex(128, 228, (g) => {
    g.fillStyle = '#9a7a3a';
    g.fillRect(0, 0, 128, 228);
    g.fillStyle = '#6a5222';
    g.fillRect(62, 0, 4, 228);
    for (let y = 20; y < 228; y += 40) {
      g.strokeStyle = 'rgba(255,230,160,0.35)';
      g.strokeRect(10, y, 44, 28);
      g.strokeRect(74, y, 44, 28);
    }
  });
}

function keyboardTexture(): CanvasTexture {
  return canvasTex(256, 108, (g) => {
    g.fillStyle = '#3a2416';
    g.fillRect(0, 0, 256, 108);
    g.fillStyle = '#e8d8b0';
    g.font = "bold 9px 'IBM Plex Sans Condensed', Arial";
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 8; c++) {
        const x = 8 + c * 29;
        const y = 12 + r * 32;
        g.fillStyle = '#c8a050';
        g.beginPath();
        g.arc(x + 8, y, 2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e8d8b0';
        const label = r === 2 && c >= 5 ? 'SAL.' : String(100 + r * 100 + c + 1);
        g.fillText(label, x, y + 22);
      }
    g.fillStyle = '#e8c070';
    g.font = "bold 11px 'IBM Plex Sans Condensed', Arial";
    g.fillText('SALÓNIK', 160, 104);
  });
}

function guestbookTexture(): CanvasTexture {
  return canvasTex(256, 174, (g) => {
    g.fillStyle = '#efe6cc';
    g.fillRect(0, 0, 256, 174);
    g.fillStyle = '#c8b890';
    g.fillRect(126, 0, 4, 174);
    const rows = [
      ['1906', 'E. Kolesár'],
      ['1906', '—'],
      ['1986', 'E. Kolesár'],
      ['1986', '—'],
      ['2026', 'E. Kolesár'],
      ['2026', '—'],
      ['10¹⁴', 'E. Kolesár'],
      ['10¹⁴', '—'],
      ['10⁴⁰', 'E. K.'],
      ['10⁴⁰', '—'],
      ['10¹⁰⁰', 'E'],
    ];
    rows.forEach(([d, n], i) => {
      const col = i < 6 ? 0 : 1;
      const y = 20 + (i % 6) * 25;
      g.fillStyle = i % 2 ? '#3a2a6a' : '#1a3a2a';
      g.font = `${i % 2 ? 'italic ' : ''}13px 'IBM Plex Sans Condensed', Arial`;
      g.fillText(d!, 10 + col * 130, y);
      g.fillText(n!, 50 + col * 130, y);
    });
  });
}

function signTexture(text: string): CanvasTexture {
  return canvasTex(512, 88, (g) => {
    g.fillStyle = 'rgba(0,0,0,0)';
    g.clearRect(0, 0, 512, 88);
    g.fillStyle = '#c8a050';
    g.font = "bold 40px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 46);
  });
}

function facetTexture(): CanvasTexture {
  return canvasTex(128, 64, (g) => {
    for (let y = 0; y < 64; y += 4)
      for (let x = 0; x < 128; x += 4) {
        const v = 120 + (((x * 13 + y * 7) * 31) % 120);
        g.fillStyle = `rgb(${v},${v},${v + 8})`;
        g.fillRect(x, y, 3, 3);
      }
  });
}

function roomDoorTexture(): CanvasTexture {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#5a3a24';
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(20,10,4,0.5)';
    g.lineWidth = 3;
    g.strokeRect(12, 14, 104, 100);
    g.strokeRect(12, 132, 104, 110);
    g.fillStyle = '#c8a050';
    g.fillRect(100, 126, 16, 6);
  });
}

function salonDoorTexture(): CanvasTexture {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#4a2a1a';
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#c8a050';
    g.lineWidth = 2;
    g.strokeRect(10, 10, 108, 236);
    g.fillStyle = '#c8a050';
    g.font = "bold 16px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.fillText('SALÓNIK', 64, 60);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(104, 104 + i * 22, 6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** The plate on each room door: a year, a power of ten, tallies, or nothing at all. */
function platesTexture(era: Era): CanvasTexture {
  const label: Record<Era, string> = {
    '1906': '1906',
    '1986': '1986',
    '2026': '2026',
    '1e14': '10¹⁴',
    '1e40': '10⁴⁰',
    '1e100': '10¹⁰⁰',
    tallies: '卌',
    watching: '',
  };
  return canvasTex(128, 60, (g) => {
    g.fillStyle = '#c8a050';
    g.fillRect(0, 0, 128, 60);
    g.strokeStyle = '#8a6a2a';
    g.lineWidth = 3;
    g.strokeRect(3, 3, 122, 54);
    g.fillStyle = '#2a1a0a';
    g.font = "bold 30px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (era === 'tallies') {
      g.lineWidth = 3;
      g.strokeStyle = '#2a1a0a';
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(44 + k * 10, 14);
        g.lineTo(44 + k * 10, 46);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(38, 42);
      g.lineTo(90, 18);
      g.stroke();
    } else g.fillText(label[era], 64, 32);
  });
}

function wheelSignTexture(): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = '#5a3a1a';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(128, 128, 110, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 8;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(128, 128);
      g.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104);
      g.stroke();
    }
    g.fillStyle = '#5a3a1a';
    g.beginPath();
    g.arc(128, 128, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8d0a0';
    g.font = "bold 26px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.fillText('U KOLESA', 128, 240);
  });
}

function accretionTexture(): CanvasTexture {
  return canvasTex(256, 32, (g) => {
    const grd = g.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0, 'rgba(255,240,210,0.95)');
    grd.addColorStop(0.3, 'rgba(255,170,90,0.7)');
    grd.addColorStop(1, 'rgba(120,40,20,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 32);
  });
}

function flameTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 48, 2, 32, 40, 30);
    grd.addColorStop(0, 'rgba(255,220,140,0.9)');
    grd.addColorStop(0.4, 'rgba(255,120,30,0.55)');
    grd.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

function emberTexture(): CanvasTexture {
  return canvasTex(128, 24, (g) => {
    g.clearRect(0, 0, 128, 24);
    for (let i = 0; i < 40; i++) {
      const x = (i * 29) % 124;
      const y = 8 + ((i * 13) % 12);
      g.fillStyle = i % 3 ? 'rgba(255,90,20,0.9)' : 'rgba(255,190,80,0.9)';
      g.beginPath();
      g.arc(x + 2, y, 2 + (i % 3), 0, Math.PI * 2);
      g.fill();
    }
  });
}

function louvreTexture(): CanvasTexture {
  return canvasTex(64, 128, (g) => {
    g.fillStyle = '#4a2c18';
    g.fillRect(0, 0, 64, 128);
    g.clearRect(0, 0, 0, 0);
    for (let y = 8; y < 120; y += 7) g.clearRect(6, y, 52, 2);
    g.clearRect(31, 0, 2, 128);
  });
}

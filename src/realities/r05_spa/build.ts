import {
  AmbientLight,
  Box3,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  FogExp2,
} from 'three';
import type { Material, Object3D } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { RealityCtx } from '../../world/Reality.ts';
import type { KitMaterial } from '../../world/kit/Builder.ts';
import { Props } from '../../world/props.ts';
import { textTexture } from '../../world/proceduralTextures.ts';
import { instanceModel, type InstanceXform } from '../../world/instancing.ts';
import { Waters, type WaterBody } from '../../world/water.ts';
import type { Fixture } from '../../world/lightPool.ts';
import { Door } from '../../world/objects/door.ts';
import { Tableware } from '../../world/objects/tableware.ts';
import { Character } from '../../npc/Character.ts';
import { NavGrid, Area } from '../../sim/ai/nav/NavGrid.ts';
import { Layer } from '../../sim/physics/CollisionWorld.ts';
import { MOSAIC_COUNT, mosaicTexture } from './mosaic.ts';

/*
 * Layout (metres, y = 0 is the dry deck). You arrive in the north and go south (-z).
 *   entrance   x[-9,9]     z[0,16]      foot bath, ticket desk, lockers, the duck basket
 *   corridor   x[-1.6,1.6] z[-8,0]      changing cabins
 *   hall       x[-20,20]   z[-38,-8]    glass roof; pool x[-12.5,12.5] z[-29,-17]
 *              west deck x[-20,-12.5] is flooded ankle-deep; lifeguard chair on the east deck
 *   pump room  x[-30,-20]  z[-27,-17]    door in the hall's west wall at z -23
 *   dome       centre (0,-48) r 7        the warm round pool (Ežo), mosaics; passage z[-41,-38]
 *   diving     x[20,36]    z[-34,-12]    4 m deep pool x[23,33] z[-29,-19], springboard from the north
 */
export const LEVEL_FULL = -0.05;
export const LEVEL_DRAINED = -0.6;
export const POOL = { x0: -12.5, z0: -29, x1: 12.5, z1: -17 };
export const FLOOD = { x0: -20, z0: -29, x1: -12.5, z1: -17 };
export const FLOOD_FLOOR = -0.34;
export const HALL = { x0: -20, z0: -38, x1: 20, z1: -8 };
export const DOME = { x: 0, z: -48, r: 7, pool: 4 };
export const DIVE_POOL = { x0: 23, z0: -29, x1: 33, z1: -19 };
export const VORTEX = new Vector3(28, -0.1, -24);
export const BOARD_END = new Vector3(28, 0.9, -21.7);

export interface Spa {
  waters: Waters;
  pool: WaterBody;
  flood: WaterBody;
  thermal: WaterBody;
  diving: WaterBody;
  nav: NavGrid;
  fixtures: Fixture[];
  /** Lifeguard: seat (feet on the stand), the figure shown while he sits, the key on the stand. */
  chairSeat: Vector3;
  chairDive: Vector3;
  lifeguardFigure: Object3D | null;
  key: Mesh;
  /** Stepping stones over the flooded deck, solid only on absinthe. */
  stones: InstancedMesh;
  stonePositions: Vector3[];
  diveDoor: Door;
  vortex: Mesh;
  ezo: Character | null;
  ezoSeat: Vector3;
  steam: Sprite[];
  ducksInBasket: Object3D[];
  duckTemplate: Object3D | null;
  wanderPoints: Vector3[];
  /** Interaction anchors. */
  spots: Record<string, Vector3>;
  /** Water drips (positions for random plinks). */
  drips: Vector3[];
}

export async function buildSpa(ctx: RealityCtx): Promise<Spa> {
  const { game, scene, scope, builder: b, mats } = ctx;
  const props = new Props(game.loader, scene, scope, b);
  await props.load(
    [
      'rubber_duck_toy',
      'WetFloorSign_01',
      'lifebuoy',
      'plastic_monobloc_chair_01',
      'potted_plant_02',
      'mounted_fluorescent_lights',
      'painted_wooden_bench',
      'wall_clock',
      'jano',
      'ezo',
    ],
    (p) => ctx.progress(p * 0.6),
  );

  // ───────── materials ─────────
  const wallTile = mats.get('spaWall', {
    tex: 'long_white_tiles',
    proc: 'tiles',
    color: 0xeeeee6,
    uvScale: 1.6,
    surface: 'tile',
    tint: 0xf6f6f0,
    roughness: 0.55,
  });
  const poolTile = mats.get('poolTile', {
    tex: 'rounded_square_tiled_wall',
    proc: 'tiles',
    color: 0x5fc2bc,
    uvScale: 1.0,
    surface: 'tile',
    tint: 0x6fd0c8,
    roughness: 0.4,
  });
  const deck = mats.get('spaDeck', {
    tex: 'anti_skid_tiles',
    proc: 'tiles',
    color: 0xe6e2d8,
    uvScale: 1.2,
    surface: 'tile',
    tint: 0xf0ece4,
    roughness: 0.6,
  });
  const terrazzo = mats.get('spaTerrazzo', {
    tex: 'terrazzo_tiles',
    proc: 'terrazzo',
    color: 0xb8a890,
    uvScale: 2.2,
    surface: 'tile',
    roughness: 0.5,
  });
  const plaster = mats.get('spaCeiling', {
    tex: 'white_plaster_rough_01',
    proc: 'plaster',
    color: 0xe8e6de,
    uvScale: 3,
    surface: 'concrete',
  });
  const concrete = mats.get('pumpFloor', {
    tex: 'concrete_floor_worn_001',
    proc: 'concrete',
    color: 0x6a6862,
    uvScale: 2.5,
    surface: 'concrete',
  });
  const metal = mats.get('spaMetal', {
    proc: 'metal',
    color: 0x5a6266,
    uvScale: 1,
    surface: 'metal',
    metalness: 0.6,
    roughness: 0.45,
  });

  // soft room reflections for wet tiles and water
  const pmrem = new PMREMGenerator(game.renderer.renderer);
  const roomEnv = new RoomEnvironment();
  const env = scope.add(pmrem.fromScene(roomEnv, 0.04).texture);
  roomEnv.dispose();
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const room = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y1: number,
    wall: KitMaterial,
    floor: KitMaterial | null,
    doors: Partial<Record<'n' | 's' | 'w' | 'e', [number, number] | 'skip'>>,
    ceil: KitMaterial | null = plaster,
    doorTop = 2.4,
  ) => {
    if (floor) b.floor(x0, z0, x1, z1, 0, floor);
    if (ceil) b.ceiling(x0, z0, x1, z1, y1, ceil);
    const cut = (d: [number, number] | 'skip' | undefined, start: number) =>
      d && d !== 'skip'
        ? [{ at: Math.abs((d[0] + d[1]) / 2 - start), width: Math.abs(d[1] - d[0]), bottom: 0, top: doorTop }]
        : [];
    if (doors.n !== 'skip') b.wall(x0, z0, x1, z0, -0.5, y1, wall, 0.3, cut(doors.n, x0));
    if (doors.s !== 'skip') b.wall(x0, z1, x1, z1, -0.5, y1, wall, 0.3, cut(doors.s, x0));
    if (doors.w !== 'skip') b.wall(x0, z0, x0, z1, -0.5, y1, wall, 0.3, cut(doors.w, z0));
    if (doors.e !== 'skip') b.wall(x1, z0, x1, z1, -0.5, y1, wall, 0.3, cut(doors.e, z0));
  };
  /** A sunken basin: tiled floor at `floorY`, walls up to the deck. */
  const basin = (x0: number, z0: number, x1: number, z1: number, floorY: number) => {
    b.floor(x0, z0, x1, z1, floorY, poolTile);
    b.wall(x0, z0, x1, z0, floorY, 0, poolTile, 0.2);
    b.wall(x0, z1, x1, z1, floorY, 0, poolTile, 0.2);
    b.wall(x0, z0, x0, z1, floorY, 0, poolTile, 0.2);
    b.wall(x1, z0, x1, z1, floorY, 0, poolTile, 0.2);
  };
  /** Invisible kerb so nobody walks off the edge into deep water (thrown things fly over it). */
  const kerb = (x0: number, z0: number, x1: number, z1: number, y0 = 0) =>
    b.box(
      [Math.min(x0, x1) - 0.05, y0, Math.min(z0, z1) - 0.05],
      [Math.max(x0, x1) + 0.05, 0.6, Math.max(z0, z1) + 0.05],
      null,
    );

  // ───────── entrance hall ─────────
  room(-9, 0, 9, 16, 4.5, wallTile, null, { n: [-1.6, 1.6] });
  // terrazzo floor around the foot bath (x[-7.5,-2.5] z[11.5,15.5])
  b.floor(-9, 0, 9, 11.5, 0, terrazzo);
  b.floor(-9, 11.5, -7.5, 16, 0, terrazzo);
  b.floor(-2.5, 11.5, 9, 16, 0, terrazzo);
  b.floor(-7.5, 15.5, -2.5, 16, 0, terrazzo);
  basin(-7.5, 11.5, -2.5, 15.5, -0.3);
  // ticket desk
  b.box([3, 0, 11], [8, 1.1, 12], wallTile);
  b.box([3, 1.1, 10.9], [8, 1.16, 12.1], metal);
  // pipe outlet you arrive through, pouring into the foot bath
  const outletRing = new Mesh(scope.add(new TorusGeometry(0.42, 0.08, 10, 24)), metal.material);
  outletRing.position.set(-5, 0.75, 15.82);
  scene.add(outletRing);
  const outletDark = new Mesh(
    scope.add(new CircleGeometry(0.42, 24)),
    scope.add(new MeshBasicMaterial({ color: 0x050808 })),
  );
  outletDark.position.set(-5, 0.75, 15.83);
  outletDark.rotation.y = Math.PI;
  scene.add(outletDark);
  // lockers on the west wall
  const lockerMat = scope.add(
    new MeshStandardMaterial({ map: scope.add(lockerTexture()), roughness: 0.5, metalness: 0.3 }),
  );
  const lockers = new Mesh(scope.add(new BoxGeometry(0.5, 1.9, 7)), [
    lockerMat,
    lockerMat,
    metal.material,
    metal.material,
    lockerMat,
    lockerMat,
  ] as Material[]);
  lockers.position.set(-8.6, 0.95, 5.5);
  scene.add(lockers);
  b.box([-8.85, 0, 2], [-8.35, 1.9, 9], null);
  props.place('painted_wooden_bench', { pos: [-7.6, 0, 4], rotY: Math.PI / 2 });
  props.place('painted_wooden_bench', { pos: [-7.6, 0, 7], rotY: Math.PI / 2 });
  props.place('potted_plant_02', { pos: [8.2, 0, 15.2], scale: 1.6 });
  props.place('potted_plant_02', { pos: [-8.2, 0, 0.9], scale: 1.6 });
  props.place('wall_clock', { pos: [5.5, 2.9, 15.84], rotY: Math.PI, collide: 'none' });
  // vending machine "Utopenci"
  const vend = new Mesh(scope.add(new BoxGeometry(0.75, 1.9, 1.1)), [
    scope.add(new MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5 })),
    scope.add(
      new MeshStandardMaterial({
        map: scope.add(vendingTexture()),
        roughness: 0.25,
        emissive: 0x403020,
        emissiveIntensity: 0.6,
      }),
    ),
    scope.add(new MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5 })),
    scope.add(new MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5 })),
    scope.add(new MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5 })),
    scope.add(new MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.5 })),
  ] as Material[]);
  vend.position.set(8.45, 0.95, 6.6); // its decorated -x face looks into the room
  scene.add(vend);
  b.box([8.05, 0, 6.05], [8.85, 1.9, 7.15], null);
  // duck basket in the children's corner
  b.box([6.1, 0, 2.1], [6.9, 0.35, 2.9], wallTile);
  const duckSrc = props.gltf('rubber_duck_toy')?.scene ?? null;
  const ducksInBasket: Object3D[] = [];
  if (duckSrc)
    for (let i = 0; i < 3; i++) {
      const d = duckSrc.clone();
      d.scale.setScalar(0.55);
      d.position.set(6.3 + i * 0.2, 0.35, 2.4 + (i % 2) * 0.2);
      d.rotation.y = i * 1.7;
      scene.add(d);
      ducksInBasket.push(d);
    }

  // ───────── corridor with changing cabins ─────────
  room(-1.6, -8, 1.6, 0, 3, wallTile, deck, { n: [-1.6, 1.6], s: 'skip' });
  const cabinTex = scope.add(cabinDoorTexture());
  const cabinMat = scope.add(new MeshStandardMaterial({ map: cabinTex, roughness: 0.6 }));
  const cabinGeo = scope.add(new PlaneGeometry(0.85, 2.0));
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const m = new Mesh(cabinGeo, cabinMat);
      m.position.set(side * 1.44, 1.0, -1.2 - i * 1.6);
      m.rotation.y = -side * (Math.PI / 2);
      scene.add(m);
    }
  }
  props.place('WetFloorSign_01', { pos: [0.75, 0, -4.2], rotY: 0.6 });

  // ───────── the great hall ─────────
  // walls: north (door to the corridor), west (pump room door), east (diving hall door), south (dome)
  b.wall(-20, -8, 20, -8, -0.5, 9, wallTile, 0.3, [{ at: 20, width: 3.2, bottom: 0, top: 2.6 }]);
  b.wall(-20, -38, 20, -38, -0.5, 9, wallTile, 0.3, [{ at: 20, width: 3, bottom: 0, top: 2.6 }]);
  b.wall(-20, -38, -20, -8, FLOOD_FLOOR, 9, wallTile, 0.3, [{ at: 15, width: 2, bottom: 0, top: 2.4 }]);
  b.wall(20, -38, 20, -8, -0.5, 9, wallTile, 0.3, [{ at: 15, width: 2, bottom: 0, top: 2.4 }]);
  // decks
  b.floor(-20, -17, 20, -8, 0, deck); // north
  b.floor(-20, -38, 20, -29, 0, deck); // south
  b.floor(12.5, -29, 20, -17, 0, deck); // east
  b.floor(FLOOD.x0, FLOOD.z0, FLOOD.x1, FLOOD.z1, FLOOD_FLOOR, deck); // west, flooded
  // the pool: deep west end, shallow east end, steps down at the east
  b.floor(POOL.x0, POOL.z0, -2, POOL.z1, -2.35, poolTile);
  b.floor(-2, POOL.z0, POOL.x1, POOL.z1, -1.15, poolTile);
  b.wall(-2, POOL.z0, -2, POOL.z1, -2.35, -1.15, poolTile, 0.1);
  b.wall(POOL.x0, POOL.z0, POOL.x1, POOL.z0, -2.35, 0, poolTile, 0.2);
  b.wall(POOL.x0, POOL.z1, POOL.x1, POOL.z1, -2.35, 0, poolTile, 0.2);
  b.wall(POOL.x0, POOL.z0, POOL.x0, POOL.z1, -2.35, FLOOD_FLOOR, poolTile, 0.2);
  b.wall(POOL.x1, POOL.z0, POOL.x1, POOL.z1, -1.15, 0, poolTile, 0.2, [
    { at: 6.5, width: 3, bottom: -1.15, top: 0 },
  ]);
  b.stairs(10.5, -24, 3, 2, -1.15, 0, '+x', poolTile, 5);
  // kerbs: everywhere except the pool steps
  kerb(POOL.x0, POOL.z1, POOL.x1, POOL.z1); // north edge
  kerb(POOL.x0, POOL.z0, POOL.x1, POOL.z0); // south edge
  kerb(POOL.x0, POOL.z0, POOL.x0, POOL.z1, FLOOD_FLOOR); // flooded deck / deep end
  kerb(POOL.x1, POOL.z0, POOL.x1, -24);
  kerb(POOL.x1, -21, POOL.x1, POOL.z1);
  // the lane rope keeps waders out of the deep end
  b.box([-2.05, -1.15, POOL.z0], [-1.95, 0.6, POOL.z1], null);
  const rope = new InstancedMesh(
    scope.add(new SphereGeometry(0.07, 8, 6)),
    scope.add(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })),
    100,
  );
  for (let i = 0; i < 100; i++) {
    rope.setMatrixAt(i, new Matrix4().makeTranslation(-2, LEVEL_FULL + 0.02, POOL.z0 + 0.06 + i * 0.12));
    rope.setColorAt(i, new Color(Math.floor(i / 4) % 2 ? 0xd02020 : 0xf0f0f0));
  }
  scene.add(rope);
  // underwater lamps in the pool walls give the water its glow
  const lampMat = scope.add(new MeshBasicMaterial({ color: 0xbff8f0, toneMapped: false }));
  const lampGeo = scope.add(new PlaneGeometry(0.4, 0.25));
  for (const x of [-9, -3, 3, 9]) {
    for (const [z, rotY] of [
      [POOL.z1 - 0.11, Math.PI],
      [POOL.z0 + 0.11, 0],
    ] as const) {
      const l = new Mesh(lampGeo, lampMat);
      l.position.set(x, x < -2 ? -1.3 : -0.75, z);
      l.rotation.y = rotY;
      scene.add(l);
    }
  }
  // glass roof: frames and snowed-over panes
  const paneMat = scope.add(
    new MeshBasicMaterial({ map: scope.add(snowGlassTexture()), color: 0xc8d4dc, side: DoubleSide }),
  );
  const pane = new Mesh(scope.add(new PlaneGeometry(40, 30)), paneMat);
  pane.rotation.x = Math.PI / 2;
  pane.position.set(0, 9, -23);
  scene.add(pane);
  const beamGeo = scope.add(new BoxGeometry(0.18, 0.3, 30));
  const beams = new InstancedMesh(beamGeo, metal.material, 9);
  for (let i = 0; i < 9; i++) beams.setMatrixAt(i, new Matrix4().makeTranslation(-20 + i * 5, 8.85, -23));
  scene.add(beams);
  const beamGeo2 = scope.add(new BoxGeometry(40, 0.3, 0.18));
  const beams2 = new InstancedMesh(beamGeo2, metal.material, 7);
  for (let i = 0; i < 7; i++) beams2.setMatrixAt(i, new Matrix4().makeTranslation(0, 8.85, -38 + i * 5));
  scene.add(beams2);
  // columns along the long decks
  for (const x of [-15, -10, -5, 0, 5, 10, 15])
    for (const z of [-15.5, -30.5]) b.box([x - 0.3, 0, z - 0.3], [x + 0.3, 9, z + 0.3], wallTile);
  // deck furniture
  const chairX: InstanceXform[] = [-14, -12.5, -11, 6, 7.5, 9].map((x, i) => ({
    x,
    y: 0,
    z: -9.2,
    rotY: Math.PI + (i % 2) * 0.2,
  }));
  const monobloc = props.gltf('plastic_monobloc_chair_01')?.scene;
  if (monobloc) instanceModel(monobloc, chairX, scene, { scope });
  for (const c of chairX) b.box([c.x - 0.3, 0, c.z - 0.3], [c.x + 0.3, 0.85, c.z + 0.3], null);
  for (const [x, z, r] of [
    [-19.8, -12, Math.PI / 2],
    [19.8, -14, -Math.PI / 2],
    [-6, -37.8, 0],
    [6, -37.8, 0],
  ] as const)
    props.place('lifebuoy', { pos: [x, 1.7, z], rotY: r, collide: 'none' });
  props.place('potted_plant_02', { pos: [-19, 0, -9], scale: 1.8 });
  props.place('potted_plant_02', { pos: [19, 0, -9], scale: 1.8 });
  props.place('potted_plant_02', { pos: [-19, 0, -37], scale: 1.8 });
  props.place('potted_plant_02', { pos: [19, 0, -37], scale: 1.8 });
  // signs
  const sign = (
    lines: string[],
    w: number,
    h: number,
    pos: [number, number, number],
    rotY: number,
    bg = '#f4f2ea',
    fg = '#1a3a6a',
  ) => {
    const mat = scope.add(
      new MeshStandardMaterial({
        map: scope.add(
          textTexture(lines, { width: 1024, height: Math.round((1024 * h) / w), bg, fg, size: 64 }),
        ),
        roughness: 0.6,
      }),
    );
    const m = new Mesh(scope.add(new PlaneGeometry(w, h)), mat);
    m.position.set(...pos);
    m.rotation.y = rotY;
    scene.add(m);
  };
  sign(['KÚPELE ZDRAVIE'], 4.2, 0.7, [0, 3.6, 15.84], Math.PI, '#1a3a6a', '#f4f2ea');
  sign(['POKLADŇA'], 1.6, 0.4, [5.5, 2.1, 12.06], 0);
  sign(['VSTUP DO BAZÉNOV ↓'], 2.4, 0.45, [0, 2.75, 0.16], 0);
  sign(['PLÁVANIE LEN POD DOZOROM PLAVČÍKA'], 5.5, 0.6, [-9, 4.2, -8.16], Math.PI);
  sign(['ZÁKAZ SKÁKANIA'], 2.6, 0.5, [8, 3.2, -8.16], Math.PI, '#f4f2ea', '#a01818');
  sign(['VSTUP DO BAZÉNA', 'LEN PO SCHODOCH'], 1.8, 0.6, [19.84, 1.9, -19], -Math.PI / 2);
  sign(['STROJOVŇA'], 1.8, 0.4, [-19.84, 2.75, -23], Math.PI / 2, '#f4f2ea', '#202020');
  sign(['SKOKANSKÝ BAZÉN'], 2.4, 0.4, [19.84, 2.75, -23], -Math.PI / 2);
  sign(['TERMÁLNY BAZÉN 36 °C'], 2.8, 0.45, [0, 2.95, -37.84], 0);

  // ───────── lifeguard chair on the east deck ─────────
  const white = scope.add(new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.2 }));
  const leg = scope.add(new CylinderGeometry(0.035, 0.035, 1.5, 8));
  const chairBase = new Vector3(14.2, 0, -25.5);
  for (const [dx, dz] of [
    [-0.35, -0.35],
    [0.35, -0.35],
    [-0.35, 0.35],
    [0.35, 0.35],
  ] as const) {
    const l = new Mesh(leg, white);
    l.position.set(chairBase.x + dx, 0.75, chairBase.z + dz);
    scene.add(l);
  }
  const stand = new Mesh(scope.add(new BoxGeometry(0.9, 0.06, 0.9)), white);
  stand.position.set(chairBase.x, 1.5, chairBase.z);
  scene.add(stand);
  for (let i = 1; i < 5; i++) {
    const rung = new Mesh(scope.add(new BoxGeometry(0.04, 0.04, 0.7)), white);
    rung.position.set(chairBase.x + 0.35, i * 0.3, chairBase.z);
    scene.add(rung);
  }
  b.box([chairBase.x - 0.45, 0, chairBase.z - 0.45], [chairBase.x + 0.45, 1.55, chairBase.z + 0.45], null);
  let lifeguardFigure: Object3D | null = null;
  const jano = props.gltf('jano')?.scene;
  if (jano) {
    lifeguardFigure = jano.clone();
    const pale = scope.add(
      new MeshPhysicalMaterial({
        color: 0xd0d8d6,
        roughness: 0.35,
        clearcoat: 1,
        clearcoatRoughness: 0.2,
        sheen: 0.4,
      }),
    );
    lifeguardFigure.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = pale;
    });
    lifeguardFigure.position.set(chairBase.x, 1.53, chairBase.z);
    lifeguardFigure.rotation.y = -Math.PI / 2;
    scene.add(lifeguardFigure);
  }
  const key = new Mesh(
    scope.add(new BoxGeometry(0.03, 0.09, 0.012)),
    scope.add(new MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.3 })),
  );
  key.position.set(chairBase.x - 0.38, 1.0, chairBase.z + 0.1);
  scene.add(key);

  // ───────── absinthe stepping stones over the flooded deck ─────────
  const stonePositions = [
    [-15.4, -17.7],
    [-16.1, -18.6],
    [-16.7, -19.5],
    [-17.3, -20.4],
    [-17.9, -21.3],
    [-18.5, -22.2],
    [-19.1, -23.0],
  ].map(([x, z]) => new Vector3(x, 0, z));
  const stoneMat = scope.add(
    new MeshStandardMaterial({
      color: 0x9ff07a,
      emissive: 0x3a8a20,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.85,
      roughness: 0.3,
    }),
  );
  const stones = new InstancedMesh(
    scope.add(new BoxGeometry(0.75, 0.08, 0.75)),
    stoneMat,
    stonePositions.length,
  );
  stonePositions.forEach((p, i) => {
    stones.setMatrixAt(i, new Matrix4().makeTranslation(p.x, -0.04, p.z));
    b.box([p.x - 0.38, -0.4, p.z - 0.38], [p.x + 0.38, 0, p.z + 0.38], null, { layer: Layer.ABSINTHE });
  });
  stones.visible = false;
  scene.add(stones);

  // ───────── pump room ─────────
  room(-30, -27, -20, -17, 4, wallTile, concrete, { e: 'skip' });
  for (const [x, z] of [
    [-27, -24.5],
    [-27, -19.5],
  ] as const) {
    const pump = new Mesh(scope.add(new CylinderGeometry(0.7, 0.7, 1.6, 18)), metal.material);
    pump.position.set(x, 0.8, z);
    scene.add(pump);
    b.box([x - 0.75, 0, z - 0.75], [x + 0.75, 1.6, z + 0.75], null);
  }
  const panel = new Mesh(
    scope.add(new PlaneGeometry(3, 1.6)),
    scope.add(new MeshStandardMaterial({ map: scope.add(pumpPanelTexture()), roughness: 0.6 })),
  );
  panel.position.set(-29.84, 1.7, -22);
  panel.rotation.y = Math.PI / 2;
  scene.add(panel);

  // ───────── passage and the thermal dome ─────────
  room(-1.5, -42, 1.5, -38, 3, wallTile, deck, { n: 'skip', s: 'skip' });
  // dome: round tiled wall, a cupola with a skylight, a ring of deck around the round pool
  const D = DOME;
  const ringDeck = new Mesh(scope.add(worldUvRing(D.pool, D.r, 64, deck.uvScale)), deck.material);
  ringDeck.rotation.x = -Math.PI / 2;
  ringDeck.position.set(D.x, 0, D.z);
  ringDeck.receiveShadow = true;
  scene.add(ringDeck);
  // walkable ring (collision): the whole disc at deck height, a kerb around the pool keeps you out
  b.box([D.x - D.r, -0.2, D.z - D.r], [D.x + D.r, 0, D.z + D.r], null);
  b.surfaces.push({
    box: new Box3(new Vector3(D.x - D.r, -0.2, D.z - D.r), new Vector3(D.x + D.r, 0.4, D.z + D.r)),
    surface: 'tile',
  });
  const GAP = Math.asin(1.5 / D.r); // the passage opening, centred on north (+z)
  const segs = 64;
  const segLen = 2 * (D.r + 0.15) * Math.sin(Math.PI / segs) + 0.08;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2; // angle from +x towards +z
    const fromNorth = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    if (fromNorth < GAP + Math.PI / segs) continue;
    const wx = D.x + Math.cos(a) * (D.r + 0.15);
    const wz = D.z + Math.sin(a) * (D.r + 0.15);
    b.box([wx - segLen / 2, 0, wz - 0.15], [wx + segLen / 2, 4.5, wz + 0.15], null, {
      rotY: -a + Math.PI / 2,
    });
  }
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const kx = D.x + Math.cos(a) * D.pool;
    const kz = D.z + Math.sin(a) * D.pool;
    b.box([kx - 0.45, 0, kz - 0.06], [kx + 0.45, 0.6, kz + 0.06], null, { rotY: -a + Math.PI / 2 });
  }
  const domeWall = new Mesh(
    scope.add(worldUvCylinder(D.r, 4.5, 64, wallTile.uvScale, GAP)),
    wallTile.material,
  );
  domeWall.position.set(D.x, 0, D.z);
  scene.add(domeWall);
  const basinWall = new Mesh(
    scope.add(worldUvCylinder(D.pool, 1.25, 48, poolTile.uvScale, 0)),
    poolTile.material,
  );
  basinWall.position.set(D.x, -1.25, D.z);
  scene.add(basinWall);
  const basinFloor = new Mesh(scope.add(worldUvRing(0, D.pool, 48, poolTile.uvScale)), poolTile.material);
  basinFloor.rotation.x = -Math.PI / 2;
  basinFloor.position.set(D.x, -1.25, D.z);
  scene.add(basinFloor);
  const bench = new Mesh(
    scope.add(worldUvRing(D.pool - 0.55, D.pool, 48, poolTile.uvScale)),
    poolTile.material,
  );
  bench.rotation.x = -Math.PI / 2;
  bench.position.set(D.x, -0.62, D.z);
  scene.add(bench);
  const cupola = new Mesh(
    scope.add(new SphereGeometry(D.r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2)),
    scope.add(new MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9, side: DoubleSide })),
  );
  cupola.position.set(D.x, 4.5, D.z);
  scene.add(cupola);
  const oculus = new Mesh(
    scope.add(new CircleGeometry(1.2, 32)),
    scope.add(new MeshBasicMaterial({ color: 0xdfe8ee, toneMapped: false })),
  );
  oculus.rotation.x = Math.PI / 2;
  oculus.position.set(D.x, 4.5 + D.r - 0.05, D.z);
  scene.add(oculus);
  // mosaics: seven panels around the wall, read clockwise from the right of the door
  const slots = [45, 0, 315, 270, 225, 180, 135];
  for (let i = 0; i < MOSAIC_COUNT; i++) {
    const a = (slots[i]! * Math.PI) / 180;
    const m = new Mesh(
      scope.add(new PlaneGeometry(3.4, 2.55)),
      scope.add(new MeshStandardMaterial({ map: scope.add(mosaicTexture(i)), roughness: 0.35 })),
    );
    m.position.set(D.x + Math.cos(a) * (D.r - 0.25), 2.55, D.z + Math.sin(a) * (D.r - 0.25));
    m.rotation.y = -a - Math.PI / 2;
    scene.add(m);
  }
  // steam over the warm water
  const steamTex = scope.add(steamTexture());
  const steam: Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const sp = new Sprite(
      scope.add(new SpriteMaterial({ map: steamTex, transparent: true, opacity: 0.18, depthWrite: false })),
    );
    const a = (i / 6) * Math.PI * 2;
    sp.position.set(D.x + Math.cos(a) * 2.2, 0.6, D.z + Math.sin(a) * 2.2);
    sp.scale.setScalar(3.2);
    scene.add(sp);
    steam.push(sp);
  }

  // Ežo sits on the submerged bench with a beer, facing the door
  let ezo: Character | null = null;
  const ezoSeat = new Vector3(D.x, -1.55, D.z - 3.62);
  const eg = props.gltf('ezo');
  if (eg) {
    ezo = new Character(eg);
    ezo.pose = 'sit';
    ezo.root.position.copy(ezoSeat);
    scene.add(ezo.root);
    const tw = new Tableware(scope);
    ezo.attach('RightHand', tw.mug(0.6), [0.02, -0.07, 0.06], [0, 0, Math.PI / 2]);
  }

  // ───────── diving hall ─────────
  room(20, -34, 36, -12, 11, wallTile, null, { w: 'skip' });
  b.floor(20, -19, 36, -12, 0, deck);
  b.floor(20, -34, 36, -29, 0, deck);
  b.floor(20, -29, 23, -19, 0, deck);
  b.floor(33, -29, 36, -19, 0, deck);
  basin(DIVE_POOL.x0, DIVE_POOL.z0, DIVE_POOL.x1, DIVE_POOL.z1, -4.2);
  kerb(DIVE_POOL.x0, DIVE_POOL.z1, DIVE_POOL.x1, DIVE_POOL.z1);
  kerb(DIVE_POOL.x0, DIVE_POOL.z0, DIVE_POOL.x1, DIVE_POOL.z0);
  kerb(DIVE_POOL.x0, DIVE_POOL.z0, DIVE_POOL.x0, DIVE_POOL.z1);
  kerb(DIVE_POOL.x1, DIVE_POOL.z0, DIVE_POOL.x1, DIVE_POOL.z1);
  // springboard: three steps, a platform, the board out over the water
  b.stairs(27.4, -15.2, 1.2, 1.5, 0, 0.82, '-z', deck, 3);
  b.box([27.4, 0, -17.6], [28.6, 0.82, -16.7], deck);
  b.box([27.55, 0.82, -22], [28.45, 0.9, -17.6], boardMat(mats));
  const diveDoor = new Door(
    scope,
    game.world,
    [20, 0, -22],
    Math.PI / 2,
    2,
    2.4,
    scope.add(
      new MeshPhysicalMaterial({ color: 0xc8e0e4, roughness: 0.1, transmission: 0.6, thickness: 0.02 }),
    ),
    -1,
  );
  diveDoor.locked = true;
  scene.add(diveDoor.pivot);
  // the whirlpool: a spinning funnel, hidden until the drain opens
  const vortex = new Mesh(
    scope.add(funnelGeometry()),
    scope.add(
      new MeshStandardMaterial({
        map: scope.add(spiralTexture()),
        color: 0x3aa8a0,
        roughness: 0.1,
        transparent: true,
        opacity: 0.9,
        side: DoubleSide,
      }),
    ),
  );
  vortex.position.copy(VORTEX);
  vortex.visible = false;
  vortex.renderOrder = 2; // after the water surface, so the funnel shows through it
  scene.add(vortex);

  // ───────── water ─────────
  const waters = new Waters(scene, scope);
  waters.add('footbath', { kind: 'rect', x0: -7.5, z0: 11.5, x1: -2.5, z1: 15.5 }, -0.02);
  const pool = waters.add('pool', { kind: 'rect', ...POOL }, LEVEL_FULL);
  const flood = waters.add('flood', { kind: 'rect', ...FLOOD }, LEVEL_FULL, { opacity: 0.6 });
  const thermal = waters.add('thermal', { kind: 'circle', x: D.x, z: D.z, r: D.pool }, -0.1, {
    color: 0x5aa8a0,
    opacity: 0.72,
  });
  const diving = waters.add('diving', { kind: 'rect', ...DIVE_POOL }, -0.1, {
    color: 0x1e7a78,
    opacity: 0.85,
  });

  // ───────── light ─────────
  scene.background = new Color(0xc9d4d8);
  scene.fog = new FogExp2(0xc4d0d0, 0.012);
  scene.add(new HemisphereLight(0xdfe8ee, 0xb4beb6, 1.15));
  scene.add(new AmbientLight(0x8aa0a0, 0.25));
  const COOL = 0xeaf4ff;
  const WARM = 0xffdcb0;
  const fixtures: Fixture[] = [
    { pos: new Vector3(-4, 4.2, 12), color: COOL, intensity: 5, distance: 11, flicker: 0 },
    { pos: new Vector3(4, 4.2, 5), color: COOL, intensity: 5, distance: 11, flicker: 0 },
    { pos: new Vector3(0, 2.8, -4), color: COOL, intensity: 3.5, distance: 8, flicker: 5 },
    { pos: new Vector3(-10, 7, -23), color: 0xdfeeff, intensity: 9, distance: 22 },
    { pos: new Vector3(10, 7, -23), color: 0xdfeeff, intensity: 9, distance: 22 },
    { pos: new Vector3(0, 5.5, -48), color: WARM, intensity: 9, distance: 14 },
    { pos: new Vector3(-25, 3.6, -22), color: 0xffe0a0, intensity: 4.5, distance: 10, flicker: 9 },
    { pos: new Vector3(28, 8, -24), color: 0xd0e4ff, intensity: 8, distance: 20 },
  ];
  const tubes: InstanceXform[] = [
    { x: -4, y: 4.5, z: 12 },
    { x: 4, y: 4.5, z: 5 },
    { x: 0, y: 3, z: -4 },
    { x: -25, y: 4, z: -22 },
  ];
  const tubeSrc = props.gltf('mounted_fluorescent_lights')?.scene;
  if (tubeSrc) instanceModel(tubeSrc, tubes, scene, { scope });

  // ───────── navigation ─────────
  const nav = new NavGrid(136, 146, 0.5, -31, -56);
  nav.fillRect(-8.6, 0.4, 8.6, 15.6, Area.WALK);
  nav.fillRect(-1.2, -8, 1.2, 0.4, Area.WALK);
  nav.fillRect(HALL.x0 + 0.4, HALL.z0 + 0.4, HALL.x1 - 0.4, HALL.z1 - 0.4, Area.WALK);
  nav.fillRect(POOL.x0, POOL.z0, -2, POOL.z1, Area.DEEP, true);
  nav.fillRect(-2, POOL.z0, POOL.x1, POOL.z1, Area.WATER, true);
  nav.fillRect(FLOOD.x0 + 0.4, FLOOD.z0, FLOOD.x1, FLOOD.z1, Area.WATER, true);
  nav.fillRect(-29.6, -26.6, -20, -17.4, Area.WALK);
  nav.fillRect(-1.2, -41, 1.2, -38, Area.WALK);
  nav.fillRect(D.x - D.r + 0.4, D.z - D.r + 0.4, D.x + D.r - 0.4, D.z + D.r - 0.4, Area.WALK);
  nav.fillRect(20.4, -33.6, 35.6, -12.4, Area.WALK);
  nav.fillRect(DIVE_POOL.x0, DIVE_POOL.z0, DIVE_POOL.x1, DIVE_POOL.z1, 0, true);
  const wanderPoints = [
    [-9, -20],
    [-6, -26],
    [0, -22],
    [6, -19],
    [10, -27],
    [-16, -20],
    [-16, -26],
  ].map(([x, z]) => new Vector3(x, LEVEL_FULL, z));

  return {
    waters,
    pool,
    flood,
    thermal,
    diving,
    nav,
    fixtures,
    chairSeat: new Vector3(chairBase.x, 0.9, chairBase.z),
    chairDive: new Vector3(11.6, LEVEL_FULL, chairBase.z),
    lifeguardFigure,
    key,
    stones,
    stonePositions,
    diveDoor,
    vortex,
    ezo,
    ezoSeat,
    steam,
    ducksInBasket,
    duckTemplate: duckSrc,
    wanderPoints,
    spots: {
      arrive: new Vector3(-5, -0.3, 13.2),
      desk: new Vector3(5.5, 1.2, 11.5),
      clock: new Vector3(5.5, 2.9, 15.8),
      vending: new Vector3(8.1, 1.2, 6.6),
      ducks: new Vector3(6.5, 0.45, 2.5),
      lockers: new Vector3(-8.4, 1.2, 5.5),
      cabin: new Vector3(-1.4, 1.2, -2.8),
      chair: new Vector3(chairBase.x, 2.4, chairBase.z),
      key: key.position.clone(),
      pumpDoor: new Vector3(-20, 1.2, -23),
      prepad: new Vector3(-29.8, 1.3, -22.8),
      vypust: new Vector3(-29.8, 1.3, -21.2),
      diveDoor: new Vector3(20, 1.1, -23),
      board: BOARD_END.clone().setY(1.5),
      mosaic: new Vector3(D.x - D.r + 0.3, 2.5, D.z),
    },
    drips: [
      new Vector3(-6, 0.0, -20),
      new Vector3(8, 0.0, -25),
      new Vector3(-17, -0.3, -24),
      new Vector3(0, 0, -45),
      new Vector3(-25, 0, -19),
      new Vector3(30, 0, -26),
    ],
  };
}

// ───────── helpers ─────────

function boardMat(mats: RealityCtx['mats']): KitMaterial {
  return mats.get('springboard', {
    proc: 'planks',
    color: 0x2a6a8a,
    uvScale: 1,
    surface: 'wood',
    roughness: 0.5,
  });
}

/** Flat ring (XY plane) with UVs in world metres / uvScale. */
function worldUvRing(r0: number, r1: number, segs: number, uvScale: number): RingGeometry {
  const g = new RingGeometry(r0, r1, segs, 1);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getY(i) / uvScale);
  return g;
}

/** Open cylinder seen from inside, UVs in world metres / uvScale (u around, v up). */
function worldUvCylinder(r: number, h: number, segs: number, uvScale: number, gapRad: number) {
  // three's cylinder puts theta = 0 on +z: start after the gap and stop before it
  const g = new CylinderGeometry(r, r, h, segs, 1, true, gapRad, Math.PI * 2 - gapRad * 2);
  g.translate(0, h / 2, 0);
  g.scale(-1, 1, 1); // faces inward
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    uv.setXY(i, (a * r) / uvScale, pos.getY(i) / uvScale);
  }
  return g;
}

/** A funnel for the whirlpool: wide at the surface, narrowing into the drain. */
function funnelGeometry(): LatheGeometry {
  const pts: Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new Vector2(0.05 + 3.2 * t * t, -2.6 * (1 - t) ** 2));
  }
  return new LatheGeometry(pts, 48);
}

function spiralTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a5a58';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(220,255,250,0.55)';
  for (let i = 0; i < 14; i++) {
    g.lineWidth = 2 + (i % 3);
    g.beginPath();
    for (let y = 0; y <= 256; y += 8) {
      const x = (i * 18.3 + y * 0.9) % 256;
      if (y === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function steamTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.5, 'rgba(240,240,240,0.3)');
  grd.addColorStop(1, 'rgba(220,220,220,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  return t;
}

function snowGlassTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b8c4cc';
  g.fillRect(0, 0, 512, 384);
  // pane grid with snow drifting into the corners
  for (let px = 0; px < 8; px++)
    for (let py = 0; py < 6; py++) {
      const x = px * 64;
      const y = py * 64;
      const grd = g.createLinearGradient(x, y + 64, x, y);
      grd.addColorStop(0, 'rgba(250,252,255,0.95)');
      grd.addColorStop(0.35, 'rgba(240,244,248,0.5)');
      grd.addColorStop(1, 'rgba(200,210,220,0.1)');
      g.fillStyle = grd;
      g.fillRect(x + 2, y + 2, 60, 60);
    }
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  return t;
}

function lockerTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a8a5a';
  g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 16; i++) {
    const x = i * 64;
    g.strokeStyle = '#3a4228';
    g.lineWidth = 3;
    g.strokeRect(x + 3, 4, 58, 248);
    g.fillStyle = '#2a2e20';
    for (let s = 0; s < 4; s++) g.fillRect(x + 18, 20 + s * 8, 28, 3);
    g.fillStyle = '#d8d0b0';
    g.font = 'bold 18px Arial';
    g.fillText(String(41 + i), x + 22, 120);
    g.fillStyle = '#9a9a90';
    g.fillRect(x + 48, 130, 6, 18);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  return t;
}

function cabinDoorTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 300;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c8b48a';
  g.fillRect(0, 0, 128, 300);
  g.strokeStyle = '#8a7650';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 116, 288);
  for (let y = 20; y < 290; y += 14) {
    g.strokeStyle = 'rgba(120,96,60,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(10, y);
    g.lineTo(118, y);
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.fillRect(36, 40, 56, 34);
  g.fillStyle = '#1a3a6a';
  g.font = 'bold 26px Arial';
  g.textAlign = 'center';
  g.fillText('KABÍNA', 64, 66);
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  return t;
}

function vendingTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a1a14';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#f2e6c8';
  g.font = 'bold 34px Arial';
  g.textAlign = 'center';
  g.fillText('UTOPENCI', 128, 52);
  g.fillStyle = '#20302e';
  g.fillRect(20, 76, 216, 300);
  // jars behind the glass
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 3; k++) {
      const x = 44 + k * 66;
      const y = 92 + r * 72;
      g.fillStyle = '#c8b860';
      g.fillRect(x, y + 10, 40, 50);
      g.fillStyle = '#8a4a30';
      g.fillRect(x + 6, y + 22, 28, 30);
      g.fillStyle = '#a0a0a0';
      g.fillRect(x - 2, y + 4, 44, 8);
    }
  g.fillStyle = '#f2e6c8';
  g.font = 'bold 26px Arial';
  g.fillText('2 Kčs', 128, 420);
  g.fillStyle = '#101010';
  g.fillRect(96, 440, 64, 40);
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  return t;
}

function pumpPanelTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 410;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8d4c4';
  g.fillRect(0, 0, 768, 410);
  g.strokeStyle = '#2a2a2a';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 752, 394);
  g.fillStyle = '#1a1a1a';
  g.font = 'bold 34px Arial';
  g.fillText('ÚPRAVŇA VODY — SCHÉMA', 40, 56);
  g.lineWidth = 4;
  // pools: big pool, its overflow and the diving pool
  g.strokeRect(60, 110, 300, 110);
  g.strokeRect(430, 110, 150, 150);
  g.font = '22px Arial';
  g.fillText('PLAVECKÝ', 150, 170);
  g.fillText('SKOKANSKÝ', 445, 190);
  g.strokeStyle = '#1a4aa0';
  g.beginPath();
  g.moveTo(210, 220);
  g.lineTo(210, 320);
  g.lineTo(80, 320);
  g.moveTo(505, 260);
  g.lineTo(505, 340);
  g.stroke();
  g.fillStyle = '#a01818';
  g.font = 'bold 24px Arial';
  g.fillText('PREPAD', 90, 360);
  g.fillText('VÝPUST', 470, 380);
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  return t;
}

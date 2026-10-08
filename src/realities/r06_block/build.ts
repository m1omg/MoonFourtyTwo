import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Object3D, Scene } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RealityCtx } from '../../world/Reality.ts';
import type { KitMaterial } from '../../world/kit/Builder.ts';
import type { Scope } from '../../core/scope.ts';
import type { DynamicBody } from '../../sim/physics/CollisionWorld.ts';
import { Props } from '../../world/props.ts';
import { Waters } from '../../world/water.ts';
import type { Fixture } from '../../world/lightPool.ts';
import { Door } from '../../world/objects/door.ts';
import { Tableware } from '../../world/objects/tableware.ts';
import { Character } from '../../npc/Character.ts';
import { Face } from '../../world/kit/geometry.ts';

/*
 * A panelák stairwell, floor height FH. Floor k has its landing at y = k·FH:
 *   landing    x[-3,3]    z[-4,-1.2]  doors: A (north wall, x -1.5), B (north wall, x 1.5),
 *                                     C (east wall, z -2.6) and the lift (west wall, z -2.6);
 *                                     light switch and floor number between A and B
 *   flight A   x[0.4,2.9] z -1.2 → 2.4, up to the half landing (k·FH + FH/2)
 *   half       x[-3,3]    z[2.4,4]    window in the south wall
 *   flight B   x[-2.9,-0.4] z 2.4 → -1.2, up to the next landing
 * The eye between the flights (x ±0.4) is open from top to bottom.
 * Our flat is behind door A on floor 8 (hall, umakart bathroom, living room with a kitchen corner).
 * On the ground floor A is the house entrance, B the cellar and C the caretaker's flat.
 * The lift cabin waits behind the west wall (x[-4.5,-3.1]) on whichever floor it was opened.
 */
export const FH = 2.8;
export const FLOORS = 14;
export const HOME_FLOOR = 8;
export const LOOP_FLOOR = 9;
export const H0 = HOME_FLOOR * FH;
export const CABIN = { x0: -4.5, z0: -3.35, x1: -3.1, z1: -1.85, h: 2.15 };
/** Where the neighbours shuffle (a landing, without the doorways). */
export const LANDING = { x0: -2.8, z0: -3.8, x1: 2.8, z1: -1.3 };
/** The bathtub you wake up in (inside of the rims), floor 8. */
export const TUB = { x0: -5.26, z0: -6.06, x1: -3.72, z1: -5.42 };

export type SlotKind = 'neighbour' | 'home' | 'entrance' | 'cellar' | 'caretaker';

export interface DoorSlot {
  floor: number;
  /** 0 = A (north wall, west), 1 = B (north wall, east), 2 = C (east wall). */
  which: number;
  kind: SlotKind;
  /** Hinge of the leaf and its rotation when closed (the leaf spans +x of the hinge). */
  hinge: Vector3;
  rotY: number;
  /** The doorway's centre on the landing side. */
  center: Vector3;
  /** Where a neighbour stands in the doorway, and its yaw facing the landing. */
  home: Vector3;
  homeYaw: number;
  index: number;
  name: string;
}

export interface Block {
  waters: Waters;
  /** Stairwell lamps (switched by the timer) and the rest (always on). */
  stairFixtures: Fixture[];
  fixtures: Fixture[];
  slots: DoorSlot[];
  doorMesh: InstancedMesh;
  peepholes: InstancedMesh;
  lampMat: MeshBasicMaterial;
  /** Redraws the number on landing k. */
  drawSign: (k: number, label: string) => void;
  /** Three nameplates shown on the player's current floor (A, B, C). */
  plates: Array<{ mesh: Mesh; draw: (name: string) => void }>;
  flatDoor: Door;
  bathDoor: Door;
  caretakerDoor: Door;
  liftDoors: InstancedMesh;
  liftBodies: DynamicBody[];
  liftCabin: Object3D;
  cabinFixture: Fixture;
  panel: { mesh: Mesh; sober: CanvasTexture; drunk: CanvasTexture };
  tvScreen: { mesh: Mesh; draw: (t: number) => void };
  litWindow: { mesh: Mesh; empty: CanvasTexture; me: CanvasTexture };
  snow: { points: Points; step: (t: number) => void };
  key: Object3D;
  bottles: Record<'slivovica' | 'caj', Object3D>;
  /** Pale, faceless figures for the neighbours that come out (a few, reused). */
  neighbourModels: Character[];
  spots: Record<string, Vector3>;
}

const NAMES = [
  'Novák',
  'Horváth',
  'Kováč',
  'Varga',
  'Tóth',
  'Baláž',
  'Molnár',
  'Szabó',
  'Lukáč',
  'Kráľ',
  'Hudák',
  'Polák',
  'Šimko',
  'Rusnák',
  'Gajdoš',
  'Michalík',
  'Jurčo',
  'Bielik',
];

export async function buildBlock(ctx: RealityCtx): Promise<Block> {
  const { game, scene, scope, builder: b, mats } = ctx;
  const props = new Props(game.loader, scene, scope, b);
  await props.load(
    ['Television_01', 'vintage_cabinet_01', 'painted_wooden_cabinet', 'vintage_electric_kettle', 'vierka'],
    (p) => ctx.progress(p * 0.5),
  );
  const tw = new Tableware(scope);

  // ───────── materials ─────────
  const terrazzo = mats.get('blockTerrazzo', {
    proc: 'terrazzo',
    color: 0x8f8a80,
    uvScale: 1.6,
    surface: 'tile',
    roughness: 0.55,
  });
  const white = mats.get('blockWhite', {
    tex: 'painted_plaster_wall',
    proc: 'plaster',
    color: 0xe0ded6,
    uvScale: 2.5,
    surface: 'concrete',
    tint: 0xe8e6de,
  });
  // the oil-paint dado: glossy green, every panelák's stairwell
  const green = mats.get('blockGreen', {
    proc: 'plaster',
    color: 0x4f7d5c,
    uvScale: 1.8,
    surface: 'concrete',
    roughness: 0.38,
  });
  const peeling = mats.get('blockPeeling', {
    tex: 'peeling_painted_wall',
    proc: 'plaster',
    color: 0x8a6a5a,
    uvScale: 2,
    surface: 'concrete',
  });
  const lino = mats.get('flatLino', {
    tex: 'old_linoleum_flooring_01',
    proc: 'tiles',
    color: 0xb08a5a,
    uvScale: 1.6,
    surface: 'carpet',
  });
  const parquet = mats.get('flatParquet', {
    tex: 'herringbone_parquet',
    proc: 'planks',
    color: 0x8a5a30,
    uvScale: 1.4,
    surface: 'wood',
  });
  const paper = mats.get('flatWallpaper', {
    tex: 'decrepit_wallpaper',
    proc: 'plaster',
    color: 0xc8b898,
    uvScale: 2.2,
    surface: 'concrete',
  });
  const umakart = mats.get('umakart', {
    proc: 'panel',
    color: 0xd8c8a0,
    uvScale: 1.2,
    surface: 'tile',
    roughness: 0.35,
  });
  const enamel = mats.get('enamel', {
    proc: 'noise',
    color: 0xf0eee6,
    uvScale: 1,
    surface: 'tile',
    roughness: 0.18,
  });
  const dark = mats.get('vestibule', { proc: 'noise', color: 0x0a0a0a, uvScale: 2, surface: 'concrete' });
  (dark.material as MeshStandardMaterial).side = BackSide; // seen from the landing: a dark room
  const ceilingWhite = mats.get('blockCeiling', {
    proc: 'plaster',
    color: 0xd8d6ce,
    uvScale: 3,
    surface: 'concrete',
  });
  const fabric = mats.get('sofaFabric', {
    proc: 'carpet',
    color: 0x6e5c3a,
    uvScale: 0.6,
    surface: 'carpet',
    roughness: 0.95,
  });
  const cloth = mats.get('tablecloth', {
    tex: 'fabric_pattern_07',
    proc: 'carpet',
    color: 0xa02020,
    uvScale: 0.6,
    surface: 'carpet',
  });
  const wood = mats.get('blockWood', { proc: 'planks', color: 0x6a4428, uvScale: 1, surface: 'wood' });
  const metal = mats.get('blockMetal', {
    proc: 'metal',
    color: 0x6a6a66,
    uvScale: 1,
    surface: 'metal',
    metalness: 0.6,
  });

  // ───────── the stairwell shell ─────────
  type Hole = { at: number; width: number; bottom: number; top: number };
  const top = FLOORS * FH;
  const perFloor = (fn: (k: number) => Hole[]) => {
    const out: Hole[] = [];
    for (let k = 0; k < FLOORS; k++) out.push(...fn(k));
    return out;
  };
  b.wall(
    -3,
    -4,
    3,
    -4,
    -0.2,
    top,
    white,
    0.2,
    perFloor((k) => [
      { at: 1.5, width: 0.9, bottom: k * FH, top: k * FH + 2.05 },
      { at: 4.5, width: 0.9, bottom: k * FH, top: k * FH + 2.05 },
    ]),
  );
  b.wall(
    3,
    -4,
    3,
    4,
    -0.2,
    top,
    white,
    0.2,
    perFloor((k) => [{ at: 1.4, width: 0.9, bottom: k * FH, top: k * FH + 2.05 }]),
  );
  b.wall(
    -3,
    -4,
    -3,
    4,
    -0.2,
    top,
    white,
    0.2,
    perFloor((k) => [{ at: 1.4, width: 0.95, bottom: k * FH, top: k * FH + 2.1 }]),
  );
  b.wall(
    -3,
    4,
    3,
    4,
    -0.2,
    top,
    white,
    0.2,
    perFloor((k) => [{ at: 3, width: 1.5, bottom: k * FH + FH / 2 + 0.85, top: k * FH + FH / 2 + 2.05 }]),
  );
  b.ceiling(-3, -4, 3, 4, top, ceilingWhite);

  const under = new QuadBuilder();
  /** Thin steps (headroom for the flight below) over a smooth collision ramp and a sloped soffit. */
  const flight = (x0: number, x1: number, zStart: number, zEnd: number, yStart: number, yEnd: number) => {
    const steps = 8;
    const dir = Math.sign(zEnd - zStart);
    const tread = Math.abs(zEnd - zStart) / steps;
    for (let i = 0; i < steps; i++) {
      const y = yStart + ((yEnd - yStart) * (i + 1)) / steps;
      const za = zStart + dir * tread * i;
      const zb = zStart + dir * tread * (i + 1);
      b.box([x0, y - 0.3, Math.min(za, zb)], [x1, y, Math.max(za, zb)], terrazzo, {
        collide: false,
        walkSurface: true,
      });
    }
    b.ramp(x0, zStart, x1, zEnd, yStart, yEnd, 'z');
    under.quad(
      [x0, yStart - 0.3, zStart],
      [x1, yStart - 0.3, zStart],
      [x1, yEnd - 0.3, zEnd],
      [x0, yEnd - 0.3, zEnd],
      [0, -1, 0],
    );
  };
  /** A landing: terrazzo on top, plaster underneath. */
  const slab = (z0: number, z1: number, y: number) => {
    b.box([-2.9, y - 0.2, z0], [2.9, y, z1], terrazzo, { walkSurface: true, faces: Face.ALL & ~Face.NY });
    b.box([-2.9, y - 0.2, z0], [2.9, y, z1], ceilingWhite, { collide: false, faces: Face.NY });
  };
  const posts: Matrix4[] = [];
  const rail: Matrix4[] = [];
  const railSlope = Math.atan2(FH / 2, 3.6);
  const railLen = Math.hypot(FH / 2, 3.6);
  for (let k = 0; k < FLOORS; k++) {
    const y0 = k * FH;
    const yh = y0 + FH / 2;
    slab(-3.9, -1.2, y0);
    if (k === 0) {
      // nothing is below the ground floor's stairs: a floor under them (the eye looks down onto
      // it), and the space under the second flight walled off from the landing (a step past
      // the lift used to drop you into the void)
      b.box([-2.9, -0.2, -1.2], [2.9, 0, 3.9], terrazzo, { walkSurface: true });
      b.wall(-2.9, -1.2, -0.48, -1.2, 0, FH - 0.3, white, 0.1);
    }
    if (k === FLOORS - 1) continue;
    slab(2.4, 3.9, yh);
    flight(0.4, 2.9, -1.2, 2.4, y0, yh);
    flight(-2.9, -0.4, 2.4, -1.2, yh, y0 + FH);
    // the railing around the eye: posts and a sloped handrail; collision as a row of boxes
    for (let i = 0; i <= 8; i++) {
      const z = -1.2 + i * 0.45;
      const ya = y0 + (FH / 2) * (i / 8);
      const yb = yh + (FH / 2) * (1 - i / 8);
      posts.push(
        new Matrix4().makeTranslation(0.42, ya + 0.5, z),
        new Matrix4().makeTranslation(-0.42, yb + 0.5, z),
      );
      b.box([0.36, ya, z - 0.24], [0.48, ya + 1.0, z + 0.24], null);
      b.box([-0.48, yb, z - 0.24], [-0.36, yb + 1.0, z + 0.24], null);
    }
    for (const x of [-0.2, 0.2]) posts.push(new Matrix4().makeTranslation(x, yh + 0.5, 2.42));
    b.box([-0.48, yh, 2.36], [0.48, yh + 1.0, 2.48], null);
    b.box([-0.48, y0, -1.26], [0.48, y0 + 1.0, -1.14], null);
    rail.push(
      new Matrix4().compose(
        new Vector3(0.42, y0 + FH / 4 + 1.0, 0.6),
        new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -railSlope),
        new Vector3(1, 1, railLen),
      ),
      new Matrix4().compose(
        new Vector3(-0.42, yh + FH / 4 + 1.0, 0.6),
        new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), railSlope),
        new Vector3(1, 1, railLen),
      ),
      new Matrix4().compose(
        new Vector3(0, yh + 1.0, 2.42),
        new Quaternion(),
        new Vector3(0.84 / 0.05, 1, 0.05 / railLen),
      ),
    );
  }
  // the topmost landing's eye is closed off
  b.box([-0.48, (FLOORS - 1) * FH, -1.26], [0.48, (FLOORS - 1) * FH + 1.0, -1.14], null);
  const postMesh = new InstancedMesh(
    scope.add(new CylinderGeometry(0.014, 0.014, 1.0, 6)),
    scope.add(new MeshStandardMaterial({ color: 0x3a3a38, metalness: 0.6, roughness: 0.5 })),
    posts.length,
  );
  posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
  const railMesh = new InstancedMesh(
    scope.add(new BoxGeometry(0.05, 0.05, 1)),
    scope.add(new MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.45 })),
    rail.length,
  );
  rail.forEach((m, i) => railMesh.setMatrixAt(i, m));
  scene.add(postMesh, railMesh);
  scene.add(new Mesh(scope.add(under.build(3)), ceilingWhite.material));

  // the green oil-paint dado, sloping along the flights, cut around the doorways and windows
  const dado = new QuadBuilder();
  const DADO = 1.4;
  const bandX = (x: number, z0: number, z1: number, y0: number, y1: number, nx: number, h = DADO) =>
    dado.quad([x, y0, z0], [x, y1, z1], [x, y1 + h, z1], [x, y0 + h, z0], [nx, 0, 0]);
  const bandZ = (z: number, x0: number, x1: number, y: number, nz: number, h = DADO) =>
    dado.quad([x0, y, z], [x1, y, z], [x1, y + h, z], [x0, y + h, z], [0, 0, nz]);
  for (let k = 0; k < FLOORS; k++) {
    const y0 = k * FH;
    const yh = y0 + FH / 2;
    bandZ(-3.89, -2.9, -1.95, y0, 1);
    bandZ(-3.89, -1.05, 1.05, y0, 1);
    bandZ(-3.89, 1.95, 2.9, y0, 1);
    bandX(-2.89, -3.9, -3.08, y0, y0, 1);
    bandX(-2.89, -2.12, -1.2, y0, y0, 1);
    bandX(2.89, -3.9, -3.05, y0, y0, -1);
    bandX(2.89, -2.15, -1.2, y0, y0, -1);
    if (k === FLOORS - 1) continue;
    bandX(2.89, -1.2, 2.4, y0, yh, -1);
    bandX(-2.89, 2.4, -1.2, yh, y0 + FH, 1);
    bandX(2.89, 2.4, 3.9, yh, yh, -1);
    bandX(-2.89, 2.4, 3.9, yh, yh, 1);
    bandZ(3.89, -2.9, -0.75, yh, -1);
    bandZ(3.89, -0.75, 0.75, yh, -1, 0.85);
    bandZ(3.89, 0.75, 2.9, yh, -1);
  }
  const dadoMesh = new Mesh(scope.add(dado.build(green.uvScale)), green.material);
  dadoMesh.receiveShadow = true;
  scene.add(dadoMesh);

  // ───────── doors ─────────
  const slots: DoorSlot[] = [];
  for (let k = 0; k < FLOORS; k++) {
    const y0 = k * FH;
    const defs: Array<[Vector3, number, Vector3, Vector3, number]> = [
      [new Vector3(-1.95, y0, -3.95), 0, new Vector3(-1.5, y0, -3.9), new Vector3(-1.5, y0, -3.72), Math.PI],
      [new Vector3(1.05, y0, -3.95), 0, new Vector3(1.5, y0, -3.9), new Vector3(1.5, y0, -3.72), Math.PI],
      [
        new Vector3(2.95, y0, -3.05),
        -Math.PI / 2,
        new Vector3(2.9, y0, -2.6),
        new Vector3(2.72, y0, -2.6),
        Math.PI / 2,
      ],
    ];
    defs.forEach(([hinge, rotY, center, home, homeYaw], which) => {
      let kind: SlotKind = 'neighbour';
      if (k === HOME_FLOOR && which === 0) kind = 'home';
      if (k === 0) kind = (['entrance', 'cellar', 'caretaker'] as const)[which]!;
      slots.push({
        floor: k,
        which,
        kind,
        hinge,
        rotY,
        center,
        home,
        homeYaw,
        index: slots.length,
        name: NAMES[(k * 5 + which * 7) % NAMES.length]!,
      });
    });
  }
  const doorMat = scope.add(new MeshStandardMaterial({ map: scope.add(doorTexture()), roughness: 0.6 }));
  const doorGeo = scope.add(new BoxGeometry(0.9, 2.05, 0.05));
  doorGeo.translate(0.45, 1.025, 0);
  const doorMesh = new InstancedMesh(doorGeo, doorMat, slots.length);
  const peepGeo = scope.add(new CircleGeometry(0.016, 10));
  peepGeo.translate(0.45, 1.56, 0.027);
  const peepholes = new InstancedMesh(
    peepGeo,
    scope.add(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })),
    slots.length,
  );
  const hidden = new Matrix4().makeScale(0, 0, 0);
  for (const s of slots) {
    const m = new Matrix4().makeRotationY(s.rotY).setPosition(s.hinge);
    const leaf = s.kind === 'neighbour' || s.kind === 'cellar';
    doorMesh.setMatrixAt(s.index, leaf ? m : hidden);
    peepholes.setMatrixAt(s.index, leaf ? m : hidden);
    peepholes.setColorAt(s.index, new Color(0x050505));
    if (!leaf) continue;
    // nobody goes into the neighbours' flats: the doorway stays solid even when it opens
    if (s.which === 2) b.box([2.9, s.hinge.y, -3.05], [3.0, s.hinge.y + 2.05, -2.15], null);
    else b.box([s.hinge.x, s.hinge.y, -4.0], [s.hinge.x + 0.9, s.hinge.y + 2.05, -3.9], null);
    // and behind it, a dark hall
    if (s.which === 0)
      b.box([-2.2, s.hinge.y - 0.05, -5.6], [-0.8, s.hinge.y + 2.2, -4.1], dark, { collide: false });
    else if (s.which === 1)
      b.box([0.8, s.hinge.y - 0.05, -5.6], [2.2, s.hinge.y + 2.2, -4.1], dark, { collide: false });
    else b.box([3.1, s.hinge.y - 0.05, -3.4], [4.6, s.hinge.y + 2.2, -1.8], dark, { collide: false });
  }
  scene.add(doorMesh, peepholes);
  // a doormat in front of every flat door
  const matSlots = slots.filter(
    (sl) => sl.kind === 'neighbour' || sl.kind === 'home' || sl.kind === 'caretaker',
  );
  const mats2 = new InstancedMesh(
    scope.add(new PlaneGeometry(0.72, 0.46).rotateX(-Math.PI / 2)),
    scope.add(new MeshStandardMaterial({ map: scope.add(doormatTexture()), roughness: 1 })),
    matSlots.length,
  );
  matSlots.forEach((sl, i) => {
    const jitter = (((sl.index * 37) % 11) - 5) * 0.015;
    const m = new Matrix4().makeRotationY(sl.rotY + jitter);
    if (sl.which === 2) m.setPosition(2.6, sl.hinge.y + 0.006, -2.6);
    else m.setPosition(sl.center.x, sl.hinge.y + 0.006, -3.6);
    mats2.setMatrixAt(i, m);
  });
  scene.add(mats2);
  // nameplates for the floor you are on (moved there by the reality)
  const plates = [0, 1, 2].map(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 40;
    const g = c.getContext('2d')!;
    const tex = scope.add(new CanvasTexture(c));
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      scope.add(new PlaneGeometry(0.3, 0.094)),
      scope.add(new MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.5 })),
    );
    scene.add(mesh);
    const draw = (name: string) => {
      g.fillStyle = '#c8b070';
      g.fillRect(0, 0, 128, 40);
      g.strokeStyle = '#8a7440';
      g.lineWidth = 3;
      g.strokeRect(2, 2, 124, 36);
      g.fillStyle = '#2a2014';
      g.font = "bold 22px 'IBM Plex Sans Condensed', Arial";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, 64, 22);
      tex.needsUpdate = true;
    };
    return { mesh, draw };
  });

  // our flat's door and the caretaker's door really open
  const flatDoor = new Door(scope, game.world, [-1.95, H0, -3.95], 0, 0.9, 2.05, doorMat, 1);
  const caretakerDoor = new Door(scope, game.world, [2.95, 0, -3.05], -Math.PI / 2, 0.9, 2.05, doorMat, 1);
  scene.add(flatDoor.pivot, caretakerDoor.pivot);

  // ───────── lamps, switches, floor numbers ─────────
  const lampMat = scope.add(new MeshBasicMaterial({ color: 0x2a2824 }));
  const lampMesh = new InstancedMesh(scope.add(new SphereGeometry(0.13, 12, 8)), lampMat, FLOORS * 2);
  const stairFixtures: Fixture[] = [];
  for (let k = 0; k < FLOORS; k++) {
    const y0 = k * FH;
    const a = new Vector3(0, y0 + 2.5, -2.6);
    const h = new Vector3(0, y0 + FH / 2 + 2.4, 3.55);
    lampMesh.setMatrixAt(k * 2, new Matrix4().makeTranslation(a.x, a.y, a.z));
    lampMesh.setMatrixAt(k * 2 + 1, new Matrix4().makeTranslation(h.x, h.y, h.z));
    stairFixtures.push({ pos: a.clone().setY(a.y - 0.2), color: 0xffdcaa, intensity: 0, distance: 9 });
    stairFixtures.push({ pos: h.clone().setY(h.y - 0.2), color: 0xffdcaa, intensity: 0, distance: 8 });
  }
  scene.add(lampMesh);
  const switches = new InstancedMesh(
    scope.add(new BoxGeometry(0.08, 0.08, 0.025)),
    scope.add(new MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 })),
    FLOORS,
  );
  const neons = new InstancedMesh(
    scope.add(new CircleGeometry(0.008, 8)),
    scope.add(new MeshBasicMaterial({ color: 0xff7a20, toneMapped: false })),
    FLOORS,
  );
  for (let k = 0; k < FLOORS; k++) {
    switches.setMatrixAt(k, new Matrix4().makeTranslation(0, k * FH + 1.2, -3.885));
    neons.setMatrixAt(k, new Matrix4().makeTranslation(0, k * FH + 1.2, -3.871));
  }
  scene.add(switches, neons);
  // floor numbers: one atlas, one draw call
  const signCanvas = document.createElement('canvas');
  signCanvas.width = signCanvas.height = 512;
  const sg = signCanvas.getContext('2d')!;
  const signTex = scope.add(new CanvasTexture(signCanvas));
  signTex.colorSpace = SRGBColorSpace;
  const drawSign = (k: number, label: string) => {
    const cx = (k % 4) * 128;
    const cy = Math.floor(k / 4) * 128;
    sg.clearRect(cx, cy, 128, 128);
    sg.fillStyle = '#9a1a16';
    sg.font = `bold ${label.length > 2 ? 58 : 86}px 'IBM Plex Sans Condensed', Arial`;
    sg.textAlign = 'center';
    sg.textBaseline = 'middle';
    sg.fillText(label, cx + 64, cy + 68);
    signTex.needsUpdate = true;
  };
  const signGeos: BufferGeometry[] = [];
  for (let k = 0; k < FLOORS; k++) {
    const g = new PlaneGeometry(0.5, 0.5);
    const uv = g.getAttribute('uv') as BufferAttribute;
    const u0 = (k % 4) / 4;
    const v0 = 1 - (Math.floor(k / 4) + 1) / 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 4);
    g.translate(0, k * FH + 1.9, -3.885);
    signGeos.push(g);
    drawSign(k, k === 0 ? 'P' : String(k));
  }
  scene.add(
    new Mesh(
      scope.add(mergeGeometries(signGeos)!),
      scope.add(new MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.8 })),
    ),
  );
  signGeos.forEach((g) => g.dispose());

  // ───────── windows: frosted glass over an estate in the snow ─────────
  const frost = scope.add(
    new MeshStandardMaterial({
      map: scope.add(frostTexture()),
      transparent: true,
      roughness: 0.2,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  const panes = new InstancedMesh(scope.add(new PlaneGeometry(1.5, 1.2)), frost, FLOORS - 1);
  for (let k = 0; k < FLOORS - 1; k++)
    panes.setMatrixAt(k, new Matrix4().makeTranslation(0, k * FH + FH / 2 + 1.45, 3.98));
  scene.add(panes);
  const litWindow = buildEstate(scene, scope);
  const snow = buildSnowfall(scene, scope);

  // ───────── our flat (floor 8, behind door A) ─────────
  const y0 = H0;
  const wallH = 2.6;
  const W = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    mat: KitMaterial,
    holes: Array<[number, number, number?, number?]> = [],
  ) =>
    b.wall(
      ax,
      az,
      bx,
      bz,
      y0,
      y0 + wallH,
      mat,
      0.12,
      holes.map(([at, width, bottom, topY]) => ({
        at,
        width,
        bottom: y0 + (bottom ?? 0),
        top: y0 + (topY ?? 2.05),
      })),
    );
  b.floor(-2.6, -6.2, -0.4, -4.1, y0, lino);
  b.floor(-5.4, -6.2, -2.6, -4.1, y0, lino);
  b.floor(-6, -11, 3, -6.2, y0, parquet);
  b.ceiling(-6, -11, 3, -4.1, y0 + wallH, ceilingWhite);
  W(-6, -6.2, 3, -6.2, paper, [[4.5, 0.9]]); // living room south wall, doorway from the hall
  W(-6, -11, -6, -6.2, paper);
  W(3, -11, 3, -6.2, paper);
  W(-6, -11, 3, -11, paper, [[7.4, 1.6, 0.9, 2.1]]); // the window
  W(-2.6, -6.2, -2.6, -4.1, paper, [[1.0, 0.8]]); // bathroom door
  W(-0.4, -6.2, -0.4, -4.1, paper);
  W(-5.4, -6.2, -5.4, -4.1, paper);
  W(-5.4, -4.16, -2.6, -4.16, paper);
  // the hall side of the stairwell wall, and the umakart bathroom lining
  b.wall(
    -2.6,
    -4.11,
    -0.4,
    -4.11,
    y0,
    y0 + wallH,
    paper,
    0.02,
    [{ at: 1.1, width: 0.9, bottom: y0, top: y0 + 2.05 }],
    {
      collide: false,
    },
  );
  const lining = (ax: number, az: number, bx: number, bz: number, holes: Hole[] = []) =>
    b.wall(ax, az, bx, bz, y0, y0 + wallH, umakart, 0.01, holes, { collide: false });
  lining(-5.33, -6.13, -2.67, -6.13);
  lining(-5.33, -6.13, -5.33, -4.23);
  lining(-5.33, -4.23, -2.67, -4.23);
  lining(-2.67, -6.13, -2.67, -4.23, [{ at: 0.93, width: 0.8, bottom: y0, top: y0 + 2.05 }]);
  // the tub: enamel rims around cold water
  const T = TUB;
  b.box([T.x0 - 0.07, y0, T.z0 - 0.07], [T.x1 + 0.07, y0 + 0.06, T.z1 + 0.07], enamel, { walkSurface: true });
  b.box([T.x0 - 0.07, y0, T.z0 - 0.07], [T.x0, y0 + 0.5, T.z1 + 0.07], enamel);
  b.box([T.x1, y0, T.z0 - 0.07], [T.x1 + 0.07, y0 + 0.5, T.z1 + 0.07], enamel);
  b.box([T.x0, y0, T.z0 - 0.07], [T.x1, y0 + 0.5, T.z0], enamel);
  b.box([T.x0, y0, T.z1], [T.x1, y0 + 0.5, T.z1 + 0.07], enamel);
  const waters = new Waters(scene, scope);
  waters.add('tub', { kind: 'rect', ...TUB }, y0 + 0.42, { color: 0x7a9a96, opacity: 0.55 });
  // sink with the mirror on the west wall, a washing machine by the door
  b.box([-5.32, y0, -5.05], [-4.85, y0 + 0.82, -4.45], umakart);
  b.box([-5.32, y0 + 0.82, -5.1], [-4.8, y0 + 0.88, -4.4], enamel);
  // the mirror shows the room behind you, with the bathroom door standing open
  const mirrorTex = scope.add(mirrorTexture());
  const mirror = new Mesh(
    scope.add(new PlaneGeometry(0.5, 0.65)),
    scope.add(
      new MeshStandardMaterial({
        map: mirrorTex,
        roughness: 0.12,
        emissive: 0xffffff,
        emissiveMap: mirrorTex,
        emissiveIntensity: 0.18,
      }),
    ),
  );
  mirror.rotation.y = Math.PI / 2;
  mirror.position.set(-5.32, y0 + 1.5, -4.75);
  scene.add(mirror);
  b.box([-3.32, y0, -4.85], [-2.72, y0 + 0.85, -4.26], enamel);
  const bathDoor = new Door(
    scope,
    game.world,
    [-2.6, y0, -5.6],
    -Math.PI / 2,
    0.8,
    2.05,
    scope.add(new MeshStandardMaterial({ map: scope.add(innerDoorTexture()), roughness: 0.5 })),
    -1,
  );
  scene.add(bathDoor.pivot);
  const porthole = new Mesh(
    scope.add(new CircleGeometry(0.17, 24)),
    scope.add(new MeshStandardMaterial({ color: 0x9aa4a8, metalness: 0.8, roughness: 0.2 })),
  );
  porthole.rotation.y = -Math.PI / 2;
  porthole.position.set(-3.33, y0 + 0.5, -4.55);
  scene.add(porthole);
  // hall: shoe cabinet
  b.box([-0.95, y0, -5.9], [-0.47, y0 + 0.5, -5.0], wood);
  // living room: sofa against the south wall, TV and the wall unit on the north wall
  b.box([-5.6, y0, -7.05], [-2.9, y0 + 0.45, -6.26], fabric);
  b.box([-5.6, y0 + 0.45, -6.5], [-2.9, y0 + 0.95, -6.26], fabric);
  b.box([-5.8, y0, -7.05], [-5.6, y0 + 0.65, -6.26], fabric);
  b.box([-2.9, y0, -7.05], [-2.7, y0 + 0.65, -6.26], fabric);
  b.box([-4.9, y0 + 0.42, -8.4], [-3.5, y0 + 0.47, -7.7], wood); // coffee table
  for (const [x, z] of [
    [-4.85, -8.35],
    [-3.6, -8.35],
    [-4.85, -7.8],
    [-3.6, -7.8],
  ] as const)
    b.box([x, y0, z], [x + 0.05, y0 + 0.42, z + 0.05], wood, { collide: false });
  b.box([-4.9, y0, -8.4], [-3.5, y0 + 0.42, -7.7], null);
  const rug = new Mesh(
    scope.add(new PlaneGeometry(3, 2.2)),
    scope.add(new MeshStandardMaterial({ map: scope.add(rugTexture()), roughness: 0.95 })),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-4.2, y0 + 0.006, -8.1);
  scene.add(rug);
  const glow = (color: number) =>
    scope.add(new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.6 }));
  const bowl = new Mesh(
    scope.add(new SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)),
    glow(0xf2dcb0),
  );
  bowl.position.set(-1.5, y0 + 2.6, -8.6);
  scene.add(bowl);
  const pole = new Mesh(scope.add(new CylinderGeometry(0.015, 0.015, 1.35, 8)), metal.material);
  pole.position.set(-5.3, y0 + 0.675, -7.55);
  const shade = new Mesh(
    scope.add(new CylinderGeometry(0.14, 0.22, 0.26, 18, 1, true)),
    scope.add(
      new MeshStandardMaterial({
        color: 0xd8b878,
        emissive: 0xffa850,
        emissiveIntensity: 0.5,
        side: DoubleSide,
      }),
    ),
  );
  shade.position.set(-5.3, y0 + 1.45, -7.55);
  scene.add(pole, shade);
  b.box([-5.42, y0, -7.67], [-5.18, y0 + 1.5, -7.43], null);
  b.box([-5.5, y0, -10.9], [-4.3, y0 + 0.5, -10.35], wood); // TV stand
  props.place('Television_01', { pos: [-4.9, y0 + 0.5, -10.62], rotY: 0, collide: 'none' });
  const tvScreen = staticScreen(scope, 0.37, 0.28);
  tvScreen.mesh.position.set(-4.965, y0 + 0.74, -10.383);
  scene.add(tvScreen.mesh);
  const doily = new Mesh(
    scope.add(new CircleGeometry(0.2, 18)),
    scope.add(
      new MeshStandardMaterial({ map: scope.add(doilyTexture()), transparent: true, roughness: 0.9 }),
    ),
  );
  doily.rotation.x = -Math.PI / 2;
  doily.position.set(-4.92, y0 + 0.96, -10.66);
  scene.add(doily);
  props.place('vintage_cabinet_01', { pos: [-2.95, y0, -10.64], rotY: 0 });
  const slivovica = tw.bottle(0xf4eedc, labelTexture('SLIVOVICA', '#f4ecd0', '#5a2a6a'));
  slivovica.position.set(-2.55, y0 + 1.3, -10.62);
  scene.add(slivovica);
  // kitchen corner along the east wall: cabinet with the kettle, stove with a pot, fridge
  props.place('painted_wooden_cabinet', { pos: [2.55, y0, -7.4], rotY: -Math.PI / 2 });
  props.place('vintage_electric_kettle', { pos: [2.6, y0 + 1.18, -7.15], rotY: -1.2, collide: 'none' });
  b.box([2.34, y0, -8.66], [2.94, y0 + 0.86, -8.06], enamel);
  const burnerMat = scope.add(new MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
  const burnerGeo = scope.add(new CircleGeometry(0.075, 16));
  for (const [dx, dz] of [
    [0.15, 0.15],
    [0.15, 0.45],
    [0.42, 0.15],
    [0.42, 0.45],
  ] as const) {
    const burner = new Mesh(burnerGeo, burnerMat);
    burner.rotation.x = -Math.PI / 2;
    burner.position.set(2.34 + dx, y0 + 0.862, -8.66 + dz);
    scene.add(burner);
  }
  const pot = new Mesh(
    scope.add(new CylinderGeometry(0.12, 0.11, 0.16, 20)),
    scope.add(new MeshStandardMaterial({ color: 0xc83a2a, roughness: 0.35 })),
  );
  pot.position.set(2.49, y0 + 0.94, -8.21);
  scene.add(pot);
  b.box([2.3, y0, -9.46], [2.94, y0 + 1.5, -8.74], enamel); // fridge
  b.box([2.28, y0 + 0.9, -8.86], [2.3, y0 + 1.25, -8.82], metal, { collide: false });
  // dining table under the window, with a gingham cloth
  b.box([0.8, y0 + 0.72, -10.85], [2.0, y0 + 0.76, -9.95], cloth);
  b.box([1.33, y0, -10.47], [1.47, y0 + 0.72, -10.33], wood, { collide: false });
  b.box([0.8, y0, -10.85], [2.0, y0 + 0.76, -9.95], null);
  b.box([1.1, y0, -9.85], [1.5, y0 + 0.45, -9.45], wood); // stool
  const flatPane = new Mesh(scope.add(new PlaneGeometry(1.6, 1.2)), frost);
  flatPane.position.set(1.4, y0 + 1.5, -10.99);
  scene.add(flatPane);

  // ───────── ground floor: the house entrance, the cellar door, the caretaker's flat ─────────
  b.floor(-2.6, -6.4, -0.4, -4.1, 0, terrazzo);
  b.ceiling(-2.6, -6.4, -0.4, -4.1, 2.6, ceilingWhite);
  b.wall(-2.6, -6.4, -2.6, -4.1, 0, 2.6, peeling, 0.12);
  b.wall(-0.4, -6.4, -0.4, -4.1, 0, 2.6, peeling, 0.12);
  b.wall(-2.6, -6.4, -0.4, -6.4, 0, 2.6, peeling, 0.12, [{ at: 1.1, width: 1.2, bottom: 0, top: 2.2 }]);
  const entranceGlass = new Mesh(scope.add(new PlaneGeometry(1.2, 2.2)), frost);
  entranceGlass.position.set(-1.5, 1.1, -6.38);
  scene.add(entranceGlass);
  b.box([-2.1, 0, -6.46], [-0.9, 2.2, -6.4], null); // shut: the snow holds it
  const drift = new Mesh(
    scope.add(new SphereGeometry(1, 16, 10)),
    scope.add(new MeshStandardMaterial({ color: 0xdce4ee, roughness: 0.95 })),
  );
  // (outside the glass: it used to poke through the wall into the vestibule by the intercom)
  drift.scale.set(1.4, 1.15, 0.75);
  drift.position.set(-1.5, 0, -7.3);
  scene.add(drift);
  const mail = new Mesh(
    scope.add(new PlaneGeometry(1.6, 0.8)),
    scope.add(new MeshStandardMaterial({ map: scope.add(mailboxTexture()), metalness: 0.4, roughness: 0.5 })),
  );
  mail.position.set(-2.53, 1.35, -5.3);
  mail.rotation.y = Math.PI / 2;
  scene.add(mail);
  const intercom = new Mesh(
    scope.add(new PlaneGeometry(0.22, 0.4)),
    scope.add(new MeshStandardMaterial({ map: scope.add(intercomTexture()), roughness: 0.5 })),
  );
  intercom.position.set(-0.47, 1.35, -5.9);
  intercom.rotation.y = -Math.PI / 2;
  scene.add(intercom);
  // the caretaker's flat, east of the stairwell (x[3.1,7.5] z[-4,1.5])
  b.floor(3.1, -4, 7.5, 1.5, 0, lino);
  b.ceiling(3.1, -4, 7.5, 1.5, 2.6, ceilingWhite);
  b.wall(3.1, -4, 7.5, -4, 0, 2.6, paper, 0.12);
  b.wall(3.1, 1.5, 7.5, 1.5, 0, 2.6, paper, 0.12);
  b.wall(7.5, -4, 7.5, 1.5, 0, 2.6, paper, 0.12);
  b.wall(3.11, -4, 3.11, 1.5, 0, 2.6, paper, 0.02, [{ at: 1.4, width: 0.9, bottom: 0, top: 2.05 }], {
    collide: false,
  });
  b.box([5.4, 0.72, -3.94], [6.9, 0.76, -3.3], wood); // desk
  b.box([5.45, 0, -3.9], [5.55, 0.72, -3.8], wood, { collide: false });
  b.box([6.75, 0, -3.9], [6.85, 0.72, -3.8], wood, { collide: false });
  b.box([5.4, 0, -3.94], [6.9, 0.76, -3.3], null);
  b.box([6.6, 0, -1.6], [7.44, 0.45, 0.5], fabric); // bed
  b.box([6.6, 0.45, 0.35], [7.44, 0.9, 0.5], wood);
  b.box([3.2, 0, 1.0], [4.6, 0.9, 1.44], wood); // kitchen shelf by the south wall
  [0, 1, 2, 3].forEach((i) => {
    const ph = new Mesh(
      scope.add(new PlaneGeometry(0.36, 0.27)),
      scope.add(new MeshStandardMaterial({ map: scope.add(photoTexture(i)), roughness: 0.6 })),
    );
    ph.position.set(5.35 + i * 0.5, 1.55 + (i % 2) * 0.1, -3.935);
    scene.add(ph);
  });
  const note = new Mesh(
    scope.add(new PlaneGeometry(0.16, 0.22)),
    scope.add(new MeshStandardMaterial({ map: scope.add(noteTexture()), roughness: 0.9 })),
  );
  note.rotation.x = -Math.PI / 2;
  note.position.set(5.9, 0.765, -3.6);
  scene.add(note);
  const key = new Group();
  const keyMat = scope.add(new MeshStandardMaterial({ color: 0xb8902c, metalness: 0.9, roughness: 0.3 }));
  const blade = new Mesh(scope.add(new BoxGeometry(0.075, 0.006, 0.016)), keyMat);
  blade.position.x = 0.035;
  const bow = new Mesh(scope.add(new CylinderGeometry(0.018, 0.018, 0.006, 16)), keyMat);
  const wheel = new Mesh(
    scope.add(new CylinderGeometry(0.03, 0.03, 0.008, 6)),
    scope.add(new MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.5 })),
  );
  wheel.position.x = -0.05;
  key.add(blade, bow, wheel);
  key.position.set(6.45, 0.765, -3.55);
  key.rotation.y = 0.4;
  scene.add(key);
  const caj = tw.bottle(0x8a3b12, labelTexture('HORSKÝ ČAJ', '#e8d8b0', '#2a4a2a'));
  caj.position.set(3.55, 0.9, 1.2);
  scene.add(caj);
  const demijohn = tw.bottle(0x3a6a3a);
  demijohn.scale.set(3.2, 2.0, 3.2);
  demijohn.position.set(4.15, 0.9, 1.2);
  scene.add(demijohn);
  // Ežo's coat on a hook by the door, much too big for anyone else
  const coat = new Mesh(
    scope.add(new BoxGeometry(0.16, 1.25, 0.75)),
    scope.add(new MeshStandardMaterial({ color: 0x3a3226, roughness: 0.95 })),
  );
  coat.position.set(3.22, 1.15, -0.9);
  scene.add(coat);
  const tableLamp = new Mesh(
    scope.add(new CylinderGeometry(0.1, 0.18, 0.2, 16, 1, true)),
    scope.add(
      new MeshStandardMaterial({
        color: 0xe8c890,
        emissive: 0xffb860,
        emissiveIntensity: 0.6,
        side: DoubleSide,
      }),
    ),
  );
  tableLamp.position.set(6.6, 1.0, -3.6);
  scene.add(tableLamp);

  // ───────── the lift ─────────
  const liftGeo = scope.add(new BoxGeometry(0.95, 2.1, 0.05));
  liftGeo.translate(0.475, 1.05, 0);
  const liftDoors = new InstancedMesh(
    liftGeo,
    scope.add(
      new MeshStandardMaterial({ map: scope.add(liftDoorTexture()), roughness: 0.5, metalness: 0.25 }),
    ),
    FLOORS,
  );
  const liftBodies: DynamicBody[] = [];
  const bodyGeo = scope.add(new BoxGeometry(0.1, 2.1, 0.95));
  bodyGeo.translate(0, 1.05, 0);
  const C = CABIN;
  for (let k = 0; k < FLOORS; k++) {
    const y = k * FH;
    liftDoors.setMatrixAt(k, liftDoorMatrix(k, 0));
    liftBodies.push(game.world.addDynamic(bodyGeo, new Matrix4().makeTranslation(-3.0, y, -2.6)));
    // the cabin's shell on every floor (only one floor's door ever opens onto it)
    b.box([C.x0, y - 0.2, C.z0], [C.x1, y, C.z1], null);
    b.box([C.x0 - 0.1, y, C.z0], [C.x0, y + C.h, C.z1], null);
    b.box([C.x0, y, C.z0 - 0.1], [C.x1, y + C.h, C.z0], null);
    b.box([C.x0, y, C.z1], [C.x1, y + C.h, C.z1 + 0.1], null);
    b.box([C.x0, y + C.h, C.z0], [C.x1, y + C.h + 0.1, C.z1], null);
  }
  scene.add(liftDoors);
  const liftCabin = new Group();
  const cabinMat = scope.add(new MeshStandardMaterial({ map: scope.add(cabinTexture()), roughness: 0.6 }));
  const cw = C.x1 - C.x0;
  const cd = C.z1 - C.z0;
  const cx = (C.x0 + C.x1) / 2;
  const cz = (C.z0 + C.z1) / 2;
  const addPlane = (
    w: number,
    h: number,
    pos: [number, number, number],
    rot: [number, number, number],
    mat: MeshStandardMaterial | MeshBasicMaterial = cabinMat,
  ) => {
    const m = new Mesh(scope.add(new PlaneGeometry(w, h)), mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    liftCabin.add(m);
    return m;
  };
  addPlane(cd, C.h, [C.x0, C.h / 2, cz], [0, Math.PI / 2, 0]);
  addPlane(cw, C.h, [cx, C.h / 2, C.z0], [0, 0, 0]);
  addPlane(cw, C.h, [cx, C.h / 2, C.z1], [0, Math.PI, 0]);
  addPlane(
    cw,
    cd,
    [cx, 0.005, cz],
    [-Math.PI / 2, 0, 0],
    scope.add(new MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.9 })),
  );
  addPlane(
    cw,
    cd,
    [cx, C.h, cz],
    [Math.PI / 2, 0, 0],
    scope.add(new MeshStandardMaterial({ color: 0xd0ccc0, roughness: 0.9 })),
  );
  addPlane(
    0.4,
    0.4,
    [cx, C.h - 0.005, cz],
    [Math.PI / 2, 0, 0],
    scope.add(new MeshBasicMaterial({ color: 0xfff2d8, toneMapped: false })),
  );
  const sober = scope.add(liftPanelTexture(false));
  const drunk = scope.add(liftPanelTexture(true));
  const panelMesh = addPlane(
    0.22,
    0.44,
    [C.x1 - 0.3, 1.2, C.z1 - 0.005],
    [0, Math.PI, 0],
    scope.add(
      new MeshStandardMaterial({
        map: sober,
        roughness: 0.4,
        metalness: 0.3,
        emissive: 0xffffff,
        emissiveMap: sober,
        emissiveIntensity: 0.25,
      }),
    ),
  );
  scene.add(liftCabin);
  const cabinFixture: Fixture = {
    pos: new Vector3(cx, C.h - 0.25, cz),
    color: 0xfff0d0,
    intensity: 2.2,
    distance: 4,
  };

  // ───────── the neighbours: the waitress's body, soap-pale, without a face ─────────
  const neighbourModels: Character[] = [];
  const vg = props.gltf('vierka');
  if (vg) {
    // faintly visible even in the dark: a pale shape in a black doorway
    const pale = scope.add(
      new MeshPhysicalMaterial({
        color: 0xd8d4cc,
        roughness: 0.55,
        sheen: 0.5,
        sheenColor: new Color(0xb8c0c8),
        emissive: 0x2a2e34,
      }),
    );
    for (let i = 0; i < 3; i++) {
      const c = new Character(vg);
      c.pose = 'stand';
      c.armOnTable = false;
      c.root.scale.set(0.92, 1.12, 0.92);
      c.model.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).material = pale;
      });
      c.root.visible = false;
      scene.add(c.root);
      neighbourModels.push(c);
    }
  }

  // ───────── light ─────────
  scene.background = new Color(0x04060b);
  scene.fog = new FogExp2(0x070a12, 0.008);
  scene.add(new HemisphereLight(0x3a4660, 0x0c0c10, 0.22));
  scene.add(new AmbientLight(0x1c2030, 0.12));
  const fixtures: Fixture[] = [
    { pos: new Vector3(-1.5, y0 + 2.2, -8.6), color: 0xffd49a, intensity: 5, distance: 10 },
    { pos: new Vector3(-5.3, y0 + 1.45, -7.55), color: 0xffc070, intensity: 2.2, distance: 6 },
    { pos: new Vector3(2.0, y0 + 2.1, -8.4), color: 0xfff0d8, intensity: 1.8, distance: 5 },
    { pos: new Vector3(-4.0, y0 + 2.35, -5.1), color: 0xfff0dc, intensity: 2.6, distance: 5 },
    { pos: new Vector3(-1.5, y0 + 2.35, -5.2), color: 0xffd49a, intensity: 1.6, distance: 4 },
    { pos: new Vector3(5.2, 2.3, -1.3), color: 0xffcf8a, intensity: 5.5, distance: 9 },
    // snow-light through each half-landing window: just enough to find the stairs in the dark
    ...Array.from({ length: FLOORS - 1 }, (_, k) => ({
      pos: new Vector3(0, k * FH + FH / 2 + 1.5, 3.3),
      color: 0x7a8ab4,
      intensity: 0.9,
      distance: 4.5,
    })),
    { pos: new Vector3(-1.5, 2.35, -5.3), color: 0xc8d8ff, intensity: 1.2, distance: 4, flicker: 7 },
    cabinFixture,
  ];

  return {
    waters,
    stairFixtures,
    fixtures,
    slots,
    doorMesh,
    peepholes,
    lampMat,
    drawSign,
    plates,
    flatDoor,
    bathDoor,
    caretakerDoor,
    liftDoors,
    liftBodies,
    liftCabin,
    cabinFixture,
    panel: { mesh: panelMesh, sober, drunk },
    tvScreen,
    litWindow,
    snow,
    key,
    bottles: { slivovica, caj },
    neighbourModels,
    spots: {
      tubLie: new Vector3(-5.0, y0 + 0.06, -5.74),
      tubOut: new Vector3(-4.3, y0, -4.95),
      mirror: mirror.position.clone(),
      wallunit: new Vector3(-2.95, y0 + 1.25, -10.4),
      bottle: slivovica.position.clone().setY(y0 + 1.4),
      tv: new Vector3(-4.95, y0 + 0.75, -10.35),
      window: flatPane.position.clone(),
      kitchen: pot.position.clone(),
      fridge: new Vector3(2.62, y0 + 1.0, -9.1),
      flatDoor: new Vector3(-1.5, y0 + 1.1, -4.0),
      bathDoor: new Vector3(-2.6, y0 + 1.05, -5.2),
      hallInside: new Vector3(-1.5, y0, -5.0),
      mailboxes: mail.position.clone(),
      entrance: entranceGlass.position.clone(),
      intercom: intercom.position.clone(),
      groundLanding: new Vector3(0, 0, -2.4),
      caretakerDoor: new Vector3(2.95, 1.1, -2.6),
      caretakerInside: new Vector3(4.2, 0, -2.6),
      photos: new Vector3(6.1, 1.6, -3.93),
      note: note.position.clone(),
      key: key.position.clone(),
      caj: caj.position.clone().setY(1.0),
      demijohn: demijohn.position.clone().setY(1.1),
      coat: coat.position.clone(),
    },
  };
}

/** Matrix of the lift's swing door on floor k, opened by `deg` degrees out onto the landing. */
export function liftDoorMatrix(k: number, deg: number, out = new Matrix4()): Matrix4 {
  return out.makeRotationY(-Math.PI / 2 + (deg * Math.PI) / 180).setPosition(-2.93, k * FH, -3.075);
}

// ───────── geometry helpers ─────────

/** Collects world-space quads (with world-space UVs) facing a given normal. */
class QuadBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  quad(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
  ): void {
    // flip the winding when it disagrees with the wanted normal
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const order = nx * n[0] + ny * n[1] + nz * n[2] >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    const horizontal = Math.abs(n[1]) > 0.5;
    for (const p of order) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      if (horizontal) this.uv.push(p[0], p[2]);
      else this.uv.push(Math.abs(n[0]) > 0.5 ? p[2] : p[0], p[1]);
    }
  }
  build(uvScale: number): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute(
      'uv',
      new Float32BufferAttribute(
        this.uv.map((v) => v / uvScale),
        2,
      ),
    );
    g.computeBoundingSphere();
    return g;
  }
}

/** Endless panel blocks in the snow; the one across from our window has a single lit window. */
function buildEstate(scene: Scene, scope: Scope): Block['litWindow'] {
  const facade = scope.add(facadeTexture());
  // nothing lights the yard: the blocks show by the snow's faint glow (emissive), dark windows and all
  const mat = scope.add(
    new MeshStandardMaterial({
      map: facade,
      roughness: 0.92,
      emissive: 0x9aa4b8,
      emissiveMap: facade,
      emissiveIntensity: 0.22,
    }),
  );
  const slabGeo = scope.add(blockGeometry(36, 9 * FH, 12));
  const towerGeo = scope.add(blockGeometry(14, 13 * FH, 14));
  const slabs: Matrix4[] = [];
  const towers: Matrix4[] = [];
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let gx = -7; gx <= 7; gx++)
    for (let gz = -7; gz <= 7; gz++) {
      const x = gx * 52 + (r() - 0.5) * 10;
      const z = gz * 44 + (r() - 0.5) * 8;
      const rot = r() < 0.5 ? 0 : Math.PI / 2;
      const tower = r() >= 0.65;
      // keep the yard around our house (and the slab across from our window) clear
      const hx = tower ? 7 : rot ? 6 : 18;
      const hz = tower ? 7 : rot ? 18 : 6;
      if (x + hx > -26 && x - hx < 26 && z + hz > -44 && z - hz < 38) continue;
      (tower ? towers : slabs).push(new Matrix4().makeRotationY(rot).setPosition(x, 0, z));
    }
  // the slab across from our flat (its facade faces our window), and a few behind the stairwell
  slabs.push(new Matrix4().makeTranslation(-2, 0, -34));
  slabs.push(new Matrix4().makeTranslation(4, 0, 30));
  towers.push(new Matrix4().makeTranslation(-30, 0, 18));
  const slabMesh = new InstancedMesh(slabGeo, mat, slabs.length);
  slabs.forEach((m, i) => slabMesh.setMatrixAt(i, m));
  const towerMesh = new InstancedMesh(towerGeo, mat, towers.length);
  towers.forEach((m, i) => towerMesh.setMatrixAt(i, m));
  slabMesh.frustumCulled = towerMesh.frustumCulled = false;
  scene.add(slabMesh, towerMesh);
  const ground = new Mesh(
    scope.add(new PlaneGeometry(900, 900)),
    // drawn as if a little further away: it lies in the plane of the ground floor's own floors
    // (terrazzo, lino) and flickered through them; the blocks still stand on it
    scope.add(
      new MeshBasicMaterial({
        color: 0x3a4456,
        polygonOffset: true,
        polygonOffsetFactor: 4,
        polygonOffsetUnits: 8,
      }),
    ),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // the lit window: the 8th floor of the slab across, straight out of our window
  const empty = scope.add(windowTexture(false));
  const me = scope.add(windowTexture(true));
  const lit = new Mesh(
    scope.add(new PlaneGeometry(1.2, 1.25)),
    scope.add(new MeshBasicMaterial({ map: empty, toneMapped: false })),
  );
  lit.position.set(1.0, 8 * FH + 1.5, -27.97);
  scene.add(lit);
  return { mesh: lit, empty, me };
}

/** Box geometry whose UVs repeat the facade tile every 6 m and every floor. */
function blockGeometry(w: number, h: number, d: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const uv = g.getAttribute('uv') as BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const widths = [d, d, w, w, w, w];
  const heights = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const vi = f * 4 + i;
      uv.setXY(vi, (uv.getX(vi) * widths[f]!) / 6, (uv.getY(vi) * heights[f]!) / FH);
    }
  return g;
}

/** Snow falling outside the windows (positions from render time: frame-rate independent). */
function buildSnowfall(scene: Scene, scope: Scope): Block['snow'] {
  const N = 1800;
  const base = new Float32Array(N * 3);
  let s = 5;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    let x: number;
    let z: number;
    do {
      x = (r() - 0.5) * 70;
      z = (r() - 0.5) * 70;
    } while (x > -7 && x < 8 && z > -11.5 && z < 4.5);
    base[i * 3] = x;
    base[i * 3 + 1] = r() * 40;
    base[i * 3 + 2] = z;
  }
  const pos = new Float32Array(N * 3);
  const geo = scope.add(new BufferGeometry());
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const points = new Points(
    geo,
    scope.add(
      new PointsMaterial({ color: 0xdfe6f0, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false }),
    ),
  );
  points.frustumCulled = false;
  scene.add(points);
  const step = (t: number) => {
    for (let i = 0; i < N; i++) {
      const ph = i * 0.37;
      pos[i * 3] = base[i * 3]! + Math.sin(t * 0.6 + ph) * 0.4;
      pos[i * 3 + 1] = 40 - ((40 - base[i * 3 + 1]! + t * 0.9) % 40);
      pos[i * 3 + 2] = base[i * 3 + 2]! + Math.cos(t * 0.45 + ph) * 0.4;
    }
    geo.getAttribute('position').needsUpdate = true;
  };
  step(0);
  return { points, step };
}

/** The TV: snow on the screen, and in the snow two dots circling each other. */
function staticScreen(scope: Scope, w: number, h: number): Block['tvScreen'] {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 72;
  const g = c.getContext('2d')!;
  const tex = scope.add(new CanvasTexture(c));
  tex.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    scope.add(new PlaneGeometry(w, h)),
    scope.add(new MeshBasicMaterial({ map: tex, toneMapped: false })),
  );
  const img = g.createImageData(96, 72);
  let frame = -1;
  const draw = (t: number) => {
    const f = Math.floor(t * 15);
    if (f === frame) return;
    frame = f;
    const d = img.data;
    let s = (f * 2654435761) >>> 0 || 1;
    for (let i = 0; i < d.length; i += 4) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const v = 40 + ((s >>> 0) % 150);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const a = t * 0.8;
    g.fillStyle = '#ffffff';
    for (const k of [0, Math.PI]) {
      g.beginPath();
      g.arc(48 + Math.cos(a + k) * 9, 36 + Math.sin(a + k) * 6, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    tex.needsUpdate = true;
  };
  return { mesh, draw };
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

function doormatTexture(): CanvasTexture {
  return canvasTex(128, 82, (g) => {
    g.fillStyle = '#5a4026';
    g.fillRect(0, 0, 128, 82);
    for (let i = 0; i < 900; i++) {
      const x = (i * 73) % 128;
      const y = (i * 151) % 82;
      g.fillStyle = i % 3 ? 'rgba(30,20,10,0.35)' : 'rgba(150,110,60,0.3)';
      g.fillRect(x, y, 1, 3);
    }
    g.strokeStyle = '#2a1c10';
    g.lineWidth = 6;
    g.strokeRect(5, 5, 118, 72);
  });
}

function doorTexture(): CanvasTexture {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#6a4630';
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 3) {
      g.fillStyle = `rgba(40,24,12,${0.06 + 0.06 * Math.sin(y * 0.37)})`;
      g.fillRect(0, y, 128, 2);
    }
    g.strokeStyle = 'rgba(30,18,10,0.6)';
    g.lineWidth = 2;
    g.strokeRect(6, 6, 116, 244);
    g.fillStyle = '#b8a060'; // nameplate
    g.fillRect(40, 70, 48, 14);
    g.fillStyle = '#c8c0b0'; // handle and lock
    g.fillRect(98, 128, 18, 6);
    g.fillStyle = '#2a2a2a';
    g.fillRect(104, 140, 6, 10);
  });
}

function frostTexture(): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 20, 128, 128, 175);
    grd.addColorStop(0, 'rgba(190,205,225,0.08)');
    grd.addColorStop(0.6, 'rgba(215,228,240,0.35)');
    grd.addColorStop(1, 'rgba(240,248,255,0.95)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 70; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const r = 95 + ((i * 37) % 40);
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
      g.lineTo(128 + Math.cos(a + 0.2) * (r + 30), 128 + Math.sin(a + 0.2) * (r + 30));
      g.stroke();
    }
  });
}

/** One facade tile: 6 m of concrete panels with four dark windows, one floor high. */
function facadeTexture(): CanvasTexture {
  const t = canvasTex(256, 120, (g) => {
    g.fillStyle = '#5a5c60';
    g.fillRect(0, 0, 256, 120);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, 256, 2);
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 2, 120);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#0b0d12';
      g.fillRect(i * 64 + 12, 30, 40, 52);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(i * 64 + 10, 82, 44, 4);
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** The single lit window across the yard; drunk, you see who stands in it. */
function windowTexture(me: boolean): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, '#ffd890');
    grd.addColorStop(1, '#e8a050');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#3a2a1a';
    g.fillRect(30, 0, 4, 64);
    g.fillRect(0, 30, 64, 3);
    if (me) {
      g.fillStyle = '#120c08';
      g.beginPath();
      g.arc(20, 26, 6, 0, Math.PI * 2);
      g.fill();
      g.fillRect(12, 32, 16, 32);
    }
  });
}

/** What the mirror shows: umakart panels, and behind you the bathroom door, open onto the dark hall. */
function mirrorTexture(): CanvasTexture {
  return canvasTex(128, 166, (g) => {
    g.fillStyle = '#b8aa88';
    g.fillRect(0, 0, 128, 166);
    for (let x = 4; x < 128; x += 22) {
      g.fillStyle = 'rgba(60,50,30,0.35)';
      g.fillRect(x, 0, 2, 166);
    }
    // the doorway, on the right, and the hall beyond it, dark
    g.fillStyle = '#16100a';
    g.fillRect(70, 34, 50, 132);
    // the door leaf, swung open toward you
    g.fillStyle = '#d8d0bc';
    g.beginPath();
    g.moveTo(70, 34);
    g.lineTo(52, 22);
    g.lineTo(52, 166);
    g.lineTo(70, 166);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(54, 92, 4, 10);
    // silvering: cool tint, darker edges
    const grd = g.createRadialGradient(64, 83, 30, 64, 83, 110);
    grd.addColorStop(0, 'rgba(200,215,225,0.12)');
    grd.addColorStop(1, 'rgba(20,24,30,0.55)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 166);
  });
}

/** Painted interior door with two panels. */
function innerDoorTexture(): CanvasTexture {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#ddd6c4';
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(80,70,50,0.35)';
    g.lineWidth = 3;
    g.strokeRect(16, 16, 96, 100);
    g.strokeRect(16, 136, 96, 104);
    g.fillStyle = '#9a9488';
    g.fillRect(100, 124, 16, 5);
  });
}

function doilyTexture(): CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.strokeStyle = '#f4f0e6';
    g.lineWidth = 2;
    for (let r = 10; r < 62; r += 7) {
      g.beginPath();
      g.arc(64, 64, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62);
      g.stroke();
    }
  });
}

function rugTexture(): CanvasTexture {
  return canvasTex(256, 188, (g) => {
    g.fillStyle = '#6a1e1a';
    g.fillRect(0, 0, 256, 188);
    g.strokeStyle = '#c8a050';
    g.lineWidth = 6;
    g.strokeRect(12, 12, 232, 164);
    g.fillStyle = '#1e2a4a';
    g.beginPath();
    g.ellipse(128, 94, 70, 44, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d8c090';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(128, 94, 50, 28, 0, 0, Math.PI * 2);
    g.stroke();
  });
}

function labelTexture(text: string, bg: string, fg: string): CanvasTexture {
  return canvasTex(128, 48, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 48);
    g.fillStyle = fg;
    g.font = "bold 15px 'IBM Plex Sans Condensed', Arial";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 25);
  });
}

function mailboxTexture(): CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#8a8a82';
    g.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 8; x++) {
        g.strokeStyle = '#3a3a36';
        g.lineWidth = 3;
        g.strokeRect(x * 64 + 3, y * 64 + 3, 58, 58);
        g.fillStyle = '#1a1a18';
        g.fillRect(x * 64 + 12, y * 64 + 12, 40, 6);
        g.fillStyle = '#f0ece0';
        g.fillRect(x * 64 + 8, y * 64 + 34, 48, 14);
        g.fillStyle = '#202020';
        g.font = "bold 10px 'IBM Plex Sans Condensed', Arial";
        g.fillText('KOLESÁR', x * 64 + 11, y * 64 + 45);
      }
  });
}

function intercomTexture(): CanvasTexture {
  return canvasTex(110, 200, (g) => {
    g.fillStyle = '#b8b4a8';
    g.fillRect(0, 0, 110, 200);
    g.fillStyle = '#303030';
    for (let i = 0; i < 6; i++) g.fillRect(14, 30 + i * 8, 82, 3);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = '#f2eee2';
      g.fillRect(10, 96 + i * 20, 70, 14);
      g.fillStyle = '#303030';
      g.font = "9px 'IBM Plex Sans Condensed', Arial";
      g.fillText('KOLESÁR', 14, 106 + i * 20);
      g.fillStyle = i === 2 ? '#ff9a30' : '#505050';
      g.beginPath();
      g.arc(92, 103 + i * 20, 5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function noteTexture(): CanvasTexture {
  return canvasTex(96, 132, (g) => {
    g.fillStyle = '#f2eedc';
    g.fillRect(0, 0, 96, 132);
    g.strokeStyle = '#2a3a8a';
    g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(10, 20 + i * 11);
      for (let x = 10; x < 86; x += 6) g.lineTo(x, 20 + i * 11 + Math.sin(x * 0.9 + i) * 1.6);
      g.stroke();
    }
    g.fillStyle = '#2a3a8a';
    g.font = "bold 16px 'IBM Plex Sans Condensed', Arial";
    g.fillText('– E.', 56, 124);
  });
}

function photoTexture(i: number): CanvasTexture {
  return canvasTex(160, 120, (g) => {
    const st = [
      { bg: '#b89a70', fg: '#4a3420', sky: '#d8c4a0' }, // 1906, sepia
      { bg: '#9a8a7a', fg: '#4a3a40', sky: '#c8b8a8' }, // 1986, faded colour
      { bg: '#8a7a6a', fg: '#3a2a20', sky: '#d0c0a0' }, // 2026
      { bg: '#141414', fg: '#2a2a2a', sky: '#000000' }, // the black sky
    ][i]!;
    g.fillStyle = st.sky;
    g.fillRect(0, 0, 160, 120);
    g.fillStyle = st.bg;
    g.fillRect(0, 70, 160, 50);
    g.fillStyle = i === 3 ? '#d8d0c0' : st.fg;
    g.beginPath();
    g.arc(55, 48, 10, 0, Math.PI * 2);
    g.arc(108, 40, 15, 0, Math.PI * 2);
    g.fill();
    g.fillRect(44, 58, 22, 30);
    g.fillRect(92, 55, 32, 38);
    g.fillStyle = i === 3 ? '#8a8478' : '#2a1a10';
    g.fillRect(30, 86, 100, 8);
    g.fillStyle = '#f4ecd8';
    g.font = "bold 12px 'IBM Plex Sans Condensed', Arial";
    g.fillText(['1906', '1986', '2026', ''][i]!, 6, 114);
    g.strokeStyle = '#f4ecd8';
    g.lineWidth = 6;
    g.strokeRect(0, 0, 160, 120);
  });
}

function liftDoorTexture(): CanvasTexture {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#5a3c2a';
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#141414';
    g.fillRect(44, 56, 40, 76);
    g.strokeStyle = '#9a9a90';
    g.lineWidth = 3;
    g.strokeRect(44, 56, 40, 76);
    g.fillStyle = '#c8c0a8';
    g.fillRect(102, 128, 12, 26);
  });
}

function cabinTexture(): CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#8a6a48';
    g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 32) {
      g.fillStyle = '#6a4a30';
      g.fillRect(x, 0, 3, 128);
    }
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(0, 96, 128, 32);
  });
}

/** The cabin's button panel: P and 1–8; drunk, also 14, 40, 100 and ∞. */
function liftPanelTexture(drunk: boolean): CanvasTexture {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#2a2a2a';
    g.fillRect(0, 0, 128, 256);
    const labels = ['P', '1', '2', '3', '4', '5', '6', '7', '8'];
    if (drunk) labels.push('14', '40', '100', '∞');
    labels.forEach((l, i) => {
      const x = 34 + (i % 2) * 60;
      const y = 24 + Math.floor(i / 2) * 34;
      g.fillStyle = i >= 9 ? '#d8a040' : '#c8c0b0';
      g.beginPath();
      g.arc(x, y, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a1a1a';
      g.font = `bold ${l.length > 2 ? 12 : 16}px 'IBM Plex Sans Condensed', Arial`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(l, x, y + 1);
    });
  });
}

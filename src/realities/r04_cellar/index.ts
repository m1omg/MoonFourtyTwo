import {
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
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import type { KitMaterial } from '../../world/kit/Builder.ts';
import { Props } from '../../world/props.ts';
import { instanceModel, type InstanceXform } from '../../world/instancing.ts';
import { textTexture } from '../../world/proceduralTextures.ts';
import { ARM_SHOVEL, Character } from '../../npc/Character.ts';
import { NavGrid, Area } from '../../sim/ai/nav/NavGrid.ts';
import { Hisser } from '../../sim/ai/behaviors/Hisser.ts';
import { LightPool, type Fixture } from '../../world/lightPool.ts';
import { loadVoiceIndex, voiceUrl, type Lines } from '../../narrative/voice.ts';
import { MusicBox, TUNES } from '../../audio/procedural/musicbox.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { clamp, damp } from '../../core/damp.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';

const E = 'Ežo';
export const L4: Lines = {
  t_stairs: { who: null, text: 'Schody dole. Pivnica. Pivo, kvasnice a niečo kovové.' },
  t_door: { who: null, text: 'Zamknuté. Z tejto strany nemajú kľučku.' },
  t_bottles: { who: null, text: 'Prepravka prázdnych fliaš. Môžu sa hodiť.' },
  t_hiss: { who: null, text: 'V rúrach niečo syčí. A pohybuje sa to.' },
  t_grate: { who: null, text: 'Mreže pod nohami. Každý krok tu duní.' },
  e4_1: { who: E, text: 'Tak si to našiel. Toto je moja kotolňa.' },
  e4_2: { who: E, text: 'Moja robota je, aby nevyhaslo.' },
  e4_3: { who: E, text: 'To nečítaj, to sú len moje poznámky.' },
  e4_4: {
    who: E,
    text: 'Teplá voda z kotolne ide do kúpeľov. Keď otvoríš stavidlo, voda ťa tam donesie.',
  },
  e4_5: { who: E, text: 'Ale choď potichu. V rúrach niečo žije a počuje lepšie ako ja.' },
  e4_6: { who: E, text: 'Choď. Ja tu musím prikladať.' },
  e4_7: { who: E, text: 'Ventily? Ako všetko, starý. Od konca.' },
  e4_8: { who: E, text: 'Ako sa púšťajú ventily? Mám to v denníku. Ale ten nečítaj.' },
  t_log_title: { who: null, text: 'Prevádzkový denník kotolne' },
  t_valve_wrong: { who: null, text: 'Potrubím sa ozvala rana. Tlak spadol. Takto nie.' },
  t_valve_ok: { who: null, text: 'Ventil povolil. Tlak stúpa.' },
  t_sluice: { who: null, text: 'Niekde pri kotli sa zdvihlo stavidlo. Voda sa valí do žľabu.' },
  t_pipe: { who: null, text: 'Odtoková rúra. Teplá voda tečie dolu, do tmy.' },
  t_pipe_dry: { who: null, text: 'Odtoková rúra. Suchá. Najprv treba pustiť vodu.' },
};

const LOGBOOK = `Prevádzkový denník kotolne — ZŠ Kolesovo

1. 10.    Teplota v kotli 82 °C. Uhlia dosť. Hviezdy: všetky.
2. 10.    Teplota 80 °C. Vraj zajtra prvý mráz.
10¹⁴.     Teplota 41 °C. Nové hviezdy sa už nerodia. Kúrim ďalej.
10⁴⁰.     Teplota 9 °C. Hviezdy zhasli. Ostali čierne diery. Uhlie dochádza.
10¹⁰⁰.    Teplota takmer nula. Aj diery sa vyparili. Ostali sme len my dvaja.

Ventily púšťať vždy rovnako: koniec, začiatok, stred.
Inak buchne celé potrubie a to, čo býva v rúrach, sa zobudí.

— E. K.`;

/** Floor height of everything below the stairs. */
const F = -3;
/** Valve tags in wall order; the right order is end, beginning, middle (3 – 1 – 2). */
const VALVE_TAGS = ['10¹⁴', '10⁴⁰', '10¹⁰⁰'] as const;
const VALVE_ORDER = [2, 0, 1];

/*
 * Layout (metres). The player comes down the stairs facing -z.
 *   stairwell  x[-0.8,0.8]  z[-3,4]       landing y=0 at z[1.2,4], stairs down to y=F
 *   cellar     x[-5,5]      z[-13,-3]     ceiling F+2.5
 *   tunnel A   x[-1.2,1.2]  z[-43,-13]    grate (loud) at z[-30,-22]
 *   cross 1/2  x[1.2,6.8]   z -16±1.2 and -36±1.2
 *   tunnel B   x[6.8,9.2]   z[-38.2,-13.8]
 *   gallery    x[-4,4]      z[-48,-43]    three valves on the east wall
 *   boiler     x[-8,8]      z[-62,-48]    the creature never comes in here
 */

type Span = [number, number];

const reality: RealityModule = {
  id: 'r4',
  index: 4,
  title: 'Pivnica a kotolňa',
  async create(ctx) {
    const { game, scene, scope, builder: b, mats } = ctx;
    await loadVoiceIndex();
    const props = new Props(game.loader, scene, scope, b);
    await props.load(
      [
        'wooden_barrels_01',
        'wine_barrel_01',
        'propane_tank',
        'wooden_crate_01',
        'steel_frame_shelves_01',
        'metal_office_desk',
        'rusted_spade_01',
        'boombox',
        'industrial_caged_sconce',
        'caged_hanging_light',
        'ezo',
      ],
      (p) => ctx.progress(p * 0.6),
    );
    const say = async (id: string, sp?: Character | null) => {
      const l = L4[id]!;
      sp?.setTalking(true);
      try {
        await game.say(l.who, l.text, voiceUrl(id));
      } finally {
        sp?.setTalking(false);
      }
    };

    // ───────── materials ─────────
    const brick = mats.get('cellarBrick', {
      tex: 'brick_wall_02',
      proc: 'brick',
      color: 0x6a3a2a,
      uvScale: 2.2,
      surface: 'concrete',
      tint: 0xb8a898,
    });
    const concrete = mats.get('tunnelConcrete', {
      tex: 'concrete_wall_004',
      proc: 'concrete',
      color: 0x5a5852,
      uvScale: 2.5,
      surface: 'concrete',
    });
    const floorC = mats.get('tunnelFloor', {
      tex: 'concrete_floor_worn_001',
      proc: 'concrete',
      color: 0x4a4844,
      uvScale: 2.5,
      surface: 'concrete',
    });
    const grate = mats.get('grate', {
      tex: 'metal_grate_rusty',
      proc: 'metal',
      color: 0x4a3a2a,
      uvScale: 1.2,
      surface: 'metal',
      metalness: 0.8,
      roughness: 0.6,
    });
    const rust = mats.get('rustPipe', {
      tex: 'rusty_metal_02',
      proc: 'metal',
      color: 0x6a4a36,
      uvScale: 1.5,
      surface: 'metal',
      metalness: 0.6,
      roughness: 0.55,
    });
    const wood = mats.get('stairWood', {
      tex: 'dark_wooden_planks',
      proc: 'planks',
      color: 0x3b2516,
      uvScale: 1.5,
      surface: 'wood',
    });

    // ───────── shell ─────────
    /** A box room: x0<x1, z0<z1; n = z0 side, s = z1 side, w = x0 side, e = x1 side. */
    const room = (
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      y0: number,
      y1: number,
      wall: KitMaterial,
      floor: KitMaterial,
      doors: Partial<Record<'n' | 's' | 'w' | 'e', Span | 'skip'>> = {},
    ) => {
      b.floor(x0, z0, x1, z1, y0, floor);
      b.ceiling(x0, z0, x1, z1, y1, wall);
      const cut = (d: Span | 'skip' | undefined, start: number) =>
        d && d !== 'skip'
          ? [
              {
                at: Math.abs((d[0] + d[1]) / 2 - start),
                width: Math.abs(d[1] - d[0]),
                bottom: y0,
                top: y0 + 2.3,
              },
            ]
          : [];
      if (doors.n !== 'skip') b.wall(x0, z0, x1, z0, y0, y1, wall, 0.3, cut(doors.n, x0));
      if (doors.s !== 'skip') b.wall(x0, z1, x1, z1, y0, y1, wall, 0.3, cut(doors.s, x0));
      if (doors.w !== 'skip') b.wall(x0, z0, x0, z1, y0, y1, wall, 0.3, cut(doors.w, z0));
      if (doors.e !== 'skip') b.wall(x1, z0, x1, z1, y0, y1, wall, 0.3, cut(doors.e, z0));
    };

    // stairwell: landing at the top, 14 steps down to the cellar door at z = -3
    b.floor(-0.8, 1.2, 0.8, 4, 0, wood);
    b.stairs(-0.8, -3, 1.6, 4.2, F, 0, '+z', wood, 14);
    b.wall(-0.8, -3, -0.8, 4, F, 2.6, brick, 0.3);
    b.wall(0.8, -3, 0.8, 4, F, 2.6, brick, 0.3);
    b.wall(-0.8, 4, 0.8, 4, 0, 2.6, brick, 0.3);
    b.ceiling(-0.8, 1.2, 0.8, 4, 2.6, brick);
    // the ceiling steps down with the stairs (solid slabs, so no gaps between the steps)
    for (const [z0, z1, y] of [
      [0.15, 1.2, 2.1],
      [-0.9, 0.15, 1.35],
      [-1.95, -0.9, 0.6],
      [-3, -1.95, -0.15],
    ] as const)
      b.box([-0.8, y, z0], [0.8, 2.8, z1], brick);
    b.wall(-0.8, -3, 0.8, -3, F + 2.5, -0.15, brick, 0.3); // lintel above the cellar door

    room(-5, -13, 5, -3, F, F + 2.5, brick, floorC, { s: [-0.8, 0.8], n: [-1.2, 1.2] });

    // tunnel A
    b.floor(-1.2, -43, 1.2, -30, F, floorC);
    b.floor(-1.2, -30, 1.2, -22, F, grate);
    b.floor(-1.2, -22, 1.2, -13, F, floorC);
    b.ceiling(-1.2, -43, 1.2, -13, F + 2.5, concrete);
    b.wall(-1.2, -43, -1.2, -13, F, F + 2.5, concrete, 0.3);
    b.wall(1.2, -43, 1.2, -13, F, F + 2.5, concrete, 0.3, [
      { at: 7, width: 2.4, bottom: F, top: F + 2.3 }, // cross passage at z -36
      { at: 27, width: 2.4, bottom: F, top: F + 2.3 }, // cross passage at z -16
    ]);
    // cross passages
    for (const zc of [-16, -36]) {
      b.floor(1.2, zc - 1.2, 6.8, zc + 1.2, F, floorC);
      b.ceiling(1.2, zc - 1.2, 6.8, zc + 1.2, F + 2.5, concrete);
      b.wall(1.2, zc - 1.2, 6.8, zc - 1.2, F, F + 2.5, concrete, 0.3);
      b.wall(1.2, zc + 1.2, 6.8, zc + 1.2, F, F + 2.5, concrete, 0.3);
    }
    // tunnel B
    b.floor(6.8, -38.2, 9.2, -13.8, F, floorC);
    b.ceiling(6.8, -38.2, 9.2, -13.8, F + 2.5, concrete);
    b.wall(9.2, -38.2, 9.2, -13.8, F, F + 2.5, concrete, 0.3);
    b.wall(6.8, -38.2, 6.8, -13.8, F, F + 2.5, concrete, 0.3, [
      { at: 2.2, width: 2.4, bottom: F, top: F + 2.3 }, // z -36
      { at: 22.2, width: 2.4, bottom: F, top: F + 2.3 }, // z -16
    ]);
    b.wall(6.8, -13.8, 9.2, -13.8, F, F + 2.5, concrete, 0.3);
    b.wall(6.8, -38.2, 9.2, -38.2, F, F + 2.5, concrete, 0.3);

    // gallery (its north wall is the boiler room's south wall)
    room(-4, -48, 4, -43, F, F + 3.2, concrete, floorC, { s: [-1.2, 1.2], n: 'skip' });
    // boiler room
    room(-8, -62, 8, -48, F, F + 5, brick, floorC, { s: [-1, 1] });

    // ───────── pipes (instanced) ─────────
    const pipeGeo = scope.add(new CylinderGeometry(0.1, 0.1, 1, 10));
    const flangeGeo = scope.add(new TorusGeometry(0.12, 0.03, 6, 14));
    const pipeX: Matrix4[] = [];
    const flangeX: Matrix4[] = [];
    const alongZ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const runZ = (x: number, y: number, z0: number, z1: number) => {
      const len = Math.abs(z1 - z0);
      pipeX.push(new Matrix4().compose(new Vector3(x, y, (z0 + z1) / 2), alongZ, new Vector3(1, len, 1)));
      for (let z = Math.min(z0, z1) + 1.5; z < Math.max(z0, z1); z += 3)
        flangeX.push(new Matrix4().makeTranslation(x, y, z));
    };
    runZ(-0.93, F + 2.2, -13, -43);
    runZ(-0.93, F + 1.95, -13, -43);
    runZ(0.93, F + 2.25, -13, -43);
    runZ(8.93, F + 2.2, -13.8, -38.2);
    runZ(7.07, F + 2.05, -13.8, -38.2);
    runZ(3.68, F + 1.3, -43.2, -47.8); // feeds the valves
    const pipes = new InstancedMesh(pipeGeo, rust.material, pipeX.length);
    pipeX.forEach((m, i) => pipes.setMatrixAt(i, m));
    const flanges = new InstancedMesh(flangeGeo, rust.material, flangeX.length);
    flangeX.forEach((m, i) => flanges.setMatrixAt(i, m));
    scene.add(pipes, flanges);

    // ───────── cellar props ─────────
    props.place('wooden_barrels_01', { pos: [-2.9, F, -9.9], rotY: 0.25, scale: 0.75 });
    props.place('wine_barrel_01', { pos: [4.3, F, -4.2], rotY: 1.2 });
    props.place('wine_barrel_01', { pos: [4.3, F, -5.1], rotY: 0.2 });
    for (const [x, z] of [
      [4.4, -7.4],
      [4.4, -8.0],
      [3.85, -7.7],
    ] as const)
      props.place('propane_tank', { pos: [x, F, z], scale: 1.6 });
    props.place('steel_frame_shelves_01', { pos: [-4.6, F, -5.2], rotY: Math.PI / 2, scale: 0.1 });
    props.place('wooden_crate_01', { pos: [-1.6, F, -4.4], rotY: 0.3 });
    const steel = scope.add(new MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.35 }));
    const kegs = new InstancedMesh(scope.add(new CylinderGeometry(0.2, 0.2, 0.6, 16)), steel, 6);
    for (let i = 0; i < 6; i++)
      kegs.setMatrixAt(
        i,
        new Matrix4().makeTranslation(2.3 + (i % 3) * 0.45, F + 0.3, -12.35 + Math.floor(i / 3) * 0.45),
      );
    scene.add(kegs);
    b.box([2.05, F, -12.6], [3.45, F + 0.6, -11.65], null);
    // empty bottles standing in the crate
    const brownGlass = scope.add(
      new MeshPhysicalMaterial({ color: 0x3a1c06, roughness: 0.15, transmission: 0.3, thickness: 0.01 }),
    );
    const bottles = new InstancedMesh(scope.add(new CylinderGeometry(0.035, 0.035, 0.24, 10)), brownGlass, 6);
    const necks = new InstancedMesh(scope.add(new CylinderGeometry(0.012, 0.03, 0.09, 8)), brownGlass, 6);
    for (let i = 0; i < 6; i++) {
      const x = -1.85 + (i % 3) * 0.12 + Math.floor(i / 3) * 0.05;
      const z = -4.4 + (Math.floor(i / 3) - 0.5) * 0.12 + (i % 3) * 0.04;
      bottles.setMatrixAt(i, new Matrix4().makeTranslation(x, F + 0.36, z));
      necks.setMatrixAt(i, new Matrix4().makeTranslation(x, F + 0.525, z));
    }
    scene.add(bottles, necks);

    // signs
    const signMat = (lines: string[], bg: string, fg: string, w = 512, h = 192) =>
      scope.add(
        new MeshStandardMaterial({
          map: scope.add(textTexture(lines, { width: w, height: h, bg, fg, size: 72 })),
          roughness: 0.8,
        }),
      );
    const sign = (
      mat: MeshStandardMaterial,
      w: number,
      h: number,
      pos: [number, number, number],
      rotY: number,
    ) => {
      const m = new Mesh(scope.add(new PlaneGeometry(w, h)), mat);
      m.position.set(...pos);
      m.rotation.y = rotY;
      scene.add(m);
    };
    sign(signMat(['← KOTOLŇA'], '#d8d0b8', '#1c1a16'), 0.9, 0.34, [2.4, F + 1.75, -12.83], 0);
    const steamSign = signMat(['POZOR! PARA'], '#e0b81c', '#141210');
    sign(steamSign, 0.6, 0.22, [-1.03, F + 1.62, -26.5], Math.PI / 2);
    sign(steamSign, 0.6, 0.22, [9.03, F + 1.62, -30], -Math.PI / 2);

    // the locked door at the top of the stairs
    const doorMat = scope.add(new MeshStandardMaterial({ map: doorTexture(scope), roughness: 0.75 }));
    const door = new Mesh(scope.add(new PlaneGeometry(1.1, 2.15)), doorMat);
    door.position.set(0, 1.075, 3.84);
    door.rotation.y = Math.PI;
    scene.add(door);

    // ───────── gallery: three valves under era gauges ─────────
    const valveMat = scope.add(
      new MeshStandardMaterial({ color: 0x8e1a12, metalness: 0.5, roughness: 0.45 }),
    );
    const bodyMat = scope.add(new MeshStandardMaterial({ color: 0x3a3430, metalness: 0.7, roughness: 0.5 }));
    const wheels: Group[] = [];
    VALVE_TAGS.forEach((tag, i) => {
      const z = -44.3 - i * 1.2;
      const body = new Mesh(scope.add(new CylinderGeometry(0.13, 0.13, 0.34, 14)), bodyMat);
      body.position.set(3.68, F + 1.3, z);
      const stem = new Mesh(scope.add(new CylinderGeometry(0.025, 0.025, 0.2, 8)), bodyMat);
      stem.rotation.z = Math.PI / 2;
      stem.position.set(3.48, F + 1.3, z);
      // the wheel spins about its own axle (local z), the holder turns it to face the room
      const holder = new Group();
      holder.position.set(3.38, F + 1.3, z);
      holder.rotation.y = Math.PI / 2;
      const wheel = new Group();
      wheel.add(new Mesh(scope.add(new TorusGeometry(0.17, 0.022, 8, 22)), valveMat));
      for (let k = 0; k < 2; k++) {
        const spoke = new Mesh(scope.add(new BoxGeometry(0.34, 0.025, 0.02)), valveMat);
        spoke.rotation.z = (k * Math.PI) / 2;
        wheel.add(spoke);
      }
      holder.add(wheel);
      scene.add(body, stem, holder);
      wheels.push(wheel);
      const plate = new Mesh(
        scope.add(new CircleGeometry(0.2, 28)),
        scope.add(
          new MeshStandardMaterial({ map: gaugeTexture(scope, tag, 0.15 + i * 0.3), roughness: 0.5 }),
        ),
      );
      plate.position.set(3.84, F + 1.9, z);
      plate.rotation.y = -Math.PI / 2;
      scene.add(plate);
    });

    // ───────── boiler room ─────────
    const boilerMat = scope.add(
      new MeshStandardMaterial({ color: 0x2c2723, metalness: 0.75, roughness: 0.55 }),
    );
    // the boiler lies along z with its fire door facing the entrance
    const boiler = new Mesh(scope.add(new CylinderGeometry(1.6, 1.6, 5, 28)), boilerMat);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(1.5, F + 1.85, -58.5);
    scene.add(boiler);
    for (const z of [-60.2, -58.5, -56.8]) {
      const band = new Mesh(scope.add(new TorusGeometry(1.62, 0.04, 6, 40)), bodyMat);
      band.position.set(1.5, F + 1.85, z);
      scene.add(band);
    }
    b.box([0.2, F, -60.8], [2.8, F + 0.25, -56.2], concrete);
    b.box([-0.1, F, -61.05], [3.1, F + 3.45, -55.95], null);
    const chimney = new Mesh(scope.add(new CylinderGeometry(0.35, 0.35, 2.2, 14)), boilerMat);
    chimney.position.set(1.5, F + 4.0, -60);
    scene.add(chimney);
    const FIRE_DOOR = new Vector3(1.5, F + 1.25, -55.94);
    const fireDoorMat = scope.add(new MeshBasicMaterial({ color: 0xff7a20, toneMapped: false }));
    const fireDoor = new Mesh(scope.add(new PlaneGeometry(0.8, 0.6)), fireDoorMat);
    fireDoor.position.copy(FIRE_DOOR);
    scene.add(fireDoor);
    // the door leaf hangs open on its hinge (right edge of the opening)
    const leaf = new Mesh(scope.add(new BoxGeometry(0.82, 0.62, 0.04)), boilerMat);
    const swing = 2.0;
    leaf.position.set(1.9 - 0.41 * Math.cos(swing), FIRE_DOOR.y, -55.95 + 0.41 * Math.sin(swing));
    leaf.rotation.y = swing;
    scene.add(leaf);
    const fire = new PointLight(0xff6a1a, 9, 14, 1.4);
    fire.position.set(1.5, F + 1.3, -55.2);
    scene.add(fire);
    // coal pile
    const coalMat = scope.add(new MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.4, metalness: 0.15 }));
    const coal = new InstancedMesh(scope.add(new SphereGeometry(0.11, 6, 5)), coalMat, 240);
    {
      let s = 9;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 240; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 1.15;
        const h = Math.max(0, 0.75 - d * 0.62) * (0.55 + 0.45 * r());
        coal.setMatrixAt(
          i,
          new Matrix4().compose(
            new Vector3(-1.7 + Math.cos(a) * d, F + h + 0.05, -54.6 + Math.sin(a) * d),
            new Quaternion(),
            new Vector3(1 + r(), 0.7 + r() * 0.6, 1 + r()),
          ),
        );
      }
    }
    scene.add(coal);
    b.box([-2.75, F, -55.65], [-0.65, F + 0.6, -53.55], null);
    // desk with the logbook and a radio
    props.place('metal_office_desk', { pos: [7.35, F, -52], rotY: Math.PI / 2 });
    props.place('boombox', { pos: [7.45, F + 0.79, -51.25], rotY: -Math.PI / 2, collide: 'none' });
    const book = new Mesh(
      scope.add(new BoxGeometry(0.24, 0.035, 0.32)),
      scope.add(new MeshStandardMaterial({ color: 0x5a1c16, roughness: 0.8 })),
    );
    book.position.set(7.15, F + 0.81, -52.5);
    book.rotation.y = 0.2;
    scene.add(book);
    // water trough along the west wall, fed through a sluice, drained by the overflow pipe
    b.box([-6.15, F, -61.85], [-6.0, F + 0.6, -50.5], concrete);
    b.box([-7.85, F, -50.65], [-6.0, F + 0.6, -50.5], concrete);
    const waterMat = scope.add(
      new MeshPhysicalMaterial({
        color: 0x0b1714,
        roughness: 0.06,
        clearcoat: 1,
        transparent: true,
        opacity: 0.88,
      }),
    );
    const water = new Mesh(scope.add(new PlaneGeometry(1.7, 11.2)), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(-7.0, F + 0.04, -56.25);
    scene.add(water);
    const outlet = new Mesh(scope.add(new CylinderGeometry(0.26, 0.26, 0.4, 16)), rust.material);
    outlet.rotation.z = Math.PI / 2;
    outlet.position.set(-7.65, F + 0.95, -51.3);
    scene.add(outlet);
    const gate = new Mesh(scope.add(new BoxGeometry(0.06, 0.7, 0.7)), rust.material);
    gate.position.set(-7.42, F + 0.95, -51.3);
    scene.add(gate);
    const streamMat = scope.add(
      new MeshBasicMaterial({
        color: 0x9ab0aa,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    const stream = new Mesh(scope.add(new PlaneGeometry(0.36, 0.95)), streamMat);
    stream.position.set(-7.3, F + 0.48, -51.3);
    stream.rotation.y = Math.PI / 2;
    scene.add(stream);
    const mouthRing = new Mesh(scope.add(new TorusGeometry(0.6, 0.1, 10, 28)), rust.material);
    mouthRing.position.set(-7.0, F + 0.55, -61.8);
    const mouthDark = new Mesh(
      scope.add(new CircleGeometry(0.6, 28)),
      scope.add(new MeshBasicMaterial({ color: 0x000000 })),
    );
    mouthDark.position.set(-7.0, F + 0.55, -61.83);
    scene.add(mouthRing, mouthDark);

    // ───────── lights: wall sconces in the tunnels, warm lamps in the rooms ─────────
    const RED = 0xff4a2a;
    const AMBER = 0xffa050;
    const WARM = 0xffcf9a;
    const fixtures: Fixture[] = [];
    /** wall sconces: position on the wall face and the direction they face */
    const sconces: InstanceXform[] = [];
    const wallLamp = (
      x: number,
      z: number,
      nx: number,
      nz: number,
      color: number,
      intensity: number,
      flicker = 0,
      y = F + 1.9,
    ) => {
      sconces.push({ x, y: y - 0.1, z, rotY: Math.atan2(nx, nz) });
      fixtures.push({
        pos: new Vector3(x + nx * 0.2, y + 0.05, z + nz * 0.2),
        color,
        intensity,
        distance: 9,
        flicker,
      });
    };
    wallLamp(-0.65, -1.2, 1, 0, WARM, 2.5, 0, -0.2); // halfway down the stairs
    wallLamp(-1.05, -15, 1, 0, AMBER, 4.2);
    wallLamp(1.05, -21, -1, 0, RED, 4.6);
    wallLamp(-1.05, -27, 1, 0, RED, 4.6, 3);
    wallLamp(1.05, -33, -1, 0, AMBER, 4.2);
    wallLamp(-1.05, -40, 1, 0, RED, 4.6);
    wallLamp(9.05, -17.5, -1, 0, AMBER, 4.2);
    wallLamp(6.95, -24, 1, 0, RED, 4.6, 7);
    wallLamp(9.05, -31, -1, 0, AMBER, 4.2);
    wallLamp(4, -14.95, 0, -1, RED, 3.6);
    wallLamp(4, -34.95, 0, -1, RED, 3.6);
    wallLamp(2.5, -47.85, 0, 1, WARM, 4.5);
    wallLamp(-3.85, -44, 1, 0, WARM, 3.5);
    const hanging: InstanceXform[] = [];
    const cordMat = scope.add(new MeshStandardMaterial({ color: 0x1a1816, roughness: 0.8 }));
    /** A caged lamp at `ceil`; with `roof` above it, on a cord up to the roof. */
    const hangLamp = (x: number, z: number, ceil: number, intensity: number, roof = ceil) => {
      hanging.push({ x, y: ceil, z, scale: 0.55 });
      fixtures.push({ pos: new Vector3(x, ceil - 0.35, z), color: WARM, intensity, distance: 11 });
      if (roof > ceil + 0.05) {
        const cord = new Mesh(scope.add(new CylinderGeometry(0.008, 0.008, roof - ceil, 6)), cordMat);
        cord.position.set(x, (roof + ceil) / 2, z);
        scene.add(cord);
      }
    };
    hangLamp(0, 2.6, 2.6, 4); // landing
    hangLamp(0, -7.5, F + 2.5, 6);
    // the boiler room is 5 m high: these hang on cords
    hangLamp(5.2, -52, F + 3.6, 8, F + 5);
    hangLamp(-4.5, -55.5, F + 3.6, 7, F + 5);
    hangLamp(-0.5, -50.5, F + 3.6, 5, F + 5);
    const sconceSrc = props
      .gltf('industrial_caged_sconce')
      ?.scene.getObjectByName('industrial_caged_sconce_a');
    if (sconceSrc) {
      const tpl = centeredOnBack(sconceSrc);
      instanceModel(tpl, sconces, scene, { scope });
    }
    const hangSrc = props.gltf('caged_hanging_light')?.scene;
    if (hangSrc) instanceModel(hangSrc, hanging, scene, { scope });
    const pool = new LightPool(scene, fixtures, game.renderer.profile.tier === 'low' ? 4 : 6);
    const bulbs = new InstancedMesh(
      scope.add(new SphereGeometry(0.045, 8, 6)),
      scope.add(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })),
      fixtures.length,
    );
    fixtures.forEach((f, i) => {
      bulbs.setMatrixAt(i, new Matrix4().makeTranslation(f.pos.x, f.pos.y, f.pos.z));
      bulbs.setColorAt(i, new Color(f.color).multiplyScalar(2.5));
    });
    scene.add(bulbs);
    scene.add(new AmbientLight(0x2a1e1a, 0.9));
    scene.background = new Color(0x050303);
    scene.fog = new FogExp2(0x0b0706, 0.055);
    game.grade = {
      ...game.grade,
      lift: [0.014, 0.004, 0.0],
      gain: [1.08, 0.98, 0.92],
      saturation: 0.85,
      grain: 0.026,
    };

    // ───────── navigation (the boiler room is DOOR only: off limits to the creature) ─────────
    const nav = new NavGrid(Math.round(19 / 0.5), Math.round(68 / 0.5), 0.5, -9, -64);
    nav.fillRect(-4.6, -12.6, 4.6, -3.4, Area.WALK);
    nav.fillRect(-0.8, -43, 0.8, -12.6, Area.WALK);
    nav.fillRect(0.8, -16.8, 7.2, -15.2, Area.WALK);
    nav.fillRect(0.8, -36.8, 7.2, -35.2, Area.WALK);
    nav.fillRect(7.2, -37.8, 8.8, -14.2, Area.WALK);
    nav.fillRect(-3.6, -47.6, 3.6, -43, Area.WALK);
    nav.fillRect(-0.8, -48.4, 0.8, -47.6, Area.DOOR, true);
    nav.fillRect(-7.6, -61.6, 7.6, -48.4, Area.DOOR, true);
    game.nav = nav;

    // ───────── the creature ─────────
    const hisser = new Hisser('syciak');
    /** vent: where it surfaces (walkable), the grille on the wall and that wall's normal */
    const vents = [
      { at: [-0.7, -20], wall: [-1.03, -20], n: [1, 0] },
      { at: [0.7, -32], wall: [1.03, -32], n: [-1, 0] },
      { at: [8.7, -26], wall: [9.03, -26], n: [-1, 0] },
      { at: [8.7, -37], wall: [9.03, -37], n: [-1, 0] },
      { at: [4, -16.6], wall: [4, -17.03], n: [0, 1] },
      { at: [-3.4, -45.5], wall: [-3.83, -45.5], n: [1, 0] },
    ] as const;
    hisser.vents = vents.map((v) => new Vector3(v.at[0], F, v.at[1]));
    if (game.settings.difficulty === 'story') hisser.huntSpeed = 1.7;
    game.entities.push(hisser);
    const grilleMat = scope.add(
      new MeshStandardMaterial({
        map: grilleTexture(scope),
        color: 0x8a8a8a,
        metalness: 0.6,
        roughness: 0.55,
      }),
    );
    const grilleGeo = scope.add(new PlaneGeometry(0.62, 0.42));
    for (const v of vents) {
      const g = new Mesh(grilleGeo, grilleMat);
      g.position.set(v.wall[0], F + 0.32, v.wall[1]);
      g.rotation.y = Math.atan2(v.n[0], v.n[1]);
      scene.add(g);
    }
    const fleshMat = scope.add(
      new MeshPhysicalMaterial({
        color: 0xd8cbbd,
        roughness: 0.35,
        clearcoat: 0.8,
        clearcoatRoughness: 0.3,
        sheen: 0.5,
        sheenColor: new Color(0xffd8c8),
      }),
    );
    const SEG = 34;
    const body = new InstancedMesh(scope.add(new SphereGeometry(1, 12, 8)), fleshMat, SEG);
    body.frustumCulled = false;
    body.visible = false;
    const mouth = new Mesh(
      scope.add(new TorusGeometry(0.1, 0.035, 8, 16)),
      scope.add(new MeshStandardMaterial({ color: 0x2a0606, roughness: 0.3 })),
    );
    mouth.visible = false;
    scene.add(body, mouth);
    const tmpM = new Matrix4();
    const tmpQ = new Quaternion();
    const tmpP = new Vector3();
    const tmpS = new Vector3();
    const tmpH = new Vector3();

    // ───────── Ežo, shovelling ─────────
    let ezo: Character | null = null;
    const EZO_POS = new Vector3(0.4, F, -55.1);
    const eg = props.gltf('ezo');
    if (eg) {
      ezo = new Character(eg);
      ezo.pose = 'stand';
      ezo.armOnTable = false;
      ezo.root.position.copy(EZO_POS);
      // Characters face +z at rotation 0: turn him toward the fire door
      ezo.root.rotation.y = Math.atan2(FIRE_DOOR.x - EZO_POS.x, FIRE_DOOR.z - EZO_POS.z);
      scene.add(ezo.root);
      const spade = props.place('rusted_spade_01', { pos: [0, 0, 0], collide: 'none' });
      if (spade) {
        spade.removeFromParent();
        ezo.attach('RightHand', spade, [0.0, -0.32, 0.04], [0, 0, 0]);
      }
      // his stroke swings the spade into the coal (the drinking arm lifted it to his mouth)
      ezo.drinkPose = ARM_SHOVEL;
    }
    b.box([EZO_POS.x - 0.4, F, EZO_POS.z - 0.4], [EZO_POS.x + 0.4, F + 2, EZO_POS.z + 0.4], null);

    // steam valves
    const steamTex = scope.add(steamTexture());
    const steamValves = [
      {
        valve: new Vector3(-0.92, F + 1.25, -26.5),
        puff: new Vector3(-0.45, F + 1.45, -26.5),
        rotY: Math.PI / 2,
      },
      { valve: new Vector3(8.92, F + 1.25, -30), puff: new Vector3(8.45, F + 1.45, -30), rotY: -Math.PI / 2 },
    ];
    const steamSprites = steamValves.map((sv) => {
      const w = new Mesh(scope.add(new TorusGeometry(0.1, 0.018, 6, 16)), valveMat);
      w.position.copy(sv.valve);
      w.rotation.y = sv.rotY;
      scene.add(w);
      const sp = new Sprite(
        scope.add(new SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false })),
      );
      sp.position.copy(sv.puff);
      sp.scale.set(2, 2, 1);
      scene.add(sp);
      return sp;
    });

    // ───────── state & interactions ─────────
    const st = {
      busy: false,
      valveSeq: [] as number[],
      solved: game.flags.has('cellar.solved'),
      metEzo: game.flags.has('cellar.ezo'),
      steamT: [0, 0],
      water: game.flags.has('cellar.solved') ? 1 : 0,
      grateHint: false,
      hissHint: false,
      ventHissT: 6,
    };
    async function solo(fn: () => Promise<void>): Promise<void> {
      if (st.busy) return;
      st.busy = true;
      try {
        await fn();
      } catch (e) {
        if (!(e instanceof Cancelled)) console.error(e);
      } finally {
        st.busy = false;
      }
    }
    /** Like solo, but lets a line in progress finish first instead of dropping `fn`. */
    async function soloWhenFree(fn: () => Promise<void>): Promise<void> {
      try {
        await game.clock.until(() => !st.busy, 30);
      } catch (e) {
        if (!(e instanceof Cancelled)) console.error(e);
        return;
      }
      await solo(fn);
    }
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => stoppers.forEach((f) => f()));
    const I = game.interactions;
    I.add({
      id: 'door',
      pos: new Vector3(0, 1.2, 3.8),
      radius: 0.5,
      prompt: 'Dvere',
      onUse: () => void solo(() => say('t_door')),
    });
    I.add({
      id: 'bottles',
      pos: new Vector3(-1.6, F + 0.4, -4.4),
      radius: 0.45,
      prompt: 'Vziať prázdne fľaše',
      enabled: () => !game.flags.has('cellar.bottles'),
      onUse: () => {
        game.flags.put('cellar.bottles');
        game.inventory.add('flasa', 4);
        bottles.count = 2;
        necks.count = 2;
        game.synth.clink(new Vector3(-1.6, F + 0.4, -4.4), 0.6);
        void soloWhenFree(() => say('t_bottles'));
        game.ui.toast(
          game.touch ? 'Fľašu hodíš tlačidlom „Hodiť"' : `Fľašu hodíš klávesom ${game.keyLabel('throw')}`,
          4000,
        );
      },
    });
    if (game.flags.has('cellar.bottles')) {
      bottles.count = 2;
      necks.count = 2;
    }
    steamValves.forEach((sv, i) => {
      I.add({
        id: `steam${i}`,
        pos: sv.valve,
        radius: 0.25,
        prompt: 'Pustiť paru',
        enabled: () => st.steamT[i]! <= 0,
        onUse: () => {
          st.steamT[i] = 3.5;
          game.synth.hiss(sv.puff, 3.2, 0.35);
          game.addNoise({ x: sv.puff.x, y: sv.puff.y, z: sv.puff.z, loudness: 1.2, kind: 'object' });
        },
      });
    });
    const spin = wheels.map(() => 0);
    wheels.forEach((_w, i) => {
      const pos = new Vector3(3.38, F + 1.3, -44.3 - i * 1.2);
      I.add({
        id: `valve${i}`,
        pos,
        radius: 0.25,
        prompt: `Otočiť ventil ${VALVE_TAGS[i]}`,
        enabled: () => !st.solved && !st.busy,
        onUse: () =>
          void solo(async () => {
            game.synth.clank(pos, 0.6);
            game.addNoise({ x: pos.x, y: pos.y, z: pos.z, loudness: 1.3, kind: 'object' });
            spin[i] = spin[i]! + 3.2; // the wheel turns in frame(), on render time
            await game.clock.wait(1);
            st.valveSeq.push(i);
            if (!st.valveSeq.every((v, k) => v === VALVE_ORDER[k])) {
              st.valveSeq = [];
              game.synth.clank(pos, 1.6);
              game.fx.shake = Math.max(game.fx.shake, 0.6);
              game.addNoise({ x: pos.x, y: pos.y, z: pos.z, loudness: 2.0, kind: 'object' });
              await say('t_valve_wrong');
              return;
            }
            if (st.valveSeq.length < VALVE_ORDER.length) {
              await say('t_valve_ok');
              return;
            }
            st.solved = true;
            game.flags.put('cellar.solved');
            // keep the solved puzzle: a blackout on the way to the pipe wakes you in the boiler room
            game.saveCheckpoint('boiler');
            game.synth.clank(gate.position, 1.2);
            game.synth.hiss(gate.position, 2.5, 0.2);
            stoppers.push(
              game.synth.loopNoise({
                kind: 'white',
                type: 'lowpass',
                freq: 700,
                volume: 0.07,
                pos: stream.position,
              }),
            );
            await say('t_sluice');
          }),
      });
    });
    I.add({
      id: 'logbook',
      pos: book.position.clone(),
      radius: 0.25,
      prompt: 'Čítať denník',
      onUse: () =>
        void solo(async () => {
          await game.readDocument(L4.t_log_title!.text, LOGBOOK);
          game.flags.put('cellar.log');
          if (st.metEzo) await say('e4_3', ezo);
        }),
    });
    const radio = new MusicBox(game.audio);
    scope.onDispose(() => radio.stop());
    const radioPos = new Vector3(7.45, F + 1.0, -51.25);
    I.add({
      id: 'radio',
      pos: radioPos,
      radius: 0.3,
      prompt: () => (radio.playing ? 'Vypnúť rádio' : 'Zapnúť rádio'),
      onUse: () => {
        game.synth.click(radioPos);
        if (radio.playing) radio.stop();
        else radio.play(TUNES.dychovka!, radioPos, 0.22);
      },
    });
    I.add({
      id: 'ezo',
      pos: EZO_POS.clone().setY(F + 1.6),
      radius: 0.45,
      range: 2.6,
      prompt: 'Hovoriť s Ežom',
      enabled: () => !st.busy,
      onUse: () => void ezoTalk(),
    });
    const pipePos = new Vector3(-7.0, F + 0.55, -61.75);
    I.add({
      id: 'pipe',
      pos: pipePos,
      radius: 0.65,
      range: 2.6,
      ignoreOcclusion: true,
      prompt: () => (st.solved && st.water > 0.85 ? 'Vliezť do rúry' : 'Pozrieť rúru'),
      onUse: () =>
        void solo(async () => {
          if (!(st.solved && st.water > 0.85)) {
            await say('t_pipe_dry');
            return;
          }
          await say('t_pipe');
          stoppers.push(game.synth.loopNoise({ kind: 'white', type: 'lowpass', freq: 1100, volume: 0.16 }));
          await game.gotoReality('r5');
        }),
    });

    async function meetEzo(): Promise<void> {
      await solo(async () => {
        await say('e4_1', ezo);
        await say('e4_2', ezo);
        if (!st.solved) {
          await say('e4_4', ezo);
          await say('e4_5', ezo);
        }
        st.metEzo = true;
        game.flags.put('cellar.ezo');
        game.saveCheckpoint('boiler');
      });
    }
    async function ezoTalk(): Promise<void> {
      if (!st.metEzo) return meetEzo();
      await solo(async () => {
        if (st.solved) await say('e4_6', ezo);
        else if (game.flags.has('cellar.log')) await say('e4_7', ezo);
        else await say('e4_8', ezo);
      });
    }

    game.onSignal = (_id, name) => {
      if (name === 'emerge') {
        game.synth.hiss(hisser.pos, 1.4, 0.3);
        if (!st.hissHint && !st.busy) {
          st.hissHint = true;
          void solo(() => say('t_hiss'));
        }
      } else if (name === 'hunt') {
        game.synth.stinger(0.4);
        game.status.fear.scare(0.3);
      }
    };
    game.onFootstep = (e) => {
      if (e.surface === 'metal' && !st.grateHint && !st.busy) {
        st.grateHint = true;
        void solo(() => say('t_grate'));
      }
    };

    let shovelT = 0;
    const inBoilerRoom = () => {
      const p = game.player.pos;
      return p.z < -49 && p.z > -62 && Math.abs(p.x) < 8 && p.y < F + 1;
    };

    return {
      defaultCheckpoint: 'stairs',
      checkpoints: {
        stairs: { pos: new Vector3(0, 0, 3.1), yaw: 0, pitch: -0.32 },
        boiler: { pos: new Vector3(0, F, -50.2), yaw: 0 },
      },
      start(cp) {
        placeBeerMat(game, scope, 'r4', new Vector3(7.2, F + 1.6, -51.6));
        stoppers.push(game.synth.drone({ freqs: [41.2, 61.7], cutoff: 220, volume: 0.06, type: 'sawtooth' }));
        stoppers.push(game.synth.loopNoise({ kind: 'brown', type: 'lowpass', freq: 160, volume: 0.06 }));
        stoppers.push(game.synth.hum(0.05, fire.position));
        if (st.solved)
          stoppers.push(
            game.synth.loopNoise({
              kind: 'white',
              type: 'lowpass',
              freq: 700,
              volume: 0.07,
              pos: stream.position,
            }),
          );
        game.audio.setReverb(2.4, 0.5);
        if (cp === 'stairs') void solo(() => say('t_stairs'));
      },
      tick(dt) {
        for (let i = 0; i < 2; i++) {
          if (st.steamT[i]! <= 0) continue;
          st.steamT[i] = st.steamT[i]! - dt;
          // steam scalds anything that slithers through it
          if (hisser.exposed && hisser.pos.distanceTo(steamValves[i]!.puff) < 3.2) hisser.stun();
        }
        if (st.solved) st.water = Math.min(1, st.water + dt * 0.2);
        if (!st.metEzo && !st.busy && inBoilerRoom()) void meetEzo();
        // Ežo shovels coal while nobody talks to him
        shovelT += dt;
        if (ezo && !st.busy) {
          const phase = shovelT % 3.6;
          if (phase < dt) {
            ezo.startDrink();
            game.synth.footstep('gravel', 0.9, new Vector3(-1.2, F + 0.4, -54.8));
          } else if (phase - dt < 1.1 && phase >= 1.1) {
            ezo.stopDrink();
            game.synth.clank(fire.position, 0.25);
          }
        } else if (ezo) ezo.stopDrink();
        // the pipes remind you where they open
        if (!hisser.exposed) {
          st.ventHissT -= dt;
          if (st.ventHissT <= 0) {
            st.ventHissT = 9 + game.rng.range(0, 8);
            const v = hisser.vents[hisser.currentVent];
            if (v && v.distanceTo(game.player.pos) < 14) game.synth.hiss(v, 0.9, 0.12);
          }
        }
      },
      frame(dt, alpha, t) {
        pool.update(game.renderer.camera.position, t);
        wheels.forEach((w, i) => (w.rotation.z = damp(w.rotation.z, -spin[i]!, 4, dt)));
        fire.intensity = 8 + 2 * Math.sin(t * 9) * Math.sin(t * 4.3);
        fireDoorMat.color.setRGB(1, 0.42 + 0.08 * Math.sin(t * 7), 0.12);
        steamSprites.forEach((sp, i) => {
          const on = st.steamT[i]! > 0 ? Math.min(1, st.steamT[i]!) : 0;
          sp.material.opacity = on * 0.7;
          sp.scale.setScalar(1.4 + (1 - on) * 1.6 + Math.sin(t * 3 + i) * 0.1);
        });
        water.position.y = F + 0.04 + st.water * 0.44;
        gate.position.y = F + 0.95 + st.water * 0.8;
        streamMat.opacity = st.solved ? 0.5 * Math.min(1, st.water * 4) : 0;
        stream.scale.y = 1 + Math.sin(t * 13) * 0.02;
        if (ezo) {
          ezo.lookTarget = st.busy ? game.renderer.camera.position : null;
          ezo.update(dt, t);
        }
        // the creature: pale segments trailing the head
        const tr = hisser.trail;
        const show = hisser.visible && tr.length > 0;
        body.visible = show;
        mouth.visible = show;
        if (show) {
          const head = tmpH.lerpVectors(hisser.prevPos, hisser.pos, alpha);
          // rears up while it searches, stands tall while it hunts
          const rearH = hisser.anim.alert > 0.9 ? 1.1 : hisser.anim.alert > 0.5 ? 0.45 : 0;
          const rear = rearH > 0.9;
          for (let i = 0; i < SEG; i++) {
            const p = i === 0 ? head : tr[Math.min(i, tr.length - 1)]!;
            const k = 1 - i / SEG;
            const r = 0.1 + 0.16 * Math.sin(k * Math.PI * 0.85) + 0.018 * Math.sin(i * 1.7 + t * 6);
            const up = i < 8 ? rearH * (1 - i / 8) ** 1.6 : 0;
            const lift = 0.2 + 0.05 * Math.sin(i * 0.6 - t * 8) + up;
            tmpM.compose(tmpP.set(p.x, p.y + lift, p.z), tmpQ, tmpS.set(r, r * 0.85, r));
            body.setMatrixAt(i, tmpM);
          }
          body.instanceMatrix.needsUpdate = true;
          mouth.position.set(
            head.x - Math.sin(hisser.yaw) * 0.22,
            head.y + 0.22 + rearH,
            head.z - Math.cos(hisser.yaw) * 0.22,
          );
          mouth.scale.setScalar(rear ? 1.5 + 0.2 * Math.sin(t * 17) : 1.1);
          mouth.rotation.set(0, hisser.yaw, 0);
        }
      },
      visibility: () => 0.6,
      // the tunnels wear on your nerves; the lit rooms and the boiler's warmth don't
      darkness: () => {
        const p = game.player.pos;
        if (p.y > F + 1.5 || p.z > -13) return 0.1;
        if (p.z < -48) return 0;
        if (p.z < -43) return 0.12;
        return 0.25;
      },
      // nerves fray when it is close and searching; a distant glimpse barely registers
      threat: () =>
        hisser.exposed
          ? clamp(1 - hisser.pos.distanceTo(game.player.pos) / 10, 0, 1) *
            (0.3 + 0.7 * hisser.anim.alert) *
            0.6
          : 0,
      warmth: () => clamp(1 - game.player.pos.distanceTo(fire.position) / 8, 0, 1),
    };
  },
};

/** Clones a sub-part of a model kit and re-centres it so its back sits at the origin facing +z. */
function centeredOnBack(src: Object3D): Object3D {
  src.updateWorldMatrix(true, false);
  const pos = new Vector3();
  const rot = new Quaternion();
  const scl = new Vector3();
  src.matrixWorld.decompose(pos, rot, scl);
  const part = src.clone();
  part.position.set(0, 0, 0);
  part.quaternion.copy(rot);
  part.scale.copy(scl);
  const holder = new Group();
  holder.add(part);
  holder.updateMatrixWorld(true);
  const bb = new Box3().setFromObject(part);
  part.position.set(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z);
  return holder;
}

function gaugeTexture(
  scope: { add<T extends { dispose(): void }>(d: T): T },
  tag: string,
  needle: number,
): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9d2bf';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#222';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(128, 128, 118, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 88, 128 + Math.sin(a) * 88);
    g.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104);
    g.stroke();
  }
  g.fillStyle = '#111';
  g.textAlign = 'center';
  g.font = "bold 50px 'IBM Plex Sans Condensed', Arial";
  g.fillText(tag, 128, 196);
  const a = Math.PI * 0.75 + needle * Math.PI * 1.5;
  g.strokeStyle = '#a01010';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
  g.stroke();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(128, 128, 9, 0, Math.PI * 2);
  g.fill();
  const t = scope.add(new CanvasTexture(c));
  t.colorSpace = 'srgb';
  return t;
}

function grilleTexture(scope: { add<T extends { dispose(): void }>(d: T): T }): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6a6a66';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#050505';
  for (let y = 10; y < 90; y += 12) g.fillRect(8, y, 112, 6);
  const t = scope.add(new CanvasTexture(c));
  t.colorSpace = 'srgb';
  return t;
}

function doorTexture(scope: { add<T extends { dispose(): void }>(d: T): T }): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f3a2c';
  g.fillRect(0, 0, 256, 512);
  g.strokeStyle = '#1c231a';
  g.lineWidth = 10;
  g.strokeRect(28, 30, 200, 200);
  g.strokeRect(28, 270, 200, 210);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) g.fillRect((i * 37) % 256, (i * 91) % 512, 3, 18);
  const t = scope.add(new CanvasTexture(c));
  t.colorSpace = 'srgb';
  return t;
}

function steamTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(230,230,230,0.35)');
  grd.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = 'srgb';
  return t;
}

export default reality;

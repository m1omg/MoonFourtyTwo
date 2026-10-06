import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import { Props } from '../../world/props.ts';
import {
  farParts,
  hideInstancesNear,
  instanceModelChunked,
  type InstanceXform,
} from '../../world/instancing.ts';
import type { ItemId } from '../../sim/items/items.data.ts';
import { Tableware } from '../../world/objects/tableware.ts';
import { Character } from '../../npc/Character.ts';
import { NavGrid, Area } from '../../sim/ai/nav/NavGrid.ts';
import { Staff } from '../../sim/ai/behaviors/Staff.ts';
import { Layer } from '../../sim/physics/CollisionWorld.ts';
import { Rng } from '../../core/rng.ts';
import { loadVoiceIndex, voiceUrl, type Lines } from '../../narrative/voice.ts';
import { MusicBox, TUNES } from '../../audio/procedural/musicbox.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { clamp } from '../../core/damp.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const E = 'Ežo';
const O = 'Obsluha';
export const L3: Lines = {
  t_arrive: { who: null, text: 'Za dverami nebola ulica. Bola tam ďalšia krčma. A za ňou ďalšia.' },
  t_listen: { who: null, text: 'Niekde ďaleko hrá hudobný automat. Spomalene.' },
  o_notice: { who: O, text: 'Ešte niečo?' },
  o_notice2: { who: O, text: 'Prosím?' },
  o_serve: { who: O, text: 'Na účet pána Kolesára.' },
  t_sit: { who: null, text: 'Kto sedí pri stole s pohárom, toho obsluha nevidí. Tak to bolo vždy.' },
  t_glass: { who: null, text: 'Zvetrané pivo. Ešte teplé.' },
  t_noglass: { who: null, text: 'Na stole nie je pohár. Takto si ma všimne.' },
  e_h1: { who: E, text: 'Tu si. Sadni si, nech ťa nevidí.' },
  e_h2: { who: E, text: 'Toto je dlhá krčma, starý. Vždy bola. Len si si to nevšimol.' },
  e_h3: { who: E, text: 'Na, budeš potrebovať.' },
  e_h4: { who: E, text: 'A toto je Horský čaj. Otvorí ti oči. Ale nezabúdaj, že potom vidia aj oni teba.' },
  e_h5: { who: E, text: 'Hľadaj dvere, čo tu nemajú byť. Na nich bude napísané SKLAD.' },
  e_h6: { who: E, text: 'Ja tu ešte chvíľu posedím.' },
  t_lighter: { who: null, text: 'Ežov zapaľovač. Svieti, len kým nebežíš.' },
  t_sklad: { who: null, text: 'SKLAD. Tieto dvere tu predtým neboli.' },
  t_sklad_closed: { who: null, text: 'Holá stena. Niečo tu je, ale nevidím to.' },
};

const CELL = 4;
const HALF = 40; // hall spans [-40, 40] on x and z
const H = 3.2;

const reality: RealityModule = {
  id: 'r3',
  index: 3,
  title: 'Nekonečná piváreň',
  async create(ctx) {
    const { game, scene, scope, builder: b, mats } = ctx;
    await loadVoiceIndex();
    const props = new Props(game.loader, scene, scope, b);
    await props.load(['WoodenTable_03', 'painted_wooden_chair_02', 'vierka', 'ezo', 'vintage_lighter'], (p) =>
      ctx.progress(p * 0.6),
    );
    const rng = new Rng(3301);
    const say = async (id: string, speaker?: Character | null) => {
      const l = L3[id]!;
      speaker?.setTalking(true);
      try {
        await game.say(l.who, l.text, voiceUrl(id));
      } finally {
        speaker?.setTalking(false);
      }
    };

    // ───────── materials ─────────
    const floor = mats.get('hallFloor', {
      tex: 'brown_floor_tiles',
      proc: 'tiles',
      color: 0x5f4a36,
      uvScale: 1.4,
      surface: 'tile',
      roughness: 0.75,
      tint: 0xd8c8a8,
    });
    const panel = mats.get('hallPanel', {
      tex: 'dark_paneled_wood',
      proc: 'panel',
      color: 0x4a2f1c,
      uvScale: 1.6,
      surface: 'wood',
    });
    const plaster = mats.get('hallPlaster', {
      tex: 'plastered_wall_04',
      proc: 'plaster',
      color: 0xc8be98,
      uvScale: 2.2,
      surface: 'concrete',
      tint: 0xe8e0b0,
    });
    const ceiling = mats.get('hallCeil', {
      tex: 'white_plaster_rough_01',
      proc: 'plaster',
      color: 0xcfc6a8,
      uvScale: 2.5,
      surface: 'concrete',
      tint: 0xe0d8b8,
    });
    const pillar = mats.get('hallPillar', {
      tex: 'dark_wooden_planks',
      proc: 'planks',
      color: 0x3b2516,
      uvScale: 1.5,
      surface: 'wood',
    });

    // ───────── shell ─────────
    b.floor(-HALF, -HALF, HALF, HALF, 0, floor);
    b.ceiling(-HALF, -HALF, HALF, HALF, H, ceiling);
    const windowsAt = (len: number) => {
      const out = [];
      for (let a = 6; a < len - 3; a += 7) out.push({ at: a, width: 1.4, bottom: 1.0, top: 2.4 });
      return out;
    };
    for (const [ax, az, bx, bz] of [
      [-HALF, -HALF, HALF, -HALF],
      [-HALF, HALF, HALF, HALF],
      [-HALF, -HALF, -HALF, HALF],
      [HALF, -HALF, HALF, HALF],
    ] as Array<[number, number, number, number]>) {
      b.wall(
        ax,
        az,
        bx,
        bz,
        0,
        1.2,
        panel,
        0.3,
        windowsAt(80).map((w) => ({ ...w, top: 1.2 })),
      );
      b.wall(ax, az, bx, bz, 1.2, H, plaster, 0.3, windowsAt(80));
    }
    // rain windows: one shared animated texture
    const rainCanvas = document.createElement('canvas');
    rainCanvas.width = 128;
    rainCanvas.height = 128;
    const rainG = rainCanvas.getContext('2d')!;
    const rainTex = scope.add(new CanvasTexture(rainCanvas));
    rainTex.colorSpace = 'srgb';
    const rainMat = scope.add(new MeshBasicMaterial({ map: rainTex, toneMapped: false }));
    const winGeos: BufferGeometry[] = [];
    const addWindows = (axis: 'x' | 'z', fixed: number, facing: number) => {
      for (let a = 6; a < 80 - 3; a += 7) {
        const c = -HALF + a;
        const g = new PlaneGeometry(1.4, 1.4).rotateY(facing);
        if (axis === 'x') g.translate(c, 1.7, fixed);
        else g.translate(fixed, 1.7, c);
        winGeos.push(g);
      }
    };
    addWindows('x', -HALF + 0.16, 0);
    addWindows('x', HALF - 0.16, Math.PI);
    addWindows('z', -HALF + 0.16, Math.PI / 2);
    addWindows('z', HALF - 0.16, -Math.PI / 2);
    // all the windows are one mesh (one draw call, not forty-four)
    scene.add(new Mesh(scope.add(mergeGeometries(winGeos)), rainMat));
    for (const g of winGeos) g.dispose();

    // ───────── layout ─────────
    const nav = new NavGrid(160, 160, 0.5, -HALF, -HALF);
    nav.fillRect(-HALF + 0.4, -HALF + 0.4, HALF - 0.4, HALF - 0.4, Area.WALK);
    const tables: InstanceXform[] = [];
    const chairs: InstanceXform[] = [];
    const glassesAt: Vector3[] = [];
    const tableCells: Array<{ x: number; z: number; glass: boolean }> = [];
    const pillars: InstanceXform[] = [];
    const ezoCell = { x: -26, z: -30 };
    const startCell = { x: 0, z: 36 };
    const skladZ = -10;
    for (let gx = -HALF + CELL / 2; gx < HALF; gx += CELL) {
      for (let gz = -HALF + CELL / 2; gz < HALF; gz += CELL) {
        const nearStart = Math.hypot(gx - startCell.x, gz - startCell.z) < 5;
        const nearEzo = Math.hypot(gx - ezoCell.x, gz - ezoCell.z) < 3;
        // pillars on an 8 m grid
        const px = gx + CELL / 2;
        const pz = gz + CELL / 2;
        if (
          Math.round(px) % 8 === 0 &&
          Math.round(pz) % 8 === 0 &&
          Math.abs(px) < HALF - 1 &&
          Math.abs(pz) < HALF - 1
        ) {
          pillars.push({ x: px, y: 0, z: pz });
          b.box([px - 0.3, 0, pz - 0.3], [px + 0.3, H, pz + 0.3], null);
          nav.fillRect(px - 0.55, pz - 0.55, px + 0.55, pz + 0.55, 0, true);
        }
        if (nearStart || nearEzo || rng.chance(0.33)) continue;
        const rot = rng.chance(0.5) ? 0 : Math.PI / 2;
        tables.push({ x: gx, y: 0, z: gz, rotY: rot });
        const along = rot === 0 ? 'x' : 'z';
        const ext = along === 'x' ? [0.68, 0.3] : [0.3, 0.68];
        b.box([gx - ext[0]!, 0, gz - ext[1]!], [gx + ext[0]!, 0.83, gz + ext[1]!], null);
        nav.fillRect(
          gx - ext[0]! - 0.25,
          gz - ext[1]! - 0.25,
          gx + ext[0]! + 0.25,
          gz + ext[1]! + 0.25,
          0,
          true,
        );
        const glass = rng.chance(0.55);
        tableCells.push({ x: gx, z: gz, glass });
        if (glass)
          glassesAt.push(
            new Vector3(
              gx + rng.range(-0.4, 0.4) * (along === 'x' ? 1 : 0.3),
              0.83,
              gz + rng.range(-0.4, 0.4) * (along === 'z' ? 1 : 0.3),
            ),
          );
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          const side = i % 2 ? 1 : -1;
          const off = i < 2 ? 0 : i === 2 ? 0.35 : -0.35;
          if (along === 'x')
            chairs.push({ x: gx + off, y: 0, z: gz + side * 0.62, rotY: side > 0 ? Math.PI : 0 });
          else
            chairs.push({
              x: gx + side * 0.62,
              y: 0,
              z: gz + off,
              rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2,
            });
        }
      }
    }
    // partitions to break long sightlines
    for (let i = 0; i < 46; i++) {
      const vertical = rng.chance(0.5);
      const x = rng.int(-9, 10) * CELL;
      const z = rng.int(-9, 10) * CELL;
      if (Math.hypot(x - startCell.x, z - startCell.z) < 6 || Math.hypot(x - ezoCell.x, z - ezoCell.z) < 5)
        continue;
      const len = CELL * rng.int(1, 3);
      const tall = rng.chance(0.45);
      const h = tall ? 2.4 : 1.25;
      if (vertical) {
        b.box([x - 0.06, 0, z], [x + 0.06, h, z + len], panel);
        nav.fillRect(x - 0.35, z, x + 0.35, z + len, 0, true);
      } else {
        b.box([x, 0, z - 0.06], [x + len, h, z + 0.06], panel);
        nav.fillRect(x, z - 0.35, x + len, z + 0.35, 0, true);
      }
    }
    game.nav = nav;

    const tableModel = props.gltf('WoodenTable_03')?.scene;
    const chairModel = props.gltf('painted_wooden_chair_02')?.scene;
    // far chunks of furniture are drawn simplified (most of the hall is far away)
    const farFrom = { low: 16, med: 24, high: 32 }[game.renderer.profile.tier];
    if (tableModel)
      instanceModelChunked(tableModel, tables, scene, 12, {
        scope,
        far: await farParts(tableModel, 0.3, farFrom, scope),
      });
    if (chairModel) {
      chairModel.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) (m.material as MeshStandardMaterial).color.setHex(0x6b4a33);
      });
      instanceModelChunked(chairModel, chairs, scene, 12, {
        scope,
        far: await farParts(chairModel, 0.3, farFrom, scope),
      });
    }
    // pillars (instanced boxes)
    const pillarMesh = new InstancedMesh(
      scope.add(new BoxGeometry(0.6, H, 0.6)),
      pillar.material,
      pillars.length,
    );
    pillars.forEach((p, i) => pillarMesh.setMatrixAt(i, new Matrix4().makeTranslation(p.x, H / 2, p.z)));
    pillarMesh.receiveShadow = true;
    scene.add(pillarMesh);
    // stale glasses (instanced: glass, beer, beer mat)
    const tw = new Tableware(scope);
    let staleGlasses: InstancedMesh[] = [];
    {
      const proto = tw.mug(0.35);
      const matProto = tw.mat();
      proto.add(matProto);
      matProto.position.set(0, 0.002, 0);
      staleGlasses = instanceModelChunked(
        proto,
        glassesAt.map((g) => ({ x: g.x, y: g.y, z: g.z, rotY: (g.x * 13.1 + g.z * 7.7) % 6.28 })),
        scene,
        12,
        { scope },
      );
    }

    // fluorescent fixtures (emissive, instanced) + a pool of real lights that follows the player
    const tubeMat = scope.add(new MeshBasicMaterial({ color: 0xf2f6e0, toneMapped: false }));
    const tubes: Vector3[] = [];
    for (let x = -HALF + 4; x < HALF; x += 8)
      for (let z = -HALF + 4; z < HALF; z += 8) tubes.push(new Vector3(x, H - 0.05, z));
    const tubeMesh = new InstancedMesh(scope.add(new BoxGeometry(1.4, 0.05, 0.12)), tubeMat, tubes.length);
    const deadTubes = new Set<number>();
    tubes.forEach((t, i) => {
      tubeMesh.setMatrixAt(i, new Matrix4().makeTranslation(t.x, t.y, t.z));
      if (rng.chance(0.12)) deadTubes.add(i);
    });
    scene.add(tubeMesh);
    const pool: PointLight[] = [];
    for (let i = 0; i < 8; i++) {
      const l = new PointLight(0xeef2cf, 15, 16, 1.4);
      scene.add(l);
      pool.push(l);
    }
    scene.add(new AmbientLight(0x5c5a3c, 0.85));
    scene.add(new HemisphereLight(0x8c8860, 0x2a2014, 0.55));

    // ───────── Ežo, candle, SKLAD door ─────────
    const ezoG = props.gltf('ezo');
    let ezo: Character | null = null;
    if (ezoG) {
      ezo = new Character(ezoG);
      ezo.pose = 'sit';
      ezo.root.position.set(ezoCell.x, -0.5, ezoCell.z - 0.75);
      scene.add(ezo.root);
      ezo.holdOnTable(tw.mug(0.5), 0.834, 0.15);
    }
    props.place('WoodenTable_03', { pos: [ezoCell.x, 0, ezoCell.z], rotY: Math.PI / 2 });
    // chair rotY 0 faces +z: Ežo sits on the -z side facing the table, the player across from him
    props.place('painted_wooden_chair_02', {
      pos: [ezoCell.x, 0, ezoCell.z - 0.78],
      rotY: 0,
      collide: 'none',
    });
    props.place('painted_wooden_chair_02', {
      pos: [ezoCell.x, 0, ezoCell.z + 0.78],
      rotY: Math.PI,
      collide: 'none',
    });
    nav.fillRect(ezoCell.x - 0.6, ezoCell.z - 1.0, ezoCell.x + 0.6, ezoCell.z + 0.6, 0, true);
    const candle = new PointLight(0xffa040, 2.2, 7, 1.8);
    candle.position.set(ezoCell.x + 0.15, 1.05, ezoCell.z);
    scene.add(candle);
    const flame = new Mesh(
      scope.add(new BoxGeometry(0.02, 0.05, 0.02)),
      scope.add(new MeshBasicMaterial({ color: 0xffd080, toneMapped: false })),
    );
    flame.position.set(ezoCell.x + 0.15, 0.9, ezoCell.z);
    scene.add(flame);
    const playerSeat = new Vector3(ezoCell.x, 0, ezoCell.z + 0.85);
    // SKLAD door on the west wall (only in the REVEAL layer)
    const skladMat = scope.add(new MeshStandardMaterial({ map: skladTexture(scope), roughness: 0.7 }));
    const sklad = new Mesh(scope.add(new PlaneGeometry(1.0, 2.1)), skladMat);
    sklad.position.set(-HALF + 0.17, 1.05, skladZ);
    sklad.rotation.y = Math.PI / 2;
    sklad.visible = false;
    scene.add(sklad);

    // ───────── the waitress ─────────
    const staff = new Staff('obsluha');
    staff.place(10, 0, 8);
    staff.chaseSpeed = game.settings.difficulty === 'story' ? 2.4 : 3.25;
    for (const c of tableCells) staff.waypoints.push(new Vector3(c.x + 1.6, 0, c.z + 1.6));
    game.entities.push(staff);
    let staffVis: Character | null = null;
    const vg = props.gltf('vierka');
    if (vg) {
      staffVis = new Character(vg);
      staffVis.pose = 'stand';
      staffVis.armOnTable = false;
      staffVis.carryTray = true;
      staffVis.root.scale.set(0.9, 1.24, 0.9);
      // her face is hidden behind an order pad
      const pad = new Mesh(
        scope.add(new PlaneGeometry(0.17, 0.22)),
        scope.add(new MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.9 })),
      );
      staffVis.attach('Head', pad, [0, 0.08, 0.14]);
      const tray = new Mesh(
        scope.add(new BoxGeometry(0.34, 0.015, 0.26)),
        scope.add(new MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.8, roughness: 0.4 })),
      );
      staffVis.attach('LeftHand', tray, [0, -0.04, 0.12]);
      scene.add(staffVis.root);
    }
    const lastStaffPos = staff.pos.clone();
    let clinkDist = 0;

    // ───────── atmosphere ─────────
    scene.background = new Color(0x3a3622);
    scene.fog = new FogExp2(0x3a3622, 0.036);
    // past ~60 m the fog hides everything (99 %): do not draw what nobody can see
    const cam = game.renderer.camera;
    const far0 = cam.far;
    cam.far = 62;
    cam.updateProjectionMatrix();
    scope.onDispose(() => {
      cam.far = far0;
      cam.updateProjectionMatrix();
    });
    game.grade = {
      lift: [0.01, 0.012, 0.0],
      gamma: [1.0, 1.02, 1.04],
      gain: [1.0, 1.02, 0.86],
      saturation: 0.72,
      contrast: 1.08,
      tint: [1.0, 1.0, 0.86],
      grain: 0.022,
    };
    const music = new MusicBox(game.audio);
    scope.onDispose(() => music.stop());
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => stoppers.forEach((f) => f()));

    // ───────── state & interactions ─────────
    const st = {
      seated: false,
      seatedDrink: false,
      metEzo: game.flags.has('hall.ezo'),
      busy: false,
      skladOpen: false,
    };
    const sitAt = (pos: Vector3, yaw: number, withDrink: boolean) => {
      st.seated = true;
      game.seated = true;
      game.seatedWithDrink = withDrink;
      game.player.teleport(pos, yaw);
      game.player.forcedHeight = 1.28;
      game.rig.setOrientation(yaw, -0.1);
    };
    const stand = () => {
      if (!st.seated) return;
      st.seated = false;
      game.seated = false;
      game.seatedWithDrink = false;
      game.player.forcedHeight = null;
    };
    game.onMoveWhileSeated = () => {
      if (!st.busy) stand();
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

    // sit at the nearest free chair of the nearest table (interact anywhere near a table)
    const nearestTable = () => {
      const p = game.player.pos;
      let best: (typeof tableCells)[number] | null = null;
      let bd = 1.6;
      for (const c of tableCells) {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      return best;
    };
    /** The table a stale glass stands on. */
    const tableOf = (g: Vector3) => {
      let best = tableCells[0]!;
      for (const c of tableCells)
        if (Math.hypot(c.x - g.x, c.z - g.z) < Math.hypot(best.x - g.x, best.z - g.z)) best = c;
      return best;
    };
    game.interactions.add({
      id: 'sitAnywhere',
      pos: new Vector3(),
      radius: 0.9,
      range: 2.2,
      ignoreOcclusion: true,
      prompt: () =>
        nearestTable()?.glass || game.inventory.has('staleBeer') || game.inventory.has('pivo')
          ? 'Sadnúť si s pohárom'
          : 'Sadnúť si',
      enabled: () => !st.seated && !!nearestTable(),
      onUse: () => {
        const c = nearestTable();
        if (!c) return;
        let withDrink = c.glass;
        // put down a glass you carry: a stale one first, a fresh beer if that is all you have
        const own: ItemId | null = game.inventory.has('staleBeer')
          ? 'staleBeer'
          : game.inventory.has('pivo')
            ? 'pivo'
            : null;
        if (!withDrink && own) {
          game.inventory.take(own);
          c.glass = true;
          const m = tw.mug(own === 'pivo' ? 0.85 : 0.3);
          m.position.set(c.x, 0.83, c.z);
          scene.add(m);
          withDrink = true;
        }
        const p = game.player.pos;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const len = Math.hypot(dx, dz) || 1;
        const seat = new Vector3(c.x + (dx / len) * 0.75, 0, c.z + (dz / len) * 0.75);
        const yaw = Math.atan2(dx, dz);
        sitAt(seat, yaw, withDrink);
        if (!game.flags.has('hall.sitHint')) {
          game.flags.put('hall.sitHint');
          void solo(() => say(withDrink ? 't_sit' : 't_noglass'));
        } else if (!withDrink) void solo(() => say('t_noglass'));
      },
    });
    for (const [i, g] of glassesAt.entries()) {
      game.interactions.add({
        id: `glass${i}`,
        pos: g.clone().setY(0.92),
        radius: 0.1,
        range: 1.9,
        prompt: 'Vziať zvetrané pivo',
        enabled: () => !st.seated && i % 3 === 0,
        onUse: () => {
          game.interactions.remove(`glass${i}`);
          // the glass leaves the table with you (its mat too)
          hideInstancesNear(staleGlasses, g.x, g.z, 0.1);
          tableOf(g).glass = false;
          game.inventory.add('staleBeer', 1);
          if (!game.flags.has('hall.glassHint')) {
            game.flags.put('hall.glassHint');
            void solo(() => say('t_glass'));
          }
        },
      });
    }
    const atEzosTable = () => st.seated && game.player.pos.distanceTo(playerSeat) < 0.5;
    game.interactions.add({
      id: 'ezo',
      pos: new Vector3(ezoCell.x, 1.15, ezoCell.z - 0.75),
      radius: 0.45,
      range: 3,
      prompt: () => (atEzosTable() ? 'Hovoriť s Ežom' : 'Prisadnúť si k Ežovi'),
      enabled: () => !st.busy,
      onUse: () => {
        if (!atEzosTable()) sitAt(playerSeat, 0, true);
        void meetEzo();
      },
    });
    game.interactions.add({
      id: 'sklad',
      pos: new Vector3(-HALF + 0.2, 1.1, skladZ),
      radius: 0.6,
      range: 2.4,
      ignoreOcclusion: true,
      prompt: () => (game.status.layerVisionActive ? 'Otvoriť SKLAD' : 'Prezrieť stenu'),
      onUse: () =>
        void solo(async () => {
          if (!game.status.layerVisionActive) {
            await say('t_sklad_closed');
            return;
          }
          await say('t_sklad');
          st.skladOpen = true;
          await game.gotoReality('r4');
        }),
    });

    async function meetEzo(): Promise<void> {
      await solo(async () => {
        if (!st.metEzo) {
          await say('e_h1', ezo);
          await say('e_h2', ezo);
          await say('e_h3', ezo);
          game.giveLight(1);
          await say('t_lighter');
          game.ui.toast(
            game.touch ? 'Svetlo zapneš tlačidlom „Svetlo"' : 'Zapaľovač zapneš klávesom F',
            4000,
          );
          await say('e_h4', ezo);
          game.inventory.add('horskyCaj', 1);
          await say('e_h5', ezo);
          st.metEzo = true;
          game.flags.put('hall.ezo');
          game.saveCheckpoint('ezo');
        } else await say('e_h6', ezo);
      });
    }

    game.onSignal = (_id, name) => {
      if (name === 'notice') {
        void game.say(
          O,
          game.rng.chance(0.5) ? L3.o_notice!.text : L3.o_notice2!.text,
          voiceUrl(game.rng.chance(0.5) ? 'o_notice' : 'o_notice2'),
        );
        game.synth.stinger(0.35);
        game.status.fear.scare(0.25);
      } else if (name === 'serve') {
        void (async () => {
          await game.say(O, L3.o_serve!.text, voiceUrl('o_serve'));
          game.consumeNow('pivo');
        })();
      }
    };

    // ───────── instance ─────────
    return {
      defaultCheckpoint: 'start',
      checkpoints: {
        start: { pos: new Vector3(startCell.x, 0, startCell.z + 1.5), yaw: 0 },
        ezo: { pos: playerSeat.clone(), yaw: 0 },
      },
      start(cp) {
        placeBeerMat(game, scope, 'r3', new Vector3(ezoCell.x + 0.05, 1.6, ezoCell.z + 0.25));
        if (game.flags.has('hall.ezo')) game.giveLight(1);
        stoppers.push(game.synth.hum(0.03));
        stoppers.push(
          game.synth.loopNoise({
            kind: 'white',
            type: 'bandpass',
            freq: 2600,
            q: 0.6,
            volume: 0.025,
            ampLfoRate: 0.2,
            ampLfoDepth: 0.4,
          }),
        );
        music.play(
          { ...TUNES.esteJedno!, rate: 0.62, detune: -2 },
          new Vector3(ezoCell.x, 1.2, ezoCell.z),
          0.9,
        );
        if (cp === 'ezo') {
          sitAt(playerSeat, 0, true);
          return;
        }
        void solo(async () => {
          await game.clock.wait(1.5);
          await say('t_arrive');
          await say('t_listen');
        });
      },
      tick() {
        st.seatedDrink = game.seatedWithDrink;
        const c = nearestTable();
        const it = game.interactions.get('sitAnywhere');
        if (it && c) it.pos.set(c.x, 0.8, c.z);
      },
      frame(dt, alpha, t) {
        const p = game.player.pos;
        // move the light pool to the nearest live tubes
        const near = tubes
          .map((v, i) => ({ v, i, d: Math.hypot(v.x - p.x, v.z - p.z) }))
          .filter((x) => !deadTubes.has(x.i))
          .sort((a, c) => a.d - c.d)
          .slice(0, pool.length);
        near.forEach((n, i) => {
          const l = pool[i]!;
          l.position.set(n.v.x, H - 0.25, n.v.z);
          const flick = n.i % 5 === 0 ? (Math.sin(t * 37 + n.i) > 0.92 ? 0.2 : 1) : 1;
          l.intensity = 15 * flick;
        });
        // rain on the windows
        if (Math.floor(t * 12) !== Math.floor((t - dt) * 12)) drawRain(rainG, t);
        rainTex.needsUpdate = true;
        // Ežo
        if (ezo) {
          ezo.lookTarget = game.renderer.camera.position;
          ezo.update(dt, t);
        }
        flame.scale.y = 0.8 + 0.4 * Math.sin(t * 13) * Math.sin(t * 7.1);
        candle.intensity = 2.0 + 0.4 * Math.sin(t * 11) * Math.sin(t * 5.3);
        // the waitress
        if (staffVis) {
          staffVis.root.position.set(
            staff.prevPos.x + (staff.pos.x - staff.prevPos.x) * alpha,
            0,
            staff.prevPos.z + (staff.pos.z - staff.prevPos.z) * alpha,
          );
          staffVis.root.rotation.y = staff.yaw + Math.PI;
          const moved = staff.pos.distanceTo(lastStaffPos);
          lastStaffPos.copy(staff.pos);
          staffVis.walkPhase += moved * 4.2;
          staffVis.walk = clamp(staff.anim.move * 3, 0, 1);
          staffVis.lookTarget = staff.anim.alert ? game.renderer.camera.position : null;
          staffVis.update(dt, t);
          clinkDist += moved;
          if (clinkDist > 1.4) {
            clinkDist = 0;
            game.synth.clink(staff.pos.clone().setY(1.3), 0.35);
          }
        }
        // the SKLAD door shows itself to drunk eyes only
        sklad.visible = game.status.layerVisionActive || st.skladOpen;
        void Layer;
      },
      visibility: () => 0.75,
      darkness: () => 0.15,
    };
  },
};

function drawRain(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = '#0b1118';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(160,190,220,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = (i * 37 + Math.floor(t * 3) * 13) % 128;
    const y = (i * 53 + t * 140 * (1 + (i % 3) * 0.3)) % 140;
    g.beginPath();
    g.moveTo(x, y - 12);
    g.lineTo(x - 1, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(40,60,90,0.25)';
  g.fillRect(0, 100, 128, 28);
}

function skladTexture(scope: Parameters<RealityModule['create']>[0]['scope']): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a2a1c';
  g.fillRect(0, 0, 256, 512);
  g.strokeStyle = '#1e140c';
  g.lineWidth = 6;
  g.strokeRect(12, 12, 232, 488);
  g.fillStyle = '#d8d0b8';
  g.fillRect(48, 90, 160, 50);
  g.fillStyle = '#1b1b1b';
  g.font = "bold 40px 'IBM Plex Sans Condensed', Arial";
  g.textAlign = 'center';
  g.fillText('SKLAD', 128, 130);
  g.fillStyle = '#b8a070';
  g.beginPath();
  g.arc(210, 270, 10, 0, Math.PI * 2);
  g.fill();
  const t = scope.add(new CanvasTexture(c));
  t.colorSpace = 'srgb';
  return t;
}

export default reality;

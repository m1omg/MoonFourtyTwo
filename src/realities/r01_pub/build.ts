import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  SpotLight,
  Vector3,
} from 'three';
import type { Object3D, Texture } from 'three';
import type { RealityCtx } from '../../world/Reality.ts';
import type { KitMaterial } from '../../world/kit/Builder.ts';
import { Props } from '../../world/props.ts';
import { Tableware, tallyTexture } from '../../world/objects/tableware.ts';
import { HockeyTV, WallClock, CanvasPanel } from '../../world/objects/screens.ts';
import { Door } from '../../world/objects/door.ts';
import { Character } from '../../npc/Character.ts';
import { NavGrid, Area } from '../../sim/ai/nav/NavGrid.ts';

/** Everything the pub scripts need to animate or query. */
export interface Pub {
  props: Props;
  tw: Tableware;
  ezo: Character | null;
  vierka: Character | null;
  jano: Object3D | null;
  fero: Object3D | null;
  tv: HockeyTV;
  tvLight: PointLight;
  clock: WallClock;
  slot: CanvasPanel;
  jukebox: CanvasPanel;
  neon: CanvasPanel;
  frontDoor: Door;
  wcDoor: Door;
  stallDoor: Door;
  ourMat: { tex: CanvasTexture; draw(n: number): void };
  playerMug: Object3D;
  ezoMug: Object3D;
  lampLights: PointLight[];
  lampMeshes: Mesh[];
  barLight: PointLight;
  wcLight: PointLight;
  streetLights: PointLight[];
  windowFigure: Object3D;
  tvFigure: Object3D;
  /** Seat positions (feet) and yaw for the player. */
  playerSeat: { pos: Vector3; yaw: number };
  ezoSeat: Vector3;
  vierkaSpot: Vector3;
  nav: NavGrid;
  glyph: Mesh;
  beerStream: Mesh;
  cellarHatch: Mesh;
  photoTex: CanvasTexture;
  stoveGlow: PointLight;
}

export const PUB_MODELS = [
  'painted_wooden_chair_02',
  'WoodenTable_03',
  'round_wooden_table_01',
  'bar_chair_round_01',
  'Television_01',
  'dartboard',
  'CashRegister_01',
  'wine_bottles_01',
  'hanging_picture_frame_01',
  'hanging_picture_frame_02',
  'standing_chalkboard_01',
  'scandinavian_masonry_heater',
  'hanging_industrial_lamp',
  'wooden_display_shelves_01',
  'Barrel_01',
  'street_lamp_01',
  'plastic_monobloc_chair_01',
  'covered_car',
  'bull_head',
  'cigarette_pack',
  'ezo',
  'vierka',
  'jano',
  'fero',
];

const H = 3.0; // ceiling height

export async function buildPub(ctx: RealityCtx, opts: { outdoor: boolean }): Promise<Pub> {
  const { game, scene, scope, builder: b, mats } = ctx;
  const props = new Props(game.loader, scene, scope, b);
  await props.load(PUB_MODELS, (p) => ctx.progress(p * 0.7));

  // ───────── materials ─────────
  const floorTiles = mats.get('pubFloor', {
    tex: 'brown_floor_tiles',
    proc: 'tiles',
    color: 0x6e4a33,
    uvScale: 1.4,
    surface: 'tile',
    roughness: 0.7,
  });
  const panel = mats.get('pubPanel', {
    tex: 'dark_paneled_wood',
    proc: 'panel',
    color: 0x4a2f1c,
    uvScale: 1.6,
    surface: 'wood',
  });
  const plaster = mats.get('pubPlaster', {
    tex: 'plastered_wall_04',
    proc: 'plaster',
    color: 0xd8cca8,
    uvScale: 2.2,
    surface: 'concrete',
    tint: 0xf4e8c6,
    roughness: 0.95,
  });
  const ceiling = mats.get('pubCeiling', {
    tex: 'white_plaster_rough_01',
    proc: 'plaster',
    color: 0xe0d6c0,
    uvScale: 2.5,
    surface: 'concrete',
    tint: 0xf3ead8,
  });
  const darkWood = mats.get('darkWood', {
    tex: 'dark_wooden_planks',
    proc: 'planks',
    color: 0x3b2516,
    uvScale: 1.5,
    surface: 'wood',
  });
  const counterTop = mats.get('counterTop', {
    tex: 'wood_table_worn',
    proc: 'planks',
    color: 0x5a3a22,
    uvScale: 1.2,
    surface: 'wood',
    roughness: 0.5,
  });
  const wcTiles = mats.get('wcTiles', {
    tex: 'grey_tiles',
    proc: 'tiles',
    color: 0xc8d0cc,
    uvScale: 1.2,
    surface: 'tile',
    roughness: 0.35,
  });
  const trim = mats.get('trim', { proc: 'planks', color: 0x2a1a10, uvScale: 1, surface: 'wood' });
  const doorMat = darkWood.material;

  // ───────── room shell ─────────
  b.floor(-6, -4.5, 6, 4.5, 0, floorTiles);
  b.ceiling(-6, -4.5, 6, 4.5, H, ceiling);
  const wainscot = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    openings: Parameters<typeof b.wall>[8] = [],
  ) => {
    b.wall(
      ax,
      az,
      bx,
      bz,
      0,
      1.2,
      panel,
      0.2,
      openings.map((o) => ({ ...o, top: Math.min(o.top, 1.2) })),
      { collide: true },
    );
    b.wall(ax, az, bx, bz, 1.2, H, plaster, 0.2, openings, { collide: true });
    b.wall(ax, az, bx, bz, 1.18, 1.24, trim, 0.24, openings, { collide: false });
  };
  const frontDoorX = -4.2;
  const windows = [
    { at: 6 - 0.8, width: 1.6, bottom: 0.9, top: 2.3 },
    { at: 6 + 2.8, width: 1.6, bottom: 0.9, top: 2.3 },
  ];
  wainscot(-6, 4.5, 6, 4.5, [{ at: 6 + frontDoorX, width: 1.0, bottom: 0, top: 2.1 }, ...windows]);
  wainscot(-6, -4.5, 6, -4.5);
  wainscot(6, -4.5, 6, 4.5);
  wainscot(-6, -4.5, -6, 4.5, [{ at: 4.5 - 1.2, width: 0.9, bottom: 0, top: 2.1 }]);

  // window glass + frames
  const glassMat = scope.add(
    new MeshStandardMaterial({
      color: 0x223040,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.18,
    }),
  );
  for (const w of windows) {
    const cx = -6 + w.at;
    const pane = new Mesh(scope.add(new PlaneGeometry(w.width, w.top - w.bottom)), glassMat);
    pane.position.set(cx, (w.top + w.bottom) / 2, 4.5);
    pane.rotation.y = Math.PI;
    scene.add(pane);
    b.box([cx - w.width / 2, w.bottom - 0.06, 4.38], [cx + w.width / 2, w.bottom, 4.62], trim, {
      collide: false,
    });
    b.box([cx - 0.03, w.bottom, 4.46], [cx + 0.03, w.top, 4.54], trim, { collide: false });
    b.box(
      [cx - w.width / 2, (w.top + w.bottom) / 2 + 0.25, 4.47],
      [cx + w.width / 2, (w.top + w.bottom) / 2 + 0.29, 4.53],
      trim,
      { collide: false },
    );
    // invisible collider so nobody walks through the glass
    b.box([cx - w.width / 2, w.bottom, 4.45], [cx + w.width / 2, w.top, 4.55], null);
  }

  // ───────── bar ─────────
  b.box([-5.4, 0, -3.2], [1.4, 1.05, -2.62], darkWood);
  b.box([-5.45, 1.05, -3.26], [1.45, 1.1, -2.52], counterTop, { walkSurface: false });
  b.box([1.4, 0, -4.4], [1.45, 1.05, -3.2], darkWood); // return
  // behind-bar floor step
  b.box([-5.9, 0, -4.4], [1.4, 0.02, -3.2], counterTop, { collide: false });
  // back shelves
  props.place('wooden_display_shelves_01', { pos: [-5.1, 0, -4.12], rotY: 0, collide: 'box' });
  for (const y of [1.2, 1.75]) b.box([-3.0, y - 0.03, -4.4], [0.2, y, -4.15], counterTop, { collide: false });
  props.place('wine_bottles_01', { pos: [-0.75, 1.75, -4.28], collide: 'none', scale: 0.9 });
  props.place('Barrel_01', { pos: [-4.4, 0, -3.95], scale: 0.9 });
  const tw = new Tableware(scope);
  const bottleColors = [0x2f5d2a, 0x6b3410, 0xd8d8c8, 0x203a1c, 0x8a5a14, 0xe0e6d8, 0x3c1a0e, 0x1f4a2f];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 9; i++) {
      const bt = tw.bottle(bottleColors[(i + row * 3) % bottleColors.length]!);
      bt.position.set(-2.8 + i * 0.25, row ? 1.75 : 1.2, -4.28);
      scene.add(bt);
    }
  }
  props.place('CashRegister_01', { pos: [0.85, 1.1, -2.9], rotY: Math.PI * 0.05, collide: 'none' });
  // beer tap tower
  const chrome = scope.add(new MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.18 }));
  const tower = new Mesh(scope.add(new CylinderGeometry(0.05, 0.06, 0.42, 16)), chrome);
  tower.position.set(-1.2, 1.31, -2.95);
  scene.add(tower);
  for (const dx of [-0.08, 0.08]) {
    const spout = new Mesh(scope.add(new CylinderGeometry(0.012, 0.012, 0.14, 8)), chrome);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(-1.2 + dx, 1.42, -2.88);
    const handle = new Mesh(
      scope.add(new CylinderGeometry(0.014, 0.018, 0.18, 8)),
      scope.add(new MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })),
    );
    handle.position.set(-1.2 + dx, 1.55, -2.92);
    scene.add(spout, handle);
  }
  // frozen beer stream (R2), hidden by default
  const beerStream = new Mesh(scope.add(new CylinderGeometry(0.009, 0.011, 0.26, 8)), tw.beer);
  beerStream.position.set(-1.12, 1.25, -2.82);
  beerStream.visible = false;
  scene.add(beerStream);
  // bar stools
  for (const x of [-4.4, -3.1, -1.8])
    props.place('bar_chair_round_01', { pos: [x, 0, -2.15], rotY: Math.PI, shrink: 0.08 });
  // cellar hatch behind the bar
  const cellarHatch = new Mesh(scope.add(new BoxGeometry(0.9, 0.03, 0.7)), doorMat);
  cellarHatch.position.set(-4.6, 0.035, -3.75);
  scene.add(cellarHatch);

  // ───────── tables ─────────
  const CHAIR = 'painted_wooden_chair_02';
  props.place('WoodenTable_03', { pos: [3.0, 0, 3.25], rotY: Math.PI / 2 });
  const playerSeatPos = new Vector3(3.0, 0, 2.42);
  props.place(CHAIR, { pos: [3.0, 0, 2.5], rotY: 0, collide: 'none' });
  props.place(CHAIR, { pos: [3.0, 0, 4.02], rotY: Math.PI, collide: 'none' });
  props.place('round_wooden_table_01', { pos: [-4.3, 0, 2.6], scale: 0.79 });
  props.place('WoodenTable_03', { pos: [-1.0, 0, 2.6], rotY: Math.PI / 2 });
  props.place('WoodenTable_03', { pos: [-1.2, 0, -0.5], rotY: 0 });
  props.place('round_wooden_table_01', { pos: [2.6, 0, -0.6], scale: 0.79 });
  for (const [x, z, r] of [
    [-1.0, 1.85, 0],
    [-1.0, 3.35, Math.PI],
    [-1.95, -0.5, -Math.PI / 2],
    [-0.45, -0.5, Math.PI / 2],
    [2.6, -1.35, 0],
    [2.6, 0.15, Math.PI],
    [3.35, -0.6, Math.PI / 2],
  ] as Array<[number, number, number]>) {
    props.place(CHAIR, { pos: [x, 0, z], rotY: r, shrink: 0.12 });
  }
  // stain the painted chairs dark brown like the rest of the pub
  scene.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && (m.material as MeshStandardMaterial)?.name?.toLowerCase().includes('chair')) {
      (m.material as MeshStandardMaterial).color.setHex(0x6b4a33);
    }
  });

  // ───────── characters ─────────
  const makeChar = (id: string) => {
    const g = props.gltf(id);
    if (!g) return null;
    const c = new Character(g);
    scene.add(c.root);
    return c;
  };
  const ezo = makeChar('ezo');
  const ezoSeat = new Vector3(3.0, 0, 4.12);
  if (ezo) {
    ezo.pose = 'sit';
    ezo.root.position.set(3.0, -0.5, 3.95);
    ezo.root.rotation.y = Math.PI;
  }
  const vierka = makeChar('vierka');
  const vierkaSpot = new Vector3(-1.4, 0.02, -3.7);
  if (vierka) {
    vierka.pose = 'stand';
    vierka.armOnTable = false;
    vierka.root.position.copy(vierkaSpot);
  }
  const jano = props.place('jano', {
    pos: [-4.85, 0, 2.15],
    rotY: Math.PI * 0.2,
    collide: 'box',
    shrink: 0.1,
  });
  const fero = props.place('fero', {
    pos: [-3.75, 0, 3.05],
    rotY: Math.PI + Math.PI * 0.2,
    collide: 'box',
    shrink: 0.1,
  });

  // glasses on tables
  const ourMat = tallyTexture(scope, 3, 1);
  const tableTop = 0.83;
  const mat1 = tw.mat(ourMat.tex);
  mat1.position.set(3.05, tableTop + 0.002, 2.98);
  scene.add(mat1);
  const playerMug = tw.mug(0.9);
  playerMug.position.set(3.2, tableTop + 0.004, 2.86);
  scene.add(playerMug);
  const ezoMug = tw.mug(0.6);
  if (ezo) ezo.attach('RightHand', ezoMug, [0.02, -0.07, 0.06], [0, 0, Math.PI / 2]);
  const crowdMat = tallyTexture(scope, 3871, 7);
  for (const [x, z] of [
    [-1.1, 2.9],
    [2.4, -0.4],
    [-4.1, 2.45],
  ] as Array<[number, number]>) {
    const m = tw.mat(crowdMat.tex);
    m.position.set(x, tableTop - 0.04 + 0.002, z);
    scene.add(m);
    const mug = tw.mug(0.15);
    mug.position.set(x + 0.1, tableTop - 0.04 + 0.004, z + 0.08);
    scene.add(mug);
  }

  // ───────── fixtures ─────────
  const stove = props.place('scandinavian_masonry_heater', { pos: [-5.25, 0, 3.75], scale: 0.95 });
  void stove;
  const stoveGlow = new PointLight(0xff6a20, 0, 3, 2);
  stoveGlow.position.set(-5.0, 0.5, 3.4);
  scene.add(stoveGlow);
  props.place('bull_head', { pos: [-5.82, 2.05, 0.6], rotY: Math.PI / 2, collide: 'none', scale: 1.3 });
  props.place('dartboard', { pos: [5.86, 1.73, -1.6], rotY: -Math.PI / 2, collide: 'none' });
  props.place('standing_chalkboard_01', { pos: [-2.9, 0, 3.85], rotY: Math.PI * 0.85, shrink: 0.05 });
  props.place('cigarette_pack', { pos: [2.82, tableTop + 0.004, 3.4], rotY: 0.6, collide: 'none' });
  // TV in the corner above the bar end
  const tvModel = props.place('Television_01', { pos: [1.95, 2.25, -4.05], rotY: 0, collide: 'none' });
  void tvModel;
  b.box([1.6, 2.15, -4.4], [2.3, 2.25, -3.75], trim, { collide: false });
  const tv = new HockeyTV(scope, 0.37, 0.28);
  tv.screen.position.set(1.885, 2.25 + 0.24, -4.05 + 0.236);
  scene.add(tv.screen);
  const tvLight = new PointLight(0x9fc0ff, 0.6, 5, 2);
  tvLight.position.set(1.9, 2.3, -3.6);
  scene.add(tvLight);
  // clock
  const clock = new WallClock(scope, 0.17);
  clock.root.position.set(-0.6, 2.45, -4.39);
  scene.add(clock.root);
  // calendar
  const cal = new CanvasPanel(scope, 256, 360, 0.36, 0.5, false);
  drawCalendar(cal);
  cal.mesh.position.set(0.95, 1.75, -4.39);
  scene.add(cal.mesh);
  // photo frame with an old photograph
  const photoTex = oldPhotoTexture(scope);
  const frame = props.place('hanging_picture_frame_01', {
    pos: [5.86, 1.55, 3.2],
    rotY: -Math.PI / 2,
    collide: 'none',
    scale: 1.4,
  });
  void frame;
  const photo = new Mesh(
    scope.add(new PlaneGeometry(0.36, 0.27)),
    scope.add(new MeshStandardMaterial({ map: photoTex, roughness: 0.6 })),
  );
  photo.position.set(5.84, 1.7, 3.2);
  photo.rotation.y = -Math.PI / 2;
  scene.add(photo);
  props.place('hanging_picture_frame_02', {
    pos: [-5.86, 1.6, -2.4],
    rotY: Math.PI / 2,
    collide: 'none',
    scale: 1.4,
  });
  // slot machine
  b.box([5.35, 0, -4.1], [5.95, 1.55, -3.4], darkWood);
  const slot = new CanvasPanel(scope, 256, 320, 0.5, 0.62);
  drawSlot(slot, ['7', 'ČE', 'ZV'], 0);
  slot.mesh.position.set(5.34, 1.05, -3.75);
  slot.mesh.rotation.y = -Math.PI / 2;
  scene.add(slot.mesh);
  const slotLight = new PointLight(0xff3dd2, 0.5, 2.5, 2);
  slotLight.position.set(5.0, 1.2, -3.75);
  scene.add(slotLight);
  // jukebox
  b.box([5.45, 0, 0.4], [5.95, 1.45, 1.2], trim);
  const jukebox = new CanvasPanel(scope, 256, 320, 0.66, 0.82);
  drawJukebox(jukebox, -1, 0);
  jukebox.mesh.position.set(5.44, 0.95, 0.8);
  jukebox.mesh.rotation.y = -Math.PI / 2;
  scene.add(jukebox.mesh);
  const jukeLight = new PointLight(0xffa040, 0.6, 3, 2);
  jukeLight.position.set(5.0, 1.1, 0.8);
  scene.add(jukeLight);
  // neon sign in the left window
  const neon = new CanvasPanel(scope, 256, 96, 0.9, 0.34);
  neon.g.clearRect(0, 0, 256, 96);
  neon.g.font = "italic 64px 'Spectral', Georgia, serif";
  neon.g.textAlign = 'center';
  neon.g.textBaseline = 'middle';
  neon.g.shadowColor = '#ff2a2a';
  neon.g.shadowBlur = 18;
  neon.g.fillStyle = '#ff5a4a';
  neon.g.fillText('Pivo', 128, 50);
  neon.commit();
  neon.mesh.position.set(-0.8, 1.95, 4.42);
  neon.mesh.rotation.y = Math.PI;
  scene.add(neon.mesh);
  const neonLight = new PointLight(0xff3020, 0.7, 3.5, 2);
  neonLight.position.set(-0.8, 1.9, 4.0);
  scene.add(neonLight);
  // the glyph (hidden until drunk enough): two dots on concentric circles, on the WC door frame
  const glyphTex = glyphTexture(scope);
  const glyph = new Mesh(
    scope.add(new PlaneGeometry(0.34, 0.34)),
    scope.add(
      new MeshBasicMaterial({
        map: glyphTex,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
      }),
    ),
  );
  glyph.position.set(-5.88, 2.35, -1.2);
  glyph.rotation.y = Math.PI / 2;
  scene.add(glyph);
  // coat rack with Ežo's (empty) hooks
  const rack = new Mesh(scope.add(new CylinderGeometry(0.025, 0.03, 1.85, 8)), trim.material);
  rack.position.set(-5.5, 0.92, 4.05);
  scene.add(rack);
  b.box([-5.6, 0, 3.95], [-5.4, 1.85, 4.15], null);

  // pendant lamps over tables
  const lampLights: PointLight[] = [];
  const lampMeshes: Mesh[] = [];
  const bulbMat = scope.add(new MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
  for (const [x, z] of [
    [3.0, 3.25],
    [-4.3, 2.6],
    [-1.0, 2.6],
    [-1.2, -0.5],
    [2.6, -0.6],
  ] as Array<[number, number]>) {
    props.place('hanging_industrial_lamp', { pos: [x, H, z], collide: 'none', scale: 0.72 });
    const bulb = new Mesh(scope.add(new SphereGeometry(0.03, 10, 8)), bulbMat);
    bulb.position.set(x, H - 0.92, z);
    scene.add(bulb);
    lampMeshes.push(bulb);
    const l = new PointLight(0xffd6a8, 3.0, 7, 1.6);
    l.position.set(x, H - 1.0, z);
    scene.add(l);
    lampLights.push(l);
  }
  // key light with shadows over our table (med/high)
  const key = new SpotLight(0xffd2a0, 7, 7, 0.95, 0.7, 1.6);
  key.position.set(3.0, H - 1.0, 3.25);
  key.target.position.set(3.0, 0, 3.25);
  key.castShadow = game.renderer.profile.shadows;
  key.shadow.mapSize.set(game.renderer.profile.shadowMapSize, game.renderer.profile.shadowMapSize);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  // cold fluorescent over the back bar
  const tube = new Mesh(
    scope.add(new BoxGeometry(2.4, 0.04, 0.06)),
    scope.add(new MeshBasicMaterial({ color: 0xe8f4ff, toneMapped: false })),
  );
  tube.position.set(-2.2, 2.55, -4.2);
  scene.add(tube);
  const barLight = new PointLight(0xdfeeff, 3.2, 6, 1.6);
  barLight.position.set(-2.2, 2.4, -3.6);
  scene.add(barLight);
  scene.add(new HemisphereLight(0x3a3448, 0x1e140c, 0.7));
  scene.add(new AmbientLight(0x3a3026, 0.45));

  // ───────── WC ─────────
  b.floor(-9.0, -3.2, -6.0, 0.2, 0, wcTiles);
  b.ceiling(-9.0, -3.2, -6.0, 0.2, 2.6, ceiling);
  b.wall(-9.0, -3.2, -6.0, -3.2, 0, 2.6, wcTiles, 0.2);
  b.wall(-9.0, 0.2, -6.0, 0.2, 0, 2.6, wcTiles, 0.2);
  b.wall(-9.0, -3.2, -9.0, 0.2, 0, 2.6, wcTiles, 0.2);
  // stall walls
  b.wall(-7.8, -0.4, -7.8, 0.2, 0, 2.1, darkWood, 0.04);
  b.wall(-9.0, -0.4, -8.85, -0.4, 0, 2.1, darkWood, 0.04);
  const stallDoor = new Door(scope, game.world, [-8.85, 0, -0.4], 0, 1.0, 2.0, doorMat, -1, 0.04);
  scene.add(stallDoor.pivot);
  // sink + mirror
  b.box([-8.2, 0.75, -3.1], [-7.6, 0.85, -2.7], wcTiles);
  const mirror = new Mesh(
    scope.add(new PlaneGeometry(0.55, 0.75)),
    scope.add(
      new MeshStandardMaterial({ color: 0x9aa4aa, metalness: 1, roughness: 0.05, envMapIntensity: 1.2 }),
    ),
  );
  mirror.position.set(-7.9, 1.45, -3.09);
  scene.add(mirror);
  const wcLight = new PointLight(0xe0f0ff, 2.2, 5, 1.6);
  wcLight.position.set(-7.5, 2.4, -1.5);
  scene.add(wcLight);
  const wcDoor = new Door(scope, game.world, [-6.0, 0, -0.75], Math.PI / 2, 0.9, 2.08, doorMat, 1, 0.05);
  scene.add(wcDoor.pivot);

  // ───────── front door + facade ─────────
  const frontDoor = new Door(scope, game.world, [frontDoorX - 0.5, 0, 4.5], 0, 1.0, 2.08, doorMat, -1, 0.06);
  scene.add(frontDoor.pivot);

  // window figure (outside, under the lamp across the street) and the TV-only figure (R2)
  const shadowMat = scope.add(new MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
  const windowFigure = silhouette(scope, shadowMat);
  windowFigure.position.set(4.5, 0, 15.5);
  windowFigure.visible = false;
  scene.add(windowFigure);
  const tvFigure = silhouette(scope, shadowMat);
  tvFigure.scale.set(1.05, 1.22, 1.05);
  tvFigure.visible = false;
  scene.add(tvFigure);

  const streetLights: PointLight[] = [];
  if (opts.outdoor) buildStreet(ctx, props, streetLights);
  else {
    // a black void behind the windows
    const black = new Mesh(
      scope.add(new PlaneGeometry(14, 4)),
      scope.add(new MeshBasicMaterial({ color: 0x000000 })),
    );
    black.position.set(0, 1.6, 4.9);
    black.rotation.y = Math.PI;
    scene.add(black);
  }

  // ───────── atmosphere ─────────
  scene.background = new Color(0x020203);
  scene.fog = new FogExp2(0x0b0a0c, 0.022);
  game.grade = {
    lift: [0.015, 0.008, 0.0],
    gamma: [1.0, 1.0, 1.02],
    gain: [1.04, 1.0, 0.92],
    saturation: 0.86,
    contrast: 1.07,
    tint: [1.0, 0.98, 0.93],
    grain: 0.018,
  };

  // ───────── navigation (interior) ─────────
  const nav = new NavGrid(Math.round(21 / 0.5), Math.round(10 / 0.5), 0.5, -9.5, -5);
  nav.fillRect(-5.8, -2.4, 5.8, 4.3, Area.WALK);
  nav.fillRect(-8.8, -3.0, -6.0, 0.0, Area.WALK);
  nav.fillRect(-6.2, -1.6, -5.8, -0.8, Area.WALK | Area.DOOR);
  const block = (x0: number, z0: number, x1: number, z1: number) => nav.fillRect(x0, z0, x1, z1, 0, true);
  block(2.4, 2.6, 3.6, 3.9);
  block(-5.0, 1.9, -3.6, 3.3);
  block(-1.6, 1.9, -0.4, 3.3);
  block(-1.9, -1.0, -0.5, 0.0);
  block(1.9, -1.3, 3.3, 0.1);
  block(-5.8, 3.4, -4.7, 4.3);
  block(5.3, -4.4, 5.9, 1.3);

  return {
    props,
    tw,
    ezo,
    vierka,
    jano,
    fero,
    tv,
    tvLight,
    clock,
    slot,
    jukebox,
    neon,
    frontDoor,
    wcDoor,
    stallDoor,
    ourMat,
    playerMug,
    ezoMug,
    lampLights,
    lampMeshes,
    barLight,
    wcLight,
    streetLights,
    windowFigure,
    tvFigure,
    playerSeat: { pos: playerSeatPos, yaw: Math.PI },
    ezoSeat,
    vierkaSpot,
    nav,
    glyph,
    beerStream,
    cellarHatch,
    photoTex,
    stoveGlow,
  };
}

function silhouette(scope: RealityCtx['scope'], mat: MeshStandardMaterial): Group {
  const g = new Group();
  const body = new Mesh(scope.add(new CylinderGeometry(0.18, 0.24, 1.45, 10)), mat);
  body.position.y = 0.9;
  const head = new Mesh(scope.add(new SphereGeometry(0.13, 12, 10)), mat);
  head.position.y = 1.78;
  const coat = new Mesh(scope.add(new CylinderGeometry(0.26, 0.32, 1.1, 10)), mat);
  coat.position.y = 0.7;
  g.add(body, head, coat);
  return g;
}

function buildStreet(ctx: RealityCtx, props: Props, lights: PointLight[]): void {
  const { scene, scope, builder: b, mats } = ctx;
  const cobble = mats.get('cobble', {
    tex: 'cobblestone_floor_04',
    proc: 'brick',
    color: 0x4a4744,
    uvScale: 2.2,
    surface: 'gravel',
    roughness: 0.9,
  });
  const pavement = mats.get('pavement', {
    tex: 'concrete_floor_worn_001',
    proc: 'concrete',
    color: 0x5d5a55,
    uvScale: 3,
    surface: 'concrete',
  });
  const facade = mats.get('facade', {
    tex: 'plastered_wall_04',
    proc: 'plaster',
    color: 0x8a8174,
    uvScale: 3.5,
    surface: 'concrete',
    tint: 0xb9b0a0,
  });
  // ground
  b.floor(-30, 4.6, 30, 7.2, 0, pavement);
  b.floor(-30, 7.2, 30, 40, -0.12, cobble);
  // pub facade (outer skin of the front wall)
  b.box([-14, 0, 4.62], [-6.1, 6.5, 5.0], facade);
  b.box([6.1, 0, 4.62], [14, 6.5, 5.0], facade);
  b.box([-6.1, 3.1, 4.6], [6.1, 6.5, 4.75], facade, { collide: false });
  // pub sign with a wagon wheel
  const sign = new Mesh(
    scope.add(new PlaneGeometry(3.2, 0.62)),
    scope.add(
      new MeshStandardMaterial({
        map: signTexture(scope),
        roughness: 0.6,
        emissive: 0xffffff,
        emissiveMap: signTexture(scope),
        emissiveIntensity: 0.35,
      }),
    ),
  );
  sign.position.set(-1.2, 3.35, 4.78);
  scene.add(sign);
  // other houses around the square (simple blocks with a few lit windows)
  const winTex = windowsTexture(scope);
  const houseMat = scope.add(
    new MeshStandardMaterial({
      color: 0x3a3631,
      roughness: 0.95,
      emissive: 0xffc070,
      emissiveMap: winTex,
      emissiveIntensity: 0.9,
      map: winTex,
    }),
  );
  for (const [x0, z0, x1, z1, h] of [
    [-30, 14, -16, 26, 7],
    [16, 12, 30, 24, 8],
    [-12, 34, 12, 40, 14],
    [-30, 28, -14, 40, 9],
    [14, 28, 30, 40, 7],
  ] as Array<[number, number, number, number, number]>) {
    const m = new Mesh(scope.add(new BoxGeometry(x1 - x0, h, z1 - z0)), houseMat);
    m.position.set((x0 + x1) / 2, h / 2 - 0.12, (z0 + z1) / 2);
    scene.add(m);
    b.box([x0, -0.12, z0], [x1, h, z1], null);
  }
  // church facade with a tower
  const church = new Mesh(
    scope.add(new BoxGeometry(6, 22, 3)),
    scope.add(new MeshStandardMaterial({ color: 0x8c8678, roughness: 0.9 })),
  );
  church.position.set(0, 11, 37);
  scene.add(church);
  // plague column
  const col = new Mesh(
    scope.add(new CylinderGeometry(0.35, 0.45, 6, 12)),
    scope.add(new MeshStandardMaterial({ color: 0x9a9284, roughness: 0.85 })),
  );
  col.position.set(0, 3, 22);
  const base = new Mesh(scope.add(new BoxGeometry(2.4, 0.9, 2.4)), col.material);
  base.position.set(0, 0.33, 22);
  const top = new Mesh(scope.add(new SphereGeometry(0.45, 12, 10)), col.material);
  top.position.set(0, 6.3, 22);
  scene.add(col, base, top);
  b.box([-1.2, -0.12, 20.8], [1.2, 0.8, 23.2], null);
  // bus stop shelter
  const concrete = scope.add(new MeshStandardMaterial({ color: 0x7c7870, roughness: 0.95 }));
  const shelterBack = new Mesh(scope.add(new BoxGeometry(4, 2.4, 0.15)), concrete);
  shelterBack.position.set(14, 1.1, 18.6);
  const shelterRoof = new Mesh(scope.add(new BoxGeometry(4.3, 0.15, 1.6)), concrete);
  shelterRoof.position.set(14, 2.35, 17.9);
  scene.add(shelterBack, shelterRoof);
  b.box([12, -0.12, 18.5], [16, 2.3, 18.7], null);
  // street lamps
  for (const [x, z] of [
    [-7, 6.6],
    [5, 6.6],
    [4.5, 16.5],
    [-9, 18],
    [12, 16.5],
  ] as Array<[number, number]>) {
    props.place('street_lamp_01', {
      pos: [x, x === -7 || x === 5 ? 0 : -0.12, z],
      collide: 'box',
      shrink: 0.0,
    });
    const l = new PointLight(0xffa94d, 6, 13, 1.7);
    l.position.set(x, 4.3, z);
    scene.add(l);
    lights.push(l);
  }
  props.place('covered_car', { pos: [-9.5, -0.12, 10], rotY: Math.PI / 2 });
  for (let i = 0; i < 4; i++)
    props.place('plastic_monobloc_chair_01', {
      pos: [2.2, i * 0.09, 5.6],
      rotY: 0.2,
      collide: i === 0 ? 'box' : 'none',
    });
  // invisible bounds (the street "ends" in fog)
  b.box([-30, -1, 40], [30, 10, 41], null);
  b.box([-31, -1, 4.6], [-30, 10, 41], null);
  b.box([30, -1, 4.6], [31, 10, 41], null);
  // night sky dome: dark, cloudless — and starless
  const sky = new Mesh(
    scope.add(new SphereGeometry(80, 24, 16)),
    scope.add(new MeshBasicMaterial({ color: 0x05070d, side: 1, fog: false })),
  );
  sky.position.set(0, -10, 20);
  scene.add(sky);
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function signTexture(scope: RealityCtx['scope']): CanvasTexture {
  const [c, g] = canvas(1024, 200);
  g.fillStyle = '#1d1a14';
  g.fillRect(0, 0, 1024, 200);
  g.strokeStyle = '#b0904a';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 1008, 184);
  // wagon wheel
  g.save();
  g.translate(110, 100);
  g.strokeStyle = '#c9a75a';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(0, 0, 72, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    g.rotate(Math.PI / 6);
    g.beginPath();
    g.moveTo(0, 12);
    g.lineTo(0, 70);
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, 12, 0, Math.PI * 2);
  g.fillStyle = '#c9a75a';
  g.fill();
  g.restore();
  g.fillStyle = '#e9d9a8';
  g.font = "600 92px 'Spectral', Georgia, serif";
  g.textBaseline = 'middle';
  g.fillText('Piváreň U Kolesa', 210, 104);
  const t = scope.add(new CanvasTexture(c));
  t.colorSpace = 'srgb';
  return t;
}

function windowsTexture(scope: RealityCtx['scope']): CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 6; x++) {
      if (r() < 0.18) {
        g.fillStyle = r() < 0.5 ? '#ffd890' : '#a8c4ff';
        g.fillRect(12 + x * 40, 20 + y * 60, 22, 32);
      } else {
        g.fillStyle = '#0a0a0c';
        g.fillRect(12 + x * 40, 20 + y * 60, 22, 32);
      }
    }
  const t = scope.add(new CanvasTexture(c));
  t.colorSpace = 'srgb';
  return t;
}

function drawCalendar(p: CanvasPanel): void {
  const g = p.g;
  g.fillStyle = '#f3ecdc';
  g.fillRect(0, 0, 256, 360);
  g.fillStyle = '#8a1c1c';
  g.fillRect(0, 0, 256, 60);
  g.fillStyle = '#fff';
  g.font = "600 34px 'Spectral', Georgia, serif";
  g.textAlign = 'center';
  g.fillText('Október', 128, 42);
  g.fillStyle = '#333';
  g.font = "16px 'IBM Plex Sans Condensed', Arial";
  const days = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
  days.forEach((d, i) => g.fillText(d, 22 + i * 35, 88));
  let day = 1;
  for (let row = 0; row < 6 && day <= 32; row++) {
    for (let col = 0; col < 7 && day <= 32; col++) {
      if (row === 0 && col < 3) continue;
      g.fillStyle = col >= 5 ? '#a11' : '#222';
      g.font = "18px 'IBM Plex Sans Condensed', Arial";
      g.fillText(String(day), 22 + col * 35, 120 + row * 40);
      // crossed-out days
      g.strokeStyle = 'rgba(60,40,140,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(10 + col * 35, 110 + row * 40);
      g.lineTo(34 + col * 35, 124 + row * 40);
      g.stroke();
      day++;
    }
  }
  g.fillStyle = '#777';
  g.font = "12px 'IBM Plex Sans Condensed', Arial";
  g.fillText('Potraviny Jednota · Námestie 3', 128, 352);
  p.commit();
}

export function drawSlot(p: CanvasPanel, reels: string[], spin: number): void {
  const g = p.g;
  g.fillStyle = '#1a0610';
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#ffcc33';
  g.font = "bold 30px 'IBM Plex Sans Condensed', Arial";
  g.textAlign = 'center';
  g.fillText('ZLATÝ BAŽANT', 128, 40);
  g.fillText('VÝHRA', 128, 300);
  for (let i = 0; i < 3; i++) {
    const x = 18 + i * 76;
    g.fillStyle = '#f8f0e0';
    g.fillRect(x, 80, 68, 150);
    g.fillStyle = '#111';
    g.font = "bold 40px 'IBM Plex Sans Condensed', Arial";
    const sym = reels[i] ?? '?';
    const off = spin > 0 ? ((spin * 900 + i * 37) % 150) - 75 : 0;
    if (sym === 'GLYPH') {
      g.strokeStyle = '#111';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x + 34, 155 + off, 26, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(x + 34, 155 + off, 14, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(x + 22, 155 + off, 4, 0, Math.PI * 2);
      g.arc(x + 46, 155 + off, 4, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = sym === '7' ? '#c4122f' : sym === 'ČE' ? '#b5121b' : '#2d6a1f';
      g.fillText(sym, x + 34, 170 + off);
    }
  }
  g.strokeStyle = '#ffcc33';
  g.lineWidth = 4;
  g.strokeRect(14, 76, 228, 158);
  p.commit();
}

export function drawJukebox(p: CanvasPanel, playing: number, t: number): void {
  const g = p.g;
  const grd = g.createLinearGradient(0, 0, 0, 320);
  grd.addColorStop(0, '#ff9a2a');
  grd.addColorStop(1, '#7a2a00');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#2a0d00';
  g.fillRect(20, 60, 216, 200);
  g.fillStyle = '#ffe7b0';
  g.font = "bold 26px 'IBM Plex Sans Condensed', Arial";
  g.textAlign = 'center';
  g.fillText('HUDOBNÝ AUTOMAT', 128, 38);
  const songs = [
    'A1  Ešte jedno — Kolesári',
    'A2  Dychovka z Kolesova',
    'A3  Nočný spoj',
    'B1  ——————',
    'B2  ——————',
  ];
  g.textAlign = 'left';
  g.font = "16px 'IBM Plex Sans Condensed', Arial";
  songs.forEach((s, i) => {
    g.fillStyle = i === playing ? `rgba(255,${200 + Math.sin(t * 6) * 40},120,1)` : '#d9b680';
    g.fillText(s, 30, 92 + i * 34);
  });
  g.fillStyle = '#ffd36b';
  g.textAlign = 'center';
  g.font = "14px 'IBM Plex Sans Condensed', Arial";
  g.fillText('1 pieseň = 1 euro', 128, 290);
  p.commit();
}

function glyphTexture(scope: RealityCtx['scope']): Texture {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(200,230,255,0.95)';
  g.shadowColor = '#9fd0ff';
  g.shadowBlur = 16;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(128, 128, 100, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(128, 128, 58, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(230,245,255,1)';
  g.beginPath();
  g.arc(70, 128, 13, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(186, 128, 13, 0, Math.PI * 2);
  g.fill();
  const t = scope.add(new CanvasTexture(c));
  t.colorSpace = 'srgb';
  return t;
}

function oldPhotoTexture(scope: RealityCtx['scope']): CanvasTexture {
  const [c, g] = canvas(512, 384);
  const grd = g.createRadialGradient(256, 192, 40, 256, 192, 300);
  grd.addColorStop(0, '#c9ad80');
  grd.addColorStop(1, '#5e4628');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 384);
  // table
  g.fillStyle = '#3a2814';
  g.fillRect(120, 250, 280, 26);
  // big man (right) and slimmer man (left), seated
  g.fillStyle = '#2b1d0e';
  g.beginPath();
  g.ellipse(330, 200, 66, 80, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(330, 105, 36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a321a';
  g.beginPath();
  g.ellipse(330, 128, 30, 26, 0, 0, Math.PI); // beard
  g.fill();
  g.fillStyle = '#2b1d0e';
  g.beginPath();
  g.ellipse(190, 210, 44, 66, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(190, 128, 27, 0, Math.PI * 2);
  g.fill();
  // mugs
  g.fillStyle = '#d8c39a';
  g.fillRect(240, 222, 18, 28);
  g.fillRect(268, 222, 18, 28);
  // grain + scratches
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${i % 2 ? 0 : 255},${i % 2 ? 0 : 240},${i % 2 ? 0 : 200},${(i % 7) / 60})`;
    g.fillRect((i * 7919) % 512, (i * 104729) % 384, 1, 1);
  }
  g.strokeStyle = 'rgba(240,230,200,0.25)';
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.moveTo((i * 97) % 512, 0);
    g.lineTo((i * 131) % 512, 384);
    g.stroke();
  }
  g.fillStyle = 'rgba(30,20,10,0.9)';
  g.font = "italic 22px 'Spectral', Georgia, serif";
  g.fillText('U Kolesa, 1906', 330, 368);
  const t = scope.add(new CanvasTexture(c));
  t.colorSpace = 'srgb';
  return t;
}

export function tallyUpdate(m: { draw(n: number): void }, n: number): void {
  m.draw(n);
}

export type { KitMaterial };

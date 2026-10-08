import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Sprite,
  SphereGeometry,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { AmbientLight, Light, Material, Object3D, PointLight } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { CREDITS } from '../../narrative/credits.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { Shade } from '../../sim/ai/behaviors/Shade.ts';
import { clamp, damp } from '../../core/damp.ts';
import { makeDissolve } from '../../render/dissolve.ts';
import { attachFace, maskStatic, smearTexture } from '../../world/objects/faces.ts';
import { Character } from '../../npc/Character.ts';
import { buildPub } from '../r01_pub/build.ts';
import { ASK, L11, LAST } from './lines.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';

/** Seconds the stove has to be kept burning. */
const SIEGE = 90;
/** Heat the stove loses per second, and what one thing in the fire gives back. */
const DRAIN = 1 / 45;
const FEED = 0.3;
/** Beyond z < -EDGE the pub is gone. */
const EDGE = 2.6;
const CHAIR = 'painted_wooden_chair_02';
/** When each of the six steps out of the void (seconds into the siege). */
const RELEASE = [0, 9, 18, 30, 42, 55];

type Phase = 'arrive' | 'talk' | 'siege' | 'calm' | 'pour' | 'stay' | 'end';

const reality: RealityModule = {
  id: 'r11',
  index: 11,
  title: 'Posledná runda',
  async create(ctx) {
    const { game, scene, scope } = ctx;
    const pub = await buildPub(ctx, { outdoor: false, regulars: false });
    await loadVoiceIndex();
    const ezo = pub.ezo;
    const say = async (id: string) => {
      const l = L11[id]!;
      const talking = l.who === 'Ežo' ? ezo : null;
      talking?.setTalking(true);
      if (l.laugh) talking?.laugh();
      try {
        await game.say(l.who, l.text, voiceUrl(id), l.min);
      } finally {
        talking?.setTalking(false);
      }
    };
    game.nav = null;
    game.grade = {
      ...game.grade,
      lift: [0.008, 0.005, 0.002],
      gain: [1.0, 0.97, 0.92],
      saturation: 0.7,
      contrast: 1.1,
      tint: [1.02, 0.99, 0.95],
      grain: 0.03,
    };
    if (!game.hasLight) game.giveLight(1);

    // ───────── the pub at the end: only Ežo, only the stove ─────────
    for (const o of [pub.vierka?.root, pub.jano, pub.fero]) if (o) o.visible = false;
    pub.neon.mesh.visible = false;
    pub.jukebox.mesh.visible = false;
    pub.playerMug.visible = false;
    pub.ezoMug.visible = false;
    pub.ourMat.draw(9999);
    scene.traverse((o) => {
      const l = o as Light;
      if (!l.isLight) return;
      if ((l as PointLight).isPointLight) {
        if (l !== pub.stoveGlow) l.intensity = 0;
      } else if ((l as AmbientLight).isAmbientLight || (l as HemisphereLight).isHemisphereLight)
        l.intensity *= 0.12;
    });
    // every lamp is dark: their bulbs and shades too
    const unlit = (o: Object3D) =>
      o.traverse((c) => {
        const mesh = c as Mesh;
        if (!mesh.isMesh) return;
        for (const mat of (Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) as MeshStandardMaterial[]) {
          if (mat.emissive) mat.emissive.setHex(0);
          if (mat.emissiveMap) mat.emissiveMap = null;
          mat.needsUpdate = true;
        }
      });
    pub.lampMeshes.forEach(unlit);
    // the bare bulbs glow by themselves (unlit materials): out with them
    for (const m of [...pub.lampMeshes, pub.wcBulb]) m.visible = false;
    scene.traverse((o) => {
      if (o.userData.prop === 'hanging_industrial_lamp') unlit(o);
    });
    const stove = pub.stoveGlow;
    stove.color.setHex(0xffa060);
    stove.distance = 15;
    stove.decay = 1.15;
    scene.add(new HemisphereLight(0x4a3628, 0x000000, 0.22));
    scene.background = new Color(0x000000);
    scene.fog = new FogExp2(0x000000, 0.03);
    // the fire in the stove's mouth
    const fireMat = scope.add(
      new SpriteMaterial({
        map: scope.add(glowTexture()),
        color: 0xff7a30,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const fire = new Sprite(fireMat);
    fire.position.set(-4.95, 0.55, 3.35);
    scene.add(fire);
    // when everything is gone: two faint points circling each other in the dark
    const pairMat = scope.add(
      new SpriteMaterial({
        map: fireMat.map,
        color: 0xc8d8ff,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    const pair = [0, 1].map(() => {
      const sp = new Sprite(pairMat);
      sp.scale.setScalar(0.35);
      sp.visible = false;
      scene.add(sp);
      return sp;
    });
    // the two last shots and grandma's slivovica on the table
    const shots = [2.86, 3.14].map((x) => {
      const s = pub.tw.shot(0.8, 0xf2efe6);
      s.position.set(x, 0.832, 3.32);
      s.visible = false;
      scene.add(s);
      return s;
    });
    const bottle = pub.tw.bottle(0xe0e6d8, scope.add(labelTexture()));
    bottle.position.set(3.25, 0.832, 3.62);
    scene.add(bottle);
    // three chairs knocked over, for the fire
    const loose = [
      [-3.4, 0.5, 1.4],
      [0.6, 1.7, -0.6],
      [-1.9, -1.5, 2.2],
    ].map(([x, z, r]) =>
      pub.props.place(CHAIR, { pos: [x!, 0.22, z!], rotY: r, rotZ: Math.PI / 2, collide: 'none' }),
    );

    // ───────── where the pub ends: a ragged, glowing edge, then nothing ─────────
    const dissolve = makeDissolve([0, 0, -1], EDGE);
    dissolve.apply(scene);
    // (no wall here: a collider would hide the shades beyond it from your eyes; tick holds you back)
    // what drifts in the dark beyond
    const debris = (
      [
        [CHAIR, -3, 1.2, -5.5],
        ['bar_chair_round_01', 1.5, 0.6, -4.8],
        ['round_wooden_table_01', 4.5, 2.2, -8],
        [CHAIR, -6, 3.2, -10],
        ['bar_chair_round_01', 0.5, 2.8, -12],
        [CHAIR, 6.5, 0.8, -6.5],
        ['WoodenTable_03', -2.5, 3.6, -15],
        [CHAIR, 2.5, 4.4, -18],
      ] as const
    ).map(([id, x, y, z], i) => {
      const o = pub.props.place(id, { pos: [x, y, z], collide: 'none' });
      if (o) faintCopy(o);
      return { o, base: new Vector3(x, y, z), ph: i * 1.7 };
    });

    // ───────── state ─────────
    const put = (k: string) => game.flags.put(`round.${k}`);
    const st = {
      phase: 'arrive' as Phase,
      seated: false,
      busy: false,
      heat: 1,
      flare: 0,
      siegeT: 0,
      released: 0,
      carry: null as string | null,
      burned: new Set<string>(),
      lowWarned: false,
      stayT: 0,
      hints: new Set<string>(),
    };
    const onErr = (e: unknown) => {
      if (!(e instanceof Cancelled)) console.error(e);
    };
    const line = (id: string) => void say(id).catch(onErr);
    const hint = (id: string) => {
      if (st.hints.has(id)) return;
      st.hints.add(id);
      line(id);
    };
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => stoppers.forEach((f) => f()));

    // ───────── the shades: everyone from the memories, black, smeared ─────────
    // black figures (a silhouette when the light catches them); their smeared faces glow faintly
    const black = scope.add(new MeshStandardMaterial({ color: 0x16120f, roughness: 0.95 }));
    const smear = scope.add(
      new MeshBasicMaterial({ map: scope.add(smearTexture()), color: 0xa89888, transparent: true }),
    );
    const faceGeo = scope.add(
      new SphereGeometry(0.105, 16, 12, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.95, 1.75).scale(
        0.88,
        1.12,
        1,
      ),
    );
    const shades = (['vierka', 'jano', 'fero', 'vierka', 'jano', 'fero'] as const).map((model, i) => {
      const e = new Shade(`tien-${i}`);
      if (game.settings.difficulty === 'story') e.speed = 0.55;
      game.entities.push(e);
      const g = pub.props.gltf(model);
      let ch: Character | null = null;
      if (g) {
        ch = new Character(g);
        ch.pose = 'stand';
        ch.armOnTable = false;
        ch.model.traverse((o) => {
          if ((o as Mesh).isMesh) (o as Mesh).material = black;
        });
        const mask = new Mesh(faceGeo, smear);
        if (!attachFace(ch, mask)) maskStatic(ch, mask);
        ch.root.visible = false;
        scene.add(ch.root);
      }
      return { e, ch, phase: 0 };
    });

    // ───────── seating ─────────
    const sitDown = () => {
      if (st.seated) return;
      st.seated = true;
      game.seated = true;
      game.seatedWithDrink = true;
      game.player.teleport(pub.playerSeat.pos, game.player.yaw);
      game.player.forcedHeight = 1.28;
      game.rig.setOrientation(pub.playerSeat.yaw, -0.12);
    };
    const standUp = () => {
      if (!st.seated) return;
      st.seated = false;
      game.seated = false;
      game.seatedWithDrink = false;
      game.player.forcedHeight = null;
      game.player.teleport(pub.playerSeat.pos.clone().add(new Vector3(0, 0, -0.55)), game.player.yaw);
    };
    game.onMoveWhileSeated = () => {
      if (!st.busy) standUp();
    };

    // ───────── the talk ─────────
    /** Ežo's greeting when you arrive: the talk waits for it (they used to cut each other). */
    let intro: Promise<void> = Promise.resolve();
    const talk = async () => {
      st.busy = true;
      st.phase = 'talk';
      await intro;
      await game.clock.wait(0.8);
      for (const id of ['e11_1', 'e11_2', 'e11_3', 'e11_4']) {
        await say(id);
        await game.clock.wait(0.5);
      }
      const left: string[] = [ASK.who, ASK.why, ASK.how];
      while (left.length) {
        const opts = [...left, ASK.on];
        const o = opts[await game.choose(opts)]!;
        if (o === ASK.on) break;
        left.splice(left.indexOf(o), 1);
        await say(o === ASK.who ? 'e11_who' : o === ASK.why ? 'e11_why' : 'e11_how');
      }
      await say('e11_5');
      await game.clock.wait(1);
      await say('e11_6');
      await game.clock.wait(1.5);
      game.synth.stinger(0.5);
      await say('e11_come');
      st.busy = false;
      standUp();
      startSiege();
      game.saveCheckpoint('siege');
    };

    // ───────── the siege: keep the stove burning ─────────
    function startSiege(): void {
      st.phase = 'siege';
      st.siegeT = 0;
      st.released = 0;
      st.heat = 0.85;
      put('talked');
      line('e11_stoke');
      siegeDrone = game.synth.drone({ freqs: [43.6, 65.4, 87.3], cutoff: 240, volume: 0.05 });
      stoppers.push(() => siegeDrone?.());
    }
    let siegeDrone: (() => void) | null = null;
    const endSiege = () => {
      st.phase = 'calm';
      siegeDrone?.();
      siegeDrone = null;
      for (const s of shades) s.e.banish();
      game.synth.thud(undefined, 1);
      line('e11_enough');
      put('survived');
      game.saveCheckpoint('last');
    };
    const fuel: Array<{ key: string; objs: Object3D[]; pos: Vector3 }> = [];
    const prop = (id: string): Object3D | null => {
      let found: Object3D | null = null;
      scene.traverse((o) => {
        if (!found && o.userData.prop === id) found = o;
      });
      return found;
    };
    let photo: Object3D | null = null;
    scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && (m.material as MeshStandardMaterial).map === pub.photoTex) photo = m;
    });
    const addFuel = (key: string, objs: Array<Object3D | null>, pos: Vector3) => {
      const list = objs.filter((o): o is Object3D => !!o);
      if (list.length) fuel.push({ key, objs: list, pos });
    };
    addFuel('photo', [photo, prop('hanging_picture_frame_01')], new Vector3(5.75, 1.62, 3.2));
    addFuel('dart', [prop('dartboard')], new Vector3(5.75, 1.73, -1.6));
    addFuel('bull', [prop('bull_head')], new Vector3(-5.7, 2.0, 0.6));
    addFuel('frame', [prop('hanging_picture_frame_02')], new Vector3(-5.75, 1.6, -2.2));
    addFuel('cigs', [prop('cigarette_pack')], new Vector3(2.82, 0.86, 3.4));
    loose.forEach((c, i) => addFuel(`chair${i}`, [c], c ? c.position.clone().setY(0.4) : new Vector3()));
    const I = game.interactions;
    for (const f of fuel)
      I.add({
        id: `fuel:${f.key}`,
        pos: f.pos,
        radius: f.key.startsWith('chair') ? 0.5 : 0.3,
        range: 2.6,
        prompt: 'Vziať do pece',
        enabled: () => st.phase === 'siege' && !st.burned.has(f.key) && st.carry !== f.key,
        onUse: () => {
          if (st.carry) {
            line('t_full');
            return;
          }
          st.carry = f.key;
          for (const o of f.objs) o.visible = false;
          game.synth.creak(f.pos, 0.4, 0.1);
        },
      });
    I.add({
      id: 'stove',
      pos: new Vector3(-4.95, 0.6, 3.35),
      radius: 0.6,
      range: 2.4,
      prompt: () => (st.carry ? 'Prihodiť do ohňa' : 'Pec'),
      onUse: () => {
        if (!st.carry) {
          hint('t_stove');
          return;
        }
        const key = st.carry;
        st.carry = null;
        st.burned.add(key);
        st.heat = Math.min(1, st.heat + FEED);
        st.flare = 1;
        game.synth.thud(fire.position, 0.6);
        game.synth.hiss(fire.position, 0.9, 0.15);
        line(`t_burn_${key}`);
      },
    });
    I.add({
      id: 'seat',
      pos: new Vector3(3.0, 0.6, 2.5),
      radius: 0.35,
      prompt: 'Sadnúť si',
      enabled: () => !st.seated && (st.phase === 'arrive' || st.phase === 'calm'),
      onUse: () => {
        const was = st.phase;
        sitDown();
        if (was === 'arrive') void talk().catch(onErr);
        else void last().catch(onErr);
      },
    });
    I.add({
      id: 'mat',
      pos: new Vector3(3.05, 0.84, 2.98),
      radius: 0.15,
      prompt: 'Podtácka',
      // not while Ežo talks: your key would cut him off with a remark about the mat
      enabled: () => !st.busy,
      onUse: () => line('t_mat'),
    });

    // ───────── the last two ─────────
    const last = async () => {
      st.busy = true;
      st.phase = 'pour';
      await game.clock.wait(0.8);
      ezo?.startDrink();
      await game.clock.wait(1.2);
      for (const s of shots) s.visible = true;
      game.synth.pour(1.6, bottle.position);
      ezo?.stopDrink();
      await say('e11_pour');
      const pick = await game.choose([...LAST]);
      if (pick === 0) await cheers();
      else await stay();
    };
    const cheers = async () => {
      st.phase = 'end';
      ezo?.startDrink();
      await say('e11_cheers');
      game.synth.clink(shots[0]!.position, 1);
      game.input.setEnabled(false);
      // one pure tone, and everything goes to light
      game.synth.chime(undefined, [1760], 0.22);
      await game.tweenFx('white', 1, 2.4);
      stoppers.forEach((f) => f());
      stoppers.length = 0;
      put('cheers');
      await game.clock.wait(1.6);
      await game.gotoReality('r12');
    };
    const stay = async () => {
      await say('e11_stay');
      st.phase = 'stay';
      st.stayT = 0;
      game.input.setEnabled(false);
    };
    const stayFinish = async () => {
      st.phase = 'end';
      await game.tweenFx('fade', 1, 3);
      stoppers.forEach((f) => f());
      stoppers.length = 0;
      const hum = game.synth.hum(0.03);
      await game.ui.showEndingText(['A tak sedeli. Ešte chvíľu. Navždy.'], 5000);
      await game.ui.showCredits(CREDITS);
      hum();
      await game.titleScreen();
    };

    const startAt = new Vector3(3.0, 0, 1.2);
    return {
      defaultCheckpoint: 'arrive',
      checkpoints: {
        arrive: { pos: startAt.clone(), yaw: Math.PI },
        siege: { pos: new Vector3(3.0, 0, 1.6), yaw: Math.PI },
        last: { pos: new Vector3(3.0, 0, 1.6), yaw: Math.PI },
      },
      start(cp) {
        const mat = placeBeerMat(game, scope, 'r11', new Vector3(-4.15, 1.6, 2.45));
        if (mat) dissolve.apply(mat);
        stoppers.push(game.synth.hum(0.02));
        game.audio.setReverb(1.2, 0.2);
        if (cp === 'siege') startSiege();
        else if (cp === 'last') {
          st.phase = 'calm';
          for (const s of shades) s.e.banish();
        } else {
          st.phase = 'arrive';
          intro = (async () => {
            await game.clock.wait(1.5);
            await say('t_arrive');
            await game.clock.wait(0.8);
            await say('e11_hello');
          })().catch(onErr);
        }
      },
      tick(dt) {
        const p = game.player.pos;
        if (st.phase === 'siege') {
          st.siegeT += dt;
          st.heat = Math.max(0, st.heat - DRAIN * dt);
          while (st.released < shades.length && st.siegeT >= RELEASE[st.released]!) {
            const s = shades[st.released]!;
            s.e.release(-5 + game.rng.range(0, 10), -EDGE - 2.5 - game.rng.range(0, 3));
            st.released++;
          }
          if (st.heat < 0.3 && !st.lowWarned) {
            st.lowWarned = true;
            line('e11_more');
          } else if (st.heat > 0.5) st.lowWarned = false;
          if (st.siegeT > 16 && !game.lightOn) hint('e11_light');
          if (st.siegeT >= SIEGE && st.heat > 0) endSiege();
        }
        if (st.phase === 'stay') {
          // a long minute: the stove dims, the edge of nothing comes closer
          st.stayT += dt;
          st.heat = Math.max(0, 1 - st.stayT / 55);
          dissolve.plane.w = EDGE - (EDGE + 6) * clamp(st.stayT / 55, 0, 1);
          if (st.stayT >= 60) void stayFinish().catch(onErr);
        }
        for (const s of shades) s.e.warmth = st.phase === 'stay' ? 1 : st.heat;
        st.flare = Math.max(0, st.flare - dt * 1.5);
        if (!st.busy && st.phase !== 'arrive' && Math.hypot(p.x - 3.05, p.z - 2.98) < 1.4) hint('t_mat');
        // where the pub ends: you can't go on into nothing
        if (p.z < -EDGE + 0.62) p.z = -EDGE + 0.62;
      },
      frame(frameDt, alpha, t) {
        dissolve.time = t;
        const cam = game.renderer.camera.position;
        // the fire breathes; it roars up when fed and dies with the heat
        const h = st.heat;
        const flick = 0.85 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7);
        stove.intensity = h > 0 ? (1 + 7 * h + 6 * st.flare) * flick : 0;
        fire.scale.setScalar(h > 0 ? (0.35 + 0.55 * h + 0.6 * st.flare) * flick : 0.001);
        // drifting things in the dark (they stop when time does)
        const drift = st.phase === 'stay' ? Math.max(0, 1 - st.stayT / 40) : 1;
        for (const d of debris) {
          if (!d.o) continue;
          d.ph += frameDt * 0.25 * drift;
          d.o.position.set(d.base.x + Math.sin(d.ph * 0.7) * 0.6, d.base.y + Math.sin(d.ph) * 0.4, d.base.z);
          d.o.rotation.set(d.ph * 0.31, d.ph * 0.17, d.ph * 0.23);
        }
        // the shades
        for (const s of shades) {
          const ch = s.ch;
          if (!ch) continue;
          ch.root.visible = s.e.visible;
          if (!s.e.visible) continue;
          const x = s.e.prevPos.x + (s.e.pos.x - s.e.prevPos.x) * alpha;
          const z = s.e.prevPos.z + (s.e.pos.z - s.e.prevPos.z) * alpha;
          s.phase += Math.hypot(x - ch.root.position.x, z - ch.root.position.z) * 4.2;
          ch.root.position.set(x, s.e.pos.y, z);
          ch.root.rotation.y = s.e.yaw + Math.PI;
          ch.walk = damp(ch.walk, s.e.anim.move, 6, frameDt);
          ch.walkPhase = s.phase;
          ch.lookTarget = cam;
          ch.update(frameDt, t);
        }
        if (ezo) {
          ezo.lookTarget = st.phase === 'siege' ? null : cam;
          ezo.update(frameDt, t);
        }
        // staying: the two of them, two points, slowly round each other
        if (st.phase === 'stay' || st.phase === 'end') {
          pairMat.opacity = clamp((st.stayT - 38) / 10, 0, 1);
          const a = t * 0.4;
          pair.forEach((sp, i) => {
            sp.visible = pairMat.opacity > 0;
            const k = i ? -1 : 1;
            sp.position.set(3 + Math.cos(a) * 0.6 * k, 1.4, 7.5 + Math.sin(a) * 0.6 * k);
          });
        }
      },
      darkness: () => clamp(1 - st.heat, 0, 1),
      visibility: () => 0.5,
      threat: () => {
        const p = game.player.pos;
        let best = 0;
        for (const s of shades)
          if (s.e.visible && s.e.state !== 'gone')
            best = Math.max(best, clamp(1 - s.e.pos.distanceTo(p) / 7, 0, 1) * 0.9);
        return best;
      },
      warmth: () => {
        const p = game.player.pos;
        return Math.hypot(p.x + 4.95, p.z - 3.35) < 2.2 ? st.heat * 0.5 : 0;
      },
    };

    /** Its own copies of the materials, faintly lit from within (beyond the dissolving edge). */
    function faintCopy(o: Object3D): void {
      const copies = new Map<Material, Material>();
      o.traverse((c) => {
        const m = c as Mesh;
        if (!m.isMesh) return;
        const src = m.material as Material;
        let cp = copies.get(src);
        if (!cp) {
          cp = src.clone();
          const sm = cp as MeshStandardMaterial;
          if (sm.emissive) sm.emissive.setHex(0x0e0a07);
          scope.add(cp);
          copies.set(src, cp);
        }
        m.material = cp;
      });
    }
  },
};

export default reality;

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 40, 0, 32, 36, 32);
  grd.addColorStop(0, 'rgba(255,240,200,1)');
  grd.addColorStop(0.3, 'rgba(255,150,60,0.7)');
  grd.addColorStop(1, 'rgba(160,40,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Grandma's label, in her hand: „Slivovica, 1906". */
function labelTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe6cc';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#2a2a6a';
  g.font = "italic 22px 'Spectral', Georgia, serif";
  g.textAlign = 'center';
  g.fillText('Slivovica', 64, 42);
  g.font = "italic 18px 'Spectral', Georgia, serif";
  g.fillText('1906', 64, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

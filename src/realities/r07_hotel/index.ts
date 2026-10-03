import { Matrix4, Vector3 } from 'three';
import type { FogExp2, Material, Mesh, Object3D } from 'three';
import { MeshBasicMaterial } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import type { GradeParams } from '../../render/post/GradeEffect.ts';
import type { HidingSpot } from '../../sim/ai/types.ts';
import { LightPool } from '../../world/lightPool.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { Chambermaid } from '../../sim/ai/behaviors/Chambermaid.ts';
import { clamp } from '../../core/damp.ts';
import { MusicBox, TUNES } from '../../audio/procedural/musicbox.ts';
import type { Character } from '../../npc/Character.ts';
import { L7 } from './lines.ts';
import { CORRIDOR, KEY_ROOMS, SALON, buildHotel } from './build.ts';
import type { Era, Room } from './build.ts';

/** How each room's night looks (blended over the hotel's own warm grade). */
const HOTEL_GRADE: GradeParams = {
  lift: [0.012, 0.006, 0.0],
  gamma: [1, 1, 1],
  gain: [1.04, 0.98, 0.9],
  saturation: 0.85,
  contrast: 1.05,
  tint: [1.0, 0.97, 0.9],
  grain: 0.025,
};
const ERA_GRADE: Record<Era, Partial<GradeParams>> = {
  '1906': { saturation: 0.05, tint: [1.12, 0.98, 0.76], contrast: 1.12, grain: 0.07 },
  '1986': { saturation: 0.7, tint: [1.05, 1.0, 0.84], gain: [1.0, 0.96, 0.86], grain: 0.045 },
  '2026': { saturation: 1.0, tint: [1, 1, 1] },
  '1e14': { saturation: 0.65, tint: [1.2, 0.74, 0.62] },
  '1e40': { saturation: 0.45, tint: [0.8, 0.9, 1.18] },
  '1e100': { saturation: 0.15, gain: [0.7, 0.7, 0.76] },
  tallies: { saturation: 0.55, contrast: 1.16 },
  watching: { saturation: 0.95 },
};
const ERA_FOG: Partial<Record<Era, number>> = { '1986': 0.11, '1e100': 0.06, '1e40': 0.03 };
const BASE_FOG = 0.018;

const _v = new Vector3();
const _m = new Matrix4();

const reality: RealityModule = {
  id: 'r7',
  index: 7,
  title: 'Hotel Ďumbier',
  async create(ctx) {
    const { game, scene, scope } = ctx;
    await loadVoiceIndex();
    const h = await buildHotel(ctx);
    const S = h.spots as Record<string, Vector3>;
    const say = async (id: string, sp?: Character | null) => {
      const l = L7[id]!;
      sp?.setTalking(true);
      try {
        await game.say(l.who, l.text, voiceUrl(id), l.min);
        if (l.laugh) sp?.laugh();
      } finally {
        sp?.setTalking(false);
      }
    };
    game.nav = h.nav;
    const lights = new LightPool(scene, h.fixtures, game.renderer.profile.tier === 'low' ? 4 : 6);
    const grade: GradeParams = structuredClone(HOTEL_GRADE);
    game.grade = grade;

    // ───────── state ─────────
    const F = (k: string) => game.flags.has(`hotel.${k}`);
    const put = (k: string) => game.flags.put(`hotel.${k}`);
    const st = {
      busy: false,
      hints: new Set<string>(),
      keys: KEY_ROOMS.filter((e) => F(`key_${e}`)).length,
      hidden: null as { spot: HidingSpot; room: Room; yaw: number; height: number } | null,
      watchT: -1,
      jumpT: -1,
      cartRoll: 0,
      clockT: 0,
    };
    const onErr = (e: unknown) => {
      if (!(e instanceof Cancelled)) console.error(e);
    };
    const line = (id: string) => void say(id).catch(onErr);
    const act = (fn: () => Promise<void>) => void fn().catch(onErr);
    const hint = (id: string) => {
      if (st.hints.has(id) || st.busy) return;
      st.hints.add(id);
      line(id);
    };
    async function solo(fn: () => Promise<void>): Promise<void> {
      if (st.busy) return;
      st.busy = true;
      try {
        await fn();
      } catch (e) {
        onErr(e);
      } finally {
        st.busy = false;
      }
    }
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => stoppers.forEach((f) => f()));
    for (const r of h.rooms) if (r.key && F(`key_${r.era}`)) r.key.visible = false;
    if (F('salon')) {
      h.salonDoor.locked = false;
      h.salonDoor.open(95);
    }

    const roomAt = (p: Vector3) =>
      h.rooms.find((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) ?? null;
    const inSalon = (p: Vector3) => p.z < SALON.z1 - 0.1 && p.x > SALON.x0 && p.x < SALON.x1;

    // ───────── the chambermaid ─────────
    const maid = new Chambermaid('chyzna');
    maid.patrol = h.patrol;
    maid.rooms = h.rooms.map((r, index) => ({
      index,
      front: new Vector3(0, 0, r.door.z),
      inside: r.stand.clone(),
    }));
    if (game.settings.difficulty === 'story') {
      maid.chaseSpeed = 2.3;
      maid.sight.range = 8.5;
    }
    maid.place(0, 0, -30, 0);
    game.entities.push(maid);
    const fading: Array<{ obj: Object3D; t: number }> = [];
    const white = scope.add(new MeshBasicMaterial({ color: 0xf8f8f4 }));
    /** Wiped: the thing turns blank white, then is not there at all. */
    const erase = (obj: Object3D) => {
      obj.traverse((c) => {
        if ((c as Mesh).isMesh) (c as Mesh).material = white as Material;
      });
      fading.push({ obj, t: 0 });
    };
    game.onSignal = (_id, name, data) => {
      if (name === 'notice') {
        game.synth.stinger(0.45);
        game.status.fear.scare(0.35);
        hint('t_chyzna');
      } else if (name === 'knock') {
        const r = h.rooms[data as number]!;
        const at = r.door.clone().setY(1.2);
        act(async () => {
          for (let i = 0; i < 3; i++) {
            game.synth.thud(at, 0.5);
            await game.clock.wait(0.28);
          }
          void say('c_knock');
          await game.clock.wait(0.6);
          r.doorObj.open(95);
          game.synth.creak(at, 0.8, 0.12);
        });
      } else if (name === 'clean') {
        const r = h.rooms[data as number]!;
        const left = r.erasable.filter((o) => o.visible && !fading.some((f) => f.obj === o));
        if (left.length) {
          erase(left[game.rng.int(0, left.length)]!);
          if (roomAt(game.player.pos) === r || game.player.pos.distanceTo(r.door) < 5) hint('t_erased');
        }
      } else if (name === 'leave') {
        const r = h.rooms[data as number]!;
        r.doorObj.close();
        game.synth.thud(r.door.clone().setY(1.2), 0.4);
      } else if (name === 'open') {
        game.synth.creak(game.player.pos.clone(), 0.5, 0.25);
        game.synth.stinger(0.7);
        void say('c_found');
      }
    };

    // ───────── hiding ─────────
    const spotInfo = new Map<string, { spot: HidingSpot; room: Room; yaw: number; height: number }>();
    for (const r of h.rooms)
      for (const spot of r.spots)
        spotInfo.set(spot.id, {
          spot,
          room: r,
          yaw: r.side < 0 ? -Math.PI / 2 : Math.PI / 2,
          height: spot.kind === 'bed' ? 0.32 : 1.72,
        });
    const hide = (id: string) => {
      const info = spotInfo.get(id)!;
      st.hidden = info;
      game.hiddenIn = info.spot;
      // she saw you get in: she will look there
      game.hiddenWitnessed = maid.seesPlayer || maid.state === 'notice';
      game.seated = true;
      game.player.noclip = true;
      game.player.frozen = true;
      game.player.forcedHeight = info.height;
      game.player.teleport(info.spot.pos);
      game.rig.setOrientation(info.yaw, info.spot.kind === 'bed' ? 0.05 : -0.05);
      game.synth.creak(info.spot.pos.clone().setY(1), 0.5, 0.08);
      hint('t_hide');
    };
    const unhide = () => {
      const info = st.hidden;
      if (!info) return;
      st.hidden = null;
      game.hiddenIn = null;
      game.hiddenWitnessed = false;
      game.seated = false;
      game.player.noclip = !!game.debug.fly;
      game.player.frozen = false;
      game.player.forcedHeight = null;
      game.player.teleport(info.spot.approach);
    };
    game.onMoveWhileSeated = () => unhide();

    // ───────── interactions ─────────
    const I = game.interactions;
    I.add({
      id: 'bell',
      pos: S.bell!,
      radius: 0.12,
      prompt: 'Zvonček',
      onUse: () => {
        game.synth.clink(S.bell, 0.8);
        line('t_bell');
      },
    });
    I.add({
      id: 'guestbook',
      pos: S.guestbook!,
      radius: 0.3,
      prompt: () => (F('read') && !F('signed') ? 'Podpísať sa' : 'Kniha hostí'),
      onUse: () => {
        if (!F('read') || F('signed')) {
          put('read');
          line('t_guestbook');
          return;
        }
        put('signed');
        game.tallies++;
        line('t_sign');
        game.saveCheckpoint('book');
      },
    });
    I.add({
      id: 'keyboard',
      pos: S.keyboard!,
      radius: 0.6,
      range: 3,
      prompt: 'Tabuľa s kľúčmi',
      onUse: () => line('t_keyboard'),
    });
    I.add({ id: 'clock', pos: S.clock!, radius: 0.4, prompt: 'Hodiny', onUse: () => line('t_clock') });
    I.add({
      id: 'snowWindow',
      pos: S.snowWindow!,
      radius: 1.2,
      range: 3,
      prompt: 'Okno',
      onUse: () => line('t_snow'),
    });
    for (const r of h.rooms) {
      const doorPos = r.door
        .clone()
        .setY(1.1)
        .addScaledVector(new Vector3(-r.side, 0, 0), 0.12);
      I.add({
        id: `door:${r.era}`,
        pos: doorPos,
        radius: 0.45,
        prompt: () => (r.doorObj.target > 0 ? 'Zavrieť dvere' : 'Otvoriť dvere'),
        onUse: () => {
          if (r.doorObj.target > 0) {
            r.doorObj.close();
            game.synth.thud(doorPos, 0.35);
          } else {
            r.doorObj.open(95);
            game.synth.creak(doorPos, 0.7, 0.1);
          }
        },
      });
      I.add({
        id: `look:${r.era}`,
        pos: r.table.clone().setY(0.9),
        radius: 0.6,
        prompt: 'Stôl',
        onUse: () => line(eraLine(r.era)),
      });
      if (r.key) {
        const key = r.key;
        I.add({
          id: `key:${r.era}`,
          pos: key.position,
          radius: 0.15,
          prompt: 'Kľúč',
          enabled: () => key.visible,
          onUse: () => {
            key.visible = false;
            put(`key_${r.era}`);
            st.keys++;
            game.synth.clink(key.position, 0.5);
            game.ui.toast(`Kľúče od salóniku: ${st.keys}/3`, 3000);
            line(st.keys >= 3 ? 't_keys3' : 't_key');
          },
        });
      }
      for (const spot of r.spots) {
        const front = new Vector3(-r.side, 0, 0);
        const pos =
          spot.kind === 'bed'
            ? spot.pos.clone().addScaledVector(front, 0.55).setY(0.45)
            : spot.pos.clone().addScaledVector(front, 0.32).setY(1.2);
        I.add({
          id: `hide:${spot.id}`,
          pos,
          radius: 0.55,
          prompt: () =>
            st.hidden?.spot.id === spot.id
              ? 'Vyliezť'
              : spot.kind === 'bed'
                ? 'Vliezť pod posteľ'
                : 'Schovať sa do skrine',
          enabled: () => st.hidden === null || st.hidden.spot.id === spot.id,
          onUse: () => (st.hidden ? unhide() : hide(spot.id)),
        });
      }
    }
    I.add({
      id: 'salonDoor',
      pos: S.salonDoor!,
      radius: 0.5,
      prompt: () => (F('salon') ? 'Salónik' : st.keys >= 3 ? 'Odomknúť' : 'Salónik'),
      enabled: () => !F('salon'),
      onUse: () => {
        if (st.keys < 3) {
          game.synth.thud(S.salonDoor, 0.4);
          line('t_salonik_locked');
          return;
        }
        put('salon');
        h.salonDoor.locked = false;
        h.salonDoor.open(95);
        for (let i = 0; i < 3; i++) game.synth.click(S.salonDoor, 1300 + i * 200, 0.15);
        line('t_salonik_open');
      },
    });
    I.add({
      id: 'ezo',
      pos: S.ezoSeat!.clone().setY(1.0),
      radius: 0.5,
      range: 3,
      prompt: 'Hovoriť s Ežom',
      enabled: () => !st.busy && F('ezo'),
      onUse: () => void solo(() => say('e7_7', h.ezo)),
    });
    I.add({
      id: 'salonWindow',
      pos: S.salonWindow!,
      radius: 0.9,
      range: 3,
      prompt: () => (F('ezo') ? 'Vyskočiť z okna' : 'Okno'),
      enabled: () => st.jumpT < 0 && !st.busy,
      onUse: () => {
        if (!F('ezo')) {
          line('t_window');
          return;
        }
        jump();
      },
    });

    async function meetEzo(): Promise<void> {
      await solo(async () => {
        const e = h.ezo;
        await say('e7_1', e);
        await say('e7_2', e);
        await say('e7_3', e);
        await game.clock.wait(1.2);
        await say('e7_4', e);
        await game.clock.wait(0.8);
        await say('e7_5', e);
        await say('e7_6', e);
        put('ezo');
        game.saveCheckpoint('salon');
      });
    }

    // out of the window: a step up, then down into the dark (sim time)
    const jumpFrom = new Vector3();
    function jump(): void {
      st.jumpT = 0;
      jumpFrom.copy(game.player.pos);
      game.input.setEnabled(false);
      game.player.frozen = true;
      game.player.noclip = true;
      line('t_jump');
    }
    function stepJump(dt: number): void {
      const before = st.jumpT;
      st.jumpT += dt;
      const t = st.jumpT;
      if (t <= 1) {
        _v.copy(jumpFrom).lerp(new Vector3(0, 0.9, SALON.z0 + 0.3), t);
        _v.y += Math.sin(t * Math.PI) * 0.4;
        game.player.teleport(_v);
        game.rig.setOrientation(0, -0.2 * t);
        return;
      }
      if (before <= 1) void game.tweenFx('fade', 1, 1.6);
      const f = t - 1;
      game.player.teleport(_v.set(0, 0.9 - 4.9 * f * f, SALON.z0 - 0.8 - f * 1.2));
      game.rig.setOrientation(0, -0.2 - f * 0.6);
      if (f >= 1.8 && before - 1 < 1.8) void game.gotoReality('r8');
    }

    // ───────── per-frame helpers ─────────
    const music = new MusicBox(game.audio);
    stoppers.push(() => music.stop());
    const lastMaid = maid.pos.clone();
    const lastCart = maid.cartPos.clone();
    const speckDirs = Array.from({ length: h.specks.count }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / h.specks.count;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.399963;
      return new Vector3(Math.cos(a) * r, y * 0.8 - 0.2, Math.sin(a) * r).normalize();
    });
    const roomGrade = (r: Room | null): GradeParams => {
      const extra = r ? ERA_GRADE[r.era] : {};
      return { ...HOTEL_GRADE, ...extra };
    };

    return {
      defaultCheckpoint: 'arrive',
      checkpoints: {
        arrive: { pos: S.arrive!.clone(), yaw: 0 },
        book: { pos: S.reception!.clone(), yaw: 0 },
        salon: { pos: S.salonInside!.clone(), yaw: -0.99 },
      },
      start(cp) {
        stoppers.push(
          game.synth.loopNoise({
            kind: 'white',
            type: 'bandpass',
            freq: 360,
            q: 0.7,
            volume: 0.03,
            ampLfoRate: 0.09,
            ampLfoDepth: 0.8,
          }),
        );
        stoppers.push(game.synth.drone({ freqs: [49, 73.4], cutoff: 240, volume: 0.03 }));
        music.play(
          { ...TUNES.dychovka!, rate: 0.62, detune: -0.45, bass: TUNES.dychovka!.bass },
          new Vector3(22, 1.2, 7),
          0.28,
        );
        game.audio.setReverb(1.8, 0.35);
        if (cp === 'arrive') {
          game.synth.clink(S.arrive, 0.6);
          line('t_arrive');
        }
      },
      tick(dt) {
        if (st.jumpT >= 0) {
          stepJump(dt);
          return;
        }
        const p = game.player.pos;
        for (const r of h.rooms) {
          r.doorObj.step(dt);
          // she does not stop for doors: they open in front of her
          if (r.doorObj.target === 0 && maid.pos.distanceTo(r.door) < 1.1) r.doorObj.open(95);
        }
        h.salonDoor.step(dt);
        // places and thoughts
        const room = roomAt(p);
        if (room) {
          hint(eraLine(room.era));
          if (room.era === 'watching' && st.watchT < 0) st.watchT = 0;
        }
        if (st.watchT >= 0 && st.watchT < 3) {
          st.watchT += dt;
          if (st.watchT >= 2.5) {
            st.watchT = 9;
            if (h.watcher) h.watcher.lookTarget = game.renderer.camera.position;
            game.synth.stinger(0.5);
            game.status.fear.scare(0.4);
            line('t_watching2');
          }
        }
        if (p.x < -10.4) hint('t_restaurant');
        if (p.x > 10.4) hint('t_dancehall');
        if (p.z < -1 && Math.abs(p.x) < CORRIDOR.x1) hint('t_corridor');
        if (p.x > 2.5 && p.x < 9 && p.z > 2.7 && p.z < 5) hint('t_reception');
        if (inSalon(p) && !F('ezo')) void meetEzo();
        // the grandfather clock: a pendulum without hands
        st.clockT -= dt;
        if (st.clockT <= 0) {
          st.clockT += 1;
          if (p.distanceTo(S.clock!) < 12) game.synth.click(S.clock, 820, 0.03);
        }
        // the cart squeaks as it rolls
        st.cartRoll += maid.cartPos.distanceTo(lastCart);
        lastCart.copy(maid.cartPos);
        if (st.cartRoll > 0.9) {
          st.cartRoll = 0;
          game.synth.wheel(maid.cartPos.clone().setY(0.3), 1);
          if (p.distanceTo(maid.cartPos) < 14) hint('t_cart');
        }
      },
      frame(dt, alpha, t) {
        const cam = game.renderer.camera.position;
        lights.update(cam, t);
        h.tv.update(t);
        // the room you are in sets the colour of the night
        const room = roomAt(game.player.pos);
        const target = roomGrade(room);
        const k = 1 - Math.exp(-dt * 3);
        blend(grade, target, k);
        const fog = scene.fog as FogExp2;
        fog.density += ((room ? (ERA_FOG[room.era] ?? BASE_FOG) : BASE_FOG) - fog.density) * k;
        // the chambermaid and her cart
        if (h.maid) {
          const m = h.maid;
          m.root.position.set(
            maid.prevPos.x + (maid.pos.x - maid.prevPos.x) * alpha,
            0,
            maid.prevPos.z + (maid.pos.z - maid.prevPos.z) * alpha,
          );
          m.root.rotation.y = maid.yaw + Math.PI;
          m.walkPhase += maid.pos.distanceTo(lastMaid) * 4.4;
          lastMaid.copy(maid.pos);
          m.walk = clamp(maid.anim.move * 3, 0, 1);
          m.lookTarget = maid.anim.alert > 0.5 ? cam : null;
          m.update(dt, t);
        }
        h.cart.position.copy(maid.cartPos);
        h.cart.rotation.y = maid.cartYaw;
        // the heavy figures are only drawn when you could see them (walls do not cull them)
        const pz = game.player.pos.z;
        const nearWatch = pz < -20;
        if (h.watcher) h.watcher.root.visible = nearWatch;
        if (h.me) h.me.root.visible = nearWatch;
        if (h.ezo) h.ezo.root.visible = pz < -26;
        // Ežo, and the other Ežo in the room where you watch yourself
        if (h.ezo) {
          h.ezo.lookTarget = st.busy || F('ezo') ? cam : null;
          h.ezo.update(dt, t);
        }
        h.watcher?.update(dt, t);
        // the fire is dying
        (h.fire.embers.material as MeshBasicMaterial).opacity =
          0.55 + 0.35 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
        const flame = h.fire.embers.userData.flame as Mesh | undefined;
        if (flame) flame.scale.set(1, 0.7 + 0.3 * Math.abs(Math.sin(t * 7.1) * Math.sin(t * 3.3)), 1);
        // the mirror ball turns; its reflections sweep the dance hall
        h.mirrorBall.rotation.y = t * 0.35;
        const c = h.mirrorBall.position;
        speckDirs.forEach((d0, i) => {
          const a = t * 0.35;
          const dx = d0.x * Math.cos(a) + d0.z * Math.sin(a);
          const dz = -d0.x * Math.sin(a) + d0.z * Math.cos(a);
          const hit = rayBox(c, dx, d0.y, dz, 10.05, 0.02, 0.05, 23.95, 3.58, 13.95);
          // a speck of light on the wall, facing the ball
          _m.lookAt(hit, c, _v.set(0, 1, 0)).setPosition(hit);
          h.specks.setMatrixAt(i, _m);
        });
        h.specks.instanceMatrix.needsUpdate = true;
        h.blackHole.children[0]!.rotation.z = t * 0.05;
        // what she wiped: white, then gone
        for (let i = fading.length - 1; i >= 0; i--) {
          const f = fading[i]!;
          f.t += dt;
          if (f.t > 1.6) {
            f.obj.visible = false;
            fading.splice(i, 1);
          }
        }
      },
      visibility: () => {
        const r = roomAt(game.player.pos);
        if (st.hidden) return 0.1;
        if (r?.era === '1e100') return 0.2;
        if (r?.era === '1e14') return 0.45;
        return 0.8;
      },
      darkness: () => {
        const r = roomAt(game.player.pos);
        return r?.era === '1e100' ? 0.6 : r?.era === '1e40' ? 0.3 : 0.05;
      },
      threat: () => {
        if (maid.state !== 'chase' && maid.state !== 'notice' && maid.state !== 'open') return 0;
        const d = maid.pos.distanceTo(game.player.pos);
        return clamp(1 - d / 12, 0, 1) * 0.85;
      },
    };
  },
};

function eraLine(era: Era): string {
  const id: Record<Era, string> = {
    '1906': 't_1906',
    '1986': 't_1986',
    '2026': 't_2026',
    '1e14': 't_1e14',
    '1e40': 't_1e40',
    '1e100': 't_1e100',
    tallies: 't_tallies',
    watching: 't_watching',
  };
  return id[era];
}

/** Moves `cur` a fraction k toward `to` (all the grade's numbers). */
function blend(cur: GradeParams, to: GradeParams, k: number): void {
  for (const key of ['lift', 'gamma', 'gain', 'tint'] as const)
    for (let i = 0; i < 3; i++) cur[key][i]! += (to[key][i]! - cur[key][i]!) * k;
  cur.saturation += (to.saturation - cur.saturation) * k;
  cur.contrast += (to.contrast - cur.contrast) * k;
  cur.grain += (to.grain - cur.grain) * k;
}

/** Where a ray from o along d leaves the box (from inside). */
function rayBox(
  o: Vector3,
  dx: number,
  dy: number,
  dz: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): Vector3 {
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (x1 - o.x) / dx);
  if (dx < -1e-6) t = Math.min(t, (x0 - o.x) / dx);
  if (dy > 1e-6) t = Math.min(t, (y1 - o.y) / dy);
  if (dy < -1e-6) t = Math.min(t, (y0 - o.y) / dy);
  if (dz > 1e-6) t = Math.min(t, (z1 - o.z) / dz);
  if (dz < -1e-6) t = Math.min(t, (z0 - o.z) / dz);
  return new Vector3(o.x + dx * t, o.y + dy * t, o.z + dz * t);
}

export default reality;

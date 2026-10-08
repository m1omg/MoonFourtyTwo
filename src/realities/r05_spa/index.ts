import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  RingGeometry,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import type { Character } from '../../npc/Character.ts';
import { LightPool } from '../../world/lightPool.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { Lifeguard } from '../../sim/ai/behaviors/Lifeguard.ts';
import { Area } from '../../sim/ai/nav/NavGrid.ts';
import { clamp } from '../../core/damp.ts';
import { L5 } from './lines.ts';
import {
  DIVE_POOL,
  DOME,
  FLOOD,
  FLOOD_FLOOR,
  HALL,
  LEVEL_DRAINED,
  LEVEL_FULL,
  POOL,
  VORTEX,
  buildSpa,
} from './build.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';

const reality: RealityModule = {
  id: 'r5',
  index: 5,
  title: 'Kúpele',
  async create(ctx) {
    const { game, scene, scope } = ctx;
    await loadVoiceIndex();
    const spa = await buildSpa(ctx);
    const { waters } = spa;
    const say = async (id: string, sp?: Character | null) => {
      const l = L5[id]!;
      sp?.setTalking(true);
      try {
        await game.say(l.who, l.text, voiceUrl(id));
      } finally {
        sp?.setTalking(false);
      }
    };
    game.nav = spa.nav;
    const lights = new LightPool(scene, spa.fixtures, game.renderer.profile.tier === 'low' ? 4 : 6);
    game.grade = {
      ...game.grade,
      lift: [0.0, 0.01, 0.012],
      gain: [0.98, 1.02, 1.03],
      saturation: 0.9,
      grain: 0.02,
    };

    // ───────── the lifeguard ─────────
    const guard = new Lifeguard('plavcik');
    guard.chair.copy(spa.chairSeat);
    guard.dive.copy(spa.chairDive);
    guard.wanderPoints = spa.wanderPoints;
    guard.watchArea = { x0: HALL.x0, z0: HALL.z0, x1: HALL.x1, z1: HALL.z1 };
    if (game.settings.difficulty === 'story') {
      guard.patience = 8;
      guard.huntSpeed = 2.4;
    }
    guard.place(spa.chairSeat.x, spa.chairSeat.y, spa.chairSeat.z, Math.PI / 2);
    game.entities.push(guard);
    // under-water shadow, ripples, the hand
    const shadow = new Mesh(
      scope.add(new PlaneGeometry(1.15, 2.5)),
      scope.add(
        new MeshBasicMaterial({
          map: scope.add(silhouetteTexture()),
          color: 0x000000,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        }),
      ),
    );
    shadow.rotation.order = 'YXZ';
    shadow.visible = false;
    // drawn after the (depth-write-free) water surface so it reads as a shape in the water
    shadow.renderOrder = 2;
    scene.add(shadow);
    const rippleMat = scope.add(
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    const ripples = Array.from({ length: 4 }, () => {
      const r = new Mesh(scope.add(new RingGeometry(0.78, 1.0, 40)), rippleMat.clone());
      scope.add(r.material as MeshBasicMaterial);
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      r.renderOrder = 3;
      scene.add(r);
      return { mesh: r, age: 9 };
    });
    let rippleNext = 0;
    const spawnRipple = (x: number, y: number, z: number) => {
      const r = ripples.reduce((a, c) => (c.age > a.age ? c : a));
      r.age = 0;
      r.mesh.position.set(x, y + 0.01, z);
      r.mesh.visible = true;
    };
    const hand = makeHand(scope);
    hand.visible = false;
    scene.add(hand);
    let handT = 9;

    // ───────── state ─────────
    const F = (k: string) => game.flags.has(`spa.${k}`);
    const st = {
      busy: false,
      metEzo: F('ezo'),
      greeted: F('ezo'),
      hasKey: F('key'),
      prepad: F('prepad'),
      vypust: F('vypust'),
      unlocked: F('door'),
      jumping: false,
      turning: false,
      hints: new Set<string>(),
      hallT: -1,
      dripT: 2,
      floatingDucks: [] as Array<{ obj: Object3D; x: number; z: number; phase: number }>,
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
    const onErr = (e: unknown) => {
      if (!(e instanceof Cancelled)) console.error(e);
    };
    /** A thought or remark: never blocks anything (a newer line simply takes over). */
    const line = (id: string) => void say(id).catch(onErr);
    /** Runs a short scripted action on sim time, independent of what is being said. */
    const act = (fn: () => Promise<void>) => void fn().catch(onErr);
    /** Says a thought once, unless Ežo is talking. */
    const hint = (id: string) => {
      if (st.hints.has(id) || st.busy) return;
      st.hints.add(id);
      line(id);
    };
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => stoppers.forEach((f) => f()));

    // persisted progress
    const drainFlood = () => {
      spa.nav.fillRect(FLOOD.x0 + 0.4, FLOOD.z0, FLOOD.x1, FLOOD.z1, Area.WALK, true);
      // out in the flooded strip when it ran dry, he would be stranded on the deck for good (he
      // moves only through water): he is back at the foot of his chair instead
      if (guard.inWater && guard.pos.x < FLOOD.x1 + 0.5) {
        guard.place(guard.dive.x, guard.dive.y, guard.dive.z, guard.yaw);
        guard.setState('return');
      }
    };
    if (st.prepad) {
      waters.setTarget('pool', LEVEL_DRAINED, 99);
      waters.setTarget('flood', LEVEL_DRAINED, 99);
      waters.step(1);
      drainFlood();
    }
    if (st.vypust) spa.vortex.visible = true;
    if (st.hasKey) spa.key.visible = false;
    if (st.unlocked) {
      spa.diveDoor.locked = false;
      spa.diveDoor.open(95);
    }
    if (F('ducks')) for (const d of spa.ducksInBasket) d.visible = false;

    // ───────── interactions ─────────
    const I = game.interactions;
    const S = spa.spots;
    I.add({
      id: 'desk',
      pos: S.desk!,
      radius: 0.5,
      prompt: 'Zazvoniť',
      onUse: () =>
        act(async () => {
          game.synth.click(S.desk, 3200, 0.2);
          await say('t_desk');
          if (!guard.inWater) {
            game.synth.whistle(guard.chairHead, false, 0.12);
            await say('t_bell_answer');
          }
        }),
    });
    I.add({
      id: 'clock',
      pos: S.clock!,
      radius: 0.3,
      prompt: 'Hodiny',
      onUse: () => line('t_clock'),
    });
    I.add({
      id: 'vending',
      pos: S.vending!,
      radius: 0.55,
      prompt: 'Automat',
      onUse: () => {
        if (F('vend')) {
          line('t_vending_empty');
          return;
        }
        game.flags.put('spa.vend');
        game.synth.clank(S.vending, 0.5);
        game.inventory.add('utopenec', 1);
        line('t_vending');
      },
    });
    I.add({
      id: 'ducks',
      pos: S.ducks!,
      radius: 0.45,
      prompt: 'Vziať kačičky',
      enabled: () => !F('ducks'),
      onUse: () => {
        game.flags.put('spa.ducks');
        for (const d of spa.ducksInBasket) d.visible = false;
        game.inventory.add('kacka', 3);
        game.synth.squeak(S.ducks, 0.6);
        line('t_ducks');
        game.ui.toast(
          game.touch ? 'Kačičku hodíš tlačidlom „Hodiť"' : `Kačičku hodíš klávesom ${game.keyLabel('throw')}`,
          4000,
        );
      },
    });
    I.add({
      id: 'lockers',
      pos: S.lockers!,
      radius: 0.8,
      prompt: 'Skrinky',
      onUse: () => line('t_lockers'),
    });
    I.add({
      id: 'cabin',
      pos: S.cabin!,
      radius: 0.5,
      prompt: 'Kabínka',
      onUse: () => line('t_cabin'),
    });
    I.add({
      id: 'lifeguard',
      pos: S.chair!,
      radius: 0.6,
      range: 9,
      prompt: 'Plavčík',
      onUse: () => line(guard.inWater ? 't_chair_empty' : 't_lifeguard'),
    });
    I.add({
      id: 'key',
      pos: S.key!,
      radius: 0.25,
      prompt: 'Kľúč',
      enabled: () => !st.hasKey,
      onUse: () => {
        if (!guard.inWater) {
          line('t_key_blocked');
          return;
        }
        st.hasKey = true;
        game.flags.put('spa.key');
        // kept at once: a blackout later no longer puts it back on the chair
        game.saveCheckpoint(game.checkpoint);
        spa.key.visible = false;
        game.synth.clink(S.key, 0.4);
        line('t_key_got');
      },
    });
    const valve = (id: 'prepad' | 'vypust', pos: Vector3, onTurn: () => void) =>
      I.add({
        id,
        pos,
        radius: 0.3,
        prompt: id === 'prepad' ? 'Ventil PREPAD' : 'Ventil VÝPUST',
        enabled: () => !st.turning,
        onUse: () =>
          act(async () => {
            if (st[id]) {
              line(`t_${id}_done`);
              return;
            }
            st.turning = true;
            game.synth.clank(pos, 0.9);
            game.addNoise({ x: pos.x, y: pos.y, z: pos.z, loudness: 1.4, kind: 'object' });
            await game.clock.wait(1.2);
            game.synth.clank(pos, 0.6);
            st[id] = true;
            st.turning = false;
            game.flags.put(`spa.${id}`);
            onTurn();
            game.saveCheckpoint('pump');
            line(`t_${id}`);
          }),
      });
    let drainNoise: (() => void) | null = null;
    valve('prepad', S.prepad!, () => {
      waters.setTarget('pool', LEVEL_DRAINED, 0.05);
      waters.setTarget('flood', LEVEL_DRAINED, 0.05);
      drainNoise = game.synth.loopNoise({
        kind: 'brown',
        type: 'lowpass',
        freq: 260,
        volume: 0.06,
        pos: new Vector3(-12, 0, -23),
      });
      stoppers.push(() => drainNoise?.());
    });
    valve('vypust', S.vypust!, () => {
      spa.vortex.visible = true;
      startVortexSound();
    });
    I.add({
      id: 'diveDoor',
      pos: S.diveDoor!,
      radius: 0.6,
      prompt: () => (st.unlocked ? 'Dvere' : st.hasKey ? 'Odomknúť' : 'Dvere'),
      onUse: () => {
        if (st.unlocked) {
          if (spa.diveDoor.isOpen) spa.diveDoor.close();
          else spa.diveDoor.open(95);
          return;
        }
        if (!st.hasKey) {
          line('t_dive_locked');
          return;
        }
        st.unlocked = true;
        game.flags.put('spa.door');
        // kept at once, and a blackout from here on wakes you just inside the diving hall
        game.saveCheckpoint('dive');
        spa.diveDoor.locked = false;
        spa.diveDoor.open(95);
        game.synth.click(S.diveDoor, 1400, 0.2);
        line('t_unlock');
      },
    });
    I.add({
      id: 'board',
      pos: S.board!,
      radius: 0.5,
      range: 2.2,
      prompt: () => (st.vypust ? 'Skočiť do víru' : 'Mostík'),
      onUse: () => {
        if (!st.vypust) {
          line('t_still');
          return;
        }
        jump();
      },
    });
    I.add({
      id: 'mosaic',
      pos: S.mosaic!,
      radius: 1.8,
      range: 8,
      prompt: 'Mozaika',
      // (not while Ežo talks: it is in view from his pool, and a click to skip his line said it)
      enabled: () => !st.busy,
      onUse: () => line('t_mosaic'),
    });
    I.add({
      id: 'ezo',
      pos: spa.ezoSeat.clone().setY(0.7),
      radius: 0.5,
      range: 3,
      prompt: 'Hovoriť s Ežom',
      enabled: () => !st.busy,
      onUse: () => void ezoTalk(),
    });

    async function meetEzo(): Promise<void> {
      await solo(async () => {
        const e = spa.ezo;
        await say('e5_2', e);
        await say('e5_3', e);
        await say('e5_4', e);
        await say('e5_5', e);
        await say('e5_6', e);
        await say('e5_7', e);
        await say('e5_8', e);
        game.inventory.add('absint', 1);
        game.ui.toast('Absint: na chvíľu uvidíš chodník, čo tu inak nie je.', 4500);
        await say('e5_9', e);
        st.metEzo = true;
        game.flags.put('spa.ezo');
        game.saveCheckpoint('ezo');
      });
    }
    async function ezoTalk(): Promise<void> {
      if (!st.metEzo) return meetEzo();
      await solo(async () => {
        const e = spa.ezo;
        if (!st.vypust) await say('e5_7', e);
        else if (!st.hasKey) await say('e5_6', e);
        else await say('e5_11', e);
        if (!game.inventory.has('absint') && !F('absint2')) {
          game.flags.put('spa.absint2');
          game.inventory.add('absint', 1);
          await say('e5_8', e);
        }
      });
    }

    // the whirlpool and the jump
    let vortexStop: (() => void) | null = null;
    function startVortexSound(): void {
      if (vortexStop) return;
      vortexStop = game.synth.loopNoise({
        kind: 'brown',
        type: 'lowpass',
        freq: 180,
        volume: 0.16,
        pos: VORTEX,
        ampLfoRate: 0.4,
        ampLfoDepth: 0.3,
      });
      stoppers.push(() => vortexStop?.());
    }
    // the jump runs on sim time in tick(): a hop off the board, then down the throat of the whirlpool
    const jumpStart = new Vector3();
    let jumpT = -1;
    function jump(): void {
      if (st.jumping) return;
      st.jumping = true;
      jumpT = 0;
      jumpStart.copy(game.player.pos);
      game.input.setEnabled(false);
      game.player.frozen = true;
      game.player.noclip = true;
    }
    const _p = new Vector3();
    const _target = new Vector3();
    function stepJump(dt: number): void {
      const before = jumpT;
      jumpT += dt;
      if (jumpT <= 1) {
        const t = jumpT;
        _p.copy(jumpStart).lerp(_target.set(VORTEX.x, VORTEX.y + 0.2, VORTEX.z + 0.9), t);
        _p.y += Math.sin(t * Math.PI) * 0.9;
        game.player.teleport(_p, 0);
        game.rig.setOrientation(0, -0.3 - t * 0.9);
        return;
      }
      if (before <= 1) {
        game.synth.splash(VORTEX, 1.6);
        void game.tweenFx('fade', 1, 2.2);
      }
      const t = Math.min(1, (jumpT - 1) / 1.6);
      const a = t * Math.PI * 5;
      const r = 0.9 * (1 - t);
      _p.set(VORTEX.x + Math.sin(a) * r, VORTEX.y - t * 2.6, VORTEX.z + Math.cos(a) * r);
      game.player.teleport(_p, a);
      game.rig.setOrientation(a, -1.2);
      if (t >= 1 && before - 1 < 1.6) void game.gotoReality('r6');
    }

    // ───────── signals and footsteps ─────────
    game.onSignal = (_id, name) => {
      if (name === 'dive') {
        game.synth.whistle(guard.dive, true, 0.35);
        game.synth.splash(guard.dive, 0.5);
        spawnRipple(guard.dive.x, waters.surfaceAt(guard.dive.x, guard.dive.z) ?? LEVEL_FULL, guard.dive.z);
        hint('t_whistle');
      } else if (name === 'hunt') {
        game.synth.stinger(0.35);
        game.status.fear.scare(0.25);
      } else if (name === 'reach') {
        handT = 0;
        hand.position.set(guard.pos.x, waters.surfaceAt(guard.pos.x, guard.pos.z) ?? LEVEL_FULL, guard.pos.z);
        hand.rotation.y = Math.atan2(game.player.pos.x - guard.pos.x, game.player.pos.z - guard.pos.z);
        game.synth.splash(guard.pos, 0.9);
        game.synth.stinger(0.6);
        game.status.fear.scare(0.4);
        hint('t_reach');
      }
    };
    game.onFootstep = (e) => {
      if (e.surface === 'water' && e.position.x < FLOOD.x1 && e.position.z < FLOOD.z1) hint('t_flooded');
    };

    // ───────── reality ─────────
    const inHall = (p: Vector3) => p.x > HALL.x0 && p.x < HALL.x1 && p.z > HALL.z0 && p.z < HALL.z1;
    const domeDist = (p: Vector3) => Math.hypot(p.x - DOME.x, p.z - DOME.z);
    const surf = (x: number, z: number) => waters.surfaceAt(x, z);

    return {
      defaultCheckpoint: 'arrival',
      checkpoints: {
        arrival: { pos: spa.spots.arrive!.clone(), yaw: 0 },
        ezo: { pos: new Vector3(1.7, 0, -52.6), yaw: 2.09, pitch: -0.25 },
        pump: { pos: new Vector3(-24.5, 0, -22), yaw: -Math.PI / 2 },
        // just inside the diving hall, looking in (saved when you unlock its door)
        dive: { pos: new Vector3(21.2, 0, -23), yaw: -Math.PI / 2 },
      },
      start(cp) {
        placeBeerMat(game, scope, 'r5', new Vector3(5.3, 1.8, 11.4));
        stoppers.push(game.synth.loopNoise({ kind: 'brown', type: 'lowpass', freq: 320, volume: 0.05 }));
        stoppers.push(
          game.synth.loopNoise({
            kind: 'white',
            type: 'bandpass',
            freq: 700,
            q: 0.6,
            volume: 0.025,
            ampLfoRate: 0.23,
            ampLfoDepth: 0.6,
          }),
        );
        // the pipe you came through keeps pouring into the foot bath
        stoppers.push(
          game.synth.loopNoise({
            kind: 'white',
            type: 'lowpass',
            freq: 900,
            volume: 0.06,
            pos: new Vector3(-5, 0.4, 15.6),
          }),
        );
        stoppers.push(game.synth.hum(0.04, new Vector3(0, 0.5, -48)));
        if (st.vypust) startVortexSound();
        game.audio.setReverb(3.4, 0.55);
        if (cp === 'arrival') {
          game.synth.splash(spa.spots.arrive, 1.2);
          line('t_arrive');
        }
      },
      tick(dt) {
        if (jumpT >= 0) stepJump(dt);
        waters.step(dt);
        spa.diveDoor.step(dt);
        const p = game.player.pos;
        if (st.prepad && spa.flood.level < FLOOD_FLOOR && !F('dry')) {
          game.flags.put('spa.dry');
          drainFlood();
        }
        // once the drain is open, stepping (or slipping) off the springboard is the jump too: the
        // whirlpool takes you, as it does from the board's end
        const overDive = p.x > DIVE_POOL.x0 && p.x < DIVE_POOL.x1 && p.z > DIVE_POOL.z0 && p.z < DIVE_POOL.z1;
        if (st.vypust && !st.jumping && overDive && p.y < 0.5) jump();
        // you cannot swim: deep water closes over your head
        if (!st.jumping && game.playerView.waterDepth > 1.45) void game.okno('voda');
        // places
        if (inHall(p)) {
          if (st.hallT < 0) st.hallT = 0;
          st.hallT += dt;
          if (guard.state === 'chair') hint('t_hall');
          if (st.hallT > 9) hint('t_snow');
        }
        if (!st.greeted && domeDist(p) < 6.4 && !st.busy) {
          st.greeted = true;
          void solo(() => say('e5_1', spa.ezo));
        }
        if (!st.metEzo && st.greeted && !st.busy && p.distanceTo(spa.ezoSeat.clone().setY(0)) < 3.4)
          void meetEzo();
        if (p.x < -20.3 && p.z < -17) hint('t_pump');
        if (p.x > 20.3) hint(st.vypust ? 't_vortex' : 't_still');
        if (st.vypust && p.x > 20.3 && p.z < -17.5 && Math.abs(p.x - 28) < 0.6 && p.y > 0.5) hint('t_board');
        // the key on the lifeguard's chair, and the rope over the deep end
        if (!st.hasKey && p.distanceTo(S.key!) < 4.5) hint('t_key');
        if (!st.prepad && Math.abs(p.x + 2) < 1.4 && p.z > POOL.z0 && p.z < POOL.z1 && p.y < -0.3)
          hint('t_rope');
        // the drain falls silent once the pool is empty
        if (drainNoise && spa.pool.level <= LEVEL_DRAINED + 0.01) {
          drainNoise();
          drainNoise = null;
        }
        // the absinthe path shows itself only to someone who has had absinthe
        spa.stones.visible = game.status.buffs.has('absinthe');
        // water drips in the big rooms
        st.dripT -= dt;
        if (st.dripT <= 0) {
          st.dripT = 1.5 + game.rng.range(0, 3.5);
          const d = game.rng.pick(spa.drips);
          if (d.distanceTo(p) < 18) game.synth.drip(d, 0.08);
        }
      },
      frame(dt, alpha, t) {
        lights.update(game.renderer.camera.position, t);
        waters.frame(t);
        // the rope's floats go down with the water (they hung in the air over the drained pool)
        spa.rope.position.y = spa.pool.level - LEVEL_FULL;
        for (const [i, sp] of spa.steam.entries()) {
          sp.position.y = 0.5 + ((t * 0.12 + i * 0.37) % 1.2);
          sp.material.opacity = 0.16 * (1 - ((t * 0.12 + i * 0.37) % 1.2) / 1.2);
        }
        if (spa.vortex.visible) {
          spa.vortex.rotation.y = -t * 1.8;
          spa.vortex.position.y = (surf(VORTEX.x, VORTEX.z) ?? VORTEX.y) + 0.005;
        }
        if (spa.ezo) {
          spa.ezo.lookTarget = st.busy ? game.renderer.camera.position : null;
          spa.ezo.update(dt, t);
        }
        // the lifeguard: a figure in the chair, or a shadow under the surface
        if (spa.lifeguardFigure) spa.lifeguardFigure.visible = guard.state === 'chair';
        const swimming = guard.inWater && guard.state !== 'dive';
        shadow.visible = swimming;
        if (swimming) {
          const x = guard.prevPos.x + (guard.pos.x - guard.prevPos.x) * alpha;
          const z = guard.prevPos.z + (guard.pos.z - guard.prevPos.z) * alpha;
          const level = surf(x, z) ?? LEVEL_FULL;
          shadow.position.set(x, level - 0.06, z);
          shadow.rotation.set(-Math.PI / 2, 0, 0);
          shadow.rotation.y = guard.yaw;
          (shadow.material as MeshBasicMaterial).opacity = 0.62 + 0.3 * guard.anim.alert;
          if (guard.anim.move > 0.05 && t > rippleNext) {
            rippleNext = t + 0.7 - guard.anim.alert * 0.35;
            spawnRipple(x - Math.sin(guard.yaw) * 0.8, level, z - Math.cos(guard.yaw) * 0.8);
          }
        }
        for (const r of ripples) {
          if (!r.mesh.visible) continue;
          r.age += dt;
          const s = 0.2 + r.age * 0.9;
          r.mesh.scale.setScalar(s);
          (r.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - r.age / 1.6));
          if (r.age > 1.6) r.mesh.visible = false;
        }
        // the hand rises, hangs a moment, sinks
        if (handT < 1.6) {
          handT += dt;
          hand.visible = true;
          const k = handT < 0.35 ? handT / 0.35 : handT > 1.1 ? Math.max(0, 1 - (handT - 1.1) / 0.5) : 1;
          hand.position.y = (surf(hand.position.x, hand.position.z) ?? LEVEL_FULL) - 0.35 + k * 0.75;
        } else hand.visible = false;
        // ducks bob where they landed
        for (const d of st.floatingDucks) {
          const level = surf(d.x, d.z);
          d.obj.visible = level !== null;
          if (level !== null) {
            d.obj.position.y = level - 0.03 + Math.sin(t * 2.2 + d.phase) * 0.012;
            d.obj.rotation.z = Math.sin(t * 1.7 + d.phase) * 0.08;
          }
        }
      },
      waterDepth: (pos) => waters.depthAt(pos),
      waterSurface: (x, z) => waters.surfaceAt(x, z),
      onImpact(pos, item, inWater) {
        if (item !== 'kacka') return false;
        game.synth.squeak(pos, 0.8);
        if (!inWater) return false;
        game.synth.splash(pos, 0.6);
        game.addNoise({ x: pos.x, y: pos.y, z: pos.z, loudness: 1.6, kind: 'splash' });
        spawnRipple(pos.x, pos.y, pos.z);
        if (spa.duckTemplate) {
          const obj = spa.duckTemplate.clone();
          obj.scale.setScalar(0.55);
          obj.position.copy(pos);
          obj.rotation.y = game.rng.range(0, Math.PI * 2);
          scene.add(obj);
          st.floatingDucks.push({ obj, x: pos.x, z: pos.z, phase: game.rng.range(0, 6) });
          if (st.floatingDucks.length > 8) st.floatingDucks.shift()!.obj.removeFromParent();
        }
        return true;
      },
      visibility: () => 0.85,
      darkness: () => (game.player.pos.x < -20 ? 0.15 : 0.03),
      threat: () => {
        if (!guard.inWater) return 0;
        const d = guard.pos.distanceTo(game.player.pos);
        const wet = game.playerView.inWater ? 1 : 0.4;
        return clamp(1 - d / 14, 0, 1) * (0.4 + 0.6 * guard.anim.alert) * wet * 0.7;
      },
      warmth: () => clamp(1 - domeDist(game.player.pos) / 8, 0, 1),
    };
  },
};

/** A swimmer seen from above, blurred: the shape under the surface. */
function silhouetteTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.filter = 'blur(6px)';
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(64, 40, 18, 22, 0, 0, Math.PI * 2); // head
  g.ellipse(64, 115, 30, 55, 0, 0, Math.PI * 2); // body
  g.ellipse(64, 200, 22, 45, 0, 0, Math.PI * 2); // legs
  g.fill();
  g.beginPath();
  g.ellipse(26, 70, 10, 40, 0.5, 0, Math.PI * 2); // arms, reaching forward
  g.ellipse(102, 70, 10, 40, -0.5, 0, Math.PI * 2);
  g.fill();
  // drawn on a transparent canvas: the material is black, the canvas alpha shapes it
  return new CanvasTexture(c);
}

/** A pale hand of soap-white fingers. */
function makeHand(scope: { add<T extends { dispose(): void }>(d: T): T }): Group {
  const mat = scope.add(new MeshPhysicalMaterial({ color: 0xe4e8e2, roughness: 0.35, clearcoat: 1 }));
  const g = new Group();
  const palm = new Mesh(scope.add(new BoxGeometry(0.11, 0.13, 0.035)), mat);
  palm.position.y = 0.2;
  g.add(palm);
  const finger = scope.add(new CylinderGeometry(0.011, 0.013, 0.11, 6));
  for (let i = 0; i < 4; i++) {
    const f = new Mesh(finger, mat);
    f.position.set(-0.04 + i * 0.027, 0.32 + (i === 1 || i === 2 ? 0.01 : 0), 0);
    f.rotation.x = -0.25;
    g.add(f);
  }
  const thumb = new Mesh(finger, mat);
  thumb.position.set(0.07, 0.23, 0.01);
  thumb.rotation.z = -0.8;
  g.add(thumb);
  const arm = new Mesh(scope.add(new CylinderGeometry(0.035, 0.04, 0.4, 8)), mat);
  arm.position.y = -0.05;
  g.add(arm);
  g.scale.setScalar(1.6);
  return g;
}

export default reality;

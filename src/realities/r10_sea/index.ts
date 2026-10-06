import { Matrix4, Quaternion, Vector3 } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import { LightPool } from '../../world/lightPool.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { Crawler } from '../../sim/ai/behaviors/Crawler.ts';
import { clamp } from '../../core/damp.ts';
import { L10 } from './lines.ts';
import { GAPS, HEAD, LIGHTS, PATH, PIER, WATER_Y, WHEELS, buildSea, deckHalfWidth } from './build.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _roll = new Quaternion();
const UP = new Vector3(0, 1, 0);
const FWD = new Vector3(0, 0, 1);

/** Eons it takes for the two lights to stand one behind the other (one shot of Čierne each). */
const SKIPS = 3;
/** How far the pair turns per eon: a quarter turn in three. */
const TURN = Math.PI / 2 / SKIPS;
/** Half the distance between the two lights. */
const SEP = 6;
/** Seconds of an eon going by. */
const EON = 3.4;
/** Seconds of standing still before something climbs out of the water. */
const STILL = 5;
const wheelsY = (skips: number) => -24 + 7 * skips;
const smooth = (k: number) => k * k * (3 - 2 * k);

const reality: RealityModule = {
  id: 'r10',
  index: 10,
  title: 'Tiché more',
  async create(ctx) {
    const { game, scene, scope } = ctx;
    await loadVoiceIndex();
    const sea = await buildSea(ctx);
    const S = sea.spots;
    const say = (id: string) => {
      const l = L10[id]!;
      return game.say(l.who, l.text, voiceUrl(id), l.min);
    };
    game.nav = null;
    // lanterns throw their light far over the boards (a gentle falloff)
    const lights = new LightPool(scene, sea.fixtures, game.renderer.profile.tier === 'low' ? 4 : 6, 1.15);
    game.grade = {
      ...game.grade,
      lift: [0.0, 0.004, 0.012],
      gain: [0.9, 0.95, 1.05],
      saturation: 0.55,
      contrast: 1.1,
      tint: [0.92, 0.97, 1.08],
      grain: 0.035,
    };
    if (!game.hasLight) game.giveLight(1);

    // ───────── state ─────────
    const F = (k: string) => game.flags.has(`more.${k}`);
    const put = (k: string) => game.flags.put(`more.${k}`);
    const done = [1, 2, 3].filter((i) => F(`skip${i}`)).length;
    const st = {
      skips: done,
      skipT: -1,
      phase: done * TURN,
      phaseFrom: 0,
      wheels: wheelsY(done),
      wheelsFrom: 0,
      still: 0,
      last: new Vector3(),
      riseIn: 0,
      busT: 0,
      onPath: false,
      left: false,
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
    const later: Array<{ at: number; fn: () => void }> = [];
    let clock = 0;
    const after = (s: number, fn: () => void) => later.push({ at: clock + s, fn });
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => {
      stoppers.forEach((f) => f());
      game.audio.setLag(0);
      game.fx.frost = 0;
    });
    sea.shots.forEach((g, i) => (g.visible = !F(`shot${i}`)));

    // ───────── the crawlers ─────────
    const crawlers = Array.from({ length: sea.crawlers.count }, (_, i) => {
      const c = new Crawler(`lezec-${i}`);
      if (game.settings.difficulty === 'story') c.speed = 0.65;
      game.entities.push(c);
      return c;
    });
    /** Brings some up over the pier's edge, a few metres ahead of and behind the player. */
    const riseNear = (count: number) => {
      const p = game.player.pos;
      let n = 0;
      for (const c of crawlers) {
        if (n >= count) break;
        if (!c.submerged) continue;
        const dz = (game.rng.chance(0.5) ? -1 : 1) * game.rng.range(5, 9);
        const z = clamp(p.z + dz, HEAD.z0 + 1, PIER.z1 - 2);
        const side = game.rng.chance(0.5) ? -1 : 1;
        c.rise(side * (deckHalfWidth(z) + 0.15), z);
        n++;
      }
    };

    // ───────── the path and the eons ─────────
    const openPath = (announce: boolean) => {
      sea.path.visible = true;
      sea.pathBody.enabled = true;
      st.phase = SKIPS * TURN;
      if (announce) {
        line('t_aligned');
        after(5, () => line('e10_2'));
      }
    };
    if (st.skips >= SKIPS) openPath(false);
    const checkpointHere = () => game.saveCheckpoint(F('head') ? 'head' : F('bench') ? 'bench' : 'pier');
    const startEon = () => {
      if (st.skipT >= 0) {
        // drunk while an eon is still going by: it would be lost, and there are only as many
        // shots as eons to skip. It stays in your hand.
        game.inventory.add('cierne', 1);
        return;
      }
      st.skipT = 0;
      st.phaseFrom = st.phase;
      st.wheelsFrom = st.wheels;
      game.player.frozen = true;
      // to the lights, while an eon goes by
      game.rig.lockTarget = { yaw: 0, pitch: 0.03 };
      game.synth.stinger(0.35);
      game.synth.thud(undefined, 0.8);
    };
    game.onEon = startEon;
    const stepEon = (dt: number) => {
      st.skipT += dt;
      const k = smooth(clamp(st.skipT / (EON - 0.4), 0, 1));
      const turns = st.skips < SKIPS ? 1 : 0;
      st.phase = st.phaseFrom + TURN * turns * k;
      st.wheels = st.wheelsFrom + 7 * turns * k;
      if (st.skipT < EON) return;
      st.skipT = -1;
      game.player.frozen = false;
      game.rig.lockTarget = null;
      if (st.skips < SKIPS) {
        st.skips++;
        put(`skip${st.skips}`);
      }
      game.fx.frost = 0.06 * st.skips;
      // whoever stood still that long is not alone on the pier any more
      riseNear(1 + st.skips);
      if (st.skips === 1) line('t_skip1');
      if (st.skips === 2) {
        line('e10_1');
        after(6, () => hint('t_skip_cold'));
      }
      if (st.skips >= SKIPS && !sea.path.visible) openPath(true);
      checkpointHere();
    };

    // ───────── interactions ─────────
    const I = game.interactions;
    I.add({
      id: 'lifebuoy',
      pos: S.lifebuoy!,
      radius: 0.35,
      prompt: 'Záchranný kruh',
      onUse: () => line('t_lifebuoy'),
    });
    I.add({
      id: 'bench',
      pos: S.bench!.clone().setY(0.6),
      radius: 0.6,
      prompt: 'Lavička',
      onUse: () => line('t_bench'),
    });
    I.add({
      id: 'scope',
      pos: S.scope!,
      radius: 0.25,
      prompt: 'Ďalekohľad',
      onUse: () => line(st.skips >= SKIPS ? 't_window' : 't_scope'),
    });
    sea.shots.forEach((g, i) =>
      I.add({
        id: `cierne:${i}`,
        pos: g.position,
        radius: 0.15,
        prompt: 'Poldeci',
        enabled: () => g.visible,
        onUse: () => {
          g.visible = false;
          put(`shot${i}`);
          game.inventory.add('cierne', 1);
          game.inventory.select(game.inventory.slots.findIndex((sl) => sl.item === 'cierne'));
          game.synth.clink(g.position, 0.3);
          if (i === 0) line('t_bench');
          else line('t_cierne');
          if (!st.hints.has('toast')) {
            st.hints.add('toast');
            game.ui.toast(game.touch ? 'Vypiješ ho tlačidlom „Piť"' : 'Vypiješ ho klávesom Q', 4000);
          }
        },
      }),
    );

    return {
      defaultCheckpoint: 'pier',
      checkpoints: {
        pier: { pos: S.start!.clone(), yaw: 0 },
        bench: { pos: new Vector3(-0.6, 0, -49.6), yaw: 0 },
        head: { pos: S.head!.clone(), yaw: 0 },
      },
      start(cp) {
        placeBeerMat(game, scope, 'r10', new Vector3(-1.75, 1.2, -49.4));
        stoppers.push(game.synth.drone({ freqs: [36.7, 55], cutoff: 160, volume: 0.03 }));
        stoppers.push(
          game.synth.loopNoise({
            kind: 'white',
            type: 'bandpass',
            freq: 300,
            q: 0.5,
            volume: 0.012,
            ampLfoRate: 0.05,
            ampLfoDepth: 0.9,
          }),
        );
        // the sea is so still and so big that sound comes late
        game.audio.setLag(0.7);
        game.audio.setReverb(5, 0.32);
        game.fx.frost = 0.06 * st.skips;
        st.last.copy(game.player.pos);
        if (cp !== 'pier') sea.bus.visible = false;
        else after(1.5, () => line('t_arrive'));
      },
      tick(dt) {
        clock += dt;
        for (let i = later.length - 1; i >= 0; i--)
          if (later[i]!.at <= clock) {
            const fn = later[i]!.fn;
            later.splice(i, 1);
            fn();
          }
        if (st.skipT >= 0) {
          stepEon(dt);
          return;
        }
        const p = game.player.pos;
        // standing still?
        const speed = Math.hypot(p.x - st.last.x, p.z - st.last.z) / dt;
        st.last.copy(p);
        st.still = speed < 0.4 ? st.still + dt : 0;
        st.onPath = sea.path.visible && p.z < PATH.z1 - 0.3;
        for (const c of crawlers) c.playerStill = st.onPath ? 0 : st.still;
        st.riseIn -= dt;
        if (!st.onPath && st.still > STILL && st.riseIn <= 0) {
          riseNear(1);
          st.riseIn = 6;
          hint('t_still');
        }
        if (crawlers.some((c) => c.visible && c.pos.distanceTo(p) < 8)) hint('t_crawler');
        // the water takes whoever steps into it
        if (p.y < WATER_Y + 0.25) void game.okno('voda');
        // the window at the end of the path
        if (st.onPath && p.z < sea.window.position.z + 7 && !st.left) {
          st.left = true;
          void game.gotoReality('r11');
        }
        if (st.onPath) hint('t_path');
        if (st.onPath && p.z < PATH.z0 + 40) hint('t_window');
        // places
        if (p.z < -18) hint('t_lights');
        if (GAPS.some(([z0, z1]) => p.z < z1 + 1.6 && p.z > z0 - 1.6)) hint('t_gap');
        if (p.z < -40) hint('t_wheels');
        if (st.skips > 0 && p.z < -30) hint('t_eyes');
        if (!F('bench') && Math.abs(p.z + 50) < 2.5) {
          put('bench');
          game.saveCheckpoint('bench');
        }
        if (!F('head') && p.z < HEAD.z1 - 0.5) {
          put('head');
          game.saveCheckpoint('head');
        }
        if (p.z < HEAD.z1 - 0.5 && st.skips < SKIPS && st.skips > 0) hint('t_need_more');
        // the bus leaves without a sound
        st.busT += dt;
        if (sea.bus.visible && (st.busT > 25 || p.z < -15)) {
          sea.bus.visible = false;
          if (p.z > -15) hint('t_bus_gone');
        }
      },
      frame(frameDt, alpha, t) {
        const cam = game.renderer.camera;
        // an eon going by: the lanterns flutter like a sped-up film
        const flutter = st.skipT >= 0 ? 0.55 + 0.45 * Math.sin(t * 47) * Math.sin(t * 13) : 1;
        lights.update(cam.position, t, flutter);
        // the pair of lights, circling; their reflections reach toward you over the water
        const ph = st.phase + (st.skips >= SKIPS ? 0 : Math.sin(t * 0.21) * 0.02);
        const dx = Math.cos(ph) * SEP;
        const dz = Math.sin(ph) * SEP;
        sea.lights[0]!.position.set(LIGHTS.x + dx, LIGHTS.y, LIGHTS.z + dz);
        sea.lights[1]!.position.set(LIGHTS.x - dx, LIGHTS.y, LIGHTS.z - dz);
        // along the path the lights fade into the window they always were
        const near = sea.path.visible
          ? clamp(1 - (cam.position.z - sea.window.position.z - 4) / 70, 0, 1)
          : 0;
        (sea.window.material as { opacity: number }).opacity = near;
        sea.lights.forEach((l, i) => {
          l.scale.setScalar(3.2 * (1 - near * 0.85));
          const s = sea.streaks[i]!;
          s.position.set(l.position.x, WATER_Y + 0.01, l.position.z);
          s.rotation.y = Math.atan2(cam.position.x - l.position.x, cam.position.z - l.position.z);
        });
        // the wheels rise eon by eon and turn
        sea.wheels.position.y = WHEELS.y + st.wheels;
        for (const r of sea.rings) r.pivot.rotateOnAxis(r.axis, r.speed * frameDt * (st.skipT >= 0 ? 12 : 1));
        sea.wheels.updateMatrixWorld(true);
        // one ring's eyes are open from the start; every eon opens another ring's
        const open = 20 * (1 + st.skips);
        sea.eyeSpots.forEach(([ri, a], i) => {
          const ring = sea.rings[ri]!;
          _v.set(Math.cos(a) * ring.radius, Math.sin(a) * ring.radius, 0);
          ring.pivot.localToWorld(_v);
          // out of the tube, toward whoever is looking
          _v.addScaledVector(_s.subVectors(cam.position, _v).normalize(), 1.9);
          const blink = (t * 0.7 + i * 1.618) % 5 < 0.15;
          const sc = i < open ? 1 : 0;
          _s.set(sc, blink ? sc * 0.08 : sc, sc);
          sea.eyes.setMatrixAt(i, _m.compose(_v, cam.quaternion, _s));
        });
        sea.eyes.instanceMatrix.needsUpdate = true;
        // the crawlers
        crawlers.forEach((c, i) => {
          if (!c.visible) {
            sea.crawlers.setMatrixAt(i, _m.makeScale(0, 0, 0));
            return;
          }
          _v.set(
            c.prevPos.x + (c.pos.x - c.prevPos.x) * alpha,
            c.prevPos.y + (c.pos.y - c.prevPos.y) * alpha,
            c.prevPos.z + (c.pos.z - c.prevPos.z) * alpha,
          );
          // a scuttle: the body rolls side to side as it goes
          _q.setFromAxisAngle(UP, c.yaw);
          const roll = Math.sin(t * 14 + i) * 0.12 * c.anim.move;
          _q.multiply(_roll.setFromAxisAngle(FWD, roll));
          sea.crawlers.setMatrixAt(i, _m.compose(_v, _q, _s.set(1, 1, 1)));
        });
        sea.crawlers.instanceMatrix.needsUpdate = true;
      },
      coldExposure: () => (st.onPath ? 0 : 0.35 + 0.15 * st.skips),
      warmth: () => {
        // the window ahead is warm; so is a lantern
        if (st.onPath) return 0.35;
        const p = game.player.pos;
        for (const f of sea.fixtures) if (Math.hypot(p.x - f.pos.x, p.z - f.pos.z) < 2.2) return 0.45;
        return 0;
      },
      darkness: () => 0.5,
      visibility: () => 0.4,
      threat: () => {
        const p = game.player.pos;
        let best = 0;
        for (const c of crawlers)
          if (c.visible) best = Math.max(best, clamp(1 - c.pos.distanceTo(p) / 6, 0, 1) * 0.9);
        return best;
      },
    };
  },
};

export default reality;

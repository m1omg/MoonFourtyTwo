import { Matrix4, Quaternion, Vector3 } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import { LightPool } from '../../world/lightPool.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { FrostFigure } from '../../sim/ai/behaviors/FrostFigure.ts';
import { clamp } from '../../core/damp.ts';
import { L8 } from './lines.ts';
import { HEMI, HOLE_OFFSET, SHELTER_Z, buildValley, groundHeight } from './build.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';
import { LIGHTER_REACH, TORCH_HALF_ANGLE, torchReach } from '../../sim/lightReach.ts';
import { comfort } from '../../render/comfort.ts';

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _look = new Vector3();
const _s = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/** Seconds a fresh battery lasts in the torch. */
const BATTERY_SECONDS = 80;
/** Spare batteries add up to this much charge (1 = a fresh torch). */
const MAX_CHARGE = 2;

const reality: RealityModule = {
  id: 'r8',
  index: 8,
  title: 'Údolie kostí',
  torch: true,
  async create(ctx) {
    const { game, scene, scope } = ctx;
    await loadVoiceIndex();
    const v = await buildValley(ctx);
    const S = v.spots;
    const say = (id: string) => {
      const l = L8[id]!;
      return game.say(l.who, l.text, voiceUrl(id), l.min);
    };
    game.nav = null;
    const lights = new LightPool(scene, v.fixtures, game.renderer.profile.tier === 'low' ? 4 : 6);
    game.grade = {
      ...game.grade,
      lift: [0.0, 0.006, 0.02],
      gain: [0.88, 0.95, 1.08],
      saturation: 0.6,
      contrast: 1.08,
      tint: [0.92, 0.97, 1.08],
      grain: 0.03,
    };
    // Ežo's lighter is in your pocket (also when this reality is the first one loaded)
    if (!game.hasLight) game.giveLight(1);

    // ───────── state ─────────
    const F = (k: string) => game.flags.has(`dol.${k}`);
    const put = (k: string) => game.flags.put(`dol.${k}`);
    const st = {
      battery: F('torch') ? 1 : 0,
      flashT: 0,
      nextFlash: 12,
      villageT: 14,
      eonT: -1,
      /** Where you stood when you drank it (the bus stops in front of you). */
      eonZ: SHELTER_Z,
      eonFrom: new Vector3(),
      eonTo: new Vector3(),
      hints: new Set<string>(),
      engineStop: null as (() => void) | null,
      /** Seconds at the shelter with Čierne not drunk yet. */
      shelterT: 0,
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
    if (F('torch')) v.flashlight.visible = false;
    v.batteries.forEach((bat, i) => (bat.visible = !F(`bat${i}`)));
    if (F('cierne')) v.cierne.visible = false;

    // ───────── the frost figures ─────────
    const figures = v.figures.map((p, i) => {
      const f = new FrostFigure(`mrazivec-${i}`);
      f.place(p.x, p.y, p.z, 0);
      if (game.settings.difficulty === 'story') f.speed = 1.1;
      game.entities.push(f);
      return f;
    });
    /**
     * Light falls on a figure from your light, a burning barrel, the shelter's tube, or a flash.
     * Your light reaches as far as it visibly does (the same numbers light the scene): the
     * lighter in front of you, the torch in its beam, where you really point it (up or down too).
     */
    const isLit = (f: FrostFigure): boolean => {
      if (st.flashT > 0) return true;
      for (const b of v.barrels)
        if (b.burning > 0.2 && Math.hypot(f.pos.x - b.pos.x, f.pos.z - b.pos.z) < 8) return true;
      if (v.lamp.intensity > 0 && Math.hypot(f.pos.x - v.lamp.pos.x, f.pos.z - v.lamp.pos.z) < 8) return true;
      if (!game.lightOn) return false;
      const p = game.player.pos;
      const torch = game.lightPower > 1;
      // to the figure's chest, from your eyes
      _v.set(f.pos.x - p.x, f.pos.y + 1.1 - (p.y + game.player.eyeHeight()), f.pos.z - p.z);
      const d = _v.length();
      if (d < 1.2) return true;
      if (d > (torch ? torchReach(clamp(st.battery * 2, 0, 1)) : LIGHTER_REACH - 1)) return false;
      const look = game.lookDir(_look);
      return look.dot(_v) / d > (torch ? Math.cos(TORCH_HALF_ANGLE) : 0.55);
    };
    game.onSignal = null;

    // ───────── interactions ─────────
    const I = game.interactions;
    const b0 = v.barrels[0]!;
    I.add({
      id: 'note',
      pos: S.barrelNote!,
      radius: 0.2,
      prompt: 'Lístok',
      onUse: () => line('t_note'),
    });
    I.add({
      id: 'flashlight',
      pos: S.flashlight!,
      radius: 0.2,
      prompt: 'Baterka',
      enabled: () => v.flashlight.visible,
      onUse: () => {
        v.flashlight.visible = false;
        put('torch');
        game.giveLight(2);
        // batteries found before the torch are not lost
        st.battery = Math.min(MAX_CHARGE, st.battery + 1);
        game.synth.click(S.flashlight, 1800, 0.12);
        line('t_flashlight');
        game.ui.toast(game.touch ? 'Svetlo zapneš tlačidlom so žiarovkou' : 'Svetlo: kláves F', 3500);
      },
    });
    v.batteries.forEach((bat, i) =>
      I.add({
        id: `battery:${i}`,
        pos: bat.position,
        radius: 0.15,
        prompt: 'Batérie',
        enabled: () => bat.visible,
        onUse: () => {
          bat.visible = false;
          put(`bat${i}`);
          st.battery = Math.min(MAX_CHARGE, st.battery + 0.6);
          if (game.flags.get('lighter') >= 2) game.lightPower = 2;
          game.synth.clink(bat.position, 0.3);
          line('t_battery');
        },
      }),
    );
    I.add({
      id: 'timetable',
      pos: S.timetable!,
      radius: 0.4,
      prompt: 'Cestovný poriadok',
      onUse: () => line('t_timetable'),
    });
    I.add({
      id: 'mosaic',
      pos: S.mosaic!,
      radius: 1.5,
      range: 3,
      prompt: 'Mozaika',
      onUse: () => line('t_shelter'),
    });
    I.add({
      id: 'cierne',
      pos: S.cierne!,
      radius: 0.15,
      prompt: 'Poldeci',
      enabled: () => v.cierne.visible,
      onUse: () => {
        v.cierne.visible = false;
        put('cierne');
        game.inventory.add('cierne', 1);
        // in hand, so that Q drinks this and not whatever else you carry
        game.inventory.select(game.inventory.slots.findIndex((sl) => sl.item === 'cierne'));
        line('t_cierne');
        game.ui.toast(
          game.touch ? 'Vypiješ ho tlačidlom „Piť"' : `Vypiješ ho klávesom ${game.keyLabel('drink')}`,
          4000,
        );
        game.saveCheckpoint('shelter');
      },
    });

    // ───────── the eon: Čierne, and the long wait ─────────
    const startEon = () => {
      if (st.eonT >= 0) return;
      st.eonT = 0;
      const p = game.player.pos;
      st.eonFrom.copy(p);
      st.eonTo.copy(p);
      // under the roof you would not see the sky: you step out in front of the shelter
      if (p.z < SHELTER_Z + 2.5 && Math.abs(p.x) < 3.4) {
        const x = clamp(p.x, -1, 1);
        st.eonTo.set(x, groundHeight(x, SHELTER_Z + 5.5), SHELTER_Z + 5.5);
      }
      st.eonZ = st.eonTo.z;
      // nothing of the valley's night goes on into it: no flash in the sky, no figure still
      // counted as coming (it kept the heartbeat going), and the torch stays chapter 8's
      st.flashT = 0;
      for (const f of figures) {
        f.active = false;
        f.setState('still');
      }
      game.player.frozen = true;
      game.lightOn = false;
      game.giveLight(1);
      // up at the hole, while it goes
      game.rig.lockTarget = { yaw: 0, pitch: 0.3 };
      line('t_eon');
    };
    game.onEon = startEon;
    // in the complete darkness after it, the light stays off
    game.onAction = (a) => a === 'light' && st.eonT >= 0;
    function stepEon(dt: number): void {
      const before = st.eonT;
      st.eonT += dt;
      const t = st.eonT;
      const crossed = (at: number) => before < at && t >= at;
      if (t < 1.8) {
        const m = clamp(t / 1.8, 0, 1);
        const pl = game.player;
        pl.prevPos.copy(pl.pos);
        pl.pos.lerpVectors(st.eonFrom, st.eonTo, m * m * (3 - 2 * m));
        pl.vel.set(0, 0, 0);
      }
      // the black hole evaporates; the fires burn down; the village is long dark
      const k = clamp(t / 5, 0, 1);
      const s = 1 - k * k * (3 - 2 * k) * 0.98;
      v.blackHole.scale.setScalar(s);
      for (const b of v.barrels) b.burning = 1 - k;
      for (const w of v.village) w.visible = false;
      if (crossed(5)) {
        // its last light
        v.blackHole.visible = false;
        game.synth.thud(undefined, 1.5);
        game.synth.stinger(0.8);
        void game.tweenFx('white', 1, 0.12);
      }
      if (crossed(5.3)) void game.tweenFx('white', 0, 1.4);
      if (crossed(6.8)) {
        stoppers.forEach((f) => f());
        stoppers.length = 0;
        v.lamp.intensity = 0;
        v.tube.visible = false;
        void game.tweenFx('fade', 0.94, 1.5);
        line('t_dark');
      }
      // in the dark, you turn round: something is coming up the road
      if (crossed(8.6)) game.rig.lockTarget = { yaw: Math.PI, pitch: -0.02 };
      const busFrom = st.eonZ + 140;
      if (crossed(10)) {
        v.headlights.visible = true;
        v.headlights.position.set(0, groundHeight(0, busFrom) + 1.0, busFrom);
        void game.tweenFx('fade', 0, 2);
        v.busLight.intensity = 14;
        st.engineStop = game.synth.loopNoise({ kind: 'brown', type: 'lowpass', freq: 130, volume: 0.14 });
        stoppers.push(() => st.engineStop?.());
        line('t_bus');
      }
      if (t > 10) {
        // fast down the empty road, braking to stop in front of you
        const u = clamp((t - 10) / 8.5, 0, 1);
        const z = st.eonZ + 6 + (busFrom - st.eonZ - 6) * (1 - u) * (1 - u);
        v.headlights.position.set(0, groundHeight(0, z) + 1.0, z);
        v.busLight.pos.set(0, groundHeight(0, z - 3) + 1.2, z - 3);
      }
      if (crossed(18.6)) {
        // the doors
        game.synth.hiss(v.headlights.position, 0.8, 0.3);
        game.synth.thud(v.headlights.position, 0.3);
      }
      if (crossed(19.8)) void game.tweenFx('fade', 1, 0.9);
      if (crossed(20.8)) void game.gotoReality('r9');
    }

    return {
      defaultCheckpoint: 'land',
      checkpoints: {
        land: { pos: S.land!.clone(), yaw: 0, pitch: -0.15 },
        mid: { pos: new Vector3(0, groundHeight(0, -140), -140), yaw: 0 },
        shelter: { pos: S.shelter!.clone(), yaw: 0 },
      },
      start(cp) {
        placeBeerMat(game, scope, 'r8', S.bench!.clone().add(new Vector3(-0.8, 0.6, 0)));
        stoppers.push(
          game.synth.loopNoise({
            kind: 'white',
            type: 'bandpass',
            freq: 420,
            q: 0.6,
            volume: 0.045,
            ampLfoRate: 0.07,
            ampLfoDepth: 0.85,
          }),
        );
        stoppers.push(game.synth.drone({ freqs: [41.2, 61.7], cutoff: 200, volume: 0.035 }));
        for (const b of v.barrels)
          stoppers.push(
            game.synth.loopNoise({
              kind: 'brown',
              type: 'bandpass',
              freq: 900,
              q: 0.4,
              volume: 0.05,
              pos: b.pos.clone().setY(b.pos.y + 0.9),
            }),
          );
        game.audio.setReverb(4.5, 0.25);
        if (cp === 'land') {
          game.synth.thud(undefined, 0.7);
          line('t_land');
        }
      },
      tick(dt) {
        if (st.eonT >= 0) {
          stepEon(dt);
          return;
        }
        const p = game.player.pos;
        // the torch eats batteries; empty, you are back to the lighter
        if (game.lightOn && game.lightPower > 1) {
          st.battery = Math.max(0, st.battery - dt / BATTERY_SECONDS);
          if (st.battery <= 0) {
            game.lightPower = 1;
            hint('t_battery_dead');
          }
        }
        game.torchLevel = clamp(st.battery * 2, 0, 1);
        // a flash at the rim of the hole: for a moment everything is lit
        st.flashT = Math.max(0, st.flashT - dt);
        st.nextFlash -= dt;
        if (st.nextFlash <= 0) {
          st.nextFlash = game.rng.range(16, 32);
          st.flashT = 0.35;
          game.synth.thud(undefined, 0.35);
          if (p.z < -20) hint('t_flash');
        }
        let creepingNear = false;
        for (const f of figures) {
          f.lit = isLit(f);
          if (!f.lit && f.state === 'creep' && f.pos.distanceTo(p) < 9) creepingNear = true;
          if (f.lit && game.lightOn && f.pos.distanceTo(p) < 10) hint('t_figures');
        }
        if (creepingNear && st.hints.has('t_figures')) hint('t_closer');
        // the village goes dark, one window at a time
        st.villageT -= dt;
        if (st.villageT <= 0) {
          st.villageT = 16;
          const lit = v.village.filter((w) => w.visible);
          if (lit.length > 0) {
            lit[game.rng.int(0, lit.length)]!.visible = false;
            if (lit.length === v.village.length) hint('t_village');
            if (lit.length === 1) hint('t_village_out');
          }
        }
        // places
        if (p.z < 2) hint('t_sky');
        if (p.z < -45) hint('t_bones');
        if (p.distanceTo(b0.pos) < 4) hint('t_barrel');
        if (p.z < -20 && p.z > -40) hint('t_poles');
        if (Math.abs(p.x) > 24) hint('t_deep');
        if (p.z < SHELTER_Z + 8) hint('t_shelter');
        if (game.status.cold.heat < 0.35) hint('t_cold');
        // halfway down the road (by the fourth barrel, on whichever side of the road you walk)
        if (!F('mid') && p.z < -140) {
          put('mid');
          game.saveCheckpoint('mid');
        }
        // at the shelter with Čierne in your pocket, and freezing: what it is for
        if (game.inventory.has('cierne') && p.z < SHELTER_Z + 8) {
          st.shelterT += dt;
          if (st.shelterT > 20 && !st.hints.has('t_cierne_how')) {
            hint('t_cierne_how');
            game.ui.toast(
              game.touch ? 'Vypiješ ho tlačidlom „Piť"' : `Vypiješ ho klávesom ${game.keyLabel('drink')}`,
              4000,
            );
          }
        }
      },
      frame(_dt, alpha, t) {
        const cam = game.renderer.camera.position;
        for (const [i, b] of v.barrels.entries()) {
          // fire breathes, it does not stutter like a tube
          b.fixture.intensity =
            6 * b.burning * (0.86 + 0.1 * Math.sin(t * (7.1 + i)) + 0.05 * Math.sin(t * 17.3 + i * 2));
          for (const [j, f] of b.flames.entries()) {
            const flick = 0.8 + 0.25 * Math.sin(t * (9 + i) + j * 2.1) * Math.sin(t * 5.3 + i);
            f.scale.set(b.burning, Math.max(0.001, b.burning * flick), b.burning);
          }
        }
        lights.update(cam, t);
        v.blackHole.position.copy(cam).add(HOLE_OFFSET);
        figures.forEach((f, i) => {
          _v.set(
            f.prevPos.x + (f.pos.x - f.prevPos.x) * alpha,
            f.pos.y,
            f.prevPos.z + (f.pos.z - f.prevPos.z) * alpha,
          );
          _v.y = groundHeight(_v.x, _v.z) - 0.05;
          // the figure geometry faces +z; entity yaw is camera-style (0 = -z)
          _q.setFromAxisAngle(UP, f.yaw + Math.PI);
          v.figureMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
        });
        v.figureMesh.instanceMatrix.needsUpdate = true;
        // sparkles at the rim of the hole (faster as it evaporates)
        const rate = st.eonT >= 0 ? 3 : 0.35;
        for (let i = 0; i < v.sparkles.count; i++) {
          const ph = (t * rate + i * 0.618) % 1;
          const cycle = Math.floor(t * rate + i * 0.618);
          const big = st.flashT > 0 && i === 0;
          if (ph > 0.06 && !big) {
            v.sparkles.setMatrixAt(i, _m.makeScale(0, 0, 0));
            continue;
          }
          const a = ((cycle * 2654435761 + i * 40503) % 6283) / 1000;
          const sc = big ? 6 : 1 - ph / 0.06;
          v.sparkles.setMatrixAt(
            i,
            _m.makeScale(sc, sc, sc).setPosition(Math.cos(a) * 52.5, Math.sin(a) * 52.5, 0.5),
          );
        }
        v.sparkles.instanceMatrix.needsUpdate = true;
        // the flash in the sky: with "Obmedziť záblesky" a soft swell instead of a strobe (it
        // still lights them all for that moment)
        const flash =
          st.flashT <= 0 ? 0 : comfort.reduceFlashes ? 0.45 * Math.sin((Math.PI * st.flashT) / 0.35) : 1.4;
        v.hemi.intensity = (st.eonT >= 6.8 ? 0 : HEMI) + flash;
      },
      coldExposure: () => {
        if (st.eonT >= 0) return 0;
        const p = game.player.pos;
        return p.z < SHELTER_Z + 1 && Math.abs(p.x) < 3 ? 0.5 : 1;
      },
      warmth: () => {
        const p = game.player.pos;
        let best = 0;
        for (const b of v.barrels) {
          const d = Math.hypot(p.x - b.pos.x, p.z - b.pos.z);
          best = Math.max(best, clamp(1 - (d - 1) / 4, 0, 1) * b.burning);
        }
        return best;
      },
      darkness: () => (st.eonT >= 0 ? 0 : game.lightOn ? 0.3 : 0.65),
      visibility: () => 0.4,
      threat: () => {
        if (st.eonT >= 0) return 0;
        const p = game.player.pos;
        let best = 0;
        for (const f of figures) {
          if (f.state !== 'creep') continue;
          best = Math.max(best, clamp(1 - f.pos.distanceTo(p) / 10, 0, 1) * 0.9);
        }
        return best;
      },
    };
  },
};

export default reality;

import { Vector3 } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import { LightPool } from '../../world/lightPool.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { Inspector } from '../../sim/ai/behaviors/Inspector.ts';
import { clamp, damp, dampAngle } from '../../core/damp.ts';
import { L9 } from './lines.ts';
import { B, DOORS, SPEED, buildBus } from './build.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';
import { comfort } from '../../render/comfort.ts';

const _v = new Vector3();
const _eye = new Vector3();
const _look = new Vector3();

/** Seconds of driving between two stops. */
const DRIVE = 30;
const BRAKE = 3;
/** Seconds at a stop with the doors open. */
const STOPPED = 6;
/** The flicker: a buzz, then the lights are out, then they come back. */
const BUZZ = 1.1;
const DARK = 1.5;
/** A face within this angle of where you look (plus its size) when the lights come back. */
const FACE_CONE = 0.3;
/** Where the stop sign stands once the bus has pulled in (just behind the middle door). */
const STOP_Z = 1.1;
const TUBE = new Vector3(0, B.h - 0.05, 0);

type Phase = 'drive' | 'brake' | 'stopped' | 'end';
type Flick = 'none' | 'buzz' | 'dark' | 'after';

const reality: RealityModule = {
  id: 'r9',
  index: 9,
  title: 'Nočný spoj',
  async create(ctx) {
    const { game, scene, scope } = ctx;
    await loadVoiceIndex();
    const bus = await buildBus(ctx);
    const S = bus.spots;
    const say = (id: string) => {
      const l = L9[id]!;
      return game.say(l.who, l.text, voiceUrl(id), l.min);
    };
    game.nav = null;
    const lights = new LightPool(scene, bus.fixtures, game.renderer.profile.tier === 'low' ? 3 : 4);
    game.grade = {
      ...game.grade,
      lift: [0.01, 0.008, 0.012],
      gain: [1.03, 0.99, 0.93],
      saturation: 0.72,
      contrast: 1.08,
      tint: [1.0, 0.98, 0.94],
      grain: 0.035,
    };
    if (!game.hasLight) game.giveLight(1);

    // ───────── state ─────────
    const F = (k: string) => game.flags.has(`bus.${k}`);
    const put = (k: string) => game.flags.put(`bus.${k}`);
    const st = {
      seg: 0,
      phase: 'drive' as Phase,
      phaseT: 0,
      speed: SPEED,
      dist: 0,
      prevDist: 0,
      /** Distance driven when the bus last stopped (the sign stays behind from there). */
      stopDist: -1e9,
      flick: 'none' as Flick,
      flickT: 0,
      nextFlick: 14,
      flicks: 0,
      stopAsked: false,
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
    scope.onDispose(() => stoppers.forEach((f) => f()));
    if (F('ticket')) bus.ticket.visible = false;

    // ───────── the inspector ─────────
    const insp = new Inspector('revizor');
    insp.route = bus.route;
    insp.checks = bus.checks;
    if (game.settings.difficulty === 'story') {
      insp.speed = 0.6;
      insp.darkSpeed = 1.8;
      insp.askSeconds = 2.5;
    }
    game.entities.push(insp);
    game.onSignal = (id, name) => {
      if (id !== 'revizor') return;
      if (name === 'check') line('r_check');
      else if (name === 'ask') line('r_ask');
      else if (name === 'thanks') {
        put('passed');
        game.saveCheckpoint(game.checkpoint);
        line('r_thanks');
      }
    };
    let walkPhase = 0;

    // ───────── doors ─────────
    const doorTarget = [0, 0, 0];
    const openDoors = (on: boolean) => {
      doorTarget.fill(on ? 1 : 0);
      for (const d of DOORS) game.synth.hiss(new Vector3(B.x1, 1, (d.z0 + d.z1) / 2), 0.7, 0.18);
    };

    // ───────── the flicker rule ─────────
    /** Is any of them in front of your eyes (and not behind a wall)? */
    const lookingAtFace = (): boolean => {
      const p = game.player;
      _eye.copy(p.pos).setY(p.pos.y + p.eyeHeight());
      game.lookDir(_look);
      for (const ps of bus.passengers) {
        _v.subVectors(ps.head, _eye);
        const d = _v.length();
        if (d > 9 || d < 0.05) continue;
        _v.divideScalar(d);
        if (_v.dot(_look) < Math.cos(FACE_CONE + Math.atan2(0.12, d))) continue;
        if (game.world.lineOfSight(_eye, ps.head)) return true;
      }
      return false;
    };
    const stepFlicker = (dt: number) => {
      if (st.flick === 'none') {
        if (st.phase !== 'drive' || st.phaseT <= 6) return;
        st.nextFlick -= dt;
        if (st.nextFlick <= 0) {
          st.flick = 'buzz';
          st.flickT = 0;
          game.synth.buzzer(TUBE, BUZZ, 0.12);
          if (st.flicks === 0) hint('t_buzz');
        }
        return;
      }
      st.flickT += dt;
      if (st.flick === 'buzz' && st.flickT >= BUZZ) {
        st.flick = 'dark';
        st.flickT = 0;
        game.synth.click(TUBE, 420, 0.2);
      } else if (st.flick === 'dark' && st.flickT >= DARK) {
        // the lights come back: whoever looks one of them in the face is taken
        st.flick = 'after';
        st.flickT = 0;
        game.synth.click(TUBE, 900, 0.16);
        if (st.flicks > 0 && lookingAtFace()) void game.okno('fluktuacia');
        else if (st.flicks === 0) after(0.6, () => hint('t_first_dark'));
        st.flicks++;
        st.nextFlick = st.seg >= 2 ? game.rng.range(11, 18) : game.rng.range(14, 23);
      } else if (st.flick === 'after' && st.flickT >= 2.5) st.flick = 'none';
    };

    // ───────── the trip ─────────
    const startSegment = (seg: number) => {
      st.seg = seg;
      st.phase = 'drive';
      st.phaseT = 0;
      bus.outside.setEra(Math.min(seg, 3));
      bus.outside.setStopName(seg);
      if (seg === 2) game.saveCheckpoint('revizor');
      if (seg === 4 && (F('passed') || F('valid'))) game.saveCheckpoint('konecna');
    };
    const stepTrip = (dt: number) => {
      const before = st.phaseT;
      st.phaseT += dt;
      const t = st.phaseT;
      const crossed = (at: number) => before < at && t >= at;
      switch (st.phase) {
        case 'drive': {
          st.speed = SPEED * clamp(0.25 + t / 4, 0, 1);
          if (crossed(2.5)) {
            game.synth.chime();
            if (st.seg < 4) after(1, () => line(`a_${st.seg + 1}`));
            else
              after(1, () => {
                line('e9_1');
                after(5, () => hint('t_ezo_voice'));
              });
          }
          if (crossed(9) && st.seg >= 1 && st.seg <= 3) hint(`t_era${st.seg}`);
          if (st.seg === 4) {
            // the last stop is on request
            if (st.stopAsked && st.flick === 'none') {
              st.phase = 'brake';
              st.phaseT = 0;
            } else if (
              !st.stopAsked &&
              t >= 40 &&
              Math.floor((t - 40) / 30) > Math.floor((before - 40) / 30)
            ) {
              // he keeps reminding you (at 40 s, then every 30 s): the bus never stops on its own
              line('e9_1');
            }
          } else if (t >= DRIVE) {
            st.phase = 'brake';
            st.phaseT = 0;
          }
          break;
        }
        case 'brake': {
          st.speed = SPEED * clamp(1 - t / BRAKE, 0, 1);
          if (st.seg === 4) {
            // the lights go once more; when they come back, there is no road
            if (crossed(BRAKE - 1.2)) {
              st.flick = 'dark';
              st.flickT = 0;
              game.synth.click(TUBE, 420, 0.2);
            }
            if (crossed(BRAKE - 0.6)) {
              bus.outside.setEra(4);
              bus.outside.stop.visible = false;
              st.speed = 0;
            }
          }
          if (t >= BRAKE) {
            st.speed = 0;
            st.phase = st.seg === 4 ? 'end' : 'stopped';
            st.phaseT = 0;
            st.stopDist = st.dist;
            openDoors(true);
            if (st.seg === 4) {
              doorTarget.fill(0);
              doorTarget[1] = 1;
              bus.doors[1]!.body.enabled = false;
              st.flick = 'after';
              st.flickT = 0;
              stoppers.forEach((f) => f());
              stoppers.length = 0;
              after(1.2, () => line('t_sea'));
            } else if (st.seg === 0) after(1.5, () => hint('t_doors'));
          }
          break;
        }
        case 'stopped': {
          // she gets on once you're out of her way (she used to appear right where you stood)
          const entry = bus.route[0];
          const inHerWay =
            !!entry && Math.hypot(game.player.pos.x - entry.x, game.player.pos.z - entry.z) < 1.6;
          if (st.seg === 2 && t >= 2 && !inHerWay && insp.state === 'wait' && !F('passed')) {
            insp.board();
            line('r_board');
            if (!F('valid'))
              after(3.5, () => {
                if (F('valid')) return;
                if (F('ticket')) {
                  hint('t_ticket_unvalidated');
                  return;
                }
                hint('t_no_ticket');
                if (!F('cap')) after(4, () => hint('t_cap_hint'));
              });
          }
          if (crossed(STOPPED - 1)) openDoors(false);
          if (t >= STOPPED) startSegment(st.seg + 1);
          break;
        }
        case 'end':
          break;
      }
      st.prevDist = st.dist;
      st.dist += st.speed * dt;
    };

    // ───────── interactions ─────────
    const I = game.interactions;
    I.add({
      id: 'cap',
      pos: S.cap!,
      radius: 0.22,
      prompt: 'Baranica',
      onUse: () => {
        put('cap');
        game.saveCheckpoint(game.checkpoint);
        line('t_cap');
      },
    });
    I.add({
      id: 'ticket',
      pos: S.ticket!,
      radius: 0.12,
      range: 2.4,
      prompt: 'Lístok',
      enabled: () => bus.ticket.visible,
      onUse: () => {
        bus.ticket.visible = false;
        put('ticket');
        game.saveCheckpoint(game.checkpoint);
        game.synth.click(S.ticket, 2400, 0.08);
        line('t_ticket');
        if (!F('valid')) game.ui.toast('Lístok treba označiť v označovači pri dverách', 4000);
      },
    });
    I.add({
      id: 'wheel',
      pos: S.wheel!,
      radius: 0.3,
      range: 2.6,
      prompt: 'Volant',
      onUse: () => line('t_driver'),
    });
    bus.validators.forEach((p, i) =>
      I.add({
        id: `validator:${i}`,
        pos: p,
        radius: 0.14,
        prompt: 'Označovač',
        onUse: () => {
          if (!F('ticket')) line('t_validator_empty');
          else if (F('valid')) line('t_validated');
          else {
            put('valid');
            game.saveCheckpoint(game.checkpoint);
            game.synth.clank(p, 0.5);
            game.synth.click(p, 1600, 0.12);
            line('t_validate');
          }
        },
      }),
    );
    bus.stopButtons.forEach((p, i) =>
      I.add({
        id: `stop:${i}`,
        pos: p,
        radius: 0.1,
        prompt: 'STOP',
        onUse: () => {
          game.synth.chime(p, [1318], 0.1);
          if (st.seg === 4 && st.phase === 'drive') {
            if (!st.stopAsked) line('t_stop');
            st.stopAsked = true;
          } else if (st.phase !== 'end' && !st.stopAsked) hint('t_stop_early');
        },
      }),
    );
    bus.passengers.forEach((ps, i) =>
      I.add({
        id: `passenger:${i}`,
        pos: ps.head,
        radius: 0.25,
        prompt: 'Cestujúci',
        onUse: () => {
          if (!st.hints.has('t_passengers')) hint('t_passengers');
          else if (ps.model === 'vierka' && !st.hints.has('t_vierka')) hint('t_vierka');
          else line('t_repeat');
        },
      }),
    );

    return {
      defaultCheckpoint: 'board',
      checkpoints: {
        board: { pos: S.start!.clone(), yaw: 0 },
        revizor: { pos: S.start!.clone(), yaw: 0 },
        konecna: { pos: S.start!.clone(), yaw: 0 },
      },
      start(cp) {
        placeBeerMat(game, scope, 'r9', new Vector3(-0.3, 1.2, 5.2));
        startSegment(cp === 'revizor' ? 2 : cp === 'konecna' ? 4 : 0);
        // back after a blackout with the ticket still unmarked: say so again (it's not on screen)
        if (F('ticket') && !F('valid'))
          after(2.5, () => game.ui.toast('Lístok máš, ale je neoznačený. Označovač je pri dverách.', 4500));
        // a restart past the inspector: he has already been
        if (cp === 'konecna') insp.setState('gone');
        st.speed = SPEED;
        stoppers.push(game.synth.drone({ freqs: [48, 72, 96.5], cutoff: 260, volume: 0.05 }));
        stoppers.push(game.synth.loopNoise({ kind: 'brown', type: 'lowpass', freq: 280, volume: 0.06 }));
        stoppers.push(game.synth.hum(0.025, TUBE));
        game.audio.setReverb(0.7, 0.18);
        if (cp === 'board') {
          after(1.5, () => line('t_board'));
          after(7, () => hint('t_windows'));
        }
      },
      tick(dt) {
        clock += dt;
        for (let i = later.length - 1; i >= 0; i--)
          if (later[i]!.at <= clock) {
            const fn = later[i]!.fn;
            later.splice(i, 1);
            fn();
          }
        stepTrip(dt);
        stepFlicker(dt);
        insp.dark = st.flick === 'dark';
        insp.ticketOk = F('valid');
        // doors (the regular stops are not yours: an invisible hand keeps you in)
        bus.doors.forEach((d, i) => {
          d.open = clamp(d.open + (doorTarget[i]! > d.open ? dt : -dt) / 0.8, 0, 1);
        });
        const p = game.player.pos;
        if (st.phase === 'stopped' && p.x > 0.75 && DOORS.some((d) => p.z > d.z0 - 0.3 && p.z < d.z1 + 0.3))
          hint('t_door');
        if (st.phase === 'end' && !st.left && p.x > B.x1 + 0.3) {
          st.left = true;
          void game.gotoReality('r10');
        }
        // places
        if (p.z < -4.2) hint('t_driver');
        if (game.player.pos.distanceTo(S.cap!) < 1.6 && !F('cap')) hint('t_cap_hint');
      },
      frame(frameDt, alpha, t) {
        const cam = game.renderer.camera.position;
        const dist = st.prevDist + (st.dist - st.prevDist) * alpha;
        // the lights: stutter in the buzz, out in the dark
        const level =
          st.flick === 'dark'
            ? 0
            : st.flick === 'buzz'
              ? comfort.reduceFlashes
                ? 0.6 + 0.15 * Math.cos(t * 4)
                : Math.sin(t * 61) * Math.sin(t * 23.7) > 0.1
                  ? 1
                  : 0.25
              : 1;
        bus.tubeMat.emissiveIntensity = 1.6 * level;
        bus.hemi.intensity = 0.03 + 0.42 * level;
        lights.update(cam, t, level);
        bus.sweep.intensity = bus.outside.update(dist, t) * 1.4 * level;
        // the stop sign comes alongside as the bus pulls in, and stays behind
        if (st.phase === 'brake' && st.seg < 4) {
          const left = BRAKE - st.phaseT;
          bus.outside.stop.position.z = STOP_Z - (SPEED * left * left) / (2 * BRAKE);
          bus.outside.stop.visible = true;
        } else if (st.seg < 4 || st.phase === 'drive') {
          bus.outside.stop.position.z = STOP_Z + (dist - st.stopDist);
          bus.outside.stop.visible = bus.outside.stop.position.z < 80;
        }
        // the wheel turns by itself while the bus drives
        const spin = bus.wheel.userData.spin as { rotation: { z: number } };
        if (st.speed > 0.5) spin.rotation.z = Math.sin(t * 0.6) * 0.45 + Math.sin(t * 0.23 + 1) * 0.3;
        // doors
        for (const d of bus.doors)
          for (const leaf of d.leaves) leaf.pivot.rotation.y = leaf.dir * 1.45 * d.open;
        // the passengers: each its own loop; in the dark they all turn to you
        const turned = st.flick === 'dark' || st.flick === 'after';
        for (const ps of bus.passengers) {
          const ch = ps.ch;
          // the body turns to you in the dark (instantly: nobody sees it) and back slowly afterwards
          const want = turned ? Math.atan2(cam.x - ch.root.position.x, cam.z - ch.root.position.z) : Math.PI;
          const prev = (ch.root.userData.yaw as number | undefined) ?? Math.PI;
          const yaw = st.flick === 'dark' ? want : dampAngle(prev, want, turned ? 12 : 1.5, frameDt);
          ch.root.userData.yaw = yaw;
          if (turned || ps.habit === 'stare') ch.lookTarget = cam;
          else ch.lookTarget = null;
          // the posed ones: rocking in the seat, or a jerk round to the window and back, again and again
          const k = (t + ps.phase) % 3.1;
          const jerk =
            ps.habit === 'twitch' && !turned && k < 0.5
              ? Math.sin((k / 0.5) * Math.PI) * 0.55 * -Math.sign(ps.window.x)
              : 0;
          ch.root.rotation.y = yaw + jerk;
          ch.root.rotation.x = ps.habit === 'rock' && !turned ? Math.sin((t + ps.phase) * 2.6) * 0.05 : 0;
          if (ps.habit === 'hand' && !turned) {
            if ((t + ps.phase) % 3.2 < 1.2) ch.startDrink();
            else ch.stopDrink();
          } else ch.stopDrink();
          ch.update(frameDt, t);
        }
        // the inspector
        const ic = bus.inspector;
        if (ic) {
          ic.root.visible = insp.visible;
          if (insp.visible) {
            const x = insp.prevPos.x + (insp.pos.x - insp.prevPos.x) * alpha;
            const z = insp.prevPos.z + (insp.pos.z - insp.prevPos.z) * alpha;
            walkPhase += Math.hypot(x - ic.root.position.x, z - ic.root.position.z) * 4.2;
            ic.root.position.set(x, 0, z);
            ic.root.rotation.y = insp.yaw + Math.PI;
            ic.walk = damp(ic.walk, insp.anim.move, 6, frameDt);
            ic.walkPhase = walkPhase;
            ic.lookTarget = insp.state === 'ask' ? cam : null;
            ic.update(frameDt, t);
          }
        }
      },
      // the heating works: whoever comes in out of the valley thaws slowly
      warmth: () => 0.25,
      darkness: () => (st.flick === 'dark' ? 0.8 : 0.15),
      visibility: () => 1,
      threat: () => {
        if (st.flick === 'buzz') return 0.3;
        if (st.flick === 'dark') return 0.5;
        if (!insp.visible || insp.state === 'leave' || insp.state === 'gone') return 0.1;
        return F('valid') ? 0.15 : clamp(1 - insp.pos.distanceTo(game.player.pos) / 8, 0, 1) * 0.8;
      },
    };
  },
};

export default reality;

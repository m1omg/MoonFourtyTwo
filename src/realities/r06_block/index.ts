import { Color, Matrix4, Vector3 } from 'three';
import type { MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import type { Door } from '../../world/objects/door.ts';
import { LightPool } from '../../world/lightPool.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { Neighbor } from '../../sim/ai/behaviors/Neighbor.ts';
import { approach, clamp } from '../../core/damp.ts';
import { MusicBox, TUNES } from '../../audio/procedural/musicbox.ts';
import { L6 } from './lines.ts';
import { CABIN, FH, FLOORS, HOME_FLOOR, LANDING, LOOP_FLOOR, buildBlock, liftDoorMatrix } from './build.ts';
import type { DoorSlot } from './build.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';

/** Floor numbers on the looping landings as you keep climbing. */
const LOOP_LABELS = ['9', '10', '11', '12', '13', '14', '40', '100'];
/** From this label on, every door in the house says Kolesár. */
const KOLESAR_FROM = 5;
/** Seconds the stairwell light stays on after a press (the „minútka"). */
const LIGHT_SECONDS = 60;
const LIFT_OPEN = 95;

const _m = new Matrix4();
/** The first fixtures of `blk.fixtures`: our flat's lamps (their intensities), then the caretaker's. */
const FLAT_LAMPS = [5, 2.2, 1.8, 2.6, 1.6];
const CARETAKER_LAMP = 5;
const _v = new Vector3();
const PEEP_OFF = new Color(0x050505);
const PEEP_ON = new Color(0xffd9a0);
const _c = new Color();

const reality: RealityModule = {
  id: 'r6',
  index: 6,
  title: 'Sídlisko',
  async create(ctx) {
    const { game, scene, scope } = ctx;
    await loadVoiceIndex();
    const blk = await buildBlock(ctx);
    const S = blk.spots as Record<string, Vector3>;
    const say = (id: string) => {
      const l = L6[id]!;
      return game.say(l.who, l.text, voiceUrl(id));
    };
    const lights = new LightPool(
      scene,
      [...blk.stairFixtures, ...blk.fixtures],
      game.renderer.profile.tier === 'low' ? 4 : 6,
    );
    game.grade = {
      ...game.grade,
      lift: [0.0, 0.005, 0.014],
      gain: [0.95, 0.98, 1.05],
      saturation: 0.8,
      contrast: 1.06,
      grain: 0.03,
    };

    // ───────── state ─────────
    const F = (k: string) => game.flags.has(`blok.${k}`);
    const put = (k: string, v: number | boolean = 1) => game.flags.put(`blok.${k}`, v);
    const st = {
      busy: false,
      lying: false,
      lightT: 0,
      relayT: 0,
      darkSaid: 0,
      /** How far the stairs above floor 8 have counted (index into LOOP_LABELS for landing 9). */
      loop: 0,
      /** The player's floor (landing level), and the floor the nameplates/interactions are on. */
      floor: -1,
      hasKey: F('key'),
      metEzo: F('ezo'),
      buzzT: 4,
      liftFloor: 0,
      liftAngle: 0,
      liftTarget: 0,
      calling: false,
      riding: false,
      toInfinity: false,
      panelTries: 0,
      /** The panel's own scene is running (its line, the choice, the ride): no second one. */
      panelBusy: false,
      hints: new Set<string>(),
    };
    put('loop', 0);
    const onErr = (e: unknown) => {
      if (!(e instanceof Cancelled)) console.error(e);
    };
    /**
     * A thought: never blocks anything (a newer line simply takes over), but never cuts Ežo
     * short either (it waits out his talk on the intercom: his key line was lost to "Zhaslo.").
     */
    const line = (id: string) => {
      if (st.busy) return;
      void say(id).catch(onErr);
    };
    /** A short scripted action on sim time. */
    const act = (fn: () => Promise<void>) => void fn().catch(onErr);
    const hint = (id: string) => {
      if (st.hints.has(id) || st.busy) return;
      st.hints.add(id);
      line(id);
    };
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => stoppers.forEach((f) => f()));
    // Ežo's lighter is in your pocket (also when this reality is the first one loaded)
    if (!game.hasLight) game.giveLight(1);
    if (st.hasKey) blk.key.visible = false;
    if (F('sliv')) blk.bottles.slivovica.visible = false;
    if (F('caj')) blk.bottles.caj.visible = false;

    const floorOf = (y: number) => clamp(Math.floor((y + 0.5) / FH), 0, FLOORS - 1);
    const inStairwell = (p: Vector3) => p.x > -2.95 && p.x < 2.95 && p.z > -3.95 && p.z < 3.95;
    const inCabin = (p: Vector3) =>
      p.x > CABIN.x0 &&
      p.x < CABIN.x1 - 0.05 &&
      p.z > CABIN.z0 &&
      p.z < CABIN.z1 &&
      Math.abs(p.y - st.liftFloor * FH) < 0.6;

    // ───────── the stairwell light ─────────
    const lampsOn = (on: boolean) => {
      blk.lampMat.color.setHex(on ? 0xfff0d0 : 0x2a2824);
      blk.stairFixtures.forEach((f, i) => (f.intensity = on ? (i % 2 ? 4.2 : 6) : 0));
    };
    const setLight = (seconds: number) => {
      if (st.lightT <= 0) lampsOn(true);
      st.lightT = seconds;
    };
    lampsOn(false);

    // ───────── floor numbers, the loop above floor 8 ─────────
    const loopIndex = (k: number) => Math.min(st.loop + (k - LOOP_FLOOR), LOOP_LABELS.length - 1);
    const labelFor = (k: number) =>
      k < LOOP_FLOOR ? (k === 0 ? 'P' : String(k)) : LOOP_LABELS[loopIndex(k)]!;
    const redrawSigns = () => {
      for (let k = LOOP_FLOOR; k < FLOORS; k++) blk.drawSign(k, labelFor(k));
      put('loop', st.loop);
    };

    // ───────── the neighbours ─────────
    interface Nb {
      n: Neighbor;
      slot: DoorSlot;
      angle: number;
      drawn: number;
      peep: number;
    }
    const nbs: Nb[] = [];
    const nbById = new Map<string, Nb>();
    const nbBySlot = new Map<number, Nb>();
    for (const s of blk.slots) {
      if (s.kind !== 'neighbour') continue;
      const n = new Neighbor(`sused-${s.floor}${'ABC'[s.which]}`);
      n.home.copy(s.home);
      n.place(s.home.x, s.home.y, s.home.z, s.homeYaw);
      n.area = { ...LANDING };
      // it only notices you out on the stairs, never through the walls of a flat
      n.zone = { x0: -2.95, z0: -3.95, x1: 2.95, z1: 0.6 };
      if (game.settings.difficulty === 'story') {
        n.courage = 5;
        n.speed = 0.7;
      }
      game.entities.push(n);
      const e: Nb = { n, slot: s, angle: 0, drawn: 0, peep: 0 };
      nbs.push(e);
      nbById.set(n.id, e);
      nbBySlot.set(s.index, e);
    }
    /** Shuts a floor's neighbours in at once (the looping landings must look alike). */
    const resetFloor = (k: number) => {
      for (const e of nbs)
        if (e.slot.floor === k) {
          e.n.reset();
          e.angle = 0;
        }
    };
    game.onSignal = (id, name) => {
      const e = nbById.get(id);
      if (!e) return;
      const at = _v
        .copy(e.slot.center)
        .setY(e.slot.center.y + 1.2)
        .clone();
      if (name === 'rattle') {
        game.synth.rattle(at, 1);
        hint('t_chain');
      } else if (name === 'open') {
        game.synth.creak(at, 1.4, 0.22);
        game.synth.stinger(0.3);
        game.status.fear.scare(0.3);
        hint('t_neighbor');
      } else if (name === 'close') game.synth.thud(at, 0.8);
    };

    // nameplates and the per-floor interactions follow the floor you are on
    const doorPos = [new Vector3(), new Vector3(), new Vector3()];
    const switchPos = new Vector3();
    const liftPos = new Vector3();
    const panelPos = new Vector3();
    const slotAt = (w: number) => blk.slots[Math.max(0, st.floor) * 3 + w]!;
    const plateName = (s: DoorSlot) =>
      s.floor >= LOOP_FLOOR && loopIndex(s.floor) >= KOLESAR_FROM ? 'Kolesár' : s.name;
    const refreshFloor = () => {
      const k = st.floor;
      const y0 = k * FH;
      switchPos.set(0, y0 + 1.2, -3.86);
      liftPos.set(-2.92, y0 + 1.1, -2.6);
      for (let w = 0; w < 3; w++) {
        const s = slotAt(w);
        doorPos[w]!.copy(s.center).setY(y0 + 1.2);
        if (s.which === 2) doorPos[w]!.x -= 0.05;
        else doorPos[w]!.z += 0.05;
        const plate = blk.plates[w]!;
        plate.mesh.visible = s.kind === 'neighbour';
        if (!plate.mesh.visible) continue;
        plate.draw(plateName(s));
        _m.makeRotationY(s.rotY).setPosition(s.hinge);
        plate.mesh.position.set(0.45, 1.435, 0.032).applyMatrix4(_m);
        plate.mesh.rotation.set(0, s.rotY, 0);
      }
    };

    // ───────── the lift ─────────
    const placeCabin = () => {
      blk.liftCabin.position.y = st.liftFloor * FH;
      blk.cabinFixture.pos.set(
        (CABIN.x0 + CABIN.x1) / 2,
        st.liftFloor * FH + CABIN.h - 0.25,
        (CABIN.z0 + CABIN.z1) / 2,
      );
      panelPos.set(CABIN.x1 - 0.3, st.liftFloor * FH + 1.2, CABIN.z1 - 0.02);
    };
    placeCabin();
    const motor = (deep = false) => {
      const a = game.synth.loopNoise({
        kind: 'brown',
        type: 'lowpass',
        freq: deep ? 90 : 150,
        volume: deep ? 0.16 : 0.1,
        ampLfoRate: deep ? 0.7 : 2.5,
        ampLfoDepth: 0.25,
      });
      const b = game.synth.hum(deep ? 0.06 : 0.035);
      return () => {
        a();
        b();
      };
    };
    const openLift = () => {
      if (st.liftTarget > 0) return;
      st.liftTarget = LIFT_OPEN;
      game.synth.creak(liftPos.clone(), 0.9, 0.16);
      if (!F('liftOpen')) {
        put('liftOpen');
        line('t_lift_open');
      }
    };
    const closeLift = () => {
      st.liftTarget = 0;
    };
    const useLiftDoor = () => {
      if (!st.hasKey) {
        line('t_lift_locked');
        return;
      }
      const k = st.floor;
      if (st.liftFloor === k) {
        if (st.liftTarget > 0) closeLift();
        else openLift();
        return;
      }
      // the cabin is elsewhere: call it down (or up). Its door on the floor it leaves shuts
      // first (it stayed drawn open there, and this floor's door snapped open without a sound).
      act(async () => {
        st.calling = true;
        hint('t_lift_calling');
        blk.liftDoors.setMatrixAt(st.liftFloor, liftDoorMatrix(st.liftFloor, 0, _m));
        blk.liftDoors.instanceMatrix.needsUpdate = true;
        st.liftAngle = st.liftTarget = 0;
        const stop = motor();
        try {
          await game.clock.wait(2.5);
        } finally {
          // (also when a blackout ends the chapter mid-wait: the motor never ran on for ever)
          stop();
        }
        st.liftFloor = k;
        placeCabin();
        game.synth.clank(liftPos.clone(), 0.5);
        st.calling = false;
        openLift();
      });
    };
    async function shutAndGo(): Promise<void> {
      st.riding = true;
      closeLift();
      await game.clock.until(() => st.liftAngle < 0.5, 3);
      game.synth.thud(liftPos.clone(), 0.6);
      await game.clock.wait(0.6);
    }
    /** 14, 40 or 100: up the shaft to the landing that shows that number. */
    async function rideUp(label: string): Promise<void> {
      await shutAndGo();
      line('t_lift_up');
      const stop = motor();
      try {
        await game.clock.wait(4.5);
      } finally {
        stop();
      }
      const dy = (LOOP_FLOOR - st.liftFloor) * FH;
      const p = game.player.pos;
      game.player.teleport(_v.set(p.x, p.y + dy, p.z));
      st.liftFloor = LOOP_FLOOR;
      placeCabin();
      st.loop = LOOP_LABELS.indexOf(label);
      resetFloor(LOOP_FLOOR);
      resetFloor(LOOP_FLOOR + 1);
      redrawSigns();
      st.floor = -1;
      game.synth.clank(liftPos.clone(), 0.6);
      st.riding = false;
      openLift();
    }
    /** ∞: down, or up, out of the house. */
    async function rideOn(): Promise<void> {
      await shutAndGo();
      put('lift');
      st.toInfinity = true;
      line('t_lift_go');
      const stop = motor(true);
      stoppers.push(stop);
      await game.clock.wait(5);
      void game.gotoReality('r7');
    }
    const usePanel = () => {
      if (!game.status.layerVisionActive) {
        game.synth.click(panelPos.clone(), 1500, 0.12);
        line(st.panelTries++ === 0 ? 't_panel' : 't_panel_sober');
        return;
      }
      if (st.panelBusy) return;
      st.panelBusy = true;
      act(async () => {
        try {
          if (!F('panelDrunk')) {
            put('panelDrunk');
            await say('t_panel_drunk');
          }
          const i = await game.choose(['14', '40', '100', '∞', 'Nikam']);
          if (i < 0 || i > 3) return;
          game.synth.click(panelPos.clone(), 1500, 0.12);
          if (i === 3) await rideOn();
          else await rideUp(['14', '40', '100'][i]!);
        } finally {
          st.panelBusy = false;
        }
      });
    };

    // ───────── the bathtub ─────────
    const lieDown = () => {
      st.lying = true;
      game.seated = true;
      game.player.noclip = true;
      game.player.frozen = true;
      game.player.forcedHeight = 0.62;
      game.player.teleport(S.tubLie!);
      game.rig.setOrientation(-Math.PI / 2, 0.12);
    };
    const standUp = () => {
      if (!st.lying) return;
      st.lying = false;
      game.seated = false;
      game.player.noclip = !!game.debug.fly;
      game.player.frozen = false;
      game.player.forcedHeight = null;
      game.player.teleport(S.tubOut!);
      game.synth.splash(S.tubLie, 0.9);
      game.saveCheckpoint('flat');
    };
    game.onMoveWhileSeated = () => standUp();

    // ───────── interactions ─────────
    const I = game.interactions;
    const toggle = (door: Door, at: Vector3, firstOpen?: () => void) => {
      if (door.isOpen || door.target !== 0) {
        door.close();
        game.synth.thud(at, 0.5);
        return;
      }
      door.open(95);
      game.synth.creak(at, 0.8, 0.12);
      firstOpen?.();
    };
    I.add({
      id: 'flatDoor',
      pos: S.flatDoor!,
      radius: 0.45,
      prompt: () => (blk.flatDoor.target > 0 ? 'Zavrieť dvere' : 'Otvoriť dvere'),
      onUse: () =>
        toggle(blk.flatDoor, S.flatDoor!, () => {
          if (F('out')) return;
          put('out');
          // someone else's press is still running out
          setLight(8);
          line('t_door_out');
        }),
    });
    I.add({
      id: 'bathDoor',
      pos: S.bathDoor!,
      radius: 0.4,
      prompt: () => (blk.bathDoor.target !== 0 ? 'Zavrieť dvere' : 'Otvoriť dvere'),
      onUse: () => toggle(blk.bathDoor, S.bathDoor!),
    });
    I.add({
      id: 'switch',
      pos: switchPos,
      radius: 0.15,
      range: 2.0,
      prompt: 'Vypínač',
      onUse: () => {
        game.synth.click(switchPos.clone(), 1100, 0.2);
        setLight(LIGHT_SECONDS);
        hint('t_switch');
      },
    });
    (['doorA', 'doorB', 'doorC'] as const).forEach((id, w) =>
      I.add({
        id,
        pos: doorPos[w]!,
        radius: 0.4,
        range: 2.0,
        prompt: () => (slotAt(w).kind === 'cellar' ? 'Pivnica' : plateName(slotAt(w))),
        enabled: () => {
          const k = slotAt(w).kind;
          return k === 'neighbour' || k === 'cellar';
        },
        onUse: () => {
          const s = slotAt(w);
          const at = doorPos[w]!.clone();
          if (s.kind === 'cellar') {
            game.synth.thud(at, 0.4);
            line('t_cellar_door');
            return;
          }
          const e = nbBySlot.get(s.index);
          if (!e || e.n.state !== 'inside') return;
          game.synth.thud(at, 0.45);
          act(async () => {
            await game.clock.wait(0.25);
            game.synth.thud(at, 0.45);
          });
          const watching = e.n.watching > 0.3;
          e.n.provoke();
          line(watching ? 't_peephole' : plateName(s) === 'Kolesár' ? 't_names' : 't_locked');
        },
      }),
    );
    I.add({
      id: 'mirror',
      pos: S.mirror!,
      radius: 0.3,
      prompt: 'Zrkadlo',
      onUse: () => {
        // whatever you did with it, the door behind you is shut when you turn around
        blk.bathDoor.close();
        line('t_mirror');
      },
    });
    I.add({
      id: 'wallunit',
      pos: S.wallunit!,
      radius: 0.7,
      prompt: () => (F('sliv') ? 'Obývacia stena' : 'Vziať slivovicu'),
      onUse: () =>
        act(async () => {
          if (F('sliv')) return say('t_wallunit');
          put('sliv');
          blk.bottles.slivovica.visible = false;
          game.inventory.add('slivovica', 1);
          game.synth.clink(S.bottle, 0.4);
          await say('t_wallunit');
          await say('t_bottle');
        }),
    });
    I.add({ id: 'tv', pos: S.tv!, radius: 0.3, prompt: 'Televízor', onUse: () => line('t_tv') });
    I.add({
      id: 'window',
      pos: S.window!,
      radius: 0.6,
      range: 2.6,
      prompt: 'Okno',
      onUse: () => line(game.status.layerVisionActive ? 't_window_drunk' : 't_window'),
    });
    I.add({ id: 'kitchen', pos: S.kitchen!, radius: 0.3, prompt: 'Sporák', onUse: () => line('t_kitchen') });
    I.add({
      id: 'fridge',
      pos: S.fridge!,
      radius: 0.4,
      prompt: 'Chladnička',
      enabled: () => !F('beer'),
      onUse: () => {
        put('beer');
        game.inventory.add('pivo', 2);
        game.synth.clink(S.fridge, 0.5);
        line('t_fridge');
      },
    });
    I.add({
      id: 'mailboxes',
      pos: S.mailboxes!,
      radius: 0.6,
      prompt: 'Schránky',
      onUse: () => line('t_mailboxes'),
    });
    I.add({
      id: 'entrance',
      pos: S.entrance!,
      radius: 0.6,
      prompt: 'Vchodové dvere',
      onUse: () => {
        game.synth.thud(S.entrance, 0.6);
        line('t_entrance');
      },
    });
    I.add({
      id: 'intercom',
      pos: S.intercom!,
      radius: 0.22,
      prompt: 'Zvonček',
      enabled: () => !st.busy,
      onUse: () => void intercom(),
    });
    I.add({
      id: 'caretakerDoor',
      pos: S.caretakerDoor!,
      radius: 0.45,
      prompt: () => (blk.caretakerDoor.target > 0 ? 'Zavrieť dvere' : 'E. Kolesár – domovník'),
      onUse: () =>
        toggle(blk.caretakerDoor, S.caretakerDoor!, () => {
          if (F('caretaker')) return;
          put('caretaker');
          line('t_caretaker');
        }),
    });
    I.add({ id: 'photos', pos: S.photos!, radius: 0.6, prompt: 'Fotky', onUse: () => line('t_photos') });
    I.add({ id: 'note', pos: S.note!, radius: 0.15, prompt: 'Lístok', onUse: () => line('t_note') });
    I.add({
      id: 'key',
      pos: S.key!,
      radius: 0.15,
      prompt: 'Kľúč',
      enabled: () => !st.hasKey,
      onUse: () => {
        st.hasKey = true;
        put('key');
        blk.key.visible = false;
        game.synth.clink(S.key, 0.5);
        line('t_key');
        game.saveCheckpoint('key');
      },
    });
    I.add({
      id: 'caj',
      pos: S.caj!,
      radius: 0.15,
      prompt: 'Horský čaj',
      enabled: () => !F('caj'),
      onUse: () => {
        put('caj');
        blk.bottles.caj.visible = false;
        game.inventory.add('horskyCaj', 1);
        game.synth.clink(S.caj, 0.4);
        line('t_caj');
      },
    });
    I.add({
      id: 'demijohn',
      pos: S.demijohn!,
      radius: 0.25,
      prompt: 'Demižón',
      onUse: () => {
        if (game.inventory.has('slivovica')) {
          line('t_demijohn_full');
          return;
        }
        game.synth.pour(1.2, S.demijohn);
        game.inventory.add('slivovica', 1);
        line('t_demijohn');
      },
    });
    I.add({ id: 'coat', pos: S.coat!, radius: 0.4, prompt: 'Kabát', onUse: () => line('t_coat') });
    I.add({
      id: 'lift',
      pos: liftPos,
      radius: 0.45,
      range: 2.2,
      prompt: () =>
        !st.hasKey
          ? 'Výťah'
          : st.liftFloor === st.floor && st.liftTarget > 0
            ? 'Zavrieť výťah'
            : 'Otvoriť výťah',
      enabled: () => !st.riding && !st.calling,
      onUse: useLiftDoor,
    });
    I.add({
      id: 'panel',
      pos: panelPos,
      radius: 0.15,
      range: 1.6,
      prompt: 'Gombíky',
      enabled: () => !st.riding && !st.panelBusy && inCabin(game.player.pos),
      onUse: usePanel,
    });

    // Ežo, through the intercom
    async function intercom(): Promise<void> {
      if (st.busy) return;
      st.busy = true;
      try {
        if (!st.metEzo) await say('t_intercom');
        game.synth.buzzer(S.intercom, 0.5, 0.14);
        await game.clock.wait(1.1);
        const crackle = game.synth.loopNoise({
          kind: 'white',
          type: 'bandpass',
          freq: 2400,
          q: 1.2,
          volume: 0.035,
          pos: S.intercom,
        });
        try {
          if (!st.metEzo) {
            await say('e6_1');
            await say('e6_2');
            await say('e6_3');
            st.metEzo = true;
            put('ezo');
            game.saveCheckpoint('ground');
          } else await say(st.hasKey ? 'e6_4' : 'e6_2'); // where the key is, until you have it
        } finally {
          crackle();
        }
      } catch (e) {
        onErr(e);
      } finally {
        st.busy = false;
      }
    }

    // ───────── per-frame helpers ─────────
    const models = blk.neighbourModels;
    const modelLast = models.map(() => ({ who: null as Nb | null, pos: new Vector3() }));
    let litWasDrunk = false;
    let panelWasDrunk = false;
    const doorMatrix = (e: Nb) =>
      _m.makeRotationY(e.slot.rotY + (e.angle * Math.PI) / 180).setPosition(e.slot.hinge);

    return {
      defaultCheckpoint: 'wake',
      checkpoints: {
        wake: { pos: S.tubLie!.clone(), yaw: -Math.PI / 2, pitch: 0.12 },
        flat: { pos: S.tubOut!.clone(), yaw: -Math.PI / 2 },
        ground: { pos: S.groundLanding!.clone(), yaw: 0 },
        key: { pos: S.caretakerInside!.clone(), yaw: Math.PI / 2 },
      },
      start(cp) {
        placeBeerMat(game, scope, 'r6', S.note!.clone().add(new Vector3(0.25, 0.5, 0.05)));
        stoppers.push(game.synth.drone({ freqs: [55, 82.4], cutoff: 260, volume: 0.035 }));
        stoppers.push(
          game.synth.loopNoise({
            kind: 'white',
            type: 'bandpass',
            freq: 480,
            q: 0.5,
            volume: 0.025,
            ampLfoRate: 0.11,
            ampLfoDepth: 0.7,
          }),
        );
        stoppers.push(game.synth.hum(0.025, S.fridge));
        stoppers.push(
          game.synth.loopNoise({ kind: 'white', type: 'highpass', freq: 3200, volume: 0.018, pos: S.tv }),
        );
        game.audio.setReverb(2.4, 0.45);
        // a music box somewhere in the wall unit, slowed down, a little out of tune: their song
        const box = new MusicBox(game.audio);
        box.play(
          { ...TUNES.esteJedno!, voice: 'musicbox', bass: undefined, rate: 0.55, detune: -0.35 },
          S.wallunit,
          0.22,
        );
        stoppers.push(() => box.stop());
        redrawSigns();
        if (cp === 'wake') {
          lieDown();
          line('t_wake');
        }
      },
      tick(dt) {
        const p = game.player.pos;
        blk.flatDoor.step(dt);
        blk.bathDoor.step(dt);
        blk.caretakerDoor.step(dt);
        // the light timer and its relay
        if (st.lightT > 0) {
          st.lightT -= dt;
          st.relayT -= dt;
          if (st.relayT <= 0) {
            st.relayT += 1;
            game.synth.click(undefined, 760, 0.02);
          }
          if (st.lightT <= 0) {
            st.lightT = 0;
            lampsOn(false);
            game.synth.click(undefined, 600, 0.06);
            if (st.darkSaid++ < 2 && F('out')) line('t_dark');
          }
        }
        const lit = st.lightT > 0;
        for (const e of nbs) {
          e.n.lit = lit;
          e.angle = approach(e.angle, e.n.doorOpen ? 100 : 0, 220 * dt);
        }
        // the floor you are on
        const k = floorOf(p.y);
        if (k !== st.floor) {
          st.floor = k;
          refreshFloor();
        }
        // above floor 8 the stairs only ever lead to floor 9 again, while the numbers keep counting
        if (!st.riding && inStairwell(p) && p.z < -1.3 && p.y > (LOOP_FLOOR + 1) * FH - 0.12) {
          const v = game.player.vel.clone();
          game.player.teleport(_v.set(p.x, p.y - FH, p.z));
          game.player.vel.copy(v);
          st.loop = Math.min(st.loop + 1, LOOP_LABELS.length - 1);
          resetFloor(LOOP_FLOOR);
          resetFloor(LOOP_FLOOR + 1);
          redrawSigns();
          st.floor = -1;
        } else if (st.loop > 0 && p.y < HOME_FLOOR * FH + 0.3) {
          st.loop = 0;
          redrawSigns();
        }
        // places and thoughts
        if (inStairwell(p) && k === LOOP_FLOOR && p.z < -1.3) {
          const label = labelFor(LOOP_FLOOR);
          if (label === '40') hint('t_floor40');
          if (label === '100') hint('t_floor100');
        }
        if (inStairwell(p) && p.z > 2.9 && Math.abs(p.y - (k * FH + FH / 2)) < 0.5) hint('t_window_stairs');
        if (k === 0 && inStairwell(p) && !F('ground')) {
          put('ground');
          game.saveCheckpoint('ground');
        }
        // until you answer, the intercom downstairs keeps ringing
        if (F('out') && !st.metEzo && !st.busy) {
          st.buzzT -= dt;
          if (st.buzzT <= 0) {
            st.buzzT = 22;
            const far = p.distanceTo(S.intercom!) > 8;
            game.synth.buzzer(far ? undefined : S.intercom, 0.9, far ? 0.035 : 0.14);
            if (F('buzzHeard')) hint('t_buzz');
            put('buzzHeard');
          }
        }
        // the lift door
        st.liftAngle = approach(st.liftAngle, st.liftTarget, 120 * dt);
        blk.liftBodies.forEach((b, i) => (b.enabled = i !== st.liftFloor || st.liftAngle < 40));
        if (st.toInfinity) game.fx.shake = Math.max(game.fx.shake, 0.06);
      },
      frame(dt, alpha, t) {
        const cam = game.renderer.camera.position;
        const flick = st.toInfinity ? (Math.sin(t * 37) * Math.sin(t * 11.3) > 0.4 ? 0.1 : 1) : 1;
        // lamps behind walls light only their own rooms (no shadows: through a wall they lit
        // "dark" landings): the cabin's while its door is open or you are in it, each flat's
        // while you are in it or its door is open
        const p = game.player.pos;
        blk.cabinFixture.intensity = st.liftAngle > 5 || inCabin(p) ? 2.2 * flick : 0;
        const inFlat = p.z < -4.05 && Math.abs(p.y - HOME_FLOOR * FH) < 1.5;
        const flatOn = inFlat || blk.flatDoor.angle > 5;
        FLAT_LAMPS.forEach((v, i) => (blk.fixtures[i]!.intensity = flatOn ? v : 0));
        const caretakerOn = (p.x > 3.05 && p.y < 1.5) || blk.caretakerDoor.angle > 5;
        blk.fixtures[CARETAKER_LAMP]!.intensity = caretakerOn ? 5.5 : 0;
        lights.update(cam, t);
        blk.waters.frame(t);
        blk.tvScreen.draw(t);
        blk.snow.step(t);
        // neighbours' doors and peepholes
        let doorsDirty = false;
        let peepDirty = false;
        for (const e of nbs) {
          if (Math.abs(e.angle - e.drawn) > 0.01) {
            e.drawn = e.angle;
            blk.doorMesh.setMatrixAt(e.slot.index, doorMatrix(e));
            blk.peepholes.setMatrixAt(e.slot.index, _m);
            doorsDirty = true;
          }
          // someone behind the door, watching: the peephole lights up
          const w = e.angle < 1 ? clamp((e.n.watching - 0.15) / 0.5, 0, 1) : 0;
          if (Math.abs(w - e.peep) > 0.004) {
            e.peep = w;
            blk.peepholes.setColorAt(e.slot.index, _c.copy(PEEP_OFF).lerp(PEEP_ON, w));
            peepDirty = true;
          }
        }
        if (doorsDirty) {
          blk.doorMesh.instanceMatrix.needsUpdate = true;
          blk.peepholes.instanceMatrix.needsUpdate = true;
        }
        if (peepDirty && blk.peepholes.instanceColor) blk.peepholes.instanceColor.needsUpdate = true;
        for (let w = 0; w < 3; w++) {
          const e = nbBySlot.get(slotAt(w).index);
          if (e && blk.plates[w]!.mesh.visible !== e.angle < 2) blk.plates[w]!.mesh.visible = e.angle < 2;
        }
        // the figures: the nearest neighbours that are out
        const out = nbs
          .filter((e) => e.n.visible)
          .sort((a, b) => a.n.pos.distanceToSquared(cam) - b.n.pos.distanceToSquared(cam));
        models.forEach((c, i) => {
          const e = out[i];
          const last = modelLast[i]!;
          if (!e) {
            c.root.visible = false;
            last.who = null;
            return;
          }
          const n = e.n;
          c.root.visible = true;
          c.root.position.set(
            n.prevPos.x + (n.pos.x - n.prevPos.x) * alpha,
            n.pos.y,
            n.prevPos.z + (n.pos.z - n.prevPos.z) * alpha,
          );
          c.root.rotation.y = n.yaw + Math.PI;
          if (last.who !== e) {
            last.who = e;
            last.pos.copy(n.pos);
          }
          c.walkPhase += n.pos.distanceTo(last.pos) * 4.5;
          last.pos.copy(n.pos);
          c.walk = clamp(n.anim.move * 3, 0, 1);
          c.lookTarget = n.anim.alert > 0.3 ? cam : null;
          c.update(dt, t);
        });
        // the lift
        blk.liftDoors.setMatrixAt(st.liftFloor, liftDoorMatrix(st.liftFloor, st.liftAngle, _m));
        blk.liftDoors.instanceMatrix.needsUpdate = true;
        const drunk = game.status.layerVisionActive;
        if (drunk !== panelWasDrunk) {
          panelWasDrunk = drunk;
          const pm = blk.panel.mesh.material as MeshStandardMaterial;
          pm.map = pm.emissiveMap = drunk ? blk.panel.drunk : blk.panel.sober;
          pm.needsUpdate = true;
        }
        if (drunk !== litWasDrunk) {
          litWasDrunk = drunk;
          const lm = blk.litWindow.mesh.material as MeshBasicMaterial;
          lm.map = drunk ? blk.litWindow.me : blk.litWindow.empty;
          lm.needsUpdate = true;
        }
      },
      waterDepth: (pos) => blk.waters.depthAt(pos),
      waterSurface: (x, z) => blk.waters.surfaceAt(x, z),
      visibility: () => (st.lightT > 0 || !inStairwell(game.player.pos) ? 0.85 : 0.35),
      darkness: () => {
        if (!inStairwell(game.player.pos)) return 0.04;
        if (st.lightT > 0) return 0.06;
        return game.lightOn ? 0.25 : 0.55;
      },
      threat: () => {
        const p = game.player.pos;
        let best = 0;
        for (const e of nbs) {
          if (!e.n.visible || Math.abs(e.n.pos.y - p.y) > 1.2) continue;
          const d = Math.hypot(e.n.pos.x - p.x, e.n.pos.z - p.z);
          best = Math.max(best, clamp(1 - d / 6, 0, 1) * (0.4 + 0.6 * e.n.anim.alert) * 0.8);
        }
        return best;
      },
    };
  },
};

export default reality;

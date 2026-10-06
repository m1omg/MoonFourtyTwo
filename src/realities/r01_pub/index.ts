import { PerspectiveCamera, Vector3, WebGLRenderTarget } from 'three';
import type { Object3D, MeshBasicMaterial } from 'three';
import type { RealityModule, RealityInstance } from '../../world/Reality.ts';
import { buildPub, drawJukebox, drawSlot, type Pub } from './build.ts';
import { L } from './lines.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { CREDITS } from '../../narrative/credits.ts';
import type { Game } from '../../app/Game.ts';
import type { ItemId } from '../../sim/items/items.data.ts';
import { ITEMS } from '../../sim/items/items.data.ts';
import { Watcher } from '../../sim/ai/behaviors/Watcher.ts';
import { MusicBox, TUNES } from '../../audio/procedural/musicbox.ts';
import { BAC_DRUNK } from '../../sim/status/Intoxication.ts';
import { clamp } from '../../core/damp.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';

/** Shows a line from the pub script (voice clip if recorded) and animates the speaker. */
async function line(game: Game, pub: Pub, id: string): Promise<void> {
  const l = L[id];
  if (!l) return;
  const speaker = l.who === 'Ežo' ? pub.ezo : l.who === 'Vierka' ? pub.vierka : null;
  speaker?.setTalking(true);
  if (l.laugh) speaker?.laugh();
  try {
    await game.say(l.who, l.text, voiceUrl(id), l.min);
  } finally {
    speaker?.setTalking(false);
  }
}

const TV_LAYER = 3;

const reality: RealityModule = {
  id: 'r1',
  index: 1,
  title: 'Piváreň U Kolesa',
  async create(ctx) {
    const { game, scene, scope } = ctx;
    const pub = await buildPub(ctx, { outdoor: true });
    await loadVoiceIndex();
    game.nav = pub.nav;
    const say = (id: string) => line(game, pub, id);
    const music = new MusicBox(game.audio);
    scope.onDispose(() => music.stop());
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => stoppers.forEach((s) => s()));

    // ───────── state ─────────
    const s = {
      phase: 'r1' as 'r1' | 'r2',
      rounds: game.flags.get('pub.rounds'),
      tallies: 3 + game.flags.get('pub.rounds'),
      seated: false,
      busy: false,
      ordered: false,
      glyph: 0,
      glyphShown: game.flags.has('pub.glyph'),
      lastRoundAt: 0,
      inWc: false,
      swapped: false,
      lightsOff: false,
      flickerAt: 8,
      faceTurn: 0,
      lastYaw: 0,
      lastYawT: 0,
      figureShown: false,
      outside: false,
      wcScene: 0,
      wcTimer: 0,
      r2Talked: game.flags.has('pub.r2talk'),
      /** Back in the WC after an okno: the two regulars wait until you are out of it. */
      wakeWhenOut: false,
      wakeAt: 0,
      r2Waiting: false,
      slotSpin: 0,
      slotReels: ['7', 'ČE', 'ZV'] as string[],
      jukebox: -1,
      ezoDrinkT: 0,
      keys: game.flags.has('pub.keys'),
    };
    pub.ourMat.draw(s.tallies);

    const cam = game.renderer.camera;
    const eyeVec = new Vector3();

    // ───────── seating ─────────
    const sitDown = () => {
      if (s.seated) return;
      s.seated = true;
      game.seated = true;
      game.seatedWithDrink = true;
      game.player.teleport(pub.playerSeat.pos, game.player.yaw);
      game.player.forcedHeight = 1.28;
      game.rig.setOrientation(pub.playerSeat.yaw, -0.12);
    };
    const standUp = () => {
      if (!s.seated) return;
      s.seated = false;
      game.seated = false;
      game.seatedWithDrink = false;
      game.player.forcedHeight = null;
      game.player.teleport(pub.playerSeat.pos.clone().add(new Vector3(0.0, 0, -0.55)), game.player.yaw);
    };
    // you can always get up, even while Ežo is talking (he keeps talking)
    game.onMoveWhileSeated = () => standUp();

    // ───────── interactions ─────────
    const I = game.interactions;
    I.add({
      id: 'seat',
      pos: new Vector3(3.0, 0.6, 2.5),
      radius: 0.35,
      prompt: 'Sadnúť si',
      enabled: () => !s.seated && s.phase === 'r1',
      onUse: () => {
        sitDown();
        void onSat();
      },
    });
    I.add({
      id: 'seat2',
      pos: new Vector3(3.0, 0.6, 2.5),
      radius: 0.35,
      prompt: 'Sadnúť si k Ežovi',
      enabled: () => !s.seated && s.phase === 'r2',
      onUse: () => {
        sitDown();
        void r2Talk();
      },
    });
    I.add({
      id: 'ezo',
      pos: new Vector3(3.0, 1.15, 3.95),
      radius: 0.4,
      range: 2.6,
      prompt: () => (hasRound() ? 'Štrngnúť si' : 'Porozprávať sa'),
      enabled: () => !s.busy && s.phase === 'r1',
      onUse: () => void (hasRound() ? toast() : talkMenu()),
    });
    I.add({
      id: 'vierka',
      pos: pub.vierkaSpot.clone().add(new Vector3(0, 1.45, 0)),
      radius: 0.45,
      range: 2.8,
      prompt: 'Objednať',
      enabled: () => !s.busy && s.phase === 'r1',
      onUse: () => void order(),
    });
    I.add({
      id: 'window',
      pos: new Vector3(2.8, 1.6, 4.5),
      radius: 0.7,
      range: 3.2,
      prompt: 'Pozrieť sa von',
      enabled: () => !s.busy,
      ignoreOcclusion: true,
      onUse: () =>
        void solo(async () => {
          await say(s.phase === 'r2' ? 't_cold' : 't_window');
          game.flags.put('pub.hint.window');
          if (s.seated) await say('e_stars');
        }),
    });
    I.add({
      id: 'calendar',
      pos: new Vector3(0.95, 1.75, -4.35),
      radius: 0.25,
      range: 3.5,
      prompt: 'Pozrieť kalendár',
      onUse: () => void solo(() => say('t_calendar')),
    });
    I.add({
      id: 'photo',
      pos: new Vector3(5.84, 1.7, 3.2),
      radius: 0.25,
      range: 2.6,
      prompt: 'Pozrieť fotku',
      onUse: () =>
        void solo(async () => {
          await say('t_photo');
          if (s.phase === 'r1' && game.player.pos.distanceTo(pub.ezoSeat) < 4) await say('e_photo');
        }),
    });
    I.add({
      id: 'clock',
      pos: new Vector3(-0.6, 2.45, -4.37),
      radius: 0.22,
      range: 5,
      prompt: 'Pozrieť na hodiny',
      onUse: () =>
        void solo(() => say(s.phase === 'r2' ? 't_clock2' : pub.clock.backTicks > 0 ? 't_clock' : 't_cold')),
    });
    I.add({
      id: 'tv',
      pos: new Vector3(1.9, 2.48, -3.8),
      radius: 0.3,
      range: 6,
      prompt: 'Pozerať televízor',
      onUse: () =>
        void solo(() => say(s.phase === 'r2' ? 't_tv2' : pub.tv.glitch > 0 ? 't_tv_glitch' : 't_tv')),
    });
    for (const [i, [x, z]] of (
      [
        [-1.1, 2.9],
        [2.4, -0.4],
      ] as Array<[number, number]>
    ).entries()) {
      I.add({
        id: `mats${i}`,
        pos: new Vector3(x, 0.82, z),
        radius: 0.12,
        prompt: 'Pozrieť tácku',
        onUse: () => void solo(() => say('t_mats')),
      });
    }
    I.add({
      id: 'stove',
      pos: new Vector3(-5.25, 1.2, 3.75),
      radius: 0.5,
      prompt: 'Dotknúť sa pece',
      onUse: () =>
        void solo(async () => {
          await say('t_stove');
          if (s.phase === 'r1') await say('e_stove');
        }),
    });
    I.add({
      id: 'bull',
      pos: new Vector3(-5.8, 2.3, 0.6),
      radius: 0.3,
      range: 3,
      prompt: 'Pozrieť',
      onUse: () => void solo(() => say('t_bull')),
    });
    I.add({
      id: 'hatch',
      pos: pub.cellarHatch.position.clone(),
      radius: 0.4,
      prompt: 'Otvoriť poklop',
      onUse: () =>
        void solo(async () => {
          await say('t_hatch');
          if (s.phase === 'r1') await say('v_cellar');
        }),
    });
    I.add({
      id: 'regulars',
      pos: new Vector3(-4.3, 1.1, 2.6),
      radius: 0.6,
      range: 2.4,
      prompt: 'Prihovoriť sa',
      enabled: () => s.phase === 'r1' && !s.busy,
      onUse: () =>
        void solo(async () => {
          await say('f_card');
          await say('j_again');
          await say('f_again');
          if (game.flags.inc('pub.regularsTalk') > 1) await say('j_long');
        }),
    });
    I.add({
      id: 'slot',
      pos: new Vector3(5.34, 1.05, -3.75),
      radius: 0.35,
      prompt: 'Zahrať si',
      enabled: () => s.slotSpin <= 0 && s.phase === 'r1',
      onUse: () => void spinSlot(),
    });
    I.add({
      id: 'jukebox',
      pos: new Vector3(5.44, 0.95, 0.8),
      radius: 0.4,
      prompt: 'Pustiť hudbu',
      enabled: () => s.phase === 'r1' && !s.busy,
      onUse: () => void jukebox(),
    });
    I.add({
      id: 'frontDoor',
      pos: new Vector3(-4.2, 1.05, 4.5),
      radius: 0.45,
      prompt: () => (pub.frontDoor.isOpen ? 'Zavrieť' : 'Otvoriť'),
      onUse: () => void frontDoor(),
    });
    I.add({
      id: 'wcDoor',
      pos: new Vector3(-6.0, 1.05, -1.2),
      radius: 0.45,
      prompt: () => (pub.wcDoor.isOpen ? 'Zavrieť' : 'Otvoriť'),
      onUse: () => void wcDoorUse(),
    });
    I.add({
      id: 'stall',
      pos: new Vector3(-8.35, 1.05, -0.4),
      radius: 0.4,
      prompt: () => (pub.stallDoor.isOpen ? 'Zavrieť' : 'Otvoriť'),
      onUse: () => {
        if (pub.stallDoor.isOpen) pub.stallDoor.close();
        else {
          pub.stallDoor.open(95);
          if (s.wcScene === 1) {
            s.wcScene = 2;
            void solo(() => say('t_stall'));
          }
        }
      },
    });
    // frozen-pub interactions
    I.add({
      id: 'keys',
      // she stands frozen behind the bar: looking at her is enough, you reach over the counter
      pos: pub.vierkaSpot.clone().add(new Vector3(0, 1.15, 0.1)),
      radius: 0.5,
      range: 3.0,
      ignoreOcclusion: true,
      prompt: 'Vziať kľúče zo zástery',
      enabled: () => s.phase === 'r2' && !s.keys,
      onUse: () => {
        s.keys = true;
        game.flags.put('pub.keys');
        game.synth.click(pub.vierkaSpot, 3200, 0.12);
        void solo(() => say('t_keys'));
      },
    });
    for (const [id, item, count, x] of [
      ['shelfBor', 'borovicka', 3, -2.3],
      ['shelfSliv', 'slivovica', 2, -1.5],
      ['shelfFernet', 'fernet', 1, -0.8],
    ] as Array<[string, ItemId, number, number]>) {
      I.add({
        id,
        pos: new Vector3(x, 1.32, -4.25),
        radius: 0.22,
        range: 2.8,
        prompt: `Vziať: ${ITEMS[item].name}`,
        enabled: () => s.phase === 'r2' && !game.flags.has(`pub.${id}`),
        onUse: () => {
          game.flags.put(`pub.${id}`);
          game.inventory.add(item, count);
          game.synth.clink(new Vector3(x, 1.3, -4.25), 0.4);
        },
      });
    }

    // ───────── helpers ─────────
    let roundItem: ItemId | null = null;
    const hasRound = () => roundItem !== null && game.inventory.count(roundItem) > 0;
    async function solo(fn: () => Promise<void>): Promise<void> {
      if (s.busy) return;
      s.busy = true;
      try {
        await fn();
      } catch (e) {
        if (!(e instanceof Cancelled)) console.error(e);
      } finally {
        s.busy = false;
      }
    }

    async function onSat(): Promise<void> {
      if (!s.ordered && game.flags.has('pub.intro') && !hasRound()) await solo(() => say('e_wait'));
      else if (hasRound()) await toast();
    }

    async function order(): Promise<void> {
      await solo(async () => {
        const visits = game.flags.inc('pub.barVisits');
        await say(
          visits === 1
            ? 'v_hello'
            : visits === 3
              ? 'v_hello3'
              : visits > 1 && visits % 2 === 0
                ? 'v_hello2'
                : 'v_hello',
        );
        const opts: Array<[string, ItemId | null, number]> = [
          ['Dve borovičky.', 'borovicka', 2],
          ['Dve slivovice.', 'slivovica', 2],
          ['Dve pivá.', 'pivo', 2],
          ['Malinovku.', 'malinovka', 1],
          ['Chlieb s masťou.', 'chlieb', 1],
          ['Nič, ďakujem.', null, 0],
        ];
        const pick = await game.choose(opts.map((o) => o[0]));
        const [, item, n] = opts[pick]!;
        if (!item) {
          await say('v_nothing');
          return;
        }
        game.synth.pour(1.2, pub.vierkaSpot.clone().setY(1.2));
        if (item === 'malinovka') await say('v_malinovka');
        else if (item === 'chlieb') await say('v_chlieb');
        else await say('v_pour');
        game.inventory.add(item, n);
        if (n === 2) {
          roundItem = item;
          s.ordered = true;
          s.tallies++;
          pub.ourMat.draw(s.tallies);
          game.ui.toast(`${ITEMS[item].name} ×2 — odnes to k stolu`);
          s.faceTurn = 1;
        }
        if (game.status.intox.bac > 1.6) await say('v_closing');
      });
    }

    async function toast(): Promise<void> {
      if (!roundItem || !hasRound()) return;
      await solo(async () => {
        const item = roundItem!;
        if (item === 'borovicka' && !game.flags.has('pub.borLine')) {
          game.flags.put('pub.borLine');
          await say('e_bor1');
          await say('e_bor2');
          await say('e_bor3');
        } else if (item === 'slivovica' && !game.flags.has('pub.slivLine')) {
          game.flags.put('pub.slivLine');
          await say('e_sliv1');
          await say('e_sliv2');
        } else if (item === 'pivo') await say('e_pivo1');
        else if (item === 'malinovka') await say('e_mal1');
        else await say('e_cheers');
        // clink, both drink
        game.synth.clink(new Vector3(3.0, 1.0, 3.3), 1);
        game.fx.shake = 0.15;
        pub.ezo?.startDrink();
        s.ezoDrinkT = 2.2;
        game.inventory.take(item); // Ežo's glass
        game.consumeNow(item);
        if (game.inventory.count(item) > 0) game.inventory.take(item);
        roundItem = null;
        s.rounds++;
        game.flags.put('pub.rounds', s.rounds);
        s.lastRoundAt = game.clock.time;
        game.tallies++;
        game.saveCheckpoint('table');
      });
    }

    async function talkMenu(): Promise<void> {
      await solo(async () => {
        await say('e_talk');
        const opts = [
          'Ako bolo v práci?',
          'Prečo sa voláš Ežo?',
          'Videl si ten zápas?',
          'Nepôjdeme už domov?',
          'Nič, len tak.',
        ];
        const pick = await game.choose(opts);
        const map = [
          ['e_work1', 'e_work2', 'e_work3'],
          ['e_name1', 'e_name2'],
          ['e_tv1', 'e_tv2'],
          ['e_home1', 'e_home2'],
          ['e_nothing'],
        ][pick]!;
        for (const id of map) await say(id);
      });
    }

    async function spinSlot(): Promise<void> {
      s.slotSpin = 2.0;
      game.synth.click(new Vector3(5.3, 1, -3.75), 1400, 0.2);
      await game.clock.wait(2.0);
      const glyphs = game.status.intox.bac >= BAC_DRUNK && !game.flags.has('pub.slotGlyph');
      const syms = ['7', 'ČE', 'ZV', 'BAR', 'ZV', 'ČE'];
      if (glyphs) {
        game.flags.put('pub.slotGlyph');
        s.slotReels = ['GLYPH', 'GLYPH', 'GLYPH'];
        drawSlot(pub.slot, s.slotReels, 0);
        await solo(() => say('t_slot_glyph'));
        return;
      }
      s.slotReels = [game.rng.pick(syms), game.rng.pick(syms), game.rng.pick(syms)];
      const win = game.rng.chance(0.18);
      if (win) s.slotReels = ['7', '7', '7'];
      drawSlot(pub.slot, s.slotReels, 0);
      if (win) {
        for (let i = 0; i < 6; i++)
          setTimeout(() => game.synth.click(new Vector3(5.3, 1, -3.75), 2400 + i * 200, 0.15), i * 90);
        game.inventory.add('horskyCaj', 1);
        await solo(() => say('t_slot_win'));
      } else await solo(() => say('t_slot_lose'));
    }

    async function jukebox(): Promise<void> {
      await solo(async () => {
        const pick = await game.choose(['A1 Ešte jedno — Kolesári', 'A2 Dychovka z Kolesova', 'Vypnúť']);
        game.synth.click(new Vector3(5.4, 1, 0.8), 900, 0.2);
        if (pick === 2) {
          music.stop();
          s.jukebox = -1;
          return;
        }
        s.jukebox = pick;
        const url = pick === 0 ? 'assets/music/este_jedno.mp3' : 'assets/music/dychovka.mp3';
        void url;
        music.play(pick === 0 ? TUNES.esteJedno! : TUNES.dychovka!, new Vector3(5.4, 1.0, 0.8), 0.4);
      });
    }

    async function frontDoor(): Promise<void> {
      const d = pub.frontDoor;
      if (s.phase === 'r2') {
        if (!s.keys) {
          await solo(() => say('t_door_closed'));
          return;
        }
        d.locked = false;
        d.open(90);
        await solo(async () => {
          await say('t_door_open');
          await game.clock.wait(0.6);
        });
        await toNextReality();
        return;
      }
      if (d.isOpen) d.close();
      else {
        d.open(95);
        if (game.status.intox.bac >= 0.5 && s.rounds >= 1) void solo(() => say('e_leave'));
      }
    }

    async function wcDoorUse(): Promise<void> {
      const d = pub.wcDoor;
      if (d.isOpen) {
        d.close();
        return;
      }
      d.open(95);
      if (s.swapped && s.phase === 'r2' && !game.flags.has('pub.frozenSeen')) {
        game.flags.put('pub.frozenSeen');
        void solo(async () => {
          await game.clock.wait(1.2);
          await say('t_frozen');
        });
      }
    }

    async function toNextReality(): Promise<void> {
      game.input.setEnabled(false);
      await game.tweenFx('fade', 1, 1.4);
      if ((await import('../registry.ts')).realityExists('r3')) {
        await game.gotoReality('r3');
      } else {
        await game.ui.showEndingText(['Pokračovanie nabudúce.', 'Ďakujem, že si si dal ešte jedno.'], 3500);
        await game.titleScreen();
      }
    }

    // ───────── reality 2: the frozen pub ─────────
    const watchers: Watcher[] = [];
    const makeWatcher = (id: string, obj: Object3D | null) => {
      if (!obj) return null;
      const w = new Watcher(id);
      w.place(obj.position.x, 0, obj.position.z, obj.rotation.y);
      w.home.copy(w.pos);
      w.canBeSeen = () => !s.lightsOff;
      w.headHeight = 1.0;
      w.speed = game.settings.difficulty === 'story' ? 1.3 : 2.2;
      game.entities.push(w);
      watchers.push(w);
      return w;
    };
    const wJano = makeWatcher('jano', pub.jano);
    const wFero = makeWatcher('fero', pub.fero);

    // TV ceiling camera (shows a figure that only exists for this camera)
    const rt = scope.add(new WebGLRenderTarget(256, 192));
    const tvCam = new PerspectiveCamera(70, 256 / 192, 0.1, 30);
    tvCam.position.set(1.2, 2.9, 1.0);
    tvCam.layers.enable(TV_LAYER);
    pub.tvFigure.traverse((o) => o.layers.set(TV_LAYER));
    let tvRtAt = 0;
    // the feed redraws the whole pub: 12 times a second, 6 on the low preset
    const tvInterval = game.renderer.profile.tier === 'low' ? 1 / 6 : 1 / 12;

    function swapToFrozen(): void {
      if (s.swapped) return;
      s.swapped = true;
      // the frozen pub has its own mat, on the bar
      placeBeerMat(game, scope, 'r2', new Vector3(-4.9, 1.6, -2.9));
      s.phase = 'r2';
      game.flags.put('pub.r2');
      music.stop();
      stoppers.splice(0).forEach((f) => f());
      if (pub.ezo) pub.ezo.frozen = false;
      if (pub.vierka) {
        pub.vierka.frozen = true;
      }
      pub.beerStream.visible = true;
      pub.clock.handsVisible = false;
      pub.tvFigure.visible = true;
      for (const w of watchers) w.awake = false;
      for (const l of pub.lampLights) l.color.setHex(0xcfe0ff);
      for (const l of pub.streetLights) l.intensity = 0;
      pub.neon.mesh.visible = false;
      pub.windowFigure.visible = false;
      stoppers.push(game.synth.hum(0.05));
      stoppers.push(
        game.synth.loopNoise({ kind: 'white', type: 'bandpass', freq: 7200, q: 8, volume: 0.012 }),
      );
      game.grade = { ...game.grade, saturation: 0.55, tint: [0.92, 0.97, 1.05], gain: [0.95, 1.0, 1.06] };
      game.saveCheckpoint('frozen');
    }

    async function r2Talk(): Promise<void> {
      if (s.r2Talked || s.r2Waiting) return;
      // he finishes the sentence he is in first: it must not swallow the explanation
      s.r2Waiting = true;
      try {
        await game.clock.until(() => !s.busy);
      } catch (e) {
        if (!(e instanceof Cancelled)) console.error(e);
        return;
      } finally {
        s.r2Waiting = false;
      }
      if (!s.seated || s.r2Talked) return;
      await solo(async () => {
        await say('e_r2_2');
        await say('e_r2_3');
        await say('e_r2_4');
        await say('e_r2_5');
        s.r2Talked = true;
        game.flags.put('pub.r2talk');
        for (const w of watchers) w.awake = true;
        s.flickerAt = game.clock.time + 5;
        game.saveCheckpoint('frozen');
      });
    }

    // ───────── ambience (reality 1) ─────────
    const startAmbience = () => {
      stoppers.push(
        game.synth.loopNoise({
          kind: 'brown',
          type: 'bandpass',
          freq: 420,
          q: 0.7,
          volume: 0.05,
          ampLfoRate: 0.37,
          ampLfoDepth: 0.5,
          lfoRate: 0.11,
          lfoDepth: 160,
        }),
      );
      stoppers.push(game.synth.hum(0.012, new Vector3(-2.2, 2.5, -4.1)));
      stoppers.push(
        game.synth.loopNoise({
          kind: 'white',
          type: 'bandpass',
          freq: 1800,
          q: 1.2,
          volume: 0.02,
          pos: new Vector3(1.9, 2.4, -4.0),
          ampLfoRate: 0.5,
          ampLfoDepth: 0.8,
        }),
      );
    };

    // ───────── checkpoints & start ─────────
    const instance: RealityInstance = {
      defaultCheckpoint: 'table',
      checkpoints: {
        table: { pos: pub.playerSeat.pos.clone(), yaw: pub.playerSeat.yaw, pitch: -0.12 },
        frozen: { pos: new Vector3(-7.3, 0, -1.6), yaw: -Math.PI / 2 },
      },
      start(cp) {
        // Ežo's beer mats (collectibles): one on the round table by the dartboard
        placeBeerMat(game, scope, 'r1', new Vector3(2.75, 1.6, -0.45));
        if (cp === 'frozen') {
          s.inWc = true;
          swapToFrozen();
          pub.wcDoor.close();
          s.wakeWhenOut = s.r2Talked;
          return;
        }
        startAmbience();
        sitDown();
        void (async () => {
          s.busy = true;
          try {
            if (!game.flags.has('pub.intro')) {
              // the first beer of the evening: you arrive almost sober
              game.status.intox.set(Math.max(game.status.intox.bac, 0.3));
              game.inventory.add('pivo', 1);
              game.inventory.select(0);
              await game.clock.wait(1.6);
              await say('e_intro1');
              pub.ezo?.laugh();
              await say('e_intro2');
              await say('e_intro3');
              game.synth.clink(new Vector3(3.0, 1.0, 3.2), 1);
              pub.ezo?.startDrink();
              s.ezoDrinkT = 2.4;
              game.ui.toast(
                game.touch ? 'Ťukni na „Piť"' : 'Stlač Q (alebo pravé tlačidlo myši) a napi sa',
                4500,
              );
              await game.clock.until(() => game.inventory.count('pivo') === 0, 25);
              await game.clock.wait(1.0);
              await say('e_intro4');
              await say('e_order1');
              await say('e_order2');
              game.flags.put('pub.intro');
              game.ui.toast(game.touch ? 'Pohni sa a vstaneš' : 'Vstaneš pohybom (WASD)', 4000);
              s.lastRoundAt = game.clock.time;
            }
          } catch (e) {
            if (!(e instanceof Cancelled)) console.error(e);
          } finally {
            s.busy = false;
          }
        })();
      },

      tick(dt) {
        pub.frontDoor.step(dt);
        pub.wcDoor.step(dt);
        pub.stallDoor.step(dt);
        if (s.ezoDrinkT > 0) {
          s.ezoDrinkT -= dt;
          if (s.ezoDrinkT <= 0) pub.ezo?.stopDrink();
        }
        if (s.slotSpin > 0) s.slotSpin -= dt;
        const p = game.player.pos;
        const bac = game.status.intox.bac;

        if (s.phase === 'r1') {
          // Ežo orders more rounds now and then
          if (
            game.flags.has('pub.intro') &&
            !roundItem &&
            !s.busy &&
            game.clock.time - s.lastRoundAt > 100 &&
            s.rounds >= 1
          ) {
            s.lastRoundAt = game.clock.time;
            const item = game.rng.pick<ItemId>(['borovicka', 'slivovica', 'pivo', 'borovicka']);
            void solo(async () => {
              await say('e_another');
              await say('v_round');
              game.inventory.add(item, 2);
              roundItem = item;
              s.tallies++;
              pub.ourMat.draw(s.tallies);
              game.ui.toast(`${ITEMS[item].name} ×2 — Vierka to dala na pult`);
            });
          }
          // hints that grow with alcohol and time
          pub.clock.wrong = bac > 0.8;
          pub.tv.glitch = bac > 1.0 && game.rng.chance(dt * 0.25) ? 1 : 0;
          if (!s.figureShown && s.rounds >= 2) {
            s.figureShown = true;
            pub.windowFigure.visible = true;
          }
          // glyph over the WC door
          const elapsed = game.playSeconds;
          if (
            !s.glyphShown &&
            ((s.rounds >= 2 && bac >= BAC_DRUNK) || (s.rounds >= 1 && elapsed > 14 * 60))
          ) {
            s.glyphShown = true;
            game.flags.put('pub.glyph');
            void solo(async () => {
              await game.clock.wait(1.5);
              await say('e_see');
              await say('e_see2');
            });
          }
          // outside: leaving the square
          s.outside = p.z > 4.7;
          if (s.outside && pub.windowFigure.visible && p.z > 7) pub.windowFigure.visible = false;
          if (p.z > 26 || p.x > 22 || p.x < -24) {
            if (bac < 0.5 && !game.flags.has('pub.glyph')) void homeEnding();
            else {
              game.player.teleport(new Vector3(-4.2, 0, 6.2), Math.PI);
              game.rig.setOrientation(0, 0);
              void solo(() => say('t_loop'));
            }
          }
          // the WC sequence
          const inWc = p.x < -6.15 && p.z < 0.2 && p.z > -3.2;
          if (inWc && !s.inWc) {
            s.inWc = true;
            if (s.glyphShown && s.wcScene === 0) {
              s.wcScene = 1;
              void (async () => {
                await game.clock.wait(1.2);
                pub.wcDoor.close();
                for (let i = 0; i < 3; i++) {
                  game.synth.click(new Vector3(-8.4, 1.2, -0.1), 160, 0.5);
                  await game.clock.wait(0.45);
                }
                await solo(() => say('t_knock'));
              })();
            }
          } else if (!inWc && s.inWc) s.inWc = false;
          if (s.wcScene >= 1 && !s.swapped && s.inWc && !pub.wcDoor.isOpen && !pub.wcDoor.moving) {
            s.wcTimer += dt;
            if (s.wcScene === 2 || s.wcTimer > 12) swapToFrozen();
          }
          // patrons turn to face you after you order (one subliminal moment)
          if (s.faceTurn === 1) {
            const yaw = game.player.yaw;
            const dy = Math.abs(Math.atan2(Math.sin(yaw - s.lastYaw), Math.cos(yaw - s.lastYaw)));
            if (dy > 2.4 && game.clock.time - s.lastYawT < 0.8) {
              s.faceTurn = 2;
              for (const o of [pub.jano, pub.fero]) {
                if (!o) continue;
                const keep = o.rotation.y;
                o.rotation.y = Math.atan2(p.x - o.position.x, p.z - o.position.z);
                setTimeout(() => (o.rotation.y = keep), 650);
              }
            }
            if (game.clock.time - s.lastYawT > 0.3) {
              s.lastYaw = yaw;
              s.lastYawT = game.clock.time;
            }
          }
        } else {
          // reality 2
          if (!s.r2Talked && !s.busy && !s.seated) {
            const d = p.distanceTo(pub.ezoSeat);
            if (d < 2.2) void solo(() => say('e_r2_1'));
            else if (game.rng.chance(dt * 0.25)) void solo(() => say('e_loop'));
          }
          if (s.wakeWhenOut && !(p.x < -6.15 && p.z < 0.2 && p.z > -3.2)) {
            s.wakeWhenOut = false;
            s.wakeAt = game.clock.time + 1.5;
          }
          if (s.wakeAt > 0 && game.clock.time >= s.wakeAt) {
            s.wakeAt = 0;
            for (const w of watchers) w.awake = true;
            s.flickerAt = game.clock.time + 5;
          }
          if (s.r2Talked && game.clock.time > s.flickerAt) {
            s.lightsOff = !s.lightsOff;
            s.flickerAt =
              game.clock.time + (s.lightsOff ? 0.35 + game.rng.next() * 0.25 : 5 + game.rng.next() * 6);
            if (s.lightsOff) game.synth.click(undefined, 120, 0.25);
          }
        }
      },

      frame(dt, _alpha, t) {
        pub.tv.update(t);
        const tvOn = s.phase === 'r1';
        pub.tvLight.intensity = tvOn ? 0.4 + pub.tv.light * 0.6 : 0.5;
        if (pub.clock.update(t, () => game.rng.next()) && pub.clock.wrong && pub.clock.backTicks > 0) {
          /* tick sound handled by ambience */
        }
        eyeVec.copy(cam.position);
        if (pub.ezo) {
          pub.ezo.lookTarget = eyeVec;
          pub.ezo.update(dt, t);
        }
        if (pub.vierka && !pub.vierka.frozen) {
          pub.vierka.lookTarget = game.player.pos.distanceTo(pub.vierkaSpot) < 6 ? eyeVec : null;
          pub.vierka.update(dt, t);
        }
        // glyph fade
        s.glyph +=
          ((s.glyphShown && (game.status.layerVisionActive || s.phase === 'r2') ? 1 : 0) - s.glyph) *
          Math.min(1, dt * 1.5);
        (pub.glyph.material as MeshBasicMaterial).opacity = s.glyph * (0.75 + 0.25 * Math.sin(t * 2.3));
        // slot machine reels
        if (s.slotSpin > 0) drawSlot(pub.slot, s.slotReels, t);
        if (s.jukebox >= 0) drawJukebox(pub.jukebox, s.jukebox, t);
        // lamps flicker in the frozen pub
        const off = s.lightsOff;
        for (const l of pub.lampLights) l.intensity = off ? 0 : s.phase === 'r2' ? 1.6 : 3.0;
        for (const m of pub.lampMeshes) m.visible = !off;
        pub.barLight.intensity = off ? 0 : s.phase === 'r2' ? 1.8 : 3.2;
        // entities: watchers move the regulars' meshes
        if (wJano && pub.jano) {
          pub.jano.position.set(wJano.pos.x, 0, wJano.pos.z);
          if (s.phase === 'r2' && wJano.state !== 'frozen')
            pub.jano.rotation.y = Math.atan2(
              game.player.pos.x - wJano.pos.x,
              game.player.pos.z - wJano.pos.z,
            );
        }
        if (wFero && pub.fero) {
          pub.fero.position.set(wFero.pos.x, 0, wFero.pos.z);
          if (s.phase === 'r2' && wFero.state !== 'frozen')
            pub.fero.rotation.y = Math.atan2(
              game.player.pos.x - wFero.pos.x,
              game.player.pos.z - wFero.pos.z,
            );
        }
        // TV shows the ceiling camera in the frozen pub
        if (s.phase === 'r2' && t - tvRtAt > tvInterval) {
          tvRtAt = t;
          const r = game.renderer.renderer;
          tvCam.lookAt(game.player.pos.x, 1.0, game.player.pos.z);
          pub.tvFigure.position
            .copy(game.player.pos)
            .add(new Vector3(Math.sin(game.player.yaw) * 0.9, 0, Math.cos(game.player.yaw) * 0.9));
          pub.tvFigure.lookAt(game.player.pos.x, 0, game.player.pos.z);
          const prev = r.getRenderTarget();
          r.setRenderTarget(rt);
          r.render(scene, tvCam);
          r.setRenderTarget(prev);
          pub.tv.override = rt.texture;
        }
      },

      visibility: () => (s.lightsOff ? 0.2 : 0.8),
      darkness: () => (s.phase === 'r2' ? (s.lightsOff ? 0.9 : 0.25) : s.outside ? 0.35 : 0),
      threat: () => {
        if (s.phase !== 'r2') return 0;
        let th = 0.15;
        for (const w of watchers) th = Math.max(th, clamp(1 - w.pos.distanceTo(game.player.pos) / 7, 0, 1));
        return th;
      },
    };

    async function homeEnding(): Promise<void> {
      if (game.flags.has('pub.home')) return;
      game.flags.put('pub.home');
      game.input.setEnabled(false);
      for (const l of pub.streetLights) {
        l.intensity = 0;
        game.synth.click(l.position, 90, 0.2);
        await game.clock.wait(0.5);
      }
      await game.tweenFx('fade', 1, 3);
      await game.ui.showEndingText(['Išiel si domov.', 'Ežo na teba čakal.'], 4000);
      await game.ui.showCredits(CREDITS);
      await game.titleScreen();
    }

    return instance;
  },
};

export default reality;

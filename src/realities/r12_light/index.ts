import { Vector3 } from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import { loadVoiceIndex, voiceUrl } from '../../narrative/voice.ts';
import { CREDITS } from '../../narrative/credits.ts';
import { Cancelled } from '../../sim/narrative/ScriptRunner.ts';
import { MusicBox, TUNES } from '../../audio/procedural/musicbox.ts';
import { buildPub } from '../r01_pub/build.ts';
import { FILM_SECONDS, makeCinematic } from './cinematic.ts';
import { L12 } from './lines.ts';
import { placeBeerMat } from '../../world/objects/beermats.ts';

type Phase = 'film' | 'walk' | 'inside' | 'seated' | 'end';

/**
 * The epilogue of the true ending. After the last clink: light, and the light becomes the hot
 * beginning of the next aeon — plasma, stars, a galaxy, the Sun, the Earth, a small town in early
 * autumn. You walk into the pub; Vierka asks what you will have; Ežo waves: one more?
 */
const reality: RealityModule = {
  id: 'r12',
  index: 12,
  title: 'Svetlo',
  async create(ctx) {
    const { game, scene, scope } = ctx;
    const pub = await buildPub(ctx, { outdoor: true });
    await loadVoiceIndex();
    game.nav = pub.nav;
    const say = async (id: string) => {
      const l = L12[id]!;
      const who = l.who === 'Ežo' ? pub.ezo : l.who === 'Vierka' ? pub.vierka : null;
      who?.setTalking(true);
      if (l.laugh) who?.laugh();
      try {
        await game.say(l.who, l.text, voiceUrl(id), l.min);
      } finally {
        who?.setTalking(false);
      }
    };
    // nothing wrong in this evening any more
    pub.windowFigure.visible = false;
    pub.tvFigure.visible = false;
    pub.glyph.visible = false;
    pub.ourMat.draw(0);
    const music = new MusicBox(game.audio);
    scope.onDispose(() => music.stop());
    const film = makeCinematic(scope);
    scene.add(film.mesh);

    const st = { phase: 'film' as Phase, t: 0, seated: false };
    const onErr = (e: unknown) => {
      if (!(e instanceof Cancelled)) console.error(e);
    };
    const stoppers: Array<() => void> = [];
    scope.onDispose(() => stoppers.forEach((f) => f()));

    const I = game.interactions;
    I.add({
      id: 'frontDoor',
      pos: new Vector3(-4.2, 1.05, 4.5),
      radius: 0.45,
      prompt: () => (pub.frontDoor.isOpen ? 'Zavrieť' : 'Otvoriť'),
      enabled: () => st.phase === 'walk' || st.phase === 'inside',
      onUse: () => {
        if (pub.frontDoor.isOpen) pub.frontDoor.close();
        else pub.frontDoor.open(95);
      },
    });
    I.add({
      id: 'seat',
      pos: new Vector3(3.0, 0.6, 2.5),
      radius: 0.35,
      prompt: 'Sadnúť si',
      enabled: () => st.phase === 'inside',
      onUse: () => void sit().catch(onErr),
    });

    const sit = async () => {
      st.phase = 'seated';
      game.seated = true;
      game.seatedWithDrink = true;
      game.player.teleport(pub.playerSeat.pos, game.player.yaw);
      game.player.forcedHeight = 1.28;
      game.rig.setOrientation(pub.playerSeat.yaw, -0.12);
      game.player.frozen = true;
      await game.clock.wait(1);
      // one more
      pub.ezo?.startDrink();
      await game.clock.wait(0.8);
      game.synth.clink(pub.ezoMug.getWorldPosition(new Vector3()), 1);
      await game.clock.wait(1.4);
      pub.ezo?.stopDrink();
      st.phase = 'end';
      game.input.setEnabled(false);
      await game.tweenFx('fade', 1, 2.5);
      stoppers.forEach((f) => f());
      stoppers.length = 0;
      music.play(TUNES.esteJedno!, undefined, 0.4);
      await game.ui.showEndingText(['EŠTE JEDNO'], 5000);
      await game.ui.showCredits(CREDITS);
      music.stop();
      // after the credits: a fresh beer mat, one tally on it
      pub.ourMat.draw(1);
      game.rig.lockTarget = { yaw: Math.PI, pitch: -0.55 };
      await game.tweenFx('fade', 0, 2);
      await game.clock.wait(5);
      await game.tweenFx('fade', 1, 2);
      game.rig.lockTarget = null;
      await game.titleScreen();
    };

    return {
      defaultCheckpoint: 'town',
      checkpoints: {
        // on the square, facing the pub's door (after the film; 'square' starts there without it)
        town: { pos: new Vector3(-4.2, 0, 9.5), yaw: 0, pitch: 0.12 },
        square: { pos: new Vector3(-4.2, 0, 9.5), yaw: 0, pitch: 0.12 },
      },
      start(cp) {
        placeBeerMat(game, scope, 'r12', new Vector3(5.7, 2.0, 0.95));
        game.fx.white = 0;
        const town = async () => {
          stoppers.forEach((f) => f());
          stoppers.length = 0;
          // the town: the square at night, a lamp, the pub's warm windows
          stoppers.push(
            game.synth.loopNoise({ kind: 'white', type: 'bandpass', freq: 650, q: 0.4, volume: 0.02 }),
          );
          music.play(TUNES.esteJedno!, new Vector3(5.4, 1, 0.8), 0.25);
          st.phase = 'walk';
          game.player.frozen = false;
          await game.clock.wait(1.5);
          await say('t_town');
          await game.clock.wait(0.6);
          await say('t_sign');
        };
        if (cp === 'square') {
          st.t = FILM_SECONDS;
          void town().catch(onErr);
          return;
        }
        game.player.frozen = true;
        // the film's sound: a long swell, a ring at the first light
        stoppers.push(game.synth.drone({ freqs: [55, 82.5, 110], cutoff: 900, volume: 0.04 }));
        void (async () => {
          await game.clock.wait(11.8);
          game.synth.chime(undefined, [1760, 2637], 0.2);
          await game.clock.wait(FILM_SECONDS - 11.8);
          await town();
        })().catch(onErr);
      },
      tick(dt) {
        st.t += dt;
        pub.frontDoor.step(dt);
        pub.wcDoor.step(dt);
        const p = game.player.pos;
        if (st.phase === 'walk' && p.z < 4.1 && p.z > -4.4 && Math.abs(p.x) < 6) {
          st.phase = 'inside';
          void (async () => {
            await game.clock.wait(0.6);
            await say('v12_1');
            await game.clock.wait(0.8);
            await say('e12_1');
          })().catch(onErr);
        }
      },
      frame(frameDt, _alpha, t) {
        const cam = game.renderer.camera;
        film.update(st.t, cam.aspect);
        pub.tv.update(t);
        pub.clock.update(t, () => game.rng.next());
        for (const ch of [pub.ezo, pub.vierka]) {
          if (!ch) continue;
          ch.lookTarget = st.phase === 'inside' || st.phase === 'seated' ? cam.position : null;
          ch.update(frameDt, t);
        }
      },
      darkness: () => 0,
      visibility: () => 0.8,
      threat: () => 0,
    };
  },
};

export default reality;

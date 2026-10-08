import {
  Color,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Scene,
  SphereGeometry,
  SpotLight,
  Vector3,
} from 'three';
import { GameLoop, SIM_DT } from '../core/loop.ts';
import { Rng, freshSeed } from '../core/rng.ts';
import { Scope } from '../core/scope.ts';
import { clamp, damp } from '../core/damp.ts';
import { comfort } from '../render/comfort.ts';
import { MusicBox, TUNES } from '../audio/procedural/musicbox.ts';
import { DEFAULT_BINDS, InputManager, type Bindable } from '../input/InputManager.ts';
import type { InputSnapshot } from '../input/actions.ts';
import { TouchControls } from '../input/touch/TouchControls.ts';
import { UI, keyName } from '../ui/UI.ts';
import { t } from '../i18n/sk.ts';
import { MAT_COUNT } from '../world/objects/beermats.ts';
import { AudioSystem } from '../audio/Audio.ts';
import { Synth } from '../audio/procedural/synth.ts';
import { AssetLoader } from '../assets/Loader.ts';
import { GameRenderer } from '../render/Renderer.ts';
import { CameraRig } from '../render/CameraRig.ts';
import { cheapenGlass, detectTier, type QualityTier } from '../render/quality.ts';
import { NEUTRAL_GRADE, type GradeParams } from '../render/post/GradeEffect.ts';
import { CollisionWorld, Layer } from '../sim/physics/CollisionWorld.ts';
import { PlayerController, type FootstepEvent } from '../sim/player/Controller.ts';
import { PlayerStatus, type StatusEvent } from '../sim/status/PlayerStatus.ts';
import { BAC_DRUNK, BAC_TIPSY, BAC_WASTED } from '../sim/status/Intoxication.ts';
import { Inventory } from '../sim/items/Inventory.ts';
import { ITEMS, type ItemId } from '../sim/items/items.data.ts';
import { Interactions } from '../sim/interaction/Interactions.ts';
import { Cancelled, ScriptClock, Flags, runScript } from '../sim/narrative/ScriptRunner.ts';
import type { Entity } from '../sim/ai/Entity.ts';
import type { AIContext, NoiseEvent, PlayerView } from '../sim/ai/types.ts';
import type { NavGrid } from '../sim/ai/nav/NavGrid.ts';
import { Builder } from '../world/kit/Builder.ts';
import { propDetail } from '../world/props.ts';
import { LightBudget } from '../world/lightBudget.ts';
import { MaterialLib } from '../world/materials.ts';
import type { RealityInstance, RealityModule } from '../world/Reality.ts';
import { REALITIES, REALITY_ORDER, realityExists } from '../realities/registry.ts';
import { loadSettings, saveSettings, type Settings } from '../save/Settings.ts';
import {
  clearSave,
  loadBook,
  loadSave,
  saveToSlot,
  setCurrentSave,
  writeSave,
  type SaveData,
} from '../save/SaveGame.ts';
import { wallClockMs } from '../core/time.ts';
import { Handheld } from '../world/objects/handheld.ts';
import { onScreen } from '../sim/ai/observe.ts';
import { LIGHTER_REACH, TORCH_HALF_ANGLE, torchReach } from '../sim/lightReach.ts';
import type { DebugOptions } from './debug.ts';

const _look = new Vector3();
const _eye = new Vector3();
const _to = new Vector3();
/** sessionStorage: when the page reloaded itself to go on with the game (see reloadInto). */
const RESUME_KEY = 'este-jedno.resume';
/** How long a line waits for its voice clip to download before it shows without it. */
const VOICE_WAIT_MS = 2500;

type Mode = 'boot' | 'title' | 'loading' | 'play' | 'okno' | 'ending';

interface Tween {
  key: keyof Game['fx'];
  from: number;
  to: number;
  dur: number;
  t: number;
  resolve: () => void;
}

/** Owns every system and runs the fixed-step simulation and the render loop. */
export class Game {
  readonly settings: Settings;
  readonly renderer: GameRenderer;
  readonly loop: GameLoop;
  readonly input = new InputManager();
  readonly ui: UI;
  touch: TouchControls | null = null;
  readonly audio = new AudioSystem();
  readonly synth: Synth;
  readonly loader: AssetLoader;
  rng: Rng;
  readonly world = new CollisionWorld();
  readonly player: PlayerController;
  readonly rig: CameraRig;
  readonly status = new PlayerStatus();
  readonly inventory = new Inventory();
  readonly interactions = new Interactions();
  readonly clock = new ScriptClock();
  readonly flags = new Flags();
  entities: Entity[] = [];
  nav: NavGrid | null = null;
  scene: Scene | null = null;
  private lightBudget: LightBudget | null = null;
  reality: RealityInstance | null = null;
  realityId = '';
  realityModule: RealityModule | null = null;
  checkpoint = '';
  mode: Mode = 'boot';
  /** Visual effect controls (scripts tween these on sim time). */
  readonly fx = { fade: 1, white: 0, shake: 0, frost: 0, warp: 0, vignette: 0, desat: 0 };
  grade: GradeParams = NEUTRAL_GRADE;
  /** Lighter / flashlight. */
  hasLight = false;
  lightOn = false;
  lightPower = 1;
  /** 0..1 how strongly the flashlight burns (a reality with batteries sets this). */
  torchLevel = 1;
  /** Player is sitting (camera lowered, movement locked until they stand up). */
  seated = false;
  seatedWithDrink = false;
  hiddenIn: PlayerView['hidden'] = null;
  hiddenWitnessed = false;
  /** Collected beer mats and tally count. */
  mats: string[] = [];
  tallies = 0;
  playSeconds = 0;
  renderTime = 0;
  readonly debug: DebugOptions;
  /** Hooks for the current reality (cleared on unload). */
  onFootstep: ((e: FootstepEvent) => void) | null = null;
  onAction: ((a: string) => boolean) | null = null;
  /** Called when the player tries to move while seated (stand up). */
  onMoveWhileSeated: (() => void) | null = null;
  /** Seated, and the movement input has been let go since: the next move stands you up. */
  private seatMoveArmed = false;

  private noises: NoiseEvent[] = [];
  private scope: Scope | null = null;
  private tweens: Tween[] = [];
  private drinkTimer = 0;
  private drinkDuration = 1;
  private drinkItem: ItemId | null = null;
  /** First-person glass or food shown while drinking or eating. */
  private readonly handheld = new Handheld();
  private skipRequested = false;
  private heartbeatTimer = 0;
  private lightObj: PointLight;
  /** The flashlight beam (only in realities that declare a torch: one more light in every shader). */
  private torchObj: SpotLight;
  private torchTarget = new Object3D();
  private torchInScene = false;
  private statsEl: HTMLElement | null = null;
  private appliedResolution: Settings['resolution'] | null = null;
  private statsTimer = 0;
  private frames = 0;
  private lastTier: QualityTier;
  private aiCtx: AIContext;
  private builder: Builder | null = null;
  private loadingBusy = false;
  private pauseOpen = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    debug: DebugOptions,
  ) {
    this.debug = debug;
    this.settings = loadSettings();
    this.rng = new Rng(debug.seed ?? freshSeed());
    const probe = canvas.getContext('webgl2');
    const tier: QualityTier =
      debug.quality ?? (this.settings.quality === 'auto' ? detectTier(probe) : this.settings.quality);
    this.lastTier = tier;
    this.renderer = new GameRenderer(canvas, tier);
    if (debug.test) this.renderer.dynamicRes = false;
    this.loader = new AssetLoader(this.renderer.renderer);
    this.ui = new UI(uiRoot);
    this.ui.releasePointer = () => this.input.exitPointerLock();
    this.synth = new Synth(this.audio, this.rng.fork(7));
    this.player = new PlayerController(this.world);
    this.rig = new CameraRig(this.renderer.camera, this.player);
    this.lightObj = new PointLight(0xffb060, 0, LIGHTER_REACH, 1.6);
    this.lightObj.castShadow = false;
    this.torchObj = new SpotLight(0xe6eeff, 0, torchReach(1), TORCH_HALF_ANGLE, 0.5, 1.4);
    this.torchObj.castShadow = false;
    this.torchObj.target = this.torchTarget;
    // what you drink or eat, held up to your face
    this.handheld.onBite = () => this.synth.click(undefined, 340, 0.18);
    this.renderer.camera.add(this.handheld.root);
    this.loop = new GameLoop({ step: (dt) => this.step(dt), render: (a, fdt) => this.render(a, fdt) });
    this.input.attach(canvas);
    this.input.onPointerLockLost = () => {
      if (this.mode === 'play' && !this.ui.modal && !this.ui.choosing) void this.openPause();
    };
    // leaving the tab or the window pauses the game (phones too, where there is no mouse lock)
    this.input.onHidden = () => {
      if (this.mode === 'play' && !this.ui.modal && !this.ui.choosing && !this.debug.test)
        void this.openPause();
    };
    const touchCapable = (navigator.maxTouchPoints ?? 0) > 0 && matchMedia('(pointer: coarse)').matches;
    if (touchCapable) {
      this.touch = new TouchControls(uiRoot, this.input);
      this.ui.touchMode = true;
      this.audio.setHrtf(false);
    }
    this.applySettings();
    window.addEventListener('resize', () => this.renderer.requestResize());
    this.aiCtx = this.makeAIContext();
    this.renderer.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      // the graphics driver reset (phones do this after a while in the background): keep what
      // was done since the last checkpoint and carry on after a reload
      if (this.mode === 'play' && this.realityModule)
        this.reloadInto(this.realityId, this.checkpoint, t('gpuReset'));
      else this.reloadInto(null, undefined, t('gpuReset'));
    });
  }

  // ───────────────────────────── settings ─────────────────────────────

  applySettings(): void {
    const s = this.settings;
    this.input.look.mouseSensitivity = 0.0022 * s.mouseSensitivity;
    this.input.look.touchSensitivity = 0.0045 * s.touchSensitivity;
    this.input.look.touchStickSpeed = 2.4 * s.touchSensitivity;
    this.touch?.setScheme(s.touchScheme);
    this.input.look.invertY = s.invertY;
    this.input.setBinds(s.keys);
    this.renderer.setFov(s.fov);
    this.audio.setVolume('master', s.master);
    this.audio.setVolume('music', s.music);
    this.audio.setVolume('voice', s.voice);
    this.audio.setVolume('sfx', s.sfx);
    this.audio.setVolume('ambience', s.sfx);
    this.ui.applySettings(s);
    comfort.reduceFlashes = s.reduceFlashes;
    this.setStats(s.showFps || !!this.debug.stats);
    // only when it changes: every other setting would otherwise restart the automatic scale
    if (!this.debug.test && s.resolution !== this.appliedResolution) {
      this.appliedResolution = s.resolution;
      this.renderer.setFixedScale(s.resolution === 'auto' ? null : Number(s.resolution));
    }
    if (!this.debug.quality) {
      const tier = s.quality === 'auto' ? this.lastTier : s.quality;
      if (tier !== this.renderer.profile.tier) {
        this.renderer.setProfile(tier);
        if (this.scene) this.renderer.setScene(this.scene);
        this.renderer.rebuild();
      }
    }
    saveSettings(s);
  }

  /** The frame rate overlay (settings: „Zobraziť FPS"; `#stats` adds position and state). */
  private setStats(on: boolean): void {
    if (on && !this.statsEl) {
      this.statsEl = document.createElement('div');
      this.statsEl.style.cssText =
        'position:fixed;left:max(8px,env(safe-area-inset-left));top:max(8px,env(safe-area-inset-top));font:12px monospace;color:#cfc;background:rgba(0,0,0,.45);padding:3px 6px;z-index:9;pointer-events:none;white-space:pre';
      document.body.append(this.statsEl);
      this.statsTimer = 0;
      this.frames = 0;
    } else if (!on && this.statsEl) {
      this.statsEl.remove();
      this.statsEl = null;
    }
  }

  openSettings = async (): Promise<void> => {
    await this.ui.showSettings(this.settings, () => this.applySettings());
  };

  /**
   * Reloads the page. With a `reality`, what was done since the last checkpoint is saved first
   * (pointing there) and the reloaded page goes straight on with it (see boot); with null it just
   * reloads to the title. A reload loop (the same failure again within a minute) stops at the
   * title instead.
   */
  private reloadInto(reality: string | null, checkpoint: string | undefined, message: string): void {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RESUME_KEY) ?? 0);
    } catch {
      /* no storage */
    }
    if (reality && wallClockMs() - last < 60_000) {
      sessionStorage.removeItem(RESUME_KEY);
      this.ui.toast(t('loadFailed'));
      void this.titleScreen();
      return;
    }
    if (reality) {
      if (!this.debug.test || this.debug.saves) writeSave(this.snapshot(reality, checkpoint ?? ''));
      try {
        sessionStorage.setItem(RESUME_KEY, String(wallClockMs()));
      } catch {
        /* private mode: the title it is */
      }
    }
    this.ui.toast(message);
    setTimeout(() => location.reload(), 900);
  }

  // ───────────────────────────── boot / menus ─────────────────────────────

  async boot(): Promise<void> {
    this.loop.manual = !!this.debug.test;
    if (this.debug.test) this.audio.muted = true;
    this.loop.start();
    // back from a reload for a new version (or a graphics reset): straight on with the saved game
    let resume = false;
    try {
      resume = wallClockMs() - Number(sessionStorage.getItem(RESUME_KEY) ?? 0) < 60_000;
    } catch {
      /* no storage */
    }
    const save = resume ? loadSave() : null;
    if (save && !this.debug.reality) {
      // the sound may only start with the first touch or key after a reload
      const wake = () => this.audio.unlock();
      window.addEventListener('pointerdown', wake, { once: true });
      window.addEventListener('keydown', wake, { once: true });
      this.audio.unlock();
      await this.loadGame(save);
      // a reload has no click to grab the mouse or start the sound with: the pause menu asks for it
      if (!this.touch && !this.debug.test) void this.openPause();
      setTimeout(() => sessionStorage.removeItem(RESUME_KEY), 60_000);
      return;
    }
    if (this.debug.quick && this.debug.reality && realityExists(this.debug.reality)) {
      if (!this.debug.test) await this.ui.waitForClick();
      this.audio.unlock();
      if (this.debug.bac) this.status.intox.set(this.debug.bac);
      await this.startReality(this.debug.reality, this.debug.checkpoint, true);
      return;
    }
    if (!this.settings.warned) {
      await this.ui.showWarning();
      this.settings.warned = true;
      saveSettings(this.settings);
    }
    this.audio.unlock();
    await this.titleScreen();
  }

  async titleScreen(): Promise<void> {
    // an ending comes here with its chapter still loaded (its sounds, its scene behind the menu)
    if (this.reality || this.scene) this.disposeReality();
    this.mode = 'title';
    // leaving a game from the pause menu must not leave the next one paused
    this.loop.paused = false;
    this.ui.setHudVisible(false);
    this.touch?.setVisible(false);
    this.input.exitPointerLock();
    const save = loadSave();
    // the theme, slowed down on a music box; a context still waiting for a gesture starts on the first one
    const wake = () => this.audio.unlock();
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    const theme = new MusicBox(this.audio);
    theme.play({ ...TUNES.esteJedno!, voice: 'musicbox', rate: 0.78 }, undefined, 0.2);
    let picked: SaveData | null = null;
    let choice: 'new' | 'continue' | 'load';
    for (;;) {
      const book = loadBook();
      const canLoad = book.history.length > 0 || book.slots.some(Boolean);
      choice = await this.ui.showTitle(!!save, this.openSettings, canLoad);
      if (choice === 'load') {
        picked = await this.ui.showSaves(loadBook(), 'load');
        if (!picked) continue;
      }
      if (
        choice === 'new' &&
        save &&
        !(await this.ui.confirm(t('newGameAsk'), t('newGameYes'), t('menuBack')))
      )
        continue;
      break;
    }
    this.goFullscreen();
    theme.stop();
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
    this.audio.unlock();
    if (picked) await this.loadGame(picked);
    else if (choice === 'continue' && save) await this.loadGame(save);
    else {
      clearSave();
      this.flags.load({});
      this.hasLight = false;
      this.lightOn = false;
      this.inventory.clear();
      this.status.reset(0);
      this.mats = [];
      this.tallies = 0;
      this.playSeconds = 0;
      await this.startReality(REALITY_ORDER[0]!, undefined, false);
    }
  }

  /** Continues a saved game (the current one or one picked from the list of saves). */
  private async loadGame(s: SaveData): Promise<void> {
    if (!this.debug.test || this.debug.saves) setCurrentSave(s);
    this.restoreSave(s);
    this.loop.paused = false;
    await this.startReality(s.reality, s.checkpoint, true);
  }

  private restoreSave(s: SaveData): void {
    this.flags.load(s.flags);
    // saves from before the lighter was remembered: Ežo gave it in the hall
    const light = this.flags.get('lighter') || (this.flags.has('hall.ezo') ? 1 : 0);
    this.hasLight = light > 0;
    this.lightPower = light || 1;
    this.lightOn = false;
    this.inventory.load(s.inventory);
    this.inventory.select(s.selected);
    this.status.reset(s.bac);
    this.mats = [...s.mats];
    this.tallies = s.tallies;
    this.playSeconds = s.playSeconds;
  }

  async openPause(): Promise<void> {
    // not over an ending, a document or a choice (each has its own way out; a pause on top of
    // them used to wipe them, or let you walk away from a question with the mouse captured)
    if (this.pauseOpen || this.mode !== 'play' || this.ui.modal || this.ui.choosing) return;
    this.pauseOpen = true;
    this.loop.paused = true;
    const wasEnabled = this.input.active;
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    const found = this.mats.length ? `${t('pauseMats')}: ${this.mats.length} / ${MAT_COUNT}` : undefined;
    let r: 'resume' | 'title' | 'save' | 'load';
    let picked: SaveData | null = null;
    let notice: string | undefined;
    for (;;) {
      r = await this.ui.showPause(this.openSettings, found, notice);
      notice = undefined;
      if (r === 'save') {
        const slot = await this.ui.showSaves(loadBook(), 'save');
        // said in the menu itself: a toast would sit under it
        if (slot !== null) notice = saveToSlot(slot) ? t('saveDone') : t('saveFailed');
        continue;
      }
      if (r === 'load') {
        picked = await this.ui.showSaves(loadBook(), 'load');
        if (!picked) continue;
      }
      break;
    }
    this.pauseOpen = false;
    if (r === 'title') {
      this.disposeReality();
      await this.titleScreen();
      return;
    }
    if (picked) {
      this.disposeReality();
      await this.loadGame(picked);
      return;
    }
    this.loop.paused = false;
    // the Esc or Enter pressed in the menu must not pause again or skip a line
    this.input.clearLatched();
    // a cutscene that had the controls off keeps them off
    this.input.setEnabled(wasEnabled);
    if (!wasEnabled) return;
    if (!this.touch) void this.input.requestPointerLock();
    else this.goFullscreen();
  }

  /**
   * Phones and tablets play full screen, held either way: no browser bars to grow and shrink the
   * picture. Needs a tap (call it from one); browsers that cannot do it are simply left alone.
   */
  private goFullscreen(): void {
    if (!this.touch || this.debug.test || document.fullscreenElement) return;
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: (o?: FullscreenOptions) => Promise<void> | void;
    };
    const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
    if (!request) return;
    try {
      void Promise.resolve(request({ navigationUI: 'hide' })).catch(() => undefined);
    } catch {
      /* not allowed here */
    }
  }

  // ───────────────────────────── realities ─────────────────────────────

  /** Loads a reality and spawns at a checkpoint (fade in, chapter title on first entry). */
  async startReality(id: string, checkpoint?: string, fromSave = false): Promise<void> {
    if (this.loadingBusy) return;
    this.loadingBusy = true;
    try {
      const target = realityExists(id) ? id : REALITY_ORDER[0]!;
      this.mode = 'loading';
      this.input.setEnabled(false);
      this.ui.setHudVisible(false);
      this.touch?.setVisible(false);
      const loading = this.ui.showLoading(this.rng.int(0, 5));
      this.disposeReality();
      let mod: RealityModule;
      try {
        mod = (await REALITIES[target]!()).default;
      } catch (e) {
        // a new version went online meanwhile and this page's chapter files are gone: save where
        // we were going and come back on the new version (see boot)
        console.error(e);
        this.reloadInto(target, checkpoint, t('updated'));
        return;
      }
      // phones: no model over 9000 triangles or with textures over 512 pixels
      const low = this.renderer.profile.tier === 'low';
      propDetail.maxTris = low ? 9000 : Infinity;
      propDetail.maxTexture = low ? 512 : Infinity;
      this.loader.setAnisotropy({ low: 2, med: 4, high: 8 }[this.renderer.profile.tier]);
      const scene = new Scene();
      scene.background = new Color(0x000000);
      const scope = new Scope();
      const builder = new Builder();
      const mats = new MaterialLib(
        this.loader,
        scope,
        this.renderer.profile.textures === 'half' ? '512' : '1k',
      );
      this.scope = scope;
      this.scene = scene;
      this.builder = builder;
      this.realityModule = mod;
      this.realityId = target;
      const inst = await mod.create({
        game: this,
        scene,
        scope,
        builder,
        mats,
        progress: (p) => loading.progress(p * 0.8),
      });
      const colliders = builder.finish();
      scene.add(builder.group);
      for (const [layer, g] of colliders) {
        this.world.addStatic(g, layer);
        scope.add(g);
      }
      scope.onDispose(() =>
        builder.group.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose()),
      );
      await Promise.race([Promise.allSettled(mats.pending), new Promise((r) => setTimeout(r, 15000))]);
      loading.progress(0.9);
      scene.add(this.lightObj);
      this.torchInScene = !!mod.torch;
      if (this.torchInScene) scene.add(this.torchObj, this.torchTarget);
      scene.add(this.renderer.camera);
      this.renderer.setScene(scene);
      if (this.renderer.profile.ao) this.renderer.rebuild();
      if (this.renderer.profile.tier === 'low') cheapenGlass(scene);
      // only the point lights that matter near the camera are real ones (see LightBudget)
      const lights = this.renderer.profile.maxPointLights;
      this.lightBudget = Number.isFinite(lights)
        ? new LightBudget(scene, lights, new Set([this.lightObj]))
        : null;
      try {
        await this.renderer.renderer.compileAsync(scene, this.renderer.camera);
      } catch {
        /* older drivers: compile lazily */
      }
      loading.progress(1);
      this.reality = inst;
      const cpId = checkpoint && inst.checkpoints[checkpoint] ? checkpoint : inst.defaultCheckpoint;
      this.checkpoint = cpId;
      const cp = inst.checkpoints[cpId]!;
      this.player.teleport(cp.pos, cp.yaw);
      this.rig.setOrientation(cp.yaw, cp.pitch ?? 0);
      this.player.noclip = !!this.debug.fly;
      this.fx.fade = 1;
      loading.close();
      this.mode = 'play';
      this.input.setEnabled(true);
      this.ui.setHudVisible(true);
      this.touch?.setVisible(true);
      if (!this.touch && !this.debug.test) {
        // finished loading while the player was in another tab or window: wait for them paused
        // instead of grabbing the mouse there
        if (document.visibilityState === 'visible' && document.hasFocus())
          void this.input.requestPointerLock();
        else queueMicrotask(() => void this.openPause());
      }
      this.saveCheckpoint(cpId);
      runScript(async () => inst.start(cpId));
      if (!fromSave && !this.debug.test) void this.ui.chapter(mod.title);
      void this.tweenFx('fade', 0, 1.6);
    } finally {
      this.loadingBusy = false;
    }
  }

  /** Called by realities to move on. */
  async gotoReality(id: string, checkpoint?: string): Promise<void> {
    this.leaving = true;
    try {
      this.input.setEnabled(false);
      await this.tweenFx('fade', 1, 1.2);
      if (!realityExists(id)) {
        // The next reality isn't built yet: end the preview instead of falling back to the pub.
        this.disposeReality();
        await this.ui.showEndingText([t('toBeContinued'), t('thanksForPlaying')], 3500);
        await this.titleScreen();
        return;
      }
      await this.startReality(id, checkpoint, false);
    } finally {
      this.leaving = false;
    }
  }

  /** On the way to the next chapter (gotoReality): no blackout can interrupt it. */
  private leaving = false;

  private disposeReality(): void {
    this.clock.cancelAll();
    this.reality?.dispose?.();
    this.reality = null;
    this.lightBudget = null;
    this.entities = [];
    this.nav = null;
    this.interactions.clear();
    this.world.clear();
    this.onFootstep = null;
    this.onAction = null;
    this.onMoveWhileSeated = null;
    this.onEon = null;
    this.onSignal = null;
    this.player.forcedHeight = null;
    this.tweens = [];
    this.respawnHold = null;
    this.ui.cancelChoice();
    this.lineId++;
    this.input.clearLatched();
    // nothing of the last chapter carries over: a drink on its way down, flashes, the echo
    this.drinkTimer = 0;
    this.drinkItem = null;
    this.handheld.hide();
    Object.assign(this.fx, { white: 0, shake: 0, frost: 0, warp: 0, vignette: 0, desat: 0 });
    this.audio.setReverb(1.6, 0.35);
    for (const pr of this.projectiles) pr.mesh.removeFromParent();
    this.projectiles = [];
    this.seated = false;
    this.seatedWithDrink = false;
    this.hiddenIn = null;
    this.rig.lockTarget = null;
    this.player.frozen = false;
    this.ui.subtitle(null, null);
    this.ui.setPrompt(null);
    if (this.scene) this.scene.remove(this.lightObj, this.torchObj, this.torchTarget, this.renderer.camera);
    this.torchInScene = false;
    this.torchLevel = 1;
    this.renderer.setScene(null);
    this.scope?.dispose();
    this.scope = null;
    this.scene = null;
    this.builder = null;
    this.grade = NEUTRAL_GRADE;
  }

  /**
   * Saves progress at once, threat or no threat near: a blackout never wakes you where you stood
   * but at the checkpoint's own spot, with every threat back where it starts (and holding still
   * until you move, see respawnHold). Holding saves back while a threat was near only lost what
   * the player had just done (solved valves, keys, eons).
   */
  saveCheckpoint(cp: string): void {
    this.checkpoint = cp;
    if (this.debug.test && !this.debug.saves) return;
    writeSave(this.snapshot(this.realityId, cp));
  }

  /** The save of the game as it stands (a drink still on its way down counts as not drunk). */
  private snapshot(reality: string, cp: string): SaveData {
    const inventory = this.inventory.toJSON();
    if (this.drinkItem && this.drinkTimer > 0) {
      const held = inventory.find((e) => e.item === this.drinkItem);
      if (held) held.count++;
      else inventory.push({ item: this.drinkItem, count: 1 });
    }
    return {
      v: 1,
      reality,
      checkpoint: cp,
      flags: this.flags.toJSON(),
      inventory,
      selected: this.inventory.selected,
      bac: Math.min(this.status.intox.bac, 1.8),
      mats: [...this.mats],
      tallies: this.tallies,
      playSeconds: this.playSeconds,
      savedAt: wallClockMs(),
      title: this.realityModule?.title,
    };
  }

  /** Keeps the collected beer mats in the save right away (they are lore; nothing else changes). */
  keepMats(): void {
    if (this.debug.test && !this.debug.saves) return;
    const s = loadSave();
    if (s) writeSave({ ...s, mats: [...this.mats] });
  }

  /** Blackout: fade, show „okno", reload the last checkpoint. */
  async okno(reason: string): Promise<void> {
    // not while leaving for the next chapter (its fade would be cut short and the okno hang)
    if (this.mode !== 'play' || this.debug.god || this.leaving) return;
    this.mode = 'okno';
    console.info('okno:', reason);
    this.input.setEnabled(false);
    this.synth.stinger(0.6);
    this.fx.shake = 0.6;
    // caught: you turn round and see what got you before it goes dark (not the drink's fault)
    const by = this.entities.find((e) => e.id === reason);
    if (by) {
      this.caught.set(this.realityId, this.caughtHere + 1);
      const p = this.player;
      const dx = by.pos.x - p.pos.x;
      const dz = by.pos.z - p.pos.z;
      const up = by.pos.y + 1.1 - (p.pos.y + p.eyeHeight());
      this.rig.lockTarget = {
        yaw: Math.atan2(-dx, -dz),
        pitch: clamp(Math.atan2(up, Math.hypot(dx, dz)), -0.6, 0.6),
        rate: 10,
      };
      await this.tweenFx('fade', 0.25, 0.75);
    }
    await this.tweenFx('fade', 1, 0.6);
    this.disposeReality();
    // what put you out: the drink, the cold, the water, or something that got you
    const why =
      reason === 'alcohol'
        ? 'oknoSub'
        : reason === 'cold'
          ? 'oknoCold'
          : reason === 'voda'
            ? 'oknoWater'
            : 'oknoCaught';
    await this.ui.showOkno(3.2, t(why));
    const save = loadSave();
    if (save) this.restoreSave(save);
    this.status.reset(Math.min(1, this.status.intox.bac));
    this.status.buffs.add('hangover', 60);
    this.lastOkno = reason;
    await this.startReality(save?.reality ?? this.realityId, save?.checkpoint ?? this.checkpoint, true);
    this.lastOkno = null;
    // after a blackout nothing moves until you step away from where you woke
    this.respawnHold = this.player.pos.clone();
  }

  /** While a reality restarts after an okno: what caused it (an entity id, 'alcohol', …). */
  lastOkno: string | null = null;
  /** Times a threat has caught you in each reality this session. */
  private readonly caught = new Map<string, number>();
  /** How often a threat caught you in this reality this session (realities may ease off). */
  get caughtHere(): number {
    return this.caught.get(this.realityId) ?? 0;
  }

  /** Where you woke after an okno: threats hold still until you are 1.5 m from it. */
  private respawnHold: Vector3 | null = null;

  // ───────────────────────────── scripting helpers ─────────────────────────────

  /** Tweens an fx value on sim time. */
  tweenFx(key: keyof Game['fx'], to: number, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.tweens = this.tweens.filter((tw) => {
        if (tw.key === key) {
          tw.resolve();
          return false;
        }
        return true;
      });
      if (seconds <= 0) {
        this.fx[key] = to;
        resolve();
        return;
      }
      this.tweens.push({ key, from: this.fx[key], to, dur: seconds, t: 0, resolve });
    });
  }

  /** Shows a subtitle line and waits (voice clip length or reading time). Skippable. */
  async say(
    who: string | null,
    text: string,
    voiceUrl?: string | readonly string[],
    minSeconds = 0,
  ): Promise<void> {
    // A newer line takes over the subtitle and ends this one early; only the current line clears it.
    const id = ++this.lineId;
    let seconds = Math.max(1.8, text.length / 14 + 0.7, minSeconds);
    let handle: { stop(f?: number): void } | null = null;
    if (voiceUrl && this.audio.ctx) {
      const gen = this.clock.gen;
      if (this.audio.ctx.state === 'suspended') void this.audio.ctx.resume();
      // a clip that is slow to download (a bad connection) is not waited for long: the line shows
      // without its voice and the story goes on (it plays next time, once it is in)
      const buf = await Promise.race([
        this.audio.loadFirst(typeof voiceUrl === 'string' ? [voiceUrl] : voiceUrl),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), VOICE_WAIT_MS)),
      ]);
      if (gen !== this.clock.gen) throw new Cancelled();
      if (id !== this.lineId) return;
      if (buf) {
        seconds = Math.max(minSeconds, buf.duration + 0.35);
        handle = this.audio.play(buf, { bus: 'voice', reverb: 0.15 });
      }
    }
    this.ui.subtitle(who, text);
    this.skipRequested = false;
    this.lineShownAt = this.clock.time;
    await this.clock.until(() => this.skipRequested || id !== this.lineId, seconds);
    if (this.skipRequested || id !== this.lineId) handle?.stop(0.15);
    if (id === this.lineId) this.ui.subtitle(null, null);
  }

  /** Increments with every line said (see `say`). */
  private lineId = 0;
  /** When the current line appeared: a click in its first moment (still meant for something else) does not skip it. */
  private lineShownAt = -Infinity;

  private requestSkip(): void {
    if (this.clock.time - this.lineShownAt > 0.4) this.skipRequested = true;
  }

  /**
   * A choice menu. Throws Cancelled if the chapter went away while it was open (a blackout, a
   * load): the script that asked must not go on in whatever runs next.
   */
  async choose(options: string[]): Promise<number> {
    const gen = this.clock.gen;
    const hadLock = this.input.pointerLocked;
    this.input.exitPointerLock();
    this.input.setEnabled(false);
    const i = await this.ui.choose(options);
    if (i < 0 || gen !== this.clock.gen) throw new Cancelled();
    this.input.clearLatched();
    this.input.setEnabled(true);
    if (hadLock && !this.touch) void this.input.requestPointerLock();
    return i;
  }

  async readDocument(title: string, body: string): Promise<void> {
    const gen = this.clock.gen;
    this.input.setEnabled(false);
    this.loop.paused = true;
    const hadLock = this.input.pointerLocked;
    this.input.exitPointerLock();
    await this.ui.showDocument(title, body);
    if (gen !== this.clock.gen) throw new Cancelled();
    this.loop.paused = false;
    // the Esc or E that closed it must not pause the game or press something right after
    this.input.clearLatched();
    this.input.setEnabled(true);
    if (hadLock && !this.touch) void this.input.requestPointerLock();
  }

  addNoise(n: NoiseEvent): void {
    this.noises.push(n);
  }

  giveLight(power = 1): void {
    this.hasLight = true;
    this.lightPower = power;
    // remembered in the save (the lighter stays in your pocket across realities)
    this.flags.put('lighter', power);
  }

  // ───────────────────────────── simulation ─────────────────────────────

  private step(dt: number): void {
    // tweens + script clock always run (cutscenes) unless loading
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]!;
      tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      const e = k * k * (3 - 2 * k);
      this.fx[tw.key] = tw.from + (tw.to - tw.from) * e;
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.resolve();
      }
    }
    this.fx.shake = damp(this.fx.shake, 0, 3, dt);
    if (this.mode !== 'play') {
      this.input.snapshot();
      return;
    }
    this.playSeconds += dt;
    const snap = this.input.snapshot();
    this.handleActions(snap);
    // moving gets you up from a seat (or out of a hiding place), but only a move made after you sat:
    // a key still held from running there must be let go first (it pulled you straight back out)
    const move = Math.max(Math.abs(snap.moveX), Math.abs(snap.moveY));
    if (!this.seated) this.seatMoveArmed = false;
    else if (move < 0.2) this.seatMoveArmed = true;
    else if (move > 0.4 && this.seatMoveArmed) this.onMoveWhileSeated?.();

    const st = this.status;
    const bac = st.intox.bac;
    // the walk only starts to wander once you are properly tipsy
    const drunk = st.buffs.has('steady') ? 0 : clamp((bac - 1.0) / 2, 0, 1);
    const t = this.clock.time;
    const sway = drunk * (Math.sin(t * 0.9) * 0.25 + Math.sin(t * 2.3 + 1) * 0.1);
    this.waterDepth = this.reality?.waterDepth?.(this.player.pos) ?? 0;
    const speedMul =
      (st.buffs.has('hangover') ? 0.85 : 1) *
      (st.cold.heat < 0.3 ? 0.6 + st.cold.heat : 1) *
      (this.waterDepth > 0.6 ? 0.55 : this.waterDepth > 0.15 ? 0.78 : 1) *
      (this.seated ? 0 : 1);
    const footstep = this.player.step(dt, snap, {
      speedMul,
      swayAngle: sway,
      canSprint: !st.fear.panicking || st.fear.value < 0.95,
    });
    // fell out of the world through a gap: back where the chapter last saved you
    if (this.mode === 'play' && this.player.pos.y < -20 && !this.player.noclip) {
      const cp = this.reality?.checkpoints[this.checkpoint];
      if (cp) {
        this.player.teleport(cp.pos, cp.yaw);
        this.rig.setOrientation(cp.yaw, cp.pitch ?? 0);
      }
    }
    if (this.builder) {
      _eye.copy(this.player.pos).setY(this.player.pos.y + 0.05);
      const surf = this.builder.surfaceAt(_eye);
      if (surf) this.player.surface = surf;
    }
    if (this.waterDepth > 0.08) this.player.surface = 'water';
    if (footstep) {
      this.addNoise({
        x: footstep.position.x,
        y: footstep.position.y,
        z: footstep.position.z,
        loudness: footstep.loudness,
        kind: footstep.surface === 'water' ? 'splash' : 'step',
      });
      this.synth.footstep(footstep.surface, footstep.loudness, footstep.position);
      this.onFootstep?.(footstep);
    }
    if (st.fear.panicking && this.rng.chance(dt * 0.8)) {
      const p = this.player.pos;
      this.addNoise({ x: p.x, y: p.y + 1.5, z: p.z, loudness: 0.5, kind: 'panic' });
      // you hear yourself gasp: whatever listens hears it too
      this.synth.hiss(undefined, 0.3, 0.05);
    }

    this.stepProjectiles(dt);
    // drinking animation timer
    if (this.drinkTimer > 0) {
      this.drinkTimer -= dt;
      if (this.drinkTimer <= 0 && this.drinkItem) this.finishDrink(this.drinkItem);
    }

    // entities
    this.updatePlayerView();
    const ctx = this.aiCtx;
    ctx.time = this.clock.time;
    ctx.dt = dt;
    ctx.noises = this.noises;
    const hold = this.respawnHold;
    if (hold && Math.hypot(this.player.pos.x - hold.x, this.player.pos.z - hold.z) >= 1.5)
      this.respawnHold = null;
    if (!this.respawnHold) for (const e of this.entities) e.tick(dt, ctx);
    this.noises = [];

    // status
    const r = this.reality;
    const env = {
      threat: r?.threat ? r.threat() : this.defaultThreat(),
      darkness: (r?.darkness?.() ?? 0) * (this.lightOn ? 0.4 : 1),
      coldExposure: r?.coldExposure?.() ?? 0,
      warmth: r?.warmth?.() ?? 0,
    };
    const events = st.step(dt, env);
    this.handleStatusEvents(events);
    // a lighter's flame blows out when you run (a torch does not)
    if (
      this.hasLight &&
      this.lightOn &&
      this.lightPower <= 1 &&
      this.player.sprinting &&
      this.rng.chance(dt * 0.6)
    ) {
      this.lightOn = false;
      this.synth.click(undefined, 260, 0.1);
      if (!this.flags.has('hint.lighterOut')) {
        this.flags.put('hint.lighterOut');
        this.ui.toast(this.lighterOutHint());
      }
    }

    // reality + interactions + scripts
    r?.tick?.(dt);
    this.lookDir(_look);
    _eye.copy(this.player.pos).setY(this.player.pos.y + this.player.eyeHeight());
    this.interactions.update(_eye, _look, this.world, this.world.activeMask);
    this.clock.step(dt);

    // heartbeat when afraid
    if (st.fear.value > 0.45) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.synth.heartbeat(clamp((st.fear.value - 0.4) * 1.6, 0, 1));
        this.heartbeatTimer = 1.15 - st.fear.value * 0.55;
      }
    }
  }

  private handleActions(snap: InputSnapshot): void {
    for (const a of snap.pressed) {
      if (this.onAction?.(a)) continue;
      switch (a) {
        case 'pause':
          void this.openPause();
          break;
        case 'skip':
          this.requestSkip();
          break;
        case 'interact':
          if (!this.interactions.use()) this.requestSkip();
          break;
        case 'drink':
          this.startDrink();
          break;
        case 'throw':
          this.throwBottle();
          break;
        case 'light':
          if (this.hasLight) {
            this.lightOn = !this.lightOn;
            this.synth.click(undefined, this.lightOn ? 900 : 600, 0.12);
          }
          break;
        case 'slotPrev':
          this.inventory.cycle(-1);
          break;
        case 'slotNext':
          this.inventory.cycle(1);
          break;
        default:
          if (a.startsWith('slot')) this.inventory.select(Number(a.slice(4)) - 1);
      }
    }
  }

  private lighterOutHint(): string {
    if (this.touch) return t('lighterOut');
    return `${t('lighterOut')} (${this.keyLabel('light')})`;
  }

  /** The key an action is bound to, as the player knows it (for hints: „klávesom Q"). */
  keyLabel(action: Bindable): string {
    return keyName(this.settings.keys[action] ?? DEFAULT_BINDS[action]);
  }

  /** Water depth at the player's feet (0 on dry ground), from the reality. */
  private waterDepth = 0;

  /** Thrown objects in flight (sim). */
  private projectiles: Array<{ pos: Vector3; vel: Vector3; life: number; item: ItemId; mesh: Object3D }> = [];

  /** Throws the selected throwable, or the first one in the inventory. */
  private throwBottle(): void {
    const sel = this.inventory.slots[this.inventory.selected]?.item;
    const item =
      sel && ITEMS[sel].kind === 'throw'
        ? sel
        : this.inventory.slots.find((sl) => sl.item && ITEMS[sl.item].kind === 'throw')?.item;
    if (!item) {
      this.ui.toast('Nemáš čo hodiť.');
      return;
    }
    this.inventory.take(item);
    const dir = this.lookDir(new Vector3());
    const p = this.player.pos
      .clone()
      .setY(this.player.pos.y + this.player.eyeHeight() - 0.1)
      .addScaledVector(dir, 0.4);
    const mesh = new Mesh(this.thrownGeo, item === 'kacka' ? this.duckMat : this.bottleMat);
    mesh.scale.set(1, item === 'kacka' ? 1 : 2.2, 1);
    mesh.position.copy(p);
    this.scene?.add(mesh);
    this.projectiles.push({
      pos: p,
      vel: dir.multiplyScalar(11).add(new Vector3(0, 2.2, 0)),
      life: 4,
      item,
      mesh,
    });
    this.synth.click(undefined, 500, 0.08);
  }

  private readonly thrownGeo = new SphereGeometry(0.06, 8, 6);
  private readonly bottleMat = new MeshStandardMaterial({ color: 0x2f5d2a, roughness: 0.2 });
  private readonly duckMat = new MeshStandardMaterial({ color: 0xf2c21a, roughness: 0.5 });

  private stepProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i]!;
      pr.life -= dt;
      pr.vel.y -= 18 * dt;
      const step = pr.vel.length() * dt;
      const dir = pr.vel.clone().normalize();
      const hit = this.world.raycast(pr.pos, dir, step + 0.05);
      // lands in water before it hits anything solid?
      const surf = this.reality?.waterSurface?.(pr.pos.x, pr.pos.z);
      const inWater = surf !== undefined && surf !== null && pr.pos.y + pr.vel.y * dt <= surf;
      if (hit !== Infinity || pr.life <= 0 || inWater) {
        if (inWater) pr.pos.y = surf;
        else if (hit !== Infinity) pr.pos.addScaledVector(dir, hit);
        pr.mesh.removeFromParent();
        this.projectiles.splice(i, 1);
        if (this.reality?.onImpact?.(pr.pos, pr.item, inWater)) continue;
        if (inWater) {
          this.addNoise({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z, loudness: 1.6, kind: 'splash' });
          this.synth.splash(pr.pos, 0.8);
        } else if (pr.item === 'kacka') {
          this.addNoise({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z, loudness: 1.6, kind: 'throw' });
          this.synth.squeak(pr.pos);
        } else {
          this.addNoise({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z, loudness: 2.2, kind: 'throw' });
          this.synth.shatter(pr.pos);
        }
        continue;
      }
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);
    }
  }

  private startDrink(): void {
    if (this.drinkTimer > 0) return;
    const slot = this.inventory.slots[this.inventory.selected]!;
    if (!slot.item) {
      this.ui.toast(t('hotbarEmpty'));
      return;
    }
    if (ITEMS[slot.item].kind === 'throw') {
      this.throwBottle();
      return;
    }
    const item = this.inventory.takeSelected()!;
    this.drinkItem = item;
    this.drinkTimer = Handheld.seconds(ITEMS[item]);
    this.drinkDuration = this.drinkTimer;
    this.handheld.start(ITEMS[item]);
    if (ITEMS[item].kind === 'drink') this.synth.pour(this.drinkTimer * 0.8, undefined, true);
  }

  /** Drinks immediately (scripted rounds at the table). */
  consumeNow(item: ItemId): void {
    // a drink of your own on its way down goes back into your pocket (it used to be lost)
    if (this.drinkItem && this.drinkTimer > 0) this.inventory.add(this.drinkItem);
    this.handheld.hide();
    this.finishDrink(item);
  }

  private finishDrink(item: ItemId): void {
    this.drinkItem = null;
    this.drinkTimer = 0;
    const events = this.status.consume(item);
    const bac = this.status.intox.bac + this.status.intox.pendingTotal;
    const lvl =
      bac >= BAC_WASTED
        ? t('bacWasted')
        : bac >= BAC_DRUNK
          ? t('bacDrunk')
          : bac >= BAC_TIPSY
            ? t('bacTipsy')
            : t('bacSober');
    this.ui.showStatus(bac, `${ITEMS[item].name} — ${ITEMS[item].tag} · ${lvl}`, this.status.mysteryShown);
    this.handleStatusEvents(events);
  }

  /** Reality hook for the eon drink. */
  onEon: (() => void) | null = null;

  private handleStatusEvents(events: StatusEvent[]): void {
    for (const e of events) {
      if (e === 'okno') void this.okno('alcohol');
      else if (e === 'frozen') void this.okno('cold');
      else if (e === 'eon') this.onEon?.();
      else if (e === 'absintheEnd') this.world.activeMask &= ~Layer.ABSINTHE;
    }
    this.world.activeMask =
      Layer.BASE |
      (this.status.buffs.has('absinthe') ? Layer.ABSINTHE : 0) |
      (this.status.layerVisionActive ? Layer.REVEAL : 0);
  }

  private defaultThreat(): number {
    let threat = 0;
    for (const e of this.entities) {
      if (!e.active || !e.visible) continue;
      const d = e.pos.distanceTo(this.player.pos);
      threat = Math.max(threat, clamp(1 - d / 14, 0, 1) * (0.4 + 0.6 * e.anim.alert));
    }
    return threat;
  }

  lookDir(out: Vector3): Vector3 {
    const cp = Math.cos(this.player.pitch);
    return out.set(
      -Math.sin(this.player.yaw) * cp,
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * cp,
    );
  }

  private view: PlayerView = {
    pos: new Vector3(),
    eye: new Vector3(),
    vel: new Vector3(),
    lookDir: new Vector3(),
    crouched: false,
    seated: false,
    seatedWithDrink: false,
    hidden: null,
    hiddenWitnessed: false,
    visibility: 1,
    ward: false,
    glowing: false,
    lightOn: false,
    lightPower: 1,
    inWater: false,
    waterDepth: 0,
    dead: false,
  };

  private updatePlayerView(): void {
    const v = this.view;
    const p = this.player;
    v.pos.copy(p.pos);
    v.eye.copy(p.pos).setY(p.pos.y + p.eyeHeight());
    v.vel.copy(p.vel);
    this.lookDir(v.lookDir);
    v.crouched = p.crouched;
    v.seated = this.seated;
    v.seatedWithDrink = this.seatedWithDrink;
    v.hidden = this.hiddenIn;
    v.hiddenWitnessed = this.hiddenWitnessed;
    const base = this.reality?.visibility?.() ?? 0.75;
    v.visibility = clamp(base * (p.crouched ? 0.6 : 1) + (this.lightOn ? 0.35 * this.lightPower : 0), 0, 1);
    v.ward = this.status.buffs.has('ward');
    v.glowing = this.status.buffs.has('reveal');
    v.lightOn = this.lightOn;
    v.lightPower = this.lightPower;
    v.inWater = this.waterDepth > 0.08;
    v.waterDepth = this.waterDepth;
    v.dead = this.mode !== 'play';
  }

  get playerView(): PlayerView {
    return this.view;
  }

  private makeAIContext(): AIContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const game = this;
    return {
      world: this.world,
      get nav() {
        return game.nav;
      },
      rng: this.rng,
      time: 0,
      dt: SIM_DT,
      player: this.view,
      noises: [],
      isObserved(pos: Vector3, radius = 0.5): boolean {
        if (game.mode !== 'play') return false;
        const v = game.view;
        _to.subVectors(pos, v.eye);
        if (_to.length() < 0.6) return true;
        // on screen means observed: the camera's own frustum, from the sim's view (a narrower cone
        // let things at the sides of the screen move in plain sight)
        const cam = game.renderer.camera;
        if (!onScreen(_to, v.lookDir, game.player.yaw, cam.fov, cam.aspect, radius)) return false;
        return game.world.lineOfSight(v.eye, pos);
      },
      catchPlayer(by: string) {
        void game.okno(by);
      },
      signal(id: string, name: string, data?: unknown) {
        game.onSignal?.(id, name, data);
      },
    } as AIContext;
  }

  /** Reality hook for entity signals. */
  onSignal: ((id: string, name: string, data?: unknown) => void) | null = null;

  // ───────────────────────────── rendering ─────────────────────────────

  private render(alpha: number, frameDt: number): void {
    this.renderTime = this.clock.time + alpha * SIM_DT;
    this.renderer.noteFrame(frameDt);
    // phones and tablets with 90-144 Hz screens: 60 frames are plenty, and half the heat
    if (this.touch && !this.loop.fpsCap) {
      const v = this.renderer.displayInterval;
      if (v > 0 && v < 1 / 100) this.loop.fpsCap = 60;
    }
    this.input.pollGamepad(frameDt);
    this.input.stepTouchLook(frameDt);
    const look = this.input.consumeLook();
    if (this.mode === 'play' && !this.loop.paused) this.rig.applyLook(look.dx, look.dy);
    const st = this.status;
    const motion = this.settings.motion;
    this.rig.update(frameDt, alpha, {
      bac: st.intox.bac,
      steady: st.buffs.has('steady'),
      fear: st.fear.value,
      motion,
      shake: this.fx.shake,
      renderTime: this.renderTime,
    });
    if (this.scene) {
      this.reality?.frame?.(frameDt, alpha, this.renderTime);
      // carried light
      const cam = this.renderer.camera;
      this.lightObj.position
        .copy(cam.position)
        .add(_to.set(0.25, -0.2, -0.3).applyQuaternion(cam.quaternion));
      const torch = this.torchInScene && this.lightPower > 1;
      const flick = torch
        ? 1
        : 0.85 + 0.15 * Math.sin(this.renderTime * 23.0) * Math.sin(this.renderTime * 7.3);
      // a torch spills a little cold light around you; the lighter is a warm, flickering glow
      this.lightObj.color.setHex(torch ? 0xc8d4ff : 0xffb060);
      this.lightObj.intensity = this.lightOn ? (torch ? 0.9 : 2.2 * this.lightPower) * flick : 0;
      if (this.torchInScene) {
        const level = clamp(this.torchLevel, 0, 1);
        this.torchObj.position.copy(this.lightObj.position);
        this.torchTarget.position.copy(cam.position).add(_to.set(0, 0, -6).applyQuaternion(cam.quaternion));
        this.torchObj.intensity = this.lightOn && torch ? 34 * (0.25 + 0.75 * level) : 0;
        this.torchObj.distance = torchReach(level);
      }
      this.lightBudget?.update(cam);
      // first-person drinking
      if (this.drinkTimer > 0 && this.drinkItem) {
        const p = 1 - Math.max(0, this.drinkTimer - alpha * SIM_DT) / this.drinkDuration;
        this.handheld.pose(p);
      } else this.handheld.hide();
      this.applyPostFx();
      this.renderer.render(frameDt);
      this.audio.updateListener(cam);
    }
    if (this.mode === 'play') this.updateHud();
    this.frames++;
    if (this.statsEl) {
      this.statsTimer += frameDt;
      if (this.statsTimer > 0.5) {
        const i = this.renderer.info;
        const p = this.player.pos;
        const b = this.lightBudget;
        const lights = b?.active ? `${b.size}/${b.standInCount}` : 'all';
        let text =
          `fps ${(this.frames / this.statsTimer).toFixed(0)} · cpu ${this.loop.cpuMs.toFixed(1)} ms · ` +
          `${this.renderer.profile.tier} ${Math.round(this.renderer.resScale * 100)} %\n` +
          `calls ${i.calls} · tris ${(i.triangles / 1000).toFixed(0)}k · lights ${lights}`;
        if (this.debug.stats)
          text += `\npos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)} · ‰ ${st.intox.bac.toFixed(2)} · fear ${st.fear.value.toFixed(2)}`;
        this.statsEl.textContent = text;
        this.statsTimer = 0;
        this.frames = 0;
      }
    }
  }

  private applyPostFx(): void {
    const st = this.status;
    const bac = st.intox.bac;
    const m = this.settings.motion;
    const steady = st.buffs.has('steady');
    const t = this.renderTime;
    // a beer or two leaves the picture alone; the warp comes later, double vision and blur much later
    const d = steady ? 0 : clamp((bac - 0.8) / 2.2, 0, 1);
    const absinthe = st.buffs.has('absinthe') ? 1 : 0;
    const fear = st.fear.value;
    // the comfort slider tones the drunk view down too (never all the way: you should know you are drunk)
    const k = 0.35 + 0.65 * m;
    this.renderer.drunk.set({
      double: steady ? 0 : clamp((bac - 1.5) / 1.5, 0, 1) * (0.55 + 0.45 * Math.sin(t * 0.37) ** 2) * k,
      aberr: clamp(d * 0.6 + fear * 0.5 + absinthe * 0.6, 0, 1.4) * k,
      blur: steady ? 0 : clamp((bac - 2.3) / 0.7, 0, 1) * 0.7 * k,
      dirX: Math.cos(t * 0.21),
      dirY: Math.sin(t * 0.17) * 0.3,
    });
    this.renderer.warp.set(t, (d * 0.9 + absinthe * 0.6) * (0.4 + 0.6 * m), this.fx.warp + absinthe * 0.4);
    const g = this.grade;
    this.renderer.grade.setGrade(g);
    const reduce = this.settings.reduceFlashes;
    // the first tenth of lost body heat does not show yet
    const chill = clamp((0.9 - st.cold.heat) / 0.9, 0, 1);
    this.renderer.grade.setDynamic({
      time: t,
      fade: this.fx.fade,
      white: reduce ? Math.min(this.fx.white, 0.6) : this.fx.white,
      vignette: this.fx.vignette + fear * 0.6 + chill * 0.4,
      frost: Math.max(this.fx.frost, chill * 0.9),
      desat: this.fx.desat + fear * 0.35,
      baseSaturation: g.saturation,
    });
  }

  private updateHud(): void {
    const f = this.interactions.focused;
    if (f && !this.ui.choosing) this.ui.setPrompt(typeof f.prompt === 'function' ? f.prompt() : f.prompt);
    else this.ui.setPrompt(null);
    this.ui.setHotbar(this.inventory.slots, this.inventory.selected, (i) => this.inventory.select(i));
  }
}

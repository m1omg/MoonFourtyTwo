import {
  HalfFloatType,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { Scene } from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { DrunkEffect, WarpEffect } from './post/DrunkEffect.ts';
import { GradeEffect } from './post/GradeEffect.ts';
import { ResolutionGovernor } from './resGovernor.ts';
import { fitFov } from './fov.ts';
import { PROFILES, type QualityProfile, type QualityTier } from './quality.ts';

/** WebGL renderer + post-processing chain + dynamic resolution. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly drunk = new DrunkEffect();
  readonly warp = new WarpEffect();
  readonly grade = new GradeEffect();
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  profile: QualityProfile;
  /** Dynamic resolution: its scale (0..1] applies on top of the pixel-ratio cap. */
  private readonly governor: ResolutionGovernor;
  /** Disable automatic resolution changes (tests, user preference). */
  dynamicRes = true;
  private resizePending = false;
  /** A render scale chosen in the settings (null: automatic). */
  private fixedScale: number | null = null;

  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private aoPass: N8AOPostPass | null = null;
  private drunkPass!: EffectPass;
  private scene: Scene | null = null;
  private width = 1;
  private height = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    tier: QualityTier,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.autoUpdate = true;
    this.camera = new PerspectiveCamera(72, 1, 0.05, 220);
    this.bloom = new BloomEffect({
      intensity: 0.9,
      luminanceThreshold: 0.75,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      radius: 0.7,
    });
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.profile = PROFILES[tier];
    this.governor = new ResolutionGovernor(this.profile.dynResMin);
    this.buildComposer();
    this.resize();
  }

  get gl(): WebGL2RenderingContext {
    return this.renderer.getContext() as WebGL2RenderingContext;
  }

  setScene(scene: Scene | null): void {
    this.scene = scene;
    if (scene) {
      this.renderPass.mainScene = scene;
      if (this.aoPass) (this.aoPass as unknown as { scene: Scene }).scene = scene;
    }
  }

  setProfile(tier: QualityTier): void {
    if (tier === this.profile.tier) return;
    this.profile = PROFILES[tier];
    this.governor.reset(this.profile.dynResMin);
    if (this.fixedScale !== null) this.governor.fix(this.fixedScale);
    this.buildComposer();
    this.resize();
  }

  private buildComposer(): void {
    this.composer?.dispose();
    const p = this.profile;
    this.renderer.shadowMap.enabled = p.shadows;
    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(this.scene ?? undefined, this.camera);
    this.composer.addPass(this.renderPass);
    this.aoPass = null;
    if (p.ao && this.scene) {
      const ao = new N8AOPostPass(this.scene, this.camera, this.width, this.height);
      ao.configuration.aoRadius = 0.9;
      ao.configuration.distanceFalloff = 0.6;
      ao.configuration.intensity = 2.2;
      ao.configuration.halfRes = true;
      ao.configuration.gammaCorrection = false;
      this.aoPass = ao;
      this.composer.addPass(ao);
    }
    // the glow's blur chain: fewer, smaller steps on the low preset
    this.bloom.mipmapBlurPass.levels = p.tier === 'low' ? 5 : 8;
    this.drunkPass = new EffectPass(this.camera, this.drunk);
    this.composer.addPass(this.drunkPass);
    const effects = p.bloom
      ? [this.warp, this.bloom, this.toneMapping, this.grade]
      : [this.warp, this.toneMapping, this.grade];
    this.composer.addPass(new EffectPass(this.camera, ...effects));
    if (p.smaa) this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
  }

  /** Must be called after the first scene is set when AO is enabled (N8AO needs the scene). */
  rebuild(): void {
    this.buildComposer();
    this.resize();
  }

  /** Vertical field of view from the settings (a tall screen widens it, see fitFov). */
  private baseFov = 72;

  setFov(fov: number): void {
    this.baseFov = fov;
    this.camera.fov = fitFov(fov, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, this.profile.pixelRatioCap) * this.governor.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fitFov(this.baseFov, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Asks for a resize before the next frame is drawn. Resizing clears the canvas, so doing it
   * anywhere else (an event, or after drawing) shows a black frame: a flicker.
   */
  requestResize(): void {
    this.resizePending = true;
  }

  /** Renders one frame. `frameDt` (real seconds) only feeds the resolution governor. */
  render(frameDt: number): void {
    if (!this.scene) return;
    if (this.resizePending) {
      this.resizePending = false;
      this.resize();
    }
    this.drunkPass.enabled = this.drunk.active;
    this.renderer.info.reset();
    this.composer.render(frameDt);
    if (this.dynamicRes && this.governor.update(frameDt)) this.resizePending = true;
  }

  /** Fixes the render scale (null: automatic, following the frame rate). */
  setFixedScale(scale: number | null): void {
    this.fixedScale = scale;
    this.dynamicRes = scale === null;
    this.governor.fix(scale);
    this.requestResize();
  }

  /** The display's frame interval in seconds (0 until known). */
  get displayInterval(): number {
    return this.governor.displayInterval;
  }

  /** Every frame, drawn or not: lets the resolution governor learn the display's pace. */
  noteFrame(frameDt: number): void {
    this.governor.noteFrame(frameDt);
  }

  get resScale(): number {
    return this.governor.scale;
  }

  get info(): { calls: number; triangles: number; textures: number; geometries: number; programs: number } {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      textures: i.memory.textures,
      geometries: i.memory.geometries,
      programs: i.programs?.length ?? 0,
    };
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}

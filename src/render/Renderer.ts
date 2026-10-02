import {
  HalfFloatType,
  NoToneMapping,
  PCFSoftShadowMap,
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
  /** Dynamic resolution scale (0..1] applied on top of the pixel-ratio cap. */
  resScale = 1;
  /** Disable automatic resolution changes (tests, user preference). */
  dynamicRes = true;

  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private aoPass: N8AOPostPass | null = null;
  private drunkPass!: EffectPass;
  private scene: Scene | null = null;
  private frameTimes: number[] = [];
  private sinceResChange = 0;
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
    this.renderer.shadowMap.type = PCFSoftShadowMap;
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
    this.resScale = 1;
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

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, this.profile.pixelRatioCap) * this.resScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Renders one frame. `frameDt` (real seconds) only feeds the resolution governor. */
  render(frameDt: number): void {
    if (!this.scene) return;
    this.drunkPass.enabled = this.drunk.active;
    this.composer.render(frameDt);
    if (this.dynamicRes) this.governResolution(frameDt);
  }

  private governResolution(frameDt: number): void {
    if (frameDt <= 0) return;
    this.frameTimes.push(frameDt);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    this.sinceResChange += frameDt;
    if (this.sinceResChange < 1.2 || this.frameTimes.length < 30) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1]!;
    // Target ~60 fps; never chase high refresh rates (that is what the fixed step is for).
    let next = this.resScale;
    if (median > 1 / 50) next = Math.max(this.profile.dynResMin, this.resScale - 0.08);
    else if (median < 1 / 58 && this.resScale < 1) next = Math.min(1, this.resScale + 0.05);
    if (Math.abs(next - this.resScale) > 1e-3) {
      this.resScale = next;
      this.sinceResChange = 0;
      this.frameTimes.length = 0;
      this.resize();
    }
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

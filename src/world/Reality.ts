import type { Scene, Vector3 } from 'three';
import type { ItemId } from '../sim/items/items.data.ts';
import type { Game } from '../app/Game.ts';
import type { Scope } from '../core/scope.ts';
import type { Builder } from './kit/Builder.ts';
import type { MaterialLib } from './materials.ts';

export interface Checkpoint {
  pos: Vector3;
  yaw: number;
  pitch?: number;
  /** Seated checkpoints start the player sitting (camera lower, no movement until they stand). */
  seated?: boolean;
}

export interface RealityCtx {
  game: Game;
  scene: Scene;
  scope: Scope;
  builder: Builder;
  mats: MaterialLib;
  /** Reports loading progress 0..1. */
  progress(p: number): void;
}

export interface RealityInstance {
  checkpoints: Record<string, Checkpoint>;
  defaultCheckpoint: string;
  /** Spawns the player at the checkpoint and starts the reality's scripts. */
  start(checkpoint: string): void;
  /** Fixed sim step (after player and entities). */
  tick?(dt: number): void;
  /** Per displayed frame (visual-only updates). `t` is render time in seconds. */
  frame?(frameDt: number, alpha: number, t: number): void;
  /** 0..1 how visible the player is to entities at their position (lighting). */
  visibility?(): number;
  /** 0..1 how dark it is around the player (fear). */
  darkness?(): number;
  coldExposure?(): number;
  warmth?(): number;
  /** Threat 0..1 for the fear model (defaults to the nearest entity heuristic). */
  threat?(): number;
  /** Depth of water at the player's feet (wading slows you and footsteps splash). */
  waterDepth?(pos: Vector3): number;
  /** Water surface height at (x, z), or null where there is no water (thrown objects splash). */
  waterSurface?(x: number, z: number): number | null;
  /** A thrown item landed; return true to replace the default sound and noise. */
  onImpact?(pos: Vector3, item: ItemId, inWater: boolean): boolean;
  dispose?(): void;
}

export interface RealityModule {
  id: string;
  index: number;
  /** Chapter title shown on entry (Slovak). */
  title: string;
  create(ctx: RealityCtx): Promise<RealityInstance>;
}

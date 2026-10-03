import type { Vector3 } from 'three';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { NavGrid } from './nav/NavGrid.ts';
import type { Rng } from '../../core/rng.ts';

export interface HidingSpot {
  id: string;
  /** Where the player is placed while hidden. */
  pos: Vector3;
  /** Where entities stand to search it. */
  approach: Vector3;
  kind: 'wardrobe' | 'bed' | 'curtain' | 'table' | 'locker' | 'stall';
}

/** What entities may know about the player this tick. */
export interface PlayerView {
  pos: Vector3;
  eye: Vector3;
  vel: Vector3;
  lookDir: Vector3;
  crouched: boolean;
  /** Seated at a table (e.g. with a drink in front of them). */
  seated: boolean;
  seatedWithDrink: boolean;
  hidden: HidingSpot | null;
  /** Seen entering the current hiding spot. */
  hiddenWitnessed: boolean;
  /** 0 (pitch dark, crouched) .. 1 (brightly lit). */
  visibility: number;
  /** Juniper ward active: lose track when LOS breaks. */
  ward: boolean;
  /** Horský čaj: entities can sense the player from far away. */
  glowing: boolean;
  /** Holding a light source (lighter/flashlight) that is on. */
  lightOn: boolean;
  lightPower: number;
  inWater: boolean;
  waterDepth: number;
  dead: boolean;
}

export interface NoiseEvent {
  x: number;
  y: number;
  z: number;
  /** ~0.2 (crouch step) .. 1 (sprint) .. 2 (thrown bottle, scream). */
  loudness: number;
  kind: 'step' | 'splash' | 'throw' | 'panic' | 'object' | 'door';
}

export interface AIContext {
  world: CollisionWorld;
  nav: NavGrid | null;
  rng: Rng;
  time: number;
  dt: number;
  player: PlayerView;
  noises: readonly NoiseEvent[];
  /** Whether the player is currently looking at a point (fixed sim-side view cone + LOS). */
  isObserved(pos: Vector3, radius?: number): boolean;
  /** Entity reached the player: triggers the blackout. */
  catchPlayer(by: string): void;
  /** Free-form events for the presentation layer (sounds, scares). */
  signal(entityId: string, name: string, data?: unknown): void;
}

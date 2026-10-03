import { readJSON, writeJSON } from './storage.ts';
import type { QualitySetting } from '../render/quality.ts';

export interface Settings {
  v: 1;
  quality: QualitySetting;
  mouseSensitivity: number; // multiplier 0.2..3
  touchSensitivity: number;
  invertY: boolean;
  fov: number;
  master: number;
  music: number;
  voice: number;
  sfx: number;
  /** Camera motion & drunk-effect strength 0..1 (comfort). */
  motion: number;
  reduceFlashes: boolean;
  subtitleSize: 'small' | 'medium' | 'large';
  difficulty: 'story' | 'normal';
  /** Render scale: automatic (follows the frame rate) or fixed. */
  resolution: 'auto' | '1' | '0.85' | '0.7' | '0.55';
  /** Frame rate and render statistics in a corner. */
  showFps: boolean;
  warned: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  quality: 'auto',
  mouseSensitivity: 1,
  touchSensitivity: 1,
  invertY: false,
  fov: 72,
  master: 0.9,
  music: 0.7,
  voice: 1,
  sfx: 0.9,
  motion: 1,
  reduceFlashes: false,
  subtitleSize: 'medium',
  difficulty: 'normal',
  resolution: 'auto',
  showFps: false,
  warned: false,
};

const KEY = 'este-jedno.settings.v1';

export function loadSettings(): Settings {
  const s = readJSON<Partial<Settings>>(KEY);
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), v: 1 };
}

export function saveSettings(s: Settings): void {
  writeJSON(KEY, s);
}

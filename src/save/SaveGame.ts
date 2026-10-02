import { readJSON, writeJSON, remove } from './storage.ts';
import type { ItemId } from '../sim/items/items.data.ts';

export interface SaveData {
  v: 1;
  reality: string;
  checkpoint: string;
  flags: Record<string, number>;
  inventory: Array<{ item: ItemId; count: number }>;
  selected: number;
  bac: number;
  /** Collected beer mats (lore). */
  mats: string[];
  /** Total tally marks (rounds). */
  tallies: number;
  playSeconds: number;
}

const KEY = 'este-jedno.save.v1';

export function loadSave(): SaveData | null {
  const s = readJSON<SaveData>(KEY);
  if (!s || s.v !== 1 || typeof s.reality !== 'string') return null;
  return {
    ...s,
    flags: s.flags ?? {},
    inventory: Array.isArray(s.inventory) ? s.inventory : [],
    mats: Array.isArray(s.mats) ? s.mats : [],
    tallies: s.tallies ?? 0,
    playSeconds: s.playSeconds ?? 0,
    selected: s.selected ?? 0,
    bac: s.bac ?? 0,
  };
}

export function writeSave(s: SaveData): void {
  writeJSON(KEY, s);
}

export function clearSave(): void {
  remove(KEY);
}

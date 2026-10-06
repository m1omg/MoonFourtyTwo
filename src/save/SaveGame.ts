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
  /** When it was saved (wall clock, ms), for the list of saves. Older saves have none. */
  savedAt?: number;
  /** The reality's title when it was saved, for the list of saves. */
  title?: string;
}

/** The current game: written at every checkpoint, read by „Pokračovať" and after an okno. */
const KEY = 'este-jedno.save.v1';
/** Saves kept next to it: the last few checkpoints and the player's own slots. */
const BOOK_KEY = 'este-jedno.saves.v1';
export const SLOT_COUNT = 3;
const HISTORY = 5;

export interface SaveBook {
  /** The player's own saves („Uložiť hru"); null = empty. */
  slots: Array<SaveData | null>;
  /** The most recent checkpoints, newest first (one entry per checkpoint in a row). */
  history: SaveData[];
}

function valid(s: SaveData | null | undefined): SaveData | null {
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

export function loadSave(): SaveData | null {
  return valid(readJSON<SaveData>(KEY));
}

/** Saves the current game and remembers it among the recent checkpoints. */
export function writeSave(s: SaveData): void {
  writeJSON(KEY, s);
  const book = loadBook();
  const head = book.history[0];
  if (head && head.reality === s.reality && head.checkpoint === s.checkpoint) book.history[0] = s;
  else book.history.unshift(s);
  book.history.length = Math.min(book.history.length, HISTORY);
  writeJSON(BOOK_KEY, book);
}

/** Makes `s` the current game (loading a save) without adding it to the recent checkpoints. */
export function setCurrentSave(s: SaveData): void {
  writeJSON(KEY, s);
}

export function clearSave(): void {
  remove(KEY);
}

export function loadBook(): SaveBook {
  const b = readJSON<Partial<SaveBook>>(BOOK_KEY);
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => valid(b?.slots?.[i]));
  const history = (Array.isArray(b?.history) ? b.history : [])
    .map((s) => valid(s))
    .filter((s): s is SaveData => s !== null);
  // a game saved before there was a list: it is the only recent checkpoint
  if (!history.length) {
    const current = loadSave();
    if (current) history.push(current);
  }
  return { slots, history };
}

/** Keeps the current game (its last checkpoint) in one of the player's slots. */
export function saveToSlot(i: number): boolean {
  const current = loadSave();
  if (!current || i < 0 || i >= SLOT_COUNT) return false;
  const book = loadBook();
  book.slots[i] = current;
  writeJSON(BOOK_KEY, book);
  return true;
}

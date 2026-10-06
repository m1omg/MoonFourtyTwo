import { describe, expect, it } from 'vitest';
import {
  clearSave,
  loadBook,
  loadSave,
  saveToSlot,
  setCurrentSave,
  writeSave,
  type SaveData,
} from '../../src/save/SaveGame.ts';
import { remove, writeJSON } from '../../src/save/storage.ts';

const KEY = 'este-jedno.save.v1';

const save: SaveData = {
  v: 1,
  reality: 'r5',
  checkpoint: 'pump',
  flags: { 'spa.key': 1 },
  inventory: [{ item: 'borovicka', count: 2 }],
  selected: 1,
  bac: 0.6,
  mats: ['r1', 'r3'],
  tallies: 4,
  playSeconds: 1234,
};

// Node has no localStorage: storage falls back to memory, as in a private browser window
describe('saves', () => {
  it('come back as they were written', () => {
    writeSave(save);
    expect(loadSave()).toEqual(save);
  });

  it('fill in what an older save did not have', () => {
    writeJSON(KEY, { v: 1, reality: 'r2', checkpoint: 'frozen', flags: { 'pub.r2': 1 } });
    const s = loadSave()!;
    expect(s.reality).toBe('r2');
    expect(s.mats).toEqual([]);
    expect(s.inventory).toEqual([]);
    expect(s.tallies).toBe(0);
    expect(s.bac).toBe(0);
  });

  it('ignore a broken or foreign save', () => {
    writeJSON(KEY, { v: 2, reality: 'r9' });
    expect(loadSave()).toBeNull();
    writeJSON(KEY, { v: 1, reality: 7 });
    expect(loadSave()).toBeNull();
    writeJSON(KEY, 'nonsense');
    expect(loadSave()).toBeNull();
  });

  it('can be cleared (new game)', () => {
    writeSave(save);
    clearSave();
    expect(loadSave()).toBeNull();
  });
});

describe('the list of saves', () => {
  const at = (checkpoint: string, playSeconds = 0): SaveData => ({ ...save, checkpoint, playSeconds });

  it('shows a game saved before there was a list', () => {
    remove('este-jedno.saves.v1');
    writeJSON(KEY, save);
    expect(loadBook().history).toEqual([save]);
    expect(loadBook().slots).toEqual([null, null, null]);
  });

  it('keeps the last five checkpoints, newest first, one entry per checkpoint in a row', () => {
    remove('este-jedno.saves.v1');
    for (const cp of ['a', 'b', 'b', 'c', 'd', 'e', 'f']) writeSave(at(cp));
    expect(loadBook().history.map((s) => s.checkpoint)).toEqual(['f', 'e', 'd', 'c', 'b']);
    // the same checkpoint again (new beer mats, say) replaces the newest entry
    writeSave(at('f', 99));
    const h = loadBook().history;
    expect(h).toHaveLength(5);
    expect(h[0]!.playSeconds).toBe(99);
  });

  it('keeps the current game in a slot, and loading one does not touch the recent list', () => {
    remove('este-jedno.saves.v1');
    writeSave(at('x'));
    expect(saveToSlot(1)).toBe(true);
    writeSave(at('y'));
    const book = loadBook();
    expect(book.slots[1]!.checkpoint).toBe('x');
    expect(book.slots[0]).toBeNull();
    setCurrentSave(book.slots[1]!);
    expect(loadSave()!.checkpoint).toBe('x');
    expect(loadBook().history.map((s) => s.checkpoint)).toEqual(['y', 'x']);
    expect(saveToSlot(7)).toBe(false);
    clearSave();
    expect(saveToSlot(0)).toBe(false);
  });
});

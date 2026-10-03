import { describe, expect, it } from 'vitest';
import { clearSave, loadSave, writeSave, type SaveData } from '../../src/save/SaveGame.ts';
import { writeJSON } from '../../src/save/storage.ts';

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

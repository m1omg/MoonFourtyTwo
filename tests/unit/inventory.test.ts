import { describe, expect, it } from 'vitest';
import { Inventory, SLOT_COUNT } from '../../src/sim/items/Inventory.ts';
import type { ItemId } from '../../src/sim/items/items.data.ts';

const KINDS: ItemId[] = [
  'pivo',
  'borovicka',
  'slivovica',
  'fernet',
  'horskyCaj',
  'kacka',
  'cierne',
  'absint',
];

describe('Inventory', () => {
  it('never refuses: a seventh kind opens a seventh slot', () => {
    const inv = new Inventory();
    for (const k of KINDS) expect(inv.add(k)).toBe(true);
    expect(inv.slots.length).toBe(KINDS.length);
    expect(inv.has('cierne')).toBe(true);
    expect(inv.count('absint')).toBe(1);
  });

  it('an extra slot closes again once used up, and the selection follows', () => {
    const inv = new Inventory();
    for (const k of KINDS) inv.add(k);
    inv.select(7); // absint, the eighth
    expect(inv.takeSelected()).toBe('absint');
    expect(inv.slots.length).toBe(7);
    expect(inv.selected).toBe(6);
    expect(inv.take('cierne')).toBe(true);
    expect(inv.slots.length).toBe(SLOT_COUNT);
    expect(inv.selected).toBeLessThan(SLOT_COUNT);
    // the first six slots stay, empty or not
    inv.take('pivo');
    expect(inv.slots.length).toBe(SLOT_COUNT);
    expect(inv.slots[0]!.item).toBeNull();
  });

  it('keeps and restores more than six kinds in a save', () => {
    const inv = new Inventory();
    KINDS.forEach((k, i) => inv.add(k, i + 1));
    const saved = inv.toJSON();
    const back = new Inventory();
    back.load(saved);
    expect(back.toJSON()).toEqual(saved);
    back.clear();
    expect(back.slots.length).toBe(SLOT_COUNT);
  });

  it('ignores a bad selection and cycles over every slot', () => {
    const inv = new Inventory();
    for (const k of KINDS) inv.add(k);
    inv.select(Number.NaN);
    expect(inv.selected).toBe(0);
    inv.select(-1);
    expect(inv.selected).toBe(KINDS.length - 1);
    inv.cycle(1);
    expect(inv.selected).toBe(0);
  });
});

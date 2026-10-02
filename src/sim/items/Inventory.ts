import type { ItemId } from './items.data.ts';

export interface Slot {
  item: ItemId | null;
  count: number;
}

export const SLOT_COUNT = 6;

/** Hotbar of stackable drinks and snacks. */
export class Inventory {
  readonly slots: Slot[] = Array.from({ length: SLOT_COUNT }, () => ({ item: null, count: 0 }));
  selected = 0;

  add(item: ItemId, count = 1): boolean {
    const existing = this.slots.find((s) => s.item === item);
    if (existing) {
      existing.count += count;
      return true;
    }
    const free = this.slots.find((s) => !s.item);
    if (!free) return false;
    free.item = item;
    free.count = count;
    return true;
  }

  has(item: ItemId): boolean {
    return this.slots.some((s) => s.item === item && s.count > 0);
  }

  count(item: ItemId): number {
    return this.slots.find((s) => s.item === item)?.count ?? 0;
  }

  takeSelected(): ItemId | null {
    const s = this.slots[this.selected]!;
    if (!s.item || s.count <= 0) return null;
    const item = s.item;
    s.count--;
    if (s.count <= 0) {
      s.item = null;
      s.count = 0;
    }
    return item;
  }

  take(item: ItemId): boolean {
    const s = this.slots.find((x) => x.item === item);
    if (!s) return false;
    s.count--;
    if (s.count <= 0) {
      s.item = null;
      s.count = 0;
    }
    return true;
  }

  select(i: number): void {
    this.selected = ((i % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
  }

  cycle(dir: 1 | -1): void {
    for (let k = 1; k <= SLOT_COUNT; k++) {
      const i = (this.selected + dir * k + SLOT_COUNT * 2) % SLOT_COUNT;
      if (this.slots[i]!.item) {
        this.selected = i;
        return;
      }
    }
  }

  clear(): void {
    for (const s of this.slots) {
      s.item = null;
      s.count = 0;
    }
    this.selected = 0;
  }

  toJSON(): Array<{ item: ItemId; count: number }> {
    return this.slots.filter((s) => s.item).map((s) => ({ item: s.item!, count: s.count }));
  }

  load(list: Array<{ item: ItemId; count: number }>): void {
    this.clear();
    for (const e of list) this.add(e.item, e.count);
  }
}

import type { ItemId } from './items.data.ts';

export interface Slot {
  item: ItemId | null;
  count: number;
}

/** Slots the hotbar always shows; a seventh kind of drink gets a seventh slot. */
export const SLOT_COUNT = 6;

/**
 * Hotbar of stackable drinks and snacks. It never refuses anything: with six kinds already held
 * a new kind opens another slot (and the slot goes again when it is used up). A full hotbar used
 * to drop pickups on the floor of nowhere, story items included.
 */
export class Inventory {
  readonly slots: Slot[] = Array.from({ length: SLOT_COUNT }, () => ({ item: null, count: 0 }));
  selected = 0;

  add(item: ItemId, count = 1): true {
    const existing = this.slots.find((s) => s.item === item);
    if (existing) {
      existing.count += count;
      return true;
    }
    let free = this.slots.find((s) => !s.item);
    if (!free) {
      free = { item: null, count: 0 };
      this.slots.push(free);
    }
    free.item = item;
    free.count = count;
    return true;
  }

  /** An emptied extra slot (past the sixth) closes again. */
  private emptied(i: number): void {
    const s = this.slots[i]!;
    s.item = null;
    s.count = 0;
    if (i < SLOT_COUNT) return;
    this.slots.splice(i, 1);
    if (this.selected > i || this.selected >= this.slots.length) this.selected--;
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
    if (s.count <= 0) this.emptied(this.selected);
    return item;
  }

  take(item: ItemId): boolean {
    const i = this.slots.findIndex((x) => x.item === item);
    if (i < 0) return false;
    const s = this.slots[i]!;
    s.count--;
    if (s.count <= 0) this.emptied(i);
    return true;
  }

  select(i: number): void {
    if (!Number.isFinite(i)) return;
    const n = this.slots.length;
    this.selected = ((Math.trunc(i) % n) + n) % n;
  }

  cycle(dir: 1 | -1): void {
    const n = this.slots.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.selected + dir * k + n * 2) % n;
      if (this.slots[i]!.item) {
        this.selected = i;
        return;
      }
    }
  }

  clear(): void {
    this.slots.length = SLOT_COUNT;
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

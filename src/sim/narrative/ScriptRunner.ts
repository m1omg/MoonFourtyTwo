/**
 * Coroutine-style story beats on simulation time. `await ctx.wait(2)` resumes on the exact
 * fixed tick, independent of frame rate. Cancelling (respawn, reality unload) rejects all
 * pending waits with Cancelled, which unwinds the async script.
 */

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

interface Waiter {
  resumeAt: number;
  resolve: () => void;
  reject: (e: unknown) => void;
}

interface CondWaiter {
  test: () => boolean;
  resolve: () => void;
  reject: (e: unknown) => void;
  timeoutAt: number;
}

export class ScriptClock {
  time = 0;
  private waiters: Waiter[] = [];
  private conds: CondWaiter[] = [];
  private generation = 0;

  /** Advance sim time; resolves due waits (in order). */
  step(dt: number): void {
    this.time += dt;
    if (this.waiters.length) {
      const due = this.waiters.filter((w) => w.resumeAt <= this.time + 1e-9);
      if (due.length) {
        this.waiters = this.waiters.filter((w) => w.resumeAt > this.time + 1e-9);
        due.sort((a, b) => a.resumeAt - b.resumeAt);
        for (const w of due) w.resolve();
      }
    }
    if (this.conds.length) {
      const keep: CondWaiter[] = [];
      for (const c of this.conds) {
        let ok: boolean;
        try {
          ok = c.test();
        } catch (e) {
          c.reject(e);
          continue;
        }
        if (ok) c.resolve();
        else if (c.timeoutAt <= this.time) c.resolve();
        else keep.push(c);
      }
      this.conds = keep;
    }
  }

  wait(seconds: number): Promise<void> {
    const gen = this.generation;
    return new Promise<void>((resolve, reject) => {
      if (gen !== this.generation) {
        reject(new Cancelled());
        return;
      }
      this.waiters.push({ resumeAt: this.time + Math.max(0, seconds), resolve, reject });
    });
  }

  /** Resolves on the first tick where `test()` is true (or after `timeout` seconds). */
  until(test: () => boolean, timeout = Infinity): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.conds.push({ test, resolve, reject, timeoutAt: this.time + timeout });
    });
  }

  /** Rejects every pending wait; scripts unwind via Cancelled. */
  cancelAll(): void {
    this.generation++;
    const w = this.waiters;
    const c = this.conds;
    this.waiters = [];
    this.conds = [];
    for (const x of w) x.reject(new Cancelled());
    for (const x of c) x.reject(new Cancelled());
  }

  get pending(): number {
    return this.waiters.length + this.conds.length;
  }

  /** Changes with every cancelAll: a script resuming from a non-clock await compares it. */
  get gen(): number {
    return this.generation;
  }
}

/** Runs an async script and swallows Cancelled; other errors are logged. */
export function runScript(fn: () => Promise<void>): Promise<void> {
  return fn().catch((e: unknown) => {
    if (e instanceof Cancelled) return;
    console.error('script error', e);
  });
}

/** Simple persistent story flags. */
export class Flags {
  private set = new Map<string, number>();
  get(k: string): number {
    return this.set.get(k) ?? 0;
  }
  has(k: string): boolean {
    return (this.set.get(k) ?? 0) !== 0;
  }
  put(k: string, v: number | boolean = 1): void {
    this.set.set(k, typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  inc(k: string, by = 1): number {
    const v = this.get(k) + by;
    this.set.set(k, v);
    return v;
  }
  toJSON(): Record<string, number> {
    return Object.fromEntries(this.set);
  }
  load(o: Record<string, number> | undefined): void {
    this.set = new Map(Object.entries(o ?? {}));
  }
}

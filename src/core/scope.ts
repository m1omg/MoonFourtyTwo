export interface Disposable {
  dispose(): void;
}

/** Collects everything a reality allocates so it can be released in one call. */
export class Scope {
  private items: Array<Disposable | (() => void)> = [];
  private disposed = false;

  add<T extends Disposable>(d: T): T {
    if (this.disposed) {
      d.dispose();
      return d;
    }
    this.items.push(d);
    return d;
  }

  onDispose(fn: () => void): void {
    if (this.disposed) {
      fn();
      return;
    }
    this.items.push(fn);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      try {
        if (typeof it === 'function') it();
        else it.dispose();
      } catch (err) {
        console.warn('dispose failed', err);
      }
    }
    this.items = [];
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

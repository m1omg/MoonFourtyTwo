/** The only place allowed to read the wall clock. Everything else uses sim/render time from the loop. */
export function nowSeconds(): number {
  return performance.now() / 1000;
}

/** Wall-clock milliseconds, only to label saves with when they were made. */
export function wallClockMs(): number {
  return Date.now();
}

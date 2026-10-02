/** The only place allowed to read the wall clock. Everything else uses sim/render time from the loop. */
export function nowSeconds(): number {
  return performance.now() / 1000;
}

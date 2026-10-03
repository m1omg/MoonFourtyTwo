/**
 * Dynamic resolution: lowers the render scale while frames miss the display's pace and raises it
 * again when there is room. Pure (no DOM), so it is tested at 30, 60 and 144 Hz.
 *
 * Every change of scale is visible (the picture gets softer or sharper), so the governor is slow to
 * go back up: it waits for a few seconds of good frames, and if going up made things slow again it
 * waits twice as long next time. A device on the edge settles instead of bouncing.
 */
export class ResolutionGovernor {
  scale = 1;
  /** The display's frame interval, as far as we can tell (see noteFrame). */
  private vsync = 0;
  private frameTimes: number[] = [];
  private sinceChange = 0;
  /** Seconds of good frames needed before the scale goes up again. */
  private upHold = 3;
  /** Seconds since the scale last went up (Infinity: never). */
  private sinceUp = Infinity;

  constructor(public min: number) {}

  /**
   * Learns the display's frame interval from every frame (menus and loading included, when there is
   * little to draw): it drops at once to any faster frame and creeps up towards slower ones over
   * about 20 seconds, so a 30, 60 or 144 Hz display is recognised as such.
   */
  noteFrame(frameDt: number): void {
    if (frameDt <= 0) return;
    if (this.vsync === 0 || frameDt < this.vsync) this.vsync = frameDt;
    else this.vsync += (frameDt - this.vsync) * Math.min(1, frameDt / 20);
  }

  /** The display's frame interval (seconds) as learnt so far; 0 before any frame. */
  get displayInterval(): number {
    return this.vsync;
  }

  /** Feeds a rendered frame's duration; returns true when the scale changed. */
  update(frameDt: number): boolean {
    if (frameDt <= 0) return false;
    this.frameTimes.push(frameDt);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    this.sinceChange += frameDt;
    this.sinceUp += frameDt;
    if (this.sinceChange < 1.2 || this.frameTimes.length < 30) return false;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1]!;
    // Too slow means missing the display's own pace (a 30 Hz display is not overloaded at 30 fps),
    // but never chase more than ~50-60 fps on fast displays: that is what the fixed step is for.
    const vsync = this.vsync || 1 / 60;
    const slow = Math.max(vsync * 1.2, 1 / 50);
    const fast = Math.max(vsync * 1.08, 1 / 58);
    let next = this.scale;
    if (median > slow && this.scale > this.min) {
      next = Math.max(this.min, this.scale - 0.08);
      // going up did not hold: wait twice as long before trying again
      if (this.sinceUp < 8) this.upHold = Math.min(60, this.upHold * 2);
    } else if (median < fast && this.scale < 1 && this.sinceChange >= this.upHold) {
      next = Math.min(1, this.scale + 0.05);
      this.sinceUp = 0;
    }
    if (Math.abs(next - this.scale) <= 1e-3) return false;
    this.scale = next;
    this.sinceChange = 0;
    this.frameTimes.length = 0;
    return true;
  }

  /** Holds a fixed scale, or (null) goes back to choosing one, starting from full resolution. */
  fix(scale: number | null): void {
    this.reset(this.min);
    if (scale !== null) this.scale = scale;
  }

  reset(min: number): void {
    this.min = min;
    this.scale = 1;
    this.sinceChange = 0;
    this.frameTimes.length = 0;
    this.upHold = 3;
    this.sinceUp = Infinity;
  }
}

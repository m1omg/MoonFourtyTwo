/**
 * Dynamic resolution: lowers the render scale while frames miss the display's pace and raises it
 * again when there is room. Pure (no DOM), so it is tested at 30, 60 and 144 Hz.
 */
export class ResolutionGovernor {
  scale = 1;
  /** The display's frame interval, as far as we can tell (see noteFrame). */
  private vsync = 0;
  private frameTimes: number[] = [];
  private sinceChange = 0;

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

  /** Feeds a rendered frame's duration; returns true when the scale changed. */
  update(frameDt: number): boolean {
    if (frameDt <= 0) return false;
    this.frameTimes.push(frameDt);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    this.sinceChange += frameDt;
    if (this.sinceChange < 1.2 || this.frameTimes.length < 30) return false;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1]!;
    // Too slow means missing the display's own pace (a 30 Hz display is not overloaded at 30 fps),
    // but never chase more than ~50-60 fps on fast displays: that is what the fixed step is for.
    const vsync = this.vsync || 1 / 60;
    const slow = Math.max(vsync * 1.2, 1 / 50);
    const fast = Math.max(vsync * 1.08, 1 / 58);
    let next = this.scale;
    if (median > slow) next = Math.max(this.min, this.scale - 0.08);
    else if (median < fast && this.scale < 1) next = Math.min(1, this.scale + 0.05);
    if (Math.abs(next - this.scale) <= 1e-3) return false;
    this.scale = next;
    this.sinceChange = 0;
    this.frameTimes.length = 0;
    return true;
  }

  reset(min: number): void {
    this.min = min;
    this.scale = 1;
    this.sinceChange = 0;
    this.frameTimes.length = 0;
  }
}

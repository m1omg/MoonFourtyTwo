/**
 * Fixed-timestep loop. The simulation always advances in constant DT steps, no matter the
 * display refresh rate; rendering interpolates between the last two sim states with `alpha`.
 * This file is the only one allowed to touch requestAnimationFrame.
 */

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export class FixedStepper {
  private acc = 0;
  /** Total fixed steps executed so far. */
  ticks = 0;

  constructor(
    readonly dt = SIM_DT,
    /** Longest real frame we account for (prevents the spiral of death after a hitch). */
    readonly maxFrame = 0.25,
    /** Upper bound of steps per frame; leftover backlog is dropped. */
    readonly maxSteps = 8,
  ) {}

  /** Feeds one real frame of `frameSeconds` and runs as many fixed steps as fit. */
  advance(frameSeconds: number, step: (dt: number) => void): number {
    const f = Math.min(Math.max(frameSeconds, 0), this.maxFrame);
    this.acc += f;
    let n = 0;
    // Epsilon makes e.g. 144 frames of 1/144 s add up to exactly 60 steps.
    const eps = 1e-7;
    while (this.acc + eps >= this.dt && n < this.maxSteps) {
      this.acc -= this.dt;
      step(this.dt);
      this.ticks++;
      n++;
    }
    if (this.acc + eps >= this.dt) this.acc = 0; // still behind: drop backlog instead of spiralling
    if (this.acc < 0) this.acc = 0;
    return n;
  }

  /** Interpolation factor between previous and current sim state, in [0, 1]. */
  get alpha(): number {
    return Math.min(this.acc / this.dt, 1);
  }

  /** Simulated seconds since start. */
  get simTime(): number {
    return this.ticks * this.dt;
  }

  reset(): void {
    this.acc = 0;
    this.ticks = 0;
  }
}

export interface LoopHandlers {
  /** One fixed simulation step (dt is constant). */
  step(dt: number): void;
  /** One displayed frame. `frameDt` is the clamped real duration of the frame (UI/gamepad only). */
  render(alpha: number, frameDt: number): void;
}

export class GameLoop {
  readonly stepper = new FixedStepper();
  /** When true, sim steps are skipped (pause menu); rendering continues. */
  paused = false;
  /** Optional cap of displayed frames per second (0 = uncapped). */
  fpsCap = 0;
  /** In manual mode (tests) the rAF driver does nothing; use `manualFrames`. */
  manual = false;

  private running = false;
  private lastT = -1;
  private sinceRender = 0;
  private rafId = 0;

  constructor(private readonly handlers: LoopHandlers) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = -1;
    this.rafId = requestAnimationFrame(this.frame);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Advances the simulation by `seconds` without rendering, then renders one frame (fast tests). */
  manualSim(seconds: number): void {
    const n = Math.round(seconds / this.stepper.dt);
    for (let i = 0; i < n; i++) this.stepper.advance(this.stepper.dt, this.handlers.step);
    this.handlers.render(this.stepper.alpha, this.stepper.dt);
  }

  /** Drives `count` frames of 1/hz seconds synchronously (deterministic tests). */
  manualFrames(count: number, hz: number): void {
    const dt = 1 / hz;
    for (let i = 0; i < count; i++) this.tick(dt);
  }

  private onVisibility = (): void => {
    // Avoid a giant frame delta when the tab comes back.
    this.lastT = -1;
  };

  private frame = (tMs: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    if (this.manual) {
      this.lastT = -1;
      return;
    }
    const t = tMs / 1000;
    const dt = this.lastT < 0 ? 0 : t - this.lastT;
    this.lastT = t;
    if (this.fpsCap > 0) {
      this.sinceRender += dt;
      if (this.sinceRender < 1 / this.fpsCap - 0.002) return;
      this.tick(this.sinceRender);
      this.sinceRender = 0;
      return;
    }
    this.tick(dt);
  };

  private tick(frameDt: number): void {
    const clamped = Math.min(Math.max(frameDt, 0), this.stepper.maxFrame);
    if (!this.paused) this.stepper.advance(clamped, this.handlers.step);
    this.handlers.render(this.paused ? 1 : this.stepper.alpha, clamped);
  }
}

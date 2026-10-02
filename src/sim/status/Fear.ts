import { clamp } from '../../core/damp.ts';

/** Nerves: 0 calm .. 1 panic. */
export class Fear {
  value = 0;
  /** Seconds since the last threat contribution (recovery starts after a short delay). */
  private calmFor = 0;

  scare(amount: number): void {
    this.value = clamp(this.value + amount, 0, 1);
    this.calmFor = 0;
  }

  calm(amount: number): void {
    this.value = clamp(this.value - amount, 0, 1);
  }

  /**
   * @param threat 0..1 how menacing the surroundings are right now (entities near/visible)
   * @param darkness 0..1
   * @param courage 0..1 reduction from drinks
   */
  step(dt: number, threat: number, darkness: number, courage: number): void {
    const gain = (threat * 0.55 + darkness * 0.05) * (1 - 0.7 * clamp(courage, 0, 1));
    if (gain > 0.01) {
      this.value = clamp(this.value + gain * dt, 0, 1);
      this.calmFor = 0;
    } else {
      this.calmFor += dt;
      if (this.calmFor > 2.5) this.value = clamp(this.value - 0.07 * dt, 0, 1);
    }
  }

  get panicking(): boolean {
    return this.value > 0.85;
  }
}

/** Body heat for the cold realities: 1 warm .. 0 frozen. */
export class Cold {
  heat = 1;
  freezingFor = 0;

  /** @param exposure 0..1 how cold the current zone is; @param warmth 0..1 nearby fire / buff */
  step(dt: number, exposure: number, warmth: number): void {
    const loss = exposure * 0.022;
    const gain = warmth * 0.12;
    this.heat = clamp(this.heat + (gain - loss) * dt, 0, 1);
    if (this.heat <= 0.001) this.freezingFor += dt;
    else this.freezingFor = 0;
  }

  add(amount: number): void {
    this.heat = clamp(this.heat + amount, 0, 1);
  }

  get frozen(): boolean {
    return this.freezingFor > 6;
  }
}

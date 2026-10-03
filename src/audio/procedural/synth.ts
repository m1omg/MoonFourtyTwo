import type { Vector3 } from 'three';
import type { AudioSystem, Bus } from '../Audio.ts';
import type { Rng } from '../../core/rng.ts';
import type { Surface } from '../../sim/player/Controller.ts';

/**
 * Procedural sounds used until (and alongside) generated audio files: footsteps, glass clinks,
 * drones, mains hum, heartbeat, crowd murmur, rain. All scheduled on the audio clock.
 */
export class Synth {
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;

  constructor(
    private readonly audio: AudioSystem,
    private readonly rng: Rng,
  ) {}

  private get ctx(): AudioContext | null {
    return this.audio.ctx;
  }

  private noiseBuf(kind: 'white' | 'brown'): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (kind === 'white' && this.noise) return this.noise;
    if (kind === 'brown' && this.brown) return this.brown;
    const len = ctx.sampleRate * 4;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    let s = 987654321;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const w = (s / 0x7fffffff) * 2 - 1;
      if (kind === 'white') d[i] = w;
      else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    if (kind === 'white') this.noise = b;
    else this.brown = b;
    return b;
  }

  private out(bus: Bus, pos?: Vector3, refDistance = 1.5): { node: AudioNode; ctx: AudioContext } | null {
    const ctx = this.ctx;
    const busNode = this.audio.busNode(bus);
    if (!ctx || !busNode) return null;
    if (!pos) return { node: busNode, ctx };
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = 1.3;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(busNode);
    const rv = this.audio.reverbSend();
    if (rv) {
      const send = ctx.createGain();
      send.gain.value = 0.3;
      p.connect(send).connect(rv);
    }
    return { node: p, ctx };
  }

  footstep(surface: Surface, loudness: number, pos?: Vector3): void {
    const o = this.out('sfx', pos, 1);
    const nb = this.noiseBuf('white');
    if (!o || !nb) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.playbackRate.value = 0.8 + this.rng.next() * 0.4;
    const f = ctx.createBiquadFilter();
    const presets: Record<Surface, [BiquadFilterType, number, number, number]> = {
      wood: ['bandpass', 380, 1.2, 0.09],
      tile: ['bandpass', 1900, 1.5, 0.05],
      concrete: ['bandpass', 900, 0.9, 0.06],
      metal: ['bandpass', 2600, 6, 0.16],
      carpet: ['lowpass', 500, 0.7, 0.07],
      snow: ['bandpass', 1300, 0.6, 0.16],
      water: ['bandpass', 800, 0.8, 0.22],
      grass: ['highpass', 1500, 0.7, 0.1],
      gravel: ['bandpass', 2200, 0.8, 0.12],
    };
    const [type, freq, q, dur] = presets[surface];
    f.type = type;
    f.frequency.value = freq * (0.9 + this.rng.next() * 0.2);
    f.Q.value = q;
    const g = ctx.createGain();
    const v = Math.min(1, 0.22 * loudness);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v + 0.0001, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(node);
    src.start(t, this.rng.next() * 3, dur + 0.05);
    // body thump for wood/metal
    if (surface === 'wood' || surface === 'metal' || surface === 'concrete') {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(surface === 'metal' ? 140 : 90, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(v * 0.6, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(og).connect(node);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  /** Two glasses touching: inharmonic partials with fast decay. */
  clink(pos?: Vector3, strength = 1): void {
    const o = this.out('sfx', pos, 1);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const base = 1850 + this.rng.next() * 400;
    for (const [mul, amp, dec] of [
      [1, 0.25, 0.9],
      [2.32, 0.14, 0.6],
      [3.71, 0.08, 0.4],
      [5.12, 0.05, 0.25],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp * strength, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      osc.connect(g).connect(node);
      osc.start(t);
      osc.stop(t + dec + 0.05);
    }
  }

  /** Glass bottle shattering (bright noise burst + tinkles). */
  shatter(pos?: Vector3): void {
    const o = this.out('sfx', pos, 2);
    const nb = this.noiseBuf('white');
    if (!o || !nb) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nb;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(hp).connect(g).connect(node);
    src.start(t, this.rng.next() * 3, 0.4);
    for (let i = 0; i < 7; i++) {
      const osc = ctx.createOscillator();
      osc.frequency.value = 3000 + this.rng.next() * 4000;
      const og = ctx.createGain();
      const st = t + 0.03 + this.rng.next() * 0.35;
      og.gain.setValueAtTime(0.0001, st);
      og.gain.exponentialRampToValueAtTime(0.08, st + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, st + 0.15);
      osc.connect(og).connect(node);
      osc.start(st);
      osc.stop(st + 0.2);
    }
  }

  /** Hiss (steam, the creature). */
  hiss(pos: Vector3 | undefined, seconds: number, volume = 0.25): void {
    const o = this.out('sfx', pos, 1.5);
    const nb = this.noiseBuf('white');
    if (!o || !nb) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.value = 3200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.08);
    g.gain.setValueAtTime(volume, t + seconds * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(bp).connect(g).connect(node);
    src.start(t, this.rng.next() * 3);
    src.stop(t + seconds + 0.05);
  }

  /** Metallic clank (valves, pipes). */
  clank(pos?: Vector3, strength = 1): void {
    const o = this.out('sfx', pos, 2);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (const [f, a, d] of [
      [180, 0.4, 0.9],
      [427, 0.25, 0.6],
      [913, 0.12, 0.4],
      [1621, 0.06, 0.25],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f * (0.95 + this.rng.next() * 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a * strength, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g).connect(node);
      osc.start(t);
      osc.stop(t + d + 0.05);
    }
  }

  /** Rubber duck squeak: a short rising, nasal chirp. */
  squeak(pos?: Vector3, strength = 1): void {
    const o = this.out('sfx', pos, 1.5);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(1900, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.22);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * strength, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(bp).connect(g).connect(node);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Splash: something hitting water (strength ~0.3 wading .. 1 a thrown object). */
  splash(pos?: Vector3, strength = 1): void {
    const o = this.out('sfx', pos, 2);
    const nb = this.noiseBuf('white');
    if (!o || !nb) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nb;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4 * strength, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 + 0.3 * strength);
    src.connect(bp).connect(g).connect(node);
    src.start(t, this.rng.next() * 3, 0.7);
    // a couple of droplets
    for (let i = 0; i < 3; i++) this.drip(pos, 0.25 * strength, 0.08 + this.rng.next() * 0.35);
  }

  /** A single water drop (plink), optionally delayed. */
  drip(pos?: Vector3, volume = 0.12, delay = 0): void {
    const o = this.out('ambience', pos, 1.2);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f = 900 + this.rng.next() * 900;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(node);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Lifeguard whistle; `under` muffles it as if heard through water. */
  whistle(pos?: Vector3, under = false, volume = 0.3): void {
    const o = this.out('sfx', pos, 3);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 2900;
    // the pea's trill
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 38;
    const lg = ctx.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = under ? 420 : 6000;
    lp.Q.value = under ? 6 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume * (under ? 1.6 : 0.5), t + 0.03);
    g.gain.setValueAtTime(volume * (under ? 1.6 : 0.5), t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    osc.connect(lp).connect(g).connect(node);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.8);
    lfo.stop(t + 0.8);
  }

  /** Liquid pouring / gulping. */
  pour(seconds: number, pos?: Vector3, gulp = false): void {
    const o = this.out('sfx', pos, 1);
    const nb = this.noiseBuf('white');
    if (!o || !nb) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = gulp ? 420 : 1100;
    f.Q.value = gulp ? 3 : 1.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = gulp ? 3.2 : 9;
    const lfoG = ctx.createGain();
    lfoG.gain.value = gulp ? 250 : 400;
    lfo.connect(lfoG).connect(f.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gulp ? 0.18 : 0.12, t + 0.05);
    g.gain.setValueAtTime(gulp ? 0.18 : 0.12, t + seconds - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(f).connect(g).connect(node);
    src.start(t, this.rng.next() * 3);
    src.stop(t + seconds + 0.05);
    lfo.start(t);
    lfo.stop(t + seconds + 0.05);
  }

  /** Low distant thump(s) of a heartbeat. */
  heartbeat(strength: number): void {
    const o = this.out('sfx');
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (const [dt, a] of [
      [0, 1],
      [0.28, 0.7],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(70, t + dt);
      osc.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.5 * a * strength + 0.0001, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
      osc.connect(g).connect(node);
      osc.start(t + dt);
      osc.stop(t + dt + 0.25);
    }
  }

  /** Short UI tick / relay click. */
  click(pos?: Vector3, freq = 2200, vol = 0.15): void {
    const o = this.out(pos ? 'sfx' : 'ui', pos, 1);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(g).connect(node);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  /** A door hinge creaking: a stick-slip sawtooth through a resonant band. */
  creak(pos?: Vector3, seconds = 1.2, volume = 0.16): void {
    const o = this.out('sfx', pos, 1.5);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f0 = 60 + this.rng.next() * 30;
    osc.frequency.setValueAtTime(f0, t);
    const n = Math.max(3, Math.round(seconds * 7));
    for (let i = 1; i <= n; i++)
      osc.frequency.linearRampToValueAtTime(f0 * (0.7 + this.rng.next() * 1.1), t + (seconds * i) / n);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + this.rng.next() * 600;
    bp.Q.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.08);
    g.gain.setValueAtTime(volume, t + seconds * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(bp).connect(g).connect(node);
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  }

  /** A security chain rattling in its slot: a quick run of small metal clinks. */
  rattle(pos?: Vector3, strength = 1): void {
    const o = this.out('sfx', pos, 1.5);
    if (!o) return;
    const { ctx, node } = o;
    let t = ctx.currentTime;
    for (let i = 0; i < 9; i++) {
      t += 0.035 + this.rng.next() * 0.05;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 2600 + this.rng.next() * 2400;
      const g = ctx.createGain();
      const a = (0.05 + this.rng.next() * 0.06) * strength;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      osc.connect(g).connect(node);
      osc.start(t);
      osc.stop(t + 0.08);
    }
  }

  /** A door falling shut / a dull knock: a low pitched-down thump. */
  thud(pos?: Vector3, strength = 1): void {
    const o = this.out('sfx', pos, 2);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * strength, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(node);
    osc.start(t);
    osc.stop(t + 0.4);
    this.click(pos, 700, 0.08 * strength);
  }

  /** An old intercom / door buzzer: a harsh, mains-modulated square wave. */
  buzzer(pos?: Vector3, seconds = 0.8, volume = 0.12): void {
    const o = this.out('sfx', pos, 1.2);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 230;
    const am = ctx.createOscillator();
    am.frequency.value = 50;
    const amg = ctx.createGain();
    amg.gain.value = volume * 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    g.gain.setValueAtTime(volume, t + seconds);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.04);
    am.connect(amg).connect(g.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    osc.connect(lp).connect(g).connect(node);
    osc.start(t);
    am.start(t);
    osc.stop(t + seconds + 0.06);
    am.stop(t + seconds + 0.06);
  }

  /** A dry cart wheel squealing once (a housekeeping trolley). */
  wheel(pos?: Vector3, strength = 1): void {
    const o = this.out('sfx', pos, 1.5);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const f = 1500 + this.rng.next() * 500;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * (0.85 + this.rng.next() * 0.1), t + 0.16);
    const vib = ctx.createOscillator();
    vib.frequency.value = 31;
    const vg = ctx.createGain();
    vg.gain.value = 40;
    vib.connect(vg).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * strength, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g).connect(node);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 0.22);
    vib.stop(t + 0.22);
  }

  /** Sudden dissonant stinger for scares. */
  stinger(strength = 1): void {
    const o = this.out('sfx');
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (const f of [92, 97.5, 138, 277, 553]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 0.94, t + 2.2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4000, t);
      lp.frequency.exponentialRampToValueAtTime(300, t + 2.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 * strength, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      osc.connect(lp).connect(g).connect(node);
      osc.start(t);
      osc.stop(t + 2.7);
    }
  }

  /** Continuous layers. Each returns a stopper. */
  loopNoise(opts: {
    bus?: Bus;
    kind?: 'white' | 'brown';
    type?: BiquadFilterType;
    freq: number;
    q?: number;
    volume: number;
    pos?: Vector3;
    lfoRate?: number;
    lfoDepth?: number;
    ampLfoRate?: number;
    ampLfoDepth?: number;
  }): () => void {
    const o = this.out(opts.bus ?? 'ambience', opts.pos, 2);
    const nb = this.noiseBuf(opts.kind ?? 'brown');
    if (!o || !nb) return () => {};
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'lowpass';
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.volume, t + 1.5);
    const nodes: AudioScheduledSourceNode[] = [src];
    if (opts.lfoRate) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = opts.lfoRate;
      const lg = ctx.createGain();
      lg.gain.value = opts.lfoDepth ?? opts.freq * 0.3;
      lfo.connect(lg).connect(f.frequency);
      lfo.start(t);
      nodes.push(lfo);
    }
    if (opts.ampLfoRate) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = opts.ampLfoRate;
      const lg = ctx.createGain();
      lg.gain.value = opts.volume * (opts.ampLfoDepth ?? 0.4);
      lfo.connect(lg).connect(g.gain);
      lfo.start(t);
      nodes.push(lfo);
    }
    src.connect(f).connect(g).connect(node);
    src.start(t, this.rng.next() * 3);
    return () => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 1);
      for (const n of nodes) n.stop(now + 1.1);
    };
  }

  /** Detuned oscillator drone (horror bed). */
  drone(opts: {
    freqs: number[];
    type?: OscillatorType;
    cutoff: number;
    volume: number;
    bus?: Bus;
    wobble?: number;
  }): () => void {
    const o = this.out(opts.bus ?? 'ambience');
    if (!o) return () => {};
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = opts.cutoff;
    lp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.volume, t + 3);
    lp.connect(g).connect(node);
    const rv = this.audio.reverbSend();
    if (rv) {
      const s = ctx.createGain();
      s.gain.value = 0.6;
      g.connect(s).connect(rv);
    }
    const oscs: OscillatorNode[] = [];
    for (const f of opts.freqs) {
      for (const det of [-6, 5]) {
        const osc = ctx.createOscillator();
        osc.type = opts.type ?? 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = det + (this.rng.next() - 0.5) * 4;
        const og = ctx.createGain();
        og.gain.value = 1 / (opts.freqs.length * 2);
        osc.connect(og).connect(lp);
        osc.start(t);
        oscs.push(osc);
      }
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = opts.cutoff * (opts.wobble ?? 0.4);
    lfo.connect(lg).connect(lp.frequency);
    lfo.start(t);
    oscs.push(lfo);
    return () => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 2);
      for (const x of oscs) x.stop(now + 2.1);
    };
  }

  /** Fluorescent / mains hum at 50 Hz with harmonics (Europe). */
  hum(volume: number, pos?: Vector3): () => void {
    const o = this.out('ambience', pos, 1.5);
    if (!o) return () => {};
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(volume, t + 1);
    g.connect(node);
    const oscs: OscillatorNode[] = [];
    for (const [f, a] of [
      [100, 0.5],
      [200, 0.25],
      [300, 0.12],
      [50, 0.3],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = a;
      osc.connect(og).connect(g);
      osc.start(t);
      oscs.push(osc);
    }
    return () => {
      const now = ctx.currentTime;
      g.gain.setTargetAtTime(0, now, 0.2);
      for (const x of oscs) x.stop(now + 1);
    };
  }
}

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

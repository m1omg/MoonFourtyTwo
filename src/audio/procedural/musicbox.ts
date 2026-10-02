import type { Vector3 } from 'three';
import type { AudioSystem } from '../Audio.ts';

/**
 * Tiny sequencer for placeholder tunes (jukebox, music boxes) until generated tracks exist.
 * Notes are semitones relative to A4 (null = rest); scheduling uses the audio clock.
 */
export interface Tune {
  bpm: number;
  /** [semitone|null, beats] */
  melody: Array<[number | null, number]>;
  /** Bass pattern, one note per beat (semitones relative to A2), looped. */
  bass?: Array<number | null>;
  /** 'accordion' | 'musicbox' | 'brass' */
  voice: 'accordion' | 'musicbox' | 'brass';
  /** Playback speed multiplier (slowed, eerie variants use < 1). */
  rate?: number;
  detune?: number;
}

export const TUNES: Record<string, Tune> = {
  esteJedno: {
    bpm: 112,
    voice: 'accordion',
    melody: [
      [-7, 1],
      [-4, 1],
      [0, 1.5],
      [-2, 0.5],
      [-4, 1],
      [-7, 1],
      [-5, 2],
      [-5, 1],
      [-2, 1],
      [2, 1.5],
      [0, 0.5],
      [-2, 1],
      [-5, 1],
      [-4, 2],
      [-7, 1],
      [-4, 1],
      [0, 1.5],
      [-2, 0.5],
      [-4, 1],
      [0, 1],
      [3, 2],
      [2, 1],
      [0, 1],
      [-2, 1],
      [-4, 1],
      [-5, 1],
      [-7, 1],
      [-7, 2],
    ],
    bass: [-12, null, -5, null, -12, null, -5, null, -14, null, -7, null, -10, null, -3, null],
  },
  dychovka: {
    bpm: 132,
    voice: 'brass',
    melody: [
      [0, 0.5],
      [2, 0.5],
      [4, 0.5],
      [5, 0.5],
      [7, 1],
      [7, 1],
      [9, 0.5],
      [7, 0.5],
      [5, 0.5],
      [4, 0.5],
      [2, 2],
      [2, 0.5],
      [4, 0.5],
      [5, 0.5],
      [7, 0.5],
      [9, 1],
      [9, 1],
      [11, 0.5],
      [9, 0.5],
      [7, 0.5],
      [5, 0.5],
      [4, 2],
    ],
    bass: [-12, -5, -12, -5, -10, -3, -10, -3],
  },
  nocnySpoj: {
    bpm: 70,
    voice: 'musicbox',
    melody: [
      [3, 1],
      [7, 1],
      [10, 1],
      [7, 1],
      [3, 1],
      [2, 1],
      [-2, 2],
      [0, 1],
      [3, 1],
      [7, 1],
      [3, 1],
      [0, 1],
      [-2, 1],
      [-5, 2],
    ],
  },
};

export class MusicBox {
  private stopAt = 0;
  private timer = 0;
  private nextTime = 0;
  private idx = 0;
  private bassIdx = 0;
  private beatAcc = 0;
  private out: GainNode | null = null;
  private panner: PannerNode | null = null;
  playing = false;

  constructor(private readonly audio: AudioSystem) {}

  play(tune: Tune, pos?: Vector3, volume = 0.35): void {
    this.stop();
    const ctx = this.audio.ctx;
    if (!ctx) return;
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    if (pos) {
      this.panner = ctx.createPanner();
      this.panner.panningModel = 'HRTF';
      this.panner.refDistance = 2;
      this.panner.rolloffFactor = 1.1;
      this.panner.positionX.value = pos.x;
      this.panner.positionY.value = pos.y;
      this.panner.positionZ.value = pos.z;
      this.out.connect(this.panner).connect(this.audio.busNode('music')!);
      const rv = this.audio.reverbSend();
      if (rv) {
        const s = ctx.createGain();
        s.gain.value = 0.4;
        this.panner.connect(s).connect(rv);
      }
    } else this.out.connect(this.audio.busNode('music')!);
    this.playing = true;
    this.idx = 0;
    this.bassIdx = 0;
    this.beatAcc = 0;
    this.nextTime = ctx.currentTime + 0.1;
    const rate = tune.rate ?? 1;
    const beat = 60 / tune.bpm / rate;
    const schedule = () => {
      if (!this.playing || !this.out) return;
      while (this.nextTime < ctx.currentTime + 0.3) {
        const [note, beats] = tune.melody[this.idx % tune.melody.length]!;
        const dur = beats * beat;
        if (note !== null)
          this.voice(tune, 440 * Math.pow(2, (note + (tune.detune ?? 0)) / 12), this.nextTime, dur);
        if (tune.bass) {
          // one bass note per beat boundary covered by this melody note
          const startBeat = this.beatAcc;
          this.beatAcc += beats;
          for (let b = Math.ceil(startBeat - 1e-6); b < this.beatAcc - 1e-6; b++) {
            const bn = tune.bass[this.bassIdx++ % tune.bass.length];
            if (bn !== null && bn !== undefined)
              this.bassNote(110 * Math.pow(2, bn / 12), this.nextTime + (b - startBeat) * beat, beat * 0.9);
          }
        }
        this.nextTime += dur;
        this.idx++;
      }
      this.timer = window.setTimeout(schedule, 100);
    };
    schedule();
  }

  private voice(tune: Tune, f: number, t: number, dur: number): void {
    const ctx = this.audio.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = tune.voice === 'musicbox' ? 6000 : tune.voice === 'brass' ? 2200 : 2600;
    g.connect(lp).connect(this.out!);
    const env = (a: number, d: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    };
    if (tune.voice === 'musicbox') {
      env(0.35, Math.max(0.6, dur * 1.5));
      for (const [mul, amp] of [
        [1, 1],
        [4, 0.15],
      ]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * 2 * mul;
        const og = ctx.createGain();
        og.gain.value = amp;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + Math.max(0.6, dur * 1.5) + 0.05);
      }
      return;
    }
    env(0.22, dur * 0.95);
    const types: OscillatorType[] =
      tune.voice === 'brass' ? ['sawtooth', 'square'] : ['sawtooth', 'sawtooth', 'square'];
    types.forEach((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * (i === 2 ? 2 : 1);
      o.detune.value = i === 1 ? 9 : i === 0 ? -6 : 0;
      const og = ctx.createGain();
      og.gain.value = i === 2 ? 0.15 : 0.35;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  private bassNote(f: number, t: number, dur: number): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  stop(): void {
    this.playing = false;
    clearTimeout(this.timer);
    if (this.out && this.audio.ctx) {
      const t = this.audio.ctx.currentTime;
      this.out.gain.setTargetAtTime(0, t, 0.08);
      const o = this.out;
      const p = this.panner;
      setTimeout(() => {
        o.disconnect();
        p?.disconnect();
      }, 600);
    }
    this.out = null;
    this.panner = null;
    void this.stopAt;
  }
}

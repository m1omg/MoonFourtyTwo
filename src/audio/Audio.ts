import type { Camera, Vector3 } from 'three';
import { Vector3 as V3 } from 'three';
import type { Rng } from '../core/rng.ts';

export type Bus = 'music' | 'ambience' | 'sfx' | 'voice' | 'ui';

export interface PlayOptions {
  bus?: Bus;
  volume?: number;
  loop?: boolean;
  rate?: number;
  /** Seconds offset into the buffer. */
  offset?: number;
  /** Fade-in seconds. */
  fadeIn?: number;
  /** Send amount to the reverb (0..1). */
  reverb?: number;
}

export interface Play3DOptions extends PlayOptions {
  refDistance?: number;
  maxDistance?: number;
  rolloff?: number;
}

export interface SoundHandle {
  stop(fade?: number): void;
  setVolume(v: number, ramp?: number): void;
  setPosition?(p: Vector3): void;
  setRate?(r: number): void;
  readonly ended: boolean;
}

const _fwd = new V3();
const _up = new V3();

/**
 * Web Audio graph: buses -> master -> limiter -> destination, with a shared reverb send.
 * The context is created on the first user gesture (mobile autoplay rules).
 */
export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses = new Map<Bus, GainNode>();
  private reverb!: ConvolverNode;
  private reverbIn!: GainNode;
  private reverbOut!: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private hrtf = true;
  private volumes: Record<Bus | 'master', number> = {
    master: 0.9,
    music: 0.7,
    ambience: 0.8,
    sfx: 0.9,
    voice: 1,
    ui: 0.7,
  };
  /** Muted for tests. */
  muted = false;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    // iOS: play a silent buffer inside the gesture.
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start();
  }

  setHrtf(on: boolean): void {
    this.hrtf = on;
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.master.connect(limiter).connect(ctx.destination);
    for (const b of ['music', 'ambience', 'sfx', 'voice', 'ui'] as Bus[]) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses.set(b, g);
    }
    this.reverbIn = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.5;
    this.reverbIn.connect(this.reverb).connect(this.reverbOut).connect(this.master);
    this.setReverb(1.6, 0.35);
    this.applyVolumes();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    });
  }

  setVolume(bus: Bus | 'master', v: number): void {
    this.volumes[bus] = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    for (const [b, g] of this.buses) g.gain.setTargetAtTime(this.volumes[b], t, 0.05);
  }

  /** Procedural impulse response: exponentially decaying stereo noise. */
  setReverb(decaySec: number, wet: number, rng?: Rng): void {
    if (!this.ctx) return;
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * Math.min(decaySec, 6)));
    const ir = this.ctx.createBuffer(2, len, rate);
    let seed = 1234567;
    const rnd = () => (rng ? rng.next() : (seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    this.reverbOut.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.2);
  }

  load(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${url}`))))
        .then((ab) => this.decode(ab))
        .catch((e) => {
          console.warn('audio load failed', url, e);
          return null;
        });
      this.buffers.set(url, p);
    }
    return p;
  }

  private decode(ab: ArrayBuffer): Promise<AudioBuffer> {
    // A context can decode even while suspended; create an offline one if not unlocked yet.
    const ctx = this.ctx ?? new OfflineAudioContext(1, 1, 44100);
    return ctx.decodeAudioData(ab);
  }

  /** Releases cached buffers not in `keep`. */
  evict(keep: Set<string>): void {
    for (const k of [...this.buffers.keys()]) if (!keep.has(k)) this.buffers.delete(k);
  }

  updateListener(camera: Camera): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const e = camera.matrixWorld.elements;
    _fwd.set(-e[8]!, -e[9]!, -e[10]!).normalize();
    _up.set(e[4]!, e[5]!, e[6]!).normalize();
    const px = e[12]!;
    const py = e[13]!;
    const pz = e[14]!;
    if (l.positionX) {
      l.positionX.value = px;
      l.positionY.value = py;
      l.positionZ.value = pz;
      l.forwardX.value = _fwd.x;
      l.forwardY.value = _fwd.y;
      l.forwardZ.value = _fwd.z;
      l.upX.value = _up.x;
      l.upY.value = _up.y;
      l.upZ.value = _up.z;
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(px, py, pz);
      (l as unknown as { setOrientation(...a: number[]): void }).setOrientation(
        _fwd.x,
        _fwd.y,
        _fwd.z,
        _up.x,
        _up.y,
        _up.z,
      );
    }
  }

  play(buffer: AudioBuffer | null, opts: PlayOptions = {}): SoundHandle | null {
    if (!this.ctx || !buffer) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    const vol = opts.volume ?? 1;
    if (opts.fadeIn) {
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + opts.fadeIn);
    } else gain.gain.value = vol;
    src.connect(gain).connect(this.buses.get(opts.bus ?? 'sfx')!);
    if (opts.reverb) {
      const send = ctx.createGain();
      send.gain.value = opts.reverb;
      gain.connect(send).connect(this.reverbIn);
    }
    src.start(0, opts.offset ?? 0);
    return this.handle(src, gain);
  }

  play3D(buffer: AudioBuffer | null, pos: Vector3, opts: Play3DOptions = {}): SoundHandle | null {
    if (!this.ctx || !buffer) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.rate ?? 1;
    const panner = ctx.createPanner();
    panner.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = opts.refDistance ?? 1.5;
    panner.maxDistance = opts.maxDistance ?? 60;
    panner.rolloffFactor = opts.rolloff ?? 1.2;
    setPannerPos(panner, pos);
    const gain = ctx.createGain();
    const vol = opts.volume ?? 1;
    if (opts.fadeIn) {
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + opts.fadeIn);
    } else gain.gain.value = vol;
    src
      .connect(gain)
      .connect(panner)
      .connect(this.buses.get(opts.bus ?? 'sfx')!);
    const send = ctx.createGain();
    send.gain.value = opts.reverb ?? 0.35;
    panner.connect(send).connect(this.reverbIn);
    src.start(0, opts.offset ?? 0);
    const h = this.handle(src, gain) as SoundHandle & { setPosition(p: Vector3): void };
    h.setPosition = (p: Vector3) => setPannerPos(panner, p);
    return h;
  }

  private handle(src: AudioBufferSourceNode, gain: GainNode): SoundHandle {
    const ctx = this.ctx!;
    let ended = false;
    src.onended = () => {
      ended = true;
      src.disconnect();
      gain.disconnect();
    };
    return {
      stop: (fade = 0.05) => {
        if (ended) return;
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
        try {
          src.stop(t + Math.max(0.01, fade) + 0.02);
        } catch {
          /* already stopped */
        }
      },
      setVolume: (v: number, ramp = 0.1) => {
        gain.gain.setTargetAtTime(v, ctx.currentTime, Math.max(0.005, ramp / 3));
      },
      setRate: (r: number) => {
        src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.05);
      },
      get ended() {
        return ended;
      },
    };
  }

  /** Shared destination for procedural generators. */
  busNode(bus: Bus): AudioNode | null {
    return this.buses.get(bus) ?? null;
  }

  reverbSend(): AudioNode | null {
    return this.reverbIn ?? null;
  }
}

function setPannerPos(p: PannerNode, v: Vector3): void {
  if (p.positionX) {
    p.positionX.value = v.x;
    p.positionY.value = v.y;
    p.positionZ.value = v.z;
  } else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(v.x, v.y, v.z);
}

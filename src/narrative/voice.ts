import { assetUrl } from '../assets/Loader.ts';

/** Known recorded voice lines (from public/assets/voice/index.json). */
let available: Set<string> | null = null;
let loading: Promise<void> | null = null;

export function loadVoiceIndex(): Promise<void> {
  if (!loading) {
    loading = fetch(assetUrl('assets/voice/index.json'))
      .then((r) => (r.ok ? r.json() : []))
      .then((list: string[]) => {
        available = new Set(list);
      })
      .catch(() => {
        available = new Set();
      });
  }
  return loading;
}

/**
 * Every line is shipped as Opus (open) and MP3. Opus goes first where the browser says it plays
 * it: Linux builds without the proprietary codec library (Vivaldi without its ffmpeg package, for
 * one) decode no MP3 at all. The other file is the fallback when decoding fails.
 */
const preferOpus = (() => {
  try {
    return new Audio().canPlayType('audio/ogg; codecs="opus"') !== '';
  } catch {
    return false;
  }
})();

export function voiceUrl(id: string): string[] | undefined {
  if (!available?.has(id)) return undefined;
  const ogg = assetUrl(`assets/voice/${id}.ogg`);
  const mp3 = assetUrl(`assets/voice/${id}.mp3`);
  return preferOpus ? [ogg, mp3] : [mp3, ogg];
}

export interface Line {
  who: string | null;
  text: string;
  /** Minimum on-screen time. */
  min?: number;
  laugh?: boolean;
}

export type Lines = Record<string, Line>;

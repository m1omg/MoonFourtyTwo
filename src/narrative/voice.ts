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

export function voiceUrl(id: string): string | undefined {
  return available?.has(id) ? assetUrl(`assets/voice/${id}.mp3`) : undefined;
}

export interface Line {
  who: string | null;
  text: string;
  /** Minimum on-screen time. */
  min?: number;
  laugh?: boolean;
}

export type Lines = Record<string, Line>;

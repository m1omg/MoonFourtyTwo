import type { QualityTier } from '../render/quality.ts';

export interface DebugOptions {
  reality?: string;
  checkpoint?: string;
  quality?: QualityTier;
  bac?: number;
  god?: boolean;
  fly?: boolean;
  stats?: boolean;
  test?: boolean;
  seed?: number;
  /** Skip warning/title (dev). */
  quick?: boolean;
}

/** Parses `#r5:cp2&q=low&bac=1.5&god&fly&stats&test&seed=7`. */
export function parseDebugHash(hash: string): DebugOptions {
  const h = hash.replace(/^#/, '');
  if (!h) return {};
  const out: DebugOptions = {};
  for (const part of h.split('&')) {
    const [k, v] = part.split('=') as [string, string | undefined];
    if (/^r\d+/.test(k)) {
      const [r, cp] = k.split(':') as [string, string | undefined];
      out.reality = r;
      if (cp) out.checkpoint = cp;
      out.quick = true;
    } else if (k === 'q' && (v === 'low' || v === 'med' || v === 'high')) out.quality = v;
    else if (k === 'bac' && v) out.bac = Number(v);
    else if (k === 'god') out.god = true;
    else if (k === 'fly') out.fly = true;
    else if (k === 'stats') out.stats = true;
    else if (k === 'test') {
      out.test = true;
      out.quick = true;
    } else if (k === 'seed' && v) out.seed = Number(v);
    else if (k === 'quick') out.quick = true;
  }
  return out;
}

import type { RealityModule } from '../world/Reality.ts';

/** One dynamic import per reality so only the current one is downloaded. */
export const REALITIES: Record<string, () => Promise<{ default: RealityModule }>> = {
  r0: () => import('./r00_test/index.ts'),
};

export const REALITY_ORDER = ['r0'];

export function realityExists(id: string): boolean {
  return id in REALITIES;
}

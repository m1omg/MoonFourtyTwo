import type { RealityModule } from '../world/Reality.ts';

/** One dynamic import per reality so only the current one is downloaded. */
export const REALITIES: Record<string, () => Promise<{ default: RealityModule }>> = {
  r0: () => import('./r00_test/index.ts'),
  r1: () => import('./r01_pub/index.ts'),
  r3: () => import('./r03_hall/index.ts'),
  r4: () => import('./r04_cellar/index.ts'),
  r5: () => import('./r05_spa/index.ts'),
};

export const REALITY_ORDER = ['r1'];

export function realityExists(id: string): boolean {
  return id in REALITIES;
}

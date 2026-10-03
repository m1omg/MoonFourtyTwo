import type { RealityModule } from '../world/Reality.ts';

/** One dynamic import per reality so only the current one is downloaded. */
export const REALITIES: Record<string, () => Promise<{ default: RealityModule }>> = {
  r0: () => import('./r00_test/index.ts'),
  r1: () => import('./r01_pub/index.ts'),
  r3: () => import('./r03_hall/index.ts'),
  r4: () => import('./r04_cellar/index.ts'),
  r5: () => import('./r05_spa/index.ts'),
  r6: () => import('./r06_block/index.ts'),
  r7: () => import('./r07_hotel/index.ts'),
  r8: () => import('./r08_valley/index.ts'),
  r9: () => import('./r09_bus/index.ts'),
  r10: () => import('./r10_sea/index.ts'),
  r11: () => import('./r11_round/index.ts'),
  r12: () => import('./r12_light/index.ts'),
};

export const REALITY_ORDER = ['r1'];

export function realityExists(id: string): boolean {
  return id in REALITIES;
}

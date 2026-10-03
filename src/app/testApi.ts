import type { Game } from './Game.ts';
import type { Action } from '../input/actions.ts';

/** Deterministic hooks for Playwright (`#…&test`). The loop is driven manually. */
export function installTestApi(game: Game): void {
  const api = {
    get ready(): boolean {
      return game.mode === 'play';
    },
    get mode(): string {
      return game.mode;
    },
    /** Advances `seconds` of game time in frames of 1/hz. */
    step(seconds: number, hz = 60): void {
      game.loop.manualFrames(Math.round(seconds * hz), hz);
    },
    /** Simulates without rendering intermediate frames (much faster under software GL). */
    sim(seconds: number): void {
      game.loop.manualSim(seconds);
    },
    frames(n: number, hz: number): void {
      game.loop.manualFrames(n, hz);
    },
    move(x: number, y: number, sprint = false): void {
      game.input.setTouchMove(x, y, sprint);
    },
    look(dxPx: number, dyPx: number): void {
      game.input.addTouchLook(dxPx, dyPx);
    },
    press(a: Action): void {
      game.input.press(a);
    },
    teleport(x: number, y: number, z: number, yaw = 0): void {
      game.player.teleport({ x, y, z } as never, yaw);
      game.rig.setOrientation(yaw, 0);
    },
    info(): Record<string, unknown> {
      const p = game.player.pos;
      return {
        reality: game.realityId,
        checkpoint: game.checkpoint,
        pos: [p.x, p.y, p.z],
        grounded: game.player.grounded,
        bac: game.status.intox.bac,
        fear: game.status.fear.value,
        simTime: game.clock.time,
        ticks: game.loop.stepper.ticks,
        render: game.renderer.info,
        entities: game.entities.map((e) => ({ id: e.id, state: e.state, pos: [e.pos.x, e.pos.y, e.pos.z] })),
        focused: game.interactions.focused?.id ?? null,
        flags: game.flags.toJSON(),
      };
    },
    /** Uses an interactable by id (bypasses aiming). */
    use(id: string): boolean {
      const it = game.interactions.get(id);
      if (!it || (it.enabled && !it.enabled())) return false;
      it.onUse();
      return true;
    },
    /** Picks the i-th option of the open choice menu. */
    pick(i: number): boolean {
      const b = document.querySelectorAll<HTMLButtonElement>('.choices button')[i];
      if (!b) return false;
      b.click();
      return true;
    },
    get choosing(): boolean {
      return game.ui.choosing;
    },
    setBac(v: number): void {
      game.status.intox.set(v);
    },
    inventory(): Array<{ item: string | null; count: number }> {
      return game.inventory.slots.map((s) => ({ item: s.item, count: s.count }));
    },
    subtitle(): string {
      return document.querySelector('.subtitles')?.textContent ?? '';
    },
    /** Emits a noise event (creatures that hunt by sound react to it). */
    noise(x: number, y: number, z: number, loudness = 1): void {
      game.addNoise({ x, y, z, loudness, kind: 'object' });
    },
    goto(id: string, cp?: string): Promise<void> {
      return game.startReality(id, cp, true);
    },
  };
  (window as unknown as { __mf42: typeof api }).__mf42 = api;
}

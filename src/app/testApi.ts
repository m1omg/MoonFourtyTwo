import type { NoiseEvent } from '../sim/ai/types.ts';
import type { ItemId } from '../sim/items/items.data.ts';
import type { Game } from './Game.ts';
import type { Action } from '../input/actions.ts';
import type { InstancedMesh, Mesh, Object3D } from 'three';

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
    /** Turns the view toward a world point (from the player's eyes, effective at once). */
    aim(x: number, y: number, z: number): void {
      const p = game.player;
      const dx = x - p.pos.x;
      const dz = z - p.pos.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(y - (p.pos.y + p.eyeHeight()), Math.hypot(dx, dz));
      game.rig.setOrientation(yaw, pitch);
      p.yaw = yaw;
      p.pitch = pitch;
    },
    /**
     * What the visible scene is made of, for budgets: meshes, draw groups and triangles, keyed by
     * placed prop (or the nearest named ancestor). Ignores frustum culling.
     */
    census(): Array<{ key: string; meshes: number; draws: number; tris: number; shadow: number }> {
      const out = new Map<
        string,
        { key: string; meshes: number; draws: number; tris: number; shadow: number }
      >();
      game.scene?.traverseVisible((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        let key = '';
        for (let p: Object3D | null = o; p && !key; p = p.parent) {
          const prop = p.userData.prop as string | undefined;
          if (prop) key = `prop:${prop}`;
          else if (p.name && p.parent) key = p.name;
        }
        key ||= m.type;
        const g = m.geometry;
        const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
        const inst = (m as InstancedMesh).isInstancedMesh ? (m as InstancedMesh).count : 1;
        const groups = Array.isArray(m.material) ? Math.max(1, g.groups.length) : 1;
        const e = out.get(key) ?? { key, meshes: 0, draws: 0, tris: 0, shadow: 0 };
        e.meshes++;
        e.draws += groups;
        e.tris += Math.round((n / 3) * inst);
        if (m.castShadow) e.shadow += groups;
        out.set(key, e);
      });
      return [...out.values()].sort((a, b) => b.draws - a.draws);
    },
    /** Where an interactable is (null if there is none with that id). */
    where(id: string): [number, number, number] | null {
      const it = game.interactions.get(id);
      return it ? [it.pos.x, it.pos.y, it.pos.z] : null;
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
        mats: [...game.mats],
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
    /** Puts items into the inventory and selects the slot holding them. */
    give(id: ItemId, n = 1): void {
      game.inventory.add(id, n);
      const i = game.inventory.slots.findIndex((sl) => sl.item === id);
      if (i >= 0) game.inventory.select(i);
    },
    /** Emits a noise event (creatures that hunt by sound react to it). */
    noise(x: number, y: number, z: number, loudness = 1, kind: NoiseEvent['kind'] = 'object'): void {
      game.addNoise({ x, y, z, loudness, kind });
    },
    goto(id: string, cp?: string): Promise<void> {
      return game.startReality(id, cp, true);
    },
  };
  (window as unknown as { __mf42: typeof api }).__mf42 = api;
}

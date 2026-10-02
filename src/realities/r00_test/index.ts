import {
  AmbientLight,
  Color,
  FogExp2,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  SpotLight,
  Vector3,
} from 'three';
import type { RealityModule } from '../../world/Reality.ts';
import { NavGrid, Area } from '../../sim/ai/nav/NavGrid.ts';
import { Entity } from '../../sim/ai/Entity.ts';
import type { AIContext } from '../../sim/ai/types.ts';
import { canSeePlayer } from '../../sim/ai/perception.ts';

/** Greybox test room for engine checks (#r0). */
class Wanderer extends Entity {
  private target = new Vector3();
  protected step(dt: number, ctx: AIContext): void {
    const sees = canSeePlayer(this.pos, this.yaw, { range: 12, halfAngle: 0.8, eyeHeight: 1.6 }, ctx);
    this.anim.alert = sees ? 1 : 0;
    if (sees) {
      this.setState('chase');
      this.target.copy(ctx.player.pos);
      if (this.moveTo(this.target, 1.6, dt, ctx) < 0.7) ctx.catchPlayer(this.id);
      return;
    }
    if (this.state !== 'patrol' || this.stateTime > 6 || this.pos.distanceTo(this.target) < 0.5) {
      this.setState('patrol');
      this.target.set(ctx.rng.range(-8, 8), 0, ctx.rng.range(-8, 8));
    }
    this.moveTo(this.target, 1.0, dt, ctx);
  }
}

const reality: RealityModule = {
  id: 'r0',
  index: 0,
  title: 'Skúšobná miestnosť',
  async create({ game, scene, builder, mats, scope }) {
    scene.background = new Color(0x101010);
    scene.fog = new FogExp2(0x101010, 0.03);
    const floor = mats.get('floor', {
      proc: 'planks',
      color: 0x6b4a2f,
      uvScale: 2.2,
      surface: 'wood',
      tex: 'wood_floor',
    });
    const wall = mats.get('wall', {
      proc: 'plaster',
      color: 0xb8ad98,
      uvScale: 2,
      surface: 'concrete',
      tex: 'painted_plaster_wall',
    });
    const tile = mats.get('tile', { proc: 'tiles', color: 0xdfe8ea, uvScale: 1.2, surface: 'tile' });
    builder.floor(-10, -10, 10, 10, 0, floor);
    builder.ceiling(-10, -10, 10, 10, 3.2, wall);
    builder.wall(-10, -10, 10, -10, 0, 3.2, wall, 0.2, [{ at: 10, width: 1.2, bottom: 0, top: 2.1 }]);
    builder.wall(-10, 10, 10, 10, 0, 3.2, wall);
    builder.wall(-10, -10, -10, 10, 0, 3.2, wall);
    builder.wall(10, -10, 10, 10, 0, 3.2, wall);
    builder.box([2, 0, 2], [3, 1, 3], tile);
    builder.box([-4, 0, 3], [-2, 0.9, 5], tile);
    builder.stairs(5, -6, 2, 3, 0, 1.2, '+x', tile, 6);
    builder.box([8, 0, -6], [10, 1.2, -4], tile, { walkSurface: true });

    const amb = new AmbientLight(0x404050, 0.6);
    const lamp = new PointLight(0xffc27a, 18, 14, 2);
    lamp.position.set(0, 2.9, 0);
    const spot = new SpotLight(0xffe0b0, 30, 18, 0.6, 0.5, 1.5);
    spot.position.set(-5, 3, -5);
    spot.castShadow = game.renderer.profile.shadows;
    scene.add(amb, lamp, spot, spot.target);

    const nav = new NavGrid(40, 40, 0.5, -10, -10);
    nav.fillRect(-9.7, -9.7, 9.7, 9.7, Area.WALK);
    nav.fillRect(1.6, 1.6, 3.4, 3.4, 0, true);
    nav.fillRect(-4.4, 2.6, -1.6, 5.4, 0, true);
    game.nav = nav;

    const w = new Wanderer('wanderer', 'test');
    w.place(6, 0, 6);
    game.entities.push(w);
    const body = new Mesh(
      new SphereGeometry(0.35, 16, 12),
      new MeshStandardMaterial({ color: 0x881111, roughness: 0.4 }),
    );
    scope.add(body.geometry);
    scope.add(body.material);
    scene.add(body);

    game.interactions.add({
      id: 'box',
      pos: new Vector3(2.5, 1.05, 2.5),
      radius: 0.3,
      prompt: 'Vziať pivo',
      onUse: () => {
        game.inventory.add('pivo');
        game.synth.clink(new Vector3(2.5, 1, 2.5));
      },
    });

    return {
      defaultCheckpoint: 'start',
      checkpoints: { start: { pos: new Vector3(0, 0, 6), yaw: 0 } },
      start() {
        game.inventory.add('borovicka', 2);
      },
      frame(_dt, alpha) {
        body.position.lerpVectors(w.prevPos, w.pos, alpha).setY(1.2);
        (body.material as MeshStandardMaterial).emissive.setRGB(w.anim.alert * 0.8, 0, 0);
      },
      visibility: () => 0.8,
    };
  },
};

export default reality;

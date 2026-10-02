import { BoxGeometry, Group, Matrix4, Mesh, Vector3 } from 'three';
import type { Material } from 'three';
import type { CollisionWorld, DynamicBody } from '../../sim/physics/CollisionWorld.ts';
import type { Scope } from '../../core/scope.ts';
import { approach } from '../../core/damp.ts';

/**
 * Hinged door. The leaf is a box hinged at `hinge`; closed it spans `width` along +X of the door
 * frame (rotated by `rotY`). Its collider follows the leaf; opening animates on sim ticks.
 */
export class Door {
  readonly pivot = new Group();
  readonly leaf: Mesh;
  angle = 0;
  target = 0;
  locked = false;
  /** Degrees per second. */
  speed = 160;
  private body: DynamicBody;
  private m = new Matrix4();

  constructor(
    scope: Scope,
    private readonly world: CollisionWorld,
    hinge: [number, number, number],
    rotY: number,
    readonly width: number,
    height: number,
    material: Material,
    /** +1 opens counter-clockwise (seen from above), -1 clockwise. */
    readonly openDir: 1 | -1 = 1,
    thickness = 0.05,
  ) {
    this.pivot.position.set(...hinge);
    this.pivot.rotation.y = rotY;
    const geo = scope.add(new BoxGeometry(width, height, thickness));
    geo.translate(width / 2, height / 2, 0);
    this.leaf = new Mesh(geo, material);
    this.leaf.castShadow = true;
    this.leaf.receiveShadow = true;
    this.pivot.add(this.leaf);
    const col = scope.add(new BoxGeometry(width, height, thickness + 0.04));
    col.translate(width / 2, height / 2, 0);
    this.pivot.updateMatrixWorld(true);
    this.body = world.addDynamic(col, this.leaf.matrixWorld);
  }

  open(maxDeg = 100): void {
    if (!this.locked) this.target = maxDeg;
  }

  close(): void {
    this.target = 0;
  }

  get isOpen(): boolean {
    return this.angle > 20;
  }

  get moving(): boolean {
    return Math.abs(this.angle - this.target) > 0.01;
  }

  /** Sim step. */
  step(dt: number): void {
    if (Math.abs(this.angle - this.target) < 1e-3) return;
    this.angle = approach(this.angle, this.target, this.speed * dt);
    this.leaf.rotation.y = this.openDir * this.angle * (Math.PI / 180);
    this.pivot.updateMatrixWorld(true);
    this.m.copy(this.leaf.matrixWorld);
    this.world.updateDynamic(this.body, this.m);
    // while (nearly) open the leaf stays solid; it only stops blocking the doorway itself
  }

  /** World position of the handle side (for interaction prompts). */
  handlePos(out = new Vector3()): Vector3 {
    this.pivot.updateMatrixWorld(true);
    return out.set(this.width - 0.1, 1.05, 0.05).applyMatrix4(this.leaf.matrixWorld);
  }
}

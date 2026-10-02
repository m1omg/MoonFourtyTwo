import { Group, Quaternion, Vector3 } from 'three';
import type { Object3D, SkinnedMesh, Bone, Mesh } from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { damp, dampAngle, clamp } from '../core/damp.ts';

const D = Math.PI / 180;
type Axis = 'x' | 'y' | 'z';
/** A pose rotation: bone, axis in character space, angle in degrees. */
export type PoseRot = [bone: string, axis: Axis, deg: number];

/** Standing at rest: arms lowered from the A-pose. */
export const POSE_STAND: PoseRot[] = [
  ['LeftArm', 'z', -48],
  ['RightArm', 'z', 48],
  ['LeftForeArm', 'x', -10],
  ['RightForeArm', 'x', -10],
];

/** Sitting at a table, left forearm resting on the table top. */
export const POSE_SIT: PoseRot[] = [
  ['LeftUpLeg', 'x', -86],
  ['RightUpLeg', 'x', -86],
  ['LeftLeg', 'x', 90],
  ['RightLeg', 'x', 90],
  ['Spine02', 'x', 7],
  ['LeftArm', 'z', -24],
  ['LeftArm', 'x', -38],
  ['LeftArm', 'y', -12],
  ['LeftForeArm', 'x', -52],
  ['LeftForeArm', 'y', -30],
];

const ARM_REST: PoseRot[] = [
  ['RightArm', 'z', 24],
  ['RightArm', 'x', -36],
  ['RightArm', 'y', 12],
  ['RightForeArm', 'x', -50],
  ['RightForeArm', 'y', 28],
];
const ARM_DRINK: PoseRot[] = [
  ['RightArm', 'z', 22],
  ['RightArm', 'x', -60],
  ['RightArm', 'y', 8],
  ['RightForeArm', 'x', -112],
  ['RightForeArm', 'y', 6],
];
const ARM_HANG: PoseRot[] = [
  ['RightArm', 'z', 48],
  ['RightForeArm', 'x', -10],
];

const AXES: Record<Axis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};
const _pq = new Quaternion();
const _q = new Quaternion();
const _rootInv = new Quaternion();
const _v = new Vector3();

/**
 * A rigged character (Meshy/Mixamo-style humanoid) posed procedurally every frame:
 * base pose + breathing + head look + drinking arm + talking + laughing. All motion is driven
 * by render time and damped with frame-rate independent exponentials.
 */
export class Character {
  readonly root = new Group();
  readonly model: Object3D;
  readonly bones = new Map<string, Bone>();
  private bind = new Map<string, Quaternion>();
  private order: string[] = [];
  pose: 'sit' | 'stand' = 'stand';
  /** World point to look at (null = straight ahead). */
  lookTarget: Vector3 | null = null;
  /** 0..1 how much the right arm is raised to drink (animated by drink()). */
  drink = 0;
  private drinkTarget = 0;
  /** Talking intensity (head nods, gestures). */
  talk = 0;
  private talkTarget = 0;
  private laughT = 0;
  private headYaw = 0;
  private headPitch = 0;
  /** Freezes all procedural motion (frozen reality). */
  frozen = false;
  /** Right hand holds something (mug); arm uses the table rest pose. */
  armOnTable = true;
  /** Walking blend 0..1 and gait phase (radians, advance by distance travelled). */
  walk = 0;
  walkPhase = 0;
  /** Left forearm raised to carry a tray. */
  carryTray = false;
  private handProp: Object3D | null = null;

  constructor(gltf: GLTF) {
    this.model = skeletonClone(gltf.scene);
    this.root.add(this.model);
    this.model.traverse((o) => {
      if ((o as Bone).isBone) {
        const b = o as Bone;
        this.bones.set(b.name, b);
        this.bind.set(b.name, b.quaternion.clone());
      }
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        (m as unknown as SkinnedMesh).frustumCulled = false;
      }
    });
    // parent-first application order
    const visit = (o: Object3D) => {
      if ((o as Bone).isBone) this.order.push(o.name);
      for (const c of o.children) visit(c);
    };
    visit(this.model);
  }

  /** Attaches an object to a bone with a local offset (e.g. a mug in the right hand). */
  attach(
    boneName: string,
    obj: Object3D,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
  ): void {
    const b = this.bones.get(boneName);
    if (!b) return;
    // Bones live under a 0.01-scaled armature: compensate so props keep metric size.
    const ws = new Vector3();
    b.getWorldScale(ws);
    obj.scale.setScalar(1 / Math.max(ws.x, 1e-6));
    obj.position.set(pos[0] / ws.x, pos[1] / ws.x, pos[2] / ws.x);
    obj.rotation.set(rot[0], rot[1], rot[2]);
    b.add(obj);
    if (boneName === 'RightHand') this.handProp = obj;
  }

  get handObject(): Object3D | null {
    return this.handProp;
  }

  startDrink(): void {
    this.drinkTarget = 1;
  }

  stopDrink(): void {
    this.drinkTarget = 0;
  }

  setTalking(on: boolean): void {
    this.talkTarget = on ? 1 : 0;
  }

  laugh(): void {
    this.laughT = 1.6;
  }

  /** Per displayed frame. */
  update(frameDt: number, t: number): void {
    if (this.frozen) return;
    this.drink = damp(this.drink, this.drinkTarget, 3.2, frameDt);
    this.talk = damp(this.talk, this.talkTarget, 4, frameDt);
    if (this.laughT > 0) this.laughT = Math.max(0, this.laughT - frameDt);

    // head look in character space
    let yaw = 0;
    let pitch = 0;
    if (this.lookTarget) {
      this.root.updateMatrixWorld();
      _v.copy(this.lookTarget);
      this.root.worldToLocal(_v);
      const head = this.bones.get('Head');
      const hy = head ? 1.62 + (this.pose === 'sit' ? -0.53 : 0) : 1.6;
      yaw = clamp(Math.atan2(_v.x, _v.z), -70 * D, 70 * D);
      pitch = clamp(Math.atan2(_v.y - hy, Math.hypot(_v.x, _v.z)), -35 * D, 30 * D);
    }
    this.headYaw = dampAngle(this.headYaw, yaw, 4, frameDt);
    this.headPitch = damp(this.headPitch, pitch, 4, frameDt);

    // reset to bind, then apply layers parent-first
    for (const [n, q] of this.bind) this.bones.get(n)!.quaternion.copy(q);
    this.root.updateMatrixWorld(true);
    const rots: PoseRot[] = [];
    rots.push(...(this.pose === 'sit' ? POSE_SIT : POSE_STAND.filter((r) => !r[0].startsWith('Right'))));
    const breathe = Math.sin(t * 1.55);
    rots.push(['Spine02', 'x', breathe * 0.9]);
    rots.push(['Spine', 'x', Math.sin(t * 1.55 + 0.5) * 0.7]);
    if (this.laughT > 0) {
      const k = this.laughT / 1.6;
      rots.push(['Spine01', 'x', Math.sin(t * 22) * 2.5 * k - 4 * k]);
      rots.push(['Head', 'x', -6 * k]);
    }
    // right arm: blend rest/hang and drink
    const restArm = this.pose === 'sit' && this.armOnTable ? ARM_REST : ARM_HANG;
    const w = this.drink;
    const blended = new Map<string, number>();
    for (const [b, a, deg] of restArm) blended.set(`${b}|${a}`, deg * (1 - w));
    for (const [b, a, deg] of ARM_DRINK) blended.set(`${b}|${a}`, (blended.get(`${b}|${a}`) ?? 0) + deg * w);
    for (const [key, deg] of blended) {
      const [b, a] = key.split('|') as [string, Axis];
      rots.push([b, a, deg]);
    }
    // walking: legs swing, arms counter-swing (phase is distance-driven by the caller)
    if (this.walk > 0.01 && this.pose === 'stand') {
      const w2 = this.walk;
      const sp = Math.sin(this.walkPhase);
      const cp = Math.cos(this.walkPhase);
      rots.push(['LeftUpLeg', 'x', -sp * 24 * w2]);
      rots.push(['RightUpLeg', 'x', sp * 24 * w2]);
      rots.push(['LeftLeg', 'x', Math.max(0, cp) * 32 * w2]);
      rots.push(['RightLeg', 'x', Math.max(0, -cp) * 32 * w2]);
      if (!this.carryTray) rots.push(['LeftArm', 'x', sp * 14 * w2]);
      rots.push(['RightArm', 'x', -sp * 14 * w2]);
      rots.push(['Spine', 'y', sp * 3 * w2]);
    }
    if (this.carryTray) {
      rots.push(['LeftArm', 'z', -30]);
      rots.push(['LeftArm', 'x', -25]);
      rots.push(['LeftForeArm', 'x', -80]);
    }
    // talking gestures
    if (this.talk > 0.01) {
      rots.push(['Head', 'x', Math.sin(t * 5.3) * 2.5 * this.talk]);
      rots.push(['Head', 'z', Math.sin(t * 2.1) * 2 * this.talk]);
      rots.push(['LeftForeArm', 'y', Math.sin(t * 2.4) * 9 * this.talk]);
    }
    rots.push(['neck', 'y', (this.headYaw / D) * 0.4]);
    rots.push(['Head', 'y', (this.headYaw / D) * 0.6]);
    rots.push(['neck', 'x', -(this.headPitch / D) * 0.4 - w * 4]);
    rots.push(['Head', 'x', -(this.headPitch / D) * 0.6 - w * 10]);

    // group by bone in hierarchy order
    _rootInv.copy(this.root.getWorldQuaternion(_q)).invert();
    for (const name of this.order) {
      const list = rots.filter((r) => r[0] === name);
      if (!list.length) continue;
      const b = this.bones.get(name)!;
      b.parent!.getWorldQuaternion(_pq);
      _pq.premultiply(_rootInv); // parent rotation in character space
      for (const [, axis, deg] of list) {
        _q.setFromAxisAngle(AXES[axis], deg * D);
        // local = parent^-1 * q * parent * local
        const local = _pq.clone().invert().multiply(_q).multiply(_pq).multiply(b.quaternion);
        b.quaternion.copy(local);
      }
      b.updateMatrixWorld(true);
    }
  }
}

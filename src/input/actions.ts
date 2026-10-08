export type Action =
  | 'interact'
  | 'drink'
  | 'light'
  | 'throw'
  | 'slotPrev'
  | 'slotNext'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'slot7'
  | 'slot8'
  | 'slot9'
  | 'pause'
  | 'journal'
  | 'skip';

/** Per-tick input snapshot consumed by the simulation. */
export interface InputSnapshot {
  /** Strafe (-1 left .. 1 right). */
  moveX: number;
  /** Forward (-1 back .. 1 forward). */
  moveY: number;
  sprint: boolean;
  crouch: boolean;
  /** Edge-triggered actions since the previous tick (latched; never lost or doubled). */
  pressed: ReadonlySet<Action>;
}

export const EMPTY_SNAPSHOT: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  sprint: false,
  crouch: false,
  pressed: new Set(),
};

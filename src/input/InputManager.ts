import type { Action, InputSnapshot } from './actions.ts';

const KEY_ACTIONS: Record<string, Action> = {
  KeyE: 'interact',
  KeyQ: 'drink',
  KeyF: 'light',
  KeyG: 'throw',
  Digit1: 'slot1',
  Digit2: 'slot2',
  Digit3: 'slot3',
  Digit4: 'slot4',
  Digit5: 'slot5',
  Digit6: 'slot6',
  Escape: 'pause',
  KeyP: 'pause',
  Tab: 'journal',
  KeyJ: 'journal',
  Space: 'skip',
  Enter: 'skip',
};

const MAX_MOUSE_DELTA = 300; // px; some Chrome builds report huge spikes on pointer-lock changes

export interface LookSettings {
  /** Radians per mouse pixel. */
  mouseSensitivity: number;
  /** Radians per touch pixel. */
  touchSensitivity: number;
  /** Radians per second at full gamepad deflection. */
  gamepadLookSpeed: number;
  invertY: boolean;
}

/**
 * Collects keyboard/mouse/touch/gamepad input. Look deltas are raw (never scaled by frame time),
 * so turning speed is identical at any refresh rate. Discrete presses are latched until the next
 * simulation tick consumes them.
 */
export class InputManager {
  readonly look: LookSettings = {
    mouseSensitivity: 0.0022,
    touchSensitivity: 0.0045,
    gamepadLookSpeed: 2.6,
    invertY: false,
  };

  private keys = new Set<string>();
  private latched = new Set<Action>();
  private lookDX = 0;
  private lookDY = 0;
  private crouchToggle = false;
  private touchMove = { x: 0, y: 0 };
  private touchSprint = false;
  private gpMove = { x: 0, y: 0 };
  private gpLook = { x: 0, y: 0 };
  private gpSprint = false;
  private gpCrouch = false;
  private gpPrev: boolean[] = [];
  private enabled = true;
  private target: HTMLElement | null = null;
  pointerLocked = false;
  /** Called when pointer lock is lost unexpectedly (opens the pause menu). */
  onPointerLockLost: (() => void) | null = null;

  attach(target: HTMLElement): void {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    target.addEventListener('wheel', this.onWheel, { passive: true });
    target.addEventListener('mousedown', this.onMouseDown);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.target?.removeEventListener('wheel', this.onWheel);
    this.target?.removeEventListener('mousedown', this.onMouseDown);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.keys.clear();
      this.touchMove.x = this.touchMove.y = 0;
      this.lookDX = this.lookDY = 0;
    }
  }

  async requestPointerLock(): Promise<void> {
    const el = this.target;
    if (!el || document.pointerLockElement === el) return;
    try {
      // unadjustedMovement gives raw deltas without OS acceleration where supported.
      await (el.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | void).call(
        el,
        {
          unadjustedMovement: true,
        },
      );
    } catch {
      try {
        await (el.requestPointerLock as () => Promise<void> | void).call(el);
      } catch {
        /* pointer lock unavailable (e.g. iOS) */
      }
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Programmatic press (touch buttons, tests). */
  press(action: Action): void {
    if (this.enabled) this.latched.add(action);
  }

  /** Touch stick vector (-1..1). */
  setTouchMove(x: number, y: number, sprint: boolean): void {
    this.touchMove.x = x;
    this.touchMove.y = y;
    this.touchSprint = sprint;
  }

  /** Raw touch look in pixels. */
  addTouchLook(dxPx: number, dyPx: number): void {
    if (!this.enabled) return;
    this.lookDX += dxPx * this.look.touchSensitivity;
    this.lookDY += dyPx * this.look.touchSensitivity;
  }

  toggleCrouch(): void {
    this.crouchToggle = !this.crouchToggle;
  }

  get crouchToggled(): boolean {
    return this.crouchToggle;
  }

  /** Polls gamepads; call once per displayed frame. Gamepad look is a rate, so it is scaled by frameDt. */
  pollGamepad(frameDt: number): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && Array.from(pads).find((p) => p && p.connected);
    if (!gp) {
      this.gpMove.x = this.gpMove.y = this.gpLook.x = this.gpLook.y = 0;
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    this.gpMove.x = dz(gp.axes[0] ?? 0);
    this.gpMove.y = -dz(gp.axes[1] ?? 0);
    this.gpLook.x = dz(gp.axes[2] ?? 0);
    this.gpLook.y = dz(gp.axes[3] ?? 0);
    if (this.enabled) {
      const curve = (v: number) => Math.sign(v) * v * v;
      this.lookDX += curve(this.gpLook.x) * this.look.gamepadLookSpeed * frameDt;
      this.lookDY += curve(this.gpLook.y) * this.look.gamepadLookSpeed * frameDt;
    }
    const b = gp.buttons.map((x) => x.pressed);
    const edge = (i: number) => b[i] && !this.gpPrev[i];
    if (edge(0)) this.press('interact');
    if (edge(1)) this.toggleCrouch();
    if (edge(2)) this.press('drink');
    if (edge(3)) this.press('light');
    if (edge(4)) this.press('slotPrev');
    if (edge(5)) this.press('slotNext');
    if (edge(9)) this.press('pause');
    if (edge(8)) this.press('journal');
    if (edge(7)) this.press('throw');
    this.gpSprint = !!b[10] || !!b[6];
    this.gpCrouch = false;
    this.gpPrev = b;
  }

  /** Look delta (radians) accumulated since the last call. Applied per displayed frame. */
  consumeLook(): { dx: number; dy: number } {
    const dx = this.lookDX;
    const dy = this.lookDY * (this.look.invertY ? -1 : 1);
    this.lookDX = 0;
    this.lookDY = 0;
    return { dx, dy };
  }

  /** Builds the per-tick snapshot and clears latched presses. */
  snapshot(): InputSnapshot {
    const k = this.keys;
    let mx = 0;
    let my = 0;
    if (this.enabled) {
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
      mx += this.touchMove.x + this.gpMove.x;
      my += this.touchMove.y + this.gpMove.y;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const pressed = this.latched;
    this.latched = new Set();
    return {
      moveX: mx,
      moveY: my,
      sprint:
        this.enabled && (k.has('ShiftLeft') || k.has('ShiftRight') || this.touchSprint || this.gpSprint),
      crouch: this.enabled && (k.has('ControlLeft') || k.has('KeyC') || this.crouchToggle || this.gpCrouch),
      pressed,
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') e.preventDefault();
    if (!this.enabled) {
      if (KEY_ACTIONS[e.code] === 'pause' || KEY_ACTIONS[e.code] === 'skip')
        this.latched.add(KEY_ACTIONS[e.code]!);
      return;
    }
    if (e.repeat) return;
    this.keys.add(e.code);
    const a = KEY_ACTIONS[e.code];
    if (a) this.latched.add(a);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.enabled || !this.pointerLocked) return;
    const dx = Math.max(-MAX_MOUSE_DELTA, Math.min(MAX_MOUSE_DELTA, e.movementX));
    const dy = Math.max(-MAX_MOUSE_DELTA, Math.min(MAX_MOUSE_DELTA, e.movementY));
    this.lookDX += dx * this.look.mouseSensitivity;
    this.lookDY += dy * this.look.mouseSensitivity;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.enabled) return;
    if (!this.pointerLocked) {
      void this.requestPointerLock();
      return;
    }
    if (e.button === 0) this.latched.add('interact');
    if (e.button === 2) this.latched.add('drink');
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    this.latched.add(e.deltaY > 0 ? 'slotNext' : 'slotPrev');
  };

  private onLockChange = (): void => {
    const locked = document.pointerLockElement === this.target;
    const wasLocked = this.pointerLocked;
    this.pointerLocked = locked;
    if (wasLocked && !locked) this.onPointerLockLost?.();
  };
}

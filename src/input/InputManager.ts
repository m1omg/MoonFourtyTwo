import type { Action, InputSnapshot } from './actions.ts';

/** Controls the player can move to other keys (Nastavenia → Ovládanie). */
export const BINDABLE = [
  'forward',
  'back',
  'left',
  'right',
  'sprint',
  'crouch',
  'interact',
  'drink',
  'light',
  'throw',
  'journal',
  'pause',
] as const;
export type Bindable = (typeof BINDABLE)[number];
export type KeyBinds = Record<Bindable, string>;

export const DEFAULT_BINDS: KeyBinds = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  interact: 'KeyE',
  drink: 'KeyQ',
  light: 'KeyF',
  throw: 'KeyG',
  journal: 'KeyJ',
  pause: 'KeyP',
};

/** Keys that always work, whatever the bindings (arrows, Esc, Tab, numbers, Space, Enter). */
const FIXED_ACTIONS: Record<string, Action> = {
  Digit1: 'slot1',
  Digit2: 'slot2',
  Digit3: 'slot3',
  Digit4: 'slot4',
  Digit5: 'slot5',
  Digit6: 'slot6',
  Digit7: 'slot7',
  Digit8: 'slot8',
  Digit9: 'slot9',
  Escape: 'pause',
  Tab: 'journal',
  Space: 'skip',
  Enter: 'skip',
};

function keyActions(b: KeyBinds): Record<string, Action> {
  const a: Record<string, Action> = { ...FIXED_ACTIONS };
  for (const k of ['interact', 'drink', 'light', 'throw', 'journal', 'pause'] as const) a[b[k]] = k;
  return a;
}

const MAX_MOUSE_DELTA = 300; // px; some Chrome builds report huge spikes on pointer-lock changes

export interface LookSettings {
  /** Radians per mouse pixel. */
  mouseSensitivity: number;
  /** Radians per touch pixel. */
  touchSensitivity: number;
  /** Radians per second at full gamepad deflection. */
  gamepadLookSpeed: number;
  /** Radians per second with the touch look stick pushed all the way (alternate touch scheme). */
  touchStickSpeed: number;
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
    touchStickSpeed: 2.4,
    invertY: false,
  };

  private keys = new Set<string>();
  private binds: KeyBinds = { ...DEFAULT_BINDS };
  private keyActions = keyActions(DEFAULT_BINDS);
  private latched = new Set<Action>();
  private lookDX = 0;
  private lookDY = 0;
  private crouchToggle = false;
  private touchMove = { x: 0, y: 0 };
  private touchSprint = false;
  private gpMove = { x: 0, y: 0 };
  private gpLook = { x: 0, y: 0 };
  private touchLookRate = { x: 0, y: 0 };
  private gpSprint = false;
  private gpCrouch = false;
  private gpPrev: boolean[] = [];
  private enabled = true;
  private target: HTMLElement | null = null;
  pointerLocked = false;
  /** Called when pointer lock is lost unexpectedly (opens the pause menu). */
  onPointerLockLost: (() => void) | null = null;
  /** Called when the page is hidden (another tab, minimised) or the window loses focus. */
  onHidden: (() => void) | null = null;

  /** Moves controls to other keys (missing entries keep their defaults). */
  setBinds(b: Partial<KeyBinds>): void {
    this.binds = { ...DEFAULT_BINDS, ...b };
    this.keyActions = keyActions(this.binds);
    this.keys.clear();
  }

  attach(target: HTMLElement): void {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    target.addEventListener('wheel', this.onWheel, { passive: true });
    target.addEventListener('mousedown', this.onMouseDown);
    // the right button drinks: no browser menu over the game
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (e: Event): void => e.preventDefault();

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.target?.removeEventListener('wheel', this.onWheel);
    this.target?.removeEventListener('mousedown', this.onMouseDown);
    this.target?.removeEventListener('contextmenu', this.onContextMenu);
  }

  /** Whether player input is on (not during menus, documents and cutscenes). */
  get active(): boolean {
    return this.enabled;
  }

  /** Forgets presses made while a menu or document was open (an Esc there must not pause after). */
  clearLatched(): void {
    this.latched.clear();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.keys.clear();
      this.touchMove.x = this.touchMove.y = 0;
      this.lookDX = this.lookDY = 0;
    }
  }

  /**
   * The mouse may only be captured while this tab is the one in front and focused. Loading often
   * finishes while the player waits in another tab; grabbing the mouse then would steal it there.
   */
  private canLock(): boolean {
    return document.visibilityState === 'visible' && document.hasFocus();
  }

  async requestPointerLock(): Promise<void> {
    const el = this.target;
    if (!el || document.pointerLockElement === el || !this.canLock()) return;
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

  /** Touch look stick (-1..1): turns the view at a rate, like a gamepad's right stick. */
  setTouchLookRate(x: number, y: number): void {
    this.touchLookRate.x = x;
    this.touchLookRate.y = y;
  }

  /** Turns the view by the touch look stick; call once per displayed frame (a rate: × frameDt). */
  stepTouchLook(frameDt: number): void {
    if (!this.enabled) return;
    const curve = (v: number) => Math.sign(v) * v * v;
    this.lookDX += curve(this.touchLookRate.x) * this.look.touchStickSpeed * frameDt;
    this.lookDY += curve(this.touchLookRate.y) * this.look.touchStickSpeed * frameDt;
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
      const b = this.binds;
      if (k.has(b.left) || k.has('ArrowLeft')) mx -= 1;
      if (k.has(b.right) || k.has('ArrowRight')) mx += 1;
      if (k.has(b.forward) || k.has('ArrowUp')) my += 1;
      if (k.has(b.back) || k.has('ArrowDown')) my -= 1;
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
      sprint: this.enabled && (k.has(this.binds.sprint) || this.touchSprint || this.gpSprint),
      crouch: this.enabled && (k.has(this.binds.crouch) || this.crouchToggle || this.gpCrouch),
      pressed,
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') e.preventDefault();
    const a = this.keyActions[e.code];
    if (!this.enabled) {
      if (a === 'pause' || a === 'skip') this.latched.add(a);
      return;
    }
    if (e.repeat) return;
    this.keys.add(e.code);
    if (a) this.latched.add(a);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.letGo();
  };

  private onVisibility = (): void => {
    if (document.visibilityState !== 'visible') {
      this.keys.clear();
      this.letGo();
    }
  };

  /** Releases the mouse (some browsers keep the lock across a tab switch) and tells the game. */
  private letGo(): void {
    this.exitPointerLock();
    this.onHidden?.();
  }

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
    // a lock granted after the player already left (a late request racing a tab switch)
    if (document.pointerLockElement === this.target && !this.canLock()) {
      document.exitPointerLock();
      return;
    }
    const locked = document.pointerLockElement === this.target;
    const wasLocked = this.pointerLocked;
    this.pointerLocked = locked;
    if (wasLocked && !locked) this.onPointerLockLost?.();
  };
}

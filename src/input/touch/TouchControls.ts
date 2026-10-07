import type { InputManager } from '../InputManager.ts';
import type { Action } from '../actions.ts';
import { el } from '../../ui/dom.ts';
import { t } from '../../i18n/sk.ts';

/** How far (px) the knob travels from the centre of the stick. */
const STICK_R = 58;
/** Share of the travel that does nothing (a resting thumb must not creep). */
const DEAD = 0.12;
/** How far (px) a walking swipe goes for full speed (alternate scheme). */
const SWIPE_R = 70;

/** A dead zone, then the full range: (dx, dy) in px → -1..1 each, and the plain magnitude. */
function shape(dx: number, dy: number, r: number): { x: number; y: number; mag: number } {
  const len = Math.hypot(dx, dy);
  const mag = Math.min(1, len / r);
  const k = mag < DEAD ? 0 : (mag - DEAD) / (1 - DEAD) / Math.max(len / r, 1e-6);
  return { x: (dx / r) * k, y: (dy / r) * k, mag };
}

/**
 * On-screen controls for phones/tablets: a thumbstick that always shows in the bottom-left corner
 * (touch it, or anywhere on the left half and it comes to your thumb), drag-to-look on the right
 * half, and action buttons. Pushing the stick to its edge sprints.
 *
 * The other scheme (Nastavenia → Dotykové ovládanie) swaps the two: a swipe on the right half walks
 * (from where the finger came down; far out sprints) and the stick turns the view at a rate.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private base: HTMLElement;
  private knob: HTMLElement;
  private scheme: 'stick' | 'swipe' = 'stick';
  /** Shows where a walking swipe started, and the finger (swipe scheme). */
  private ring: HTMLElement;
  private dot: HTMLElement;
  private crouchBtn: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
  ) {
    this.root = el('div', { class: 'touch' });
    const left = el('div', { class: 'zone', style: 'left:0;width:45%' });
    const right = el('div', { class: 'zone', style: 'right:0;width:55%' });
    this.base = el('div', { class: 'stick-base' });
    this.knob = el('div', { class: 'stick-knob' });
    this.base.append(this.knob);
    left.append(this.base);
    this.ring = el('div', { class: 'swipe-ring' });
    this.dot = el('div', { class: 'swipe-dot' });
    this.ring.append(this.dot);
    right.append(this.ring);
    this.root.append(left, right);

    left.addEventListener('pointerdown', this.onStickDown);
    left.addEventListener('pointermove', this.onStickMove);
    left.addEventListener('pointerup', this.onStickUp);
    left.addEventListener('pointercancel', this.onStickUp);
    left.addEventListener('contextmenu', (e) => e.preventDefault());
    right.addEventListener('pointerdown', this.onLookDown);
    right.addEventListener('pointermove', this.onLookMove);
    right.addEventListener('pointerup', this.onLookUp);
    right.addEventListener('pointercancel', this.onLookUp);

    // placed by the stylesheet: one layout for a wide screen, one for a phone held upright
    const mk = (label: string, action: Action | null, place: string, onTap?: () => void) => {
      const b = el('div', { class: `tbtn ${place}`, role: 'button', 'aria-label': label }, label);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (action) this.input.press(action);
        onTap?.();
      });
      this.root.append(b);
      return b;
    };
    mk(t('touchAction'), 'interact', 'tb-act');
    mk(t('touchDrink'), 'drink', 'tb-drink');
    mk(t('touchLight'), 'light', 'tb-light');
    this.crouchBtn = mk(t('touchCrouch'), null, 'tb-crouch', () => {
      this.input.toggleCrouch();
      this.crouchBtn.classList.toggle('on', this.input.crouchToggled);
    });
    mk(t('touchThrow'), 'throw', 'tb-throw');
    mk(t('touchPause'), 'pause', 'tb-pause');
    parent.append(this.root);
    this.setVisible(false);
  }

  setVisible(on: boolean): void {
    this.root.style.display = on ? '' : 'none';
    if (!on) {
      this.stickId = null;
      this.lookId = null;
      this.release();
      this.endSwipe();
    }
  }

  /** Where the stick waits while nobody touches it (its CSS rest position), in client pixels. */
  private restCenter(): { x: number; y: number } {
    const r = this.base.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private onStickDown = (e: PointerEvent): void => {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // touching the stick grabs it where it is; touching elsewhere on the left brings it to the thumb
    const rest = this.restCenter();
    const onStick = Math.hypot(e.clientX - rest.x, e.clientY - rest.y) < STICK_R * 1.5;
    this.stickOrigin = onStick ? rest : { x: e.clientX, y: e.clientY };
    if (!onStick) {
      this.base.classList.add('floating');
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
    }
    this.base.classList.add('active');
    this.onStickMove(e);
  };

  private onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.stickOrigin.x;
    let dy = e.clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    // a small dead zone, then the full range: a resting thumb does not creep
    const v = shape(dx, dy, STICK_R);
    if (this.scheme === 'swipe') this.input.setTouchLookRate(v.x, v.y);
    else this.input.setTouchMove(v.x, -v.y, v.mag > 0.93 && -dy / STICK_R > 0.5);
  };

  private onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.release();
  };

  /** The stick goes back to its corner. */
  private release(): void {
    this.base.classList.remove('active', 'floating');
    this.base.style.left = '';
    this.base.style.top = '';
    this.knob.style.transform = 'translate(0,0)';
    if (this.scheme === 'swipe') this.input.setTouchLookRate(0, 0);
    else this.input.setTouchMove(0, 0, false);
  }

  /** Which control walks: the stick (default) or a swipe (then the stick turns the view). */
  setScheme(scheme: 'stick' | 'swipe'): void {
    if (scheme === this.scheme) return;
    this.stickId = null;
    this.lookId = null;
    this.release();
    this.endSwipe();
    this.scheme = scheme;
  }

  private endSwipe(): void {
    this.ring.classList.remove('show');
    this.input.setTouchMove(0, 0, false);
    this.input.setTouchLookRate(0, 0);
  }

  private onLookDown = (e: PointerEvent): void => {
    if (this.lookId !== null) return;
    this.lookId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.lookLast = { x: e.clientX, y: e.clientY };
    if (this.scheme === 'swipe') {
      // the walk starts where the finger came down
      this.ring.style.left = `${e.clientX - (this.ring.parentElement?.getBoundingClientRect().left ?? 0)}px`;
      this.ring.style.top = `${e.clientY}px`;
      this.dot.style.transform = 'translate(0,0)';
      this.ring.classList.add('show');
    }
  };

  private onLookMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.lookId) return;
    if (this.scheme === 'swipe') {
      let dx = e.clientX - this.lookLast.x;
      let dy = e.clientY - this.lookLast.y;
      const v = shape(dx, dy, SWIPE_R);
      this.input.setTouchMove(v.x, -v.y, v.mag > 0.93 && -dy / SWIPE_R > 0.5);
      const len = Math.hypot(dx, dy);
      if (len > SWIPE_R) {
        dx = (dx / len) * SWIPE_R;
        dy = (dy / len) * SWIPE_R;
      }
      this.dot.style.transform = `translate(${dx}px,${dy}px)`;
      return;
    }
    this.input.addTouchLook(e.clientX - this.lookLast.x, e.clientY - this.lookLast.y);
    this.lookLast = { x: e.clientX, y: e.clientY };
  };

  private onLookUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.lookId) return;
    this.lookId = null;
    if (this.scheme === 'swipe') this.endSwipe();
  };
}

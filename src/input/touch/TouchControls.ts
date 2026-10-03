import type { InputManager } from '../InputManager.ts';
import type { Action } from '../actions.ts';
import { el } from '../../ui/dom.ts';
import { t } from '../../i18n/sk.ts';

/** How far (px) the knob travels from the centre of the stick. */
const STICK_R = 58;
/** Share of the travel that does nothing (a resting thumb must not creep). */
const DEAD = 0.12;

/**
 * On-screen controls for phones/tablets: a thumbstick that always shows in the bottom-left corner
 * (touch it, or anywhere on the left half and it comes to your thumb), drag-to-look on the right
 * half, and action buttons. Pushing the stick to its edge sprints.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private base: HTMLElement;
  private knob: HTMLElement;
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

    const mk = (label: string, action: Action | null, style: string, onTap?: () => void) => {
      const b = el('div', { class: 'tbtn', style, role: 'button', 'aria-label': label }, label);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (action) this.input.press(action);
        onTap?.();
      });
      this.root.append(b);
      return b;
    };
    const R = 'calc(max(16px, env(safe-area-inset-right)) + ';
    mk(t('touchAction'), 'interact', `right:${R}0px);bottom:120px;width:84px;height:84px;font-size:0.9rem`);
    mk(t('touchDrink'), 'drink', `right:${R}96px);bottom:96px`);
    mk(t('touchLight'), 'light', `right:${R}96px);bottom:176px`);
    this.crouchBtn = mk(t('touchCrouch'), null, `right:${R}10px);bottom:220px`, () => {
      this.input.toggleCrouch();
      this.crouchBtn.classList.toggle('on', this.input.crouchToggled);
    });
    mk(t('touchThrow'), 'throw', `right:${R}176px);bottom:120px`);
    mk(
      t('touchPause'),
      'pause',
      `right:${R}0px);top:calc(max(14px, env(safe-area-inset-top)));width:52px;height:52px;font-size:0.7rem`,
    );
    parent.append(this.root);
    this.setVisible(false);
  }

  setVisible(on: boolean): void {
    this.root.style.display = on ? '' : 'none';
    if (!on) {
      this.stickId = null;
      this.lookId = null;
      this.release();
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
    const mag = Math.min(1, len / STICK_R);
    const k = mag < DEAD ? 0 : (mag - DEAD) / (1 - DEAD) / Math.max(mag, 1e-6);
    this.input.setTouchMove((dx / STICK_R) * k, (-dy / STICK_R) * k, mag > 0.93 && -dy / STICK_R > 0.5);
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
    this.input.setTouchMove(0, 0, false);
  }

  private onLookDown = (e: PointerEvent): void => {
    if (this.lookId !== null) return;
    this.lookId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.lookLast = { x: e.clientX, y: e.clientY };
  };

  private onLookMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.lookId) return;
    this.input.addTouchLook(e.clientX - this.lookLast.x, e.clientY - this.lookLast.y);
    this.lookLast = { x: e.clientX, y: e.clientY };
  };

  private onLookUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.lookId) return;
    this.lookId = null;
  };
}

import type { InputManager } from '../InputManager.ts';
import type { Action } from '../actions.ts';
import { el } from '../../ui/dom.ts';
import { t } from '../../i18n/sk.ts';

/**
 * On-screen controls for phones/tablets: floating move stick on the left half, drag-to-look on
 * the right half, and action buttons. Pushing the stick to its edge sprints.
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
      this.input.setTouchMove(0, 0, false);
      this.base.style.display = 'none';
    }
  }

  private onStickDown = (e: PointerEvent): void => {
    if (this.stickId !== null) return;
    this.stickId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.stickOrigin = { x: e.clientX, y: e.clientY };
    this.base.style.display = 'block';
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.knob.style.transform = 'translate(0,0)';
  };

  private onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    const R = 55;
    let dx = e.clientX - this.stickOrigin.x;
    let dy = e.clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    const mag = Math.min(1, len / R);
    this.input.setTouchMove(dx / R, -dy / R, mag > 0.93 && -dy / R > 0.5);
  };

  private onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.base.style.display = 'none';
    this.input.setTouchMove(0, 0, false);
  };

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

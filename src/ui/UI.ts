import { el, wait } from './dom.ts';
import { t, sk } from '../i18n/sk.ts';
import type { Settings } from '../save/Settings.ts';
import type { ItemId } from '../sim/items/items.data.ts';
import { ITEMS } from '../sim/items/items.data.ts';

export interface HotbarSlot {
  item: ItemId | null;
  count: number;
}

/** DOM overlay: HUD, menus, dialogue, documents. UI timing uses real time (setTimeout), never sim. */
export class UI {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private screens: HTMLElement;
  private crosshair: HTMLElement;
  private prompt: HTMLElement;
  private subtitles: HTMLElement;
  private hotbar: HTMLElement;
  private status: HTMLElement;
  private toastEl: HTMLElement;
  private chapterEl: HTMLElement;
  private choicesEl: HTMLElement | null = null;
  private statusTimer = 0;
  private toastTimer = 0;
  private lastHotbarKey = '';
  /** True while a modal screen (menu, document) is open. */
  modal = false;
  touchMode = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', { id: 'ui' });
    this.hud = el('div', { class: 'hud' });
    this.screens = el('div', { class: 'screens' });
    this.crosshair = el('div', { class: 'crosshair' });
    this.prompt = el('div', { class: 'prompt' });
    this.subtitles = el('div', { class: 'subtitles', 'aria-live': 'polite' });
    this.hotbar = el('div', { class: 'hotbar' });
    this.status = el('div', { class: 'status' });
    this.toastEl = el('div', { class: 'toast' });
    this.chapterEl = el('div', { class: 'chapter' });
    const chapterWrap = el('div', { class: 'screen', style: 'pointer-events:none' }, this.chapterEl);
    this.hud.append(
      this.crosshair,
      this.prompt,
      this.subtitles,
      this.hotbar,
      this.status,
      this.toastEl,
      chapterWrap,
    );
    this.root.append(this.hud, this.screens, el('div', { class: 'rotate' }, t('rotateDevice')));
    parent.append(this.root);
    this.setHudVisible(false);
  }

  applySettings(s: Settings): void {
    const size = s.subtitleSize === 'small' ? '1rem' : s.subtitleSize === 'large' ? '1.45rem' : '1.15rem';
    document.documentElement.style.setProperty('--sub-size', size);
  }

  setHudVisible(on: boolean): void {
    this.hud.style.display = on ? '' : 'none';
  }

  private clearScreens(): void {
    this.screens.replaceChildren();
    this.modal = false;
  }

  private screen(cls = 'dim', ...children: Array<Node | string | null>): HTMLElement {
    this.screens.replaceChildren();
    const s = el('div', { class: `screen ${cls}` }, ...children);
    this.screens.append(s);
    this.modal = true;
    return s;
  }

  // ───────────────────────────── menus ─────────────────────────────

  showWarning(): Promise<void> {
    return new Promise((resolve) => {
      const ok = el('button', { class: 'btn', type: 'button' }, t('warnOk'));
      this.screen(
        'black',
        el(
          'div',
          { class: 'panel' },
          el('h2', {}, t('warnTitle')),
          el('p', {}, t('warnBody')),
          el('p', {}, t('headphones')),
          ok,
        ),
      );
      ok.focus();
      ok.addEventListener('click', () => {
        this.clearScreens();
        resolve();
      });
    });
  }

  showTitle(canContinue: boolean, onSettings: () => Promise<void>): Promise<'new' | 'continue'> {
    return new Promise((resolve) => {
      const render = () => {
        const bNew = el('button', { type: 'button' }, t('menuNew'));
        const bCont = el('button', { type: 'button' }, t('menuContinue'));
        if (!canContinue) bCont.setAttribute('disabled', '');
        const bSet = el('button', { type: 'button' }, t('menuSettings'));
        const bAbout = el('button', { type: 'button' }, t('menuAbout'));
        this.screen(
          'dim',
          el(
            'div',
            { class: 'title-block' },
            el('h1', { class: 'title' }, t('gameTitle')),
            el('div', { class: 'tagline' }, t('tagline')),
          ),
          el('div', { class: 'menu' }, bCont, bNew, bSet, bAbout),
        );
        (canContinue ? bCont : bNew).focus();
        bNew.addEventListener('click', () => {
          this.clearScreens();
          resolve('new');
        });
        bCont.addEventListener('click', () => {
          if (!canContinue) return;
          this.clearScreens();
          resolve('continue');
        });
        bSet.addEventListener('click', () => void onSettings().then(render));
        bAbout.addEventListener('click', () => void this.showAbout().then(render));
      };
      render();
    });
  }

  showAbout(): Promise<void> {
    return new Promise((resolve) => {
      const back = el('button', { class: 'btn', type: 'button' }, t('menuBack'));
      this.screen(
        'dim',
        el('div', { class: 'panel' }, el('h2', {}, t('menuAbout')), el('p', {}, t('aboutBody')), back),
      );
      back.focus();
      back.addEventListener('click', () => {
        this.clearScreens();
        resolve();
      });
    });
  }

  showPause(onSettings: () => Promise<void>, info?: string): Promise<'resume' | 'title'> {
    return new Promise((resolve) => {
      const render = () => {
        const bRes = el('button', { type: 'button' }, t('menuResume'));
        const bSet = el('button', { type: 'button' }, t('menuSettings'));
        const bTitle = el('button', { type: 'button' }, t('menuQuitToTitle'));
        this.screen(
          'dim',
          el(
            'div',
            { class: 'title-block' },
            el('h1', { class: 'title' }, t('pauseTitle')),
            info ? el('p', { class: 'tagline' }, info) : null,
          ),
          el('div', { class: 'menu' }, bRes, bSet, bTitle),
        );
        bRes.focus();
        bRes.addEventListener('click', () => {
          this.clearScreens();
          resolve('resume');
        });
        bSet.addEventListener('click', () => void onSettings().then(render));
        bTitle.addEventListener('click', () => {
          this.clearScreens();
          resolve('title');
        });
      };
      render();
    });
  }

  showSettings(s: Settings, onChange: (s: Settings) => void): Promise<void> {
    return new Promise((resolve) => {
      const rows: HTMLElement[] = [];
      const range = (key: keyof Settings, label: string, min: number, max: number, step: number) => {
        const id = `set-${String(key)}`;
        const input = el('input', {
          type: 'range',
          id,
          min: String(min),
          max: String(max),
          step: String(step),
          value: String(s[key]),
        });
        input.addEventListener('input', () => {
          (s as unknown as Record<string, number>)[key] = Number(input.value);
          onChange(s);
        });
        rows.push(el('div', { class: 'setting' }, el('label', { for: id }, label), input));
      };
      const select = <K extends keyof Settings>(
        key: K,
        label: string,
        opts: Array<[Settings[K], string]>,
      ) => {
        const id = `set-${String(key)}`;
        const sel = el('select', { id });
        for (const [v, text] of opts) {
          const o = el('option', { value: String(v) }, text);
          if (s[key] === v) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener('change', () => {
          const match = opts.find(([v]) => String(v) === sel.value);
          if (match) (s as unknown as Record<string, unknown>)[key as string] = match[0];
          onChange(s);
        });
        rows.push(el('div', { class: 'setting' }, el('label', { for: id }, label), sel));
      };
      select('quality', t('setQuality'), [
        ['auto', t('setQualityAuto')],
        ['low', t('setQualityLow')],
        ['med', t('setQualityMed')],
        ['high', t('setQualityHigh')],
      ]);
      select('difficulty', t('setDifficulty'), [
        ['normal', t('diffNormal')],
        ['story', t('diffStory')],
      ]);
      range('master', t('setMaster'), 0, 1, 0.05);
      range('music', t('setMusic'), 0, 1, 0.05);
      range('voice', t('setVoice'), 0, 1, 0.05);
      range('sfx', t('setSfx'), 0, 1, 0.05);
      range('mouseSensitivity', t('setSensitivity'), 0.2, 3, 0.05);
      range('touchSensitivity', t('setTouchSensitivity'), 0.2, 3, 0.05);
      select('invertY', t('setInvertY'), [
        [false, t('off')],
        [true, t('on')],
      ]);
      range('fov', t('setFov'), 55, 95, 1);
      range('motion', t('setMotion'), 0, 1, 0.05);
      select('reduceFlashes', t('setFlashes'), [
        [false, t('off')],
        [true, t('on')],
      ]);
      select('subtitleSize', t('setSubtitleSize'), [
        ['small', t('small')],
        ['medium', t('medium')],
        ['large', t('large')],
      ]);
      const back = el('button', { class: 'btn', type: 'button' }, t('menuBack'));
      this.screen('dim', el('div', { class: 'panel' }, el('h2', {}, t('settingsTitle')), ...rows, back));
      back.addEventListener('click', () => {
        this.clearScreens();
        resolve();
      });
    });
  }

  showLoading(tipIndex: number): { progress(p: number): void; close(): void } {
    const tips = [sk.loadingTip1, sk.loadingTip2, sk.loadingTip3, sk.loadingTip4, sk.loadingTip5];
    const bar = el('div');
    this.screen(
      'black',
      el('div', {}, t('loading')),
      el('div', { class: 'loading-bar' }, bar),
      el('div', { class: 'loading-tip' }, tips[tipIndex % tips.length]!),
    );
    return {
      progress: (p) => {
        bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
      },
      close: () => this.clearScreens(),
    };
  }

  async showOkno(seconds = 3.2): Promise<void> {
    this.setHudVisible(false);
    this.screen(
      'black',
      el('div', { class: 'okno' }, t('okno')),
      el('div', { class: 'okno-sub' }, t('oknoSub')),
    );
    await wait(seconds * 1000);
    this.clearScreens();
  }

  /** Clickable splash used to unlock audio / pointer lock with a user gesture. */
  waitForClick(text: string = t('pressToStart')): Promise<void> {
    return new Promise((resolve) => {
      const s = this.screen('black', el('div', { class: 'hint' }, text));
      const go = () => {
        s.removeEventListener('pointerdown', go);
        window.removeEventListener('keydown', go);
        this.clearScreens();
        resolve();
      };
      s.addEventListener('pointerdown', go);
      window.addEventListener('keydown', go);
    });
  }

  showDocument(title: string, body: string): Promise<void> {
    return new Promise((resolve) => {
      const close = el(
        'div',
        { class: 'hint' },
        this.touchMode ? 'Ťukni pre zatvorenie' : 'Klikni alebo stlač E pre zatvorenie',
      );
      const s = this.screen('dim', el('div', { class: 'doc' }, el('h3', {}, title), body), close);
      const done = (e: Event) => {
        if (e instanceof KeyboardEvent && !['KeyE', 'Escape', 'Space', 'Enter'].includes(e.code)) return;
        s.removeEventListener('pointerdown', done);
        window.removeEventListener('keydown', done);
        this.clearScreens();
        resolve();
      };
      setTimeout(() => {
        s.addEventListener('pointerdown', done);
        window.addEventListener('keydown', done);
      }, 250);
    });
  }

  async showEndingText(lines: string[], holdMs = 4500): Promise<void> {
    this.setHudVisible(false);
    for (const line of lines) {
      const txt = el('div', { class: 'ending-text' }, line);
      this.screen('black', txt);
      await wait(50);
      txt.classList.add('show');
      await wait(holdMs);
      txt.classList.remove('show');
      await wait(2600);
    }
    this.clearScreens();
  }

  async showCredits(entries: Array<[string, string]>): Promise<void> {
    const roll = el('div', { class: 'credits-roll' });
    roll.append(el('strong', {}, t('gameTitle')), el('br'), el('br'));
    for (const [role, who] of entries) roll.append(el('div', {}, `${role}: ${who}`));
    const back = el(
      'button',
      { class: 'btn', type: 'button', style: 'margin-top:2rem' },
      t('menuQuitToTitle'),
    );
    this.screen('black', roll, back);
    await new Promise<void>((resolve) => back.addEventListener('click', () => resolve()));
    this.clearScreens();
  }

  // ───────────────────────────── HUD ─────────────────────────────

  setPrompt(text: string | null): void {
    if (!text) {
      this.prompt.classList.remove('show');
      this.crosshair.classList.remove('focus');
      return;
    }
    const key = this.touchMode ? '' : `<kbd>${t('keyHintInteract')}</kbd>`;
    const html = `${key}${escapeHtml(text)}`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.classList.add('show');
    this.crosshair.classList.add('focus');
  }

  subtitle(who: string | null, text: string | null): void {
    if (!text) {
      this.subtitles.replaceChildren();
      return;
    }
    const line = el('span', { class: 'line' });
    if (who) line.append(el('span', { class: 'who' }, who));
    line.append(text);
    this.subtitles.replaceChildren(line);
  }

  choose(options: string[]): Promise<number> {
    return new Promise((resolve) => {
      this.choicesEl?.remove();
      const box = el('div', { class: 'choices' });
      const keyHandler = (e: KeyboardEvent) => {
        const n = Number(e.key);
        if (n >= 1 && n <= options.length) pick(n - 1);
      };
      const pick = (i: number) => {
        window.removeEventListener('keydown', keyHandler);
        box.remove();
        this.choicesEl = null;
        resolve(i);
      };
      options.forEach((o, i) => {
        const b = el('button', { type: 'button' }, `${this.touchMode ? '' : `${i + 1}. `}${o}`);
        b.addEventListener('click', () => pick(i));
        box.append(b);
      });
      window.addEventListener('keydown', keyHandler);
      this.hud.append(box);
      this.choicesEl = box;
    });
  }

  get choosing(): boolean {
    return !!this.choicesEl;
  }

  setHotbar(slots: HotbarSlot[], selected: number, onTap?: (i: number) => void): void {
    const key = slots.map((s) => `${s.item}:${s.count}`).join('|') + `#${selected}`;
    if (key === this.lastHotbarKey) return;
    this.lastHotbarKey = key;
    this.hotbar.replaceChildren();
    slots.forEach((s, i) => {
      const slot = el('div', { class: `slot${i === selected ? ' sel' : ''}` });
      slot.append(el('span', { class: 'k' }, String(i + 1)));
      if (s.item) {
        const def = ITEMS[s.item];
        const liq = el('span', { class: 'liq' });
        liq.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
        slot.append(liq, def.name);
        if (s.count > 1) slot.append(el('span', { class: 'n' }, `×${s.count}`));
        slot.title = `${def.name} — ${def.tag}`;
      }
      if (onTap)
        slot.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          onTap(i);
        });
      this.hotbar.append(slot);
    });
  }

  showStatus(bac: number, label: string, mystery = false): void {
    const value = mystery ? '∞' : bac.toFixed(2).replace('.', ',');
    this.status.innerHTML = `<div class="bac">${value} ‰</div><div>${escapeHtml(label)}</div>`;
    this.status.classList.add('show');
    clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => this.status.classList.remove('show'), 3500);
  }

  toast(text: string, ms = 2200): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  async chapter(title: string, ms = 3600): Promise<void> {
    this.chapterEl.textContent = title;
    this.chapterEl.classList.add('show');
    await wait(ms);
    this.chapterEl.classList.remove('show');
  }

  hideAllScreens(): void {
    this.clearScreens();
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

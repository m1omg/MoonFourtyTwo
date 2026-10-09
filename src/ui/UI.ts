import { el, wait } from './dom.ts';
import { t, sk } from '../i18n/sk.ts';
import type { Settings } from '../save/Settings.ts';
import type { SaveBook, SaveData } from '../save/SaveGame.ts';
import { BINDABLE, DEFAULT_BINDS, mouseCode, type Bindable } from '../input/InputManager.ts';
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
  /** The interact key as bound in the settings (shown with every prompt). */
  private interactKey = 'E';
  /** Lets the mouse go (set by the game): screens that need a click call it. */
  releasePointer: (() => void) | null = null;
  /** Closes an open choice without an answer (see cancelChoice). */
  private cancelPending: (() => void) | null = null;
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
    this.root.append(this.hud, this.screens);
    parent.append(this.root);
    this.setHudVisible(false);
  }

  applySettings(s: Settings): void {
    this.interactKey = keyName(s.keys.interact ?? 'KeyE');
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

  showTitle(
    canContinue: boolean,
    onSettings: () => Promise<void>,
    canLoad = canContinue,
  ): Promise<'new' | 'continue' | 'load'> {
    return new Promise((resolve) => {
      const render = () => {
        const bNew = el('button', { type: 'button' }, t('menuNew'));
        const bCont = el('button', { type: 'button' }, t('menuContinue'));
        if (!canContinue) bCont.setAttribute('disabled', '');
        const bLoad = el('button', { type: 'button' }, t('menuLoad'));
        if (!canLoad) bLoad.setAttribute('disabled', '');
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
          el('div', { class: 'menu' }, bCont, bNew, bLoad, bSet, bAbout),
        );
        (canContinue ? bCont : bNew).focus();
        bLoad.addEventListener('click', () => {
          if (!canLoad) return;
          this.clearScreens();
          resolve('load');
        });
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
        el(
          'div',
          { class: 'panel' },
          el('h2', {}, t('menuAbout')),
          el('p', {}, t('aboutBody')),
          el('p', {}, t('aboutControls')),
          back,
        ),
      );
      back.focus();
      back.addEventListener('click', () => {
        this.clearScreens();
        resolve();
      });
    });
  }

  showPause(
    onSettings: () => Promise<void>,
    info?: string,
    notice?: string,
  ): Promise<'resume' | 'title' | 'save' | 'load'> {
    return new Promise((resolve) => {
      const render = () => {
        const bRes = el('button', { type: 'button' }, t('menuResume'));
        const bSave = el('button', { type: 'button' }, t('menuSave'));
        const bLoad = el('button', { type: 'button' }, t('menuLoad'));
        const bSet = el('button', { type: 'button' }, t('menuSettings'));
        const bTitle = el('button', { type: 'button' }, t('menuQuitToTitle'));
        this.screen(
          'dim',
          el(
            'div',
            { class: 'title-block' },
            el('h1', { class: 'title' }, t('pauseTitle')),
            info ? el('p', { class: 'tagline' }, info) : null,
            notice ? el('p', { class: 'tagline notice' }, notice) : null,
          ),
          el('div', { class: 'menu' }, bRes, bSave, bLoad, bSet, bTitle),
        );
        bRes.focus();
        for (const [b, r] of [
          [bSave, 'save'],
          [bLoad, 'load'],
        ] as const) {
          b.addEventListener('click', () => {
            this.clearScreens();
            resolve(r);
          });
        }
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

  /**
   * The list of saves. To load: the recent checkpoints and the player's slots, resolves with the
   * picked save. To save: the slots, resolves with the slot to keep the last checkpoint in.
   * Null = back.
   */
  showSaves(book: SaveBook, mode: 'load'): Promise<SaveData | null>;
  showSaves(book: SaveBook, mode: 'save'): Promise<number | null>;
  showSaves(book: SaveBook, mode: 'load' | 'save'): Promise<SaveData | number | null> {
    return new Promise((resolve) => {
      const done = (v: SaveData | number | null) => {
        this.clearScreens();
        resolve(v);
      };
      const row = (label: string, detail: string, action?: string, onClick?: () => void) => {
        const b = action ? el('button', { class: 'btn key', type: 'button' }, action) : null;
        if (b && onClick) b.addEventListener('click', onClick);
        return el(
          'div',
          { class: 'setting save-row' },
          el('label', {}, label, el('span', { class: 'save-detail' }, detail)),
          b ?? el('span'),
        );
      };
      const rows: HTMLElement[] = [];
      if (mode === 'load') {
        rows.push(el('h3', {}, t('savesRecent')));
        for (const s of book.history)
          rows.push(row(saveTitle(s), saveDetail(s), t('saveLoad'), () => done(s)));
        if (!book.history.length) rows.push(el('p', { class: 'keys-hint' }, t('savesNone')));
      } else rows.push(el('p', { class: 'keys-hint' }, t('saveHint')));
      rows.push(el('h3', {}, t('savesSlots')));
      book.slots.forEach((s, i) => {
        const name = `${t('saveSlot')} ${i + 1}`;
        if (mode === 'load')
          rows.push(
            s
              ? row(`${name}: ${saveTitle(s)}`, saveDetail(s), t('saveLoad'), () => done(s))
              : row(name, t('saveEmpty')),
          );
        else
          rows.push(
            row(
              s ? `${name}: ${saveTitle(s)}` : name,
              s ? saveDetail(s) : t('saveEmpty'),
              s ? t('saveOverwrite') : t('saveHere'),
              () => done(i),
            ),
          );
      });
      const back = el('button', { class: 'btn', type: 'button' }, t('menuBack'));
      back.addEventListener('click', () => done(null));
      this.screen(
        'dim',
        el(
          'div',
          { class: 'panel' },
          el('h2', {}, t(mode === 'load' ? 'menuLoad' : 'menuSave')),
          ...rows,
          back,
        ),
      );
      back.focus();
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
      select('resolution', t('setResolution'), [
        ['auto', t('setResolutionAuto')],
        ['1', '100 %'],
        ['0.85', '85 %'],
        ['0.7', '70 %'],
        ['0.55', '55 %'],
      ]);
      select('showFps', t('setShowFps'), [
        [false, t('off')],
        [true, t('on')],
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
      select('touchScheme', t('setTouchScheme'), [
        ['stick', t('touchSchemeStick')],
        ['swipe', t('touchSchemeSwipe')],
      ]);
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
      rows.push(this.keyRows(s, onChange));
      const back = el('button', { class: 'btn', type: 'button' }, t('menuBack'));
      this.screen('dim', el('div', { class: 'panel' }, el('h2', {}, t('settingsTitle')), ...rows, back));
      back.addEventListener('click', () => {
        this.clearScreens();
        resolve();
      });
    });
  }

  /** Key bindings: click a key, press the new one (a key taken elsewhere swaps places). */
  private keyRows(s: Settings, onChange: (s: Settings) => void): HTMLElement {
    const names: Record<Bindable, string> = {
      forward: t('keyForward'),
      back: t('keyBack'),
      left: t('keyLeft'),
      right: t('keyRight'),
      sprint: t('keySprint'),
      crouch: t('keyCrouch'),
      interact: t('keyInteract'),
      drink: t('keyDrink'),
      light: t('keyLight'),
      throw: t('keyThrow'),
      journal: t('keyJournal'),
      pause: t('keyPause'),
    };
    const box = el('div', { class: 'keys' });
    let stopListening: (() => void) | null = null;
    const draw = () => {
      stopListening?.();
      const binds = { ...DEFAULT_BINDS, ...s.keys };
      box.replaceChildren(el('h3', {}, t('setKeys')), el('p', { class: 'keys-hint' }, t('setKeysHint')));
      for (const a of BINDABLE) {
        const b = el('button', { class: 'btn key', type: 'button' }, keyName(binds[a]));
        b.addEventListener('click', () => {
          stopListening?.();
          b.textContent = t('setKeysPress');
          const assign = (code: string) => {
            const other = BINDABLE.find((o) => o !== a && binds[o] === code);
            if (other) s.keys = { ...s.keys, [other]: binds[a] };
            s.keys = { ...s.keys, [a]: code };
            onChange(s);
          };
          const onKey = (e: KeyboardEvent) => {
            if (!box.isConnected) return stopListening?.(); // the settings were closed
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.code !== 'Escape') assign(e.code);
            draw();
          };
          // the middle and side mouse buttons can take a control too (left and right are fixed)
          const onMouse = (e: MouseEvent) => {
            if (!box.isConnected) return stopListening?.();
            const code = mouseCode(e.button);
            if (!code) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            assign(code);
            draw();
          };
          window.addEventListener('keydown', onKey, { capture: true });
          window.addEventListener('mousedown', onMouse, { capture: true });
          stopListening = () => {
            window.removeEventListener('keydown', onKey, { capture: true });
            window.removeEventListener('mousedown', onMouse, { capture: true });
            stopListening = null;
          };
        });
        box.append(el('div', { class: 'setting' }, el('label', {}, names[a]), b));
      }
      const reset = el('button', { class: 'btn', type: 'button' }, t('setKeysReset'));
      reset.addEventListener('click', () => {
        s.keys = {};
        onChange(s);
        draw();
      });
      box.append(reset);
    };
    draw();
    return box;
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

  async showOkno(seconds = 3.2, sub = t('oknoSub')): Promise<void> {
    this.setHudVisible(false);
    this.screen('black', el('div', { class: 'okno' }, t('okno')), el('div', { class: 'okno-sub' }, sub));
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
    // the mouse is still captured from the game: without letting it go there is no cursor to click
    this.releasePointer?.();
    back.focus();
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
    const key = this.touchMode ? '' : `<kbd>${escapeHtml(this.interactKey)}</kbd>`;
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

  /** Resolves with the picked option, or −1 if the choice was cancelled (see cancelChoice). */
  choose(options: string[]): Promise<number> {
    this.cancelChoice();
    return new Promise((resolve) => {
      const box = el('div', { class: 'choices' });
      // the key's place, not its letter: on Slovak and Czech keyboards the top row types ľščť…
      const keyHandler = (e: KeyboardEvent) => {
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        const n = m ? Number(m[1]) : 0;
        if (n >= 1 && n <= options.length) pick(n - 1);
      };
      const pick = (i: number) => {
        window.removeEventListener('keydown', keyHandler);
        box.remove();
        this.choicesEl = null;
        this.cancelPending = null;
        resolve(i);
      };
      this.cancelPending = () => pick(-1);
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

  /** Takes an open choice away unanswered (its promise resolves with −1). */
  cancelChoice(): void {
    this.cancelPending?.();
  }

  /** A yes/no question over the current screen; resolves with the answer. */
  confirm(question: string, yes: string, no: string): Promise<boolean> {
    return new Promise((resolve) => {
      const bYes = el('button', { type: 'button' }, yes);
      const bNo = el('button', { type: 'button' }, no);
      this.screen(
        'dim',
        el('div', { class: 'panel' }, el('p', {}, question), el('div', { class: 'menu' }, bYes, bNo)),
      );
      bNo.focus();
      bYes.addEventListener('click', () => {
        this.clearScreens();
        resolve(true);
      });
      bNo.addEventListener('click', () => {
        this.clearScreens();
        resolve(false);
      });
    });
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

/** A key code as the player knows it (KeyE → E, ShiftLeft → Shift ľavý). */
export function keyName(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  // mouse buttons as gamers count them: 3 the middle one, 4 and 5 the side ones
  if (code === 'MouseMiddle') return 'Myš 3 (stredné)';
  if (code === 'MouseBack') return 'Myš 4 (späť)';
  if (code === 'MouseForward') return 'Myš 5 (vpred)';
  if (/^Mouse\d+$/.test(code)) return `Myš ${Number(code.slice(5))}`;
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  const side = code.endsWith('Left') ? ' ľavý' : code.endsWith('Right') ? ' pravý' : '';
  const base = code.replace(/(Left|Right)$/, '');
  const names: Record<string, string> = {
    Shift: 'Shift',
    Control: 'Ctrl',
    Alt: 'Alt',
    Meta: 'Win',
    Space: 'Medzerník',
    CapsLock: 'Caps Lock',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Backslash: '\\',
    Comma: ',',
    Period: '.',
    Slash: '/',
  };
  if (code === 'BracketLeft' || code === 'BracketRight') return names[code]!;
  return (names[base] ?? code) + side;
}

function saveTitle(s: SaveData): string {
  return s.title ?? t('saveUnknown');
}

/** „hrané 12 min · 4. 10. 21:14" */
function saveDetail(s: SaveData): string {
  const played = `${t('savePlayed')} ${Math.max(1, Math.round(s.playSeconds / 60))} min`;
  if (!s.savedAt) return played;
  const when = new Date(s.savedAt).toLocaleString('sk-SK', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${played} · ${when}`;
}

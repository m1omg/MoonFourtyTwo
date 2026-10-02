import '@fontsource/spectral/400.css';
import '@fontsource/spectral/600-italic.css';
import '@fontsource/spectral/400-italic.css';
import '@fontsource/ibm-plex-sans-condensed/400.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import './ui/style.css';
import { Game } from './app/Game.ts';
import { parseDebugHash } from './app/debug.ts';
import { installTestApi } from './app/testApi.ts';
import { t } from './i18n/sk.ts';

function fail(msg: string): void {
  const d = document.createElement('div');
  d.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center;font:18px sans-serif;color:#efe6d4;background:#0b0907';
  d.textContent = msg;
  document.body.append(d);
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const probe = document.createElement('canvas').getContext('webgl2');
if (!probe) {
  fail(t('webglFail'));
} else {
  const debug = parseDebugHash(location.hash);
  const game = new Game(canvas, document.body, debug);
  if (debug.test) installTestApi(game);
  void game.boot();
  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
    window.addEventListener('hashchange', () => location.reload());
  }
}

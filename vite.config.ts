import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/MoonFourtyTwo/) and locally.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
  },
});

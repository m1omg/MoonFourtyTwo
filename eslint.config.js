import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const timeBans = [
  { object: 'Math', property: 'random', message: 'Use rng from src/core/rng.ts (seeded, deterministic).' },
  { object: 'performance', property: 'now', message: 'Use src/core/time.ts.' },
  { object: 'Date', property: 'now', message: 'Use src/core/time.ts.' },
];

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'public', 'assets-src', '.cache', 'playwright-report', 'test-results'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Refresh-rate independence: no wall-clock or unseeded randomness in game code.
    files: ['src/**/*.ts'],
    ignores: ['src/core/time.ts', 'src/core/rng.ts', 'src/core/loop.ts'],
    rules: {
      'no-restricted-properties': ['error', ...timeBans],
      'no-restricted-globals': [
        'error',
        { name: 'requestAnimationFrame', message: 'Only src/core/loop.ts drives frames.' },
      ],
    },
  },
  {
    // The simulation must stay headless (runs under Vitest in Node).
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render/**', '**/ui/**', '**/audio/**', '**/world/**', 'postprocessing', 'n8ao'],
              message: 'sim must stay headless',
            },
          ],
        },
      ],
    },
  },
);

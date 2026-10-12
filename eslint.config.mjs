import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Import boundaries from docs/spec/architecture.md: the CLI reuses
// src/content and src/engine unchanged, so those modules must stay free of
// Next.js, React and persistence imports. The engine additionally never
// imports src/i18n (the engine emits no Interface Text), and src/i18n stays
// free of Next.js, React, persistence, content and engine runtime code
// (types from the engine excepted).
const engineContentBoundaries = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['next', 'next/*'],
            message: 'src/engine and src/content must not import Next.js (see docs/spec/architecture.md).',
          },
          {
            group: ['server-only'],
            message: 'src/engine and src/content must not import server-only (see docs/spec/architecture.md).',
          },
          {
            group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
            message: 'src/engine and src/content must not import React (see docs/spec/architecture.md).',
          },
          {
            group: ['**/persistence', '**/persistence/**'],
            message:
              'src/engine and src/content must not import src/persistence (see docs/spec/architecture.md).',
          },
        ],
      },
    ],
  },
};

const engineBoundaries = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['next', 'next/*'],
            message: 'src/engine must not import Next.js (see docs/spec/architecture.md).',
          },
          {
            group: ['server-only'],
            message: 'src/engine must not import server-only (see docs/spec/architecture.md).',
          },
          {
            group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
            message: 'src/engine must not import React (see docs/spec/architecture.md).',
          },
          {
            group: ['**/persistence', '**/persistence/**'],
            message: 'src/engine must not import src/persistence (see docs/spec/architecture.md).',
          },
          {
            group: ['**/i18n', '**/i18n/**'],
            message:
              'src/engine must not import src/i18n: the engine emits no Interface Text (see docs/spec/architecture.md).',
          },
        ],
      },
    ],
  },
};

const i18nBoundaries = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['next', 'next/*'],
            message: 'src/i18n must not import Next.js (see docs/spec/architecture.md).',
          },
          {
            group: ['server-only'],
            message: 'src/i18n must not import server-only (see docs/spec/architecture.md).',
          },
          {
            group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
            message: 'src/i18n must not import React (see docs/spec/architecture.md).',
          },
          {
            group: ['**/persistence', '**/persistence/**'],
            message: 'src/i18n must not import src/persistence (see docs/spec/architecture.md).',
          },
          {
            group: ['**/content', '**/content/**'],
            message: 'src/i18n must not import src/content (see docs/spec/architecture.md).',
          },
          {
            group: ['**/engine', '**/engine/**'],
            message:
              'src/i18n must not import src/engine runtime code, types excepted (see docs/spec/architecture.md).',
            allowTypeImports: true,
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  {
    // docs/ holds the spec and throwaway mockups, scenarios/ the Scenario
    // collection data; neither is project source.
    ignores: ['node_modules/**', '.next/**', 'docs/**', 'scenarios/**', 'tests/fixtures/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/engine/**/*.ts'],
    ...engineBoundaries,
  },
  {
    files: ['src/content/**/*.ts'],
    ...engineContentBoundaries,
  },
  {
    files: ['src/i18n/**/*.ts'],
    ...i18nBoundaries,
  },
);

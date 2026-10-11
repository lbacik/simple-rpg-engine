import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Import boundaries from docs/spec/architecture.md: the CLI reuses
// src/content and src/engine unchanged, so those modules must stay free of
// Next.js, React and persistence imports.
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

export default tseslint.config(
  {
    // docs/ holds the spec and throwaway mockups, scenarios/ the Scenario
    // collection data; neither is project source.
    ignores: ['node_modules/**', '.next/**', 'docs/**', 'scenarios/**', 'tests/fixtures/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/engine/**/*.ts', 'src/content/**/*.ts'],
    ...engineContentBoundaries,
  },
);

import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['kit/', 'node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.browser },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'one-var': ['error', 'never'],
      'prefer-const': 'error',
    },
  },
  { files: ['test/run.mjs', '*.config.js'], languageOptions: { globals: globals.node } },
];

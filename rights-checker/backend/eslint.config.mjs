// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['**/coverage/**', '**/node_modules/**'] },
  eslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-implicit-coercion': 'error',
      'no-return-await': 'off',
      'no-shadow': 'error',
      'object-shorthand': 'error',
    },
  },
  {
    files: ['**/*.cjs', '**/.sequelizerc'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];

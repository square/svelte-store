module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: [
    'square',
    'svelte3',
    '@typescript-eslint', // add the TypeScript plugin
  ],
  extends: ['plugin:square/typescript'],
  overrides: [
    // this stays the same
    {
      files: ['*.svelte'],
      processor: 'svelte3/svelte3',
    },
  ],
  rules: {
    'func-style': ['error', 'expression'],
    'import/extensions': [
      'error',
      'never',
      {
        svelte: 'always',
        yaml: 'always',
      },
    ],
    'no-console': ['error'],
  },
  env: {
    browser: true,
    node: true,
  },
};

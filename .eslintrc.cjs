module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: [
    'square',
    '@typescript-eslint', // add the TypeScript plugin
  ],
  extends: ['plugin:square/typescript'],
  rules: {
    'func-style': ['error', 'expression'],
    'import/extensions': ['error', 'never'],
    'no-console': ['error'],
  },
  env: {
    browser: true,
    node: true,
  },
};

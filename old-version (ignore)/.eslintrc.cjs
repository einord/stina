/* migrated to eslint.config.js (ESLint v9 flat config) */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'vue', 'import', 'unused-imports'],
  settings: {
    'import/resolver': {
      typescript: { project: './tsconfig.json' },
    },
  },
  rules: {
    'no-console': 'warn',
    'unused-imports/no-unused-imports': 'error',
    'import/order': [
      'warn',
      {
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always',
        groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
      },
    ],
    'import/extensions': [
      'warn',
      'ignorePackages',
      {
        js: 'always',
        ts: 'never',
        vue: 'never',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: { project: false },
    },
    {
      files: ['**/*.vue'],
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules: {
        'vue/multi-word-component-names': 'off',
      },
    },
    {
      files: ['apps/desktop/electron/**'],
      rules: { 'no-console': 'off' },
    },
    {
      files: ['apps/desktop/.electron/**'],
      rules: { 'no-restricted-globals': 'off' },
    },
  ],
};

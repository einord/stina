export default {
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  bracketSpacing: true,
  vueIndentScriptAndStyle: true,
  plugins: ['@trivago/prettier-plugin-sort-imports'],
  importOrder: ['^node:', '^@?\\w', '^@stina/(.*)$', '^\\.\\./(.*)$', '^\\./(.*)$'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
};

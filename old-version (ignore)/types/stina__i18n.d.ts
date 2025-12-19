declare module '@stina/i18n' {
  export function initI18n(lang?: string): void;
  export function t(path: string, vars?: Record<string, string | number>): string;
  export function getLang(): string;
  const _default: { initI18n: typeof initI18n; t: typeof t; getLang: typeof getLang };
  export default _default;
}

export type ThemeName = 'light' | 'dark';
export const themes: ThemeName[] = ['light', 'dark'];
const STORAGE_KEY = 'stina:theme';

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

export function initTheme(defaultTheme: ThemeName = 'light') {
  const saved = (localStorage.getItem(STORAGE_KEY) as ThemeName | null) ?? defaultTheme;
  applyTheme(saved);
  return saved;
}
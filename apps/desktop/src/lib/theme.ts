export type ThemeName = 'light' | 'dark';
export const themes: ThemeName[] = ['light', 'dark'];
const STORAGE_KEY = 'stina:theme';

/**
 * Applies a theme by toggling the document attribute and persisting it.
 */
export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Restores the stored theme (falling back to the provided default) and applies it.
 */
export function initTheme(defaultTheme: ThemeName = 'light') {
  const saved = (localStorage.getItem(STORAGE_KEY) as ThemeName | null) ?? defaultTheme;
  applyTheme(saved);
  return saved;
}

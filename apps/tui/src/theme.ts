export type ThemeKey = 'light' | 'dark';

export interface Theme {
  bg: string;
  fg: string;
  panel: string;
  accent: string;
}

const registry: Record<ThemeKey, Theme> = {
  light: { bg: 'white', fg: 'black', panel: 'grey', accent: 'cyan' },
  dark: { bg: 'black', fg: 'white', panel: 'grey', accent: 'blue' },
};

/**
 * Returns the theme definition for the given key.
 */
export function getTheme(key: ThemeKey): Theme {
  return registry[key];
}

/**
 * Toggles between the available theme keys.
 */
export function toggleThemeKey(key: ThemeKey): ThemeKey {
  return key === 'light' ? 'dark' : 'light';
}

export const themes = registry;

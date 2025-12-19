import { applyTheme } from '@stina/ui-vue'
import { fetchThemeTokens } from './api/client.js'

const THEME_KEY = 'stina-theme'
const DEFAULT_THEME = 'dark'

/**
 * Get the saved theme ID
 */
export function getSavedTheme(): string {
  return localStorage.getItem(THEME_KEY) || DEFAULT_THEME
}

/**
 * Save the theme ID
 */
export function saveTheme(themeId: string): void {
  localStorage.setItem(THEME_KEY, themeId)
}

/**
 * Initialize theme on app start
 */
export async function initTheme(): Promise<void> {
  const themeId = getSavedTheme()

  try {
    const tokens = await fetchThemeTokens(themeId)
    applyTheme(tokens)
  } catch (error) {
    console.error('Failed to load theme, using fallback', error)
    // Fallback to hardcoded dark theme
    applyTheme({
      background: '#1a1a2e',
      foreground: '#eaeaea',
      primary: '#6366f1',
      primaryText: '#ffffff',
      muted: '#2d2d44',
      mutedText: '#9ca3af',
      border: '#3d3d5c',
      danger: '#ef4444',
      success: '#22c55e',
      warning: '#f59e0b',
    })
  }
}

/**
 * Change the current theme
 */
export async function changeTheme(themeId: string): Promise<void> {
  const tokens = await fetchThemeTokens(themeId)
  applyTheme(tokens)
  saveTheme(themeId)
}

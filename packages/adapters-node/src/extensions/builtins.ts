import type { ExtensionManifest, ThemeTokens } from '@stina/core'

/**
 * Dark theme tokens
 */
const darkTokens: Partial<ThemeTokens> = {
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
  radius: '0.5rem',
  spacing: '1rem',
}

/**
 * Light theme tokens
 */
const lightTokens: Partial<ThemeTokens> = {
  background: '#ffffff',
  foreground: '#1a1a2e',
  primary: '#6366f1',
  primaryText: '#ffffff',
  muted: '#f3f4f6',
  mutedText: '#6b7280',
  border: '#e5e7eb',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
  radius: '0.5rem',
  spacing: '1rem',
}

/**
 * Built-in dark theme extension
 */
export const darkThemeExtension: ExtensionManifest = {
  id: 'stina.theme-dark',
  version: '0.5.0',
  name: 'Dark Theme',
  description: 'Default dark theme for Stina',
  type: 'theme',
  engines: { app: '>=0.5.0' },
  contributes: {
    themes: [
      {
        id: 'dark',
        label: 'Dark',
        tokens: darkTokens,
      },
    ],
  },
}

/**
 * Built-in light theme extension
 */
export const lightThemeExtension: ExtensionManifest = {
  id: 'stina.theme-light',
  version: '0.5.0',
  name: 'Light Theme',
  description: 'Default light theme for Stina',
  type: 'theme',
  engines: { app: '>=0.5.0' },
  contributes: {
    themes: [
      {
        id: 'light',
        label: 'Light',
        tokens: lightTokens,
      },
    ],
  },
}

/**
 * All built-in extensions
 */
export const builtinExtensions: ExtensionManifest[] = [darkThemeExtension, lightThemeExtension]

import type { ExtensionManifest, ThemeTokens } from '@stina/core'
import { flattenThemeValues } from '@stina/core'

// Theme tokens are provided by extensions, not built-in.
// Empty objects produce valid (empty) flat token maps.
const darkTokens: Partial<ThemeTokens> = flattenThemeValues({})
const lightTokens: Partial<ThemeTokens> = flattenThemeValues({})

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

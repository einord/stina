import { themeTokenSpec, withDefaultTokens } from '@stina/core'
import type { ThemeTokenName, ThemeTokens } from '@stina/core'

/**
 * Apply theme tokens as CSS custom properties on :root
 */
export function applyTheme(tokens: Partial<ThemeTokens>): void {
  const root = document.documentElement
  const resolved = withDefaultTokens(tokens)

  for (const key of Object.keys(themeTokenSpec) as ThemeTokenName[]) {
    const { cssVar } = themeTokenSpec[key]
    root.style.setProperty(cssVar, resolved[key])
  }
}

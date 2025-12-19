import type { ThemeTokens, ThemeTokenMeta, ThemeTokenName } from './tokenSpec.js'
export { themeTokenSpec, withDefaultTokens } from './tokenSpec.js'
export type { ThemeTokens, ThemeTokenMeta, ThemeTokenName } from './tokenSpec.js'

/**
 * Complete theme definition
 */
export interface Theme {
  id: string
  label: string
  tokens: ThemeTokens
}

/**
 * Theme design tokens
 */
export interface ThemeTokens {
  // Colors
  background: string
  foreground: string
  primary: string
  primaryText: string
  muted: string
  mutedText: string
  border: string
  danger: string
  success: string
  warning: string
  // Optional layout tokens
  radius?: string
  spacing?: string
}

/**
 * Complete theme definition
 */
export interface Theme {
  id: string
  label: string
  tokens: ThemeTokens
}

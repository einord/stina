import type { ThemeTokens } from '@stina/core'

/**
 * Apply theme tokens as CSS custom properties on :root
 */
export function applyTheme(tokens: ThemeTokens): void {
  const root = document.documentElement

  root.style.setProperty('--color-background', tokens.background)
  root.style.setProperty('--color-foreground', tokens.foreground)
  root.style.setProperty('--color-primary', tokens.primary)
  root.style.setProperty('--color-primary-text', tokens.primaryText)
  root.style.setProperty('--color-muted', tokens.muted)
  root.style.setProperty('--color-muted-text', tokens.mutedText)
  root.style.setProperty('--color-border', tokens.border)
  root.style.setProperty('--color-danger', tokens.danger)
  root.style.setProperty('--color-success', tokens.success)
  root.style.setProperty('--color-warning', tokens.warning)

  if (tokens.radius) {
    root.style.setProperty('--radius', tokens.radius)
  }
  if (tokens.spacing) {
    root.style.setProperty('--spacing', tokens.spacing)
  }

  // Apply background and foreground to body
  document.body.style.backgroundColor = tokens.background
  document.body.style.color = tokens.foreground
}

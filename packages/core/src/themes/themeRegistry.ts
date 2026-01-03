import { withDefaultTokens } from './theme.js'
import type { Theme, ThemeTokens } from './theme.js'

/**
 * Registry for managing themes
 */
export class ThemeRegistry {
  private themes = new Map<string, Theme>()

  /**
   * Register a theme
   */
  registerTheme(id: string, label: string, tokens: Partial<ThemeTokens>): void {
    this.themes.set(id, { id, label, tokens: withDefaultTokens(tokens) })
  }

  /**
   * Get a theme by ID
   */
  getTheme(id: string): Theme | undefined {
    return this.themes.get(id)
  }

  /**
   * List all registered themes
   */
  listThemes(): Theme[] {
    return Array.from(this.themes.values())
  }

  /**
   * Check if a theme exists
   */
  hasTheme(id: string): boolean {
    return this.themes.has(id)
  }

  /**
   * Clear all registered themes
   */
  clear(): void {
    this.themes.clear()
  }
}

/**
 * Default global theme registry
 */
export const themeRegistry = new ThemeRegistry()

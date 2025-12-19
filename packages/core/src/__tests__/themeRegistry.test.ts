import { describe, it, expect, beforeEach } from 'vitest'
import { ThemeRegistry } from '../themes/themeRegistry.js'
import type { ThemeTokens } from '../themes/theme.js'

describe('ThemeRegistry', () => {
  let registry: ThemeRegistry

  beforeEach(() => {
    registry = new ThemeRegistry()
  })

  const darkTokens: ThemeTokens = {
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
  }

  it('should register a theme', () => {
    registry.registerTheme('dark', 'Dark Theme', darkTokens)

    expect(registry.listThemes()).toHaveLength(1)
    expect(registry.hasTheme('dark')).toBe(true)
  })

  it('should get a theme by id', () => {
    registry.registerTheme('dark', 'Dark Theme', darkTokens)

    const theme = registry.getTheme('dark')

    expect(theme).toBeDefined()
    expect(theme?.id).toBe('dark')
    expect(theme?.label).toBe('Dark Theme')
    expect(theme?.tokens).toEqual(darkTokens)
  })

  it('should return undefined for non-existent theme', () => {
    const theme = registry.getTheme('non-existent')

    expect(theme).toBeUndefined()
  })

  it('should list all themes', () => {
    registry.registerTheme('dark', 'Dark', darkTokens)
    registry.registerTheme('light', 'Light', darkTokens)

    const themes = registry.listThemes()

    expect(themes).toHaveLength(2)
    expect(themes.map((t) => t.id)).toContain('dark')
    expect(themes.map((t) => t.id)).toContain('light')
  })

  it('should overwrite existing theme with same id', () => {
    registry.registerTheme('dark', 'Dark', darkTokens)
    registry.registerTheme('dark', 'Dark v2', { ...darkTokens, background: '#000' })

    const theme = registry.getTheme('dark')

    expect(theme?.label).toBe('Dark v2')
    expect(theme?.tokens.background).toBe('#000')
  })

  it('should clear all themes', () => {
    registry.registerTheme('dark', 'Dark', darkTokens)
    registry.registerTheme('light', 'Light', darkTokens)

    registry.clear()

    expect(registry.listThemes()).toHaveLength(0)
  })
})

export interface ThemeTokenMeta {
  cssVar: string
  description: string
  default: string
}

/**
 * Single source of truth for theme tokens.
 * Add new tokens here with css variable name + default value.
 */
export const themeTokenSpec = {
  background: {
    cssVar: '--color-background',
    description: 'App background color',
    default: '#1a1a2e',
  },
  foreground: {
    cssVar: '--color-foreground',
    description: 'Primary text color',
    default: '#eaeaea',
  },
  primary: {
    cssVar: '--color-primary',
    description: 'Primary accent color',
    default: '#6366f1',
  },
  primaryText: {
    cssVar: '--color-primary-text',
    description: 'Text color on primary surfaces',
    default: '#ffffff',
  },
  muted: {
    cssVar: '--color-muted',
    description: 'Muted surface color',
    default: '#2d2d44',
  },
  mutedText: {
    cssVar: '--color-muted-text',
    description: 'Text on muted surfaces',
    default: '#9ca3af',
  },
  border: {
    cssVar: '--color-border',
    description: 'Border color',
    default: '#3d3d5c',
  },
  danger: {
    cssVar: '--color-danger',
    description: 'Danger/negative state color',
    default: '#ef4444',
  },
  success: {
    cssVar: '--color-success',
    description: 'Success/positive state color',
    default: '#22c55e',
  },
  warning: {
    cssVar: '--color-warning',
    description: 'Warning/attention color',
    default: '#f59e0b',
  },
  radius: {
    cssVar: '--radius',
    description: 'Border radius for surfaces',
    default: '0.5rem',
  },
  spacing: {
    cssVar: '--spacing',
    description: 'Base spacing unit',
    default: '1rem',
  },
  appBackgroundTest: {
    cssVar: '--app-background-test',
    description: 'Test background color for the app',
    default: '#222',
  }
} as const satisfies Record<string, ThemeTokenMeta>

export type ThemeTokenName = keyof typeof themeTokenSpec

export type ThemeTokens = { [K in ThemeTokenName]: string }

/**
 * Merge a partial set of tokens with defaults from the spec.
 */
export function withDefaultTokens(tokens: Partial<ThemeTokens>): ThemeTokens {
  const merged = {} as ThemeTokens
  for (const key of Object.keys(themeTokenSpec) as ThemeTokenName[]) {
    merged[key] = tokens[key] ?? themeTokenSpec[key].default
  }
  return merged
}

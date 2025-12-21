export interface ThemeTokenMeta {
  cssVar: string
  description: string
  default: string
}

type ThemeTokenLeaf = { description: string; default: string }
type ThemeTokenTree = Record<string, ThemeTokenLeaf | ThemeTokenTree>

type ExtractLeafPaths<T, Prefix extends string = ''> = {
  [K in keyof T]: T[K] extends ThemeTokenLeaf
    ? `${Prefix}${K & string}`
    : T[K] extends Record<string, any>
      ? ExtractLeafPaths<T[K], `${Prefix}${K & string}.`>
      : never
}[keyof T]

const CSS_VAR_PREFIX = '--theme'

function toKebabCase(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
}

function cssVarFromPath(path: string[]): string {
  const kebabPath = path.map(toKebabCase).join('-')
  return `${CSS_VAR_PREFIX}-${kebabPath}`
}

function isLeaf(node: ThemeTokenLeaf | ThemeTokenTree): node is ThemeTokenLeaf {
  return typeof (node as ThemeTokenLeaf).default === 'string'
}

function flattenTokenTree<T extends ThemeTokenTree>(
  tree: T,
  path: string[] = []
): Record<ExtractLeafPaths<T>, ThemeTokenMeta> {
  const entries: [string, ThemeTokenMeta][] = []

  for (const [key, value] of Object.entries(tree)) {
    const nextPath = [...path, key]
    if (isLeaf(value)) {
      const tokenName = nextPath.join('.')
      entries.push([
        tokenName,
        { cssVar: cssVarFromPath(nextPath), description: value.description, default: value.default },
      ])
      continue
    }

    const childEntries = flattenTokenTree(value as ThemeTokenTree, nextPath)
    entries.push(...Object.entries(childEntries))
  }

  return entries.reduce((acc, [name, meta]) => {
    acc[name as ExtractLeafPaths<T>] = meta
    return acc
  }, {} as Record<ExtractLeafPaths<T>, ThemeTokenMeta>)
}

/**
 * Hierarchical source of truth for theme tokens.
 * CSS variable names are derived automatically from the path, e.g. main.windowBackground -> --theme-main-window-background.
 */
export const themeTokenTree = {
  main: {
    windowBackground: {
      description: 'Background of the main window',
      default: '#1a1a2e',
    },
    windowForeground: {
      description: 'Primary text color in the main window',
      default: '#eaeaea',
    },
  },
  accent: {
    primary: {
      description: 'Primary accent color',
      default: '#6366f1',
    },
    primaryText: {
      description: 'Text color on primary accents',
      default: '#ffffff',
    },
  },
  surface: {
    muted: {
      description: 'Muted surface color',
      default: '#2d2d44',
    },
    mutedText: {
      description: 'Text on muted surfaces',
      default: '#9ca3af',
    },
    border: {
      description: 'Border color',
      default: '#3d3d5c',
    },
  },
  state: {
    danger: {
      description: 'Danger/negative state color',
      default: '#ef4444',
    },
    success: {
      description: 'Success/positive state color',
      default: '#22c55e',
    },
    warning: {
      description: 'Warning/attention color',
      default: '#f59e0b',
    },
  },
  layout: {
    radius: {
      description: 'Border radius for surfaces',
      default: '0.5rem',
    },
    spacing: {
      description: 'Base spacing unit',
      default: '1rem',
    },
  },
  dev: {
    appBackgroundTest: {
      description: 'Test background color for the app',
      default: '#222',
    },
  },
} as const satisfies ThemeTokenTree

export type ThemeTokenName = ExtractLeafPaths<typeof themeTokenTree>

export type ThemeTokens = { [K in ThemeTokenName]: string }

export const themeTokenSpec: Record<ThemeTokenName, ThemeTokenMeta> = flattenTokenTree(themeTokenTree)

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

export type ThemeTokenValueTree = { [segment: string]: string | ThemeTokenValueTree }

/**
 * Flatten a hierarchical value tree into a flat ThemeTokens-compatible object.
 */
export function flattenThemeValues(values: ThemeTokenValueTree, path: string[] = []): Partial<ThemeTokens> {
  const result: Partial<ThemeTokens> = {}

  for (const [key, value] of Object.entries(values)) {
    const nextPath = [...path, key]

    if (typeof value === 'string') {
      const tokenName = nextPath.join('.') as ThemeTokenName
      if (!themeTokenSpec[tokenName]) {
        throw new Error(`Unknown theme token: ${tokenName}`)
      }
      result[tokenName] = value
      continue
    }

    Object.assign(result, flattenThemeValues(value as ThemeTokenValueTree, nextPath))
  }

  return result
}

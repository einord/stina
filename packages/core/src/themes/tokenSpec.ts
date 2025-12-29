export interface ThemeTokenMeta {
  cssVar: string
  description: string
  default: string
}

type ThemeTokenLeaf = { description: string; default: string }
interface ThemeTokenTree {
  [key: string]: ThemeTokenLeaf | ThemeTokenTree
}

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

function flattenTokenTree(
  tree: ThemeTokenTree,
  path: string[] = []
): Record<string, ThemeTokenMeta> {
  const entries: [string, ThemeTokenMeta][] = []

  for (const [key, value] of Object.entries(tree)) {
    const nextPath = [...path, key]
    if (isLeaf(value)) {
      const tokenName = nextPath.join('.')
      entries.push([
        tokenName,
        {
          cssVar: cssVarFromPath(nextPath),
          description: value.description,
          default: value.default,
        },
      ])
      continue
    }

    const childEntries = flattenTokenTree(value as ThemeTokenTree, nextPath)
    entries.push(...Object.entries(childEntries))
  }

  return entries.reduce(
    (acc, [name, meta]) => {
      acc[name] = meta
      return acc
    },
    {} as Record<string, ThemeTokenMeta>
  )
}

/**
 * Hierarchical source of truth for theme tokens.
 * CSS variable names are derived automatically from the path, e.g. main.windowBackground -> --theme-main-window-background.
 */
export const themeTokenTree = {
  general: {
    color: {
      description: 'Base color for general text and elements',
      default: 'hsl(210, 15%, 75%)',
    },
    colorMuted: {
      description: 'Muted color for less prominent text and elements',
      default: '#9ca3af',
    },
    colorHover: {
      description: 'Color on hover states for general text and elements',
      default: '#c09539',
    },
    borderColor: {
      description: 'Base color for borders and dividers',
      default: 'hsl(214, 13%, 32%)',
    },
    borderColorHover: {
      description: 'Border color on hover states',
      default: '#c09539',
    },
  },
  main: {
    windowBackground: {
      description: 'Background of the main window',
      default:
        'conic-gradient(at 50% 50%, hsl(225, 28%, 14%), 0.25turn, hsl(225, 24%, 16%), 0.5turn, hsl(225, 44%, 7%), 0.75turn, hsl(225, 28%, 14%))',
    },
    components: {
      navbar: {
        background: {
          description: 'Background color of the navigation bar',
          default: 'transparent',
        },
        backgroundActive: {
          description: 'Background color of the active item in the navigation bar',
          default: 'hsl(0 0 100% / 0.075)',
        },
        foreground: {
          description: 'Foreground color of the navigation bar',
          default: 'var(--theme-general-color)',
        },
        activeLineColor: {
          description: 'Color of the active line indicator in the navigation bar',
          default: '#1e59b8',
        },
        subNavbar: {
          background: {
            description: 'Background color of the sub navigation bar',
            default: 'hsl(226, 30%, 16%)',
          },
          backgroundActive: {
            description: 'Background color of the active item in the sub navigation bar',
            default: 'hsl(0 0 100% / 0.075)',
          },
          foreground: {
            description: 'Foreground color of the sub navigation bar',
            default: 'var(--theme-general-color)',
          },
          activeLineColor: {
            description: 'Color of the active line indicator in the sub navigation bar',
            default: '#1e59b8',
          },
        },
      },
      main: {
        background: {
          description: 'Background color of the main content area',
          default: 'hsl(270, 75%, 6%)',
        },
      },
      chat: {
        color: {
          description: 'Text color in the chat area',
          default: 'var(--theme-general-color)',
        },
        inputBackground: {
          description: 'Background color of the chat input area',
          default: 'hsl(216, 34%, 12%)',
        },
        interactionBackground: {
          description: 'Background color of chat interactions',
          default: 'hsl(225, 28%, 14%)',
        },
        interactionColor: {
          description: 'Text color of chat interactions',
          default: 'var(--theme-general-color)',
        },
        toolBackground: {
          description: 'Background color of tool usage boxes in chat',
          default: '#c09539',
        },
        toolColor: {
          description: 'Text color of tool usage boxes in chat',
          default: '#3a290b',
        },
      },
    },
  },
  components: {
    button: {
      background: {
        description: 'Background color of buttons',
        default: 'hsl(216, 34%, 12%)',
      },
      backgroundHover: {
        description: 'Background color of buttons on hover',
        default: 'hsl(216, 34%, 16%)',
      },
      color: {
        description: 'Text color of buttons',
        default: 'var(--theme-general-color)',
      },
      colorDisabled: {
        description: 'Text color of disabled buttons',
        default: 'var(--theme-general-color-muted)',
      },
    },
  },
} as const satisfies ThemeTokenTree

type ThemeTokenTreeLiteral = typeof themeTokenTree
export type ThemeTokenName = ExtractLeafPaths<ThemeTokenTreeLiteral>
export type ThemeTokens = { [K in ThemeTokenName]: string }

const rawThemeTokenSpec = flattenTokenTree(themeTokenTree)
export const themeTokenSpec = rawThemeTokenSpec as Record<ThemeTokenName, ThemeTokenMeta>

/**
 * Merge a partial set of tokens with defaults from the spec.
 */
export function withDefaultTokens(tokens: Partial<ThemeTokens>): ThemeTokens {
  const merged = {} as ThemeTokens
  for (const key of Object.keys(themeTokenSpec) as ThemeTokenName[]) {
    const spec = themeTokenSpec[key]
    merged[key] = tokens[key] ?? spec.default
  }
  return merged
}

export type ThemeTokenValueTree = { [segment: string]: string | ThemeTokenValueTree }

/**
 * Flatten a hierarchical value tree into a flat ThemeTokens-compatible object.
 */
export function flattenThemeValues(
  values: ThemeTokenValueTree,
  path: string[] = []
): Partial<ThemeTokens> {
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

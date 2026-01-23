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
    : T[K] extends Record<string, unknown>
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
    background: {
      description: 'Base background color for the application',
      default: 'hsl(225, 28%, 12%)',
    },
    backgroundSecondary: {
      description: 'Secondary background color for cards and elevated surfaces',
      default: 'hsl(225, 28%, 16%)',
    },
    backgroundHover: {
      description: 'Background color on hover states',
      default: 'hsl(225, 28%, 20%)',
    },
    color: {
      description: 'Base color for general text and elements',
      default: 'hsl(210, 15%, 75%)',
    },
    colorMuted: {
      description: 'Muted color for less prominent text and elements',
      default: '#9ca3af',
    },
    colorMutedContrast: {
      description: 'Contrast color for text on muted-colored backgrounds',
      default: '#ffffff',
    },
    colorHover: {
      description: 'Color on hover states for general text and elements',
      default: '#c09539',
    },
    colorPrimary: {
      description: 'Primary accent color for highlights and focus states',
      default: '#c09539',
    },
    colorPrimaryContrast: {
      description: 'Contrast color for text/icons on primary-colored backgrounds',
      default: '#3a290b',
    },
    colorDanger: {
      description: 'Color for error states and destructive actions',
      default: '#b02a37',
    },
    colorDangerBackground: {
      description: 'Background color for danger/error states',
      default: 'rgba(176, 42, 55, 0.1)',
    },
    borderColor: {
      description: 'Base color for borders and dividers',
      default: 'hsl(214, 13%, 32%)',
    },
    borderColorHover: {
      description: 'Border color on hover states',
      default: '#c09539',
    },
    borderColorActive: {
      description: 'Border color on active states',
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
        thinkingBackground: {
          description: 'Background color of thinking messages in chat',
          default: 'hsl(225, 24%, 20%)',
        },
        thinkingColor: {
          description: 'Text color of thinking messages in chat',
          default: 'var(--theme-general-color-muted)',
        },
      },
    },
  },
  components: {
    card: {
      background: {
        description: 'Background color of cards and elevated containers',
        default: 'hsl(225, 28%, 16%)',
      },
      borderColor: {
        description: 'Border color of cards',
        default: 'var(--theme-general-border-color)',
      },
    },
    table: {
      headerBackground: {
        description: 'Background color of table headers',
        default: 'hsl(225, 28%, 18%)',
      },
      rowHover: {
        description: 'Background color of table rows on hover',
        default: 'hsl(225, 28%, 20%)',
      },
      borderColor: {
        description: 'Border color of table cells',
        default: 'var(--theme-general-border-color)',
      },
    },
    button: {
      background: {
        description: 'Background color of buttons',
        default: 'hsl(216, 34%, 12%)',
      },
      color: {
        description: 'Text color of buttons',
        default: 'var(--theme-general-color)',
      },
      backgroundHover: {
        description: 'Background color of buttons on hover',
        default: 'hsl(216, 34%, 16%)',
      },
      backgroundPrimary: {
        description: 'Background color of primary buttons',
        default: '#c09539',
      },
      colorPrimary: {
        description: 'Text color of primary buttons',
        default: '#3a290b',
      },
      backgroundPrimaryHover: {
        description: 'Background color of primary buttons on hover',
        default: '#d4a94b',
      },
      backgroundDisabled: {
        description: 'Background color of disabled buttons',
        default: 'hsl(216, 34%, 8%)',
      },
      colorDisabled: {
        description: 'Text color of disabled buttons',
        default: 'var(--theme-general-color-muted)',
      },
      backgroundDisabledHover: {
        description: 'Background color of disabled buttons on hover',
        default: 'hsl(216, 34%, 8%)',
      },
      backgroundDanger: {
        description: 'Background color of danger buttons',
        default: '#b02a37',
      },
      colorDanger: {
        description: 'Text color of danger buttons',
        default: '#ffffff',
      },
      backgroundDangerHover: {
        description: 'Background color of danger buttons on hover',
        default: '#c03945',
      },
    },
    input: {
      background: {
        description: 'Background color of input fields',
        default: 'hsl(225, 28%, 14%)',
      },
    },
    dropdown: {
      background: {
        description: 'Background color of dropdown menus',
        default: 'hsl(225, 28%, 14%)',
      },
      color: {
        description: 'Text color of dropdown menus',
        default: 'var(--theme-general-color)',
      },
      backgroundHover: {
        description: 'Background color of dropdown items on hover',
        default: 'hsl(216, 34%, 16%)',
      },
    },
    modal: {
      overlayBackground: {
        description: 'Background color of the modal overlay',
        default: 'rgba(0, 0, 0, 0.6)',
      },
      background: {
        description: 'Background color of modals',
        default: 'hsl(216, 34%, 12%)',
      },
      color: {
        description: 'Text color of modals',
        default: 'var(--theme-general-color)',
      },
    },
    pill: {
      background: {
        description: 'Background color of default pills',
        default: 'hsl(216, 20%, 22%)',
      },
      color: {
        description: 'Text color of default pills',
        default: 'var(--theme-general-color)',
      },
      backgroundPrimary: {
        description: 'Background color of primary pills',
        default: '#c09539',
      },
      colorPrimary: {
        description: 'Text color of primary pills',
        default: '#3a290b',
      },
      backgroundSuccess: {
        description: 'Background color of success pills',
        default: '#16a34a',
      },
      colorSuccess: {
        description: 'Text color of success pills',
        default: '#ffffff',
      },
      backgroundWarning: {
        description: 'Background color of warning pills',
        default: '#f59e0b',
      },
      colorWarning: {
        description: 'Text color of warning pills',
        default: '#000000',
      },
      backgroundDanger: {
        description: 'Background color of danger pills',
        default: '#b02a37',
      },
      colorDanger: {
        description: 'Text color of danger pills',
        default: '#ffffff',
      },
      backgroundAccent: {
        description: 'Background color of accent pills',
        default: '#6366f1',
      },
      colorAccent: {
        description: 'Text color of accent pills',
        default: '#ffffff',
      },
    },
    collapsible: {
      borderColor: {
        description: 'Border color of collapsible sections',
        default: 'var(--theme-general-border-color)',
      },
      headerBackground: {
        description: 'Background color of collapsible header',
        default: 'hsl(216, 28%, 14%)',
      },
      headerBackgroundHover: {
        description: 'Background color of collapsible header on hover',
        default: 'hsl(216, 28%, 18%)',
      },
      titleColor: {
        description: 'Text color of collapsible title',
        default: 'var(--theme-general-color)',
      },
      descriptionColor: {
        description: 'Text color of collapsible description',
        default: 'var(--theme-general-color-muted)',
      },
      iconColor: {
        description: 'Color of collapsible icons',
        default: 'var(--theme-general-color-muted)',
      },
      contentBackground: {
        description: 'Background color of collapsible content area',
        default: 'transparent',
      },
    },
    checkbox: {
      borderColor: {
        description: 'Border color of checkbox',
        default: 'var(--theme-general-border-color)',
      },
      borderColorHover: {
        description: 'Border color of checkbox on hover',
        default: 'var(--theme-general-border-color-hover)',
      },
      background: {
        description: 'Background color of unchecked checkbox',
        default: 'transparent',
      },
      backgroundChecked: {
        description: 'Background color of checked checkbox',
        default: 'var(--theme-general-border-color)',
      },
      checkmarkColor: {
        description: 'Color of the checkmark icon',
        default: 'var(--theme-general-background)',
      },
      labelColor: {
        description: 'Text color of checkbox label',
        default: 'var(--theme-general-color)',
      },
      labelColorChecked: {
        description: 'Text color of checkbox label when checked',
        default: 'var(--theme-general-color-muted)',
      },
    },
    markdown: {
      color: {
        description: 'Text color of markdown content',
        default: 'var(--theme-general-color)',
      },
      colorMuted: {
        description: 'Muted text color for blockquotes',
        default: 'var(--theme-general-color-muted)',
      },
      linkColor: {
        description: 'Color of links in markdown',
        default: 'var(--theme-general-color)',
      },
      linkColorHover: {
        description: 'Color of links on hover',
        default: 'var(--theme-general-color-hover)',
      },
      codeBackground: {
        description: 'Background color of inline code',
        default: 'var(--theme-components-button-background)',
      },
      preBackground: {
        description: 'Background color of code blocks',
        default: 'hsl(270, 75%, 6%)',
      },
      preBorderColor: {
        description: 'Border color of code blocks',
        default: 'var(--theme-general-border-color)',
      },
      blockquoteBorderColor: {
        description: 'Border color of blockquotes',
        default: 'var(--theme-general-border-color)',
      },
      hrColor: {
        description: 'Color of horizontal rules',
        default: 'var(--theme-general-border-color)',
      },
      tableBorderColor: {
        description: 'Border color of tables',
        default: 'var(--theme-general-border-color)',
      },
      tableHeaderBackground: {
        description: 'Background color of table headers',
        default: 'var(--theme-components-button-background-hover)',
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

import type { ThemeTokens } from '../themes/theme.js'

/**
 * Extension manifest following VS Code-like conventions
 */
export interface ExtensionManifest {
  /** Unique identifier: publisher.name */
  id: string
  /** Semantic version */
  version: string
  /** Display name */
  name: string
  /** Description of the extension */
  description?: string
  /** Extension type */
  type: 'feature' | 'theme'
  /** Compatibility requirements */
  engines: {
    app: string
  }
  /** Required permissions (metadata only in bootstrap) */
  permissions?: ExtensionPermission[]
  /** What the extension contributes */
  contributes?: ExtensionContributions
}

export type ExtensionPermission = 'db' | 'ui' | 'network' | 'filesystem'

/**
 * Extension contributions
 */
export interface ExtensionContributions {
  commands?: ExtensionCommand[]
  ui?: ExtensionUiContributions
  themes?: ExtensionTheme[]
  prompts?: ExtensionPromptContribution[]
  migrations?: {
    folder: string
  }
  aiProviders?: ExtensionAIProvider[]
}

export interface ExtensionCommand {
  id: string
  title: string
}

export interface ExtensionUiContributions {
  webPanels?: ExtensionPanel[]
  tuiPanels?: ExtensionPanel[]
}

export interface ExtensionPanel {
  id: string
  title: string
  view: 'settings' | 'dashboard' | 'custom'
}

export interface ExtensionTheme {
  id: string
  label: string
  tokens: Partial<ThemeTokens>
}

export type ExtensionPromptSection = 'system' | 'behavior' | 'tools'

export interface ExtensionPromptContribution {
  /** Unique ID within the extension */
  id: string
  /** Optional title for the prompt chunk */
  title?: string
  /** Prompt section placement */
  section?: ExtensionPromptSection
  /** Plain text prompt content */
  text?: string
  /** Optional localized prompt content (keyed by locale, e.g. "en", "sv") */
  i18n?: Record<string, string>
  /** Optional ordering hint (lower comes first) */
  order?: number
}

export interface ExtensionAIProvider {
  id: string
  name: string
  /** Path to provider factory within extension (e.g., 'providers/anthropic.js') */
  factory: string
}

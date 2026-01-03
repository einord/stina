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

export interface ExtensionAIProvider {
  id: string
  name: string
  /** Path to provider factory within extension (e.g., 'providers/anthropic.js') */
  factory: string
}

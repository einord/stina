/**
 * Contribution Types
 *
 * Types for extension contributions: settings, panels, providers, tools, commands, prompts.
 */

import type { LocalizedString } from './types.localization.js'
import type { ExtensionComponentData } from './types.components.js'

/**
 * Accent colour names — constrained palette per §05.
 */
export type AccentName = 'sand' | 'olive' | 'rose' | 'sky' | 'plum' | 'graphite' | 'amber'

/**
 * Visual hints an extension declares for threads it spawns.
 *
 * One object per extension (not per trigger kind). Per-trigger-kind overrides
 * are deferred — if a future step needs them this type will evolve.
 * Only applies to threads whose trigger carries an extension_id (mail and
 * calendar kinds). Scheduled triggers have no extension_id and therefore
 * always use trigger-kind defaults in the UI.
 */
export interface ExtensionThreadHints {
  /** Sprite name. Any string — sprite registry not built yet. */
  icon?: string
  /** Accent colour from the §05 palette. */
  accent?: AccentName
  /** Card style modifier. Defaults to left-line when absent. */
  card_style?: 'minimal' | 'bordered' | 'left-line'
  /** AppContent field name for snippet override. Any string — no registry yet. */
  snippet_field?: string
  /** Very short overlay text, e.g. "3 new". Max width enforced in CSS. */
  badge?: string
}

/**
 * What an extension can contribute to Stina
 */
export interface ExtensionContributions {
  /** Tool settings views for UI */
  toolSettings?: ToolSettingsViewDefinition[]
  /** Right panel contributions */
  panels?: PanelDefinition[]
  /** AI providers */
  providers?: ProviderDefinition[]
  /** Tools for Stina to use */
  tools?: ToolDefinition[]
  /** Slash commands */
  commands?: CommandDefinition[]
  /** Prompt contributions for the system prompt */
  prompts?: PromptContribution[]
  /** Storage collection declarations */
  storage?: {
    collections: {
      [name: string]: {
        /** Fields to index for fast queries */
        indexes?: string[]
      }
    }
  }
  /** Visual hints for threads this extension spawns (mail + calendar kinds only) */
  thread_hints?: ExtensionThreadHints
}

// ============================================================================
// Tool Settings Views
// ============================================================================

/**
 * Tool settings view definition (UI schema)
 */
export interface ToolSettingsViewDefinition {
  /** Unique view ID within the extension */
  id: string
  /** Display title */
  title: string
  /** Help text */
  description?: string
  /** View configuration */
  view: ToolSettingsView
}

/**
 * Tool settings view types
 */
export type ToolSettingsView = ToolSettingsListView | ToolSettingsComponentView

/**
 * List view backed by tools
 */
export interface ToolSettingsListView {
  /** View kind */
  kind: 'list'
  /** Tool ID for listing items */
  listToolId: string
  /** Tool ID for fetching details (optional) */
  getToolId?: string
  /** Tool ID for creating/updating items (optional) */
  upsertToolId?: string
  /** Tool ID for deleting items (optional) */
  deleteToolId?: string
  /** Mapping from tool data to UI fields */
  mapping: ToolSettingsListMapping
  /** Param name for search query (default: "query") */
  searchParam?: string
  /** Param name for limit (default: "limit") */
  limitParam?: string
  /** Param name for get/delete ID (default: "id") */
  idParam?: string
  /** Static params always sent to list tool */
  listParams?: Record<string, unknown>
  /**
   * Component-tree-based create/edit form. Fields bind to the current
   * item via `value: "$item.<key>"` (or `selectedValue` / `checked`),
   * and the host saves the resulting object via `upsertToolId` when
   * the user clicks "Save".
   */
  editView?: {
    /** Root component to render in the create/edit modal. */
    content: ExtensionComponentData
  }
  /** Optional grouping configuration. When set, items are visually grouped by this field. */
  groupBy?: ToolSettingsListGroupBy
}

/**
 * Configures grouping for a list view. Items are grouped by the value
 * of `key` on each item; groups appear in the order specified by `order`
 * (with unlisted groups falling back to alphabetical order at the end).
 */
export interface ToolSettingsListGroupBy {
  /** Key in each item used to determine group membership. */
  key: string
  /** Explicit ordering of group values. Groups not listed appear afterwards, sorted alphabetically. */
  order?: string[]
  /** Human-friendly labels per group value (rendered as section headers). Falls back to the raw value if missing. */
  labels?: Record<string, string>
}

/**
 * Mapping from tool list data to UI fields
 */
export interface ToolSettingsListMapping {
  /** Key for items array in tool result data */
  itemsKey: string
  /** Key for total count in tool result data */
  countKey?: string
  /** Key for item ID */
  idKey: string
  /** Key for item label */
  labelKey: string
  /** Key for item description */
  descriptionKey?: string
  /** Key for secondary label */
  secondaryKey?: string
}

/**
 * Component-based tool settings view using the declarative DSL.
 * Reuses the same structure as PanelComponentView for consistency.
 */
export interface ToolSettingsComponentView {
  /** View kind */
  kind: 'component'
  /** Data sources. Keys become scope variables (e.g., "$settings"). */
  data?: Record<string, ToolSettingsActionDataSource>
  /** Root component to render */
  content: ExtensionComponentData
}

/**
 * Action-based data source for tool settings.
 */
export interface ToolSettingsActionDataSource {
  /** Action ID to call for fetching data */
  action: string
  /** Parameters to pass to the action */
  params?: Record<string, unknown>
  /** Event names that trigger refresh */
  refreshOn?: string[]
}

// ============================================================================
// Panels
// ============================================================================

/**
 * Panel definition for right panel views
 */
export interface PanelDefinition {
  /** Unique panel ID within the extension */
  id: string
  /** Display title */
  title: string
  /** Icon name (from huge-icons) */
  icon?: string
  /** Panel view schema */
  view: PanelView
}

/**
 * Panel view schema (declarative)
 */
export type PanelView = PanelComponentView | PanelUnknownView

export interface PanelUnknownView {
  /** View kind */
  kind: string
  /** Additional view configuration */
  [key: string]: unknown
}

/**
 * Action-based data source for declarative panels.
 * Uses actions (not tools) to fetch data.
 */
export interface PanelActionDataSource {
  /** Action ID to call for fetching data */
  action: string
  /** Parameters to pass to the action */
  params?: Record<string, unknown>
  /** Event names that should trigger a refresh of this data */
  refreshOn?: string[]
}

/**
 * Component-based panel view using the declarative DSL.
 * Data is fetched via actions, content is rendered via ExtensionComponent.
 */
export interface PanelComponentView {
  kind: 'component'
  /** Data sources available in the panel. Keys become variable names (e.g., "$projects"). */
  data?: Record<string, PanelActionDataSource>
  /** Root component to render */
  content: ExtensionComponentData
}

// ============================================================================
// Providers
// ============================================================================

/**
 * Provider definition (metadata only, implementation in code)
 */
export interface ProviderDefinition {
  /** Provider ID */
  id: string
  /** Display name */
  name: string
  /** Description */
  description?: string
  /** Suggested default model when creating a new model configuration */
  suggestedDefaultModel?: string
  /** Default settings for this provider (e.g., { url: "http://localhost:11434" }) */
  defaultSettings?: Record<string, unknown>
  /**
   * Declarative configuration view rendered with the extensionComponent
   * system. The host owns the settings state — bind fields with
   * `value: "$settings.<key>"` and the host updates the model's
   * settingsOverride when the user edits. `onChangeAction` is optional
   * for input fields in this view; buttons can still use `onClickAction`
   * to call extension actions (e.g. OAuth, "Test connection").
   */
  configView?: ProviderConfigView
}

/**
 * Component-tree-based configuration view for a provider.
 */
export interface ProviderConfigView {
  /** Component tree describing the form. */
  content: import('./types.components.js').ExtensionComponentData
}

// ============================================================================
// Tools
// ============================================================================

/**
 * Unified tool risk / visual-emphasis scale per redesign-2026 §05.
 *
 * Defined inline here (not imported from `@stina/core`) so the public
 * extension-api keeps no dependency on core; structurally identical to
 * `@stina/core`'s `ToolSeverity` so values flow through unchanged.
 */
export type ToolSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Tool definition (metadata only, implementation in code)
 */
export interface ToolDefinition {
  /** Tool ID */
  id: string
  /**
   * Display name - can be a simple string or localized strings.
   * @example "Get Weather"
   * @example { en: "Get Weather", sv: "Hämta väder" }
   */
  name: LocalizedString
  /**
   * Description for Stina - can be a simple string or localized strings.
   * Note: The AI always receives the English description (or fallback) for consistency.
   * Localized descriptions are used for UI display only.
   * @example "Fetches current weather for a location"
   * @example { en: "Fetches current weather", sv: "Hämtar aktuellt väder" }
   */
  description: LocalizedString
  /** Parameter schema (JSON Schema) */
  parameters?: Record<string, unknown>
  /**
   * Whether this tool requires user confirmation before execution.
   * Defaults to true if not specified — tools require confirmation unless explicitly opted out.
   */
  requiresConfirmation?: boolean
  /**
   * Optional custom confirmation prompt to show the user.
   * Only used when confirmation is required.
   * @example { en: "Allow sending email?", sv: "Tillåt att skicka e-post?" }
   */
  confirmationPrompt?: LocalizedString
  /**
   * Optional severity classification driving redesign-2026 §05 visual
   * weight (and, in later milestones, §06 auto-policy / approval flow).
   * When omitted, the orchestrator producer treats the tool as 'medium'
   * per autonomy/types.ts. Critical tools stand out visually but are not
   * yet routed through a blocking-modal flow (item #7).
   */
  severity?: ToolSeverity
}

/**
 * @deprecated Use `requiresConfirmation` and `confirmationPrompt` directly on ToolDefinition instead.
 * Configuration for tool confirmation.
 */
export interface ToolConfirmationConfig {
  /**
   * Default confirmation prompt to show the user.
   * If not provided, a generic prompt like "Allow {toolName} to run?" is used.
   * @example { en: "Allow sending email?", sv: "Tillåt att skicka e-post?" }
   */
  prompt?: LocalizedString
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Command definition
 */
export interface CommandDefinition {
  /** Command ID (e.g., "weather" for /weather) */
  id: string
  /** Display name */
  name: string
  /** Description */
  description: string
}

// ============================================================================
// Prompts
// ============================================================================

export type PromptSection = 'system' | 'behavior' | 'tools'

export interface PromptContribution {
  /** Unique ID within the extension */
  id: string
  /** Optional title for the prompt chunk */
  title?: string
  /** Prompt section placement */
  section?: PromptSection
  /** Plain text prompt content */
  text?: string
  /** Optional localized prompt content (keyed by locale, e.g. "en", "sv") */
  i18n?: Record<string, string>
  /** Optional ordering hint (lower comes first) */
  order?: number
}

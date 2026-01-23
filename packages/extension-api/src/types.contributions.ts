/**
 * Contribution Types
 *
 * Types for extension contributions: settings, panels, providers, tools, commands, prompts.
 */

import type { LocalizedString } from './types.localization.js'
import type { ExtensionComponentData } from './types.components.js'

/**
 * What an extension can contribute to Stina
 */
export interface ExtensionContributions {
  /** User-configurable settings */
  settings?: SettingDefinition[]
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
}

// ============================================================================
// Settings
// ============================================================================

/**
 * Setting definition for the UI
 */
export interface SettingDefinition {
  /** Setting ID (namespaced automatically) */
  id: string
  /** Display title */
  title: string
  /** Help text */
  description?: string
  /** Setting type */
  type: 'string' | 'number' | 'boolean' | 'select'
  /** Default value */
  default?: unknown
  /** For select type: available options */
  options?: { value: string; label: string }[]
  /** For select type: load options from tool */
  optionsToolId?: string
  /** Params for options tool */
  optionsParams?: Record<string, unknown>
  /** Mapping for options tool response */
  optionsMapping?: SettingOptionsMapping
  /** Tool ID for creating a new option */
  createToolId?: string
  /** Label for create action */
  createLabel?: string
  /** Fields for create form */
  createFields?: SettingDefinition[]
  /** Static params always sent to create tool */
  createParams?: Record<string, unknown>
  /** Mapping for create tool response */
  createMapping?: SettingCreateMapping
  /** Validation rules */
  validation?: {
    required?: boolean
    min?: number
    max?: number
    pattern?: string
  }
}

/**
 * Mapping for select field options from tool response
 */
export interface SettingOptionsMapping {
  /** Key for items array in tool result data */
  itemsKey: string
  /** Key for option value */
  valueKey: string
  /** Key for option label */
  labelKey: string
  /** Optional key for description */
  descriptionKey?: string
}

/**
 * Mapping for create tool response
 */
export interface SettingCreateMapping {
  /** Key for result data object */
  resultKey?: string
  /** Key for option value (defaults to "id") */
  valueKey: string
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
  /** Fields for create/edit forms (uses SettingDefinition) */
  fields?: SettingDefinition[]
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
  /** Schema for provider-specific configuration UI */
  configSchema?: ProviderConfigSchema
}

/**
 * Schema for provider-specific configuration.
 * Used to generate UI forms for configuring provider settings.
 */
export interface ProviderConfigSchema {
  /** Property definitions */
  properties: Record<string, ProviderConfigProperty>
  /** Display order of properties in UI (optional, defaults to object key order) */
  order?: string[]
}

/**
 * Property types for provider configuration
 */
export type ProviderConfigPropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'password'
  | 'url'

/**
 * Single property in a provider configuration schema.
 * Defines how a setting should be rendered and validated in the UI.
 */
export interface ProviderConfigProperty {
  /** Property type - determines UI control */
  type: ProviderConfigPropertyType
  /** Display label */
  title: string
  /** Help text shown below the input */
  description?: string
  /** Default value */
  default?: unknown
  /** Whether the field is required */
  required?: boolean
  /** Placeholder text for input fields */
  placeholder?: string
  /** For 'select' type: static options */
  options?: ProviderConfigSelectOption[]
  /** Validation rules */
  validation?: ProviderConfigValidation
}

/**
 * Option for select-type properties
 */
export interface ProviderConfigSelectOption {
  /** Value stored in settings */
  value: string
  /** Display label */
  label: string
}

/**
 * Validation rules for a property
 */
export interface ProviderConfigValidation {
  /** Regex pattern the value must match */
  pattern?: string
  /** Minimum string length */
  minLength?: number
  /** Maximum string length */
  maxLength?: number
  /** Minimum number value */
  min?: number
  /** Maximum number value */
  max?: number
}

// ============================================================================
// Tools
// ============================================================================

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

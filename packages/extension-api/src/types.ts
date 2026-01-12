/**
 * Extension manifest format (manifest.json)
 */
export interface ExtensionManifest {
  /** Unique identifier (e.g., "ollama-provider") */
  id: string
  /** Human-readable name */
  name: string
  /** Version string (semver) */
  version: string
  /** Short description */
  description: string
  /** Author information */
  author: {
    name: string
    url?: string
  }
  /** Repository URL */
  repository?: string
  /** License identifier */
  license?: string
  /** Minimum Stina version required */
  engines?: {
    stina: string
  }
  /** Supported platforms */
  platforms?: Platform[]
  /** Entry point file (relative to extension root) */
  main: string
  /** Required permissions */
  permissions: Permission[]
  /** What the extension contributes */
  contributes?: ExtensionContributions
}

export type Platform = 'web' | 'electron' | 'tui'

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
export type ToolSettingsView = ToolSettingsListView

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
export type PanelView = PanelGroupedListView | PanelUnknownView

export interface PanelUnknownView {
  /** View kind */
  kind: string
  /** Additional view configuration */
  [key: string]: unknown
}

export interface PanelValueRef {
  ref: string
}

export type PanelValue = string | number | boolean | null | PanelValueRef

export interface PanelToolSource {
  toolId: string
  params?: Record<string, PanelValue>
  resultKey?: string
  refreshEvents?: string[]
}

export interface PanelToolAction {
  toolId: string
  params?: Record<string, PanelValue>
}

export interface PanelGroupedListView {
  kind: 'grouped-list'
  data: PanelToolSource
  group: {
    idKey: string
    titleKey: string
    itemsKey: string
    collapsedKey?: string
    emptyLabel?: string
  }
  item: {
    idKey: string
    titleKey: string
    descriptionKey?: string
    iconKey?: string
    statusKey?: string
    dateKey?: string
    timeKey?: string
    commentCountKey?: string
    comments?: {
      itemsKey: string
      idKey?: string
      textKey: string
      createdAtKey?: string
      inputPlaceholder?: string
      actions?: {
        add?: PanelToolAction
        delete?: PanelToolAction
      }
    }
    subItems?: {
      itemsKey: string
      idKey: string
      textKey: string
      completedAtKey?: string
      inputPlaceholder?: string
      actions?: {
        add?: PanelToolAction
        delete?: PanelToolAction
      }
    }
  }
  editor?: PanelItemEditor
  actions?: {
    toggleGroup?: PanelToolAction
    toggleSubItem?: PanelToolAction
    editItem?: PanelToolAction
  }
}

export interface PanelItemEditor {
  title?: string
  createLabel?: string
  getToolId?: string
  upsertToolId: string
  deleteToolId?: string
  idParam?: string
  createDefaults?: Record<string, PanelValue>
  fields: SettingDefinition[]
}

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

// ============================================================================
// Prompt Contributions
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

// ============================================================================
// Provider Configuration Schema
// ============================================================================

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

/**
 * Tool definition (metadata only, implementation in code)
 */
export interface ToolDefinition {
  /** Tool ID */
  id: string
  /** Display name */
  name: string
  /** Description for Stina */
  description: string
  /** Parameter schema (JSON Schema) */
  parameters?: Record<string, unknown>
}

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
// Permissions
// ============================================================================

export type Permission =
  | NetworkPermission
  | StoragePermission
  | UserDataPermission
  | CapabilityPermission
  | SystemPermission

/** Network access permissions */
export type NetworkPermission =
  | 'network:*'
  | `network:localhost`
  | `network:localhost:${number}`
  | `network:${string}`

/** Storage permissions */
export type StoragePermission = 'database.own' | 'storage.local'

/** User data permissions */
export type UserDataPermission =
  | 'user.profile.read'
  | 'user.location.read'
  | 'chat.history.read'
  | 'chat.current.read'

/** Capability permissions */
export type CapabilityPermission =
  | 'provider.register'
  | 'tools.register'
  | 'actions.register'
  | 'settings.register'
  | 'commands.register'
  | 'panels.register'
  | 'events.emit'
  | 'scheduler.register'
  | 'chat.message.write'

/** System permissions */
export type SystemPermission =
  | 'files.read'
  | 'files.write'
  | 'clipboard.read'
  | 'clipboard.write'

// ============================================================================
// Extension Context (API available to extensions)
// ============================================================================

/**
 * Disposable resource that can be cleaned up
 */
export interface Disposable {
  dispose(): void
}

/**
 * Context provided to extension's activate function
 */
export interface ExtensionContext {
  /** Extension metadata */
  readonly extension: {
    readonly id: string
    readonly version: string
    readonly storagePath: string
  }

  /** Network access (if permitted) */
  readonly network?: NetworkAPI

  /** Settings access (if permitted) */
  readonly settings?: SettingsAPI

  /** Provider registration (if permitted) */
  readonly providers?: ProvidersAPI

  /** Tool registration (if permitted) */
  readonly tools?: ToolsAPI

  /** Action registration (if permitted) */
  readonly actions?: ActionsAPI

  /** Event emission (if permitted) */
  readonly events?: EventsAPI

  /** Scheduler access (if permitted) */
  readonly scheduler?: SchedulerAPI

  /** User data access (if permitted) */
  readonly user?: UserAPI

  /** Chat access (if permitted) */
  readonly chat?: ChatAPI

  /** Database access (if permitted) */
  readonly database?: DatabaseAPI

  /** Local storage (if permitted) */
  readonly storage?: StorageAPI

  /** Logging (always available) */
  readonly log: LogAPI
}

/**
 * Network API for making HTTP requests
 */
export interface NetworkAPI {
  /**
   * Fetch a URL (permissions are enforced by host)
   */
  fetch(url: string, options?: RequestInit): Promise<Response>
}

/**
 * Settings API for reading/writing extension settings
 */
export interface SettingsAPI {
  /**
   * Get all settings for this extension
   */
  getAll<T extends Record<string, unknown>>(): Promise<T>

  /**
   * Get a specific setting value
   */
  get<T>(key: string): Promise<T | undefined>

  /**
   * Set a setting value
   */
  set(key: string, value: unknown): Promise<void>

  /**
   * Listen for setting changes
   */
  onChange(callback: (key: string, value: unknown) => void): Disposable
}

/**
 * Providers API for registering AI providers
 */
export interface ProvidersAPI {
  /**
   * Register an AI provider
   */
  register(provider: AIProvider): Disposable
}

/**
 * Tools API for registering tools
 */
export interface ToolsAPI {
  /**
   * Register a tool that Stina can use
   */
  register(tool: Tool): Disposable
}

/**
 * Actions API for registering UI actions
 */
export interface ActionsAPI {
  /**
   * Register an action that UI components can invoke
   */
  register(action: Action): Disposable
}

/**
 * Events API for notifying the host
 */
export interface EventsAPI {
  /**
   * Emit a named event with optional payload
   */
  emit(name: string, payload?: Record<string, unknown>): Promise<void>
}

/**
 * Scheduler schedule types
 */
export type SchedulerSchedule =
  | { type: 'at'; at: string }
  | { type: 'cron'; cron: string; timezone?: string }
  | { type: 'interval'; everyMs: number }

/**
 * Scheduler job request
 */
export interface SchedulerJobRequest {
  id: string
  schedule: SchedulerSchedule
  payload?: Record<string, unknown>
  misfire?: 'run_once' | 'skip'
}

/**
 * Scheduler fire payload
 */
export interface SchedulerFirePayload {
  id: string
  payload?: Record<string, unknown>
  scheduledFor: string
  firedAt: string
  delayMs: number
}

/**
 * Scheduler API for registering jobs
 */
export interface SchedulerAPI {
  schedule(job: SchedulerJobRequest): Promise<void>
  cancel(jobId: string): Promise<void>
  onFire(callback: (payload: SchedulerFirePayload) => void): Disposable
}

/**
 * User profile data
 */
export interface UserProfile {
  firstName?: string
  nickname?: string
  language?: string
  timezone?: string
}

/**
 * User API for profile access
 */
export interface UserAPI {
  getProfile(): Promise<UserProfile>
}

/**
 * Chat instruction message
 */
export interface ChatInstructionMessage {
  text: string
  conversationId?: string
}

/**
 * Chat API for appending instructions
 */
export interface ChatAPI {
  appendInstruction(message: ChatInstructionMessage): Promise<void>
}

/**
 * Database API for extension-specific tables
 */
export interface DatabaseAPI {
  /**
   * Execute a SQL query (only extension's prefixed tables allowed)
   */
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
}

/**
 * Simple key-value storage API
 */
export interface StorageAPI {
  /**
   * Get a value by key
   */
  get<T>(key: string): Promise<T | undefined>

  /**
   * Set a value
   */
  set(key: string, value: unknown): Promise<void>

  /**
   * Delete a key
   */
  delete(key: string): Promise<void>

  /**
   * Get all keys
   */
  keys(): Promise<string[]>
}

/**
 * Logging API
 */
export interface LogAPI {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

// ============================================================================
// AI Provider Types
// ============================================================================

/**
 * AI provider implementation
 */
export interface AIProvider {
  /** Provider ID (must match manifest) */
  id: string
  /** Display name */
  name: string

  /**
   * Get available models from this provider
   * @param options Optional settings for the provider (e.g., URL)
   */
  getModels(options?: GetModelsOptions): Promise<ModelInfo[]>

  /**
   * Chat completion with streaming
   */
  chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent, void, unknown>

  /**
   * Optional: Generate embeddings
   */
  embed?(texts: string[]): Promise<number[][]>
}

/**
 * Model information
 */
export interface ModelInfo {
  /** Model ID */
  id: string
  /** Display name */
  name: string
  /** Description */
  description?: string
  /** Context window size */
  contextLength?: number
}

/**
 * Chat message
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  /** For assistant messages: tool calls made by the model */
  tool_calls?: ToolCall[]
  /** For tool messages: the ID of the tool call this is a response to */
  tool_call_id?: string
}

/**
 * A tool call made by the model
 */
export interface ToolCall {
  /** Unique ID for this tool call */
  id: string
  /** Tool name/ID to invoke */
  name: string
  /** Arguments for the tool (as parsed object) */
  arguments: Record<string, unknown>
}

/**
 * Options for chat completion
 */
export interface ChatOptions {
  /** Model to use */
  model?: string
  /** Temperature (0-1) */
  temperature?: number
  /** Maximum tokens to generate */
  maxTokens?: number
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Provider-specific settings from model configuration */
  settings?: Record<string, unknown>
  /** Available tools for this request */
  tools?: ToolDefinition[]
}

/**
 * Options for getModels
 */
export interface GetModelsOptions {
  /** Provider-specific settings (e.g., URL for Ollama) */
  settings?: Record<string, unknown>
}

/**
 * Streaming events from chat
 */
export type StreamEvent =
  | { type: 'content'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_start'; name: string; input: unknown; toolCallId: string }
  | { type: 'tool_end'; name: string; output: unknown; toolCallId: string }
  | { type: 'done'; usage?: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; message: string }

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Tool implementation
 */
export interface Tool {
  /** Tool ID (must match manifest) */
  id: string
  /** Display name */
  name: string
  /** Description for Stina */
  description: string
  /** Parameter schema (JSON Schema) */
  parameters?: Record<string, unknown>

  /**
   * Execute the tool
   */
  execute(params: Record<string, unknown>): Promise<ToolResult>
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether the tool succeeded */
  success: boolean
  /** Result data (for Stina to use) */
  data?: unknown
  /** Human-readable message */
  message?: string
  /** Error message if failed */
  error?: string
}

// ============================================================================
// Action Types (for UI interactions, separate from Tools)
// ============================================================================

/**
 * Action implementation for UI interactions.
 * Actions are invoked by UI components, not by Stina (AI).
 */
export interface Action {
  /** Action ID (unique within the extension) */
  id: string

  /**
   * Execute the action
   * @param params Parameters from the UI component (with $-values already resolved)
   */
  execute(params: Record<string, unknown>): Promise<ActionResult>
}

/**
 * Action execution result
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean
  /** Result data (returned to UI) */
  data?: unknown
  /** Error message if failed */
  error?: string
}

// ============================================================================
// Extension Entry Point
// ============================================================================

/**
 * Extension entry point interface
 */
export interface ExtensionModule {
  /**
   * Called when extension is activated
   */
  activate(context: ExtensionContext): void | Disposable | Promise<void | Disposable>

  /**
   * Called when extension is deactivated
   */
  deactivate?(): void | Promise<void>
}

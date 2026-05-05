/**
 * Contributions Schema
 *
 * Zod schemas for extension contributions: settings, panels, providers, tools, commands, prompts.
 */

import { z } from 'zod'
import { ExtensionComponentDataSchema } from './components.schema.js'

// =============================================================================
// Localization
// =============================================================================

/**
 * Localized string - either a simple string or a map of language codes to strings
 */
export const LocalizedStringSchema = z
  .union([z.string(), z.record(z.string())])
  .describe('String or localized string map')

// =============================================================================
// Tool Settings Views
// =============================================================================

/**
 * Tool settings list mapping
 */
export const ToolSettingsListMappingSchema = z
  .object({
    itemsKey: z.string().describe('Key for items array in tool result data'),
    countKey: z.string().optional().describe('Key for total count'),
    idKey: z.string().describe('Key for item ID'),
    labelKey: z.string().describe('Key for item label'),
    descriptionKey: z.string().optional().describe('Key for item description'),
    secondaryKey: z.string().optional().describe('Key for secondary label'),
  })
  .describe('Mapping from tool list data to UI fields')

/**
 * Action-based data source for tool settings
 */
export const ToolSettingsActionDataSourceSchema = z
  .object({
    action: z.string().describe('Action ID to call for fetching data'),
    params: z.record(z.unknown()).optional().describe('Parameters to pass to the action'),
    refreshOn: z.array(z.string()).optional().describe('Event names that trigger refresh'),
  })
  .describe('Action-based data source')

/**
 * Grouping configuration for a list view
 */
export const ToolSettingsListGroupBySchema = z
  .object({
    key: z.string().describe('Key in each item used to determine group membership'),
    order: z
      .array(z.string())
      .optional()
      .describe('Explicit ordering of group values; unlisted groups appear afterwards alphabetically'),
    labels: z
      .record(z.string())
      .optional()
      .describe('Human-friendly labels per group value (rendered as section headers)'),
  })
  .describe('List view grouping configuration')

/**
 * List view backed by tools
 */
export const ToolSettingsListViewSchema = z
  .object({
    kind: z.literal('list').describe('View kind'),
    listToolId: z.string().describe('Tool ID for listing items'),
    getToolId: z.string().optional().describe('Tool ID for fetching details'),
    upsertToolId: z.string().optional().describe('Tool ID for creating/updating items'),
    deleteToolId: z.string().optional().describe('Tool ID for deleting items'),
    mapping: ToolSettingsListMappingSchema.describe('Mapping from tool data to UI'),
    searchParam: z.string().optional().describe('Param name for search query'),
    limitParam: z.string().optional().describe('Param name for limit'),
    idParam: z.string().optional().describe('Param name for get/delete ID'),
    listParams: z.record(z.unknown()).optional().describe('Static params for list tool'),
    editView: z
      .object({
        content: ExtensionComponentDataSchema.describe('Root component for the create/edit modal'),
      })
      .optional()
      .describe('Component-tree create/edit form bound to $item.<key>'),
    groupBy: ToolSettingsListGroupBySchema.optional().describe(
      'Optional grouping configuration; when set, items are visually grouped by this field',
    ),
  })
  .describe('List view backed by tools')

/**
 * Component-based tool settings view
 */
export const ToolSettingsComponentViewSchema = z
  .object({
    kind: z.literal('component').describe('View kind'),
    data: z.record(ToolSettingsActionDataSourceSchema).optional().describe('Data sources'),
    content: ExtensionComponentDataSchema.describe('Root component to render'),
  })
  .describe('Component-based tool settings view')

/**
 * Tool settings view types
 */
export const ToolSettingsViewSchema = z
  .union([ToolSettingsListViewSchema, ToolSettingsComponentViewSchema])
  .describe('Tool settings view')

/**
 * Tool settings view definition
 */
export const ToolSettingsViewDefinitionSchema = z
  .object({
    id: z.string().describe('Unique view ID within the extension'),
    title: z.string().describe('Display title'),
    description: z.string().optional().describe('Help text'),
    view: ToolSettingsViewSchema.describe('View configuration'),
  })
  .describe('Tool settings view definition')

// =============================================================================
// Panels
// =============================================================================

/**
 * Action-based data source for panels
 */
export const PanelActionDataSourceSchema = z
  .object({
    action: z.string().describe('Action ID to call for fetching data'),
    params: z.record(z.unknown()).optional().describe('Parameters to pass to the action'),
    refreshOn: z.array(z.string()).optional().describe('Event names that trigger refresh'),
  })
  .describe('Panel data source')

/**
 * Component-based panel view
 */
export const PanelComponentViewSchema = z
  .object({
    kind: z.literal('component').describe('View kind'),
    data: z.record(PanelActionDataSourceSchema).optional().describe('Data sources'),
    content: ExtensionComponentDataSchema.describe('Root component to render'),
  })
  .describe('Component-based panel view')

/**
 * Unknown panel view (for extensibility)
 */
export const PanelUnknownViewSchema = z
  .object({
    kind: z.string().describe('View kind'),
  })
  .passthrough()
  .describe('Unknown panel view')

/**
 * Panel view schema
 */
export const PanelViewSchema = z
  .union([PanelComponentViewSchema, PanelUnknownViewSchema])
  .describe('Panel view')

/**
 * Panel definition
 */
export const PanelDefinitionSchema = z
  .object({
    id: z.string().describe('Unique panel ID within the extension'),
    title: z.string().describe('Display title'),
    icon: z.string().optional().describe('Icon name (from huge-icons)'),
    view: PanelViewSchema.describe('Panel view schema'),
  })
  .describe('Panel definition')

// =============================================================================
// Providers
// =============================================================================

/**
 * Component-tree-based provider config view.
 */
export const ProviderConfigViewSchema = z
  .object({
    content: ExtensionComponentDataSchema.describe('Root component to render'),
  })
  .describe('Provider configuration view (component tree)')

/**
 * Provider definition
 */
export const ProviderDefinitionSchema = z
  .object({
    id: z.string().describe('Provider ID'),
    name: z.string().describe('Display name'),
    description: z.string().optional().describe('Description'),
    suggestedDefaultModel: z.string().optional().describe('Suggested default model'),
    defaultSettings: z.record(z.unknown()).optional().describe('Default settings'),
    configView: ProviderConfigViewSchema.optional().describe('Component-tree configuration view'),
  })
  .describe('Provider definition')

// =============================================================================
// Tools
// =============================================================================

/**
 * Tool severity (visual emphasis + autonomy classification, per §05/§06).
 */
export const ToolSeveritySchema = z
  .enum(['low', 'medium', 'high', 'critical'])
  .describe('Tool severity (low | medium | high | critical)')

/**
 * Tool definition
 */
export const ToolDefinitionSchema = z
  .object({
    id: z.string().describe('Tool ID'),
    name: LocalizedStringSchema.describe('Display name'),
    description: LocalizedStringSchema.describe('Description for Stina'),
    parameters: z.record(z.unknown()).optional().describe('Parameter schema (JSON Schema)'),
    requiresConfirmation: z.boolean().optional().describe('Whether this tool requires user confirmation before execution (default: true)'),
    confirmationPrompt: LocalizedStringSchema.optional().describe('Custom confirmation prompt'),
    severity: ToolSeveritySchema.optional().describe('Optional severity classification (defaults to medium at the orchestrator)'),
  })
  .describe('Tool definition')

// =============================================================================
// Commands
// =============================================================================

/**
 * Command definition
 */
export const CommandDefinitionSchema = z
  .object({
    id: z.string().describe('Command ID (e.g., "weather" for /weather)'),
    name: z.string().describe('Display name'),
    description: z.string().describe('Description'),
  })
  .describe('Command definition')

// =============================================================================
// Prompts
// =============================================================================

/**
 * Prompt section
 */
export const PromptSectionSchema = z
  .enum(['system', 'behavior', 'tools'])
  .describe('Prompt section placement')

/**
 * Prompt contribution
 */
export const PromptContributionSchema = z
  .object({
    id: z.string().describe('Unique ID within the extension'),
    title: z.string().optional().describe('Optional title for the prompt chunk'),
    section: PromptSectionSchema.optional().describe('Prompt section placement'),
    text: z.string().optional().describe('Plain text prompt content'),
    i18n: z.record(z.string()).optional().describe('Localized prompt content'),
    order: z.number().optional().describe('Ordering hint (lower comes first)'),
  })
  .describe('Prompt contribution')

// =============================================================================
// Storage
// =============================================================================

/**
 * Storage collection config schema
 */
export const StorageCollectionConfigSchema = z
  .object({
    indexes: z.array(z.string()).optional().describe('Fields to index for fast queries'),
  })
  .describe('Collection configuration')

/**
 * Storage contributions schema
 */
export const StorageContributionsSchema = z
  .object({
    collections: z.record(StorageCollectionConfigSchema).describe('Collection definitions'),
  })
  .describe('Storage contributions')

// =============================================================================
// Thread Hints
// =============================================================================

/**
 * Accent colour names — constrained palette per §05.
 * Dark-mode token pairs are deferred to a follow-up step.
 */
export const AccentNameSchema = z
  .enum(['sand', 'olive', 'rose', 'sky', 'plum', 'graphite', 'amber'])
  .describe('Accent colour name from the §05 palette')

/**
 * Visual hints an extension declares for threads it spawns.
 *
 * One object per extension (not per trigger kind). Per-trigger-kind overrides
 * are deferred — if a future step needs them this schema will evolve.
 * Only applies to threads whose trigger carries an extension_id (mail and
 * calendar kinds). Scheduled triggers have no extension_id and therefore
 * always use trigger-kind defaults in the UI.
 */
export const ExtensionThreadHintsSchema = z
  .object({
    /** Sprite name. Any string — sprite registry not built yet. */
    icon: z.string().optional().describe('Sprite name (any string — sprite registry not built yet)'),
    /** Accent colour from the §05 palette. */
    accent: AccentNameSchema.optional().describe('Accent colour from the §05 palette'),
    /** Card style modifier. Defaults to left-line when absent. */
    card_style: z
      .enum(['minimal', 'bordered', 'left-line'])
      .optional()
      .describe("Card style modifier: 'minimal' | 'bordered' | 'left-line'"),
    /** AppContent field name for snippet override. Any string — no registry yet. */
    snippet_field: z
      .string()
      .optional()
      .describe('AppContent field name (any string — no registry yet)'),
    /** Very short overlay text, e.g. "3 new". Max width enforced in CSS. */
    badge: z.string().optional().describe('Very short overlay text, e.g. "3 new"'),
  })
  .describe('Visual hints for thread cards contributed by an extension')

// =============================================================================
// Extension Contributions
// =============================================================================

/**
 * Extension contributions
 */
export const ExtensionContributionsSchema = z
  .object({
    toolSettings: z.array(ToolSettingsViewDefinitionSchema).optional().describe('Tool settings views'),
    panels: z.array(PanelDefinitionSchema).optional().describe('Right panel contributions'),
    providers: z.array(ProviderDefinitionSchema).optional().describe('AI providers'),
    tools: z.array(ToolDefinitionSchema).optional().describe('Tools for Stina to use'),
    commands: z.array(CommandDefinitionSchema).optional().describe('Slash commands'),
    prompts: z.array(PromptContributionSchema).optional().describe('Prompt contributions'),
    storage: StorageContributionsSchema.optional().describe('Storage collection declarations'),
    thread_hints: ExtensionThreadHintsSchema.optional().describe(
      'Visual hints for threads this extension spawns (mail + calendar kinds only)',
    ),
  })
  .describe('What an extension can contribute to Stina')

// =============================================================================
// Type Exports
// =============================================================================

export type LocalizedString = z.infer<typeof LocalizedStringSchema>
export type ToolSettingsListMapping = z.infer<typeof ToolSettingsListMappingSchema>
export type ToolSettingsActionDataSource = z.infer<typeof ToolSettingsActionDataSourceSchema>
export type ToolSettingsListView = z.infer<typeof ToolSettingsListViewSchema>
export type ToolSettingsListGroupBy = z.infer<typeof ToolSettingsListGroupBySchema>
export type ToolSettingsComponentView = z.infer<typeof ToolSettingsComponentViewSchema>
export type ToolSettingsView = z.infer<typeof ToolSettingsViewSchema>
export type ToolSettingsViewDefinition = z.infer<typeof ToolSettingsViewDefinitionSchema>
export type PanelActionDataSource = z.infer<typeof PanelActionDataSourceSchema>
export type PanelComponentView = z.infer<typeof PanelComponentViewSchema>
export type PanelUnknownView = z.infer<typeof PanelUnknownViewSchema>
export type PanelView = z.infer<typeof PanelViewSchema>
export type PanelDefinition = z.infer<typeof PanelDefinitionSchema>
export type ProviderConfigView = z.infer<typeof ProviderConfigViewSchema>
export type ProviderDefinition = z.infer<typeof ProviderDefinitionSchema>
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>
export type CommandDefinition = z.infer<typeof CommandDefinitionSchema>
export type PromptSection = z.infer<typeof PromptSectionSchema>
export type PromptContribution = z.infer<typeof PromptContributionSchema>
export type StorageCollectionConfig = z.infer<typeof StorageCollectionConfigSchema>
export type StorageContributions = z.infer<typeof StorageContributionsSchema>
export type AccentName = z.infer<typeof AccentNameSchema>
export type ExtensionThreadHints = z.infer<typeof ExtensionThreadHintsSchema>
export type ExtensionContributions = z.infer<typeof ExtensionContributionsSchema>

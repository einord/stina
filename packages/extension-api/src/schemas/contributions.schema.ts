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
// Settings
// =============================================================================

/**
 * Options mapping for select field options from tool response
 */
export const SettingOptionsMappingSchema = z
  .object({
    itemsKey: z.string().describe('Key for items array in tool result data'),
    valueKey: z.string().describe('Key for option value'),
    labelKey: z.string().describe('Key for option label'),
    descriptionKey: z.string().optional().describe('Optional key for description'),
  })
  .describe('Mapping for select field options')

/**
 * Create mapping for create tool response
 */
export const SettingCreateMappingSchema = z
  .object({
    resultKey: z.string().optional().describe('Key for result data object'),
    valueKey: z.string().describe('Key for option value (defaults to "id")'),
  })
  .describe('Mapping for create tool response')

/**
 * Validation rules for settings
 */
export const SettingValidationSchema = z
  .object({
    required: z.boolean().optional().describe('Whether the field is required'),
    min: z.number().optional().describe('Minimum value (number) or length (string)'),
    max: z.number().optional().describe('Maximum value (number) or length (string)'),
    pattern: z.string().optional().describe('Regex pattern for validation'),
  })
  .describe('Validation rules')

/**
 * Setting definition - forward declaration to allow recursion
 */
export const SettingDefinitionSchema: z.ZodType<{
  id: string
  title: string
  description?: string
  type: 'string' | 'number' | 'boolean' | 'select'
  default?: unknown
  options?: { value: string; label: string }[]
  optionsToolId?: string
  optionsParams?: Record<string, unknown>
  optionsMapping?: z.infer<typeof SettingOptionsMappingSchema>
  createToolId?: string
  createLabel?: string
  createFields?: unknown[]
  createParams?: Record<string, unknown>
  createMapping?: z.infer<typeof SettingCreateMappingSchema>
  validation?: z.infer<typeof SettingValidationSchema>
}> = z.lazy(() =>
  z
    .object({
      id: z.string().describe('Setting ID (namespaced automatically)'),
      title: z.string().describe('Display title'),
      description: z.string().optional().describe('Help text'),
      type: z.enum(['string', 'number', 'boolean', 'select']).describe('Setting type'),
      default: z.unknown().optional().describe('Default value'),
      options: z
        .array(z.object({ value: z.string(), label: z.string() }))
        .optional()
        .describe('For select type: available options'),
      optionsToolId: z.string().optional().describe('For select type: load options from tool'),
      optionsParams: z.record(z.unknown()).optional().describe('Params for options tool'),
      optionsMapping: SettingOptionsMappingSchema.optional().describe('Mapping for options tool response'),
      createToolId: z.string().optional().describe('Tool ID for creating a new option'),
      createLabel: z.string().optional().describe('Label for create action'),
      createFields: z.array(SettingDefinitionSchema).optional().describe('Fields for create form'),
      createParams: z.record(z.unknown()).optional().describe('Static params for create tool'),
      createMapping: SettingCreateMappingSchema.optional().describe('Mapping for create tool response'),
      validation: SettingValidationSchema.optional().describe('Validation rules'),
    })
    .describe('Setting definition')
)

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
    fields: z.array(SettingDefinitionSchema).optional().describe('Fields for create/edit forms'),
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
 * Provider config property type
 */
export const ProviderConfigPropertyTypeSchema = z
  .enum(['string', 'number', 'boolean', 'select', 'password', 'url'])
  .describe('Property type')

/**
 * Provider config select option
 */
export const ProviderConfigSelectOptionSchema = z
  .object({
    value: z.string().describe('Value stored in settings'),
    label: z.string().describe('Display label'),
  })
  .describe('Select option')

/**
 * Provider config validation
 */
export const ProviderConfigValidationSchema = z
  .object({
    pattern: z.string().optional().describe('Regex pattern the value must match'),
    minLength: z.number().optional().describe('Minimum string length'),
    maxLength: z.number().optional().describe('Maximum string length'),
    min: z.number().optional().describe('Minimum number value'),
    max: z.number().optional().describe('Maximum number value'),
  })
  .describe('Validation rules')

/**
 * Provider config property
 */
export const ProviderConfigPropertySchema = z
  .object({
    type: ProviderConfigPropertyTypeSchema.describe('Property type'),
    title: z.string().describe('Display label'),
    description: z.string().optional().describe('Help text'),
    default: z.unknown().optional().describe('Default value'),
    required: z.boolean().optional().describe('Whether the field is required'),
    placeholder: z.string().optional().describe('Placeholder text'),
    options: z.array(ProviderConfigSelectOptionSchema).optional().describe('For select type'),
    validation: ProviderConfigValidationSchema.optional().describe('Validation rules'),
  })
  .describe('Provider config property')

/**
 * Provider config schema
 */
export const ProviderConfigSchemaSchema = z
  .object({
    properties: z.record(ProviderConfigPropertySchema).describe('Property definitions'),
    order: z.array(z.string()).optional().describe('Display order of properties'),
  })
  .describe('Provider configuration schema')

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
    configSchema: ProviderConfigSchemaSchema.optional().describe('Configuration UI schema'),
  })
  .describe('Provider definition')

// =============================================================================
// Tools
// =============================================================================

/**
 * Tool definition
 */
export const ToolDefinitionSchema = z
  .object({
    id: z.string().describe('Tool ID'),
    name: LocalizedStringSchema.describe('Display name'),
    description: LocalizedStringSchema.describe('Description for Stina'),
    parameters: z.record(z.unknown()).optional().describe('Parameter schema (JSON Schema)'),
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
// Extension Contributions
// =============================================================================

/**
 * Extension contributions
 */
export const ExtensionContributionsSchema = z
  .object({
    settings: z.array(SettingDefinitionSchema).optional().describe('User-configurable settings'),
    toolSettings: z.array(ToolSettingsViewDefinitionSchema).optional().describe('Tool settings views'),
    panels: z.array(PanelDefinitionSchema).optional().describe('Right panel contributions'),
    providers: z.array(ProviderDefinitionSchema).optional().describe('AI providers'),
    tools: z.array(ToolDefinitionSchema).optional().describe('Tools for Stina to use'),
    commands: z.array(CommandDefinitionSchema).optional().describe('Slash commands'),
    prompts: z.array(PromptContributionSchema).optional().describe('Prompt contributions'),
  })
  .describe('What an extension can contribute to Stina')

// =============================================================================
// Type Exports
// =============================================================================

export type LocalizedString = z.infer<typeof LocalizedStringSchema>
export type SettingOptionsMapping = z.infer<typeof SettingOptionsMappingSchema>
export type SettingCreateMapping = z.infer<typeof SettingCreateMappingSchema>
export type SettingValidation = z.infer<typeof SettingValidationSchema>
export type SettingDefinition = z.infer<typeof SettingDefinitionSchema>
export type ToolSettingsListMapping = z.infer<typeof ToolSettingsListMappingSchema>
export type ToolSettingsActionDataSource = z.infer<typeof ToolSettingsActionDataSourceSchema>
export type ToolSettingsListView = z.infer<typeof ToolSettingsListViewSchema>
export type ToolSettingsComponentView = z.infer<typeof ToolSettingsComponentViewSchema>
export type ToolSettingsView = z.infer<typeof ToolSettingsViewSchema>
export type ToolSettingsViewDefinition = z.infer<typeof ToolSettingsViewDefinitionSchema>
export type PanelActionDataSource = z.infer<typeof PanelActionDataSourceSchema>
export type PanelComponentView = z.infer<typeof PanelComponentViewSchema>
export type PanelUnknownView = z.infer<typeof PanelUnknownViewSchema>
export type PanelView = z.infer<typeof PanelViewSchema>
export type PanelDefinition = z.infer<typeof PanelDefinitionSchema>
export type ProviderConfigPropertyType = z.infer<typeof ProviderConfigPropertyTypeSchema>
export type ProviderConfigSelectOption = z.infer<typeof ProviderConfigSelectOptionSchema>
export type ProviderConfigValidation = z.infer<typeof ProviderConfigValidationSchema>
export type ProviderConfigProperty = z.infer<typeof ProviderConfigPropertySchema>
export type ProviderConfigSchema = z.infer<typeof ProviderConfigSchemaSchema>
export type ProviderDefinition = z.infer<typeof ProviderDefinitionSchema>
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>
export type CommandDefinition = z.infer<typeof CommandDefinitionSchema>
export type PromptSection = z.infer<typeof PromptSectionSchema>
export type PromptContribution = z.infer<typeof PromptContributionSchema>
export type ExtensionContributions = z.infer<typeof ExtensionContributionsSchema>

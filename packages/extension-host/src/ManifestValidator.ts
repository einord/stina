/**
 * Manifest Validator
 *
 * Validates extension manifest.json files against the schema.
 */

import type {
  ExtensionManifest,
  SettingDefinition,
  ToolSettingsViewDefinition,
  ToolSettingsListView,
  ToolSettingsComponentView,
  ToolSettingsListMapping,
  ProviderDefinition,
  ToolDefinition,
  PromptContribution,
  ProviderConfigSchema,
  ProviderConfigProperty,
  ProviderConfigSelectOption,
  ProviderConfigValidation,
} from '@stina/extension-api'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Valid permission patterns
 */
const VALID_PERMISSIONS = new Set([
  'network:*',
  'network:localhost',
  'database.own',
  'storage.local',
  'user.profile.read',
  'user.location.read',
  'chat.history.read',
  'chat.current.read',
  'chat.message.write',
  'provider.register',
  'tools.register',
  'actions.register',
  'settings.register',
  'commands.register',
  'panels.register',
  'events.emit',
  'scheduler.register',
  'files.read',
  'files.write',
  'clipboard.read',
  'clipboard.write',
])

/**
 * Permission patterns that match dynamically
 */
const PERMISSION_PATTERNS = [
  /^network:localhost:\d+$/, // network:localhost:11434
  /^network:[a-zA-Z0-9.-]+$/, // network:api.example.com
  /^network:[a-zA-Z0-9.-]+:\d+$/, // network:api.example.com:8080
]

/**
 * Validates an extension manifest
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'], warnings: [] }
  }

  const m = manifest as Partial<ExtensionManifest>

  // Required fields
  if (!m.id || typeof m.id !== 'string') {
    errors.push('Missing or invalid "id" field (must be a string)')
  } else if (!/^[a-z0-9-]+$/.test(m.id)) {
    errors.push('Invalid "id" format (must be lowercase alphanumeric with hyphens)')
  }

  if (!m.name || typeof m.name !== 'string') {
    errors.push('Missing or invalid "name" field (must be a string)')
  }

  if (!m.version || typeof m.version !== 'string') {
    errors.push('Missing or invalid "version" field (must be a string)')
  } else if (!/^\d+\.\d+\.\d+/.test(m.version)) {
    warnings.push('Version should follow semver format (e.g., "1.0.0")')
  }

  if (!m.description || typeof m.description !== 'string') {
    errors.push('Missing or invalid "description" field (must be a string)')
  }

  if (!m.main || typeof m.main !== 'string') {
    errors.push('Missing or invalid "main" field (must be a string)')
  }

  // Author
  if (m.author) {
    if (typeof m.author !== 'object') {
      errors.push('"author" must be an object with "name" field')
    } else {
      const author = m.author as Partial<ExtensionManifest['author']>
      if (!author.name || typeof author.name !== 'string') {
        errors.push('Missing or invalid "author.name" field')
      }
    }
  }

  // Engines
  if (m.engines) {
    if (typeof m.engines !== 'object') {
      errors.push('"engines" must be an object')
    } else {
      const engines = m.engines as Partial<NonNullable<ExtensionManifest['engines']>>
      if (engines.stina && typeof engines.stina !== 'string') {
        errors.push('"engines.stina" must be a string')
      }
    }
  }

  // Platforms
  if (m.platforms) {
    if (!Array.isArray(m.platforms)) {
      errors.push('"platforms" must be an array')
    } else {
      const validPlatforms = ['web', 'electron', 'tui']
      for (const platform of m.platforms) {
        if (!validPlatforms.includes(platform as string)) {
          errors.push(`Invalid platform "${platform}". Valid values: ${validPlatforms.join(', ')}`)
        }
      }
    }
  }

  // Permissions
  if (!m.permissions) {
    warnings.push('No permissions declared. Extension will have limited functionality.')
  } else if (!Array.isArray(m.permissions)) {
    errors.push('"permissions" must be an array')
  } else {
    for (const permission of m.permissions) {
      if (typeof permission !== 'string') {
        errors.push('Each permission must be a string')
        continue
      }
      if (!isValidPermission(permission)) {
        errors.push(`Invalid permission: "${permission}"`)
      }
    }
  }

  // Contributes
  if (m.contributes) {
    if (typeof m.contributes !== 'object') {
      errors.push('"contributes" must be an object')
    } else {
      const contributes = m.contributes as Partial<NonNullable<ExtensionManifest['contributes']>>

      // Validate settings
      if (contributes.settings) {
        if (!Array.isArray(contributes.settings)) {
          errors.push('"contributes.settings" must be an array')
        } else {
          validateSettings(contributes.settings, errors)
        }
      }

      // Validate tool settings views
      if (contributes.toolSettings) {
        if (!Array.isArray(contributes.toolSettings)) {
          errors.push('"contributes.toolSettings" must be an array')
        } else {
          validateToolSettings(contributes.toolSettings, errors)
        }
      }

      // Validate panels
      if (contributes.panels) {
        if (!Array.isArray(contributes.panels)) {
          errors.push('"contributes.panels" must be an array')
        } else {
          validatePanels(contributes.panels, errors)
          if (!m.permissions?.includes('panels.register')) {
            warnings.push(
              'Panels contribution requires "panels.register" permission; panels will be ignored.'
            )
          }
        }
      }

      // Validate providers
      if (contributes.providers) {
        if (!Array.isArray(contributes.providers)) {
          errors.push('"contributes.providers" must be an array')
        } else {
          validateProviders(contributes.providers, errors)
        }
      }

      // Validate tools
      if (contributes.tools) {
        if (!Array.isArray(contributes.tools)) {
          errors.push('"contributes.tools" must be an array')
        } else {
          validateTools(contributes.tools, errors)
        }
      }

      // Validate prompt contributions
      if (contributes.prompts) {
        if (!Array.isArray(contributes.prompts)) {
          errors.push('"contributes.prompts" must be an array')
        } else {
          validatePrompts(contributes.prompts, errors)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function isValidPermission(permission: string): boolean {
  if (VALID_PERMISSIONS.has(permission)) {
    return true
  }

  for (const pattern of PERMISSION_PATTERNS) {
    if (pattern.test(permission)) {
      return true
    }
  }

  return false
}

function validateSettings(settings: unknown[], errors: string[]): void {
  for (const setting of settings) {
    if (typeof setting !== 'object' || !setting) {
      errors.push('Each setting must be an object')
      continue
    }

    const s = setting as Partial<SettingDefinition>
    const settingId = typeof s.id === 'string' ? s.id : 'unknown'

    if (!s.id || typeof s.id !== 'string') {
      errors.push('Setting missing "id" field')
    }

    if (!s.title || typeof s.title !== 'string') {
      errors.push(`Setting "${settingId}" missing "title" field`)
    }

    if (!s.type || !['string', 'number', 'boolean', 'select'].includes(s.type)) {
      errors.push(
        `Setting "${settingId}" has invalid "type". Valid: string, number, boolean, select`
      )
    }

    if (s.type === 'select') {
      const hasOptionsArray = Array.isArray(s.options)
      const hasOptionsTool = typeof s.optionsToolId === 'string'

      if (s.options !== undefined && !hasOptionsArray) {
        errors.push(`Setting "${settingId}" of type "select" has invalid "options"`)
      }

      if (s.optionsToolId !== undefined && !hasOptionsTool) {
        errors.push(`Setting "${settingId}" of type "select" has invalid "optionsToolId"`)
      }

      if (!hasOptionsArray && !hasOptionsTool) {
        errors.push(
          `Setting "${settingId}" of type "select" must have "options" or "optionsToolId"`
        )
      }

      if (s.optionsMapping !== undefined) {
        if (typeof s.optionsMapping !== 'object' || !s.optionsMapping) {
          errors.push(`Setting "${settingId}" has invalid "optionsMapping"`)
        } else {
          const mapping = s.optionsMapping as Partial<{
            itemsKey: unknown
            valueKey: unknown
            labelKey: unknown
          }>
          if (typeof mapping.itemsKey !== 'string') {
            errors.push(`Setting "${settingId}" optionsMapping missing "itemsKey"`)
          }
          if (typeof mapping.valueKey !== 'string') {
            errors.push(`Setting "${settingId}" optionsMapping missing "valueKey"`)
          }
          if (typeof mapping.labelKey !== 'string') {
            errors.push(`Setting "${settingId}" optionsMapping missing "labelKey"`)
          }
        }
      }

      if (s.createToolId !== undefined && typeof s.createToolId !== 'string') {
        errors.push(`Setting "${settingId}" has invalid "createToolId"`)
      }

      if (s.createFields !== undefined) {
        if (!Array.isArray(s.createFields)) {
          errors.push(`Setting "${settingId}" has invalid "createFields"`)
        } else {
          validateSettings(s.createFields, errors)
        }
      }

      if (s.createMapping !== undefined) {
        if (typeof s.createMapping !== 'object' || !s.createMapping) {
          errors.push(`Setting "${settingId}" has invalid "createMapping"`)
        } else {
          const mapping = s.createMapping as Partial<{ resultKey: unknown; valueKey: unknown }>
          if (mapping.resultKey !== undefined && typeof mapping.resultKey !== 'string') {
            errors.push(`Setting "${settingId}" createMapping has invalid "resultKey"`)
          }
          if (typeof mapping.valueKey !== 'string') {
            errors.push(`Setting "${settingId}" createMapping missing "valueKey"`)
          }
        }
      }
    } else if (
      s.createToolId !== undefined ||
      s.createFields !== undefined ||
      s.createMapping !== undefined
    ) {
      errors.push(`Setting "${settingId}" create* fields are only valid for "select"`)
    }
  }
}

function validateToolSettings(views: unknown[], errors: string[]): void {
  for (const view of views) {
    if (typeof view !== 'object' || !view) {
      errors.push('Each toolSettings entry must be an object')
      continue
    }

    const v = view as Partial<ToolSettingsViewDefinition>
    const viewId = typeof v.id === 'string' ? v.id : 'unknown'

    if (!v.id || typeof v.id !== 'string') {
      errors.push('Tool settings view missing "id" field')
    }

    if (!v.title || typeof v.title !== 'string') {
      errors.push(`Tool settings view "${viewId}" missing "title" field`)
    }

    if (!v.view || typeof v.view !== 'object') {
      errors.push(`Tool settings view "${viewId}" missing "view" field`)
      continue
    }

    const viewConfig = v.view as unknown as Record<string, unknown>
    const viewKind = viewConfig.kind

    if (viewKind !== 'list' && viewKind !== 'component') {
      errors.push(`Tool settings view "${viewId}" has invalid "view.kind" (must be "list" or "component")`)
      continue
    }

    if (viewKind === 'list') {
      // Validate list-specific fields
      const listView = viewConfig as Partial<ToolSettingsListView>

      if (!listView.listToolId || typeof listView.listToolId !== 'string') {
        errors.push(`Tool settings view "${viewId}" missing "view.listToolId" field`)
      }

      if (listView.searchParam && typeof listView.searchParam !== 'string') {
        errors.push(`Tool settings view "${viewId}" has invalid "view.searchParam"`)
      }

      if (listView.limitParam && typeof listView.limitParam !== 'string') {
        errors.push(`Tool settings view "${viewId}" has invalid "view.limitParam"`)
      }

      if (listView.idParam && typeof listView.idParam !== 'string') {
        errors.push(`Tool settings view "${viewId}" has invalid "view.idParam"`)
      }

      if (listView.listParams && (typeof listView.listParams !== 'object' || Array.isArray(listView.listParams))) {
        errors.push(`Tool settings view "${viewId}" has invalid "view.listParams"`)
      }

      const mapping = listView.mapping as Partial<ToolSettingsListMapping> | undefined
      if (!mapping || typeof mapping !== 'object') {
        errors.push(`Tool settings view "${viewId}" missing "view.mapping" field`)
      } else {
        if (!mapping.itemsKey || typeof mapping.itemsKey !== 'string') {
          errors.push(`Tool settings view "${viewId}" missing "mapping.itemsKey" field`)
        }
        if (!mapping.idKey || typeof mapping.idKey !== 'string') {
          errors.push(`Tool settings view "${viewId}" missing "mapping.idKey" field`)
        }
        if (!mapping.labelKey || typeof mapping.labelKey !== 'string') {
          errors.push(`Tool settings view "${viewId}" missing "mapping.labelKey" field`)
        }
      }

      if (v.fields) {
        if (!Array.isArray(v.fields)) {
          errors.push(`Tool settings view "${viewId}" has invalid "fields"`)
        } else {
          validateSettings(v.fields, errors)
        }
      }
    } else if (viewKind === 'component') {
      // Validate component-specific fields
      const componentView = viewConfig as Partial<ToolSettingsComponentView>

      if (!componentView.content || typeof componentView.content !== 'object') {
        errors.push(`Tool settings view "${viewId}" missing "view.content" field`)
      }

      if (componentView.data !== undefined && (typeof componentView.data !== 'object' || Array.isArray(componentView.data))) {
        errors.push(`Tool settings view "${viewId}" has invalid "view.data" field`)
      }
    }
  }
}

function validatePanels(panels: unknown[], errors: string[]): void {
  for (const panel of panels) {
    if (typeof panel !== 'object' || !panel) {
      errors.push('Each panel entry must be an object')
      continue
    }

    const p = panel as Partial<{ id: unknown; title: unknown; view: unknown }>
    const panelId = typeof p.id === 'string' ? p.id : 'unknown'

    if (!p.id || typeof p.id !== 'string') {
      errors.push('Panel missing "id" field')
    }

    if (!p.title || typeof p.title !== 'string') {
      errors.push(`Panel "${panelId}" missing "title" field`)
    }

    if (!p.view || typeof p.view !== 'object') {
      errors.push(`Panel "${panelId}" missing "view" field`)
      continue
    }

    const view = p.view as { kind?: unknown }
    if (!view.kind || typeof view.kind !== 'string') {
      errors.push(`Panel "${panelId}" has invalid "view.kind"`)
    }
  }
}

function validateProviders(providers: unknown[], errors: string[]): void {
  for (const provider of providers) {
    if (typeof provider !== 'object' || !provider) {
      errors.push('Each provider must be an object')
      continue
    }

    const p = provider as Partial<ProviderDefinition>
    const providerId = typeof p.id === 'string' ? p.id : 'unknown'

    if (!p.id || typeof p.id !== 'string') {
      errors.push('Provider missing "id" field')
    }

    if (!p.name || typeof p.name !== 'string') {
      errors.push(`Provider "${providerId}" missing "name" field`)
    }

    // Validate configSchema if present
    if (p.configSchema !== undefined) {
      validateConfigSchema(providerId, p.configSchema, errors)
    }
  }
}

const VALID_PROMPT_SECTIONS = ['system', 'behavior', 'tools']

function validatePrompts(prompts: unknown[], errors: string[]): void {
  for (const prompt of prompts) {
    if (typeof prompt !== 'object' || !prompt) {
      errors.push('Each prompt contribution must be an object')
      continue
    }

    const p = prompt as Partial<PromptContribution>
    const promptId = typeof p.id === 'string' ? p.id : 'unknown'

    if (!p.id || typeof p.id !== 'string') {
      errors.push('Prompt contribution missing "id" field')
    }

    if (p.section !== undefined && !VALID_PROMPT_SECTIONS.includes(p.section as string)) {
      errors.push(
        `Prompt contribution "${promptId}": invalid "section" (valid: ${VALID_PROMPT_SECTIONS.join(', ')})`
      )
    }

    if (p.text !== undefined && typeof p.text !== 'string') {
      errors.push(`Prompt contribution "${promptId}": "text" must be a string`)
    }

    if (p.i18n !== undefined && typeof p.i18n !== 'object') {
      errors.push(`Prompt contribution "${promptId}": "i18n" must be an object`)
    }

    if (p.text === undefined && p.i18n === undefined) {
      errors.push(`Prompt contribution "${promptId}": must provide "text" or "i18n"`)
    }
  }
}

const VALID_CONFIG_PROPERTY_TYPES = ['string', 'number', 'boolean', 'select', 'password', 'url']

function validateConfigSchema(providerId: string, schema: unknown, errors: string[]): void {
  if (typeof schema !== 'object' || !schema) {
    errors.push(`Provider "${providerId}": configSchema must be an object`)
    return
  }

  const s = schema as Partial<ProviderConfigSchema>

  if (!s.properties || typeof s.properties !== 'object') {
    errors.push(`Provider "${providerId}": configSchema must have "properties" object`)
    return
  }

  // Validate order array if present
  if (s.order !== undefined) {
    if (!Array.isArray(s.order)) {
      errors.push(`Provider "${providerId}": configSchema.order must be an array`)
    } else {
      const propertyKeys = Object.keys(s.properties as object)
      for (const key of s.order) {
        if (typeof key !== 'string') {
          errors.push(`Provider "${providerId}": configSchema.order must contain only strings`)
        } else if (!propertyKeys.includes(key)) {
          errors.push(
            `Provider "${providerId}": configSchema.order references unknown property "${key}"`
          )
        }
      }
    }
  }

  // Validate each property
  const properties = s.properties as Record<string, ProviderConfigProperty>
  for (const [key, prop] of Object.entries(properties)) {
    validateConfigProperty(providerId, key, prop, errors)
  }
}

function validateConfigProperty(
  providerId: string,
  propKey: string,
  prop: unknown,
  errors: string[]
): void {
  const prefix = `Provider "${providerId}": configSchema.properties.${propKey}`

  if (typeof prop !== 'object' || !prop) {
    errors.push(`${prefix} must be an object`)
    return
  }

  const p = prop as Partial<ProviderConfigProperty>

  // Required: type
  if (!p.type || typeof p.type !== 'string') {
    errors.push(`${prefix} missing "type" field`)
  } else if (!VALID_CONFIG_PROPERTY_TYPES.includes(p.type)) {
    errors.push(
      `${prefix} has invalid type "${p.type}". Valid: ${VALID_CONFIG_PROPERTY_TYPES.join(', ')}`
    )
  }

  // Required: title
  if (!p.title || typeof p.title !== 'string') {
    errors.push(`${prefix} missing "title" field`)
  }

  // Optional: description
  if (p.description !== undefined && typeof p.description !== 'string') {
    errors.push(`${prefix}.description must be a string`)
  }

  // Optional: placeholder
  if (p.placeholder !== undefined && typeof p.placeholder !== 'string') {
    errors.push(`${prefix}.placeholder must be a string`)
  }

  // Optional: required
  if (p.required !== undefined && typeof p.required !== 'boolean') {
    errors.push(`${prefix}.required must be a boolean`)
  }

  // For select type: options required
  if (p.type === 'select') {
    if (!p.options || !Array.isArray(p.options)) {
      errors.push(`${prefix} of type "select" must have "options" array`)
    } else {
      for (let i = 0; i < p.options.length; i++) {
        const opt = p.options[i]
        if (typeof opt !== 'object' || !opt) {
          errors.push(`${prefix}.options[${i}] must be an object`)
          continue
        }
        const o = opt as Partial<ProviderConfigSelectOption>
        if (typeof o.value !== 'string') {
          errors.push(`${prefix}.options[${i}].value must be a string`)
        }
        if (typeof o.label !== 'string') {
          errors.push(`${prefix}.options[${i}].label must be a string`)
        }
      }
    }
  }

  // Optional: validation
  if (p.validation !== undefined) {
    if (typeof p.validation !== 'object' || !p.validation) {
      errors.push(`${prefix}.validation must be an object`)
    } else {
      const v = p.validation as Partial<ProviderConfigValidation>
      if (v.pattern !== undefined && typeof v.pattern !== 'string') {
        errors.push(`${prefix}.validation.pattern must be a string`)
      }
      if (v.minLength !== undefined && typeof v.minLength !== 'number') {
        errors.push(`${prefix}.validation.minLength must be a number`)
      }
      if (v.maxLength !== undefined && typeof v.maxLength !== 'number') {
        errors.push(`${prefix}.validation.maxLength must be a number`)
      }
      if (v.min !== undefined && typeof v.min !== 'number') {
        errors.push(`${prefix}.validation.min must be a number`)
      }
      if (v.max !== undefined && typeof v.max !== 'number') {
        errors.push(`${prefix}.validation.max must be a number`)
      }
    }
  }
}

function validateTools(tools: unknown[], errors: string[]): void {
  for (const tool of tools) {
    if (typeof tool !== 'object' || !tool) {
      errors.push('Each tool must be an object')
      continue
    }

    const t = tool as Partial<ToolDefinition>
    const toolId = typeof t.id === 'string' ? t.id : 'unknown'

    if (!t.id || typeof t.id !== 'string') {
      errors.push('Tool missing "id" field')
    }

    if (!t.name || typeof t.name !== 'string') {
      errors.push(`Tool "${toolId}" missing "name" field`)
    }

    if (!t.description || typeof t.description !== 'string') {
      errors.push(`Tool "${toolId}" missing "description" field`)
    }
  }
}

/**
 * Parse and validate a manifest from JSON string
 */
export function parseManifest(json: string): { manifest: ExtensionManifest | null; result: ValidationResult } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    return {
      manifest: null,
      result: {
        valid: false,
        errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
        warnings: [],
      },
    }
  }

  const result = validateManifest(parsed)
  return {
    manifest: result.valid ? (parsed as ExtensionManifest) : null,
    result,
  }
}

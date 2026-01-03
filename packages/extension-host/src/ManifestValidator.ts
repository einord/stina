/**
 * Manifest Validator
 *
 * Validates extension manifest.json files against the schema.
 */

import type { ExtensionManifest, Permission } from '@stina/extension-api'

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
  'provider.register',
  'tools.register',
  'settings.register',
  'commands.register',
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

  const m = manifest as Record<string, unknown>

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
      const author = m.author as Record<string, unknown>
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
      const engines = m.engines as Record<string, unknown>
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
      const contributes = m.contributes as Record<string, unknown>

      // Validate settings
      if (contributes.settings) {
        if (!Array.isArray(contributes.settings)) {
          errors.push('"contributes.settings" must be an array')
        } else {
          validateSettings(contributes.settings, errors)
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

    const s = setting as Record<string, unknown>

    if (!s.id || typeof s.id !== 'string') {
      errors.push('Setting missing "id" field')
    }

    if (!s.title || typeof s.title !== 'string') {
      errors.push(`Setting "${s.id}" missing "title" field`)
    }

    if (!s.type || !['string', 'number', 'boolean', 'select'].includes(s.type as string)) {
      errors.push(`Setting "${s.id}" has invalid "type". Valid: string, number, boolean, select`)
    }

    if (s.type === 'select' && (!s.options || !Array.isArray(s.options))) {
      errors.push(`Setting "${s.id}" of type "select" must have "options" array`)
    }
  }
}

function validateProviders(providers: unknown[], errors: string[]): void {
  for (const provider of providers) {
    if (typeof provider !== 'object' || !provider) {
      errors.push('Each provider must be an object')
      continue
    }

    const p = provider as Record<string, unknown>

    if (!p.id || typeof p.id !== 'string') {
      errors.push('Provider missing "id" field')
    }

    if (!p.name || typeof p.name !== 'string') {
      errors.push(`Provider "${p.id}" missing "name" field`)
    }

    // Validate configSchema if present
    if (p.configSchema !== undefined) {
      validateConfigSchema(p.id as string, p.configSchema, errors)
    }
  }
}

const VALID_CONFIG_PROPERTY_TYPES = ['string', 'number', 'boolean', 'select', 'password', 'url']

function validateConfigSchema(providerId: string, schema: unknown, errors: string[]): void {
  if (typeof schema !== 'object' || !schema) {
    errors.push(`Provider "${providerId}": configSchema must be an object`)
    return
  }

  const s = schema as Record<string, unknown>

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
  const properties = s.properties as Record<string, unknown>
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

  const p = prop as Record<string, unknown>

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
        const o = opt as Record<string, unknown>
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
      const v = p.validation as Record<string, unknown>
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

    const t = tool as Record<string, unknown>

    if (!t.id || typeof t.id !== 'string') {
      errors.push('Tool missing "id" field')
    }

    if (!t.name || typeof t.name !== 'string') {
      errors.push(`Tool "${t.id}" missing "name" field`)
    }

    if (!t.description || typeof t.description !== 'string') {
      errors.push(`Tool "${t.id}" missing "description" field`)
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

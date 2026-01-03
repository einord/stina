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

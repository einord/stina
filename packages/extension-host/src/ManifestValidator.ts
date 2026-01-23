/**
 * Manifest Validator
 *
 * Validates extension manifest.json files against the schema.
 */

import type { ExtensionManifest } from '@stina/extension-api'

// Import validation modules
import { isValidPermission } from './ManifestValidator.permissions.js'
import { validateSettings, validateToolSettings } from './ManifestValidator.settings.js'
import { validateProviders } from './ManifestValidator.providers.js'
import { validatePanels, validatePrompts, validateTools } from './ManifestValidator.contributions.js'

// Re-export for backward compatibility
export { isValidPermission, VALID_PERMISSIONS, PERMISSION_PATTERNS } from './ManifestValidator.permissions.js'
export { validateSettings, validateToolSettings } from './ManifestValidator.settings.js'
export { validateProviders, validateConfigSchema } from './ManifestValidator.providers.js'
export { validatePanels, validatePrompts, validateTools } from './ManifestValidator.contributions.js'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validates an extension manifest
 * @param manifest The manifest object to validate
 * @returns Validation result with errors and warnings
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'], warnings: [] }
  }

  const m = manifest as Partial<ExtensionManifest>

  // Validate required fields
  validateRequiredFields(m, errors, warnings)

  // Validate author
  validateAuthor(m, errors)

  // Validate engines
  validateEngines(m, errors)

  // Validate platforms
  validatePlatforms(m, errors)

  // Validate permissions
  validatePermissions(m, errors, warnings)

  // Validate contributes
  validateContributes(m, errors, warnings)

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate required manifest fields
 */
function validateRequiredFields(
  m: Partial<ExtensionManifest>,
  errors: string[],
  warnings: string[]
): void {
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
}

/**
 * Validate author field
 */
function validateAuthor(m: Partial<ExtensionManifest>, errors: string[]): void {
  if (!m.author) return

  if (typeof m.author !== 'object') {
    errors.push('"author" must be an object with "name" field')
  } else {
    const author = m.author as Partial<ExtensionManifest['author']>
    if (!author.name || typeof author.name !== 'string') {
      errors.push('Missing or invalid "author.name" field')
    }
  }
}

/**
 * Validate engines field
 */
function validateEngines(m: Partial<ExtensionManifest>, errors: string[]): void {
  if (!m.engines) return

  if (typeof m.engines !== 'object') {
    errors.push('"engines" must be an object')
  } else {
    const engines = m.engines as Partial<NonNullable<ExtensionManifest['engines']>>
    if (engines.stina && typeof engines.stina !== 'string') {
      errors.push('"engines.stina" must be a string')
    }
  }
}

/**
 * Validate platforms field
 */
function validatePlatforms(m: Partial<ExtensionManifest>, errors: string[]): void {
  if (!m.platforms) return

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

/**
 * Validate permissions field
 */
function validatePermissions(
  m: Partial<ExtensionManifest>,
  errors: string[],
  warnings: string[]
): void {
  if (!m.permissions) {
    warnings.push('No permissions declared. Extension will have limited functionality.')
    return
  }

  if (!Array.isArray(m.permissions)) {
    errors.push('"permissions" must be an array')
    return
  }

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

/**
 * Validate contributes field
 */
function validateContributes(
  m: Partial<ExtensionManifest>,
  errors: string[],
  warnings: string[]
): void {
  if (!m.contributes) return

  if (typeof m.contributes !== 'object') {
    errors.push('"contributes" must be an object')
    return
  }

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

/**
 * Parse and validate a manifest from JSON string
 * @param json The JSON string to parse
 * @returns The parsed manifest and validation result
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

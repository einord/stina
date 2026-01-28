/**
 * Manifest Validator
 *
 * Validates extension manifest.json files against the Zod schema.
 */

import type { ExtensionManifest } from '@stina/extension-api'
import { ExtensionManifestSchema, isValidPermission } from '@stina/extension-api/schemas'

// Import legacy permission constants for backward compatibility
import {
  VALID_PERMISSIONS as LEGACY_VALID_PERMISSIONS,
  PERMISSION_PATTERNS as LEGACY_PERMISSION_PATTERNS,
} from './ManifestValidator.permissions.js'

// Re-export for backward compatibility
export { isValidPermission }
export const VALID_PERMISSIONS = LEGACY_VALID_PERMISSIONS
export const PERMISSION_PATTERNS = LEGACY_PERMISSION_PATTERNS
export { validateSettings, validateToolSettings } from './ManifestValidator.settings.js'
export { validateProviders, validateConfigSchema } from './ManifestValidator.providers.js'
export { validatePanels, validatePrompts, validateTools } from './ManifestValidator.contributions.js'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validates an extension manifest using Zod schema
 * @param manifest The manifest object to validate
 * @returns Validation result with errors and warnings
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const warnings: string[] = []

  // Use Zod for schema validation
  const result = ExtensionManifestSchema.safeParse(manifest)

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    return { valid: false, errors, warnings }
  }

  // Additional warnings for best practices (not schema errors)
  const m = result.data

  if (!m.permissions || m.permissions.length === 0) {
    warnings.push('No permissions declared. Extension will have limited functionality.')
  }

  if (m.contributes?.panels && !m.permissions?.includes('panels.register')) {
    warnings.push(
      'Panels contribution requires "panels.register" permission; panels will be ignored.'
    )
  }

  return { valid: true, errors: [], warnings }
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

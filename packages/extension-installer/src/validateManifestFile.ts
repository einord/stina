/**
 * Validate Manifest File
 *
 * Shared validation logic for extension manifest files.
 */

import { existsSync, readFileSync } from 'fs'
import type { ManifestValidationResult } from './types.js'
import { ExtensionManifestSchema } from '@stina/extension-api/schemas'

/**
 * Validates a manifest file at the given path
 */
export function validateManifestFile(manifestPath: string): ManifestValidationResult {
  // Check if manifest exists
  if (!existsSync(manifestPath)) {
    return {
      valid: false,
      errors: ['manifest.json not found'],
      warnings: [],
    }
  }

  // Try to read and parse manifest
  let manifestContent: unknown
  try {
    const content = readFileSync(manifestPath, 'utf-8')
    manifestContent = JSON.parse(content)
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse manifest.json: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
    }
  }

  // Validate against Zod schema
  const result = ExtensionManifestSchema.safeParse(manifestContent)

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    return { valid: false, errors, warnings: [] }
  }

  // Additional warnings for best practices
  const warnings: string[] = []
  const manifest = result.data

  if (!manifest.permissions || manifest.permissions.length === 0) {
    warnings.push('No permissions declared. Extension will have limited functionality.')
  }

  if (manifest.contributes?.panels && !manifest.permissions?.includes('panels.register')) {
    warnings.push('Panels contribution requires "panels.register" permission.')
  }

  return { valid: true, errors: [], warnings }
}

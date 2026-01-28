/**
 * Manifest Schema
 *
 * Zod schema for extension manifest files (manifest.json).
 * This is the main schema that combines all sub-schemas.
 */

import { z } from 'zod'
import { PermissionSchema } from './permissions.schema.js'
import { ExtensionContributionsSchema } from './contributions.schema.js'

/**
 * Platform schema
 */
export const PlatformSchema = z
  .enum(['web', 'electron', 'tui'])
  .describe('Supported platform')

/**
 * Author schema
 */
export const AuthorSchema = z
  .object({
    name: z.string().min(1).describe('Author name'),
    url: z.string().url().optional().describe('Author URL'),
  })
  .describe('Author information')

/**
 * Engines schema
 */
export const EnginesSchema = z
  .object({
    stina: z.string().describe('Minimum Stina version required'),
  })
  .describe('Engine requirements')

/**
 * Extension manifest schema
 */
export const ExtensionManifestSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'ID must be lowercase alphanumeric with hyphens')
      .describe('Unique identifier (e.g., "ollama-provider")'),
    name: z.string().min(1).describe('Human-readable name'),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+/, 'Must be semver format (e.g., "1.0.0")')
      .describe('Version string (semver)'),
    description: z.string().min(1).describe('Short description'),
    author: AuthorSchema.describe('Author information'),
    repository: z.string().url().optional().describe('Repository URL'),
    license: z.string().optional().describe('License identifier'),
    engines: EnginesSchema.optional().describe('Minimum Stina version required'),
    platforms: z.array(PlatformSchema).optional().describe('Supported platforms'),
    main: z.string().describe('Entry point file (relative to extension root)'),
    permissions: z.array(PermissionSchema).describe('Required permissions'),
    contributes: ExtensionContributionsSchema.optional().describe('What the extension contributes'),
  })
  .describe('Extension manifest format')

// =============================================================================
// Type Exports
// =============================================================================

export type Platform = z.infer<typeof PlatformSchema>
export type Author = z.infer<typeof AuthorSchema>
export type Engines = z.infer<typeof EnginesSchema>
export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>

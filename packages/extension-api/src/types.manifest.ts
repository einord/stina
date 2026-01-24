/**
 * Manifest Types
 *
 * Types for extension manifest files (manifest.json).
 */

import type { Permission } from './types.permissions.js'
import type { ExtensionContributions } from './types.contributions.js'

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

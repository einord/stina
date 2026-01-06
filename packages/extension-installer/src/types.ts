/**
 * Extension Installer Types
 *
 * v2: Minimal registry + GitHub API for extension details
 */

// =============================================================================
// Registry Types (v2 - minimal)
// =============================================================================

/**
 * Registry entry - minimal metadata, details from GitHub
 */
export interface RegistryEntry {
  id: string
  repository: string
  categories: ExtensionCategory[]
  verified: boolean
  blocked: boolean
  blockedReason?: string
  featured: boolean
  verifiedVersions?: VerifiedVersion[]
}

/**
 * Verified version with hash for security
 */
export interface VerifiedVersion {
  version: string
  sha256: string
  verifiedAt: string
}

/**
 * Registry response
 */
export interface Registry {
  version: string
  lastUpdated: string
  extensions: RegistryEntry[]
}

// =============================================================================
// GitHub Release Types
// =============================================================================

/**
 * GitHub release info
 */
export interface GitHubRelease {
  tagName: string
  name: string
  body: string
  publishedAt: string
  assets: GitHubAsset[]
}

/**
 * GitHub release asset
 */
export interface GitHubAsset {
  name: string
  downloadUrl: string
  size: number
}

/**
 * Extension list item - RegistryEntry enriched with basic display info
 * Used for extension browser grid/list view
 */
export interface ExtensionListItem extends RegistryEntry {
  name: string
  description: string
  author: string
  latestVersion: string | null
}

/**
 * Extension details fetched from GitHub
 */
export interface ExtensionDetails {
  // From registry
  id: string
  repository: string
  categories: ExtensionCategory[]
  verified: boolean
  blocked: boolean
  featured: boolean
  verifiedVersions: VerifiedVersion[]

  // From GitHub/manifest
  name: string
  description: string
  author: {
    name: string
    url?: string
  }
  license?: string
  versions: VersionInfo[]
}

/**
 * Version info combining GitHub release + manifest data
 */
export interface VersionInfo {
  version: string
  releaseDate: string
  downloadUrl: string
  changelog?: string
  // Security
  sha256?: string
  isVerified: boolean
  // From manifest (fetched from zip)
  minStinaVersion?: string
  platforms?: Platform[]
  permissions?: string[]
}

// =============================================================================
// Installation Types
// =============================================================================

export type ExtensionCategory = 'ai-provider' | 'tool' | 'theme' | 'utility'
export type Platform = 'web' | 'electron' | 'tui'

/**
 * Installed extension metadata
 */
export interface InstalledExtension {
  id: string
  version: string
  installedAt: string
  path: string
  enabled: boolean
}

/**
 * Installation result
 */
export interface InstallResult {
  success: boolean
  extensionId: string
  version: string
  path?: string
  error?: string
  /** Warning if hash doesn't match verified version */
  hashWarning?: string
}

/**
 * Search options
 */
export interface SearchOptions {
  query?: string
  category?: ExtensionCategory
  verified?: boolean
}

/**
 * Extension installer options
 */
export interface ExtensionInstallerOptions {
  /** Base URL for the registry (default: GitHub raw) */
  registryUrl?: string
  /** Path where extensions are installed */
  extensionsPath: string
  /** Current Stina version for compatibility checking */
  stinaVersion: string
  /** Current platform */
  platform: Platform
  /** Logger */
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void
    info(message: string, context?: Record<string, unknown>): void
    warn(message: string, context?: Record<string, unknown>): void
    error(message: string, context?: Record<string, unknown>): void
  }
}

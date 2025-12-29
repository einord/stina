/**
 * Registry Client
 *
 * Handles fetching and searching the extension registry.
 * v2: Uses GitHub API to fetch extension details from repositories.
 */

import { GitHubService } from './GitHubService.js'
import type {
  Registry,
  RegistryEntry,
  ExtensionListItem,
  ExtensionDetails,
  VersionInfo,
  SearchOptions,
  ExtensionInstallerOptions,
} from './types.js'

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/einord/stina-extensions-registry/main'

export class RegistryClient {
  private readonly registryUrl: string
  private readonly logger: ExtensionInstallerOptions['logger']
  private readonly gitHubService: GitHubService
  private registryCache: Registry | null = null
  private cacheTimestamp: number = 0
  private readonly cacheTtlMs = 5 * 60 * 1000 // 5 minutes

  constructor(options: ExtensionInstallerOptions) {
    this.registryUrl = options.registryUrl || DEFAULT_REGISTRY_URL
    this.logger = options.logger
    this.gitHubService = new GitHubService({ logger: options.logger })
  }

  /**
   * Fetches the main registry with caching
   */
  async getRegistry(forceRefresh = false): Promise<Registry> {
    const now = Date.now()

    if (!forceRefresh && this.registryCache && now - this.cacheTimestamp < this.cacheTtlMs) {
      return this.registryCache
    }

    this.logger?.debug('Fetching registry', { url: `${this.registryUrl}/registry.json` })

    const response = await fetch(`${this.registryUrl}/registry.json`)

    if (!response.ok) {
      throw new Error(`Failed to fetch registry: ${response.status} ${response.statusText}`)
    }

    this.registryCache = (await response.json()) as Registry
    this.cacheTimestamp = now

    this.logger?.info('Registry fetched', { extensions: this.registryCache.extensions.length })

    return this.registryCache
  }

  /**
   * Gets all available extensions with basic display info from GitHub
   */
  async getAvailableExtensions(): Promise<ExtensionListItem[]> {
    const registry = await this.getRegistry()

    // Filter out blocked extensions
    const entries = registry.extensions.filter((ext) => !ext.blocked)

    // Enrich with GitHub manifest info (in parallel)
    const enriched = await Promise.all(
      entries.map(async (entry): Promise<ExtensionListItem> => {
        try {
          // Fetch manifest and latest release in parallel
          const [manifest, latestRelease] = await Promise.all([
            this.gitHubService.getManifestFromRepo(entry.repository),
            this.gitHubService.getLatestRelease(entry.repository),
          ])

          // Extract version from tag
          let latestVersion: string | null = null
          if (latestRelease) {
            latestVersion = latestRelease.tagName.startsWith('v')
              ? latestRelease.tagName.slice(1)
              : latestRelease.tagName
          }

          return {
            ...entry,
            name: (manifest?.name as string) || entry.id,
            description: (manifest?.description as string) || '',
            author: (manifest?.author as { name?: string })?.name || this.extractOwnerFromRepo(entry.repository),
            latestVersion,
          }
        } catch {
          // Return minimal info if GitHub fetch fails
          return {
            ...entry,
            name: entry.id,
            description: '',
            author: this.extractOwnerFromRepo(entry.repository),
            latestVersion: null,
          }
        }
      })
    )

    return enriched
  }

  /**
   * Searches extensions by query and filters
   */
  async searchExtensions(options: SearchOptions = {}): Promise<ExtensionListItem[]> {
    const extensions = await this.getAvailableExtensions()
    let results = extensions

    // Filter by category
    if (options.category) {
      results = results.filter((ext) => ext.categories.includes(options.category!))
    }

    // Filter by verified status
    if (options.verified !== undefined) {
      results = results.filter((ext) => ext.verified === options.verified)
    }

    // Text search (name, description, and ID are already available)
    if (options.query) {
      const query = options.query.toLowerCase()
      results = results.filter(
        (ext) =>
          ext.id.toLowerCase().includes(query) ||
          ext.name.toLowerCase().includes(query) ||
          ext.description.toLowerCase().includes(query)
      )
    }

    return results
  }

  /**
   * Gets detailed info for a specific extension (from GitHub)
   */
  async getExtensionDetails(extensionId: string): Promise<ExtensionDetails> {
    const registry = await this.getRegistry()
    const entry = registry.extensions.find((e) => e.id === extensionId)

    if (!entry) {
      throw new Error(`Extension "${extensionId}" not found in registry`)
    }

    if (entry.blocked) {
      throw new Error(`Extension "${extensionId}" is blocked: ${entry.blockedReason || 'Security/policy reasons'}`)
    }

    // Fetch releases from GitHub
    const releases = await this.gitHubService.getReleases(entry.repository)

    if (releases.length === 0) {
      throw new Error(`No releases found for extension "${extensionId}"`)
    }

    // Fetch manifest from repository for name/description
    const manifest = await this.gitHubService.getManifestFromRepo(entry.repository)

    // Build version info from releases
    const versions: VersionInfo[] = []
    for (const release of releases) {
      const zipAsset = this.gitHubService.findZipAsset(release)
      if (!zipAsset) continue

      // Extract version from tag (remove 'v' prefix if present)
      const version = release.tagName.startsWith('v') ? release.tagName.slice(1) : release.tagName

      // Check if this version is verified
      const verifiedVersion = entry.verifiedVersions?.find((v) => v.version === version)

      versions.push({
        version,
        releaseDate: release.publishedAt.split('T')[0] ?? release.publishedAt,
        downloadUrl: zipAsset.downloadUrl,
        changelog: release.body || undefined,
        sha256: verifiedVersion?.sha256,
        isVerified: !!verifiedVersion,
      })
    }

    if (versions.length === 0) {
      throw new Error(`No valid releases found for extension "${extensionId}"`)
    }

    return {
      // From registry
      id: entry.id,
      repository: entry.repository,
      categories: entry.categories,
      verified: entry.verified,
      blocked: entry.blocked,
      featured: entry.featured,
      verifiedVersions: entry.verifiedVersions || [],

      // From GitHub/manifest
      name: (manifest?.name as string) || extensionId,
      description: (manifest?.description as string) || '',
      author: {
        name: (manifest?.author as { name?: string })?.name || this.extractOwnerFromRepo(entry.repository),
        url: (manifest?.author as { url?: string })?.url,
      },
      license: manifest?.license as string | undefined,
      versions,
    }
  }

  /**
   * Extracts the owner from a GitHub repository URL
   */
  private extractOwnerFromRepo(repoUrl: string): string {
    try {
      const { owner } = this.gitHubService.parseRepoUrl(repoUrl)
      return owner
    } catch {
      return 'Unknown'
    }
  }

  /**
   * Checks if an extension exists in the registry
   */
  async extensionExists(extensionId: string): Promise<boolean> {
    const registry = await this.getRegistry()
    return registry.extensions.some((ext) => ext.id === extensionId && !ext.blocked)
  }

  /**
   * Clears the registry cache
   */
  clearCache(): void {
    this.registryCache = null
    this.cacheTimestamp = 0
    this.gitHubService.clearCache()
  }
}
